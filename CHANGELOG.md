# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-14

Compatibility release for DeepSeek Harness `0.2.2-rc.1`, plus a realism pass so
the tools drive a genuine browser rather than an obvious automation instance.

### Fixed

- **DeepSeek Harness `0.2.x` disabled the plugin row entirely.** `0.2` added a
  plugin compatibility gate (`@deepseek-ai/dsh-app-boot`): it reads
  `engines.dsh`, falls back to the `@deepseek-ai/dsh-*` peer ranges, and turns
  the row off when the running harness does not satisfy them. The old
  `^0.1.6-alpha.2` peers lost that check, so the plugin loaded nothing and every
  browser tool vanished. The manifest now declares `engines.dsh: ^0.2.2-rc.1`
  and re-bases the peers on `0.2.2-rc.1`.
- **The default session never used the persistent profile.** `getContext()`
  tested `persistentContext` before running startup, so the very first call
  always fell through to `browser.newContext()` and got an ephemeral context —
  cookies and logins were discarded even when a profile was configured.
- **A session could drift onto another tab.** `getPage()` re-picked "the first
  open page" on every call, so a tab the browser opened on its own (a persistent
  profile always starts with one) became the new target mid-task. The engine now
  pins one page per session.
- npm auto-installed the plugin's `@deepseek-ai/dsh-*` peers as a second,
  drifting copy instead of using the harness generation it targets. They are
  pinned in `devDependencies` for typechecking, and the lockfile is regenerated
  against `0.2.2-rc.1`.

### Added

- `mode: 'connect'` now works unattended: when nothing is listening on
  `debugPort` it launches a real Chrome/Edge against a dedicated profile, waits
  for CDP, and attaches. The browser outlives dsh, so it can be watched and
  taken over by hand, and the next run reconnects to the same profile.
- `chromePath` config to name the executable `connect` should start.
- `locale` and `timezoneId` config, empty by default so the browser keeps its
  real values.
- `humanize` config (default true): the pointer travels to the element before a
  click or hover, and typing is paced per keystroke. Beyond looking human, real
  focus and hover sequencing is what many single-page apps need to behave.
- `systemChromePaths()` export listing the Chrome/Edge executables found on the
  machine, used by `connect` and asserted by the tests.

### Changed

- The default `userAgent` is now empty: the browser sends its own. The previous
  `"DeepSeek Harness AI Agent"` advertised automation to every page and did not
  match the rest of the fingerprint.
- `userDataDir` defaults to `~/.dsh/browser-profile`, so cookies, logins and
  storage survive restarts by default. Set it to `""` for an ephemeral profile.
- `--disable-gpu` is only passed in headless mode; a visible window now renders
  the way a real browser does.
- The engine test suite covers the persistent profile, page pinning, real UA
  passthrough, humanized input, and system-channel launch (14 engine checks plus
  47 plugin-surface checks).

### Scope

This release makes the tools drive a real browser with a stable identity. It
does **not** solve CAPTCHAs, spoof fingerprints, rotate proxies, or target
anti-bot vendors — those are outside the plugin's scope and are the site's
call, not the tool's.

## [0.1.1] - 2026-09-22

Compatibility release for DeepSeek Harness `0.1.6-alpha.2`.

### Changed

- **Peer dependencies re-based on `^0.1.6-alpha.2`.** The previous `^0.1.1-rc.2` ranges are not satisfied by a `0.1.x-<tag>` pre-release of a different patch, so an install resolved `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-attachment`, and `@deepseek-ai/dsh-system-prompt` to stale `0.1.1-rc.2` copies and linked them next to the plugin, shadowing the host's `0.1.6-alpha.2` modules. The plugin now resolves the same generation as the running harness.
- `playwright` is pinned to `1.62.1` instead of `^1.50.0`. The tarball ships no lockfile, so a floating range silently installed a newer Playwright whose browser build was not downloaded, and every tool failed at launch.
- The DSH packages are also declared as devDependencies, so a plain `npm install` in a checkout typechecks against the harness generation the plugin targets.

### Added

- `channel` config: `chromium` (default, Playwright's bundled build), `chrome`, `msedge`, or `chrome-headless-shell`.
- `fallbackChannels` config (default `true`). When the preferred channel has no usable executable, the engine tries the remaining channels, so a dsh profile install — where pnpm blocks Playwright's browser download — drives an already-installed Chrome or Edge instead of failing.
- A launch failure that survives every channel now reports each candidate and the exact remedies instead of a raw Playwright stack.
- `test-tools.mjs` (`npm run test:tools`): checks all 13 tool definitions against the installed `@deepseek-ai/dsh-tools` — parameter schema conversion, output JSON Schema, every `output.render` projector, the `dsh-attachment` image seam, and the `Config` defaults.

## [0.1.0-rc.2] - 2026-08-27

### Changed

- Chromium's sandbox is now enabled by default; `noSandbox` disables it for root/container environments.
- Removed forced touch emulation from browser contexts.
- Added persistent `userDataDir` option so cookies/storage survive restarts.
- Anti-detection: hide `navigator.webdriver` and disable the AutomationControlled fingerprint.

### Fixed

- `browser_get_html` returned inner HTML; it now returns the element's outer HTML to match its documented behavior.

## [0.1.0-rc.1] - 2026-08-26

### Added

- 13 model-facing browser automation tools: `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_get_text`, `browser_get_html`, `browser_get_page_text`, `browser_eval_js`, `browser_wait_for`, `browser_select`, `browser_hover`, `browser_press_key`, `browser_close`
- Two engine modes: launch a fresh Chromium, or attach to an existing Chrome via CDP
- Per-session BrowserContext isolation with a concurrency cap
- `headless` config option (defaults to a visible window)
- English and Chinese documentation
