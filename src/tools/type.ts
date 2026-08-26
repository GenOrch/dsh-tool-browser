/**
 * The model-facing `browser_type` tool: fill text into an input element.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/type
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_SESSION, type BrowserEngine } from '../engine.ts'

/** Register `browser_type`. */
export function applyTypeTool(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_type',
    description: 'Clear an input element then type text into it, character by character. Optionally press a key afterward (e.g. Enter).',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS selector of the input element.' },
      text: { type: 'string', required: true, description: 'Text to type into the element.' },
      sessionId: { type: 'string', description: 'Browser session to use. Omit for the default session.' },
      delayMs: { type: 'integer', description: 'Delay between keystrokes in ms. Default 30.' },
      pressAfter: { type: 'string', description: 'Key to press after typing, e.g. "Enter".' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          selector: { type: 'string', required: true },
          typedChars: { type: 'integer', required: true },
          url: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Typed ${value.typedChars} chars into "${value.selector}"`,
      }],
    },
    async execute(args, exec) {
      const page = await engine.getPage(args.sessionId ?? DEFAULT_SESSION, exec.signal)
      const locator = page.locator(args.selector)
      await locator.waitFor({ state: 'visible', signal: exec.signal })
      await locator.fill('')
      await locator.type(args.text, { delay: args.delayMs ?? 30 })
      if (args.pressAfter !== undefined) {
        await page.keyboard.press(args.pressAfter)
      }
      return { selector: args.selector, typedChars: args.text.length, url: page.url() }
    },
    presentCall(args): { card: 'generic'; title: string; kind: 'other' } {
      return { card: 'generic', title: `Type into ${args.selector}`, kind: 'other' }
    },
  }))
}
