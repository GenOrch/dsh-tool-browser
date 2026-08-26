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
import { BrowserEngine } from './src/engine.ts'

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

const engine = new BrowserEngine({
  mode: 'headless',
  headless: true,
  launchArgs: [],
  timeoutMs: 15000,
  userAgent: 'dsh-tool-browser-test',
  viewportWidth: 1024,
  viewportHeight: 768,
  maxConcurrentSessions: 4,
  bypassCSP: false,
})

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
  const cap = new BrowserEngine({
    mode: 'headless',
    headless: true,
    launchArgs: [],
    timeoutMs: 15000,
    userAgent: 't',
    viewportWidth: 800,
    viewportHeight: 600,
    maxConcurrentSessions: 1,
    bypassCSP: false,
  })
  await cap.getPage('one', signal())
  await assert.rejects(
    () => cap.getPage('two', signal()),
    /maximum concurrent browser sessions/,
  )
  await cap.shutdown()
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
