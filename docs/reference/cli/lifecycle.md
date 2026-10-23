# `mcsdev start` / `stop` / `restart` / `logs` / `rebuild` / `reset`

实例生命周期命令。六个命令共享同一套实例解析规则。

```
mcsdev start   [instance]
mcsdev stop    [instance]
mcsdev restart [instance]
mcsdev logs    [instance] [-f]
mcsdev rebuild [instance]
mcsdev reset   [instance]
```

## 实例参数

`[instance]` 可选，三种写法：

| 写法 | 说明 |
| --- | --- |
| 实例名 | 精确匹配（推荐） |
| MC 版本 | 仅当该版本下恰好 1 个实例 |
| 省略 | 只有 1 个实例时自动选中；多个则弹选 |

解析规则：

- 名字找不到时尝试按版本匹配；该版本下有多个实例 → 报错要求用名字：

  ```
  ✖ 版本 1.20.4 对应多个实例：test1、test2——请改用实例名
  ```

- 名字和版本都匹配不到：

  ```
  ✖ 未找到实例「foo」。提示：这里填实例名（如 test1）或 MC 版本（如 1.20.1）；先 mcsdev ls 查看
  ```

- 一个实例都没有：

  ```
  ✖ 还没有任何实例（mcsdev new 创建）
  ```

---

## `start`

后台启动实例，CLI 立即返回。

```
✔ 实例 test1 已在后台启动（日志：mcsdev logs test1；停止：mcsdev stop test1）
```

后台模式的技术细节：

- 子进程 `detached`，独立于当前终端存活；
- 服务器 stdout/stderr 写入 `<实例>/logs/console.log`；
- Paper 自己仍会写 `<实例>/logs/latest.log`；
- PID 被记录下来，供 `stop` / `ls` 使用。

---

## `stop`

**跨进程停止**：从 `~/.mcsdev/running.json` 读 PID，然后按平台终止进程树。

| 平台 | 行为 | 世界会保存吗 |
| --- | --- | --- |
| Windows | `taskkill /pid <pid> /T /F`（**强制**，无法经 stdin 优雅停） | 不保证。mcsdev 会先警告「Windows 独立 stop 无法经 stdin 优雅停止，世界可能未保存」 |
| macOS / Linux | `SIGTERM` → 最多等 10 秒 → `SIGKILL` | 取决于服务器是否响应 SIGTERM |

实例本来就没在跑：

```
⚠ 实例 test1 未在运行
```

不是错误（退出码仍为 0）。

::: warning 想要优雅停止
只有 mcsdev **自己持有子进程句柄**时才能优雅停（向 stdin 发 `stop` 并等它保存退出）。这发生在：

- `mcsdev run` 前台会话（Ctrl+C 或敲 `stop`）；
- `mcsdev dev` 中由它启动的实例（`restart.type: mcsdev`，且是本次会话拉起的）。

`mcsdev stop` 和 `mcsdev restart` 都是跨进程的，拿不到 stdin，所以只能强杀。想在任何情况下都优雅停，用 `restart.type: command` 调一个自己会优雅停的脚本。
:::

---

## `restart`

`stop` + `start`。

```
✔ 实例 test1 已重启（日志：mcsdev logs test1）
```

⚠️ 这是**外部**重启：新进程、mcsdev 不持有句柄，停止阶段走的是上面的跨进程强杀。如果服务器是被前台的 `run` / `dev` 启动的，请用那个会话里的 Ctrl+C，否则会出现两个进程抢同一个端口。

---

## `logs`

查看日志，默认从文件末尾约 20KB 开始打印后退出。

| 参数 | 说明 |
| --- | --- |
| `-f, --follow` | 持续跟踪（每 500ms 检查追加） |

`logs` 支持三种目标，优先级从高到低：

1. **已注册实例名** → 看 `<实例>/logs/latest.log`；
2. **含 `/` 或 `\` 的参数**（服务器目录）→ 看 `<目录>/logs/latest.log`；
3. **当前项目的 `mcsdev.yml` 的 `link` 目录** → 看 `<link>/logs/latest.log`。

所以 link 模式下直接 `mcsdev logs` 就能看你那台外部服务器的日志。

打印前会说明看的是谁：

```
mcsdev 看的是 test1（E:\dev\mcsdev-servers\test1）
```

没有日志文件时：

```
⚠ 还没有日志文件（实例 test1 尚未运行过）
```

---

## `rebuild`

从实例配置重生成 `server.properties` 与 `eula.txt`。

```
✔ 已重新生成 test1 的 server.properties / eula.txt（未触碰 world/ 与 plugins/）
  ? 运行中的实例需要重启才能生效：mcsdev restart test1
```

**键级合并，不是覆盖**：只改 mcsdev 管的键（`online-mode`、`view-distance`、`server-port`、世界类型相关等），保留服务器/版本自己的键（例如新版本才有的 `accepts-transfers`）。文件缺失时播种。

所以升级核心之后跑一次 `rebuild` 是安全的。

末地这类原版 `server.properties` 无法表达的开关，mcsdev 会同时写 `bukkit.yml` 的 `settings.allow-end`。

---

## `reset`

删除 `world/`、`world_nether/`、`world_the_end/`、`logs/`，然后重建配置。`plugins/` 与 `server.jar` 保留。

两道保护：

1. 实例正在运行 → 拒绝：

   ```
   ✖ 实例 test1 正在运行，先停止：mcsdev stop test1
   ```

2. 二次确认（默认「否」）：

   ```
   ? 确认重置 test1？将删除 world/（含地狱/末地）与日志 › 否
   ✔ 已取消
   ```

成功：

```
✔ 实例 test1 已重置到初始状态
```

---

## 汇总

| 命令 | 动 world/ | 动 plugins/ | 动配置 | 需要停止 |
| --- | --- | --- | --- | --- |
| `start` | 否 | 否 | 否 | 否 |
| `stop` | 否 | 否 | 否 | 否 |
| `restart` | 否 | 否 | 否 | 否 |
| `logs` | 否 | 否 | 否 | 否 |
| `rebuild` | 否 | 否 | 是（键级合并） | 否（但需重启生效） |
| `reset` | **删除** | 否 | 是（重建） | **是** |

## 退出码

| 情况 | 退出码 |
| --- | --- |
| 命令完成 | 0 |
| 实例解析失败（找不到 / 版本有歧义 / 无实例） | 1 |
| `reset` 时实例在运行 | 1 |

错误路径统一返回 1（`error()` 会设置退出码），所以 `mcsdev stop test1 && mcsdev start test1` 这类链式命令是安全的。

## 相关

- [管理实例生命周期](/how-to/manage-instances)
- [文件与目录](/reference/files)
