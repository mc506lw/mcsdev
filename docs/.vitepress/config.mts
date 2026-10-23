/**
 * mcsdev 文档站配置（VitePress 1.x）
 *
 * 部署形态：GitHub Pages 项目站点 → https://<user>.github.io/mcsdev/
 * base 通过 DOCS_BASE 环境变量注入（GitHub Actions 里按仓库名算），本地默认 '/'。
 *
 * 信息架构移植 Docker 官方文档的递进逻辑：
 *   Get started（先跑起来）→ Tutorials（跟着做一遍）→ How-to（按任务查）
 *   → Explanation（搞懂为什么）→ Reference（查细节）
 */
import { defineConfig } from 'vitepress'

/**
 * GitHub Pages 项目站点需要 /<repo>/ 作为 base。workflow 里通过 DOCS_BASE 注入。
 * 额外处理一个本地开发的小坑：在 Windows 的 Git Bash / MSYS 里传 `/repo/` 这种值
 * 会被路径转换改写成 `C:/.../repo/`，所以这里把盘符形式还原成最后一段。
 */
function normalizeBase(raw?: string): string {
  let b = (raw || '/').trim()
  if (!b) return '/'
  if (/^[a-zA-Z]:[\\/]/.test(b)) {
    const seg = b.split(/[\\/]/).filter(Boolean).pop()
    b = seg ? `/${seg}/` : '/'
  }
  if (!b.startsWith('/')) b = `/${b}`
  if (!b.endsWith('/')) b += '/'
  return b
}

const base = normalizeBase(process.env.DOCS_BASE)

/** 中英文混排的搜索分词：默认分词器会把整句中文当成一个 token，等于搜不到 */
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
const tokenize = (text: string, fieldName?: string): string[] => {
  if (fieldName === 'id' || fieldName === 'title') return text.split(/[\s\-_/]+/).filter(Boolean)
  const out: string[] = []
  for (const s of segmenter.segment(text)) {
    const seg = s.segment.trim()
    if (seg) out.push(seg)
  }
  return out
}

