# `mcsdev dev`

开发循环：监视构建产物 → 自动部署 → 按策略重启。这是日常用的主命令。

```
mcsdev dev [options] [ids...]
```

## 参数

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `[ids...]` | 位置参数 | 全部条目 | 只 watch / 部署指定 id |
| `--dry-run` | 开关 | 关 | 只打印计划，不写目标目录、不重启；跑完一轮即退出（隐含 `--once`） |
| `--once` | 开关 | 关 | 真部署一轮后退出（会写盘；只想预演请配 `--dry-run`） |
| `--force` | 开关 | 关 | 忽略「已是最新」，强制重装 |
| `--interval <ms>` | 数字 | `500` | 轮询间隔（毫秒）。必须为正数，最小夹到 150 |

## 启动阶段

1. 解析配置，打印目标；
2. **全局错误 → 退出 1**；未知 id → 退出 1；被点名条目的错误 → 退出 1；
3. 打印所有警告；
4. 立即执行**第 1 轮（初始部署）**；
5. 如果 `--once`、`--dry-run` 或 `dev.watch: false` → 结束（退出码取决于这一轮是否失败）；
6. 否则进入 watch 模式。

`--dry-run` 会额外打印：

```
⚠ dry-run：只打印计划，不写目标目录、不重启
```

## watch 模式的两条通道

```
通道一：构建产物变化 → 防抖 → 部署 → 重启
通道二：源码变化   → 防抖 → 执行 dev.build 命令（产物更新后由通道一接手）
```

通道二只在配置了 `dev.build` 且 `dev.sources` 目录存在时启用。

启动时打印：

```
✔ 进入 watch 模式
   监视 E:\dev\pylon\Lapis-Pipez\build\libs
   监视 E:\dev\pylon\Lapis-Cable\build\libs
   源码 E:\dev\pylon\src\main
   构建 ./gradlew build -x test
   防抖 800ms · 轮询 500ms · Ctrl+C 退出
```

### 监视哪些目录（通道一）

从每个条目的 `path` 反推目录部分（取最后一个 `/` 之前的部分，相对 yml 目录），加上 `dev.extraWatch`。只关心 `.jar` 文件，且跳过 `-sources` / `-javadoc` / `-dev` / `-mojang-mapped` / `-plain` 这几种干扰产物。

目录不存在时：

```
⚠ 以下目录不存在，不会监视：
   cable: E:\dev\pylon\Lapis-Cable\build\libs
  ? 先构建一次（./gradlew build），或从 mcsdev.yml 里删掉对应条目
```

一个可监视目录都没有 → 报错退出 1。

### 变化检测与防抖

快照 = 每个 jar 的 `目录|文件名|大小|mtime`，排序后拼成字符串。字符串不同即视为变化。

检测到变化后**不立刻动作**，而是等防抖窗口（`dev.debounce`，默认 800ms，最小 200）内不再变化才执行。原因：gradle 写 jar 不是原子操作，立刻复制会拿到半个 jar。

### 并发保护

- 一轮正在跑时又检测到变化 → 记一个「排队」标记，当前轮结束后 50ms 再跑一轮（不会并发重启）；
- 构建正在跑时又检测到源码变化 → 忽略（`building` 标志）。

## 每轮做什么

```
mcsdev 第 2 轮  产物变化
✔ pipez: 部署 Lapis-Pipez-0.1.59.jar
· cable: 已是最新
  ── 1 部署 · 1 已是最新 · 0 失败
```

- 有失败 → 打印「N 条失败 —— 跳过重启，等你修」，不重启；
- 没有任何条目发生变化 → 打印「产物无变化，跳过重启」；
- 有部署 → 按 `restart.type` 重启：
  - `none`：打印「重启策略 none —— 已部署，需要你手动重启服务器」；
  - `mcsdev`：优雅停（持有进程句柄时）/ 强停（实例由外部启动时，会警告世界可能未保存）→ 后台拉起；
  - `http` / `command`：走 [`applyRestart`](/reference/cli/deploy) 的同一套逻辑（含端口探测）；
  - `--dry-run`：只打印「会按 restart.X 重启服务器」。

## 退出码

| 情况 | 退出码 |
| --- | --- |
| `--once` / `--dry-run` / `watch: false` 且这一轮成功 | 0 |
| 配置错误 / 未知 id / 条目错误 | 1 |
| `--once` / `--dry-run` 且这一轮有部署失败或重启失败 | 1 |
| watch 模式被 Ctrl+C 结束，且过程中有过失败 | 1 |
| watch 模式被 Ctrl+C 结束，一切正常 | 0 |

watch 模式不会自己退出 —— 它一直在跑，直到 Ctrl+C。

## Ctrl+C

- 如果 mcsdev 持有服务器进程句柄（`restart.type: mcsdev` 且由本进程拉起）→ 先优雅停服（等世界保存）再退出；
- 否则直接退出，打印 `✔ dev 会话结束`。

## `--dry-run` 与 `--once` 的组合

| 命令 | 行为 |
| --- | --- |
| `dev --dry-run` | 只跑一轮并打印计划，然后退出（隐含 `--once`，**不进入 watch**；不写盘、不重启） |
| `dev --once` | 真部署一轮后退出 |
| `dev --dry-run --once` | 与 `dev --dry-run` 相同（`--once` 是冗余的） |
| `dev --dry-run --once --force` | 预演「如果全部重装会怎样」 |

`--dry-run` 结束时打印：

```
✔ dry-run 结束（未写盘、未重启、未进入 watch）
```

## 已知限制

- **`dev` 不编译**（除非配了 `dev.build`）。没有 `build` 时它监视构建产物，改完代码仍要自己构建；启动时会提示：

  ```
  ⚠ dev 只 watch 构建产物，不负责编译 —— 改完代码记得先构建
  ? 想让它自动构建：在 mcsdev.yml 的 dev 段写 build: "gradlew build"
  ```
- 探测目标默认 `127.0.0.1`（UNC 路径取路径里的 server 名），可用顶层 `host` 覆盖；猜错时表现是「等待就绪超时」，部署本身仍成功。
- 等待就绪期间（最多 120 秒）检测到的变化只能排队，不会并发处理。
- 一次只能有一个 `dev` 会话操作同一个目标目录 —— 见下面的跨进程锁。

## 跨进程锁

`dev` 在进入 watch **之前**取 `<serverDir>/plugins/.mcsdev-dev.lock`。被活着的进程占着就报错退出（退出码 1）：

```
✖ 另一个 mcsdev 正在操作这台服务器（PID 12345，工作目录 E:\dev\pylon，开始于 2026-01-01T00:00:00.000Z）
  ? 先退出那个会话；如果那个进程已经不在了，删掉锁文件重试：E:\...\plugins\.mcsdev-dev.lock
```

- **陈旧锁自动接管**：持有者进程已经死了（或锁文件损坏）时，新的 `dev` 直接接管，不需要手动删；
- 正常退出时删除锁；
- 锁是给 `dev` 用的 —— `deploy` 是短命进程，不取锁。

## 本地 IPC（给 `exec` 用）

`dev` 托管服务器时（`restart.type: mcsdev` 且实例由 mcsdev 管理）会在 `<serverDir>/plugins/.mcsdev-dev.json` 写下本地端口和 pid。`mcsdev exec` 检测到这个文件且 pid 存活时，会通过它把命令写进服务器 stdin，不需要开 RCON。见 [`exec`](/reference/cli/exec)。

## 相关

- [`deploy`](/reference/cli/deploy)
- [`dev` 字段参考](/reference/mcsdev-yml#dev)
- [配置自动重启](/how-to/configure-restart)
