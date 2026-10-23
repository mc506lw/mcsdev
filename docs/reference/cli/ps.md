# `mcsdev ps`

只读状态视图：配置里的条目 vs 服务器上实际装的 jar。**不会改任何文件。**

```
mcsdev ps [options]
```

## 参数

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--json` | 开关 | 关 | 输出 JSON |

## 人读输出

```
  配置  E:\dev\pylon\mcsdev.yml
  目标  E:\Minecraft\开发\Pylon开发\plugins
  服务器 1.20.4 · 端口 25565 · 运行中

  id       构建产物                 已装                     状态
  pipez    Lapis-Pipez-0.1.59.jar  Lapis-Pipez-0.1.59.jar   最新
  cable    Lapis-Cable-1.4.0.jar   Lapis-Cable-1.3.9.jar    落后
  sidedio  SidedIO-2.0.0.jar       (无)                     未部署
  legacy   (无产物)                -                        缺产物

  plugins/ 里还有 3 个配置没管的 jar：
    LuckPerms-5.4.jar
    ViaVersion-4.9.jar
    Lapis-Legacy-0.3.1.jar
  ? 这些不会被 deploy 碰（也不会被清理）
```

## 五种状态

| 状态 | 判定方式 | 含义 |
| --- | --- | --- |
| `最新` | 源文件与目标文件 sha256 相同 | 已装的是当前构建产物 |
| `落后` | 目标文件存在但内容不同 | 需要 `deploy` |
| `未部署` | 目标文件不存在，且没有对应的 `.jaroff` | 从没装过 |
| `已禁用` | 只有 `Foo.jaroff` | 你手动改名禁用过它 |
| `缺产物` | 该条目 glob 命中 0 个文件 | 本地还没构建 |

`已禁用` 和 `未部署` 分开是有意的：前者说明服务器上有个被改名的 jar（部署会把 `.jar` 放回去，等于重新启用），后者是纯粹没装。

## 服务器信息行

| 项 | 来源 |
| --- | --- |
| 版本 | `<link>/logs/latest.log` 开头 8KB 里的 `Starting minecraft server version X`，或 `Paper/Leaf/... version X` |
| 端口 | `<link>/server.properties` 的 `server-port` |
| 运行状态 | TCP 连 `127.0.0.1:<port>`，800ms 超时 |

任何一项读不到就显示 `版本未知` / `端口未知` / `已停止`，不会报错。

## 「配置没管的 jar」

`plugins/` 里存在、但没有任何条目覆盖的 `.jar` 文件。三种来源：

- 你手工放的第三方插件；
- 从 `mcsdev.yml` 里删掉的条目留下的残留（`mcsdev prune` 能处理）；
- `mcsdev run` 放进去的（`run` 不写部署清单）。

`ps` 只列出它们，明确说明不会被 `deploy` 碰。

## `--json` 输出

```json
{
  "file": "/abs/mcsdev.yml",
  "serverDir": "/abs/server",
  "pluginsDir": "/abs/server/plugins",
  "server": {
    "version": "1.20.4",
    "port": 25565,
    "running": true
  },
  "entries": [
    {
      "id": "pipez",
      "build": "Lapis-Pipez-0.1.59.jar",
      "installed": "Lapis-Pipez-0.1.59.jar",
      "state": "最新"
    }
  ],
  "extra": ["LuckPerms-5.4.jar"]
}
```

`entries[].state` 的取值就是上面五个中文词（`最新` / `落后` / `未部署` / `已禁用` / `缺产物`），没有英文枚举 —— 脚本里请按这几个字面值判断。

## 退出码

| 情况 | 退出码 |
| --- | --- |
| 正常输出（无论有多少落后/未部署） | 0 |
| 找不到 / 解析不了 `mcsdev.yml` | 1 |

注意：`ps` **不会**因为「有 5 个条目落后」而返回 1。它是状态查询，不是断言。

## 相关

- [`deploy`](/reference/cli/deploy)
- [部署了但服务器没变，怎么查](/how-to/diagnose-not-updating)
