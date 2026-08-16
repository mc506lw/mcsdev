# mcsdev 设计文档 v2

Minecraft 插件开发辅助工具 —— 把"构建产物 → 测试服启动 → 验证"变成一条命令。

> 状态：设计草案 v2（2026 年修订，整合 setup / java / new / run 交互模型）
> 名称：**mcsdev**（Minecraft Server Dev）。npm 包名已确认可用（`mcsdev` / `mcsdev-cli` / `@mcsdev/cli` 均 0 占用，2026 核查）。占位包 v0.0.1 已备好（README + 占位 bin，见仓库根 `package.json` / `README.md`），**待 npm 登录后执行 `npm publish` 即完成占位**。
> 形态：本地 CLI 工具（**不是**服务器插件，**不是**运维面板）

---

## 1. 背景与问题

### 1.1 痛点

Minecraft 插件开发缺少一款"持续、方便地测试"的工具。开发者的日常循环是：

```
改代码 → 构建 → 部署到服务器 → 重启服务器 → 看日志 → 再改
```

其中"部署 → 重启 → 看日志"每一步都是手动操作，循环断裂，验证成本高。

### 1.2 现有方案盘点

| 方案 | 做什么 | 问题 |
|---|---|---|
| `gradlew runServer`（paperweight / loom） | IDE/命令行起测试服 | 每次改代码要手动重启，无闭环 |
| PlugMan / `/reload` | 游戏内热重载插件 | 类加载器不清理、状态残留、易崩，Paper 官方不推荐 |
| JVM HotSwap / HotSwapAgent | 方法体热替换 | 对插件类加载器支持差，不实用 |
| MockBukkit | JUnit 里 mock Bukkit API | 测不了真实 tick / 实体 / 世界 |
| paper-test-lib | 真实服务器上跑集成测试 | 配置门槛高，定位 CI，不是日常循环 |
| Docker / MCSManager / Pterodactyl | 部署运维 | 面向生产部署，不是开发验证 |
| 自写 RCON 脚本 | 构建→复制 jar→RCON 发重启 | 思路正确，但配置复杂、要开多个软件 |

### 1.3 缺口

1. **没有一体化闭环**：现有工具各管一个环节，没有把"构建产物 → 选实例 → 启动/重启 → 日志"做成开箱即用的体验。
2. **没有环境管理**：JDK 版本、服务器实例、配置默认值散落在各处，每个项目都要重新折腾一遍。
3. **没有可复用的测试实例**：要么临时起一个服务器，要么面向生产部署，没有"开发者专用的、可持久复用的测试实例"概念。

### 1.4 已验证的经验

用户此前用"Gradle 构建 → 复制 jar → Python 服务 + RCON 重启"跑通过整个闭环，证明：

- **"重启"而非"热重载"是正确路线**：Paper 冷启动仅几秒，重启干净可靠；热重载换来玄学 bug。
- 真正的痛点是**配置复杂 + 软件太多**，不是闭环模式本身。
- 后续原型验证：**交互式选择 + 记住选择**（先问用哪个实例、哪个 jar，之后默认沿用）能显著降低日常摩擦——这是 v2 的核心交互模型。

---

## 2. 产品定位

**一句话**：mcsdev 是"终端里的开发者测试服环境"——一条命令完成"构建产物 → 选定实例 → 启动/重启 → 日志回流"，并内置 JDK 与实例管理。

**定位类比**：

- **fnm 之于 Node** —— mcsdev 管理本机 JDK（扫描、选择、按实例绑定）；
- **git config 之于配置** —— 全局默认设置 + 实例覆盖，两级继承；
- **docker 之于实例** —— 实例是持久资产，按名字引用、可复用、可打包。

**目标用户**：Bukkit / Paper / Folia 系插件开发者（个人、中小团队、开源插件作者）。

**明确不做（非目标）**：

- 不是服务器插件（不进服运行）
- 不是运维面板：**守线标准 = 本地、单用户、终端优先、围绕"构建 → 验证"闭环**；不做多用户、Web UI、备份调度、端口转发、远程管理
- MVP 不做热重载（重启更可靠，见 1.4）
- MVP 不支持 Fabric / Forge（路线图见 §10）

**设计原则**：

1. **记忆优先**：选择只问一次，之后默认沿用；产物集合变了才重新问。
2. **无歧义零提示**：只有一个候选时直接执行，不弹任何选择框。
3. **实例是持久资产**：可复用、可重置、可打包分享。
4. **一个终端窗口就是全部**：不增加"要开的软件"数量。
5. **环境事实显式管理，偏好默认值兜底**：不靠猜测，能问就列出来选，能默认就不问。

