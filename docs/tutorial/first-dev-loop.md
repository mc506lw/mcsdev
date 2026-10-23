# 从零到「改一行代码自动重启」

这篇教程带你把一个 monorepo 插件项目接到一台已有的开发服上，最后得到一个闭环：

```
改一行代码 → 构建 → mcsdev 自动部署 → 服务器自动重启 → 看日志
```

每一步都可以直接复制粘贴。命令按 bash 写，Windows 上 Git Bash / WSL / PowerShell 都能跑（PowerShell 里路径引号换成单引号即可）。

## 0. 前置检查

三件事必须先存在，否则后面每一步都会卡住：

```bash
node -v                 # ≥ 18.17
./gradlew build         # 在你的插件项目里能出 jar
ls "/path/to/server"    # 服务器目录里有 server.properties 和 plugins/
```

第三项就是你的开发服。教程里假设它是外部的（你自己启停），mcsdev 只负责往里放 jar。

> 没有现成的服务器？先走[用 mcsdev 管一台测试服](/tutorial/managed-instance)，再回来。

## 1. 安装 mcsdev

```bash
git clone https://github.com/mc506lw/mcsdev.git
cd mcsdev && npm install && npm run build && npm link
mcsdev --version
```

## 2. 先构建一次

```bash
cd /path/to/your-monorepo
./gradlew build
ls Lapis-Pipez/build/libs/
```

**必须先有产物再 `init`。** 原因很实际：`init` 靠 jar 文件名推导插件前缀。没有产物时它只能猜一个 `*.jar`，你得手改；有产物时它生成的是能直接命中的 `Lapis-Pipez-*.jar`。

真实 monorepo 的 `build/libs/` 大概长这样：

```
Lapis-Pipez-0.1.59.jar
Lapis-Pipez-0.1.59-sources.jar
Lapis-Pipez-0.1.58.jar
Lapis-Pipez-0.1.58-sources.jar
```

两个干扰产物会被默认排除，两个版本里只会取最新那个，旧版会被清理。这三件事都不需要你配置。

## 3. 生成配置

```bash
mcsdev init --link "/path/to/server"
```

输出大致是：

```
→ 扫描 /path/to/your-monorepo
mcsdev monorepo 模式：探测到 8 个含构建文件的子项目
    其中 6 个已有构建产物：Lapis-Pipez, Lapis-Cable, ...
✔ 已生成 /path/to/your-monorepo/mcsdev.yml
  ? 写入了 8 个条目 —— 不需要的删掉，缺的补上
  ? 下一步：mcsdev config 看解析结果 → mcsdev dev 开始开发循环
```

## 4. 读懂它生成了什么

```bash
cat mcsdev.yml
```

```yaml
# mcsdev.yml —— 由 `mcsdev init` 生成
version: 1
name: pylon

link: /path/to/server
# 或者自建容器（把上面 link 那行换成下面几行）：
# server:
#   core: paper
#   mc: 1.20.1
#   memory: 2G

plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
    # build/libs 里有 41 个历史 jar，默认只部署最新的那个
  - id: cable
    path: Lapis-Cable/build/libs/Lapis-Cable-*.jar

restart:
  type: none
  # 外部服务器（link 指向目录）默认只部署不重启。要自动重启请二选一：
  # type: http
  # url: http://127.0.0.1:25566/restart     # 换成你的重启接口
  # type: command
  # run: <你的重启命令>

dev:
  watch: true
  debounce: 800
```

四段，逐个说：

- **`link`**：服务器目录。mcsdev 之后所有写操作都在它的 `plugins/` 下。
- **`plugins`**：每个子项目一条。`id` 是命令里点名用的，`path` 是相对 `mcsdev.yml` 的 glob。
- **`restart`**：`type: none` 是外部服务器的默认值 —— mcsdev 不知道你那台服是怎么启停的，所以默认不猜。
- **`dev`**：`watch: true` 表示 `mcsdev dev` 会持续监视；`debounce: 800` 是等 jar 写完的窗口。

没有构建产物的子项目被注释掉了（`init` 认为它们可能是参考源码）。需要哪个就取消注释。

## 5. 检查解析结果

```bash
mcsdev config
```

