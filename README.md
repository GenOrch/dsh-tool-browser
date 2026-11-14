# @deepseek-ai/dsh-tool-browser

English | [中文](README.zh.md)

> 13 browser tools for DeepSeek Harness. Drives a real Chromium, visible by default.

Adds `browser_*` tools to DeepSeek Harness: navigate, click, type, screenshot,
read content, and run JavaScript. Playwright executes JavaScript and renders a
real DOM, which plain HTTP tools cannot.

## Features

- 13 browser tools
- Visible window by default
- Session isolation with a concurrency cap
- Safe `browser_eval_js`: runs in the browser sandbox, not in Node.js
- Lazy startup

### Tools

| Tool | Description |
|------|-------------|
| `browser_navigate` | Open a URL |
| `browser_screenshot` | Capture the page as a PNG |
| `browser_click` / `browser_hover` | Click / hover an element by CSS selector |
| `browser_type` / `browser_press_key` | Type text / press keys |
| `browser_get_text` / `browser_get_html` / `browser_get_page_text` | Read page content |
| `browser_eval_js` | Run JavaScript in the page |
| `browser_wait_for` | Wait for an element |
| `browser_select` | Choose a `<select>` option |
| `browser_close` | Close a session or the browser |

Every tool accepts an optional `sessionId`.

## Getting Started

**Prerequisite**: DeepSeek Harness is running (`dsh web`).

**Compatibility**: this release targets DeepSeek Harness `0.2.2-rc.1`; it
declares `engines.dsh: ^0.2.2-rc.1` and peers on the same line. Harness `0.2`
disables a plugin row whose declared requirements it does not satisfy, so on a
different harness line the browser tools silently do not load.

### 0. Command prefix

Use `dsh` if you installed the DSH CLI, `pnpm dsh` if you run DSH from a source
checkout.

### 1. Install

```bash
dsh plugin --profile web add https://github.com/GenOrch/dsh-tool-browser/releases/download/v0.2.0/deepseek-ai-dsh-tool-browser-0.2.0.tgz
```

> Source install: see [docs/development.md](docs/development.md).

### 2. Install Chromium (optional)

```bash
npx playwright install chromium
```

