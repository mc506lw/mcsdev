# mcsdev.yml 字段参考

`mcsdev.yml` 是声明式配置文件（declarative configuration）：它描述「这个插件项目用哪台测试服、产物从哪来、怎么部署、怎么重启」，由 `mcsdev init` 生成，应该提交进 git。

## 文件位置与查找规则

- 文件名：`mcsdev.yml` 或 `mcsdev.yaml`（两者都认，同名时 `mcsdev.yml` 优先）。
- 查找方式：从当前工作目录**向上最多 8 层**。
- 所有相对路径以 **yml 文件所在目录**为基准，不是以你的当前目录为基准。

在子目录里跑命令会用上层的 yml，并且会明确提示：

```
⚠ 当前在子目录，使用的是上层的 mcsdev.yml（在 E:\dev\pylon）
```

## 最小可用示例

```yaml
version: 1
name: my-plugin
link: 'E:\Minecraft\开发\Pylon开发'
plugins:
  - build/libs/MyPlugin-*.jar
```

`plugins` 支持字符串简写（等价于只写 `path`）。

## 完整示例

```yaml
version: 1
name: pylon

# ---- 目标：link 与 server 二选一 ----
link: 'E:\Minecraft\开发\Pylon开发'
# 或者自建：
# server:
#   core: paper            # paper（默认）/ folia
#   mc: 1.20.4             # 必填
#   memory: 2G
#   java: 'C:\...\java.exe'
#   port: 25565
#   online-mode: false
# world:
#   type: void             # normal（默认）/ flat / void
#   nether: false
#   end: false

plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
    exclude: ['*-all.jar']
    clean: true
    required: true
    newest: true

  - id: cable
    path: Lapis-Cable/build/libs/Lapis-Cable-*.jar
    rename: LapisCable.jar

restart:
  type: command            # mcsdev / http / command / none
  run: ./restart-dev-server.sh
  timeoutMs: 180000

dev:
  watch: true
  debounce: 800
  extraWatch: ['resources']
  build: './gradlew build -x test'
  sources: ['src/main/java']

rcon:
  host: 127.0.0.1
  port: 25575
  password: your-rcon-password
```

## 顶层字段

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `version` | 整数 | 是 | — | 必须是 `1`，其他值直接报错 |
| `name` | 字符串 | 是 | — | 项目名，用作实例名/容器名 |
| `link` | 字符串 | 二选一 | — | 绑定已有服务器：实例名或服务器目录 |
| `server` | 映射 | 二选一 | — | 让 mcsdev 自建服务器 |
| `world` | 映射 | 否 | 见下 | 只在 `server` 模式下有意义 |
| `plugins` | 数组 | 是 | — | 非空，每个元素是一个产物来源 |
| `restart` | 映射 | 否 | 见下 | 部署后怎么重启 |
| `dev` | 映射 | 否 | 见下 | `dev` 命令的行为 |
| `rcon` | 映射 | 否 | 见下 | `exec` 命令用的 RCON 连接 |
| `host` | 字符串 | 否 | 见下 | 重启后就绪探测连哪台机器 |
| `config` | 映射 | 否 | — | **未实现**，写了会报错 |
| `configApply` | 布尔 | 否 | `false` | **未实现**，写成 `true` 会报错 |
| `onStart` | 字符串数组 | 否 | — | **未实现**，写了会报错 |

## `version`

必须正好是 `1`。不是「≥1」，是「等于 1」：

```
✖ mcsdev.yml 的 version 必须是 1（当前：2）
```

## `name`

必填，非空字符串。用作实例名或容器目录名。

## `link` 与 `server`：二选一

两个都写或都不写都会报错：

```
✖ link 与 server 只能二选一：link 绑定已有实例，server 让 mcsdev 自建
✖ 必须写 link（绑定已有实例）或 server（自建容器）之一
```

### `link`

值是两种东西之一，解析顺序是固定的：

