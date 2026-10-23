# 核心概念

mcsdev 只有六个概念。搞清楚这六个词，剩下的命令都是它们的组合。

## 构建产物（build artifact）

插件项目构建出来的 jar。Gradle 默认落在 `build/libs/`，Maven 落在 `target/`。一个真实项目里这个目录通常同时躺着：

- 要部署的：`MyPlugin-1.2.0.jar`
- 不要部署的：`MyPlugin-1.2.0-sources.jar`、`-javadoc.jar`、`-dev.jar`、`-plain.jar`、`-mojang-mapped.jar`
- 历史版本：`MyPlugin-1.1.9.jar`、`MyPlugin-1.1.8.jar`……真实项目里能堆到几十个

mcsdev 的默认行为就是围绕这堆东西设计的：默认排除干扰产物，默认只取最新一个，默认清掉旧版本。

## 条目（plugin entry）

`mcsdev.yml` 里 `plugins:` 下面的一项。它回答三个问题：

```yaml
plugins:
  - id: pipez                              # 我叫什么（命令里用它点名）
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar   # 产物在哪
    rename: LapisPipez.jar                 # 部署过去叫什么（可选）
```

一个条目通常对应一个 gradle 子项目，但也可以一个子项目写两个条目（例如同时装 `-all` 和普通 jar），或者多个条目指向同一个目录（用 `exclude` 区分）。

### id

条目的名字，供 `mcsdev deploy <id>` / `mcsdev dev <id>` 点名。不写时从 `path` 推导：`build/libs/Lapis-Pipez-*.jar` → `Lapis-Pipez`。`mcsdev config` 打印的编号旁边就是它。

## 链接（link）

`mcsdev.yml` 里 `link:` 的值，指向**服务器目录**（或一个 mcsdev 实例名）。它决定了「jar 要复制到哪」和「谁负责重启」。

```yaml
link: 'E:\Minecraft\开发\Pylon开发'   # 外部服务器目录：mcsdev 只往里放 jar
# 或者
link: test1                            # mcsdev 自己注册的实例名
```

这是 mcsdev 最重要的一条设计边界，理由见[为什么是 link 模式](/explanation/why-link-mode)。

## 部署（deploy）

把构建产物复制到 `<link>/plugins/` 的动作。一次部署做四件事，顺序是固定的：

1. 按 glob 匹配产物，排除干扰文件；
2. 只取最新一个（`newest`）；
3. **先复制**新 jar（原子替换），**再删除**同前缀的旧版本 —— 反过来的话，复制失败就既没新版也没旧版；
4. 记录到部署清单。

内容相同（sha256 相等）就跳过，不复制。见[为什么用 sha256 判等](/explanation/why-sha256-not-mtime)。

## 部署清单（deployment manifest）

`<link>/plugins/.mcsdev-manifest.json`。它记录「哪些文件是 mcsdev 放的、属于哪个条目」。

存在的理由只有一个：让 `mcsdev prune` 能安全地删东西。声明式的承诺是「配置即真相」，但你把一个条目从 `mcsdev.yml` 里删掉时，`plugins/` 里那个 jar 不会自己消失 —— 服务器还在加载它，而你已经在配置里看不到它了。要清理它，就必须知道它是谁放的。

**手工放进 `plugins/` 的 jar 永远不在清单里，所以永远不会被 prune 碰。**

## 重启策略（restart）

部署完之后怎么让服务器加载新 jar。`restart.type` 四个值：

| 值 | 做什么 | 谁负责启停 |
| --- | --- | --- |
| `mcsdev` | 停掉实例再拉起来（`dev` 会话内是优雅停服；跨进程时是强杀） | mcsdev |
| `http` | GET 一个 URL，2xx 视为重启请求被接受 | 你的守护进程/面板 |
| `command` | 执行一条 shell 命令 | 你的脚本 |
| `none` | 不重启，只提示 | 你 |

默认值取决于 `link`：指向 mcsdev 实例 → `mcsdev`；指向外部目录 → `none`。

无论哪种策略，重启后 mcsdev 都会**探测端口**（从 `server.properties` 读 `server-port`）确认服务器真的起来了，才打勾。HTTP 200 不等于服务器起来了 —— 它可能正在 boot，也可能 3 秒后崩在插件的 `onEnable` 里。

## 实例（instance）

mcsdev 自己管理的服务器：一个自包含目录，含 `server.jar`、`server.properties`、`world/`、`plugins/`、`logs/`。由 `mcsdev new` 创建，注册在 `~/.mcsdev/instances.json`，用名字引用（`mcsdev start test1`）。

实例和 link 的关系：`link` 可以指向一个实例名。这时 mcsdev 既知道往哪放 jar，也知道怎么启停它。

## watch（监视）与防抖（debounce）

`mcsdev dev` 不监听源码，它**轮询**构建产物目录（默认每 500ms 一次），比对「文件名 + 大小 + mtime」的快照。

变化之后不立刻部署，而是等**防抖窗口**（默认 800ms）内不再有新变化才动手。原因很实在：gradle 写 jar 不是原子操作，立刻复制会拿到半个 jar。防抖期间如果又变了，计时重置。

---

想继续往下读：[mcsdev.yml 字段参考](/reference/mcsdev-yml) 或 [为什么是 link 模式](/explanation/why-link-mode)。
