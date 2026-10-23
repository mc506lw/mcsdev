# `mcsdev ls`

列出全部实例及其运行状态。

```
mcsdev ls
```

无参数、无选项。

## 输出

```
  test1               paper  1.20.4    端口 25565 运行中 (PID 12345)
      E:\dev\mcsdev-servers\test1
  foliatest           folia  1.21.1    端口 25566 已停止
      E:\dev\mcsdev-servers\foliatest
```

每两行一个实例：第一行是 `名称 / 核心 / 版本 / 端口 / 状态`，第二行是目录。

## 数据来源

| 项 | 来源 |
| --- | --- |
| 名称 / 核心 / 版本 / 端口 / 目录 | `~/.mcsdev/instances.json` |
| 运行状态 | 实例目录下的 PID 记录（不连服务器、不探测端口） |

所以 `ls` 是纯本地读取，很快，也不会因为服务器卡住而变慢。

## 没有实例时

```
⚠ 还没有实例
  ? mcsdev new 创建第一个实例
```

退出码仍然是 0。

## 与 `ps` 的区别

| | `ls` | `ps` |
| --- | --- | --- |
| 看什么 | mcsdev 管理的实例 | 某台服务器 `plugins/` 里装了什么 |
| 需要 `mcsdev.yml` | 不需要 | 需要 |
| 数据来源 | `~/.mcsdev/instances.json` | `<link>/plugins/` 实际文件 + 配置 |

## 相关

- [`new`](/reference/cli/new)
- [`start / stop / restart`](/reference/cli/lifecycle)
- [`ps`](/reference/cli/ps)
