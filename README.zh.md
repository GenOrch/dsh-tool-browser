# @deepseek-ai/dsh-tool-browser（中文）

[English](README.md) | 中文

> DeepSeek Harness 的 13 个浏览器工具。驱动真实 Chromium，默认可见窗口。

为 DeepSeek Harness 增加 `browser_*` 工具：导航、点击、输入、截图、读内容、执行
JavaScript。Playwright 会执行 JavaScript、渲染真实 DOM，这是普通 HTTP 工具做不到的。

## 特性

- 13 个浏览器工具
- 默认可见窗口
- 会话隔离 + 并发上限
- 安全的 `browser_eval_js`：在浏览器沙箱运行，不进 Node.js
- 惰性启动

### 工具一览

| 工具 | 说明 |
|------|------|
| `browser_navigate` | 打开一个 URL |
| `browser_screenshot` | 把页面截成 PNG |
| `browser_click` / `browser_hover` | 按 CSS 选择器点击 / 悬停元素 |
| `browser_type` / `browser_press_key` | 输入文本 / 按键 |
| `browser_get_text` / `browser_get_html` / `browser_get_page_text` | 读取页面内容 |
| `browser_eval_js` | 在页面里执行 JavaScript |
| `browser_wait_for` | 等待元素出现 |
| `browser_select` | 选择 `<select>` 下拉框选项 |
| `browser_close` | 关闭某个会话或整个浏览器 |

每个工具都支持可选的 `sessionId`。

## 快速开始

**前提**：DeepSeek Harness 已在运行（`dsh web`）。

**兼容性**：本版本对应 DeepSeek Harness `0.2.2-rc.1`，manifest 声明
`engines.dsh: ^0.2.2-rc.1`，peer 同线。harness `0.2` 会把声明不满足的插件行
直接禁用，所以在别的版本线上浏览器工具不会加载。

### 0. 命令前缀

装了 DSH CLI 用 `dsh`；从源码 checkout 跑用 `pnpm dsh`。

### 1. 安装

```bash
dsh plugin --profile web add https://github.com/GenOrch/dsh-tool-browser/releases/download/v0.2.0/deepseek-ai-dsh-tool-browser-0.2.0.tgz
```

> 源码安装：见 [docs/development.zh.md](docs/development.zh.md)。

### 2. 安装 Chromium（可选）

```bash
npx playwright install chromium
```

