# 参考

参考是**信息导向**的：准确、完整、干燥。它不教你做事，只描述事实 —— 某个命令有哪些参数、某个字段的默认值是什么、某个文件里有什么。

## 什么时候该看这个

- 你要确认某个参数的准确拼写（`--no-restart` 还是 `--noRestart`）；
- 你要知道某个字段不写时的默认值；
- 你要写脚本，需要知道 `--json` 的输出结构和退出码；
- 你想知道某个文件在哪、里面有什么。

## 目录

### 命令

| 页面 | 内容 |
| --- | --- |
| [命令行总览](/reference/cli/) | 全部命令、全局行为、退出码、Ctrl+C 语义 |
| [init](/reference/cli/init) | 生成 `mcsdev.yml` |
| [config](/reference/cli/config) | 打印解析结果（含 `--json` 结构） |
| [ps](/reference/cli/ps) | 只读状态 |
| [deploy](/reference/cli/deploy) | 部署一次 |
| [dev](/reference/cli/dev) | 开发循环 |
| [prune](/reference/cli/prune) | 清理残留 jar |
| [exec](/reference/cli/exec) | 向服务器发送命令（RCON） |
| [setup](/reference/cli/setup) | 首次环境配置 |
| [new](/reference/cli/new) | 创建实例 |
| [run](/reference/cli/run) | 记忆式启动 |
| [ls](/reference/cli/ls) | 列出实例 |
| [java](/reference/cli/java) | JDK 管理 |
| [start / stop / restart / logs / rebuild / reset](/reference/cli/lifecycle) | 实例生命周期 |

### 配置与文件

| 页面 | 内容 |
| --- | --- |
| [mcsdev.yml 字段](/reference/mcsdev-yml) | 每个字段的类型、默认值、语义、校验规则 |
| [文件与目录](/reference/files) | `~/.mcsdev/`、实例目录、`plugins/.mcsdev-manifest.json` |
| [环境变量](/reference/env) | `MCSDEV_HOME`、`MCSDEV_PAPER_BASE` |

## 约定

文档里的「默认值」都指**不写这个字段时**的行为。写着「必填」的字段缺失时，命令会以退出码 1 结束并打印原因，不会静默使用猜测值。

命令行参数的写法遵循 POSIX 惯例：短选项 `-f`，长选项 `--force`。布尔开关的否定形式由 commander 生成，例如 `--no-restart`（没有 `--restart` 这个正向开关）。
