<!-- LOGO: assets/logo.svg -->

# mcsdev

[![Status](https://img.shields.io/badge/status-v0.1%20prototype-orange?style=flat-square)](https://github.com/mc506lw/mcsdev)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

**终端里的 Minecraft 插件开发者测试服环境**（Minecraft Server Dev）。

给 Bukkit / Paper / Folia / Leaf 插件开发者用：把「改代码 → 构建出 jar → 拷进 `plugins/` → 重启 → 翻日志」这条循环压成一条命令。

```bash
mcsdev dev        # 盯着构建产物，新 jar 自动上服、自动重启、日志跟着滚
```

单机、单用户、终端优先。不是 Web 面板，不是生产运维工具。

> ⚠️ **现状**：v0.1 原型，**只能从源码运行**。npm 上的 `mcsdev` 目前是零功能的名称占位包（详见 [已知限制](#已知限制--known-limitations)）。

## 目录 / Table of contents

- [为什么用它 / Why](#为什么用它--why)
- [快速开始 / Quick start](#快速开始--quick-start)
- [核心概念 / Concepts](#核心概念--concepts)
- [命令速查 / Commands](#命令速查--commands)
- [真实场景 / Real-world example](#真实场景--real-world-example)
- [工作原理 / How it works](#工作原理--how-it-works)
- [目录与状态 / Where things live](#目录与状态--where-things-live)
- [已知限制 / Known limitations](#已知限制--known-limitations)
- [路线图 / Roadmap](#路线图--roadmap)
- [开发 / Development](#开发--development)

## 为什么用它 / Why

插件开发的慢，通常不是慢在写代码，而是慢在这条链路上：

| 现在（手工） | 换成 mcsdev |
|---|---|
| `gradlew build` 之后，在 `build/libs` 里挑出刚生成的那个 jar —— 那里堆着 41 个历史版本 | 按 glob 找产物，默认排除 `-sources` / `-javadoc` / `-dev` / `-plain` / `-mojang-mapped`，只取**最新**一个 |
| 拷进 `plugins/` 忘了删旧版 → 服务器把同一个插件加载两遍 → 开始查「监听器为什么执行了两次」 | 部署前按 jar 前缀清掉历史版本；两条配置产出同一前缀时**直接报错**，不让它发生 |
| 停服 → 拷 → 起服 → 等 30 秒 → 打开 `logs/latest.log` | 重启后轮询端口确认服务器**真的起来了**再返回，日志在前台持续输出 |
| 「我这环境是怎么配的」只在你脑子里，同事 clone 下来跑不起来 | 一份 `mcsdev.yml` 进 git，`mcsdev dev` 复现同样的开发环境 |

它**不做**这些事，免得误会：

- 不重造构建系统：Gradle / Maven 怎么构建还归你管。想要「改源码 → 自动构建 → 自动上服」，在 `dev.build` 里写一条 `gradlew build` 就行（见 [核心概念](#核心概念--concepts)）。
- 不做生产部署、不做权限/多用户、不做 Web 面板。
- 不用 Docker。一个实例就是磁盘上一个自包含目录，你能直接进去翻文件。

## 快速开始 / Quick start

### 环境要求 / Requirements

- **Node.js 20+**（开发机为 22.x）
- **64 位 JDK**：任意发行版（Adoptium / Zulu / Corretto / Microsoft 均可），版本要满足你用的 MC 版本（如 Paper 1.21.x 需要 Java 21+）

### 1. 拿到可运行的程序

npm 上的包还是占位包，**先按源码跑**：

```bash
git clone https://github.com/mc506lw/mcsdev.git
cd mcsdev
npm install
npm run build            # tsc → dist/

npm link                 # 可选：把 mcsdev 装进 PATH，后面就能直接敲 mcsdev
```

不 `npm link` 也可以，把下面的 `mcsdev` 换成 `node <mcsdev仓库目录>/dist/cli.js`。

### 2. 在插件项目里生成配置

```bash
cd <你的插件项目>
mcsdev init --link <你的服务器目录>
```

`init` 会探测你的构建产物（含 monorepo 子项目）和 jar 前缀，生成一份 `mcsdev.yml`。
**如果还没构建过**，先 `./gradlew build` 一次，否则探测不到 `build/libs/*.jar`。

`--link` 指向一台已存在的开发服目录（例如 `D:\Servers\leaf-dev`）时，mcsdev 只往它的 `plugins/` 放东西，**不会改你的 `server.properties`**。

> 本文所有 `<...>` 都是占位符，复制后请替换成你的实际路径（bash 里尖括号会被当成重定向，含空格的路径记得加引号）。

想让它自己建服（下载 Paper、生成世界）就去掉 `--link`，改用 `server:` 段，见 [核心概念](#核心概念--concepts)。

### 3. 核对一遍，再开跑

```bash
mcsdev config            # 产物命中 / 排除 / 部署目标 / 将清理的旧版
mcsdev ps                # 服务器上现在实际装的是什么（只读，不改任何文件）
mcsdev deploy --dry-run  # 预演一次：连 plugins/ 目录都不会建
mcsdev dev               # 满意了就开 watch
```

自建实例（`server:` 而不是 `link:`）第一次要先跑一次 `mcsdev setup`：扫描本机 JDK、指定服务器根路径、确认 `online-mode`。

## 核心概念 / Concepts

### `mcsdev.yml`：把开发环境写进仓库

```yaml
version: 1
name: pylon

# 二选一：绑定一台已有服务器，或让 mcsdev 自己建
link: <你的服务器目录>
# server:
#   core: paper          # paper | folia
#   mc: 1.20.1
#   memory: 2G

plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar

restart:
  type: http             # mcsdev | http | command | none
  url: http://127.0.0.1:25566/restart
```

`plugins` 每条支持的字段：`path` / `exclude` / `rename` / `prefix` / `clean` / `required` / `newest`，语义见 [`src/compose.ts`](src/compose.ts) 顶部注释。`path` 和顶层 `link` 都支持 `${VAR}` / `$VAR` 环境变量（未定义的变量保留原样，便于发现问题）。

几条默认行为值得先知道：

- **增量部署**：内容相同就跳过。**比 sha256，不比 mtime** —— gradle build cache 和 `git checkout` 都会让新产物带着更旧的 mtime。
- **只取最新**：`build/libs` 里堆几十个历史 jar 时只部署一个。判据是**版本号优先**（`Foo-1.2.5.jar` → `[1,2,5]`），解析不出版本号才回退 mtime —— 因为 mtime 会被 build cache 篡改。
- **自动清理旧版**：按 `prefix`（不给就从 `path` 推导）删掉目标目录里的历史版本，避免同插件多版本共存。
- **`.jaroff` 保护**：你手动改名禁用的插件（`Foo-1.0.jaroff`），部署前会警告「这会重新启用它」。
- **删条目要配套 `prune`**：从 `mcsdev.yml` 里删掉一条 entry，`plugins/` 里那个 jar **不会自己消失**（服务器还会继续加载旧版本）。`mcsdev prune` 负责清掉「mcsdev 部署过、当前配置已不再产出」的残留 —— 只删 `.mcsdev-manifest.json` 清单里记录的文件，你手工放进 `plugins/` 的第三方插件永远不动。
- **重启策略可插拔**：`mcsdev`（自己托管、优雅停服）/ `http`（调你现有守护进程的接口）/ `command`（任意命令）/ `none`（只部署不重启）。
- **就绪探针**：重启接口返回 200 只代表「请求被接受」，之后会轮询端口确认服务器真起来了，没起来就报错而不是给个假 ✔。探测目标默认 `127.0.0.1`，`link` 是 UNC 路径（`\\server\share\…`）时自动取其中的主机名，也可以用顶层 `host:` 显式指定。
- **`dev` 有跨进程锁**：两个 `dev` 打同一个服务器会被挡住（`plugins/.mcsdev-dev.lock`），而不是交替部署、交替重启。
- **`--dry-run` 真不写盘**：只打印计划。

### 两个可选段：`dev` 与 `rcon`

```yaml
dev:
  build: gradlew build      # 源码变化先跑构建；不写就只 watch 产物（构建交给 IDE / gradle）
  sources: [src/main]       # 触发构建的源码目录，默认 src/main
  debounce: 800             # 防抖窗口（毫秒），默认 800

rcon:
  password: <你的 rcon 密码>  # mcsdev exec 用；不写则从 link 目录的 server.properties 读
```

`dev.build` 的命令在你运行 `mcsdev dev` 的目录执行（通常就是 `mcsdev.yml` 所在目录），超时 10 分钟。构建失败会明确说「产物没更新，服务器还是旧版本」，不会假装部署成功。

> **monorepo 注意**：`sources` 的默认值 `src/main` 是相对 `mcsdev.yml` 解析的。仓库根目录一般没有 `src/main`，这时源码通道不会生效 —— `dev` 会直接警告「配了 dev.build 但源码目录都不存在」。按下面的[真实场景](#真实场景--real-world-example)把各子项目的 `src/main` 列出来。

### 实例 / Instance

一个实例 = 服务器根路径下的一个自包含目录：服务器本体、配置、世界、插件、日志、元数据。按 MC 版本隔离，可复用。

不需要 `mcsdev.yml` 也能用实例那一套（`setup` / `new` / `run` / `ls`），适合「就想快速起个服扔个 jar 进去试试」。

### `link` 与自建的区别

| | `link` 到已有服务器 | `server:` 自建 |
|---|---|---|
| 服务器本体 | 你自己的（Leaf / Paper / 任何 Paper 系） | mcsdev 下载并按版本缓存 |
| 首次要联网 | 不需要 | 需要（约 50MB / 版本） |
| 改你的 `server.properties` | **不改** | 设计上按键级打补丁（`config:` 尚未实现，写了会报错） |
| 适合 | 团队共用一台开发服、monorepo | 单人、想随时干净重建 |

## 命令速查 / Commands

18 个命令，四组。完整帮助：`mcsdev --help`。

**声明式开发**（项目里有 `mcsdev.yml` 时用这套，日常主力）

| 命令 | 作用 | 常用写法 |
|---|---|---|
| `init` | 生成 `mcsdev.yml`（探测产物与 monorepo 子项目） | `mcsdev init --link <你的服务器目录>` |
| `config` | 打印配置解析结果，不改任何文件 | `mcsdev config --json` |
| `ps` | 只读对比：配置里的条目 vs 服务器上实际装的 jar | `mcsdev ps` |
| `dev` | **watch 构建产物 → 自动部署 → 重启** | `mcsdev dev` / `mcsdev dev pipez` |
| `deploy` | 部署一次就退出（脚本化用） | `mcsdev deploy --dry-run` |
| `prune` | 清掉配置里已删除条目的残留 jar（不碰手工放的插件） | `mcsdev prune --dry-run` |
| `exec` | 给运行中的服务器发命令（dev 会话内走 stdin，否则走 RCON） | `mcsdev exec "reload confirm"` |

`deploy` 选项：`--force`（忽略「已是最新」）、`--dry-run`、`--no-restart`、`[ids...]`。
`dev` 选项：`--dry-run`、`--once`、`--force`、`--interval <ms>`（默认 500）、`[ids...]`。
`prune` 选项：`--dry-run`、`--yes`（跳过确认）。
`exec` 的命令参数**不要带前导 `/`**：`mcsdev exec plugins`、`mcsdev exec "reload confirm"`。

它有两条路径：**dev 会话正在托管服务器**时直接写进服务器 stdin（不需要开 RCON，但服务器输出在 dev 的终端里）；否则走 RCON，会打印服务器响应。

**实例管理**（不用 `mcsdev.yml` 时用这套）

| 命令 | 作用 | 常用写法 |
|---|---|---|
| `setup` | 首次环境配置：JDK 扫描 + 服务器根路径 + 偏好 | `mcsdev setup` |
| `new` | 创建实例（向导：名称 → 核心 → 版本 → 世界/配置） | `mcsdev new --name test1 --core paper --mc-version 1.20.1 --yes` |
| `run` | 记忆式启动：选实例与 jar → 部署 → 启动 → 日志 | `mcsdev run 1.20.1` |
| `ls` | 列出实例与运行状态 | `mcsdev ls` |

`new` 向导里能选：主世界类型（普通 / 超平坦 / **虚空**）、是否启用地狱和末地、`online-mode`、内存（默认 `2G`）。

**生命周期**

| 命令 | 作用 | 常用写法 |
|---|---|---|
| `start` | 后台启动实例 | `mcsdev start test1` |
| `stop` | 停止实例 | `mcsdev stop test1` |
| `restart` | 重启实例 | `mcsdev restart test1` |
| `logs` | 查看日志（服务器原生 `logs/latest.log`） | `mcsdev logs test1 -f` |
| `rebuild` | 重生成 `server.properties` / `eula.txt` | `mcsdev rebuild test1` |
| `reset` | 清 `world/` 与日志，保留 `plugins/` 和 `server.jar` | `mcsdev reset test1` |

这几个命令的实例参数都接受**实例名或 MC 版本号**；有多个候选又没指定时会让你选。

**JDK**

| 命令 | 作用 | 常用写法 |
|---|---|---|
| `java` | 扫描 / 查看 / 绑定 / 校验 JDK | `mcsdev java scan`、`mcsdev java use 2`、`mcsdev java use 2 --instance test1` |

`java scan` 会找 `JAVA_HOME`、`.jdks`、`.sdkman`、`.gradle/jdks`、各家启动器的 runtime、Windows 注册表，以及「同一个父目录下并排放的多个 JDK」这种布局。

`java use <x>` 改的是**全局默认**；加 `--instance <实例名>` 只给那一个实例绑定（写进 `instances.json` 的 `javaBin`），不动全局。

## 真实场景 / Real-world example

一个 monorepo，8 个 Gradle 插件子项目，共用**一台外部的 Leaf 开发服**。开发时只想改完某个插件、立刻在服上验证。

`mcsdev.yml`（实际 8 条 entry，这里只列 3 条）：

```yaml
version: 1
name: pylon

link: <你的服务器目录>          # 外部 Leaf 开发服，mcsdev 不碰它的 server.properties

plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
  - id: customs
    path: Lapis-Customs/build/libs/Lapis-Customs-*.jar
    exclude: ['*-sources.jar', '*-javadoc.jar']
  - id: api
    path: Lapis-API/build/libs/Lapis-API-*.jar
    required: false             # 还没构建过的可选依赖：只警告，不报错

restart:
  type: http
  url: http://127.0.0.1:25566/restart
  timeoutMs: 180000

dev:
  build: gradlew build          # 源码变化先构建（8 个子项目一起；也可写 ./gradlew :Lapis-Pipez:build）
  sources:                      # monorepo 根目录下没有 src/main，必须显式列出要盯的源码目录
    - Lapis-Pipez/src/main
    - Lapis-Customs/src/main
    - Lapis-API/src/main
```

日常命令：

```bash
mcsdev ps                     # 谁落后了
mcsdev dev pipez              # 只盯这一个子项目（watch + 构建 + 部署 + 重启）
mcsdev dev                    # 8 个子项目一起盯
mcsdev exec "reload confirm"  # 改完配置项，走 RCON 重载，比整服重启便宜
mcsdev prune --dry-run        # 删过 entry 之后，看看哪些残留 jar 会被清掉
```

## 工作原理 / How it works

```
mcsdev.yml ─┐
            ├─→ 找产物：glob 命中 → 排除干扰产物 → 只取最新
build/libs ─┘
  │
  ▼
sha256 判等：内容相同就跳过（不看 mtime）
  │
  ▼
先复制新 jar，再删同前缀旧版（顺序不能反）
  │
  ▼
重启：mcsdev | http | command | none
  │
  ▼
轮询端口确认真的起来了 → 日志回流到你的终端
```

`dev` 在这套流程外面加了三件事：产物写入防抖（gradle 写 jar 不是原子的）、重启串行化（重启期间又出新 jar 只保留最后一次）、Ctrl+C 时先优雅停服等世界保存。

配了 `dev.build` 时，最前面多一环：**源码变化 → 跑构建 → 产物更新后进入上面的流程**。两条通道（源码、产物）互不阻塞。

## 目录与状态 / Where things live

```
~/.mcsdev/                  # 全局状态（可用 MCSDEV_HOME 改位置）
├── config.json             # 全局偏好（setup 维护）
├── java.json               # JDK 扫描结果
├── instances.json          # 实例索引（名字 → 路径/版本/核心/端口）
├── run-memory.json         # run 的选择记忆
├── running.json            # 运行中实例的 PID
└── cache/                  # 版本列表(6h) / 构建信息(4h) / server.jar（按 core-version-build）

<服务器根路径>/<实例名>/     # 服务器本体（setup 指定，默认 <项目>/.tmp）
├── server.jar  eula.txt  server.properties  bukkit.yml
├── plugins/                # 构建产物部署到这里
├── world/ …                # 世界跨重启复用
└── logs/  latest.log       # 服务器自带日志；console.log 为原始 stdout
```

环境变量：

| 变量 | 作用 | 默认 |
|---|---|---|
| `MCSDEV_HOME` | 全局状态目录 | `~/.mcsdev` |
| `MCSDEV_PAPER_BASE` | PaperMC API 基地址（镜像 / 代理 / 离线桩） | `https://fill.papermc.io` |

版本列表与 jar 下载走 **PaperMC Fill API v3**（v2 已 410 下线）。网络无法直连时用 `MCSDEV_PAPER_BASE` 指到镜像，仓库里的 `test-stub.js` 提供离线桩。

## 已知限制 / Known limitations

写在这里的都是真实存在的边界，不是「即将支持」的场面话：

- **npm 上仍是占位包**：`mcsdev@0.0.1` 不含任何功能，只用来占住这个名字（npm 不支持预订包名，只能先发布）。首个功能版本会原地替换，包名不变。现在请从源码运行。
- **`config:` / `onStart:` 字段未实现**：`mcsdev.yml` 里写了会**直接报错**，不会静默假装生效。
- **镜像 / 容器分层未做**：每个实例是一份完整的服务器本体，多实例之间不共享那 ~50MB 的 jar 和库。
- **首次建实例需要联网**：要访问 `fill.papermc.io` 下载对应版本（约 50MB / 版本）；之后命中缓存不再下载。`link` 模式不需要。
- **JDK 版本随 MC 版本变**：如 Paper 1.21.x 需要 Java 21+。工具按实例绑定 JDK，启动失败时会提示，但不会替你装 JDK。
- **`stop` 是强杀**：独立命令走 `taskkill /T /F`（POSIX 走 `SIGTERM`→`SIGKILL`），世界可能来不及保存。优雅停止（发 `stop` 等保存）只在 `run` 和前台会话里可用。
- **`exec` 的 RCON 路径需要开 RCON**：`server.properties` 里 `enable-rcon=true` 且有 `rcon.password`，或在 `mcsdev.yml` 写 `rcon:` 段。dev 会话托管服务器时不需要 RCON（走 stdin），但那种情况下服务器输出只出现在 dev 的终端里。
- **`prune` 只认自己的清单**：它只删 `plugins/.mcsdev-manifest.json` 里记录过的文件。**清单为空时不会猜**，直接告诉你无法安全判断。
- **世界相关配置只对新世界生效**：`level-type` / `generator-settings`（如虚空）和 `allow-end` 都是首启播种的，中途改了要 `mcsdev reset` 或删 `world/`。
- **跨平台**：主要开发与验证环境是 Windows 11 + Node 22；POSIX 分支（信号、进程树清理）已实现但**未实测**。

## 路线图 / Roadmap

下面这些**还没做**，列出来是为了让你知道边界在哪，不是承诺日期：

- **`rm` / `inspect`**：删实例、查看实例内部状态（现在只能 `ls` 看列表）。
- **`package`**：把实例连配置带世界打包，用来复现别人的 bug。
- **`java install`**：直接下载 JDK 发行版（现在只扫描、绑定本机已有的）。
- **Folia 完整校验**：`new --core folia` 能建，但对 Folia 的线程模型没有额外检查。
- **镜像 / 容器分层**：让多个实例共享同一份服务器本体（Windows junction / POSIX 符号链接），省磁盘、建实例更快。

## 开发 / Development

```bash
npm install
npm run build            # tsc → dist/
npm run dev -- ls        # 用 tsx 直接跑源码（不用先 build）
npm test                 # node --test：compose / config-patch / java 解析 / memory
```

离线开发（不碰真实 PaperMC API）：

```bash
node test-stub.js 18765
export MCSDEV_PAPER_BASE=http://127.0.0.1:18765   # Windows: $env:MCSDEV_PAPER_BASE="http://127.0.0.1:18765"
```

设计与取舍记录在 [`DESIGN.md`](DESIGN.md)（实例抽象、记忆式 `run`、配置「二次替换」、缓存与声明式配置）。改行为前建议先看一眼那里的「为什么」。欢迎 issue / PR。

## 许可证 / License

[MIT](./LICENSE)
