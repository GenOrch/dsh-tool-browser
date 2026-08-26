/**
 * Model-facing browser automation tools over Playwright (Chromium).
 *
 * Registers 13 tools that let an agent see and drive a rendered page:
 *   browser_navigate, browser_screenshot, browser_click, browser_type,
 *   browser_get_text, browser_get_html, browser_get_page_text,
 *   browser_eval_js, browser_wait_for, browser_select, browser_hover,
 *   browser_press_key, browser_close.
 *
 * This package owns schemas, validation, prompt guidance, and the Chromium
 * engine lifecycle — never a concrete attachment or browser provider. The
 * screenshot tool requires a mounted `attachments` store (`ctx.attachments`)
 * to durably commit its image, the same route `read_image` uses.
 *
 * @module @deepseek-ai/dsh-tool-browser
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BrowserEngine } from './engine.ts'
import type { EngineConfig } from './engine.ts'
import { applyNavigateTool } from './tools/navigate.ts'
import { applyScreenshotTool } from './tools/screenshot.ts'
import { applyClickTool } from './tools/click.ts'
import { applyTypeTool } from './tools/type.ts'
import { applyContentTools } from './tools/content.ts'
import { applyEvalJsTool } from './tools/eval-js.ts'
import { applyWaitTool } from './tools/wait.ts'
import { applySelectTool } from './tools/select.ts'
import { applyHoverTool } from './tools/hover.ts'
import { applyPressTool } from './tools/press.ts'
import { applyCloseTool } from './tools/close.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-browser'

/** Services required by the browser tool suite. `attachments` is optional and injected conditionally. */
export const inject = ['tools', 'systemPrompt']

/** Default per-operation cooperative timeout budget (ms). */
export const DEFAULT_BROWSER_TIMEOUT_MS = 30_000

/** Default upper bound on live browser sessions (one BrowserContext each). */
export const DEFAULT_MAX_SESSIONS = 10

/** Plugin config: engine mode and per-session/viewport bounds. */
export interface Config {
  /** 'headless' launches a fresh Chromium (default); 'connect' attaches to an existing Chrome via CDP. */
  mode?: 'headless' | 'connect'
  /** When mode is 'headless': show a window (false, default) or run without one (true). */
  headless?: boolean
  /** CDP debug port for connect mode. Default 9222. */
  debugPort?: number
  /** Extra Chromium CLI arguments for headless mode. */
  launchArgs?: string[]
  /** Per-operation cooperative timeout budget (ms). Default 30000. */
  timeoutMs?: number
  /** User-Agent sent by new contexts. */
  userAgent?: string
  viewportWidth?: number
  viewportHeight?: number
  /** Upper bound on live browser sessions. Default 10. */
  maxConcurrentSessions?: number
  /** Bypass page CSP for evaluation. Default false. */
  bypassCSP?: boolean
  /** Disable Chromium's sandbox (needed when running as root). Default false. */
  noSandbox?: boolean
}

export const Config: z<Config> = z.object({
  mode: z.union(['headless', 'connect']).default('headless'),
  headless: z.boolean().default(false),
  debugPort: z.natural().min(1).default(9222),
  launchArgs: z.array(z.string()).default([]),
  timeoutMs: z.natural().min(1).default(DEFAULT_BROWSER_TIMEOUT_MS),
  userAgent: z.string().default('DeepSeek Harness AI Agent'),
  viewportWidth: z.natural().min(1).default(1280),
  viewportHeight: z.natural().min(1).default(720),
  maxConcurrentSessions: z.natural().min(1).default(DEFAULT_MAX_SESSIONS),
  bypassCSP: z.boolean().default(false),
  noSandbox: z.boolean().default(false),
})

/** The shape after schemastery applied the defaults. */
type ResolvedConfig = Required<Config>

/** Configured counts and timeouts must be positive integers. */
function assertPositiveInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`browser: ${field} must be a positive integer`)
  }
}

/**
 * Register the browser tool suite. The engine is lazy: Chromium launches on the
 * first tool call. The screenshot tool registers only while an attachment store
 * is mounted; the remaining tools register unconditionally. The engine shuts
 * down through a fiber-scoped effect, so no manual teardown is needed.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  assertPositiveInteger('timeoutMs', resolved.timeoutMs)
  assertPositiveInteger('maxConcurrentSessions', resolved.maxConcurrentSessions)
  assertPositiveInteger('viewportWidth', resolved.viewportWidth)
  assertPositiveInteger('viewportHeight', resolved.viewportHeight)

  const engineConfig: EngineConfig = {
    mode: resolved.mode,
    headless: resolved.headless,
    debugPort: resolved.debugPort,
    launchArgs: resolved.launchArgs,
    timeoutMs: resolved.timeoutMs,
    userAgent: resolved.userAgent,
    viewportWidth: resolved.viewportWidth,
    viewportHeight: resolved.viewportHeight,
    maxConcurrentSessions: resolved.maxConcurrentSessions,
    bypassCSP: resolved.bypassCSP,
    noSandbox: resolved.noSandbox,
  }
  const engine = new BrowserEngine(engineConfig)

  // Shut the browser down when the plugin fiber unloads.
  ctx.effect(() => () => { void engine.shutdown() })

  applyNavigateTool(ctx, engine)
  applyClickTool(ctx, engine)
  applyTypeTool(ctx, engine)
  applyContentTools(ctx, engine)
  applyEvalJsTool(ctx, engine)
  applyWaitTool(ctx, engine)
  applySelectTool(ctx, engine)
  applyHoverTool(ctx, engine)
  applyPressTool(ctx, engine)
  applyCloseTool(ctx, engine)

  // Screenshot is composition-conditional: without a mounted attachment store
  // the image cannot be durably committed, so the tool never registers.
  ctx.inject(['attachments'], (imageCtx) => {
    applyScreenshotTool(imageCtx, engine)
  })

  ctx.systemPrompt.section({
    name: 'tool:browser',
    order: 100,
    text: `Browser Automation Tools:
- \`browser_navigate(url)\` — Open a web page. Always start here.
- \`browser_screenshot()\` — Capture the current page as a PNG image to verify state.
- \`browser_click(selector)\` — Click an element by CSS selector.
- \`browser_type(selector, text)\` — Type text into an input; pass pressAfter (e.g. "Enter") to submit.
- \`browser_get_text(selector)\` — Get visible text of one element.
- \`browser_get_html(selector)\` — Get the outer HTML of one element.
- \`browser_get_page_text()\` — Get all visible page text (scripts/styles removed).
- \`browser_eval_js(expression)\` — Evaluate JS in the page context; returns the serialized result.
- \`browser_wait_for(selector)\` — Wait for an element to appear/change state before interacting.
- \`browser_select(selector, value|label|index)\` — Choose an option in a <select> dropdown.
- \`browser_hover(selector)\` — Hover over an element (tooltips/dropdowns).
- \`browser_press_key(key)\` — Press a key or combo (e.g. "Enter", "Control+C").
- \`browser_close(sessionId?)\` — Close one session, or the whole browser when omitted.

Best practices:
1. Start with browser_navigate, then use browser_wait_for before interacting with dynamic elements.
2. Use browser_screenshot to verify state after key actions.
3. If a selector is not found, inspect with browser_get_page_text or browser_get_html.
4. Pass a distinct sessionId to isolate cookies/storage across independent tasks.
5. Call browser_close when done to free resources.`,
  })
}
