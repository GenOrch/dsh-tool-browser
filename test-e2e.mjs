/**
 * E2E tests for the dsh-tool-browser plugin engine.
 *
 * Drives the real BrowserEngine (src/engine.ts) against headless Chromium,
 * served by a local HTTP fixture so the suite needs no external network.
 *
 *   node --import tsx test-e2e.mjs
 */
import assert from 'node:assert'
import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserEngine, systemChromePaths } from './src/engine.ts'

let passed = 0
let failed = 0
const failures = []

function pass(name) {
  console.log(`  ✅ ${name}`)
  passed++
}
function fail(name, err) {
  const msg = (err?.message || String(err)).slice(0, 160)
  console.log(`  ❌ ${name}: ${msg}`)
  failed++
  failures.push({ name, error: msg })
}
async function test(name, fn) {
  try {
    await fn()
    pass(name)
  } catch (err) {
    fail(name, err)
  }
}

const signal = () => new AbortController().signal

/**
 * Complete engine config; each test overrides only what it exercises.
 * `userDataDir: ''` keeps the suite off the real managed profile, and
 * `humanize: false` keeps timings deterministic.
 */
function engineConfig(overrides = {}) {
  return {
    mode: 'headless',
    headless: true,
    launchArgs: [],
    timeoutMs: 20000,
    userAgent: '',
    viewportWidth: 1024,
    viewportHeight: 768,
    maxConcurrentSessions: 4,
    bypassCSP: false,
    userDataDir: '',
    channel: 'chromium',
    fallbackChannels: true,
    locale: '',
    timezoneId: '',
    humanize: false,
    chromePath: '',
    ...overrides,
  }
}

// Local fixture server: deterministic, offline navigation target.
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(
    '<!doctype html><html><head><title>Local Fixture</title></head>'
      + '<body><h1 id="h">Hello</h1><p id="p">World</p>'
      + '<input id="i"/><button id="b">Go</button></body></html>',
  )
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const engine = new BrowserEngine(engineConfig({
  viewportWidth: 1024,
  viewportHeight: 768,
}))

console.log('═══════════════════════════════════')
console.log('  dsh-tool-browser engine E2E')
console.log('═══════════════════════════════════\n')

await test('navigate reports status / ok / url / title', async () => {
  const r = await engine.navigate('__default__', `${base}/`, 'domcontentloaded', signal())
  assert.equal(r.status, 200)
  assert.equal(r.ok, true)
  assert.equal(r.url, `${base}/`)
  assert.ok(r.title.includes('Local Fixture'))
})

await test('eval_js evaluates in the page, strips functions, neutralizes cycles', async () => {
  const title = await engine.evalJs('__default__', 'document.title', signal())
  assert.equal(title, 'Local Fixture')
  const result = await engine.evalJs('__default__', '({ f: () => 1, x: [1, 2, 3] })', signal())
  assert.equal(result.f, undefined)
  assert.deepEqual(result.x, [1, 2, 3])
  const cyclic = await engine.evalJs('__default__', '(() => { const o = { self: null, n: 1 }; o.self = o; return o })()', signal())
  assert.equal(cyclic.n, 1)
  assert.equal(cyclic.self, '[Circular]')
})

await test('sessions are isolated contexts with separate cookies', async () => {
  const pageA = await engine.getPage('sess-a', signal())
  const pageB = await engine.getPage('sess-b', signal())
  assert.notEqual(pageA.context(), pageB.context())
  await pageA.goto(`${base}/`)
  await pageB.goto(`${base}/`)
  await pageA.context().addCookies([{ name: 'k', value: 'a', url: base }])
  assert.equal((await pageB.context().cookies()).length, 0)
  await engine.closeSession('sess-a')
  await engine.closeSession('sess-b')
})

await test('screenshot returns a PNG buffer', async () => {
  await engine.navigate('shot', `${base}/`, 'domcontentloaded', signal())
  const buf = await engine.screenshot('shot', signal(), false)
  assert.ok(Buffer.isBuffer(buf))
  assert.ok(buf.length > 0)
  assert.equal(buf[0], 0x89)
  assert.equal(buf[1], 0x50)
  assert.equal(buf[2], 0x4e)
  assert.equal(buf[3], 0x47)
  await engine.closeSession('shot')
})

await test('maxConcurrentSessions cap rejects new sessions', async () => {
  const cap = new BrowserEngine(engineConfig({ maxConcurrentSessions: 1 }))
  await cap.getPage('one', signal())
  await assert.rejects(
    () => cap.getPage('two', signal()),
    /maximum concurrent browser sessions/,
  )
  await cap.shutdown()
})

// A dsh profile install never runs Playwright's browser download, so the
// system-browser channels are what keep the tools usable there. This proves the
// non-bundled path launches and drives a page on its own.
await test('a system channel drives a page without Playwright\'s bundled build', async () => {
  const system = new BrowserEngine(engineConfig({ channel: 'chrome', fallbackChannels: false }))
  try {
    const result = await system.navigate('chrome', `${base}/`, 'domcontentloaded', signal())
    assert.equal(result.title, 'Local Fixture')
    assert.equal(system.launchedChannel, 'chrome')
  } catch (error) {
    // No system Chrome on this machine: the contract under test is only
    // reachable where one exists, so skip rather than report a false failure.
    if (/Executable doesn't exist|Failed to launch/i.test(error?.message ?? '')) {
      console.log('  ⏭️  skipped (no system Chrome installed)')
      return
    }
    throw error
  } finally {
    await system.shutdown()
  }
})

