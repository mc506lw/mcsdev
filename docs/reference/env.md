# 环境变量

mcsdev 读取两个环境变量，都是可选的。

## `MCSDEV_HOME`

覆盖全局配置目录，默认 `~/.mcsdev`。

```bash
MCSDEV_HOME=/tmp/mcsdev-try mcsdev ls
```

用途：

- **试验**：不污染你真实的实例注册表和偏好；
- **CI**：把状态隔离到 runner 的临时目录；
- **多套环境**：不同项目组用不同的实例集合。

被这个变量影响的内容：`config.json`、`instances.json`、`java.json`、`run-memory.json`、`running.json`、`cache/`。详见[文件与目录](/reference/files#全局配置目录-mcsdev)。

```bash
# Windows PowerShell
$env:MCSDEV_HOME = "D:\tmp\mcsdev"
mcsdev ls
```

## `MCSDEV_PAPER_BASE`

覆盖 PaperMC Downloads API 的基地址，默认 `https://fill.papermc.io`。

```bash
MCSDEV_PAPER_BASE=https://your-mirror.example.com mcsdev new --name test1 --mc-version 1.20.4
```

用途：

- 网络到不了 `fill.papermc.io`（代理、内网）时指向镜像；
- 测试时指向本地桩服务器。

请求路径是 `/v3/...`，所以镜像必须兼容 v3 的接口形状。尾部斜杠会被去掉。

连不上时的报错会带上当前基地址：

```
✖ 无法连接 PaperMC API（https://fill.papermc.io）—— 请检查网络/代理；可用环境变量 MCSDEV_PAPER_BASE 指向镜像或代理
```

版本已下线（HTTP 410）：

```
✖ PaperMC API 版本已下线（HTTP 410，<url>）—— 请升级 mcsdev 或检查 MCSDEV_PAPER_BASE
```

## 在 mcsdev.yml 里引用环境变量

除了上面两个 mcsdev 自己读的变量，任何环境变量都可以在 `mcsdev.yml` 的**路径类字段**里展开（`${VAR}` 或 `$VAR`）：

```yaml
link: '${MCSDEV_SERVER}'
plugins:
  - path: '${MCSDEV_BUILD_ROOT}/MyPlugin-*.jar'
```

未定义的变量保留原样（不会变成空串），方便定位配置错误。详见 [`link` 的环境变量](/reference/mcsdev-yml#环境变量)。

## 相关的标准环境变量

这些不是 mcsdev 自己的，但它会用：

| 变量 | 用途 |
| --- | --- |
| `JAVA_HOME` / `JDK_HOME` | JDK 扫描的候选（也会扫它们的兄弟目录） |
| `ProgramFiles` / `ProgramFiles(x86)` / `ProgramW6432` | Windows JDK 候选目录 |
| `LOCALAPPDATA` / `APPDATA` | Windows 启动器 runtime 目录（`.minecraft/runtime` 等） |
| `HOME` / `USERPROFILE` | `~` 展开与 `~/.mcsdev` 定位 |

## 相关

- [文件与目录](/reference/files)
- [`new`](/reference/cli/new)
