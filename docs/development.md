# Development

English | [中文](development.zh.md)

> Building and running the plugin from source.

This guide covers two scenarios: installing from source without changing code,
and developing locally with code changes.

## Install from source (no code changes)

One command:

```bash
dsh plugin --profile web add github:GenOrch/dsh-tool-browser
```

The first run fails with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`. Copy the key it
prints into the profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  <the exact key pnpm printed>: true
```

Then re-run.

## Local development (modify and reload)

```bash
# 1. Get the source
git clone https://github.com/GenOrch/dsh-tool-browser.git
cd dsh-tool-browser

# 2. Install dependencies
npm install
```

3. Edit the code under `src/`.

4. Rebuild after each change:

```bash
npm run build
```

5. Load the new build into DSH. Two options:

**A. Override with `--patch` (no reinstall).**
Point DSH at the local `lib/` build instead of the installed package:

```yaml
# browser-overlay.yml
- insert:
    - id: tool-browser
      name: '/absolute/path/to/dsh-tool-browser/lib/index.js'
```

```bash
dsh web --patch ./browser-overlay.yml
```

**B. Pack and reinstall.**
`npm pack` produces the same tarball as a GitHub release. Install it with
`dsh plugin add`:

```bash
npm pack
dsh plugin --profile web add ./deepseek-ai-dsh-tool-browser-<version>.tgz
```

## Test

```bash
npm test
```

Runs the E2E tests against a real Chromium.
