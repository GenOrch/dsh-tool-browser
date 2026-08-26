/**
 * The model-facing `browser_press_key` tool: press a keyboard key or combo.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/press
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_SESSION, type BrowserEngine } from '../engine.ts'

/** Register `browser_press_key`. */
export function applyPressTool(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_press_key',
    description: 'Press a keyboard key or key combination, e.g. "Enter", "Tab", "Escape", "Control+A", "Meta+S".',
    parameters: {
      key: { type: 'string', required: true, description: 'Key or combination to press, e.g. "Enter", "Control+C".' },
      sessionId: { type: 'string', description: 'Browser session to use. Omit for the default session.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string', required: true },
          url: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Pressed "${value.key}"` }],
    },
    async execute(args, exec) {
      const page = await engine.getPage(args.sessionId ?? DEFAULT_SESSION, exec.signal)
      await page.keyboard.press(args.key)
      return { key: args.key, url: page.url() }
    },
    presentCall(args): { card: 'generic'; title: string; kind: 'other' } {
      return { card: 'generic', title: `Press ${args.key}`, kind: 'other' }
    },
  }))
}
