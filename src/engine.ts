/**
 * Browser engine for the `@deepseek-ai/dsh-tool-browser` plugin.
 *
 * Two launch shapes: `headless` starts a Chromium-family browser directly,
 * `connect` attaches to a real Chrome over CDP (launching one when none is
 * listening). Either way the default session is backed by a persistent profile,
 * so cookies, logins and storage survive restarts and the browser keeps a
 * stable identity instead of looking like a brand-new device on every call.
 *
 * The engine is lazy: the browser starts on the first tool call, not at plugin
 * load, so a deployment that never calls a browser tool never spawns one.
 *
 * @module @deepseek-ai/dsh-tool-browser/src/engine
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Locator, Page } from 'playwright'

/**
 * A Playwright browser channel the engine may launch.
 *
 * `'chromium'` is Playwright's own bundled build, which must be downloaded by
 * `playwright install`; the others are Chromium-based browsers already
 * installed on the machine, which need no download at all. A `dsh` profile
 * install deliberately does not run package build scripts, so the bundled
 * download is often absent — the system channels are what keep the tools
 * usable in that deployment.
 */
export type BrowserChannel = 'chromium' | 'chrome' | 'msedge' | 'chrome-headless-shell'

/** Launch order for {@link EngineConfig.channel} when fallbacks are enabled. */
const CHANNEL_FALLBACKS: readonly BrowserChannel[] = ['chromium', 'chrome', 'msedge', 'chrome-headless-shell']

/**
 * Whether a launch failure means "this channel has no usable executable"
 * rather than a genuine launch fault. Only the former justifies trying the next
 * channel: retrying a real misconfiguration would hide the original cause.
 * @param error - the value thrown by a Playwright launch.
 * @returns whether another channel is worth trying.
 */
export function isMissingBrowserError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Executable doesn't exist|Failed to launch|Cannot find|no such file|ENOENT/i.test(message)
}

/** Internal engine config with every default resolved by the plugin entry. */
export interface EngineConfig {
  /** 'headless' launches a Chromium-family browser; 'connect' attaches to a real Chrome over CDP. */
  mode: 'headless' | 'connect'
  /** When mode is 'headless': show a window (false, default) or run without one (true). */
  headless: boolean
  /** CDP debug port for connect mode. Default 9222. */
  debugPort?: number
  /** Extra browser CLI arguments for headless mode and for a Chrome the engine launches in connect mode. */
  launchArgs: string[]
  /** Per-operation cooperative timeout budget (ms). */
  timeoutMs: number
  /** User-Agent for new contexts. Empty (default) keeps the browser's real one. */
  userAgent: string
  viewportWidth: number
  viewportHeight: number
  /** Upper bound on live BrowserContexts (one per session). */
  maxConcurrentSessions: number
  /** Bypass page CSP for evaluation (default false). */
  bypassCSP?: boolean
  /** Disable the browser sandbox (needed when running as root, e.g. some containers). Default false. */
  noSandbox?: boolean
  /** Profile directory. Empty = ephemeral; the plugin entry defaults it to a managed persistent path. */
  userDataDir?: string
  /** Preferred browser channel. Default 'chromium' (Playwright's bundled build). */
  channel?: BrowserChannel
  /** Try the remaining channels when the preferred one has no executable. Default true. */
  fallbackChannels?: boolean
  /** Context locale. Empty (default) keeps the browser's real one. */
  locale: string
  /** Context timezone id. Empty (default) keeps the browser's real one. */
  timezoneId: string
  /** Move the mouse onto a target and pace keystrokes like a person. Default true. */
  humanize: boolean
  /** Explicit Chrome executable for connect mode. Empty (default) auto-detects. */
  chromePath: string
}

export const DEFAULT_SESSION = '__default__'

/** Injected into every page to hide the `navigator.webdriver` automation marker. */
const STEALTH_INIT_SCRIPT = "Object.defineProperty(navigator, 'webdriver', { get: () => undefined })"

/** How long connect mode waits for a Chrome it just launched to expose CDP. */
const CDP_LAUNCH_TIMEOUT_MS = 20_000