```
mcsdev.yml  /path/to/your-monorepo/mcsdev.yml
  name      pylon
  模式      link → /path/to/server  (外部目录)
  重启      none（只部署，不重启）
  部署到    /path/to/server/plugins

plugins  8 条
  1. pipez
     path    Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
     glob    命中 41  排除 41
       – Lapis-Pipez-0.1.59-sources.jar  (排除)
       → Lapis-Pipez-0.1.59.jar  ⇒  plugins/Lapis-Pipez-0.1.59.jar
     clean   将删除 1 个旧版：Lapis-Pipez-0.1.58.jar
```

三行值得盯住：

- **`glob 命中 N`**：命中 0 就是路径写错了，后面 `deploy` 会直接报错。
- **`→`** 那一行：最终部署哪个文件、目标叫什么名字。
- **`clean`** 那一行：这次会删掉哪些旧版本。

`配置可用` 出现在最后才算通过。

## 6. 看服务器现状

```bash
mcsdev ps
```

```
  配置  /path/to/your-monorepo/mcsdev.yml
  目标  /path/to/server/plugins
  服务器 1.20.1 · 端口 25565 · 运行中

  id       构建产物                 已装                     状态
  pipez    Lapis-Pipez-0.1.59.jar  Lapis-Pipez-0.1.58.jar   落后
  cable    Lapis-Cable-1.4.0.jar   (无)                     未部署
```

`ps` 是只读的。它存在的理由是：`config` 说配置**想**干什么，`deploy` 真的去干，中间缺一档「现在是什么」。没有它，想确认服务器上装的是哪个版本，唯一办法是跑一次会写盘的命令。

## 7. 预演部署

```bash
mcsdev deploy --dry-run
```

`--dry-run` 不改任何文件（连 `plugins/` 目录都不会建）。确认它要复制的文件名对得上。

## 8. 真部署一次

```bash
mcsdev deploy
```

```
  配置  /path/to/your-monorepo/mcsdev.yml
  目标  /path/to/server/plugins
✔ pipez: 部署 Lapis-Pipez-0.1.59.jar + 清理 1 个旧版
✔ cable: 部署 Lapis-Cable-1.4.0.jar
  ── 2 部署 · 0 已是最新 · 0 失败
mcsdev 重启策略 none —— 只部署，不重启
```

现在 jar 已经到位了，但服务器还跑着旧版本 —— 因为 `restart.type` 是 `none`。去你的服务器控制台手动 `stop` / 再启动，或者继续下一步配自动重启。

## 9. 配自动重启

外部服务器的启停方式五花八门（bat 脚本、systemd、面板、RCON 脚本），所以 mcsdev 不猜，只提供三个出口。选一个：

### 选项 A：一条 shell 命令（最通用）

如果你有一个能「重启服务器」的脚本或命令：

```yaml
restart:
  type: command
  run: ./restart-dev-server.sh
  timeoutMs: 180000     # 默认值，可省
```

`run` 的语义是：**执行完这条命令，服务器应该正在启动**。mcsdev 会等它退出码为 0，然后开始探测端口。

Windows 上可以写：

```yaml
restart:
  type: command
  run: 'powershell -NoProfile -ExecutionPolicy Bypass -File restart-server.ps1'
```

### 选项 B：HTTP 接口

如果你的服务器由某个守护进程/面板托管，且有重启接口：

```yaml
restart:
  type: http
  url: http://127.0.0.1:25566/restart
```

mcsdev 发一个 GET，2xx 视为「请求被接受」，然后探测端口。

### 选项 C：不重启，自己动手

```yaml
restart:
  type: none
```

`dev` 每次部署后会明确提醒你「需要手动重启」。这不是残缺模式 —— 有些开发服重启一次要几十秒，或者需要走审核流程，自动重启反而是负担。

> 第四种值 `mcsdev` 只对 mcsdev 自己管理的实例有意义，见[用 mcsdev 管一台测试服](/tutorial/managed-instance)。

**无论哪种，重启后 mcsdev 都会探测端口**（从 `server.properties` 读 `server-port`，默认 `25565`，最多等 `min(timeoutMs, 120s)`）。HTTP 返回 200 不代表服务器起来了 —— 它可能正在 boot，也可能三秒后崩在插件的 `onEnable` 里。探测通过才打勾。

