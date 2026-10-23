# 从 run 迁移到 mcsdev.yml

适用：你之前一直用 `mcsdev run`（交互选实例、选 jar、启动），现在想换成声明式配置。

## 两者的区别

`run` 是 mcsdev 早期的工作流，它解决的问题是「我不想记参数」：

```bash
mcsdev run 1.20.4
# → 选实例 → 选 jar → 复制到 plugins/ → 前台启动 → 日志回流
```

它把选择记住（`~/.mcsdev/run-memory.json`），第二次零提问。但它**只在你的开发机上有效**：

| | `mcsdev run` | `mcsdev.yml` + `dev` / `deploy` |
| --- | --- | --- |
| 选择记在哪 | `~/.mcsdev/run-memory.json`（本机） | 项目里的 yml（进 git，团队共享） |
| 能部署几个 jar | 一次一个 | 任意多个条目 |
| 会清理旧版本 | 不会 | 会（`clean`，默认开） |
| 会记录部署清单 | 不会 | 会（`prune` 依赖它） |
| 监视构建产物 | 不会 | 会（`dev`） |
| 重启策略 | 自己启动前台进程 | `mcsdev` / `http` / `command` / `none` |
| 适合 | 临时试一个 jar | 日常开发循环 |

## 迁移步骤

### 1. 生成配置，指向你常用的那个实例

```bash
cd /path/to/your-plugin
mcsdev init --link test1        # 你平时 run 时选的那个实例名
```

如果只有一个已注册实例，`--link` 可以省略（会自动用它并提示你）。

### 2. 检查产物路径

`init` 从已有 jar 推导前缀。如果你平时 `run` 时选的是某个特定名字的 jar（比如 `MyPlugin-1.2.0-all.jar`），确认 glob 能命中它：

```bash
mcsdev config
```

看到 `→ MyPlugin-1.2.0-all.jar  ⇒  plugins/...` 就对了。

如果原来选的是 `-all` 变体，而目录里还有非 `-all` 的 jar，`newest` 可能挑错。显式写清楚：

```yaml
plugins:
  - id: myplugin
    path: build/libs/MyPlugin-*-all.jar
```

### 3. 确认重启策略

`link` 指向实例时，`init` 会生成 `restart.type: mcsdev`。这意味着 `dev` / `deploy` 会**后台**重启实例，而不是像 `run` 那样前台占着终端。

如果你更喜欢前台看日志：

```bash
mcsdev logs test1 -f     # 另开一个窗口
```

### 4. 开始用 dev

```bash
mcsdev dev
```

从这一刻起，你的循环是「改代码 → 构建 → 自动部署 + 重启」，而不是「改代码 → 构建 → `mcsdev run 1.20.4`」。

## 迁移后仍然可以 run

`run` 没有被移除，也不会读 `mcsdev.yml`。它适合这些场合：

- 临时试一个不属于任何条目的 jar；
- 项目里还没有 yml（比如别人的仓库，你只想跑一次看看）；
- 你想要前台交互式控制台（`run` 会把你的 stdin 直通给服务器，`dev` 不会）。

⚠️ 但**不要两个混着用同一个 `plugins/` 目录**：`run` 会直接复制 jar 且不清理旧版本、不更新清单，结果就是 `plugins/` 里同前缀出现两个 jar（双载），`prune` 也看不到 `run` 放进去的文件。选一条路径，然后一直用它。

## 相关

- [`run` 命令参考](/reference/cli/run)
- [用 mcsdev 管一台测试服](/tutorial/managed-instance)
- [为什么用声明式配置](/explanation/why-declarative)
