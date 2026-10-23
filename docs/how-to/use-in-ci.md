# 在 CI 里使用

适用：你想在流水线里校验 `mcsdev.yml`，或者在自托管 runner 上让 CI 把 jar 部署到一台测试服。

先说清楚边界：**mcsdev 是本地开发工具**，它的设计前提是「一台开发机 + 一台本地测试服」。在 CI 里它有价值的场景只有两类：

1. **校验配置**：`mcsdev.yml` 写错了就在 PR 上红掉，而不是等某个人跑 `deploy` 才发现。
2. **自托管 runner 上的部署**：runner 和测试服在同一台机器上，`link` 指向本地目录。

它不适合：部署到远程生产服务器（不是它的定位）、替代集成测试框架。

## 校验配置（不需要服务器）

`mcsdev config --json` 在解析失败时退出码为 1，成功时为 0。这是最省事的门禁。

```bash
node dist/cli.js config --json > /dev/null
```

只校验、不关心输出内容时把 stdout 丢掉即可；要诊断就把输出打到日志里。

`--json` 的结构是稳定的，可以直接拿来做断言（例如「必须正好有 8 个条目」）：

```json
{
  "file": "/abs/path/mcsdev.yml",
  "name": "pylon",
  "link": { "dir": "/abs/server", "name": "server", "managed": false },
  "serverDir": "/abs/server",
  "restart": { "type": "none" },
  "plugins": [
    {
      "id": "pipez",
      "path": "Lapis-Pipez/build/libs/Lapis-Pipez-*.jar",
      "matched": ["Lapis-Pipez/build/libs/Lapis-Pipez-0.1.59.jar"],
      "excluded": ["Lapis-Pipez/build/libs/Lapis-Pipez-0.1.59-sources.jar"],
      "chosen": ["Lapis-Pipez/build/libs/Lapis-Pipez-0.1.59.jar"],
      "rename": null,
      "willClean": [],
      "to": "",
      "warnings": [],
      "errors": []
    }
  ],
  "config": {},
  "warnings": [],
  "errors": []
}
```

注意 `errors` 是「全局错误 + 所有条目错误」的合并视图；条目自己的错误也在 `plugins[].errors` 里。

## GitHub Actions 示例

仓库里就有一个（本文档站自己的部署 workflow）。校验配置的 job 可以这样写：

```yaml
name: validate mcsdev.yml
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: 校验 mcsdev.yml
        run: node dist/cli.js config --json
        working-directory: examples/pylon    # 有 mcsdev.yml 的目录
```

要点：

- 用 `node dist/cli.js` 而不是 `mcsdev`，不依赖全局安装；
- `working-directory` 指向 `mcsdev.yml` 所在目录（命令会向上找 8 层，但显式更清楚）；
- 校验 job **不需要** JDK、不需要服务器目录存在。`link` 指向的目录不存在会报错 —— 如果 CI 上没有那台服，用 `MCSDEV_HOME` 隔离不够，得让路径存在，或者只在自托管 runner 上跑这一条。

## 自托管 runner 上的真实部署

```yaml
jobs:
  deploy:
    runs-on: [self-hosted, dev-server]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build
      - run: ./gradlew build
      - name: 部署
        run: node dist/cli.js deploy
        env:
          MCSDEV_HOME: ${{ runner.temp }}/mcsdev-home
```

`MCSDEV_HOME` 把 `~/.mcsdev` 挪到 runner 的临时目录，避免污染机器上的用户配置。link 模式下 `MCSDEV_HOME` 里其实没有关键状态（实例注册表才有），但隔离掉总是更安全。

注意 `deploy` 会按 `restart.type` 真的重启服务器。CI 里通常希望这样；不希望就加 `--no-restart`。

## 退出码约定

| 情况 | 退出码 |
| --- | --- |
| 成功 | 0 |
| 配置解析失败 | 1 |
| 被点名的条目没有产物 | 1 |
| 复制失败 | 1 |
| 重启失败（HTTP 非 2xx / 命令非 0 / 等待就绪超时） | 1 |
| Ctrl+C | 130（SIGINT）/ 143（SIGTERM） |

## 相关

- [`config` 命令参考](/reference/cli/config)
- [环境变量](/reference/env)
