/**
 * Plugin-surface compatibility tests for @deepseek-ai/dsh-tool-browser.
 *
 * These run WITHOUT Chromium and WITHOUT a booted dsh profile. They load the
 * plugin's `apply()` against a fake cordis context, then check every captured
 * tool definition against the `@deepseek-ai/dsh-tools` version this package is
 * installed against:
 *
 *   - the parameter spec and output JSON Schema still pass the registry's own
 *     validators (`validateArgs`, `assertSupportedJsonSchema`),
 *   - every `output.render` projector returns real ContentBlocks for a value
 *     built from its own schema (this is what exercises the `dsh-attachment`
 *     `AttachmentId`/`ImageAttachmentRef` seam in browser_screenshot),
 *   - the Config schema still resolves its defaults,
 *   - the system-prompt section is still announced under its stable name.
 *
 * A dsh release that changes any of those APIs fails here loudly instead of
 * failing later as an unloadable plugin.
 *
 *   node --import tsx test-tools.mjs
 */
import assert from 'node:assert'
import {
  assertSupportedJsonSchema,
  defineTool,
  validateArgs,
} from '@deepseek-ai/dsh-tools'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { apply, Config, inject, name as pluginName } from './src/index.ts'
import { isMissingBrowserError } from './src/engine.ts'

let passed = 0
let failed = 0
const failures = []

function pass(label) {
  console.log(`  ✅ ${label}`)
  passed++
}
function fail(label, err) {
  const msg = (err?.message || String(err)).slice(0, 200)
  console.log(`  ❌ ${label}: ${msg}`)
  failed++
  failures.push({ name: label, error: msg })
}
function test(label, fn) {
  try {
    fn()
    pass(label)
  } catch (err) {
    fail(label, err)
  }
}

/** The exact tool roster the plugin promises in its README and prompt section. */
const EXPECTED_TOOLS = [
  'browser_navigate',
  'browser_screenshot',
  'browser_click',
  'browser_type',
  'browser_get_text',
  'browser_get_html',
  'browser_get_page_text',
  'browser_eval_js',
  'browser_wait_for',
  'browser_select',
  'browser_hover',
  'browser_press_key',
  'browser_close',
]

/** Capture what the plugin registers without mounting a real dsh profile. */
function captureRegistrations() {
  const tools = new Map()
  const sections = []
  const injected = []
  const ctx = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    systemPrompt: { section: section => sections.push(section) },
    effect: callback => callback(),
    inject: (deps, callback) => {
      injected.push(deps.join(','))
      callback(ctx)
    },
    get: () => undefined,
  }
  apply(ctx, Config({}))
  return { tools, sections, injected }
}

/** Build a schema-shaped sample value so every projector can be exercised offline. */
function sampleFor(node) {
  if (node.type === 'object') {
    const value = {}
    for (const [key, child] of Object.entries(node.properties ?? {})) value[key] = sampleFor(child)
    return value
  }
  if (node.type === 'array') return [sampleFor(node.items)]
  if (node.type === 'string') return node.enum === undefined ? 'sample' : node.enum[0]
  if (node.type === 'integer' || node.type === 'number') return 1
  if (node.type === 'boolean') return true
  return null
}

console.log('═══════════════════════════════════')
console.log('  dsh-tool-browser plugin surface')
console.log('═══════════════════════════════════\n')

const { tools, sections, injected } = captureRegistrations()

test('plugin declares its loader identity and injected services', () => {
  assert.equal(pluginName, 'tool-browser')
  assert.deepEqual([...inject].sort(), ['systemPrompt', 'tools'])
})

test('Config resolves every documented default', () => {
  const resolved = Config({})
  assert.equal(resolved.mode, 'headless')
  assert.equal(resolved.channel, 'chromium')
  assert.equal(resolved.fallbackChannels, true)
  assert.equal(resolved.timeoutMs, 30_000)
  assert.equal(resolved.maxConcurrentSessions, 10)
  // Realism defaults: no synthetic identity, one stable profile, human pacing.
  assert.equal(resolved.userAgent, '', 'a synthetic UA advertises automation')
  assert.equal(resolved.locale, '')
  assert.equal(resolved.timezoneId, '')
  assert.equal(resolved.humanize, true)
  assert.ok(resolved.userDataDir.includes('.dsh'), 'the default profile must persist under the dsh home')
})

test('exactly the documented 13 tools register', () => {
  assert.deepEqual([...tools.keys()].sort(), [...EXPECTED_TOOLS].sort())
})

test('screenshot registers through the conditional attachments injection', () => {
  assert.deepEqual(injected, ['attachments'])
  assert.ok(tools.has('browser_screenshot'))
})