// Requesting a channel that cannot exist must not silently degrade: with
// fallbacks disabled the engine reports every candidate it tried.
await test('a missing browser reports an actionable error instead of a raw Playwright dump', async () => {
  const broken = new BrowserEngine(engineConfig({ maxConcurrentSessions: 1, channel: 'msedge', fallbackChannels: false }))
  try {
    await broken.getPage('x', signal())
    // Edge is installed after all — the actionable path is unreachable here.
    console.log('  ⏭️  skipped (a system Edge is installed)')
  } catch (error) {
    assert.match(error.message, /no usable Chromium could be launched/)
    assert.match(error.message, /playwright install chromium/)
  } finally {
    await broken.shutdown()
  }
})

// A synthetic UA that contradicts the rest of the browser's fingerprint is a
// stronger automation signal than the truth, so the empty default must let the
// real value through.
await test('an empty userAgent keeps the browser\'s real one', async () => {
  await engine.navigate('__default__', `${base}/`, 'domcontentloaded', signal())
  const ua = await engine.evalJs('__default__', 'navigator.userAgent', signal())
  assert.equal(typeof ua, 'string')
  assert.ok(!ua.includes('DeepSeek Harness'), `bot UA leaked: ${ua}`)
  assert.match(ua, /^Mozilla\/5\.0 /)
  assert.match(ua, /Chrome\//)
})

// Humanized interaction must still deliver the real text and land a real click,
// not just look plausible.
await test('humanized typing arrives character by character', async () => {
  const human = new BrowserEngine(engineConfig({ humanize: true }))
  try {
    await human.navigate('h', `${base}/`, 'domcontentloaded', signal())
    const page = await human.getPage('h', signal())
    await human.typeInto(page.locator('#i'), 'hello world', 2)
    assert.equal(await page.locator('#i').inputValue(), 'hello world')
  } finally {
    await human.shutdown()
  }
})

await test('humanized click moves the pointer onto the element and focuses it', async () => {
  const human = new BrowserEngine(engineConfig({ humanize: true }))
  try {
    await human.navigate('h', `${base}/`, 'domcontentloaded', signal())
    const page = await human.getPage('h', signal())
    await human.clickElement(page.locator('#i'), { button: 'left', clickCount: 1, signal: signal() })
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'i')
  } finally {
    await human.shutdown()
  }
})

await test('connect mode finds a real Chrome/Edge executable', () => {
  const paths = systemChromePaths()
  if (paths.length === 0) {
    console.log('  ⏭️  skipped (no Chrome or Edge installed)')
    return
  }
  assert.ok(paths.every(path => /\.exe$|google-chrome|Microsoft Edge$/i.test(path)))
  console.log(`     found: ${paths[0]}`)
})

// Persistence is the point of the profile default: a browser that keeps its
// cookies and logins is also the one that stops looking like a new device on
// every call.
await test('the persistent profile keeps cookies across browser restarts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-browser-profile-'))
  try {
    const first = new BrowserEngine(engineConfig({ userDataDir: dir }))
    try {
      await first.navigate('__default__', `${base}/`, 'domcontentloaded', signal())
      // max-age is required: a session cookie is discarded when the browser
      // closes, so only a persistent cookie proves the profile survived.
      await first.evalJs('__default__', "document.cookie = 'probe=kept; path=/; max-age=86400'", signal())
    } finally {
      await first.shutdown()
    }

    const second = new BrowserEngine(engineConfig({ userDataDir: dir }))
    try {
      await second.navigate('__default__', `${base}/`, 'domcontentloaded', signal())
      const cookie = await second.evalJs('__default__', 'document.cookie', signal())
      assert.match(String(cookie), /probe=kept/)
    } finally {
      await second.shutdown()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The default session must be the persistent one from the very first call;
// before the startup ordering was fixed it silently got an ephemeral context
// and nothing survived.
await test('the default session is backed by the persistent profile', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-browser-profile-'))
  try {
    const persistent = new BrowserEngine(engineConfig({ userDataDir: dir }))
    try {
      const page = await persistent.getPage('__default__', signal())
      await persistent.navigate('__default__', `${base}/`, 'domcontentloaded', signal())
      const again = await persistent.getPage('__default__', signal())
      assert.equal(again, page, 'the default session changed page objects between calls')
      // A secondary session must still be isolated from it.
      const other = await persistent.getPage('isolated', signal())
      assert.notEqual(other.context(), again.context())
    } finally {
      await persistent.shutdown()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// A persistent profile starts with its own tab and Chrome can open more, so a
// session that re-picks "the first page" every call drifts onto another tab.
await test('a session keeps its page when the browser opens another tab', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-browser-profile-'))
  try {
    const engineX = new BrowserEngine(engineConfig({ userDataDir: dir }))
    try {
      await engineX.navigate('__default__', `${base}/`, 'domcontentloaded', signal())
      const page = await engineX.getPage('__default__', signal())
      const intruder = await page.context().newPage()
      try {
        const again = await engineX.getPage('__default__', signal())
        assert.equal(again, page, 'the session followed the newly opened tab')
      } finally {
        await intruder.close()
      }
    } finally {
      await engineX.shutdown()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

await engine.shutdown()
await new Promise((resolve) => server.close(resolve))

console.log()
console.log('═══════════════════════════════════')
console.log(`  Results: ${passed}/${passed + failed} passed`)
if (failed === 0) {
  console.log('  🎉 ALL TESTS PASSED!')
} else {
  console.log(`  ⚠️  ${failed} test(s) failed:`)
  failures.forEach((f) => console.log(`     - ${f.name}: ${f.error}`))
}
console.log('═══════════════════════════════════')

process.exit(failed > 0 ? 1 : 0)