---

## 3. 核心概念：实例与全局注册表

### 3.1 实例（Instance）

> **实例** = 一个自包含目录，包含服务器本体、配置、世界、插件、日志与描述自身的元数据。实例创建在 setup 时指定的**服务器根路径**下，实例名、版本、核心类型均由 `mcsdev new` 向导确定。

实例的四个特性：

1. **可复用**：世界、数据、配置跨重启保留，能测"进服、存数据、重启后仍在"的持久化场景；要重置时显式执行 `mcsdev reset`。
2. **按版本隔离**：一个实例绑定一个 MC 版本 + 一种核心（paper / folia）；同一项目可开多个版本实例做矩阵测试。
3. **自包含**：整个实例就是一个目录，可备份、复制、删除、**打包发给别人复现 bug**。
4. **配置继承**：实例配置 = 全局默认设置 + 实例覆盖（见 §4）。

### 3.2 全局注册表（按版本索引）

实例由**全局注册表**统一索引，`mcsdev run 1.20.1` 时按版本过滤候选：

```
~/.mcsdev/instances.json
# [ { name: "papertest", mcVersion: "1.20.1", core: "paper", dir: "<root>/papertest", javaVersion: 21 }, ... ]
```

- 实例名全局唯一，命令用名字引用（`mcsdev run` 的候选列表、`mcsdev stop papertest`）。
- 版本是第一维 key：`run 1.20.1` 只列出 `mcVersion == 1.20.1` 的实例；没有则引导 `new`。
- 注册表由工具维护，用户不手改（手改的入口是 `mcsdev ls` / `mcsdev rename`，v0.2）。

### 3.3 目录结构

```
~/.mcsdev/                    # 全局配置目录
├── config.json               # 全局默认设置（setup / mcsdev config 维护）
├── java.json                 # JDK 注册表 + 默认 JDK
├── instances.json            # 实例索引（名字 → 路径 / 版本 / 核心 / JDK）
└── run-memory.json           # run 选择记忆（见 §5.5）

<root>/papertest/             # 实例目录（服务器根路径下，setup 时指定）
├── mcsdev.json               # 实例元数据（自动生成，含实例级配置覆盖）
├── server.jar                # 自动下载的 Paper/Folia 服务器
├── eula.txt                  # 自动生成并同意（日志中提示）
├── server.properties         # 由配置派生生成（rebuild 可重生成）
├── plugins/
│   └── goodplugin-1.0.0-all.jar   # 构建产物部署到此
├── world/                    # 可复用世界：跨重启保留
└── logs/
    └── latest.log
```

---

## 4. 配置继承层级

```
全局默认设置（~/.mcsdev/config.json）
        │  new 时询问"是否使用全局配置"
        ▼
实例配置（<root>/<实例>/mcsdev.json，仅存覆盖项）
        │  mcsdev rebuild <实例>
        ▼
派生文件（server.properties / eula.txt / 启动参数）
```

| 配置项 | 全局默认 | 实例可覆盖 | 说明 |
|---|---|---|---|
| 世界类型 | `normal`（普通） | ✅ | 超平坦 / 普通 / 空世界 |
| 维度 | 末地 ✅ 地狱 ✅ | ✅ | 是否生成对应维度 |
| online-mode | setup 时询问（默认 `false`） | ✅ | 默认关闭方便本地，日志提示安全性 |
| spawn-protection | `0` | ✅ | 测试命令 / 破坏不被保护 |
| enable-command-block | `true` | ✅ | 测试命令方块 |
| 端口 | `25565` 或自动偏移 | ✅ | 冲突自动 +1 |
| 内存 | 自动（默认 2G） | ✅ | 按本机调整 |
| JDK | 默认 JDK | ✅ | 从 JDK 注册表选择 |

规则：

