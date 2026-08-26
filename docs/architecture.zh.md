# 架构设计

[English](architecture.md) | 中文

> 本文讲「为什么这么设计、怎么工作的」。只想快速使用，请看 [README](../README.md)。

## 目录

- [1. 它是什么](#1-它是什么)
- [2. bundle 是什么](#2-bundle-是什么)
- [3. 安装时发生了什么](#3-安装时发生了什么)
- [4. 启动时发生了什么](#4-启动时发生了什么)
- [5. 插件如何注册工具](#5-插件如何注册工具)
- [6. 引擎设计](#6-引擎设计)
- [7. 设计决策](#7-设计决策)
- [8. 目录结构](#8-目录结构)

## 1. 它是什么

`@deepseek-ai/dsh-tool-browser` 是 DeepSeek Harness 的一个 **bundle（组合包）插件**，
为 Agent 提供 **13 个 `browser_*` 工具**，让它能操控真实的 Chromium 浏览器。

它跑在 **Cordis** 这个插件框架上。Cordis 有三个核心思想：

- **一切皆插件** —— 工具、LLM、文件、agent loop 本身都是插件；
- **插件只声明，不启动** —— 插件导出 `apply(ctx, config)`，通过 `ctx` 注册能力，不写任何启动代码；
- **依赖注入 + 分层组装** —— 插件声明自己需要什么（`inject`），由配置决定装哪些、怎么配、按什么顺序。

## 2. bundle 是什么

一个 bundle 是一个 npm 包，它的 `package.json` 里声明：

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

`cordis.patch.yml` 是一个「patch 层」——它不写代码，只声明「往最终配置树里插入/覆盖什么」。
本插件的 patch 只有一行 `insert`：

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

## 3. 安装时发生了什么

```
dsh plugin --profile web add <tarball>
  ├─ ① pnpm 把 tarball 装进 profile 的 node_modules
  └─ ② dsh 读包里的 dsh.bundle 字段，把包名追加进 profile 的 dsh.profile.bundles
```

所以「安装」= 「pnpm 装包」+「注册进 profile 的 bundles 列表」，全程不碰任何源码。

## 4. 启动时发生了什么

每次 `dsh web` 启动，loader 都会从**空配置树**开始，逐层叠加 patch：

```
空配置
  ↓ ① @deepseek-ai/dsh-base        的 cordis.patch.yml（基础层）
  ↓ ② @deepseek-ai/dsh-web-app     的 cordis.patch.yml
  ↓ ③ dsh-tool-browser             的 cordis.patch.yml   ← 在这一层插入了 tool-browser 行
  ↓ ④ profile 自己的 cordis.patch.yml（profile 层）
  ↓ ⑤ home 级 $DSH_HOME/cordis.patch.yml（机器级共享）
  ↓ ⑥ 每个 --patch overlay（命令行临时层）
最终配置树
```

关键规则：

- **后层胜出**：同一 `id` 的行，后写的覆盖先写的；
- **整段替换**：patch 按 `id` 替换整段 `config`，不是深度合并；
- 层顺序由 `dsh.profile.bundles` 决定，与文件里的书写顺序无关。

这就是「**默认层（打进包里）+ 用户层（每次启动现读）**」的分层设计，也解释了为什么：

- 改 profile 的 `cordis.patch.yml`（位于 `~/.dsh/profiles/<profile>/cordis.patch.yml`）→ 重启即生效，**不用重新打包**；
- 改插件包里的 `cordis.patch.yml`（位于插件包内部）→ 那是改默认层，**要重新打包**。

## 5. 插件如何注册工具

loader 挂载 `tool-browser` 行时，会调用插件的 `apply(ctx, config)`。插件做的事：

1. `inject: ['tools', 'systemPrompt']` —— 声明依赖，保证 `ctx.tools`、`ctx.systemPrompt` 就绪后才启动；
2. `ctx.tools.register(defineTool({ ... }))` —— 注册 13 个工具；
3. `ctx.systemPrompt.section(...)` —— 给模型注入工具使用说明；
4. `ctx.effect(() => () => engine.shutdown())` —— 注册 teardown，插件卸载时自动关浏览器；
5. 截图工具特殊：`ctx.inject(['attachments'], ...)` **条件注册**——没有附件存储时截图工具就不会出现。

## 6. 引擎设计

- **惰性启动**：Chromium 不在插件加载时启动，而是在第一次工具调用时才 launch（`ensureInit` 幂等，多个并发调用共享一次初始化）；
- **会话隔离**：每个 `sessionId` 对应一个独立的 `BrowserContext`，Cookie/存储互不干扰；
- **并发上限**：`maxConcurrentSessions` 限制同时存在的 context 数，超了报错让模型先关旧的；
- **生命周期**：用 `ctx.effect` 挂 teardown，fiber 卸载时关闭浏览器（热重载也能正确释放资源）；
- **evalJs 安全**：`page.evaluate` 在浏览器 V8 沙箱执行，结果经 JSON 往返，剥离函数/Symbol/循环引用。

## 7. 设计决策

| 决策 | 理由 |
|---|---|
| 默认 `headless: false`（可见窗口） | 便于观察和调试；需要隐形时再显式开启 |
| 截图工具条件注册 | 没有附件存储时截图无从持久化，直接不注册，避免「工具在但用不了」 |
| evalJs 用 JSON 往返 | 结果必须是无损 JSON，才能安全进模型上下文 |
| 会话隔离 + 并发上限 | 防资源耗尽，任务间不串 Cookie |
| 「默认层 + 用户层」分层 | 改配置和改插件解耦，成本完全不同 |

## 8. 目录结构

```
src/
├── index.ts        # 插件入口：apply / inject / Config schema + 工具装配
├── engine.ts       # BrowserEngine：Chromium 生命周期 + 会话管理
└── tools/          # 每个工具一个 applyXxxTool()
    ├── navigate.ts / click.ts / type.ts / ...
```

---

相关：[README](../README.md) · [CONTRIBUTING](../CONTRIBUTING.md)
