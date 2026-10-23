# 部署了但服务器没变，怎么查

适用：`mcsdev deploy` 显示成功，进游戏却发现插件行为没变、或者新命令不存在。

先按顺序跑这四条，绝大多数问题在第二步就能定位：

```bash
mcsdev config            # 配置认为它要干什么
mcsdev ps                # 服务器上现在实际是什么
mcsdev deploy --dry-run  # 真跑会改什么
mcsdev logs -f           # 服务器自己说了什么
```

## 第一步：确认它部署到了正确的服务器

`deploy` / `dev` 开头会打印两行：

```
  配置  E:\dev\pylon\mcsdev.yml
  目标  E:\Minecraft\开发\Pylon开发\plugins
```

如果你在子目录里运行，它还会额外警告：

```
⚠ 当前在子目录，使用的是上层的 mcsdev.yml（在 E:\dev\pylon）
```

`mcsdev.yml` 是**向上找 8 层**的。所以在一个子项目目录里跑 `deploy` 会用上层那份配置 —— 这通常是你想要的，但如果你有多个 monorepo 嵌套，先确认这份 yml 是对的。

## 第二步：确认「已是最新」是不是真的

```bash
mcsdev ps
```

```
  id       构建产物                 已装                     状态
  pipez    Lapis-Pipez-0.1.59.jar  Lapis-Pipez-0.1.59.jar   最新
  cable    Lapis-Cable-1.4.0.jar   Lapis-Cable-1.3.9.jar    落后
```

| 状态 | 含义 | 下一步 |
| --- | --- | --- |
| `最新` | 源文件和已装文件 sha256 相同 | 服务器没加载它，看第三步 |
| `落后` | 内容不同 | `mcsdev deploy` |
| `未部署` | 目标位置没有这个文件 | `mcsdev deploy` |
| `已禁用` | 只有 `Foo.jaroff` | 你手动禁用过它，见下 |
| `缺产物` | 本地构建目录里没有匹配的 jar | 先构建 |

**「最新」但代码明显变了**，通常不是 mcsdev 的问题，而是构建没产出新内容：

- gradle 认为 up-to-date，根本没重新打 jar；
- 你改了 A 模块，构建的却是 B 模块（monorepo 里很常见）；
- jar 里没有你以为的那个类（比如 `plugin.yml` 的 `main` 指向了另一个类）。

验证一下源文件的时间戳和大小：

```bash
ls -l Lapis-Pipez/build/libs/Lapis-Pipez-0.1.59.jar
```

如果确实怀疑判等有问题，强制重装一次排除掉这个变量：

```bash
mcsdev deploy --force
```

## 第三步：确认服务器真的重启了

`restart.type: none` 时，mcsdev 只复制文件、明确告诉你「只部署，不重启」。去服务器控制台手动重启，或者[配置自动重启](/how-to/configure-restart)。

判断服务器是否重启过，看日志里的启动行：

```bash
grep -n "Starting minecraft server version" "/path/to/server/logs/latest.log" | tail -3
```

再看这一轮启动有没有加载你的插件：

```bash
grep -n -i "enabling\|LapisPipez" "/path/to/server/logs/latest.log" | tail -20
```

正常应该看到类似：

```
[12:34:56] [Server thread/INFO]: [LapisPipez] Enabling LapisPipez v0.1.59
```

看不到这一行，说明插件根本没被加载 —— 往下走第四步。

## 第四步：插件为什么没被加载

按出现频率排：

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 日志里完全没有插件名 | jar 没在 `plugins/` 根目录 | Bukkit/Paper 只加载 `plugins/` 根目录的 jar。`to:` 字段已被移除（写了会报错），所以检查是不是别的工具把文件放进了子目录 |
| 只有 `Foo.jaroff` | 你之前手动禁用了它 | 部署会把 `Foo.jar` 放回去（等于重新启用），mcsdev 会警告。保持禁用就把该条目注释掉 |
| 加载了两次、监听器执行两遍 | `plugins/` 里同前缀有两个 jar | 两个条目产出了同前缀的 jar，`mcsdev config` 会报「双载风险」。删掉多余的那个（或 `mcsdev prune`） |
| `Unknown dependency` / `NoClassDefFoundError` | 依赖的插件没装，或 API 版本不匹配 | 部署依赖，或检查 `plugin.yml` 的 `depend` / `api-version` |
| `UnsupportedClassVersionError` | JDK 版本太低 | 换 JDK，见[管理 JDK](/how-to/manage-jdk) |
| 服务器启动到一半退出 | 插件 `onEnable` 抛异常 | `mcsdev logs -f` 看堆栈；这就是端口探测失败的真实原因 |

## 第五步：`dev` 没触发部署

```bash
mcsdev dev
```

```
✔ 进入 watch 模式
   监视 /path/to/your-plugin/build/libs
```

- **`dev` 不编译**。它监视构建产物，不监视源码。改完代码必须构建，或者用 `./gradlew build --continuous`。
- 监视目录是从条目的 `path` 反推的。`path` 写错时 `dev` 会打印「以下目录不存在，不会监视」并给出目录绝对路径。
- 产物写稳需要时间：默认防抖 800ms。如果 gradle 写 jar 特别慢，可以调大 `dev.debounce`。

### 两个终端都在跑 dev？

不会出现「两个都生效」的局面 —— `dev` 会在进入 watch 前取 `<plugins>/.mcsdev-dev.lock`，第二个会直接报错退出（退出码 1）：

```
✖ 另一个 mcsdev 正在操作这台服务器（PID 12345，工作目录 E:\dev\pylon，开始于 …）
  ? 先退出那个会话；如果那个进程已经不在了，删掉锁文件重试：E:\...\plugins\.mcsdev-dev.lock
```

先确认那个 PID 是不是你自己的另一个窗口。如果它已经不在了（比如那个终端被直接关掉），再跑一次 `dev` 就会自动接管陈旧锁 —— 锁文件不需要手动删。

## 第六步：退出码与自动化

`mcsdev deploy` 在以下情况退出码为 1：

- 配置解析失败；
- 任一被点名的条目没有产物（`required: true`）；
- 复制失败；
- 重启失败（HTTP 非 2xx / 命令非 0 退出 / 等待就绪超时）。

所以脚本里 `mcsdev deploy && 下一步` 是安全的。反过来，如果你在 CI 里看到绿色但没生效，检查是不是被 `required: false` 或 `restart.type: none` 静默跳过了。

## 相关

- [配置自动重启](/how-to/configure-restart)
- [处理 build/libs 里的多份产物](/how-to/handle-many-jars)
- [`ps` 命令参考](/reference/cli/ps)