1. **已注册的 mcsdev 实例名**（`~/.mcsdev/instances.json` 里有）→ 用实例的目录，且标记为「mcsdev 管理」；
2. **目录路径**（含 `/` 或 `\`，或是绝对路径）→ 必须是已存在的目录，标记为「外部目录」；
3. 都不是 → 报错。

```
✖ link 指向的目录不存在：E:\Minecraft\开发\不存在
✖ link 既不是已注册的 mcsdev 实例（foo），也不是存在的目录。外部服务器请直接写目录路径
```

Windows 路径建议用单引号（YAML 单引号内反斜杠不转义）：

```yaml
link: 'E:\Minecraft\开发\Pylon开发'
```

### 环境变量

`link`（路径形式）和 `plugins[].path` 都支持环境变量展开，`${VAR}` 与 `$VAR` 两种写法都可以：

```yaml
link: '${MCSDEV_SERVER}'
plugins:
  - path: '$BUILD_ROOT/MyPlugin-*.jar'
```

**未定义的环境变量保留原样**，不会变成空串 —— 这样报错时你能看到 `${MCSDEV_SERVER}`，而不是一个悄悄指向别处的空路径：

```
✖ link 指向的目录不存在：E:\dev\${MCSDEV_SERVER}
```

注意 `link` 写成**实例名**时不做展开（实例名是注册表里的字面 key），只有路径形式才会展开。

`link` 决定两件重要的事：

- **jar 往哪放**：`<link 目录>/plugins/`；
- **默认重启策略**：指向实例 → `mcsdev`；指向外部目录 → `none`。

外部目录还会做一次合理性检查（不阻断，只警告）：

```
⚠ link 目录里没有 server.properties —— 这可能不是 Minecraft 服务器目录（E:\...）
⚠ link 指向外部服务器（E:\...），默认只部署不重启。要自动重启请配 restart（http 或 command）
```

### `server`

```yaml
server:
  core: paper
  mc: 1.20.4
  memory: 2G
  java: 'C:\Program Files\Eclipse Adoptium\jdk-21\bin\java.exe'
  port: 25565
  online-mode: false
```

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `core` | 字符串 | 否 | `paper` | 小写化处理；可用 `paper` / `folia` |
| `mc` | 字符串 | **是** | — | 如 `1.20.4`，缺失直接报错 |
| `memory` | 字符串 | 否 | 全局偏好（`2G`） | 形如 `2G` / `1024M` |
| `java` | 字符串 | 否 | 全局默认 JDK | java 可执行文件路径 |
| `port` | 整数 | 否 | 全局偏好（`25565`） | 端口冲突会自动偏移 |
| `online-mode` | 布尔 | 否 | 全局偏好（`false`） | 注意是连字符写法 |

自建模式需要先 `mcsdev setup` 指定服务器根路径，否则报错：

```
✖ 自建模式需要先 mcsdev setup 指定服务器根路径
```

实例目录 = `<root>/<name>`。

### `world`

只在 `server` 模式下有意义：

```yaml
world:
  type: void
  nether: false
  end: false
