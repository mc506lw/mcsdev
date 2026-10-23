# `mcsdev init`

在当前项目生成 `mcsdev.yml`。它会自动探测构建产物与 monorepo 子项目，目标是「零输入可用」。

```
mcsdev init [options]
```

## 参数

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--link <target>` | 字符串 | 见下 | 绑定目标：mcsdev 实例名，或服务器目录路径 |
| `--name <name>` | 字符串 | 当前目录名（小写化、非字母数字转 `-`） | 写入 yml 的 `name` |
| `--force` | 开关 | 关 | 覆盖已存在的 `mcsdev.yml` |
| `--dry-run` | 开关 | 关 | 只打印将生成的内容，不写文件 |

## 已存在时的行为

当前目录已有 `mcsdev.yml` / `mcsdev.yaml` 时直接拒绝，不覆盖：

```
✖ mcsdev.yml 已存在：E:\dev\pylon\mcsdev.yml
  ? 要重新生成请加 --force（会覆盖，注意先备份你的改动）
```

## `--link` 省略时的行为

| 情况 | 行为 |
| --- | --- |
| 恰好有 1 个已注册实例 | 自动用它，并警告 |
| 有多个实例 | 报错，要求 `--link` 指定（会列出可选实例名） |
| 没有实例 | 报错，提示可以指向已有服务器目录，或先 `setup` + `new` |

## 探测规则

### 单项目 vs monorepo

1. 当前目录有 `build.gradle.kts` / `build.gradle` / `pom.xml` → **单项目模式**；
2. 否则扫描**一级子目录**，每个含上述构建文件的算一个子项目 → **monorepo 模式**；
3. 跳过以 `.` 开头的目录和 `node_modules`。

产物目录：Gradle 是 `build/libs`，Maven 是 `target`。

### 生成的 `path`

从该子项目 `build/libs` 里最新的 jar 文件名推导前缀：

| 最新 jar | 推导结果 | 生成的 path |
| --- | --- | --- |
| `Lapis-Pipez-0.1.59.jar` | 前缀 `Lapis-Pipez`，带版本号 | `<sub>/build/libs/Lapis-Pipez-*.jar` |
| `MyPlugin.jar` | 前缀 `MyPlugin`，无版本号 | `<sub>/build/libs/MyPlugin.jar` |
| 目录里没有 jar | 无法推导 | `<sub>/build/libs/*.jar`，并加注释提醒你首次构建后改这一行 |

区分「带版本号」和「不带」是必要的：无版本号时如果硬生成 `MyPlugin-*.jar` 就一个都匹配不到。

### 生成的 `id`

取子目录名，去掉「厂商前缀」后小写去符号。

厂商前缀的判定：多个子目录共有的第一段，且长度 3–8（长度约束是关键：`Lapis`(5) 是厂商名，`IronFurnaces`(12) 只是同名项目的副本前缀）。出现 ≥2 次才算。

| 子目录 | 厂商前缀 | 生成的 `id` |
| --- | --- | --- |
| `Lapis-Pipez` | `Lapis` | `pipez` |
| `Lapis-Cable` | `Lapis` | `cable` |
| `Sided-IO` | — | `sidedio` |

### 没有产物的子项目

被写成注释，不启用：

```yaml
# ---- 以下子项目还没有构建产物，默认没启用（像是参考源码/模板，需要就取消注释）----
#  - id: template
#    path: 'template/build/libs/*.jar'
```

### `restart` 段的默认值

由 `--link` 指向什么决定：

| link 指向 | 生成 |
| --- | --- |
| mcsdev 实例 | `type: mcsdev`（附注释说明会用优雅停服） |
| 外部目录 | `type: none`（附注释给出 `http` / `command` 两种改法） |

### 版本探测

从构建文件里尽力推断 MC 版本（优先 `paper` 附近的 `1.x`），做合理性校验（次版本 8–30 之间），成功时写进 `server` 段的注释示例里。探测失败不影响生成。

## 示例

```bash
# monorepo，指向外部开发服
mcsdev init --link 'E:\Minecraft\开发\Pylon开发'

# 单项目，指向 mcsdev 实例
mcsdev init --link test1 --name my-plugin

# 先看看会生成什么
mcsdev init --link test1 --dry-run

# 重新生成（会覆盖）
mcsdev init --link test1 --force
```

## 退出码

| 情况 | 退出码 |
| --- | --- |
| 生成成功 | 0 |
| yml 已存在且未加 `--force` | 1 |
| 没有可用 link（多实例未指定 / 无实例） | 1 |
| 写文件失败 | 1 |

## 相关

- [mcsdev.yml 字段参考](/reference/mcsdev-yml)
- [从 run 迁移到 mcsdev.yml](/how-to/migrate-from-run)
