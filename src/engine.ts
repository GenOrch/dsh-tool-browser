/**
 * Browser engine for the `@deepseek-ai/dsh-tool-browser` plugin.
 *
 * Manages a Chromium instance (headless launch or CDP connect) and per-session
 * BrowserContext isolation. The engine is lazy: the browser starts on the first
 * tool call, not at plugin load, so a deployment that never calls a browser tool
 * never spawns Chromium.
 *
 * @module @deepseek-ai/dsh-tool-browser/src/engine
 */

import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'

/** Internal engine config with every default resolved by the plugin entry. */
export interface EngineConfig {
  /** 'headless' launches a fresh Chromium (default); 'connect' attaches to an existing Chrome via CDP. */
  mode: 'headless' | 'connect'
  /** When mode is 'headless': show a window (false, default) or run without one (true). */
  headless: boolean
  /** CDP debug port for connect mode. Default 9222. */
  debugPort?: number
  /** Extra Chromium CLI arguments for headless mode. */
  launchArgs: string[]
  /** Per-operation cooperative timeout budget (ms). */
  timeoutMs: number
  /** User-Agent sent by new contexts. */
  userAgent: string
  viewportWidth: number
  viewportHeight: number
  /** Upper bound on live BrowserContexts (one per session). */
  maxConcurrentSessions: number
  /** Bypass page CSP for evaluation (default false). */
  bypassCSP?: boolean
  /** Disable Chromium's sandbox (needed when running as root, e.g. some containers). Default false. */
  noSandbox?: boolean
}

export const DEFAULT_SESSION = '__default__'

/** Browser engine: Chromium lifecycle plus per-session BrowserContext isolation. */
export class BrowserEngine {
  private browser: Browser | null = null
  private initPromise: Promise<void> | null = null
  private readonly sessions = new Map<string, BrowserContext>()
  private isConnectMode = false
  private readonly config: EngineConfig

  constructor(config: EngineConfig) {
    this.config = config
  }

  /** Lazy, idempotent startup. Multiple racing callers share one init. */
  private ensureInit(): Promise<void> {
    if (this.browser !== null) return Promise.resolve()
    this.initPromise ??= (this.config.mode === 'connect' ? this.initConnect() : this.initHeadless())
    return this.initPromise
  }

  private async initHeadless(): Promise<void> {
    const args: string[] = [
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
    if (this.config.noSandbox) {
      args.push('--no-sandbox', '--disable-setuid-sandbox')
    }
    args.push(...this.config.launchArgs)
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args,
    })
    this.isConnectMode = false
  }

  private async initConnect(): Promise<void> {
    const port = this.config.debugPort ?? 9222
    // connectOverCDP is the recommended Playwright API for attaching to a live
    // Chrome launched with --remote-debugging-port. It discovers tabs and wires
    // the browser-level WebSocket automatically.
    this.browser = await chromium.connectOverCDP(`http://localhost:${port}`)
    this.isConnectMode = true
    // Existing tabs may not be exposed as Playwright contexts on every Chrome
    // build; that is fine — getContext() creates new incognito contexts
    // per-session on demand.
  }

  /** Get or create the isolated BrowserContext for one session id. */
  private async getContext(sessionId: string, signal: AbortSignal): Promise<BrowserContext> {
    const existing = this.sessions.get(sessionId)
    if (existing !== undefined && !existing.isClosed()) return existing

    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new Error(
        `maximum concurrent browser sessions (${this.config.maxConcurrentSessions}) reached; close a session with browser_close first`,
      )
    }

    await this.ensureInit()
    signal.throwIfAborted()
    const ctx = await this.browser!.newContext({
      userAgent: this.config.userAgent,
      viewport: { width: this.config.viewportWidth, height: this.config.viewportHeight },
      javaScriptEnabled: true,
      bypassCSP: this.config.bypassCSP ?? false,
    })
    this.sessions.set(sessionId, ctx)
    return ctx
  }

  /** Get (or create) the session's active page, reusing the last non-closed page. */
  async getPage(sessionId: string | undefined, signal: AbortSignal): Promise<Page> {
    const ctx = await this.getContext(sessionId ?? DEFAULT_SESSION, signal)
    for (const page of ctx.pages()) {
      if (!page.isClosed()) return page
    }
    return ctx.newPage()
  }

  /** Navigate one session to a URL and report the settled page state. */
  async navigate(
    sessionId: string,
    url: string,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle',
    signal: AbortSignal,
  ): Promise<{ status: number; ok: boolean; url: string; title: string }> {
    const page = await this.getPage(sessionId, signal)
    const response = await page.goto(url, { waitUntil, timeout: this.config.timeoutMs, signal })
    return {
      status: response?.status() ?? 0,
      ok: response?.ok() ?? false,
      url: page.url(),
      title: await page.title().catch(() => ''),
    }
  }

  /** Capture a PNG screenshot of one session's page. */
  async screenshot(sessionId: string, signal: AbortSignal, fullPage: boolean): Promise<Buffer> {
    const page = await this.getPage(sessionId, signal)
    return page.screenshot({ type: 'png', fullPage, signal })
  }

  /** Evaluate a JS expression inside the page's browser sandbox. */
  async evalJs(sessionId: string, expression: string, signal: AbortSignal): Promise<unknown> {
    const page = await this.getPage(sessionId, signal)
    return page.evaluate((expr) => {
      const fn = new Function(`"use strict"; return (${expr})`) as () => unknown
      // JSON round-trip keeps the result lossless JSON: functions and symbols are
      // dropped by JSON.stringify, and cyclic references are neutralized to a
      // "[Circular]" marker instead of throwing on non-JSON-safe results (e.g. a
      // DOM node, `window`, or `document`).
      const seen = new WeakSet<object>()
      const json = JSON.stringify(fn(), (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]'
          seen.add(value)
        }
        return value
      })
      return JSON.parse(json) as unknown
    }, expression)
  }

  /** Close one session's context. */
  async closeSession(sessionId: string): Promise<void> {
    const ctx = this.sessions.get(sessionId)
    if (ctx !== undefined) {
      this.sessions.delete(sessionId)
      await ctx.close().catch(() => {})
    }
  }

  /** Close every context; also close the browser unless it is a CDP-attached one. */
  async shutdown(): Promise<void> {
    for (const ctx of this.sessions.values()) await ctx.close().catch(() => {})
    this.sessions.clear()
    if (this.browser !== null) {
      if (!this.isConnectMode) await this.browser.close().catch(() => {})
      this.browser = null
    }
    this.initPromise = null
  }
}
