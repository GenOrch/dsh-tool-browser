/**
 * The model-facing `browser_eval_js` tool: evaluate a JS expression in the page.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/eval-js
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_SESSION, type BrowserEngine } from '../engine.ts'

/** Register `browser_eval_js`. */
export function applyEvalJsTool(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_eval_js',
    description: 'Evaluate a JavaScript expression in the page context (like typing in the DevTools console). Returns the serialized result. Use for inspection or custom extraction.',
    parameters: {
      expression: { type: 'string', required: true, description: 'JS expression to evaluate, e.g. "document.title" or "document.querySelectorAll(\'a\').length".' },
      sessionId: { type: 'string', description: 'Browser session to use. Omit for the default session.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          resultType: { type: 'string', required: true },
          result: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.resultType}: ${JSON.stringify(value.result).slice(0, 500)}`,
      }],
    },
    async execute(args, exec) {
      const result = await engine.evalJs(args.sessionId ?? DEFAULT_SESSION, args.expression, exec.signal)
      return { resultType: typeof result, result: result as never }
    },
    presentCall(): { card: 'generic'; title: string; kind: 'execute' } {
      return { card: 'generic', title: 'Evaluate JS', kind: 'execute' }
    },
  }))
}
