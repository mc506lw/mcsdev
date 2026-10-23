# `mcsdev run`

记忆式启动：选实例与 jar → 部署 → 前台启动 → 日志回流。这是 `mcsdev.yml` 之前的旧工作流，现在仍然可用。

```
mcsdev run [options] [version]
```

## 参数

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `[version]` | 位置参数 | 从项目依赖探测，探测不到则交互选择 | MC 版本，如 `1.20.4` |
| `--forget` | 开关 | 关 | 清除该版本的「实例 + jar」选择记忆后退出 |

## 前置条件

必须先 `mcsdev setup`（需要 `root`）：

```
✖ 尚未初始化：请先运行 mcsdev setup
```

## 决策流程

```
run 1.20.4
  ├─ 版本：参数 > 项目探测（build.gradle / gradle.properties / libs.versions.toml）> 交互选择
  ├─ 扫产物目录：项目 libs 目录、./build/libs、./libs、./plugins
  ├─ 查记忆（键 = 版本 + 产物集合指纹）
  │    ├─ 命中且实例与 jar 都还有效 → 直接用，零提问
  │    └─ 未命中 / 已失效 → 走下面
  ├─ 选实例：该版本下 0 个 → 问是否新建；1 个 → 直接用；多个 → 弹选（含「新建实例…」）
  ├─ 选 jar：0 个 → 报错；1 个 → 直接用；多个 → 弹选
  ├─ 写记忆
  ├─ 复制 jar 到 <实例>/plugins/
  └─ 已在运行 → 先停 → 前台启动 → 等待退出
```

## 记忆的准确语义

- 键 = `(MC 版本, 产物集合指纹)`，指纹 = 排序后每个 jar 的 `文件名:大小:mtime` 用 `;` 连接。
- **同名 jar 内容变了不会失效** —— 重新构建后直接部署正是想要的。
- 多一个 / 少一个 jar、文件名变了、mtime 变了 → 键变化 → 重新问。
- 记忆存在 `~/.mcsdev/run-memory.json`，只在本机有效。
- 记忆命中后仍会校验：实例还在注册表里、jar 还在当前产物列表里，否则警告「上次的选择已失效（实例或 jar 变化），重新选择」。

清除记忆：

```bash
mcsdev run 1.20.4 --forget
```

它清掉该版本**所有**记忆条目（不只当前指纹那条）。

## 前台行为

`run` 是前台运行的：

- 服务器 stdout/stderr 直接回显到终端（带级别着色）；
- 你的 stdin 直通给服务器进程（TTY 下），可以直接敲 `stop`、`op <玩家>`、插件命令；
- Ctrl+C → 先向服务器发 `stop` 等世界保存，再退出。

已在运行的实例会被先停掉再启动，并警告：

```
⚠ 实例 test1 正在运行（PID 12345），执行重启…
```

## 部署行为

只做一件事：把选中的 jar **原子复制**到 `<实例>/plugins/<原文件名>`。

它**不**做这些（这是 `mcsdev.yml` 的工作流才有的事）：

- 不清理同前缀旧版本（`clean`）；
- 不写部署清单（所以 `prune` 看不到它放的文件）；
- 不监视产物；
- 不按 `restart` 策略重启（它自己就是那个进程）。

所以不要在同一个 `plugins/` 目录上混用 `run` 和 `dev` —— 见[从 run 迁移](/how-to/migrate-from-run)。

## 输出示例

```
✔ 沿用上次选择：test1 → MyPlugin-1.2.0.jar
→ 部署 MyPlugin-1.2.0.jar → test1/plugins/
✔ 部署完成
✔ 实例 test1 已启动：控制台输入 stop 可优雅停止；Ctrl+C 中断并强制停止
[12:00:00 INFO]: Done (3.412s)! For help, type "help"
...
✔ run 会话结束
```

## 退出码

| 情况 | 退出码 |
| --- | --- |
| 正常结束（服务器自己退出 / 你敲了 `stop`） | 0 |
| 未 setup / 找不到产物 jar / 版本列表拉取失败 | 1 |
| Ctrl+C | 130 |

错误路径统一返回 1，所以 `mcsdev run 1.20.4 && 下一步` 是安全的。

注意 `run` 是前台长驻命令：退出码 0 只代表「会话结束了」，不代表服务器在这期间没崩过 —— 想判断服务器状态用 `mcsdev ls` 或看日志。

## 相关

- [`dev`](/reference/cli/dev)
- [从 run 迁移到 mcsdev.yml](/how-to/migrate-from-run)
- [用 mcsdev 管一台测试服](/tutorial/managed-instance)
