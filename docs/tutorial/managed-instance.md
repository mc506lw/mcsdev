# 用 mcsdev 管一台测试服

这篇教程不需要你事先有服务器。结束时你会得到：

- 一台由 mcsdev 创建、注册、能一条命令启停的测试服（**实例**）；
- 一个 `mcsdev run` 记忆式启动的工作流；
- 理解为什么 `link` 指向实例时 `restart.type` 可以写成 `mcsdev`。

## 1. 首次配置：`mcsdev setup`

```bash
mcsdev setup
```

它只做四件事，全是交互式的：

```
mcsdev 开始初始化 mcsdev 全局环境…
→ 扫描本机 JDK…
  1   Java 21  21.0.4       Eclipse Adoptium  64位
      C:\Program Files\Eclipse Adoptium\jdk-21.0.4.7-hotspot\bin\java.exe
  2   Java 17  17.0.12      Microsoft         64位
      C:\Program Files\Microsoft\jdk-17.0.12.7-hotspot\bin\java.exe
✔ 发现 2 个 JDK
? 选择默认 JDK › Java 21（21.0.4）Eclipse Adoptium
✔ 默认 JDK 已记录
? 服务器根路径（所有实例建在这里，需为空目录） › E:\dev\mcsdev-servers
mcsdev online-mode：正版验证。开启后玩家必须用正版账号登录；本地开发测试一般关闭（离线）。
⚠ 注意：offline 模式任何人都能进服，切勿用于公网服务器。
? 默认关闭正版验证（online-mode=false）？ › 是
✔ setup 完成！
```

三个要点：

- **服务器根路径必须是空目录**。所有实例都建在它下面，mcsdev 不做「目录里已经有东西」的猜测。默认建议 `<当前目录>/.tmp`。
- **JDK 是显式管理的**，不靠猜。扫描结果存进 `~/.mcsdev/java.json`，之后可以随时用 `mcsdev java` 换。
- **online-mode 只问一次**，因为它有安全含义（关掉之后任何人都能进服）。之后的偏好类配置一律走默认值，不打扰你。

## 2. 创建实例：`mcsdev new`

```bash
mcsdev new
```

向导四个问题：

```
? 实例名称（ID） › test1
? 服务器核心 › paper（默认，社区标准） / folia（多线程分支）
? MC 版本 › 1.20.4
? 使用全局默认配置？ › 是
```

然后它会：

1. 从 PaperMC 的 Fill Downloads API（`https://fill.papermc.io`，v3）拉取该核心该版本的最新构建；
2. 下载 `server.jar`（缓存到 `~/.mcsdev/cache/jars/`，同版本复用，不会重复下载）；
3. 生成 `eula.txt`（自动同意）与 `server.properties`；
4. 分配端口（默认 25565，被占用则自动偏移）；
5. 写入实例元数据并注册到 `~/.mcsdev/instances.json`。

也可以一条命令非交互地建：

```bash
mcsdev new --name test1 --core paper --mc-version 1.20.4 --yes
```

## 3. 确认它存在

```bash
mcsdev ls
```

```
  test1               paper  1.20.4    端口 25565 已停止
      E:\dev\mcsdev-servers\test1
```

## 4. 启动并部署 jar：`mcsdev run`

`run` 是「记忆式启动」：它把「选实例、选 jar、部署、启动、看日志」压成一条命令，并且**只问一次**。

```bash
cd /path/to/your-plugin
mcsdev run 1.20.4
```

第一次会问：

```
→ 从项目依赖探测到 MC 1.20.4
→ 使用实例 test1（paper 1.20.4 · 端口 25565）
? 选择 jar › MyPlugin-1.2.0.jar
→ 部署 MyPlugin-1.2.0.jar → test1/plugins/
✔ 部署完成
✔ 实例 test1 已启动：控制台输入 stop 可优雅停止；Ctrl+C 中断并强制停止
[12:00:00 INFO]: Done (3.412s)! For help, type "help"
```

**第二次再跑 `mcsdev run 1.20.4` 是零提问的** —— 它记住了「这个版本 + 这批产物」对应哪个实例、哪个 jar。

