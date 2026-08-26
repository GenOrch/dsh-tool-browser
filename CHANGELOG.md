# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Chromium's sandbox is now enabled by default; `noSandbox` disables it for root/container environments.
- Removed forced touch emulation from browser contexts.

### Fixed

- `browser_get_html` returned inner HTML; it now returns the element's outer HTML to match its documented behavior.

## [0.1.0-rc.1] - 2026-08-26

### Added

- 13 model-facing browser automation tools: `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_get_text`, `browser_get_html`, `browser_get_page_text`, `browser_eval_js`, `browser_wait_for`, `browser_select`, `browser_hover`, `browser_press_key`, `browser_close`
- Two engine modes: launch a fresh Chromium, or attach to an existing Chrome via CDP
- Per-session BrowserContext isolation with a concurrency cap
- `headless` config option (defaults to a visible window)
- English and Chinese documentation
