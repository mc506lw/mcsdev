# `mcsdev exec`

往运行中的服务器发一条命令。比整服重启便宜得多，适合 `reload confirm`、`plugins`、`say` 这类验证操作。

```
mcsdev exec <command...>
```

## 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `<command...>` | 位置参数（一个或多个） | 是 | 要发送的命令。多个参数会用空格拼接 |

前导 `/` 会被去掉，所以 `mcsdev exec /say hi` 和 `mcsdev exec say hi` 等价。

```bash
mcsdev exec say hello
mcsdev exec plugins
mcsdev exec reload confirm
```

## 两条发送路径

`exec` 有两条路径，按顺序尝试：

| 顺序 | 条件 | 通道 | 需要开 RCON 吗 |
| --- | --- | --- | --- |
| 1 | 有 `dev` 会话托管着服务器（存在 `.mcsdev-dev.json` 且 pid 存活） | 本地 TCP → 服务器 stdin | **不需要** |
| 2 | 否则 | RCON | 需要 |

### 路径一：dev 会话的 stdin

`dev` 前台托管服务器时（`restart.type: mcsdev` 且实例由 mcsdev 管理）会写 `<link>/plugins/.mcsdev-dev.json`（本地端口 + pid）。`exec` 检测到这个文件、且那个 pid 还活着，就把命令通过本地 TCP 送进 dev 会话，再由 dev 写进服务器的 stdin。

```
mcsdev 通过 dev 会话的 stdin 发送：say hello
✔ 已发送（服务器输出见 dev 会话的终端）
```

这条路径**不回传服务器输出** —— 命令确实进服了，但 `[Server] hello` 之类的回应只会出现在 `dev` 那个窗口里。这是刻意的：stdin 是单向的，服务器输出已经归 dev 会话所有。

`dev` 退出后文件里的 pid 就死了，`exec` 会自动忽略它并退回 RCON。

### 路径二：RCON

没有可用的 dev 会话时走 RCON。连接信息优先级从高到低：

1. **`mcsdev.yml` 的 `rcon` 段**：

   ```yaml
   rcon:
     host: 127.0.0.1      # 默认 127.0.0.1
     port: 25575          # 默认 25575（不是游戏端口）
     password: your-rcon-password
   ```

2. **`<link 目录>/server.properties`**：读 `enable-rcon` / `rcon.port` / `rcon.password`。要求：

   ```properties
   enable-rcon=true
   rcon.port=25575
   rcon.password=your-rcon-password
   ```

   此时 host 固定为 `127.0.0.1`。

两者都不可用时报错：

```
✖ 无法确定 RCON 连接：服务器没开 RCON（server.properties 里 enable-rcon=false）
  ? 在 mcsdev.yml 里显式配置：rcon: { host, port, password }
  ? 或在该服务器的 server.properties 里设 enable-rcon=true 和 rcon.password
```

## 输出

**走 dev IPC 时**（无响应正文）：

```
mcsdev 通过 dev 会话的 stdin 发送：say hello
✔ 已发送（服务器输出见 dev 会话的终端）
```

**走 RCON 时**（带回显）：

```
mcsdev RCON → 127.0.0.1:25575  say hello
[Server] hello
✔ 命令已执行
```

服务器没有返回内容时只打印 `✔ 命令已执行`。长响应会被服务器拆成多个 RCON 包，mcsdev 会等到 200ms 内没有新包才收尾。

## 超时

- IPC：连接超时 3 秒；连不上就直接退回 RCON。
- RCON：连接与响应超时 10 秒。

```
✖ RCON 超时（10000ms）—— 服务器可能没在跑
  ? 服务器在跑吗？端口和密码对得上吗？（默认 RCON 端口 25575）
```

## 认证失败

```
✖ RCON 认证失败：密码错误（看 server.properties 的 rcon.password）
```

## 退出码

| 情况 | 退出码 |
| --- | --- |
| 命令已发送（IPC 或 RCON） | 0 |
| 找不到 `mcsdev.yml` | 1 |
| 命令为空 | 1 |
| 无法确定 RCON 连接 | 1 |
| IPC 返回错误（如 dev 会话里服务器已退出） | 1 |
| 认证失败 / 超时 / 连接错误 | 1 |

## 注意

- `exec` 需要服务器**正在运行**：有 dev 会话就走 stdin，否则必须开 RCON。
- 它对 `restart.type` 没有任何影响，也不读 `dev.sources`、不部署文件、不改本地文件。
- RCON 与游戏端口是两回事：游戏端口默认 `25565`，RCON 默认 `25575`。
- 用 `reload` 系命令重载插件仍然有热重载的固有风险（类加载器残留）。`exec reload` 只是「省一次重启」，不是「推荐做法」，见[为什么重启而不是热重载](/explanation/why-restart-not-hot-reload)。

## 相关

- [`rcon` 字段参考](/reference/mcsdev-yml#rcon)
- [`restart` 字段参考](/reference/mcsdev-yml#restart)
- [文件与目录](/reference/files)（`.mcsdev-dev.json`）
