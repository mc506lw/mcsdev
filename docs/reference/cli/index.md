# 命令行总览

```
mcsdev <command> [options] [args]
```

- 版本：`mcsdev --version` / `mcsdev -V`
- 帮助：`mcsdev --help`，或 `mcsdev help <command>`，或 `mcsdev <command> --help`

## 全部命令

### 声明式开发（需要 `mcsdev.yml`）

| 命令 | 作用 | 会写盘吗 |
| --- | --- | --- |
| [`init`](/reference/cli/init) | 在当前项目生成 `mcsdev.yml` | 会（写 yml），`--dry-run` 不写 |
| [`config`](/reference/cli/config) | 打印解析结果：命中 / 排除 / 将清理 | 不会 |
| [`ps`](/reference/cli/ps) | 只读状态：服务器上实际装的是什么 | 不会 |
| [`deploy`](/reference/cli/deploy) | 部署一次（不 watch） | 会，`--dry-run` 不写 |
| [`dev`](/reference/cli/dev) | 开发循环：监视 → 部署 → 重启 | 会，`--dry-run` 不写 |
| [`prune`](/reference/cli/prune) | 清理「mcsdev 部署过、但配置已不再产出」的 jar | 会删文件，`--dry-run` 不删 |
| [`exec`](/reference/cli/exec) | 往运行中的服务器发一条命令（有 dev 会话走 stdin，否则走 RCON） | 不改本地文件 |

### 实例管理（不需要 `mcsdev.yml`）

| 命令 | 作用 |
| --- | --- |
| [`setup`](/reference/cli/setup) | 首次环境配置：JDK 扫描 + 服务器根路径 + 偏好 |
| [`new`](/reference/cli/new) | 创建实例（下载 server.jar） |
| [`run`](/reference/cli/run) | 记忆式启动：选实例与 jar → 部署 → 前台启动 |
| [`ls`](/reference/cli/ls) | 列出实例与运行状态 |

### 实例生命周期

| 命令 | 作用 |
| --- | --- |
| [`start`](/reference/cli/lifecycle#start) | 后台启动实例 |
| [`stop`](/reference/cli/lifecycle#stop) | 停止实例（跨进程；Windows 上为强杀） |
| [`restart`](/reference/cli/lifecycle#restart) | 停止 + 启动 |
| [`logs`](/reference/cli/lifecycle#logs) | 查看日志，`-f` 跟踪 |
| [`rebuild`](/reference/cli/lifecycle#rebuild) | 重生成 `server.properties` / `eula.txt` |
| [`reset`](/reference/cli/lifecycle#reset) | 清世界与日志 |

### JDK

| 命令 | 作用 |
| --- | --- |
| [`java`](/reference/cli/java) | `scan` / `list` / `use` / `validate` |

## 全局行为

### 输出与颜色

正常信息走 stdout，错误走 stderr 并以 `✖` 开头，提示以 `→` 开头：

```
✖ 未知工程：pipezz
  ? 可选：pipez, cable, sidedio
```

颜色由 [picocolors](https://github.com/alexeyraspopov/picocolors) 处理，在非 TTY 环境（管道、CI）会自动关闭。

### 退出码

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 任何业务失败（配置错误、产物缺失、复制失败、重启失败、未知 id……） |
| 130 | 被 SIGINT 中断（Ctrl+C） |
| 143 | 被 SIGTERM 中断 |

命令内部用 `process.exitCode = 1` 而不是 `process.exit(1)`，所以已经打印的输出不会被截断。

### Ctrl+C

全局注册了 `SIGINT` / `SIGTERM` 处理：

- 如果当前有 mcsdev 正在**前台托管**的服务器进程（`run`、`dev` 里的 `restart.type: mcsdev`），先向服务器发 `stop` 并等待退出（保存世界），再退出 CLI；
- 否则立即退出。

后台启动的实例（`mcsdev start`）不受影响，它们脱离了父进程。

### 工作目录

大多数命令会在**当前目录向上找 `mcsdev.yml`（最多 8 层）**。所以你在 monorepo 的任意子项目里都能直接用：

```bash
cd Lapis-Pipez
mcsdev ps          # 用的是上层的 mcsdev.yml
```

`init` 例外：它只在当前目录生成/读取，不向上找。

## 典型调用序列

```bash
# 首次
mcsdev init --link "/path/to/server"
mcsdev config

# 日常
mcsdev dev

# 只想部署一次
mcsdev deploy

# 排查
mcsdev ps
mcsdev deploy --dry-run
mcsdev logs -f

# 清理
mcsdev prune --dry-run
mcsdev prune
```
