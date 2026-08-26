/**
 * The model-facing `browser_select` tool: choose an option in a `<select>`.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/select
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_SESSION, type BrowserEngine } from '../engine.ts'

/** Register `browser_select`. */
export function applySelectTool(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_select',
    description: 'Select an option in a <select> dropdown by its value, label, or zero-based index. Provide exactly one of value/label/index.',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS selector of the <select> element.' },
      sessionId: { type: 'string', description: 'Browser session to use. Omit for the default session.' },
      value: { type: 'string', description: 'The option\'s value attribute to select.' },
      label: { type: 'string', description: 'The option\'s visible text to select.' },
      index: { type: 'integer', description: 'Zero-based index of the option to select.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          selector: { type: 'string', required: true },
          selected: { type: 'string', required: true },
          url: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Selected "${value.selected}" in ${value.selector}`,
      }],
    },
    async execute(args, exec) {
      const page = await engine.getPage(args.sessionId ?? DEFAULT_SESSION, exec.signal)
      const locator = page.locator(args.selector)
      await locator.waitFor({ state: 'visible', signal: exec.signal })

      const option: { value?: string; label?: string; index?: number } = {}
      if (args.value !== undefined) option.value = args.value
      else if (args.label !== undefined) option.label = args.label
      else if (args.index !== undefined) option.index = args.index
      else throw new Error('provide exactly one of value, label, or index')

      await locator.selectOption(option)

      const selected = await locator.evaluate((el) => {
        const select = el as HTMLSelectElement
        const opt = select.options[select.selectedIndex]
        return opt !== undefined ? opt.textContent?.trim() ?? '' : ''
      })
      return { selector: args.selector, selected, url: page.url() }
    },
    presentCall(args): { card: 'generic'; title: string; kind: 'other' } {
      return { card: 'generic', title: `Select option in ${args.selector}`, kind: 'other' }
    },
  }))
}
