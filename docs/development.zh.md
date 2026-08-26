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
npm test
```

用真实 Chromium 跑 E2E 测试。