export default defineConfig({
  lang: 'zh-CN',
  title: 'mcsdev',
  description: '终端里的 Minecraft 插件开发者测试服环境',
  base,
  cleanUrls: true,
  lastUpdated: true,
  // docs/README.md 是给仓库读者看的构建说明，不是站点页面
  // （VitePress 会把 README.md 当成 index.md，和 docs/index.md 抢同一个路由）
  srcExclude: ['README.md'],
  head: [
    // 图标来自仓库根 assets/（logo 由 assets/logo*.svg 复制到 docs/public/）
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['meta', { name: 'theme-color', content: '#00C2A8' }],
  ],

  markdown: {
    lineNumbers: true,
  },

  themeConfig: {
    // 导航栏用「标记」（32×32 的 chevron + 光标块），不用整条 wordmark：
    // wordmark 旁边紧挨着站点标题 "mcsdev" 会重复。
    logo: {
      light: '/logo-mark.svg',
      dark: '/logo-mark-dark.svg',
      alt: 'mcsdev',
    },

    nav: [
      { text: '开始使用', link: '/get-started/', activeMatch: '^/get-started/' },
      { text: '教程', link: '/tutorial/', activeMatch: '^/tutorial/' },
      { text: '操作指南', link: '/how-to/', activeMatch: '^/how-to/' },
      { text: '理解', link: '/explanation/', activeMatch: '^/explanation/' },
      { text: '参考', link: '/reference/', activeMatch: '^/reference/' },
      { text: 'GitHub', link: 'https://github.com/mc506lw/mcsdev' },
    ],

    sidebar: {
      '/': [
        {
          text: '开始使用',
          items: [
            { text: '我该从哪开始', link: '/get-started/' },
            { text: '安装', link: '/get-started/install' },
            { text: '5 分钟快速上手', link: '/get-started/quickstart' },
            { text: '核心概念', link: '/get-started/concepts' },
          ],
        },
        {
          text: '教程 · Tutorials',
          collapsed: false,
          items: [
            { text: '教程索引', link: '/tutorial/' },
            { text: '从零到「改一行代码自动重启」', link: '/tutorial/first-dev-loop' },
            { text: '用 mcsdev 管一台测试服', link: '/tutorial/managed-instance' },
          ],
        },
        {
          text: '操作指南 · How-to',
          collapsed: false,
          items: [
            { text: '指南索引', link: '/how-to/' },
            { text: '只部署 monorepo 里的一个子项目', link: '/how-to/deploy-one-subproject' },
            { text: '配置自动重启', link: '/how-to/configure-restart' },
            { text: '处理 build/libs 里的多份产物', link: '/how-to/handle-many-jars' },
            { text: '可选依赖还没构建', link: '/how-to/optional-dependencies' },
            { text: '清理配置里已删除的残留 jar', link: '/how-to/clean-stale-jars' },
            { text: '部署了但服务器没变，怎么查', link: '/how-to/diagnose-not-updating' },
            { text: '管理实例生命周期', link: '/how-to/manage-instances' },
            { text: '管理 JDK', link: '/how-to/manage-jdk' },
            { text: '在 CI 里使用', link: '/how-to/use-in-ci' },
            { text: '从 run 迁移到 mcsdev.yml', link: '/how-to/migrate-from-run' },
          ],
        },
        {
          text: '理解 · Explanation',
          collapsed: false,
          items: [
            { text: '理解索引', link: '/explanation/' },
            { text: '为什么是 link 模式，而不是自己管服务器', link: '/explanation/why-link-mode' },
            { text: '为什么 clean 默认是 true', link: '/explanation/why-clean-default-true' },
            { text: '为什么用 sha256 判等而不是 mtime', link: '/explanation/why-sha256-not-mtime' },
            { text: '为什么重启而不是热重载', link: '/explanation/why-restart-not-hot-reload' },
            { text: '为什么用声明式配置', link: '/explanation/why-declarative' },
            { text: '边界与非目标', link: '/explanation/scope-and-non-goals' },
          ],
        },
        {
          text: '参考 · Reference',
          collapsed: false,
          items: [
            { text: '参考索引', link: '/reference/' },
            { text: '命令行总览', link: '/reference/cli/' },
            { text: 'mcsdev.yml 字段', link: '/reference/mcsdev-yml' },
            { text: '文件与目录', link: '/reference/files' },
            { text: '环境变量', link: '/reference/env' },
          ],
        },
        {
          text: '命令参考',
          collapsed: true,
          items: [
            { text: 'init', link: '/reference/cli/init' },
            { text: 'config', link: '/reference/cli/config' },
            { text: 'ps', link: '/reference/cli/ps' },
            { text: 'deploy', link: '/reference/cli/deploy' },
            { text: 'dev', link: '/reference/cli/dev' },
            { text: 'prune', link: '/reference/cli/prune' },
            { text: 'exec', link: '/reference/cli/exec' },
            { text: 'setup', link: '/reference/cli/setup' },
            { text: 'new', link: '/reference/cli/new' },
            { text: 'run', link: '/reference/cli/run' },
            { text: 'ls', link: '/reference/cli/ls' },
            { text: 'java', link: '/reference/cli/java' },
            { text: 'start / stop / restart / logs / rebuild / reset', link: '/reference/cli/lifecycle' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
      options: {
        miniSearch: {
          options: {
            tokenize,
            processTerm: (term: string) => term.toLowerCase(),
          },
          searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: { title: 4, text: 2, titles: 1 },
          },
        },
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档',
          },
          modal: {
            noResultsText: '没有匹配结果',
            resetButtonTitle: '清除条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    lastUpdated: { text: '最后更新于' },

    footer: {
      message: 'mcsdev · MIT License',
      copyright: '文档按 Diátaxis 组织',
    },
  },
})
