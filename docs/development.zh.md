# 开发指南

[English](development.md) | 中文

> 从源码构建、运行本插件。

本文覆盖两种场景：不改代码、直接从源码安装；以及本地开发（改代码并加载到 DSH）。

## 一、从源码安装（不改代码）

一条命令：

```bash
dsh plugin --profile web add github:GenOrch/dsh-tool-browser
```

首次会报 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`，把 pnpm 打印的 key 复制进 profile 的
`pnpm-workspace.yaml`：

```yaml
allowBuilds:
  <pnpm 打印的确切 key>: true
```

然后重新执行。

## 二、本地开发（改代码并加载）

```bash
# 1. 拉取源码
git clone https://github.com/GenOrch/dsh-tool-browser.git
cd dsh-tool-browser

# 2. 安装依赖
npm install
```

3. 修改 `src/` 下的代码。

4. 每次改完，重新构建：

```bash
npm run build
```

5. 把新构建加载进 DSH，二选一：

**方式 A：用 `--patch` 覆盖（不重新安装）。**
让 DSH 直接加载本地 `lib/` 构建，而不是已安装的包：

```yaml
# browser-overlay.yml
- insert:
    - id: tool-browser
      name: '/绝对路径/dsh-tool-browser/lib/index.js'
```

```bash
dsh web --patch ./browser-overlay.yml
```

**方式 B：打包后重新安装。**
`npm pack` 生成的 tarball 和 GitHub Release 发的一致，再用 `dsh plugin add` 安装：

```bash
npm pack
dsh plugin --profile web add ./deepseek-ai-dsh-tool-browser-<version>.tgz
```

## 测试

```bash
npm test              # 两套都跑
npm run test:tools    # 插件接口面，不需要浏览器
npm run test:engine   # 引擎 E2E，需要真实浏览器
```

`test:tools` 用一个假 context 调 `apply()`，再用本仓库安装的
`@deepseek-ai/dsh-tools` 校验全部 13 个工具定义 —— 参数 schema 转换、输出
JSON Schema、每个 `output.render` 投影函数，以及 `dsh-attachment` 的图片接缝。
升级 DSH 依赖后请先跑它：接口一变就会当场失败，而不是等到插件加载不起来。

`test:engine` 用本地 HTTP fixture 驱动真实 `BrowserEngine`，同时覆盖启动与身份契约：
Playwright 自带 Chromium、系统 channel 回退（没装 Chrome 时跳过）、持久 profile 跨重启、
浏览器新开标签页时的 page 固定、真实 UA 透传、以及拟人输入。