test('the browser guidance section keeps its stable name and order', () => {
  const section = sections.find(s => s.name === 'tool:browser')
  assert.ok(section !== undefined, 'no tool:browser section registered')
  assert.equal(typeof section.order, 'number')
  assert.match(section.text, /browser_navigate/)
  // Every tool the prompt advertises must actually exist.
  for (const expected of EXPECTED_TOOLS) assert.ok(section.text.includes(expected), `prompt omits ${expected}`)
})

test('the flat parameter-spec API still converts required flags and enums', () => {
  const spec = {
    target: { type: 'string', required: true, description: 'required string' },
    waitUntil: { type: 'string', enum: ['load', 'domcontentloaded'], description: 'optional enum' },
    count: { type: 'integer', description: 'optional integer' },
  }
  const probe = defineTool({
    name: 'browser_probe',
    description: 'probe',
    parameters: spec,
    output: { schema: { type: 'object', additionalProperties: false, properties: {} }, render: () => [] },
    execute: async () => ({}),
  })
  const schema = probe.parameters
  assert.equal(schema.type, 'object')
  assert.deepEqual(schema.required, ['target'])
  assert.deepEqual(schema.properties.waitUntil.enum, ['load', 'domcontentloaded'])
  assert.equal(schema.properties.count.type, 'integer')
  assert.deepEqual(validateArgs(spec, {}), ['missing required property "target"'], 'the flat spec must reject a missing required parameter')
  assert.deepEqual(validateArgs(spec, { target: 'x' }), [], 'the flat spec must accept a satisfied call')
  assert.deepEqual(validateArgs(spec, { target: 'x', count: 'no' }), ['"count" must be an integer'], 'the flat spec must typecheck')
})

for (const [toolName, definition] of tools) {
  test(`${toolName}: argument schema is registry-supported`, () => {
    assert.ok(definition.description.length > 0, 'tool has no description')
    assert.equal(definition.parameters.type, 'object')
    assertSupportedJsonSchema(definition.parameters)
    // The spec promoted every `required: true` property into the JSON Schema's
    // required list, and nothing else.
    const required = definition.parameters.required ?? []
    for (const param of required) {
      assert.ok(definition.parameters.properties[param] !== undefined, `required ${param} is not a declared property`)
    }
  })

  test(`${toolName}: output schema is supported and its projector renders`, () => {
    assert.equal(typeof definition.output.render, 'function')
    assertSupportedJsonSchema(definition.output.schema)
    const blocks = definition.output.render({}, sampleFor(definition.output.schema))
    assert.ok(Array.isArray(blocks) && blocks.length > 0, 'render returned no content blocks')
    for (const block of blocks) assert.ok(typeof block.type === 'string', 'content block has no type')
  })

  test(`${toolName}: presentCall returns a render intent`, () => {
    if (definition.presentCall === undefined) return
    const view = definition.presentCall({ selector: '#x', url: 'https://example.com', text: 'hi', key: 'Enter', value: 'v', expression: '1' })
    assert.ok(view === undefined || (view.card === 'generic' && typeof view.title === 'string'))
  })
}

test('browser_screenshot projector survives the attachment brand seam', () => {
  const value = {
    width: 800,
    height: 600,
    bytes: 1234,
    image: { attachmentId: 'att_probe', mediaType: 'image/png', bytes: 1234, width: 800, height: 600 },
  }
  const blocks = tools.get('browser_screenshot').output.render({}, value)
  const image = blocks.find(block => block.type === 'image')
  assert.ok(image !== undefined, 'no image block rendered')
  assert.equal(AttachmentId(value.image.attachmentId), 'att_probe')
  assert.equal(image.attachment.mediaType, 'image/png')
})

test('missing-browser detection separates an absent build from a launch fault', () => {
  assert.equal(isMissingBrowserError(new Error("browserType.launch: Executable doesn't exist at C:\\x\\chrome.exe")), true)
  assert.equal(isMissingBrowserError(new Error('browserType.launch: Failed to launch chromium')), true)
  assert.equal(isMissingBrowserError(new Error('Target page, context or browser has been closed')), false)
})

console.log()
console.log('═══════════════════════════════════')
console.log(`  Results: ${passed}/${passed + failed} passed`)
if (failed === 0) {
  console.log('  🎉 PLUGIN SURFACE OK')
} else {
  console.log(`  ⚠️  ${failed} check(s) failed:`)
  failures.forEach(f => console.log(`     - ${f.name}: ${f.error}`))
}
console.log('═══════════════════════════════════')

process.exit(failed > 0 ? 1 : 0)
