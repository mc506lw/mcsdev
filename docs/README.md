# mcsdev 文档站

这是 [mcsdev](https://github.com/mc506lw/mcsdev) 的产品文档，用 **VitePress** 构建，部署在 GitHub Pages。

站点地址：<https://mc506lw.github.io/mcsdev/>

## 技术选型

选 VitePress 而不是 Jekyll / Hugo / 纯静态，理由按重要性排：

1. **和项目同栈**：mcsdev 本身是 Node + TypeScript 项目，文档站用 Node 工具链意味着不用为了写文档再装一套 Ruby/Python。CI 里 `actions/setup-node` 就够了。
2. **Markdown 驱动，零构建脚本**：每个 `.md` 就是一个页面，没有 front matter 也能跑。写文档的人不需要学 Liquid 或 Go template。
3. **内置本地搜索**：`themeConfig.search.provider = 'local'` 不需要任何外部服务（Algolia 要账号、要配额、要网络）。中文分词用 `Intl.Segmenter` 补上（默认分词器会把整句中文当一个 token，等于搜不到）。
4. **内置暗色模式**：跟随系统，不需要额外配置。
5. **构建产物是纯静态文件**：`docs/.vitepress/dist/` 里就是 HTML/CSS/JS，扔给 GitHub Pages 即可，没有运行时依赖。

Jekyll + just-the-docs 也满足「能部署到 Pages」，但需要 Ruby 工具链，且搜索、暗色模式都要额外插件。纯静态手写 HTML 则会在页面数超过 30 之后失去可维护性。

## 目录结构

```
docs/
├── .vitepress/
│   └── config.mts          站点配置（导航、侧边栏、搜索、base 路径）
├── index.md                首页（landing）
├── README.md               本文件
├── public/                 静态资源（原样复制到站点根）
│   ├── favicon.svg         来自仓库根 assets/favicon.svg
│   ├── logo-mark.svg       导航栏标记（浅色），来自 assets/logo-mark.svg
│   ├── logo-mark-dark.svg  导航栏标记（深色），由 logo-mark.svg 换描边色得到
│   ├── logo.svg            整条 wordmark（浅色），来自 assets/logo.svg
│   └── logo-dark.svg       整条 wordmark（深色），来自 assets/logo-dark.svg
├── get-started/            开始使用：安装 / 快速上手 / 核心概念
├── tutorial/               教程（Diátaxis: Tutorials）
├── how-to/                 操作指南（Diátaxis: How-to guides）
├── explanation/            理解（Diátaxis: Explanation）
└── reference/              参考（Diátaxis: Reference）
    └── cli/                每个命令一页
```

信息架构移植 Docker 官方文档的递进逻辑：**先跑起来（get-started）→ 跟着做一遍（tutorial）→ 按任务查（how-to）→ 搞懂为什么（explanation）→ 查细节（reference）**。

## 本地预览

```bash
cd docs
npm install
npm run dev
```

默认起在 <http://localhost:5173>，改 Markdown 会热更新。

只改文案不需要装依赖也能预览，但检查链接和搜索需要跑起来。

## 构建

```bash
cd docs
npm run build        # 产物在 docs/.vitepress/dist/
npm run preview      # 本地起一个静态服务器看构建产物
```

## 部署到 GitHub Pages

仓库里已经有 `.github/workflows/pages.yml`：

- 触发：push 到 `main` 且改动涉及 `docs/**` 或 workflow 文件本身，也可以手动 `workflow_dispatch`；
- 步骤：`npm ci` → `npm run build` → 上传 `docs/.vitepress/dist` → `deploy-pages`。

### 一次性配置

在仓库 **Settings → Pages → Build and deployment** 里把 **Source** 设为 **GitHub Actions**。这一步只能手点，workflow 改不了它。

### base 路径

GitHub Pages 的项目站点地址是 `https://<user>.github.io/<repo>/`，所以 VitePress 的 `base` 必须是 `/<repo>/`。

`config.mts` 里读环境变量：

```ts
const base = (process.env.DOCS_BASE || '/').replace(/\/*$/, '/')
```

workflow 里按仓库名算出来：

```yaml
env:
  DOCS_BASE: /${{ github.event.repository.name }}/
```

本地开发不设这个变量，默认 `/`，所以 `http://localhost:5173/` 正常。

### 换成自定义域名

1. 在 `docs/public/` 下放一个 `CNAME` 文件，内容是域名（一行）；
2. 把 workflow 里的 `DOCS_BASE` 改成 `/`；
3. 在仓库 Settings → Pages 里填 Custom domain。

## 更新 LOGO

品牌资源在仓库根的 `assets/`（由视觉设计负责），文档站用 `docs/public/` 里的副本：

```bash
cp assets/favicon.svg assets/logo.svg assets/logo-dark.svg assets/logo-mark.svg docs/public/
# 深色导航栏用的标记：只换描边色，形状不变
sed 's/#0B0E14/#F5F7F6/g' assets/logo-mark.svg > docs/public/logo-mark-dark.svg
```

导航栏用 `logo-mark.svg`（32×32 的标记），不用整条 wordmark —— 否则会紧挨着站点标题 `mcsdev` 重复一遍。

## 写作约定

新增或修改页面时请遵守：

### 1. 先归属象限

每个页面的内容只服务一个象限，不要混：

| 象限 | 只做 | 不做 |
| --- | --- | --- |
| 教程 | 让人跟着做成功 | 解释为什么、给分支选项 |
| 操作指南 | 完成一个具体任务 | 教基础、铺陈背景 |
| 参考 | 描述事实（参数、默认值、退出码） | 教学、给建议 |
| 理解 | 解释取舍与边界 | 给操作步骤 |

### 2. 命令输出必须是真实输出

代码块里的终端输出照抄真实运行结果，包括标记：

| 标记 | 含义 | 来源 |
| --- | --- | --- |
| `✔ ` | 成功 | `ok()` |
| `⚠ ` | 警告 | `warn()` |
| `✖ ` | 错误（stderr） | `error()` |
| `  ? ` | 提示 | `hint()` |
| `  → ` | 步骤 | `step()` |
| `mcsdev ` | 一般信息 | `info()` |

不要编造输出。改代码后顺手 `node dist/cli.js <cmd>` 核对一遍。

### 3. 术语首次出现给英文

例如「声明式配置（declarative configuration）」「部署清单（deployment manifest）」「防抖（debounce）」。中文为主，但保留英文原文方便搜索和对照源码。

### 4. 不要营销腔

写「事实 + 为什么」，不写「强大的」「极致的」「一站式」。参考 Docker 文档的语气：直接、具体、承认限制。

### 5. 新增页面要挂进侧边栏

`config.mts` 的 `themeConfig.sidebar` 是手写的。新增页面后必须加一行，否则搜得到但导航空缺。

## 相关文件

| 文件 | 作用 |
| --- | --- |
| `docs/package.json` | 文档站自己的依赖（不污染仓库根 `package.json`） |
| `docs/.vitepress/config.mts` | 站点配置 |
| `docs/.gitignore` | 忽略 `node_modules/`、`.vitepress/dist/`、`.vitepress/cache/` |
| `.github/workflows/pages.yml` | 构建与部署 |
