# 配置自动重启

适用：部署成功了，但服务器还跑着旧 jar —— 你想让 `mcsdev dev` / `mcsdev deploy` 顺手把服务器重启了。

## 先看默认值

```bash
mcsdev config
```

```
  模式      link → E:\Minecraft\开发\Pylon开发  (外部目录)
  重启      none（只部署，不重启）
```

默认值由 `link` 决定：

| link 指向 | 默认 `restart.type` | 理由 |
| --- | --- | --- |
| mcsdev 实例名（如 `test1`） | `mcsdev` | mcsdev 知道这台服的启动方式 |
| 外部目录路径 | `none` | mcsdev 不知道你那台服怎么启停，不猜 |

所以外部服务器**必须显式配** `restart` 才会自动重启。

## 四个可选值

### `none`：只部署

```yaml
restart:
  type: none
```

`dev` 每轮部署完会提醒「重启策略是 none —— 每次部署后需要你手动重启服务器才会生效」。这不是残缺模式：有些开发服重启要几十秒、或者重启要走审批，自动重启反而是负担。

### `command`：执行一条命令

```yaml
restart:
  type: command
  run: ./restart-dev-server.sh
  timeoutMs: 180000
```

语义：**这条命令执行完，服务器应该正在启动**。mcsdev 等它退出码为 0，然后开始探测端口。

- 退出码非 0 → 判定失败，打印命令输出的最后一段，`mcsdev deploy` 以退出码 1 结束（这样 `mcsdev deploy && 下一步` 不会误判成功）。
- Windows 上注意 shell 是 `cmd`：

  ```yaml
  restart:
    type: command
    run: 'powershell -NoProfile -ExecutionPolicy Bypass -File restart-server.ps1'
  ```

- 命令的工作目录是**你运行 mcsdev 的目录**，不是 `link` 目录。写相对路径时注意，必要时用绝对路径。

### `http`：GET 一个接口

```yaml
restart:
  type: http
  url: http://127.0.0.1:25566/restart
  timeoutMs: 180000
```

发一个 GET，2xx 视为「重启请求被接受」。非 2xx 会打印响应体前 300 字节。

适用于服务器由某个守护进程/面板托管、且它暴露了重启接口的情况。

### `mcsdev`：mcsdev 自己重启实例

```yaml
restart:
  type: mcsdev
```

只对 `link` 指向 mcsdev 实例时有效。行为是：停掉实例 → 后台拉起 → 探测端口。写这个值但 `link` 是外部目录会直接报错：

```
✖ restart.type=mcsdev 但 link 不是 mcsdev 管理的实例
  ? 外部服务器请用 restart: { type: http, url: ... } 或 { type: command, run: ... }
```

**停止是否优雅取决于谁持有进程句柄**：

| 场景 | 停止方式 |
| --- | --- |
| `dev` 会话里、服务器由本次 `dev` 拉起 | 发 `stop` 等世界保存（优雅） |
| `dev` 会话里、实例已被外部启动 | 强杀，并警告世界可能未保存 |
| 一次性 `mcsdev deploy` | 强杀（Windows `taskkill /T /F`） |

如果「世界不能丢」是硬要求，用 `restart.type: command` 调一个自己会优雅停的脚本，比依赖这个类型更稳。


## 超时与端口探测

`timeoutMs` 默认 `180000`（3 分钟），它约束两件事：

1. HTTP 请求 / 命令执行本身的超时；
2. 之后等待服务器就绪的上限 —— 实际取 `min(timeoutMs, 120000)`。

「就绪」的判断方式是 **TCP 探测**：

- 端口从 `<link 目录>/server.properties` 里的 `server-port=` 读（不是写死的 25565）；
- 没有 `server.properties` 或读不到时，回落到 `server.port`，再回落到 `25565`；
- 主机默认是 `127.0.0.1`；`link` 是 UNC 路径（`\\server\share\...`）时取路径里的 `server`；
- 每次探测 1.5 秒超时，每秒重试一次。

如果服务器不在本机、或者 UNC 路径里的 server 名不是 Minecraft 主机名，用顶层 `host` 显式指定：

```yaml
host: 192.168.1.20
```

`host` 只影响探测，不影响部署 —— 部署永远是写 `link` 指向的本地路径。

探测通过才打印：

```
✔ 服务器已就绪（端口 25565 可连，等待 8s）
```

超时则：

```
⚠ 等待就绪超时（120s，端口 25565 仍不可连）—— 服务器可能没起来或崩了，检查 logs/latest.log
```

**为什么一定要探测**：HTTP 200 只代表请求被接受。此时服务器可能正在 boot，也可能三秒后崩在某个插件的 `onEnable` 里。不探测的话 `dev` 每轮都会给你一个虚假的 ✔，而你会以为新代码生效了。

## 什么时候不会重启

- 这轮没有任何文件变化：`dev` 打印「产物无变化，跳过重启」，`deploy` 打印「没有需要更新的产物」。**没有变化就不重启**，否则每按一次 Ctrl+S 都会重启一次服务器。
- 有部署失败：`dev` 打印「N 条失败 —— 跳过重启，等你修」。
- 显式跳过：`mcsdev deploy --no-restart`。

## 只想部署一次不重启

```bash
mcsdev deploy --no-restart
```

常用于：先在别的窗口把服务器停掉，再部署，再自己启动。

## 已知限制

- **等待就绪会阻塞 `dev`**：探测期间（最多 120 秒）检测到的变化只能排队，不会并发处理。服务器起得慢时，把 `timeoutMs` 调小比干等更实用。
- **探测目标可能猜错**：默认 `127.0.0.1`，UNC 路径时取路径里的 server 名。猜错的表现是「部署成功但等待就绪超时」—— 这时先试 `host`，再考虑换 `command` 策略。

## 相关

- [部署了但服务器没变，怎么查](/how-to/diagnose-not-updating)
- [为什么重启而不是热重载](/explanation/why-restart-not-hot-reload)
- [`restart` 字段完整语义](/reference/mcsdev-yml#restart)