记忆的键是 `(MC 版本, 产物集合指纹)`，指纹 = 每个 jar 的 `文件名:大小:mtime`。含义很精确：

- 重新构建了**同名** jar → 集合没变 → 仍然零提问，直接部署新内容（这正是你想要的）；
- 多了一个 jar / 少了一个 / 文件名变了 → 重新问一次。

清掉记忆：

```bash
mcsdev run 1.20.4 --forget
```

`run` 是**前台**运行的：服务器的 stdout 直接回流到你的终端，你输入的命令（`stop`、`op`、插件命令）直接进服务器 stdin。Ctrl+C 会先发 `stop` 等世界保存，再退出。

## 5. 后台运行：`start` / `stop` / `logs`

不想占着一个终端：

```bash
mcsdev start test1     # 后台启动，CLI 立刻返回
mcsdev logs test1 -f   # 另开一个窗口跟日志
mcsdev stop test1      # 跨进程停止（Windows 上是强杀，见下）
mcsdev restart test1
```

这几个命令的实例参数可以写实例名，也可以写 MC 版本（`mcsdev stop 1.20.4`）；只写版本且该版本下有多个实例时会报错让你用名字。

`logs` 从文件末尾约 20KB 开始显示；`-f` 每 500ms 追加新内容。它也能直接看外部服务器：`mcsdev logs "/path/to/server"`，或在有 `mcsdev.yml` 的项目里直接 `mcsdev logs`（会读 `link` 指向的目录）。

## 6. 把声明式配置接到这台实例上

现在回到 `mcsdev.yml` 的世界。因为实例是 mcsdev 自己管的，`link` 可以直接写实例名：

```bash
cd /path/to/your-plugin
mcsdev init --link test1
```

生成的 `restart` 段会不一样：

```yaml
restart:
  type: mcsdev
  # 注意：只有 dev / run 在前台持有进程句柄时才能优雅停服（save-all → stop）；
  # 一次性的 deploy 只能跨进程强杀（Windows 上是 taskkill /T /F，世界可能未保存）。
```

这是 `mcsdev` 这个 `restart.type` 的唯一用途：mcsdev 知道自己怎么启动这台服，所以能自己重启它。至于「重启时是优雅停还是强杀」，取决于当前是谁持有服务器进程 —— 那句注释已经把两种情形写清楚了。

```bash
mcsdev dev
```

现在改代码 → 构建 → 部署 → 重启 → 端口探测通过。这个循环里 mcsdev 自己持有服务器进程句柄，所以重启走的是优雅停服（发 `stop`、等世界保存、再拉起），没有残留进程。


## 7. 维护动作

```bash
mcsdev rebuild test1    # 重生成 server.properties / eula.txt，不碰 world/ 和 plugins/
mcsdev reset test1      # 删掉 world/（含地狱末地）和 logs/，回到初始状态
```

`rebuild` 是**键级合并**而不是覆盖：它只改 mcsdev 管的那些键，保留服务器/版本自己的键。所以升级核心之后跑一次 `rebuild` 是安全的。

`reset` 要求实例已停止，并且会二次确认 —— 它删的是世界。

## 你现在的两条路径

| | 外部服务器（link 目录） | mcsdev 实例（link 实例名） |
| --- | --- | --- |
| 建服务器 | 你自己 | `mcsdev setup` + `mcsdev new` |
| 启停 | 你自己 | `mcsdev start / stop / restart` |
| `restart.type` | `none`（默认）/ `http` / `command` | `mcsdev`（默认） |
| 优雅停服 | 取决于你的脚本 | `dev` 会话内保证（持有句柄）；`stop` / `restart` 命令是跨进程强杀 |

两者共用 `init / config / ps / deploy / dev / prune` 全套命令。选哪个取决于你是不是已经有那台服 —— 理由见[为什么是 link 模式](/explanation/why-link-mode)。

## 接下来

- 让外部服务器也能自动重启 → [配置自动重启](/how-to/configure-restart)
- 换 JDK、检查 JDK → [管理 JDK](/how-to/manage-jdk)
- 实例重启后日志里报错 → [部署了但服务器没变，怎么查](/how-to/diagnose-not-updating)
