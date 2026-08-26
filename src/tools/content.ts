/**
 * Content-extraction tools: `browser_get_text`, `browser_get_html`,
 * `browser_get_page_text`.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/content
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_SESSION, type BrowserEngine } from '../engine.ts'

/** Register the three content-extraction tools. */
export function applyContentTools(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_get_text',
    description: 'Get the visible text content of one element by CSS selector. Strips surrounding whitespace.',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS selector of the element.' },
      sessionId: { type: 'string', description: 'Browser session to use. Omit for the default session.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          selector: { type: 'string', required: true },
          text: { type: 'string', required: true },
          charCount: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.selector}: ${value.text.slice(0, 200)}${value.charCount > 200 ? '…' : ''} (${value.charCount} chars)`,
      }],
    },
    async execute(args, exec) {
      const page = await engine.getPage(args.sessionId ?? DEFAULT_SESSION, exec.signal)
      const locator = page.locator(args.selector)
      await locator.waitFor({ state: 'visible', signal: exec.signal })
      const text = (await locator.textContent())?.trim() ?? ''
      return { selector: args.selector, text, charCount: text.length }
    },
    presentCall(args): { card: 'generic'; title: string; kind: 'read' } {
      return { card: 'generic', title: `Get text of ${args.selector}`, kind: 'read' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_get_html',
    description: 'Get the outer HTML of one element by CSS selector. Useful for inspecting DOM structure.',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS selector of the element.' },
      sessionId: { type: 'string', description: 'Browser session to use. Omit for the default session.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          selector: { type: 'string', required: true },
          html: { type: 'string', required: true },
          charCount: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `<${value.selector}>: ${value.html.slice(0, 300)}${value.charCount > 300 ? '…' : ''} (${value.charCount} chars)`,
      }],
    },
    async execute(args, exec) {
      const page = await engine.getPage(args.sessionId ?? DEFAULT_SESSION, exec.signal)
      const locator = page.locator(args.selector)
      await locator.waitFor({ state: 'visible', signal: exec.signal })
      const html = (await locator.evaluate((el) => el.outerHTML)) ?? ''
      return { selector: args.selector, html, charCount: html.length }
    },
    presentCall(args): { card: 'generic'; title: string; kind: 'read' } {
      return { card: 'generic', title: `Get HTML of ${args.selector}`, kind: 'read' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_get_page_text',
    description: 'Get the complete visible text of the current page, with script and style content removed.',
    parameters: {
      sessionId: { type: 'string', description: 'Browser session to use. Omit for the default session.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          text: { type: 'string', required: true },
          charCount: { type: 'integer', required: true },
          wordCount: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.url}: ${value.wordCount} words, ${value.charCount} chars\n\n${value.text.slice(0, 1000)}${value.charCount > 1000 ? '\n…(truncated)' : ''}`,
      }],
    },
    async execute(args, exec) {
      const page = await engine.getPage(args.sessionId ?? DEFAULT_SESSION, exec.signal)
      const text = await page.evaluate(() => {
        const root = document.body.cloneNode(true) as HTMLElement
        root.querySelectorAll('script, style').forEach(el => el.remove())
        return root.innerText.trim()
      })
      const words = text.split(/\s+/).filter(Boolean)
      return { url: page.url(), text, charCount: text.length, wordCount: words.length }
    },
    presentCall(): { card: 'generic'; title: string; kind: 'read' } {
      return { card: 'generic', title: 'Get page text', kind: 'read' }
    },
  }))
}