机器上已有 Chrome 或 Edge 时可以跳过：引擎会自动回退到系统浏览器，
见 [`channel`](#配置)。

### 3. 重启

重启 `dsh web`。

### 4. 验证

让 agent 打开一个网页，应弹出浏览器窗口。

## 使用示例

### 搜索并截图

```
用户："去 example.com 搜索 'AI Agent' 并截图"
→ browser_navigate → browser_type → browser_wait_for → browser_screenshot
```

### 填表单

```
→ browser_navigate(登录页) → browser_type(用户名) → browser_type(密码) → browser_get_text(欢迎语)
```

### 会话隔离

```
browser_navigate({ url, sessionId: "task-a" })
browser_navigate({ url, sessionId: "task-b" })
browser_close({ sessionId: "task-a" })
```

## 配置

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `mode` | `headless` | `headless` 启动浏览器；`connect` 通过 CDP 连接真实 Chrome，没在跑就自己拉起来 |
| `headless` | `false` | `false` 显示窗口；`true` 隐形运行 |
| `debugPort` | `9222` | `connect` 模式的 CDP 端口 |
| `chromePath` | `""` | `connect` 要启动的 Chrome 路径（空 = 自动探测） |
| `timeoutMs` | `30000` | 每次操作超时（毫秒） |
| `maxConcurrentSessions` | `10` | 最大并发会话数 |
| `userAgent` | `""` | 空 = 用浏览器自己的真实 UA |
| `locale` / `timezoneId` | `""` | 空 = 用浏览器自己的真实语言/时区 |
| `viewportWidth` / `viewportHeight` | `1280` / `720` | 视口尺寸 |
| `launchArgs` | `[]` | 额外的浏览器启动参数 |
| `bypassCSP` | `false` | 是否绕过页面 CSP |
| `noSandbox` | `false` | 禁用浏览器沙箱（root 环境需要） |
| `userDataDir` | `~/.dsh/browser-profile` | profile 目录；cookie/登录态跨重启保留（`""` = 每次全新） |
| `channel` | `chromium` | 启动哪个浏览器：`chromium`（Playwright 自带构建）、`chrome`、`msedge`、`chrome-headless-shell` |
| `fallbackChannels` | `true` | 首选 channel 没有可执行文件时，是否依次尝试其余 channel |
| `humanize` | `true` | 鼠标真的移到元素上再点，逐字节奏输入 |

### 浏览器

`chromium` 需要 Playwright 自己下载的构建。dsh profile 安装不会执行包构建脚本，
这个下载通常是被拦住的 —— 此时引擎会自动回退到机器上已装的 `chrome`、`msedge`
或 `chrome-headless-shell`，完全不需要下载。若要固定某一个浏览器，请同时设置
`channel` 和 `fallbackChannels: false`。

### 真实浏览器，不是"自动化实例"

以下四个默认值是为了让浏览器真的像一个浏览器，而不是一眼能被标出来的自动化环境：

- **`userAgent: ""`** —— 用浏览器自己的 UA。编造的 UA 和指纹其余部分对不上，
  比说实话更像机器人。
- **`userDataDir: ~/.dsh/browser-profile`** —— 固定一个 profile，cookie、登录态、
  存储都留得住。每次调用都是"全新设备"是最响的信号，而且一重启就掉登录。
- **`humanize: true`** —— 指针真的移动到元素上，输入按逐字节奏。真实的
  focus/hover 时序在很多 SPA 上还是功能正确性的前提。
- **`mode: connect`** —— 直接驱动你本机的 Chrome：真实构建、真实 profile。
  没在监听时引擎会用 `--remote-debugging-port` 自己拉起来，且 dsh 退出后窗口仍在，
  你可以看着它跑，也可以随时接管。

**它不做**什么：不解验证码、不伪造指纹、不轮换代理、不针对任何反爬厂商。
站点不接受自动访问，那是站点的判断，请尊重其服务条款。

**请保持 `headless: false`。** headless 浏览器本身就可被识别：UA 里带
`HeadlessChrome`，而且有些站点会给它一份不一样的降级页面 —— 百度首页给 headless
Chromium 的是 `display: none` 的隐藏表单（`#kw` 尺寸为 0，根本填不进去），
给可见窗口的才是正常表单；搜索引擎也更容易直接回一个验证码。
`headless: true` 只建议用在你自己的站点上。

### 覆盖某个配置

编辑你 profile 的 `cordis.patch.yml`：

```
~/.dsh/profiles/<profile>/cordis.patch.yml
```

```yaml
- id: tool-browser
  config:
    headless: true
    timeoutMs: 60000
```

patch 是整段替换 `config`，不是合并。把你需要的键都写上。

```yaml
# 隐形运行
- id: tool-browser
  config:
    headless: true

# connect 模式
- id: tool-browser
  config:
    mode: connect
    debugPort: 9222
```

## 常见问题

### 没有弹出浏览器窗口

工具调用会返回 `no usable Chromium could be launched`，并列出试过的每个
channel。修其中一个即可：

- 用 `npx playwright install chromium` 装 Playwright 自带构建 —— 在 dsh
  profile 安装里这个下载会被 pnpm 拦住，此时应在插件管理器里批准 `playwright`
  的构建脚本；
- 或者把插件配置的 `channel` 设成 `chrome`（或 `msedge`），直接用机器上已装的浏览器。

### 装完之后插件没生效

重启 `dsh web`。正在运行的实例已经加载好插件列表，不会自动发现新装的插件。

### 没有 `browser_screenshot` 工具

`browser_screenshot` 只有在挂载了附件存储时才会注册。附件存储由
`@deepseek-ai/dsh-attachment-local` 提供，它是 **DSH 自带的包，不需要单独下载**。
官方 `web` profile 默认已挂载；自定义 profile 需要加一行挂载它：

```yaml
- insert:
    - id: attachment-local
      name: '@deepseek-ai/dsh-attachment-local'
```

### `dsh` 命令找不到

要么是 DSH CLI 没装，要么是你从源码跑 DSH。后者请用 `pnpm dsh` 代替 `dsh`
（在 harness 根目录执行）。

### 源码安装报 ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED

pnpm 拦下了 git 安装的 `prepare` 构建。把 pnpm 打印的确切 `allowBuilds` key 复制进
profile 的 `pnpm-workspace.yaml`，再重新执行。见
[docs/development.zh.md](docs/development.zh.md)。

### 想隐形运行

把 `headless` 设为 `true`。见「配置」。

### 想连接已有的 Chrome

把 `mode` 设为 `connect` 并配置 `debugPort`。见「配置」。

### `sessionId` 是干什么的？

每个 `sessionId` 对应一个独立的浏览器上下文（隔离 Cookie/存储）。不传就共享一个
会话，传不同 ID 让各任务互不干扰。

### 卸载

```bash
dsh plugin --profile web remove @deepseek-ai/dsh-tool-browser
```

然后重启 `dsh web`。之前装的 Chromium 会保留（全局共享，无害）。

## 它是怎么工作的

`@deepseek-ai/dsh-tool-browser` 是一个 **bundle**。它的 `package.json` 指向
`cordis.patch.yml`，后者是 patch 层，在启动时插入 `tool-browser` 行。

```
dsh plugin add → pnpm 装包 + 注册进 profile 的 bundles
dsh web 启动  → loader 按顺序叠加 patch 层 → 挂载插件 → apply(ctx) 注册 13 个工具
```

配置分两层：插件的默认层（打进包里）和你的覆盖层（每次启动现读）。

完整设计：[docs/architecture.zh.md](docs/architecture.zh.md)

## 开发者

- **从源码构建 / 本地开发：** [docs/development.zh.md](docs/development.zh.md)
- **参与贡献：** [CONTRIBUTING.md](CONTRIBUTING.md)

## 许可证

MIT
