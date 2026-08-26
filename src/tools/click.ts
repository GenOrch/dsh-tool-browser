/**
 * The model-facing `browser_click` tool: click an element by CSS selector.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/click
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_SESSION, type BrowserEngine } from '../engine.ts'

/** Register `browser_click`. */
export function applyClickTool(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_click',
    description: 'Click an element on the page by CSS selector. Waits for the element to be visible and clickable first.',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS selector of the element to click (e.g. "#submit", ".nav > a").' },
      sessionId: { type: 'string', description: 'Browser session to use. Omit for the default session.' },
      button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button to use. Default left.' },
      clickCount: { type: 'integer', description: 'Number of clicks (2 for double-click). Default 1.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          selector: { type: 'string', required: true },
          url: { type: 'string', required: true },
          text: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Clicked "${value.selector}" → ${value.url}${value.text ? ` (text: "${value.text.slice(0, 60)}")` : ''}`,
      }],
    },
    async execute(args, exec) {
      const page = await engine.getPage(args.sessionId ?? DEFAULT_SESSION, exec.signal)
      const locator = page.locator(args.selector)
      await locator.waitFor({ state: 'visible', signal: exec.signal })
      const text = await locator.textContent().catch(() => '')
      await locator.click({
        button: args.button ?? 'left',
        clickCount: args.clickCount ?? 1,
        signal: exec.signal,
      })
      return {
        selector: args.selector,
        url: page.url(),
        ...(text !== null && text.trim() !== '' ? { text: text.trim() } : {}),
      }
    },
    presentCall(args): { card: 'generic'; title: string; kind: 'other' } {
      return { card: 'generic', title: `Click ${args.selector}`, kind: 'other' }
    },
  }))
}
