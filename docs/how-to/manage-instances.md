# 管理实例生命周期

适用：你已经有 mcsdev 创建的实例，需要启停、看日志、重建配置、重置世界。

## 实例参数怎么填

`start / stop / restart / logs / rebuild / reset` 都接受一个可选参数，三种写法都行：

```bash
mcsdev stop test1      # 实例名（推荐）
mcsdev stop 1.20.4     # MC 版本，仅当该版本下只有一个实例
mcsdev stop            # 省略：只有一个实例时自动选中，多个则弹选
```

规则：

- 名字精确匹配优先；
- 只给版本、且该版本下有多个实例 → 报错要求用名字；
- 找不到 → 报错并提示「这里填实例名或 MC 版本；先 mcsdev ls 查看」；
- 一个实例都没有 → 提示 `mcsdev new`。

## 列出实例

```bash
mcsdev ls
```

```
  test1               paper  1.20.4    端口 25565 运行中 (PID 12345)
      E:\dev\mcsdev-servers\test1
  foliatest           folia  1.21.1    端口 25566 已停止
      E:\dev\mcsdev-servers\foliatest
```

「运行中」是读 PID 文件判断的，不需要连服务器。

## 启停

```bash
mcsdev start test1      # 后台启动，CLI 立刻返回
mcsdev stop test1       # 跨进程停止（Windows 上是 taskkill 强杀，见下）
mcsdev restart test1    # stop + start
```

后台启动时，服务器的 stdout 落到 `logs/console.log`（Paper 自己还会写 `logs/latest.log`）。所以：

- `mcsdev logs test1` 看的是 `logs/latest.log`（服务器自己的日志，格式带时间戳和级别）；
- 想看进程的原始 stdout（包括启动脚本的报错），看 `logs/console.log`。

## 看日志

```bash
mcsdev logs test1        # 从最后约 20KB 开始，打印后退出
mcsdev logs test1 -f     # 持续跟踪（每 500ms 检查追加）
```

`logs` 还支持两种「不是 mcsdev 实例」的目标，这让它在 link 模式下同样有用：

```bash
mcsdev logs "/path/to/server"   # 直接给服务器目录（目录里有 logs/latest.log 即可）
mcsdev logs                      # 当前项目有 mcsdev.yml 时，读 link 指向的目录
```

## 重建配置

```bash
mcsdev rebuild test1
```

它重新生成 `server.properties` 和 `eula.txt`，但**不碰 `world/` 和 `plugins/`**。

关键是它是**键级合并**而不是覆盖写：只改 mcsdev 管的那些键（`online-mode`、`view-distance`、`server-port`、世界类型相关等），保留服务器/版本自己的键（比如 `accepts-transfers` 这种新版本才有的项）。所以升级核心之后跑一次 `rebuild` 是安全的，不会把新版本的配置键抹掉。

运行中的实例需要重启才生效：

```bash
mcsdev rebuild test1 && mcsdev restart test1
```

## 重置

```bash
mcsdev reset test1
```

删掉 `world/`、`world_nether/`、`world_the_end/`、`logs/`，然后重建配置。`plugins/` 和 `server.jar` 保留。

两道保护：

- 实例正在运行 → 直接拒绝，让你先 `mcsdev stop`；
- 二次确认，默认是「否」。

适合：世界被测试搞脏了（爆破了地形、装了一堆实体、改了 gamerule），想回到干净状态。

## 一张表

| 命令 | 动 world/ | 动 plugins/ | 动 server.properties | 需要停止 |
| --- | --- | --- | --- | --- |
| `start` / `stop` / `restart` | 否 | 否 | 否 | — |
| `logs` | 否 | 否 | 否 | 否 |
| `rebuild` | 否 | 否 | 是（键级合并） | 否（但需重启才生效） |
| `reset` | **删除** | 否 | 是（重建） | **是** |

## 相关

- [`start / stop / restart / logs / rebuild / reset` 参考](/reference/cli/lifecycle)
- [用 mcsdev 管一台测试服](/tutorial/managed-instance)