- **环境事实**（JDK、根路径）→ setup / `mcsdev java` 显式管理，**不做自动猜测**。
- **偏好类**（世界类型、维度）→ 全局默认值兜底，用户不感兴趣就永远不问；`new` 时想改再覆盖。
- **有安全含义的**（online-mode）→ setup 时显式询问一次并提示，之后沿用默认。
- `rebuild` 只重新生成派生文件，**永不触碰 world/ 与 plugins/**（幂等）。

---

## 5. 交互模型

### 5.1 命令总览

| 命令 | 作用 |
|---|---|
| `mcsdev setup` | 首次环境配置：JDK 扫描 + 服务器根路径 + 少量偏好 |
| `mcsdev java` | JDK 环境管理（扫描 / 列表 / 选择默认 / 按实例绑定，安装见 v0.2） |
| `mcsdev new` | 创建实例（向导：名称 → 核心 → 版本 → 全局配置？） |
| `mcsdev run [版本]` | **核心命令**：记忆式选择实例与 jar → 启动/重启 → 日志回流 |
| `mcsdev rebuild <实例>` | 从配置重新生成派生文件 |
| `mcsdev ls` | 列出全部实例（可按版本过滤） |
| `mcsdev start / stop / restart <实例>` | 手动管理实例生命周期 |
| `mcsdev reset <实例>` | 重置实例到初始状态（清世界、恢复默认配置） |
| `mcsdev logs <实例>` | 查看实例日志 |

### 5.2 `mcsdev setup`（首次配置，5 分钟内完成）

1. **JDK 自动扫描**（非交互）：扫描 `JAVA_HOME`、PATH、Windows `C:\Program Files\Java` 等、macOS `/Library/Java/JavaVirtualMachines` 与 Homebrew、Linux `/usr/lib/jvm`、SDKMAN、Gradle toolchain 缓存；结果写入 `~/.mcsdev/java.json`，列出全部发现并标注版本。
2. **选择默认 JDK**：从扫描结果中选一个（建议：项目最常用版本）。
3. **服务器根路径**：要求填写**空路径**（默认建议 `<当前项目>/.tmp` —— 测试服实例的临时目录，gitignore），所有实例创建于此。
4. **偏好（可全部跳过，有默认值）**：只问有安全含义的 **online-mode**；世界类型 / 维度等留默认，需要时在 `new` 或 `mcsdev config` 改。

> 设计取舍：**偏好类问题懒问**——setup 时开发者往往还没有答案，一路回车会磨损第一印象。setup 只收环境事实，偏好默认值兜底。

### 5.3 `mcsdev java`（JDK 管理）

```
mcsdev java            # 列出 JDK 注册表，当前默认打标
mcsdev java scan       # 重新扫描
mcsdev java use <id>   # 设置默认 JDK
mcsdev java use <id> --instance papertest   # 绑定到具体实例（写入实例配置）
mcsdev java install <version>   # 可选，v0.2：下载 Temurin 等发行版
```

- 实例绑定 JDK 后，`run` 启动前校验兼容性（Paper 1.20.5+ 需要 Java 21，不满足给出明确提示）。
- 这一设计把"探测项目用哪个 JDK"的难题（Gradle toolchain、daemon JVM）**显式化**：不猜，用户说了算。

### 5.4 `mcsdev new`（实例向导）

```
mcsdev new
  1. 名称 / ID        → papertest、foliatest、my-plugin-1.20.4 ...
  2. 核心             → paper（默认）/ folia
  3. 版本             → 从 Paper / Folia Downloads API 拉取可用版本列表，交互选择
  4. 使用全局配置？    → 是：跳过；否：逐个问世界类型 / 维度 / online-mode / 端口 / 内存
  5. 创建             → 下载 server.jar → 生成 eula / server.properties → 注册到 instances.json
```

- 版本选择器可标注"与当前目录项目的 API 依赖匹配"（见 §6），匹配项置顶。
- 创建完成后提示：`mcsdev run <版本>` 即可使用。

### 5.5 `mcsdev run [版本]`（记忆式启动 —— 核心命令）

**决策流程**：

```
mcsdev run 1.20.1
   │
   ├─ 查记忆（run-memory.json）
   │    键 = (mcVersion, build/libs 文件集合指纹)
   │    ├─ 命中 → {实例, jar} 直接用，零提示
   │    └─ 未命中 → 选择流程 ↓
   │
   ├─ 选实例：该版本下的实例列表
   │    ├─ 0 个 → 引导 mcsdev new（"new" 即选择项之一）
   │    ├─ 1 个 → 直接选，不弹
   │    └─ 多个 → 交互弹选（如 papertest / foliatest / new）
   │
   ├─ 选 jar：当前项目构建产物（build/libs/*.jar）
   │    ├─ 0 个 → 提示先 gradlew build
   │    ├─ 1 个 → 直接选，不弹
   │    └─ 多个 → 交互弹选（如 goodplugin-1.0.0-all.jar / goodplugin-1.0.0.jar）
   │
   ├─ 写入记忆（键如上）→ 默认沿用
   │
   └─ 启动/重启实例 → 日志回流（stdout 直读，ANSI 着色）
```

**记忆规则（精确语义）**：

- 记忆键 = `(mcVersion, build/libs 文件集合：文件名 + 大小 + 修改时间)`。
- **jar 内容变了但文件名没变 → 不失效**：重新构建同名 jar 正是最想直接部署的场景。
- 出现新 jar / 少了一个 / 文件名或时间戳变化 → 键变化，重新弹选。
- 用户可用 `mcsdev run --forget` 清除记忆（v0.2）。

**版本参数可省略**：不带版本时，若当前目录可探测到项目（§6）则用探测版本，否则列出所有版本选择。

### 5.6 `rebuild` 与生命周期

- `mcsdev rebuild <实例>`：按实例配置重新生成 `server.properties` / `eula.txt` / 启动参数，幂等，不碰 world/ 与 plugins/；可选 `--restart`。
- 生命周期：`init（new 创建）→ run / start / stop / restart → reset → rm（删除，v0.2）`。

---

## 6. 项目适配（best-effort，非承诺）

`run` 需要知道"当前项目的构建产物在哪"，采用**尽力而为探测**，探测不到就提示用户指定：

1. 识别 Gradle 项目（`build.gradle` / `build.gradle.kts`），产物目录默认 `build/libs/`。
2. 读取 `plugin.yml` / `fabric.mod.json` 得到插件名、主类、版本（`--mc-version` 可显式覆盖）。
3. MC 版本从依赖推断（paper-api / paperweight userdev / version catalog），**失败不阻塞**——版本由 `run` 参数或 `new` 向导决定，探测只用于"匹配项置顶"。

> 定位说明：mcsdev **不为"适配任意项目"负责**（那是 v1 设计的最大复杂度来源）。它优先服务"用 `new` 创建实例 + `run` 启动"的自有流程；对任意已有项目只做 best-effort 适配，探测失败永远有手动的兜底路径。

---

## 7. 服务器进程管理：去掉 RCON

mcsdev **自己把服务器作为子进程拉起**，进程控制取代网络协议：

| 旧方案 | mcsdev |
|---|---|
| 手动起服务器 | 工具拉起并托管子进程 |
| 配 RCON 端口 / 密码 | 直接向子进程 stdin 发命令（如 `stop`） |
| 复制 jar 后靠 RCON 通知 | 复制 jar → 杀子进程 → 重新拉起 |
| 日志另开软件看 | 直读子进程 stdout，天然 ANSI 彩色 |

技术要点：

- 优雅停止：优先 stdin 发 `stop`，超时（如 10s）再强杀。
- 异常退出：检测非零退出码，高亮日志并给出常见原因提示。
- Ctrl+C：向整个进程树发送信号，清理孤儿进程（Windows 需 `taskkill /T`，**v0.1 必做**）。
- 重启期间：构建产物先复制到临时位置，原子替换，避免写到一半被杀。

---

## 8. 日志体验

- ANSI 着色（按级别：INFO / WARN / ERROR）。
- 错误与异常堆栈高亮、可折叠。
- 常见错误解析提示：如依赖缺失（`NoClassDefFoundError`）、主类写错、`plugin.yml` 格式错误等，给出下一步建议。
- 实时写入 `logs/latest.log`，`mcsdev logs` 可回看。
- `--quiet` / `--verbose` 控制粒度。

---

## 9. 技术栈与项目结构

**技术栈**：Node.js + TypeScript。

理由：生态最全（文件 watch、子进程、交互式选择都有成熟库）；跨平台分发好（bun 可编译单文件）；社区开源工具的主流选择之一。

**候选依赖**（MVP 从简，不引入过重框架）：

- CLI 解析：`commander` 或手写轻量解析
- 交互选择：`clack/prompts`（弹选 / 确认 / 版本列表）
- 文件 watch：`chokidar`（v0.3 `dev` 用）
- 子进程：Node 内置 `child_process`（`spawn`）
- HTTP 下载：`undici`（Node 内置 fetch）
- 着色：`picocolors`

**项目结构**：

```
mcsdev/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts                  # 入口：命令分发
│   ├── commands/
│   │   ├── setup.ts            # 首次环境配置
│   │   ├── java.ts             # JDK 管理
│   │   ├── new.ts              # 实例向导
│   │   ├── run.ts              # 记忆式启动/重启
│   │   ├── rebuild.ts          # 派生文件重生成
│   │   ├── ls.ts / start.ts / stop.ts / restart.ts / reset.ts / logs.ts
│   ├── core/
│   │   ├── config.ts           # 全局/实例配置读写与继承合并
│   │   ├── registry.ts         # 实例注册表（按版本索引）
│   │   ├── java.ts             # JDK 扫描、注册表、绑定与校验
│   │   ├── instance.ts         # 实例模型：创建、元数据、目录布局
│   │   ├── server.ts           # 服务器子进程管理（spawn / stdin / kill / 日志流）
│   │   ├── download.ts         # Paper / Folia Downloads API 下载 server jar
│   │   ├── probe.ts            # 项目探测（best-effort，见 §6）
│   │   ├── builder.ts          # 调用 gradle 构建（v0.3 dev 用）
│   │   ├── memory.ts           # run 选择记忆（指纹键，见 §5.5）
│   │   └── deploy.ts           # 产物复制与原子替换
│   └── ui/
│       ├── prompts.ts          # 交互选择封装
│       └── log.ts              # 着色 / 折叠 / 常见错误提示
├── test/                       # 单元测试（配置合并、注册表、记忆键、部署逻辑）
└── DESIGN.md
```

**测试策略**：核心逻辑（配置继承、注册表、记忆键、部署、进程管理）用单元测试覆盖，可 mock 文件系统与子进程；不依赖真实 MC 服务器的部分优先测。

---

## 10. 路线图

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| **v0.1 MVP** | `setup`（极简）+ `new`（向导）+ `run`（记忆式）+ `stop / logs / ls` + Windows 进程树清理 | `gradlew build` 后 `mcsdev run 1.20.1` 全自动启动已有实例；**重复运行零提示**；新实例从零到跑 < 2 分钟；Windows / macOS / Linux 三平台通过 |
| **v0.2** | `java` 完整管理（含 `install`）、`rebuild`、`reset`、`run --forget`、日志错误提示增强 | JDK 管理闭环可用；派生文件重生成幂等；手动管理实例完整可用 |
| **v0.3** | `dev`（watch：源码变化 → 自动构建 → 部署 → 重启）、Folia 兼容校验（`plugin.yml` 的 `folia-supported`）、多插件实例 | 改一行代码到生效 < 30 秒；Folia 不兼容插件启动前给出警告 |
| **v0.4+** | `package`（打包实例复现 bug）、`mcsdev test`（paper-test-lib 集成测试接入）、多实例并行 | 复现场景可用；CI 可用 |

---

## 11. 决策记录（原 v1 开放问题拍板）

| 问题 | 决策 | 理由 |
|---|---|---|
| 实例注册方式 | **全局注册表**（`~/.mcsdev/instances.json`），按 MC 版本索引，命令用名字引用 | `run 1.20.1` 需要跨项目看到 papertest / foliatest（v1 的就地 `mcdev.json` 无法支持） |
| Java 版本策略 | **显式管理**（`setup` 扫描 + `mcsdev java`），不做自动探测猜测 | 消除 v1 "探测 Gradle 用哪个 JDK" 的最大复杂度来源 |
| 偏好类配置（世界类型 / 维度） | 全局默认值兜底，**懒问**；`new` 时可覆盖 | setup 时开发者无答案，问卷磨损第一印象 |
| online-mode 默认值 | setup 显式询问一次（默认 `false`），日志提示安全性 | 有安全含义，需要知情同意，但不重复问 |
| run 的选择记忆 | 键 = `(版本, build/libs 文件集合指纹)`；同名 jar 重构建不失效 | 匹配"重新构建后直接部署"的真实意图 |
| 多实例并行 `dev` | 允许（端口自动偏移），v0.4 | 主要约束是构建目录冲突 |
| 分发方式 | npm 包 + bun 单文件，v0.1 定 | 单文件对社区开源体验最好 |
| 面板边界 | 本地 / 单用户 / 终端优先 / 围绕构建验证闭环 | 守住"不是 MCSManager"的定位 |

---

## 12. 成功标准

- **上手成本**：`npm i -g mcsdev` → `setup` → `new`，从零到"实例在跑"不超过 5 分钟，全程无手写配置。
- **循环速度**：`gradlew build` 后 `mcsdev run 1.20.1`，已配置实例启动 < 10 秒（不含首次下载）；重复运行零问答。
- **软件数量**：开发验证只需一个终端窗口。
- **环境可控**：JDK 版本一目了然，按实例绑定，启动前校验。
- **可复用**：世界与数据跨重启保留；`reset` 一键回到初始态。
- **可分享**：实例可打包，bug 复现不再靠口述。
