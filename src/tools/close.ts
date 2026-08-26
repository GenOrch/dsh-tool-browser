/**
 * The model-facing `browser_close` tool: close one session or the whole browser.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/close
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { BrowserEngine } from '../engine.ts'

/** Register `browser_close`. */
export function applyCloseTool(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_close',
    description: 'Close one browser session, or shut down the browser entirely when no session id is given.',
    parameters: {
      sessionId: { type: 'string', description: 'Session to close. Omit to close every session and shut down the browser.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          closed: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.closed }],
    },
    async execute(args) {
      if (args.sessionId !== undefined) {
        await engine.closeSession(args.sessionId)
        return { closed: `Closed session "${args.sessionId}"` }
      }
      await engine.shutdown()
      return { closed: 'Closed all sessions and shut down the browser' }
    },
    presentCall(args): { card: 'generic'; title: string; kind: 'other' } {
      return { card: 'generic', title: args.sessionId !== undefined ? `Close session ${args.sessionId}` : 'Close browser', kind: 'other' }
    },
  }))
}
