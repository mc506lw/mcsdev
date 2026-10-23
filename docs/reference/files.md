# 文件与目录

mcsdev 涉及三类位置：全局配置目录、实例目录、服务器目录里的 `plugins/`。

## 全局配置目录：`~/.mcsdev/`

Windows 上是 `C:\Users\<你>\.mcsdev\`。可以用环境变量 `MCSDEV_HOME` 整体覆盖（见[环境变量](/reference/env)）。

```
~/.mcsdev/
├── config.json          全局偏好（setup / java use 维护）
├── instances.json       实例注册表（new 维护）
├── java.json            JDK 扫描结果
├── run-memory.json      run 的选择记忆
├── running.json         运行中实例的 PID（start / stop / ls 用）
└── cache/               PaperMC API 与 server.jar 缓存
    ├── versions-paper/list.json
    ├── builds/paper-1.20.4.json
    └── jars/paper-1.20.4-496.jar
```

### `config.json`

```json
{
  "root": "E:\\dev\\mcsdev-servers",
  "defaultJava": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.4.7-hotspot\\bin\\java.exe",
  "prefs": {
    "onlineMode": false,
    "worldType": "normal",
    "allowNether": true,
    "allowEnd": true,
    "motd": "mcsdev test server",
    "memory": "2G",
    "viewDistance": 8,
    "port": 25565
  }
}
```

| 键 | 说明 |
| --- | --- |
| `root` | 服务器根路径，实例建在 `<root>/<name>/` |
| `defaultJava` | 默认 JDK 的 java 可执行文件路径 |
| `prefs` | 新实例的默认偏好，可被实例覆盖 |

`prefs` 的默认值：`onlineMode: false`、`worldType: normal`、`allowNether: true`、`allowEnd: true`、`motd: "mcsdev test server"`、`memory: "2G"`、`viewDistance: 8`、`port: 25565`。

### `instances.json`

实例注册表，数组，每项：

```json
[
  {
    "name": "test1",
    "core": "paper",
    "mcVersion": "1.20.4",
    "dir": "E:\\dev\\mcsdev-servers\\test1",
    "javaBin": "C:\\...\\java.exe",
    "port": 25565,
    "overrides": {},
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

`mcsdev ls` 读它，`link: test1` 也靠它解析。

### `java.json`

`mcsdev java scan` 的结果。每项含 `bin`、`home`、`version`、`major`、`vendor`、`arch`、`fromCandidate`。

### `run-memory.json`

`mcsdev run` 的选择记忆，键是 `<mcVersion>|<产物指纹>`：

```json
{
  "1.20.4|MyPlugin-1.2.0.jar:123456:1700000000000;": {
    "instance": "test1",
    "jar": "MyPlugin-1.2.0.jar"
  }
}
```

指纹 = 排序后每个 jar 的 `文件名:大小:mtime` 用 `;` 连接。

### `running.json`

```json
{
  "test1": { "pid": 12345, "startedAt": 1700000000000 }
}
```

跨进程可见的运行状态。`ls` 和 `stop` 靠它找 PID；判断进程是否还活着用 `process.kill(pid, 0)`。

### `cache/`

| 路径 | 内容 | TTL |
| --- | --- | --- |
| `versions-<core>/list.json` | 该核心的可用 MC 版本列表 | 6 小时 |
| `builds/<core>-<version>.json` | 该版本的最新构建信息 | 4 小时 |
| `jars/<core>-<version>-<build>.jar` | `server.jar` 文件本体 | 无（按构建号复用） |

想强制刷新，删掉对应文件即可。

## 实例目录：`<root>/<name>/`

```
E:\dev\mcsdev-servers\test1\
├── mcsdev.json          实例元数据（名称/核心/版本/端口/JDK/覆盖项）
├── server.jar           下载的服务器
├── eula.txt             eula=true
├── server.properties    mcsdev 生成/合并
├── bukkit.yml           mcsdev 播种的最小配置（禁末地靠它）
├── plugins/             部署目标
├── world/               主世界
├── world_nether/        地狱
├── world_the_end/       末地
└── logs/
    ├── latest.log       服务器自己的日志（Paper 写）
    └── console.log      后台模式下进程的原始 stdout（mcsdev 写）
```

| 文件 | 谁写 | 谁读 |
| --- | --- | --- |
| `mcsdev.json` | `new` | 生命周期命令 |
| `server.jar` | `new`（从缓存复制） | 启动 |
| `eula.txt` / `server.properties` / `bukkit.yml` | `new`、`rebuild` | 服务器 |
| `plugins/` | `deploy` / `dev` / `run` | 服务器 |
| `logs/latest.log` | 服务器 | `logs`、`ps` |
| `logs/console.log` | mcsdev（仅后台模式） | 你 |

`mcsdev reset` 会删掉 `world*` 和 `logs/`，然后重建配置；`plugins/` 与 `server.jar` 保留。

## 服务器目录：`<link>/plugins/`

link 模式下这是你的服务器目录。mcsdev 只碰 `plugins/`：

```
E:\Minecraft\开发\Pylon开发\plugins\
├── .mcsdev-manifest.json      部署清单
├── .mcsdev-dev.lock           dev 会话锁（有 dev 在跑时存在）
├── .mcsdev-dev.json           dev 会话的本地 IPC 端点（exec 用）
├── Lapis-Pipez-0.1.59.jar     mcsdev 放的
├── Lapis-Cable-1.4.0.jar      mcsdev 放的
└── LuckPerms-5.4.jar          你手工放的（清单里没有）
```

### `.mcsdev-manifest.json`

```json
{
  "version": 1,
  "files": {
    "Lapis-Pipez-0.1.59.jar": {
      "id": "pipez",
      "at": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

| 键 | 说明 |
| --- | --- |
| `version` | 固定 `1`。不匹配时按「空清单」处理 |
| `files` | 相对 `plugins/` 的路径（`/` 分隔）→ 归属 id 与部署时间 |

写入时机：`deploy` / `dev` 每轮结束时，**只要该条目这一轮没失败**（包括「已是最新」）就补记。删除时机：`prune` 成功删除文件后同步更新。

它存在的唯一目的是让 `prune` 能区分「mcsdev 放的」和「你手工放的」。删掉它不会影响部署，只会让 `prune` 变得什么都看不见（重新跑一次 `deploy` 就会重建记录）。

### `.mcsdev-dev.lock`

`dev` 进入 watch 之前取的跨进程锁，内容是持有者信息：

```json
{
  "pid": 12345,
  "startedAt": "2026-01-01T00:00:00.000Z",
  "cwd": "E:\\dev\\pylon",
  "command": "dev"
}
```

- 被**活着的**进程占着 → 第二个 `dev` 直接报错退出（退出码 1），提示里给出对方 PID、工作目录、锁文件路径；
- 持有者进程已经死了（陈旧锁）→ 自动接管，不需要手动删；
- `dev` 正常退出时删除。

### `.mcsdev-dev.json`

`dev` 托管服务器时（`restart.type: mcsdev` 且实例由 mcsdev 管理）写的本地 IPC 端点：

```json
{ "port": 51234, "pid": 12345, "startedAt": "2026-01-01T00:00:00.000Z" }
```

`mcsdev exec` 检测到这个文件且 `pid` 存活时，会连这个本地端口把命令写进服务器 stdin，不需要 RCON。`dev` 退出后这个文件不再有效（`exec` 会检查 pid）。

## 项目里的文件

```
你的插件项目/
├── mcsdev.yml          声明式配置（进 git）
├── build/libs/...      构建产物
└── build/              其它构建中间产物
```

`mcsdev.yml` 应该提交进 git。它不含任何机器相关的绝对路径以外的秘密 —— `link` 里的路径是唯一与机器相关的东西，团队里每人改成自己的服务器目录即可。

## 相关

- [环境变量](/reference/env)
- [部署清单](/get-started/concepts#部署清单-deployment-manifest)
- [`prune`](/reference/cli/prune)
