/**
 * The model-facing `browser_navigate` tool: open a URL in one browser session.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/navigate
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_SESSION, type BrowserEngine } from '../engine.ts'

/** Register `browser_navigate`. */
export function applyNavigateTool(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_navigate',
    description: 'Navigate the browser to a URL. Returns the HTTP status, success flag, final URL, and page title. Always start a browser task here.',
    parameters: {
      url: { type: 'string', required: true, description: 'The full URL to open (e.g. https://example.com).' },
      sessionId: { type: 'string', description: 'Browser session to use. Omit to share the default session; pass a distinct id to isolate cookies/storage.' },
      waitUntil: {
        type: 'string',
        enum: ['load', 'domcontentloaded', 'networkidle'],
        description: 'When navigation is considered complete: load (all resources), domcontentloaded (DOM ready, default), or networkidle (no connections for 500ms).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'integer', required: true },
          ok: { type: 'boolean', required: true },
          url: { type: 'string', required: true },
          title: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Navigated → ${value.ok ? 'OK' : `HTTP ${value.status}`}: ${value.title}\n${value.url}`,
      }],
    },
    async execute(args, exec) {
      const waitUntil = args.waitUntil ?? 'domcontentloaded'
      return engine.navigate(args.sessionId ?? DEFAULT_SESSION, args.url, waitUntil, exec.signal)
    },
    presentCall(args): { card: 'generic'; title: string; kind: 'fetch' } {
      return { card: 'generic', title: `Navigate to ${args.url}`, kind: 'fetch' }
    },
  }))
}
