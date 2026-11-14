# Security Policy

## Reporting a Vulnerability

Please do **not** open a public issue for security vulnerabilities.

Report them privately through GitHub's private vulnerability reporting on the
`GenOrch/dsh-tool-browser` repository (Security → Advisories → Report a
vulnerability).

Include:

- A description of the vulnerability and its impact.
- Reproduction steps or a minimal proof of concept.
- The affected version(s) and environment (Node.js, OS, Playwright/Chromium version).

We will acknowledge receipt and keep you informed of the fix and disclosure timeline.

## Security model of this plugin

`@deepseek-ai/dsh-tool-browser` drives a real Chromium instance. Operators should
review these points before exposing it:

- `browser_eval_js` executes JavaScript in the page's V8 sandbox via
  `page.evaluate()`, not in the Node.js process; results are JSON-round-tripped
  to strip functions, symbols, and cycles.
- There is no URL allowlist at the library level. Deployments that expose the
  browser to untrusted prompts should add SSRF protection (a URL allowlist) and
  block `file://`/internal-network targets.
- `maxConcurrentSessions` bounds live BrowserContexts; `bypassCSP` defaults to
  `false`.
- Chromium's sandbox is enabled by default; `noSandbox: true` disables it (only
  for root/container environments).
- `userDataDir` persists cookies, logins and storage on disk (default
  `~/.dsh/browser-profile`). Treat that directory as credential material: it is
  the browser's real profile, so anyone who reads it can reuse the sessions it
  holds. Set `userDataDir: ""` to run ephemeral.
- `mode: connect` launches a real Chrome/Edge with `--remote-debugging-port` on
  loopback. Any local process that can reach that port controls the browser,
  including its logged-in sessions. Keep `debugPort` bound to `127.0.0.1` and
  close the browser when you are done with it.
- Automation fingerprints (`navigator.webdriver`) are hidden to reduce bot
  detection; use responsibly and respect each site's terms of service.

## Scope boundary

The plugin makes the tools drive a genuine browser — real build, real profile,
real User-Agent, human-paced input. It intentionally does not solve CAPTCHAs,
spoof fingerprints, rotate proxies, or target anti-bot vendors. Please do not
report "site X still blocks me" as a security issue or a bug; that is the site's
decision, not a defect in the plugin.
