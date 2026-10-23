# 5 分钟快速上手

这条路径假设你已经有两样东西：

1. 一个能 `gradlew build` 出 jar 的插件项目（或 monorepo）；
2. 一台能跑起来的服务器目录（Paper / Folia / Leaf / Spigot 都行），你平时手动往里丢 jar 的那种。

目标：**改一行代码 → 构建 → 服务器自动重启**，全程不离开终端。

> 没有现成的服务器目录？走[用 mcsdev 管一台测试服](/tutorial/managed-instance)，让 mcsdev 建一台。

## 1. 在插件项目里生成配置

```bash
cd /path/to/your-plugin
mcsdev init --link "/path/to/your/server"
```

`init` 会扫描当前目录：

- 根目录有 `build.gradle(.kts)` / `pom.xml` → 单项目模式；
- 否则扫一级子目录，每个带构建文件的算一个子项目（monorepo 模式）；
- 从已有的 jar 文件名推导插件前缀，直接生成能命中的 glob。

`--link` 指向服务器**目录**（不是 jar，不是启动脚本）。生成结果：

```yaml
version: 1
name: your-plugin

link: /path/to/your/server
plugins:
  - id: yourplugin
    path: build/libs/YourPlugin-*.jar

restart:
  type: none
dev:
  watch: true
  debounce: 800
```

## 2. 看它解析成了什么

```bash
mcsdev config
```

这一步值得养成习惯。它会打印每个条目命中了几个文件、排除了几个、最终要部署哪一个、会删掉哪些旧版本。声明式配置最常见的坑是「glob 没命中」和「以为部署了 A 结果部署了 B」，`config` 让这两件事当场可见。

如果显示 `配置可用 —— N 个条目 · M 个 jar`，继续。有红字就先修。

## 3. 看一眼服务器上现在装的是什么

```bash
mcsdev ps
```

只读，不改任何文件。输出每行一个条目：`最新` / `落后` / `未部署` / `已禁用` / `缺产物`。

## 4. 预演一次部署

```bash
mcsdev deploy --dry-run
```

`--dry-run` 承诺不改任何文件，连 `plugins/` 目录都不会创建。确认它要复制的文件名是你要的那个。

## 5. 开始开发循环

```bash
mcsdev dev
```

它会先立刻部署一轮，然后进入 watch：

```
✔ 进入 watch 模式
   监视 /path/to/your-plugin/build/libs
   防抖 800ms · 轮询 500ms · Ctrl+C 退出
⚠ dev 只 watch 构建产物，不负责编译 —— 改完代码记得先构建
  ? 想让它自动构建：在 mcsdev.yml 的 dev 段写 build: "gradlew build"
⚠ 重启策略是 none —— 每次部署后需要你手动重启服务器才会生效
  ? 想自动重启：在 mcsdev.yml 里配 restart（http 或 command）
```

两个 `⚠` 是重点：

- **`dev` 不编译**。它监视的是构建产物，不是源码。改完代码仍然要 `./gradlew build`。
- **link 模式的默认重启策略是 `none`**。mcsdev 不知道你那台服是怎么启停的，默认只部署。要自动重启，[配 restart](/how-to/configure-restart)。

## 6. 验证闭环

另开一个终端跑构建（或者在 IDE 里点构建）：

```bash
./gradlew build
```

`mcsdev dev` 那个窗口会在产物写稳之后（默认防抖 800ms）自动部署，并打印一轮结果。配置了自动重启的话，它还会等到端口真的可连才打勾。

## 7. 结束

在 `mcsdev dev` 的窗口按 Ctrl+C。如果 mcsdev 自己托管着服务器（`restart.type: mcsdev`），它会先优雅停服再退出。

## 到这里你就有的东西

- 一份进 git 的 `mcsdev.yml`；
- 一条 `mcsdev dev` 的开发循环；
- 一套可查的状态命令：`config`（想干什么）、`ps`（现在是什么）、`deploy --dry-run`（会改什么）。

## 接下来

- 让部署后自动重启 → [配置自动重启](/how-to/configure-restart)
- monorepo 只想部署其中一个 → [只部署一个子项目](/how-to/deploy-one-subproject)
- 想完整学一遍并理解每一步 → [教程](/tutorial/first-dev-loop)