```

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `type` | 枚举 | `normal` | `normal` / `flat` / `void`，其他值报错 |
| `nether` | 布尔 | `true` | 是否生成地狱 |
| `end` | 布尔 | `true` | 是否启用末地。原版 `server.properties` 无法真正禁用末地，mcsdev 会同时写 `bukkit.yml` 的 `settings.allow-end: false` |

## `plugins`

必须是非空数组。每个元素可以是：

- **字符串**：等价于 `{ path: <该字符串> }`；
- **映射**：见下表。

```yaml
plugins:
  - build/libs/Simple-*.jar          # 简写
  - id: pipez                        # 完整写法
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
```

### `plugins` 条目字段

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | 字符串 | **是** | — | 产物 glob，相对 yml 目录；支持 `~`、绝对路径、`../` |
| `id` | 字符串 | 否 | 从 `path` 推导 | 命令里点名用；重复会报错 |
| `exclude` | 字符串数组 | 否 | `[]` | 追加在默认排除之后的文件名 glob |
| `rename` | 字符串 | 否 | 保持原名 | 部署后的目标文件名，**必须以 `.jar` 结尾** |
| `prefix` | 字符串 | 否 | 从 `path` 推导 | 旧版本识别前缀，用于 `clean` |
| `clean` | 布尔 | 否 | `true` | 部署前删掉同前缀旧版本 |
| `required` | 布尔 | 否 | `true` | 匹配不到时是错误（`true`）还是警告（`false`） |
| `newest` | 布尔 | 否 | `true` | 多个匹配时只取最新一个（按版本号，解析不出才按 mtime） |

布尔字段接受 YAML 布尔和字符串形式：`true` / `yes` / `on` / `1` 为真，`false` / `no` / `off` / `0` 为假。

### `path` 的 glob 规则

这是刻意的限制，不是标准 glob：

- **目录部分按字面解析**（支持 `.`、`..`、`~`、绝对路径、`${VAR}` / `$VAR` 环境变量），不做通配；
- **文件名部分支持 `*` 和 `?`**，`*` 不跨目录分隔符；
- 匹配大小写不敏感；
- 结果按文件名排序后返回。

所以 `build/libs/**/*.jar` 不会被当成递归通配 —— 目录部分会按字面去找一个叫 `**` 的目录。真实需求里没有跨目录通配，字面目录更可预测、报错也更清楚。

### 默认排除

无论 `exclude` 写什么，以下后缀总是被排除（匹配 basename，大小写不敏感）：

```
*-sources.jar  *-javadoc.jar  *-dev.jar  *-mojang-mapped.jar  *-plain.jar
```

### `id` 的推导

`id` 不写时从 `path` 推导：取 `path` 文件名部分，去掉第一个 `*` 之后的内容，再去掉结尾的 `.jar`，最后去掉尾部的 `-`。

| `path` | 推导出的 `id` |
| --- | --- |
| `build/libs/Lapis-Pipez-*.jar` | `Lapis-Pipez` |
| `target/MyPlugin-1.0.jar` | `MyPlugin-1.0` |
| `build/libs/*.jar` | `build/libs/*`（基本不可用，建议显式写 `id`） |

**重复的 id 会报错**：

```
✖ plugins 里有重复的 id「pipez」—— 用 id: 显式区分
```

### `newest` 的选择依据

**优先按版本号**：从文件名里解析出 `1.2.5` 这样的版本号（`Foo-1.2.5.jar` → `[1,2,5]`），比较后取版本高的。只有当参与比较的任一方**解析不出版本号**时，才回退到 **mtime**（最后修改时间）降序。

同时打印警告，并说明这次用的是什么依据：

```
⚠ pipez: 命中 41 个，按版本号取最新的 Lapis-Pipez-0.1.59.jar
  （要全装请在 mcsdev.yml 该条目下写 newest: false，不是命令行参数）
```

解析不出版本号时，那行会变成「按修改时间取最新的 …」。

**为什么不是纯 mtime**：Gradle 的 build cache 和 `git checkout` 都会把旧产物还原成更旧的 mtime，此时按时间选会选错版本，而部署阶段又用 sha256 判等说「已是最新」—— 两个判据会在同一套流程里打架。版本号是构建产物的固有属性，不受文件系统时间影响。

版本号相同时（同版本的重复产物）仍回退 mtime，取最近构建的那个。

注意「不是命令行参数」这句：`newest` 只能在 yml 里改，命令行没有对应开关。

### `to`（已移除）

早期版本有一个 `to:` 字段，用于把 jar 放进 `plugins/` 的子目录。它被**移除**了：Bukkit / Paper 只加载 `plugins/` 根目录的 jar，子目录里的文件根本不会被读取 —— 一个只会产生警告的字段不值得存在。

现在写它会直接报错：

```
✖ plugins[0] 的 to: 已移除 —— Bukkit/Paper 只加载 plugins/ 根目录的 jar，子目录里的不会被读取
```

### `prefix` 与 `clean`

`clean: true` 时，部署前会删除目标目录里匹配 `<prefix>*` 的 `.jar` 文件（大小写不敏感），但**跳过本次要部署的同名文件**（那是覆盖，不是清理）。

`prefix` 不写时的推导规则：

| `path` 文件名部分 | 前缀 |
| --- | --- |
| `Lapis-Pipez-*.jar` | `Lapis-Pipez-` |
| `MyPlugin.jar`（无通配） | `MyPlugin` |
| `*.jar`（纯通配） | 空 → **不清理**，并给出警告 |

### 双载检测

如果两个条目产出同前缀的 jar，服务器会把同一个插件加载两次（典型症状：监听器执行两遍）。这种情况是**全局错误**：

```
✖ 双载风险：pipez 与 pipez-legacy 都会产出 Lapis-Pipez-*.jar，两个版本会在 plugins/ 里共存
  —— 服务器会把同一个插件加载两次（典型症状：监听器执行两遍）
```

## `restart`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `type` | 枚举 | 见下 | `mcsdev` / `http` / `command` / `none` |
| `url` | 字符串 | — | `type: http` 时**必填** |
| `run` | 字符串 | — | `type: command` 时**必填** |
| `timeoutMs` | 整数 | `180000` | 命令/请求超时；也约束等待就绪（取 `min(timeoutMs, 120000)`） |

`type` 的默认值由 `link` 推导：

| `link` 指向 | 默认 `type` |
| --- | --- |
| mcsdev 实例 | `mcsdev` |
| 外部目录 | `none` |

四个值的行为：

| 值 | 做什么 |
| --- | --- |
| `none` | 只部署，打印「重启策略 none —— 只部署，不重启」 |
| `http` | GET `url`，2xx 视为接受，然后探测端口 |
| `command` | 执行 `run`（shell），退出码 0 才继续，然后探测端口 |
| `mcsdev` | 停掉实例 → 后台启动 → 探测端口；`link` 不是实例时报错。停止是否优雅取决于谁持有进程句柄，见下 |

### `mcsdev` 的停止方式取决于「谁持有句柄」

| 场景 | 停止方式 | 世界保证 |
| --- | --- | --- |
| `dev` 会话，服务器由本次 `dev` 拉起 | 向 stdin 发 `stop`，等它保存并退出 | 优雅 |
| `dev` 会话，但实例已被外部启动 | 跨进程强杀（Windows `taskkill /T /F`），并警告 | 不保证 |
| 一次性 `mcsdev deploy` | 跨进程强杀 | 不保证 |

原因很直接：优雅停需要往服务器进程的 stdin 写 `stop`，而这只有在**同一个 mcsdev 进程**里 `spawn` 出来的子进程才做得到。`deploy` 是独立进程，只能通过 PID 杀。

端口探测细节见[配置自动重启](/how-to/configure-restart#超时与端口探测)。

## `dev`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `watch` | 布尔 | `true` | `false` 时 `dev` 等同于「跑一轮 deploy 后退出」 |
| `debounce` | 整数 | `800` | 防抖窗口（毫秒），最小值 200，更小的值会被夹到 200 |
| `extraWatch` | 字符串数组 | `[]` | 额外监视的目录（相对 yml）。这些目录里的 **`.jar` 变化**也会触发一轮部署 |
| `build` | 字符串 | — | 源码变化时先执行的构建命令 |
| `sources` | 字符串数组 | `['src/main']` | 源码目录（相对 yml），配了 `build` 才生效 |

`build` 的工作方式（两条独立通道）：

```
源码目录变化 → 防抖 → 执行 build 命令 → （构建写出新 jar）
构建产物变化 → 防抖 → 部署 → 按 restart 策略重启
```

- 构建命令超时 10 分钟；失败时打印输出最后 15 行，`dev` 的退出码最终为 1；
- 构建命令在 **yml 所在目录**执行（工作目录 = `mcsdev.yml` 的目录）；
- `sources` 里的目录不存在时会被跳过；全都不存在会警告：

  ```
  ⚠ 配了 dev.build 但源码目录都不存在（src/main）
  ? 用 dev.sources 指定源码目录，如 sources: ["src/main/java"]
  ```

`extraWatch` 只关心 `.jar` 文件的变化 —— 它的用途是那些「产物不在 `plugins[].path` 覆盖范围内」的场景。

## `rcon`

给 `mcsdev exec` 用。**只有在没有可用 dev 会话时才会用到** —— `dev` 前台托管着服务器时，`exec` 会优先通过本地 IPC 直接写服务器 stdin，不需要 RCON（见 [`exec`](/reference/cli/exec)）。

不配时 mcsdev 会尝试从 `<link 目录>/server.properties` 读。

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `host` | 字符串 | 否 | `127.0.0.1` | RCON 主机 |
| `port` | 整数 | 否 | `25575` | RCON 端口（不是游戏端口） |
| `password` | 字符串 | **是** | — | 对应 `server.properties` 的 `rcon.password` |

```yaml
rcon:
  host: 127.0.0.1
  port: 25575
  password: your-rcon-password
```

服务器端需要在 `server.properties` 里开启：

```properties
enable-rcon=true
rcon.port=25575
rcon.password=your-rcon-password
```

## `host`

重启之后做就绪探测时连哪台机器。默认值按 `link` 推导：

| 情况 | 默认 `host` |
| --- | --- |
| `link` 是 UNC 路径（`\\server\share\...`） | 路径里的 `server` |
| 其它（本地路径 / 实例名） | `127.0.0.1` |

```yaml
host: 192.168.1.20      # 显式指定，覆盖上面的推导
```

端口仍然从 `<link 目录>/server.properties` 的 `server-port` 读。这个字段只影响**探测**，不影响部署 —— 部署永远是写本地路径。

什么时候需要它：`link` 指向网络挂载盘，但探测连的是运行服务器的那台机器（挂载路径里的 server 名不一定是 Minecraft 主机名），或者服务器跑在另一台机器而 `link` 是本地同步目录。

## `config`（未实现）

```yaml
config:            # ← 当前版本写了会报错
  view-distance: 8
```

写了非空的 `config` 会得到：

```
✖ config: 尚未实现 —— 当前版本不会把这些键写进 server.properties。请删掉这一段（等 v0.2）
```

这条错误是**故意的**。`config` 命令的职责是告诉你「这份配置可用」；如果它一边接受未实现的字段、一边什么也不做，你会以为 `view-distance: 8` 生效了。

## `configApply`（未实现）

```yaml
configApply: true      # ← 当前版本写了会报错
```

```
✖ configApply: 尚未实现 —— 当前版本不会 patch 实例配置。请删掉这个字段（等 v0.2）
```

设计意图是「link 模式下是否也 patch 实例配置」，默认 `false`（不碰你手调好的服务器）。因为 `config` 段尚未实现，这个字段也就没有意义 —— 所以它和 `config` / `onStart` 一样，非 `false` 就报错，而不是静默接受。

## `onStart`（未实现）

```yaml
onStart:           # ← 当前版本写了会报错
  - 'say server started'
```

```
✖ onStart: 尚未实现 —— 当前版本不会执行这些命令。请删掉这一段（等 v0.2）
```

想在启动后发命令，用 [`mcsdev exec`](/reference/cli/exec)（有 dev 会话时走 stdin，否则走 RCON）。

## 校验红线汇总

**致命（解析阶段直接抛错，命令退出码 1）**

| 条件 | 报错 |
| --- | --- |
| 顶层不是映射 | `顶层必须是一个映射（key: value）` |
| `version` ≠ 1 | `version 必须是 1（当前：…）` |
| 缺 `name` | `缺少 name（用作实例/容器名）` |
| `link` 与 `server` 同时存在 | `link 与 server 只能二选一` |
| 两者都不存在 | `必须写 link（…）或 server（…）之一` |
| `plugins` 为空或不是数组 | `plugins 必须是非空数组（至少一条产物来源）` |
| 条目缺 `path` | `plugins[i] 缺少 path` |
| `rename` 不以 `.jar` 结尾 | `rename 必须以 .jar 结尾（…）` |
| `world.type` 非法 | `world.type 只能是 normal / flat / void` |
| `restart.type` 非法 | `restart.type 只能是 mcsdev / http / command / none` |
| `type: http` 缺 `url` | `restart.type=http 时必须给 url` |
| `type: command` 缺 `run` | `restart.type=command 时必须给 run` |
| `config` 不是键值映射 | `config 必须是键值映射（如 view-distance: 8）` |
| `dev` 不是映射 | `dev 必须是映射（watch / debounce）` |
| `rcon` 缺 `password` | `rcon.password 必填（对应 server.properties 的 rcon.password）` |
| 条目写了 `to:` | `plugins[i] 的 to: 已移除 —— Bukkit/Paper 只加载 plugins/ 根目录的 jar，子目录里的不会被读取` |

**语义错误（收集后由 `config` / `deploy` / `dev` 报出，退出码 1）**

| 条件 | 说明 |
| --- | --- |
| `link` 指向的目录不存在 / 不是实例 | 见 `link` 小节 |
| 自建模式缺服务器根路径 | 先 `mcsdev setup` |
| 条目 `id` 重复 | 用 `id:` 显式区分 |
| 条目匹配不到产物且 `required: true` | 先构建，或写 `required: false` |
| 双载风险 | 两条目产出同前缀 jar |
| `config` / `configApply` / `onStart` 非空 | 未实现 |

## 相关

- [文件与目录](/reference/files)
- [配置自动重启](/how-to/configure-restart)
- [处理 build/libs 里的多份产物](/how-to/handle-many-jars)