/** Uniform random integer in `[min, max]`. */
function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** Resolve after `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms) })
}

/**
 * Candidate Chrome/Edge executables for connect mode, most preferred first.
 * Only paths that exist are returned, so an empty list means "no known browser".
 * @returns absolute executable paths to try.
 */
export function systemChromePaths(): string[] {
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter((root): root is string => typeof root === 'string' && root !== '')
    return [
      ...roots.map(root => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
      ...roots.map(root => join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ].filter(path => existsSync(path))
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ].filter(path => existsSync(path))
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/microsoft-edge']
    .filter(path => existsSync(path))
}

/**
 * Whether a CDP discovery endpoint answers on `port`.
 * @param port - the debug port.
 * @returns true when `/json/version` returned a browser document.
 */
async function cdpEndpointAlive(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) })
    return response.ok
  } catch {
    return false
  }
}

/** Browser engine: browser lifecycle, persistent profile, and per-session context isolation. */
export class BrowserEngine {
  private browser: Browser | null = null
  private persistentContext: BrowserContext | null = null
  private initPromise: Promise<void> | null = null
  private readonly sessions = new Map<string, BrowserContext>()
  /**
   * The live page per session. A context can hold several pages — a persistent
   * profile opens its own tab, and Chrome may add another on startup — so
   * re-picking "the first page" on every call silently switches the model onto
   * a different tab mid-task. Each session remembers the page it chose.
   */
  private readonly pages = new Map<string, Page>()
  private isConnectMode = false
  /** Channel the live browser was launched through; undefined before the first launch or over CDP. */
  private channel: BrowserChannel | undefined
  private readonly config: EngineConfig

  constructor(config: EngineConfig) {
    this.config = config
  }

  /** The channel the live browser was launched through, or undefined when none is running or it was attached. */
  get launchedChannel(): BrowserChannel | undefined {
    return this.channel
  }

  /** Whether the live browser was attached over CDP rather than launched by this engine. */
  get attachedOverCdp(): boolean {
    return this.isConnectMode
  }

  /** Lazy, idempotent startup. Multiple racing callers share one init. */
  private ensureInit(): Promise<void> {
    if (this.browser !== null) return Promise.resolve()
    this.initPromise ??= (this.config.mode === 'connect' ? this.initConnect() : this.initLaunch())
    return this.initPromise
  }

  /**
   * Context options shared by the persistent profile and every extra session.
   * An empty userAgent/locale/timezone is omitted, so the browser keeps its real
   * values instead of being handed a synthetic identity that contradicts the
   * rest of its fingerprint.
   * @returns Playwright context options.
   */
  private contextOptions(): {
    userAgent?: string
    locale?: string
    timezoneId?: string
    viewport: { width: number; height: number }
    javaScriptEnabled: true
    bypassCSP: boolean
  } {
    const { userAgent, locale, timezoneId } = this.config
    return {
      ...userAgent === '' ? {} : { userAgent },
      ...locale === '' ? {} : { locale },
      ...timezoneId === '' ? {} : { timezoneId },
      viewport: { width: this.config.viewportWidth, height: this.config.viewportHeight },
      javaScriptEnabled: true,
      bypassCSP: this.config.bypassCSP ?? false,
    }
  }

  /** Launch a Chromium-family browser, walking the channel chain on a missing executable. */
  private async initLaunch(): Promise<void> {
    const args: string[] = [
      '--disable-dev-shm-usage',
      // Hides the "controlled by automated test software" automation fingerprint.
      '--disable-blink-features=AutomationControlled',
    ]
    if (this.config.headless) args.push('--disable-gpu')
    if (this.config.noSandbox) {
      args.push('--no-sandbox', '--disable-setuid-sandbox')
    }
    args.push(...this.config.launchArgs)

    const failures: string[] = []
    for (const channel of this.channelCandidates()) {
      try {
        if (this.config.userDataDir) {
          this.persistentContext = await chromium.launchPersistentContext(this.config.userDataDir, {
            headless: this.config.headless,
            args,
            channel,
            ...this.contextOptions(),
          })
          await this.persistentContext.addInitScript(STEALTH_INIT_SCRIPT)
          this.browser = this.persistentContext.browser()
        } else {
          this.browser = await chromium.launch({
            headless: this.config.headless,
            args,
            channel,
          })
        }
        this.channel = channel
        this.isConnectMode = false
        return
      } catch (error) {
        this.persistentContext = null
        this.browser = null
        failures.push(`${channel}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
        // A channel that exists but will not start is a real fault — report it
        // rather than silently substituting a different browser.
        if (!isMissingBrowserError(error)) break
      }
    }
    throw new Error(
      `browser: no usable Chromium could be launched. Tried ${failures.map(f => f.split(':')[0]).join(', ')}.\n`
      + `${failures.join('\n')}\n`
      + 'Fix one of these:\n'
      + '  - install Playwright\'s bundled build: `npx playwright install chromium` in the plugin directory '
      + '(for a dsh profile install, approve the blocked `playwright` build script in the plugin manager instead);\n'
      + '  - or set the plugin config `channel` to a browser that is already installed ("chrome" or "msedge").',
    )
  }

  /**
   * The channels to try, in order. A user-selected channel is always first;
   * the rest follow only while {@link EngineConfig.fallbackChannels} holds, so
   * an explicit `channel` plus `fallbackChannels: false` pins one browser.
   * @returns the launch candidates.
   */
  private channelCandidates(): BrowserChannel[] {
    const preferred = this.config.channel ?? 'chromium'
    if (this.config.fallbackChannels === false) return [preferred]
    return [preferred, ...CHANNEL_FALLBACKS.filter(channel => channel !== preferred)]
  }

  /**
   * Attach to a real Chrome over CDP, launching one on the configured debug port
   * when nothing is listening. This is the only mode that drives the user's own
   * browser build: real profile, real extensions, real fingerprint.
   */
  private async initConnect(): Promise<void> {
    const port = this.config.debugPort ?? 9222
    if (!await cdpEndpointAlive(port)) await this.launchChromeForCdp(port)
    // connectOverCDP discovers tabs and wires the browser-level WebSocket.
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    this.isConnectMode = true
    this.channel = undefined
    // Existing tabs may not be exposed as Playwright contexts on every Chrome
    // build; that is fine — getContext() creates new contexts per session on demand.
  }

  /**
   * Spawn a detached Chrome exposing CDP on `port`, then wait for it to answer.
   * The browser outlives this process on purpose: the user can watch it, take it
   * over by hand, and the next dsh run reconnects to the same profile.
   * @param port - debug port to expose.
   */
  private async launchChromeForCdp(port: number): Promise<void> {
    const executable = this.config.chromePath !== '' ? this.config.chromePath : systemChromePaths()[0]
    if (executable === undefined) {
      throw new Error(
        'browser: mode "connect" needs Google Chrome or Microsoft Edge, and none was found.\n'
        + 'Set `chromePath` to the executable, install Chrome, or switch to mode "headless".',
      )
    }
    const profileDir = this.config.userDataDir !== '' ? this.config.userDataDir : undefined
    const args = [
      `--remote-debugging-port=${port}`,
      ...profileDir === undefined ? [] : [`--user-data-dir=${profileDir}`],
      ...this.config.launchArgs,
    ]
    const child = spawn(executable, args, { detached: true, stdio: 'ignore' })
    child.unref()

    const deadline = Date.now() + CDP_LAUNCH_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await cdpEndpointAlive(port)) return
      await sleep(250)
    }
    throw new Error(
      `browser: launched ${executable} with --remote-debugging-port=${port}, but its CDP endpoint never answered within `
      + `${CDP_LAUNCH_TIMEOUT_MS / 1000}s. Close any Chrome already using that profile, or point debugPort elsewhere.`,
    )
  }

  /** Get or create the isolated BrowserContext for one session id. */
  private async getContext(sessionId: string, signal: AbortSignal): Promise<BrowserContext> {
    // Startup must settle before this decision: `persistentContext` is only
    // created by the launch, so testing it first would send the very first call
    // down the fresh-context path and silently give the default session an
    // ephemeral context — defeating the persistent profile entirely.
    await this.ensureInit()
    signal.throwIfAborted()

    // A persistent profile (when configured) backs the default session so its
    // cookies/storage/login state survive restarts.
    if (sessionId === DEFAULT_SESSION && this.persistentContext !== null) {
      return this.persistentContext
    }

    const existing = this.sessions.get(sessionId)
    if (existing !== undefined && !existing.isClosed()) return existing

    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new Error(
        `maximum concurrent browser sessions (${this.config.maxConcurrentSessions}) reached; close a session with browser_close first`,
      )
    }

    const ctx = await this.browser!.newContext(this.contextOptions())
    await ctx.addInitScript(STEALTH_INIT_SCRIPT)
    this.sessions.set(sessionId, ctx)
    return ctx
  }

  /**
   * Get (or create) the session's page. The first call adopts a page the
   * browser already has; every later call returns that same page while it is
   * open, so a tab the browser opens behind our back cannot hijack the session.
   * @param sessionId - session to resolve; undefined uses the default session.
   * @param signal - caller cancellation.
   * @returns the session's live page.
   */
  async getPage(sessionId: string | undefined, signal: AbortSignal): Promise<Page> {
    const key = sessionId ?? DEFAULT_SESSION
    const ctx = await this.getContext(key, signal)

    const tracked = this.pages.get(key)
    if (tracked !== undefined && !tracked.isClosed() && tracked.context() === ctx) return tracked

    const existing = ctx.pages().find(page => !page.isClosed())
    const page = existing ?? await ctx.newPage()
    this.pages.set(key, page)
    return page
  }

  /**
   * Move the pointer onto an element before acting on it, the way a person
   * would, with a short pause to let the page react. A no-op when `humanize`
   * is off or the element has no box (e.g. it is offscreen or detached).
   * @param locator - the target element.
   */
  private async approach(locator: Locator): Promise<void> {
    if (!this.config.humanize) return
    const box = await locator.boundingBox().catch(() => null)
    if (box === null) return
    const x = box.x + box.width * (0.35 + Math.random() * 0.3)
    const y = box.y + box.height * (0.35 + Math.random() * 0.3)
    await locator.page().mouse.move(x, y, { steps: randomInt(8, 20) }).catch(() => {})
    await sleep(randomInt(40, 160))
  }

  /**
   * Click an element, approaching it with a real pointer motion when humanize is on.
   * @param locator - the target element.
   * @param options - mouse button, click count, and the caller's cancellation signal.
   */
  async clickElement(
    locator: Locator,
    options: { button: 'left' | 'right' | 'middle'; clickCount: number; signal: AbortSignal },
  ): Promise<void> {
    await this.approach(locator)
    await locator.click(options)
  }

  /**
   * Focus an element and type into it character by character. A human-paced run
   * uses a natural inter-key delay unless the caller pins one.
   * @param locator - the input element.
   * @param text - text to type.
   * @param delayMs - explicit per-key delay; omitted picks a human-paced one when humanize is on.
   */
  async typeInto(locator: Locator, text: string, delayMs?: number): Promise<void> {
    await locator.fill('')
    if (this.config.humanize) await locator.click()
    const delay = delayMs ?? (this.config.humanize ? randomInt(35, 90) : 0)
    await locator.pressSequentially(text, { delay })
  }

  /**
   * Hover an element, approaching it with a real pointer motion when humanize is on.
   * @param locator - the target element.
   * @param signal - the caller's cancellation signal.
   */
  async hoverElement(locator: Locator, signal: AbortSignal): Promise<void> {
    await this.approach(locator)
    await locator.hover({ signal })
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
    this.pages.delete(sessionId)
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
    this.pages.clear()
    if (this.browser !== null) {
      if (!this.isConnectMode) await this.browser.close().catch(() => {})
      this.browser = null
    }
    this.persistentContext = null
    this.channel = undefined
    this.initPromise = null
  }
}
