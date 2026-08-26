/**
 * The model-facing `browser_wait_for` tool: wait for an element to reach a state.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/wait
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_SESSION, type BrowserEngine } from '../engine.ts'

/** Register `browser_wait_for`. */
export function applyWaitTool(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_wait_for',
    description: 'Wait for a CSS selector to reach a state before returning. Use before interacting with elements that load asynchronously.',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS selector to wait for.' },
      sessionId: { type: 'string', description: 'Browser session to use. Omit for the default session.' },
      state: { type: 'string', enum: ['visible', 'hidden', 'attached', 'detached'], description: 'State to wait for. Default visible.' },
      timeoutMs: { type: 'integer', description: 'Maximum wait in ms. Default 30000.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          selector: { type: 'string', required: true },
          state: { type: 'string', required: true },
          waitedMs: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `"${value.selector}" reached ${value.state} in ${value.waitedMs}ms`,
      }],
    },
    async execute(args, exec) {
      const page = await engine.getPage(args.sessionId ?? DEFAULT_SESSION, exec.signal)
      const state = args.state ?? 'visible'
      const start = Date.now()
      await page.locator(args.selector).waitFor({
        state,
        timeout: args.timeoutMs ?? 30_000,
        signal: exec.signal,
      })
      return { selector: args.selector, state, waitedMs: Date.now() - start }
    },
    presentCall(args): { card: 'generic'; title: string; kind: 'other' } {
      return { card: 'generic', title: `Wait for ${args.selector}`, kind: 'other' }
    },
  }))
}
