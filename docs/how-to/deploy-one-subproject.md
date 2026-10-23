# 只部署 monorepo 里的一个子项目

适用：monorepo 里有 8 个插件子项目，你只想让其中 1 个进服（或者只重启一次，不想被其他工程还没构建连坐）。

## 先确认 id

`deploy` 和 `dev` 都用 **id** 点名，不是目录名。id 从 `mcsdev config` 里看：

```bash
mcsdev config
```

```
plugins  8 条
  1. pipez
     path    Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
  2. cable
     path    Lapis-Cable/build/libs/Lapis-Cable-*.jar
```

`pipez`、`cable` 就是 id。它们在 `mcsdev.yml` 里由 `id:` 显式指定，不写时从 `path` 推导。

## 只部署一次

```bash
mcsdev deploy pipez
```

只部署 `pipez` 这一条，其他条目完全不被检查、不被触碰。

这带来一个重要性质：**没被点名的条目出错不会挡住你**。比如 `cable` 还没构建、glob 命中 0 个，`mcsdev deploy` 会失败，但 `mcsdev deploy pipez` 照样成功。

## 只 watch 一个子项目

```bash
mcsdev dev pipez
```

只监视 `pipez` 的产物目录，只部署 `pipez`。多个用空格隔开：

```bash
mcsdev dev pipez cable
```

`dev` 的 watch 目录是从条目的 `path` 反推出来的（取 glob 的目录部分）。所以 `path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar` 意味着监视 `Lapis-Pipez/build/libs`。

## 写错 id 会怎样

```bash
$ mcsdev deploy pipezz
✖ 未知工程：pipezz
  ? 可选：pipez, cable, sidedio, ...
```

它不会「尽力猜一个」，也不会先报错再继续跑 —— 那样会让你盯着一个无关的错误找半天。

## 常见变体

**两个子项目共享同一份产物目录**：给它们不同的 `id`，用 `exclude` 区分：

```yaml
plugins:
  - id: pipez-main
    path: build/libs/Pipez-*.jar
    exclude: ['*-all.jar']
  - id: pipez-all
    path: build/libs/Pipez-*-all.jar
```

**暂时停用一个条目**：注释掉它，然后 `mcsdev prune --dry-run` 看它会不会被清掉（不会 —— 注释掉的条目不再产出，清单里的记录会变成残留候选）。见[清理残留 jar](/how-to/clean-stale-jars)。

## 注意

`--only` 只影响「部署哪些条目」，不影响重启策略。`mcsdev dev pipez` 部署成功后，仍然按 `restart.type` 决定怎么重启 —— 也就是说，如果 `restart.type` 是 `command`，它执行的是重启整台服务器，而不是只重载这一个插件。这是刻意的：mcsdev 不支持热重载，理由见[为什么重启而不是热重载](/explanation/why-restart-not-hot-reload)。
