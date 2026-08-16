# mcsdev

**Minecraft Server Dev** —— 终端里的插件开发者测试服环境。一条命令完成「清理构建 → 部署 → 起服 → 看日志」的改码验证循环。

> GitHub 仓库：[mc506lw/mcsdev](https://github.com/mc506lw/mcsdev)

> ⚠️ **开发中（In Development）**
> npm 上的 `mcsdev@0.0.1` 目前仍是**名称占位包，不包含任何功能**（仅用于在 npm 上保留这个名字，防止抢注）。
> 完整 CLI 原型源码在本仓库 `src/`（TypeScript），首个功能版本发布会原地替换占位包内容（包名保持不变）。
> 动手体验请用下面的"从源码运行"一节。

## 这是什么 / What is this

面向 Bukkit / Paper / Folia 系插件开发者，把"改代码 → 验证"循环压缩成一条命令：

```
构建产物（build/libs/*.jar）
   → mcsdev run 1.20.1
   → 自动选定实例 + jar（记忆式，问过一次不再问）
   → 自动下载/复用 server.jar → 部署到 plugins/ → 启动 / 重启 → 日志回流
```

核心特性：

- **记忆式交互**：实例与 jar 只问一次，之后沿用；构建产物文件集合不变就不再问（`run-memory.json`，键 = MC 版本 + 产物指纹）。
- **实例抽象**：一个实例 = 一个自包含目录（服务器本体、配置、世界、插件、日志、元数据），按 MC 版本隔离，可复用、可打包复现 bug。
- **JDK 显式管理**（`mcsdev java`）：参照 PCL2 思路扫描本机 64 位 JDK（含 `D:\java` 这类同目录多 JDK 的"兄弟目录"扩展、`.jdks`/`.sdkman`、注册表等），按实例绑定，启动前校验。
- **版本感知的配置"二次替换"**：不为每个 MC 版本维护一套模板——Paper 首启会自己生成该版本正确的配置，我们只做**键级补丁**（如 `bukkit.yml` 的 `settings.allow-end` 真正禁用末地），保留版本特有键。
- **本地缓存**：版本列表 / 最新构建信息 / server.jar 按 `core-version-build` 缓存，重复建实例秒级完成。
- **一个终端窗口就是全部**，不增加"要开的软件"数量；本地、单用户、终端优先（不是 Web 面板）。

## 从源码运行 / Run from source

环境要求：Node.js 20+（开发机为 22.x），64 位 JDK（任意发行版，如 Adoptium / Zulu / Corretto / Microsoft）。

```bash
git clone https://github.com/mc506lw/mcsdev.git
cd mcsdev
npm install
npm run build            # tsc → dist/
npm run dev -- setup     # 或 node dist/cli.js setup
```

`setup` 会做三件事：

1. **扫描本机 JDK**并选默认（`mcsdev java scan` 可重新扫描）
2. **指定服务器根路径**（默认 `<当前项目>/.tmp`，即"放测试服的临时目录"，已 gitignore）
3. 确认 **online-mode**（本地测试默认关闭，离线模式仅限本地，勿用于公网）

> 网络说明：版本列表 / 下载走 **PaperMC Fill API v3**（`https://fill.papermc.io`，v2 已 410 下线）。
> 若你的网络无法直连，可用环境变量 `MCSDEV_PAPER_BASE` 指向镜像或代理；仓库内 `test-stub.js` 提供离线冒烟桩。

## 命令速查 / Commands

| 命令 | 说明 | 示例 |
|---|---|---|
| `setup` | 首次环境配置（JDK 扫描 + 根路径 + online-mode） | `mcsdev setup` |
| `java scan` / `list` / `use` / `validate` | JDK 管理：扫描、查看、绑定默认、校验单个 | `mcsdev java use 2` |
| `new` | 创建实例向导：名称 → 核心（paper/folia）→ 版本 → 配置 | `mcsdev new --name t1 --core paper --mc-version 1.20.1 --yes` |
| `run [版本]` | **记忆式启动**：选实例与 jar → 部署 → 启动/重启 → 前台日志 | `mcsdev run 1.20.1` |
| `ls` | 列出实例与运行状态 | `mcsdev ls` |
| `start` / `stop` / `restart` | 后台生命周期（参数可为**实例名或 MC 版本**，缺省多选时交互选择） | `mcsdev start 1.20.1` |
| `logs [-f]` | 查看实例日志（服务器自带 `logs/latest.log`，干净版） | `mcsdev logs test1 -f` |
| `rebuild` | **二次替换**：偏好键级合并进服务器原生配置（保留版本特有键） | `mcsdev rebuild test1` |
| `reset` | 清 world/ 与日志，重置到初始状态（保留 plugins/ 与 server.jar） | `mcsdev reset test1` |

`new` 向导的实例配置项：

- **主世界类型**：普通 / 超平坦 / **虚空**（空世界，`flat` + 空层 + `the_void` 生物群系）
- **启用世界**（多选框）：勾选地狱 / 末地 —— 地狱走 `allow-nether=false`；**末地走 `bukkit.yml` 的 `settings.allow-end=false`**（原版 server.properties 管不了末地，这是真正生效的开关，首次启动前即播种）
- **online-mode**：关闭正版验证（本地测试无需正版账号）
- **内存分配**：默认 2G（如 `2G` / `1024M`）

## 目录与状态 / Where things live

```
~/.mcsdev/                  # 全局配置与状态
├── config.json             # 全局偏好（setup 维护）
├── java.json               # JDK 扫描结果
├── instances.json          # 实例索引（名字 → 路径/版本/核心/端口）
├── run-memory.json         # run 的选择记忆
├── running.json            # 运行中实例的 PID
└── cache/                  # 版本列表(6h) / 构建信息(4h) / server.jar（按 core-version-build）

<root>/<实例名>/            # 服务器根路径（setup 指定，默认 <项目>/.tmp）
├── server.jar  eula.txt  server.properties  bukkit.yml
├── plugins/                # mcsdev run 部署构建产物到这里
├── world/ …                # 世界可跨重启复用
└── logs/  latest.log       # 服务器自带日志；console.log 为原始 stdout
```

## 已知限制 / Known limitations

- **下载依赖网络**：首次建实例需联网访问 fill.papermc.io（约 50MB / 版本），之后命中 jar 缓存不再下载。
- **Java 版本要求随 MC 版本**：如 Paper 1.21.x 需要 Java 21+，1.21.6 起推荐 25；工具按实例绑定 JDK 并在启动失败时给出提示。
- **`stop` 独立命令是强杀**（Windows `taskkill /T /F`，世界可能未保存）；优雅停止（发 `stop` 等待保存）只在 `run` / 前台会话内可用。
- **change point**：`level-type` / `generator-settings`（如虚空）只对**新世界**生效；已有世界的实例需 `reset` 或删 `world/`。
- **`allow-end` 只对新建世界生效**；中途从"开"改"关"后建议 `reset` 一次。

## 开发 / Development

```bash
npm run build          # tsc 编译
npm test               # node --import tsx --test test/*.test.ts
node test-stub.js 18765   # 离线 API 桩；$env:MCSDEV_PAPER_BASE="http://127.0.0.1:18765"
```

设计文档：[`DESIGN.md`](https://github.com/mc506lw/mcsdev/blob/main/DESIGN.md)（v2：实例抽象、记忆式 run、二次替换、缓存与声明）。

## 现状与路线图 / Status & Roadmap

| 项目 | 状态 |
|---|---|
| 设计文档 v2 | ✅ |
| v0.1 原型（全部 11 个命令） | 🚧 源码已入库（`src/`），真实下载/启动/缓存/禁末地均已本机验证 |
| npm 占位包替换为功能版 v0.1 | ⏳ 待定 |
| **v0.2**：`java install`（下载发行版）、`run` 提示增强、Folia 完整校验 | 规划 |
| **v0.3**：`dev`（watch 自动构建 → 部署 → 重启循环） | 规划 |
| **v0.4+**：`package`（实例打包复现 bug）、`test`（集成测试） | 规划 |

## 为什么有占位包 / Why the placeholder exists

npm 不支持"预订"包名，**只有发布之后才能真正持有这个名字**。为了在开发期间防止名称被抢注，先用一个 README-only 的 `0.0.1` 占住 `mcsdev`（包名 3 个候选 `mcsdev` / `mcsdev-cli` / `@mcsdev/cli` 当时均为空）。首个功能版本发布时会用真正的 CLI 原地替换，包名不变。

## 许可证 / License

[MIT](./LICENSE)