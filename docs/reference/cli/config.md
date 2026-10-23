# `mcsdev config`

打印 `mcsdev.yml` 的解析结果。只读，不改任何文件。

```
mcsdev config [options]
```

## 参数

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--json` | 开关 | 关 | 输出 JSON（给脚本用），不输出人读格式 |

## 人读输出

```
mcsdev.yml  E:\dev\pylon\mcsdev.yml
  name      pylon
  模式      link → E:\Minecraft\开发\Pylon开发  (外部目录)
  重启      none（只部署，不重启）
  部署到    E:\Minecraft\开发\Pylon开发\plugins

plugins  8 条
  1. pipez
     path    Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
     glob    命中 41  排除 41
       – Lapis-Pipez-0.1.59-sources.jar  (排除)
       → Lapis-Pipez-0.1.59.jar  ⇒  plugins/Lapis-Pipez-0.1.59.jar
     clean   将删除 1 个旧版：Lapis-Pipez-0.1.58.jar
```

各行含义：

| 行 | 含义 |
| --- | --- |
| `模式` | `link → <目录> (mcsdev 实例 / 外部目录)`，或 `自建容器 <core> <mc>` |
| `世界` | 只有自建模式且写了 `world` 时出现 |
| `重启` | 生效的 `restart.type` 及其参数 |
| `部署到` | 实际写入的 `plugins/` 目录 |
| `path` | 条目原始 glob |
| `glob` | 命中几个、排除几个 |
| `→` | 最终部署哪个文件 ⇒ 目标文件名 |
| `clean` | 这次会删掉的旧版本 |

## `--json` 输出

```json
{
  "file": "/abs/path/mcsdev.yml",
  "name": "pylon",
  "link": {
    "dir": "/abs/server",
    "name": "server",
    "managed": false
  },
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
      "willClean": ["plugins/Lapis-Pipez-0.1.58.jar"],
      "warnings": [],
      "errors": []
    }
  ],
  "config": {},
  "warnings": [],
  "errors": []
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `file` | 字符串 | yml 绝对路径 |
| `name` | 字符串 | `name` 字段 |
| `link` | 对象或 `null` | `null` 表示自建模式。`managed` 为 `true` 时 `link` 指向 mcsdev 实例 |
| `serverDir` | 字符串 | 目标服务器目录绝对路径 |
| `restart` | 对象 | 生效的重启策略（`type` / 可能带 `url` / `run` / `timeoutMs`） |
| `plugins[].matched` | 字符串数组 | glob 命中的全部文件（相对 yml 目录） |
| `plugins[].excluded` | 字符串数组 | 被排除的（含默认排除） |
| `plugins[].chosen` | 字符串数组 | 最终部署的（`newest` 后可能只有 1 个） |
| `plugins[].rename` | 字符串或 `null` | 目标文件名 |
| `plugins[].willClean` | 字符串数组 | 将删除的旧版本（**相对 `mcsdev.yml` 所在目录**，不是相对 `plugins/`） |
| `config` | 对象 | `config` 段内容（当前非空会报错） |
| `errors` | 字符串数组 | **全局错误 + 所有条目错误**的合并视图 |

`--json` 模式下 stderr 没有人类提示，适合管道：

```bash
mcsdev config --json | jq '.plugins | length'
```

## 退出码

| 情况 | 退出码 |
| --- | --- |
| 配置可用 | 0 |
| 有任何错误（全局或条目级） | 1 |
| 找不到 / 读不了 `mcsdev.yml` | 1 |

`--json` 模式下即使退出码 1 也会打印完整的 JSON（便于 CI 里同时做断言和报错）。

## 什么时候用它

- 部署前确认 glob 命中数（0 就是写错了）；
- 想知道某个 jar 会不会被清掉；
- 脚本里读解析结果。

它不告诉你「服务器上现在是什么」—— 那是 [`ps`](/reference/cli/ps)；也不告诉你「真跑会改什么」—— 那是 [`deploy --dry-run`](/reference/cli/deploy)。

## 相关

- [mcsdev.yml 字段参考](/reference/mcsdev-yml)
- [在 CI 里使用](/how-to/use-in-ci)