## 10. 启动开发循环

```bash
mcsdev dev
```

```
  配置  /path/to/your-monorepo/mcsdev.yml
  目标  /path/to/server/plugins

mcsdev 第 1 轮  初始部署
✔ pipez: 已是最新
· cable: 已是最新
  ── 0 部署 · 2 已是最新 · 0 失败
  产物无变化，跳过重启

✔ 进入 watch 模式
   监视 /path/to/your-monorepo/Lapis-Pipez/build/libs
   监视 /path/to/your-monorepo/Lapis-Cable/build/libs
   防抖 800ms · 轮询 500ms · Ctrl+C 退出
⚠ dev 只 watch 构建产物，不负责编译 —— 改完代码记得先构建
```

`mcsdev dev` 启动时先跑一轮（初始部署），然后进入 watch。

## 11. 改一行代码，看它自动重启

另开一个终端，用 Gradle 的持续构建把「编译」也接进闭环：

```bash
./gradlew :Lapis-Pipez:build --continuous
```

然后改代码。比如在 `PipezPlugin.java` 的 `onEnable()` 里加一行：

```java
getLogger().info("dev loop works");
```

保存，观察两个窗口：

**Gradle 窗口**：重新编译，写出新的 jar。

**`mcsdev dev` 窗口**：

```
→ 检测到产物变化，等待写稳…
mcsdev 第 2 轮  产物变化
✔ pipez: 部署 Lapis-Pipez-0.1.59.jar
  ── 1 部署 · 1 已是最新 · 0 失败
→ 执行重启命令：./restart-dev-server.sh
✔ 重启命令执行完成
✔ 服务器已就绪（端口 25565 可连，等待 8s）
```

看到最后那行才算真的成功。如果只有「重启命令执行完成」没有「服务器已就绪」，说明服务器启动失败了 —— 去 `logs/latest.log` 看堆栈。

## 12. 结束

在 `mcsdev dev` 窗口按 Ctrl+C。

如果 `restart.type` 是 `mcsdev`（服务器由 mcsdev 托管），它会先发 `stop` 等世界保存再退出，不会留下损坏的世界文件。

## 13. 出了岔子

| 症状 | 原因 | 怎么办 |
| --- | --- | --- |
| `没有匹配到 jar` | glob 路径写错，或还没构建 | `mcsdev config` 看命中数；路径相对于 `mcsdev.yml` 所在目录 |
| `link 指向的目录不存在` | `--link` 写成了相对路径或写错盘符 | 用绝对路径，Windows 路径包单引号 |
| `命中 41 个，只部署最新的` | 这是警告，不是错误 | 想全装就在该条目写 `newest: false` |
| 部署成功但游戏里没变化 | 服务器没重启 | 配 `restart`，或手动重启 |
| `等待就绪超时` | 服务器启动失败 | 看 `<link>/logs/latest.log`，常见是插件依赖缺失或主类写错 |
| 改了代码没触发部署 | `dev` 不编译 | 跑 `./gradlew build`，或用 `--continuous` |
| `插件名-*.jar` 匹配不到 | 产物文件名没版本号 | 改成精确文件名：`path: build/libs/MyPlugin.jar` |

更多排查见[部署了但服务器没变，怎么查](/how-to/diagnose-not-updating)。

## 你现在的配置

```yaml
version: 1
name: pylon
link: /path/to/server
plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
  - id: cable
    path: Lapis-Cable/build/libs/Lapis-Cable-*.jar
restart:
  type: command
  run: ./restart-dev-server.sh
dev:
  watch: true
  debounce: 800
```

把这份文件提交到 git。下一个人克隆项目、装好 mcsdev，跑 `mcsdev dev` 就能得到同一个开发循环 —— 这是声明式配置真正的好处。

## 接下来

- 只想部署其中一个子项目 → [只部署一个子项目](/how-to/deploy-one-subproject)
- 从配置里删掉一个插件后，怎么清掉残留的 jar → [清理残留 jar](/how-to/clean-stale-jars)
- 想知道为什么 `clean` 默认开着 → [为什么 clean 默认是 true](/explanation/why-clean-default-true)
