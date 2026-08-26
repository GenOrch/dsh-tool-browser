# Architecture

English | [中文](architecture.zh.md)

> How this plugin is designed and how it works. For usage, see [README](../README.md).

## Contents

- [1. What it is](#1-what-it-is)
- [2. What a bundle is](#2-what-a-bundle-is)
- [3. What happens on install](#3-what-happens-on-install)
- [4. What happens on boot](#4-what-happens-on-boot)
- [5. How tools are registered](#5-how-tools-are-registered)
- [6. Engine design](#6-engine-design)
- [7. Design decisions](#7-design-decisions)
- [8. Directory layout](#8-directory-layout)

## 1. What it is

`@deepseek-ai/dsh-tool-browser` is a **bundle** plugin for DeepSeek Harness. It gives
the agent **13 `browser_*` tools** that drive a real Chromium browser.

It runs on **Cordis**, DeepSeek Harness's plugin framework. Three ideas matter:

- **Everything is a plugin** — tools, LLM adapters, filesystem, even the agent loop itself;
- **A plugin declares, it never boots** — it exports `apply(ctx, config)` and registers
  capabilities through `ctx`; it contains no startup code;
- **Dependency injection + layered composition** — a plugin declares what it needs
  (`inject`); configuration decides what is mounted, how, and in what order.

## 2. What a bundle is

A bundle is an npm package whose `package.json` declares:

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

`cordis.patch.yml` is a **patch layer** — no code, just a declaration of what to
insert or override in the final configuration tree. This plugin's patch is a single
`insert`:

```yaml
- insert:
    - id: tool-browser
      name: '@deepseek-ai/dsh-tool-browser'
      config:
        mode: headless
        headless: false
        timeoutMs: 30000
        maxConcurrentSessions: 10
```

## 3. What happens on install

```
dsh plugin --profile web add <tarball>
  ├─ ① pnpm installs the tarball into the profile's node_modules
  └─ ② dsh reads the package's dsh.bundle and appends its name to dsh.profile.bundles
```

So "install" = "pnpm install" + "register into the profile's bundle list". No source
code is touched.

## 4. What happens on boot

Every `dsh web` boot rebuilds the configuration from an empty tree, layering patches:

```
empty tree
  ↓ ① @deepseek-ai/dsh-base        cordis.patch.yml  (base)
  ↓ ② @deepseek-ai/dsh-web-app     cordis.patch.yml
  ↓ ③ dsh-tool-browser             cordis.patch.yml  ← inserts the tool-browser row here
  ↓ ④ the profile's own            cordis.patch.yml  (profile layer)
  ↓ ⑤ the home-level               $DSH_HOME/cordis.patch.yml  (machine-wide)
  ↓ ⑥ each --patch overlay                            (ad-hoc layer)
final tree
```

Key rules:

- **Last write wins** — a later layer's row with the same `id` overrides the earlier one;
- **Whole-config replacement** — a patch replaces the row's entire `config`, it never deep-merges;
- The order is decided by `dsh.profile.bundles`, not by position in any file.

This is the **"default layer + user layer"** design, which is why:

- editing **your profile's** `cordis.patch.yml` (at `~/.dsh/profiles/<profile>/cordis.patch.yml`) takes effect on restart — no rebuild;
- editing the **bundle's own** `cordis.patch.yml` (inside the plugin package) changes the default layer — a rebuild is required.

## 5. How tools are registered

When the loader mounts the `tool-browser` row, it calls the plugin's `apply(ctx, config)`. The plugin:

1. `inject: ['tools', 'systemPrompt']` — declares dependencies, so it only starts once `ctx.tools` and `ctx.systemPrompt` are ready;
2. `ctx.tools.register(defineTool({ ... }))` — registers the 13 tools;
3. `ctx.systemPrompt.section(...)` — injects usage guidance into the model prompt;
4. `ctx.effect(() => () => engine.shutdown())` — registers teardown so the browser closes on unload;
5. The screenshot tool is special: `ctx.inject(['attachments'], ...)` registers it **conditionally** — no attachment store means the tool simply never appears.

## 6. Engine design

- **Lazy startup** — Chromium is launched on the first tool call, not at plugin load (`ensureInit` is idempotent; concurrent callers share one init);
- **Session isolation** — each `sessionId` maps to its own `BrowserContext`; cookies/storage never leak across sessions;
- **Concurrency cap** — `maxConcurrentSessions` bounds live contexts; exceeding it errors and asks the model to close one first;
- **Lifecycle** — teardown is registered via `ctx.effect`, so unloading the plugin (including HMR) correctly shuts the browser down;
- **evalJs safety** — `page.evaluate` runs in the browser's V8 sandbox, and the result is JSON round-tripped to strip functions/symbols/cycles.

## 7. Design decisions

| Decision | Why |
|---|---|
| Default `headless: false` (visible window) | Observable and debuggable; invisibility is opt-in |
| Screenshot registered conditionally | Without an attachment store the image can't persist, so the tool simply doesn't appear |
| evalJs uses a JSON round-trip | The result must be lossless JSON to be safely fed into the model context |
| Session isolation + concurrency cap | Prevent resource exhaustion and cookie leakage across tasks |
| "Default layer + user layer" split | Decouples "changing config" from "changing the plugin" — very different costs |

## 8. Directory layout

```
src/
├── index.ts        # plugin entry: apply / inject / Config schema + tool wiring
├── engine.ts       # BrowserEngine: Chromium lifecycle + session management
└── tools/          # one applyXxxTool() per tool
    ├── navigate.ts / click.ts / type.ts / ...
```

---

Related: [README](../README.md) · [CONTRIBUTING](../CONTRIBUTING.md)
