/**
 * The model-facing `browser_hover` tool: move the pointer over an element.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/hover
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_SESSION, type BrowserEngine } from '../engine.ts'

/** Register `browser_hover`. */
export function applyHoverTool(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_hover',
    description: 'Move the mouse cursor over an element to trigger hover effects, dropdowns, or tooltips.',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS selector of the element to hover over.' },
      sessionId: { type: 'string', description: 'Browser session to use. Omit for the default session.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          selector: { type: 'string', required: true },
          url: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Hovered "${value.selector}"` }],
    },
    async execute(args, exec) {
      const page = await engine.getPage(args.sessionId ?? DEFAULT_SESSION, exec.signal)
      const locator = page.locator(args.selector)
      await locator.waitFor({ state: 'visible', signal: exec.signal })
      await locator.hover({ signal: exec.signal })
      return { selector: args.selector, url: page.url() }
    },
    presentCall(args): { card: 'generic'; title: string; kind: 'other' } {
      return { card: 'generic', title: `Hover ${args.selector}`, kind: 'other' }
    },
  }))
}