Skip this if Chrome or Edge is already on the machine: the engine falls back to
the system browser automatically. See [`channel`](#configuration).

### 3. Restart

Restart `dsh web`.

### 4. Verify

Ask the agent to open a page. A browser window should open.

## Usage

### Search and screenshot

```
User: "Go to example.com, search 'AI Agent', and screenshot"
→ browser_navigate → browser_type → browser_wait_for → browser_screenshot
```

### Fill a form

```
→ browser_navigate(login) → browser_type(username) → browser_type(password) → browser_get_text(welcome)
```

### Session isolation

```
browser_navigate({ url, sessionId: "task-a" })
browser_navigate({ url, sessionId: "task-b" })
browser_close({ sessionId: "task-a" })
```

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `mode` | `headless` | `headless` launches a browser; `connect` attaches to a real Chrome over CDP and launches one when needed |
| `headless` | `false` | `false` shows a window; `true` runs invisibly |
| `debugPort` | `9222` | CDP port for `connect` mode |
| `chromePath` | `""` | Chrome executable `connect` should start (empty = auto-detect) |
| `timeoutMs` | `30000` | Per-operation timeout (ms) |
| `maxConcurrentSessions` | `10` | Maximum concurrent sessions |
| `userAgent` | `""` | Empty keeps the browser's real User-Agent |
| `locale` / `timezoneId` | `""` | Empty keeps the browser's real locale / timezone |
| `viewportWidth` / `viewportHeight` | `1280` / `720` | Viewport size |
| `launchArgs` | `[]` | Extra browser CLI arguments |
| `bypassCSP` | `false` | Bypass page CSP |
| `noSandbox` | `false` | Disable the browser sandbox (needed when running as root) |
| `userDataDir` | `~/.dsh/browser-profile` | Profile directory; cookies/logins persist across restarts (`""` = fresh each launch) |
| `channel` | `chromium` | Browser to launch: `chromium` (Playwright's bundled build), `chrome`, `msedge`, or `chrome-headless-shell` |
| `fallbackChannels` | `true` | Try the other channels when the preferred one has no executable |
| `humanize` | `true` | Move the pointer onto the element and pace keystrokes like a person |

### Browsers

`chromium` needs Playwright's own download. A `dsh` profile install does not run
package build scripts, so that download is usually blocked — the engine then
falls back to an already-installed `chrome`, `msedge`, or `chrome-headless-shell`
and needs no download at all. To pin one browser, set `channel` and
`fallbackChannels: false`.

### A real browser, not an automation instance

Four defaults exist to keep the browser a genuine one rather than something a
site can trivially flag:

- **`userAgent: ""`** — the browser reports its own UA. A made-up UA that
  disagrees with the rest of the fingerprint is a stronger signal than the truth.
- **`userDataDir: ~/.dsh/browser-profile`** — one stable profile, so cookies,
  logins and storage carry over. A browser that is a brand-new device every call
  is the loudest possible tell, and it also loses your session on every restart.
- **`humanize: true`** — the pointer really travels to the element and typing is
  paced per keystroke. Real focus/hover sequencing is often what SPAs need to
  behave at all.
- **`mode: connect`** — drive your actual Chrome: real build, real profile. The
  engine starts it with `--remote-debugging-port` if nothing is listening, and
  the window stays open after dsh exits, so you can watch it or take over.

What this does **not** do: solve CAPTCHAs, spoof fingerprints, rotate proxies, or
target anti-bot vendors. If a site does not want automated access, that is the
site's call — respect its terms.

**Keep `headless: false`.** A headless browser is detectable on its own terms:
its User-Agent contains `HeadlessChrome`, and some sites serve it a different,
degraded page — Baidu's homepage gives headless Chromium a hidden search form
(`display: none`, zero-size box) but the normal form to a visible browser, and
search engines are far likelier to answer a headless client with a CAPTCHA.
Use `headless: true` only for sites you control.

### Override a setting

Edit your profile's `cordis.patch.yml`:

```
~/.dsh/profiles/<profile>/cordis.patch.yml
```

```yaml
- id: tool-browser
  config:
    headless: true
    timeoutMs: 60000
```

A patch replaces the row's whole `config`, not merges. Include every key you need.

```yaml
# invisible
- id: tool-browser
  config:
    headless: true

# connect mode
- id: tool-browser
  config:
    mode: connect
    debugPort: 9222
```

## FAQ

### No browser window appears

A tool call returns `no usable Chromium could be launched`, listing every channel
it tried. Fix one of:

- install Playwright's bundled build with `npx playwright install chromium` — in
  a `dsh` profile install, pnpm blocks that download, so approve the `playwright`
  build script in the plugin manager instead;
- or set `channel: chrome` (or `msedge`) in the plugin config to use a browser
  that is already installed.

### The plugin does nothing after install

Restart `dsh web`. A running instance has already loaded its plugin list and does
not pick up newly installed plugins.

### `browser_screenshot` is missing

`browser_screenshot` registers only when an attachment store is mounted. The
store is provided by `@deepseek-ai/dsh-attachment-local`, which ships with DSH
(no separate install). The stock `web` profile already mounts it. On a custom
profile, add a row to mount it:

```yaml
- insert:
    - id: attachment-local
      name: '@deepseek-ai/dsh-attachment-local'
```

### `dsh` command not found

Either the DSH CLI is not installed, or you run DSH from a source checkout. In
that case use `pnpm dsh` instead of `dsh` (from the harness root).

### Source install fails with ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED

pnpm blocks the `prepare` build on git installs. Copy the exact `allowBuilds` key
it prints into the profile's `pnpm-workspace.yaml`, then re-run. See
[docs/development.md](docs/development.md).

### Run invisibly

Set `headless: true`. See [Configuration](#configuration).

### Attach to an existing Chrome

Set `mode: connect` and `debugPort`. See [Configuration](#configuration).

### What is `sessionId`?

Each `sessionId` maps to its own browser context with isolated cookies/storage.
Omit it to share one session; pass distinct ids to keep tasks separate.

### Uninstall

```bash
dsh plugin --profile web remove @deepseek-ai/dsh-tool-browser
```

Then restart `dsh web`. Chromium installed earlier stays (shared, harmless).

## How it works

`@deepseek-ai/dsh-tool-browser` is a **bundle**. Its `package.json` points at
`cordis.patch.yml`, a patch layer that inserts the `tool-browser` row at boot.

```
dsh plugin add → pnpm installs the package + registers it in the profile bundles
dsh web boot  → loader applies patch layers in order → mounts the plugin → apply(ctx) registers 13 tools
```

Config has two layers: the bundle's defaults (packed in) and your profile's
overrides (read on every boot).

Full design: [docs/architecture.md](docs/architecture.md)

## Development

- **From source / local dev:** [docs/development.md](docs/development.md)
- **Contribute:** [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
