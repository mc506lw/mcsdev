# 为什么用声明式配置

`mcsdev.yml` 是「这个插件项目要用哪台测试服、产物从哪来、怎么部署」的唯一描述。为什么需要它，而不是把一切都做成命令行参数？

## 没有它的时候是什么样

mcsdev 早期的工作流是 `mcsdev run`：

```bash
mcsdev run 1.20.4
# 选实例 → 选 jar → 部署 → 启动
```

它把选择记在 `~/.mcsdev/run-memory.json` 里，第二次零提问。这个设计在**单机单人**场景下体验很好，但它有三个结构性缺陷：

### 1. 知识在机器里，不在项目里

新同事 clone 你的仓库，跑 `mcsdev run` 会被问一堆问题：用哪个实例？部署哪个 jar？他有 8 个 jar 要选。

答案在**你的** `run-memory.json` 里，不在 git 里。所以他要么问你，要么自己猜。

### 2. 只能一次部署一个 jar

monorepo 里 8 个插件要装。`run` 一次装一个，装完启动。想装第二个？再跑一次，重启一次。

### 3. 没有「收敛」的概念

`run` 是「做一件事」，不是「让系统达到某个状态」。所以它：

- 不清理旧版本（它不知道「这个插件应该只有一份」）；
- 不记录自己放了什么（所以没法安全地清理）；
- 不能回答「现在服务器上装的和我想装的一致吗」。

## 声明式换来了什么

```yaml
version: 1
name: pylon
link: 'E:\Minecraft\开发\Pylon开发'
plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
  - id: cable
    path: Lapis-Cable/build/libs/Lapis-Cable-*.jar
restart:
  type: command
  run: ./restart-dev-server.sh
```

| 收益 | 具体表现 |
| --- | --- |
| 进 git，可 review | 加一个插件就是 diff 里的一行；改路径有记录、有理由 |
| 团队共享 | 同一份文件，每人只改 `link`（机器相关的那一项） |
| 可校验 | `mcsdev config` 把它解析成「命中几个、部署哪个、删哪个」，错误在部署前暴露 |
| 可进 CI | `config --json` 退出码即校验结果，不需要服务器 |
| 幂等 | 跑一次和跑十次结果相同（除了重启次数） |

最后一条是核心。声明式系统的价值不在「写起来方便」，而在「**描述的是目标状态，而不是操作序列**」。操作序列会因为当前状态不同而失效，目标状态不会。

## 为什么不是一堆命令行参数

因为参数会组合爆炸：

```bash
mcsdev deploy --link X --plugin "Lapis-Pipez/build/libs/*.jar" \
  --rename Pipez.jar --clean --newest --restart command \
  --restart-run ./restart.sh --debounce 800 ...
```

而且它不可持久化 —— 你每天都要敲一遍，或者写进一个 shell 脚本，然后那个脚本变成事实上的配置文件，只是没有 schema、没有校验、没有注释。

## 为什么不是「写个 shell 脚本」

有人会说：这不就是 `cp` + `curl` + `kill` 吗？是，但脚本缺三样东西：

1. **校验**：脚本不会在动手前告诉你「这个 glob 一个都没匹配到」；
2. **幂等**：脚本不会自己判断「内容没变，跳过」；
3. **可观测**：脚本不会输出「3 个条目命中 41 个文件，排除了 41 个，最终部署 1 个，将清理 1 个旧版」。

这三样恰好是排查成本最高、也最容易被省掉的部分。mcsdev 的 `config` / `ps` / `deploy --dry-run` 都是围绕它们设计的。

## 为什么是 YAML

- 需要**注释**：`mcsdev init` 生成的模板里全是注释（「这 41 个历史 jar 只会部署最新的那个」）。JSON 做不到，TOML 能做但层级结构写起来更啰嗦。
- 需要**宽松**：允许字符串简写（`- build/libs/*.jar` 等价于一个只写 `path` 的条目）。
- 不需要**复杂类型**：这份配置没有嵌套数组、没有联合类型，YAML 的复杂度陷阱用不上。

解析器是 `yaml` 包，不支持自定义标签 —— 所以别在 yml 里写 `!!` 之类的东西。

## 代价：schema 必须诚实

声明式配置有一个隐蔽的失败模式：**配置里写了，但工具没实现**。这时用户会以为配置生效了。

所以 mcsdev 的选择是：**未实现的字段直接报错**。

```yaml
config:
  view-distance: 8
```

```
✖ config: 尚未实现 —— 当前版本不会把这些键写进 server.properties。请删掉这一段（等 v0.2）
```

同样的处理也在 `onStart` 上。这看起来很不友好（明明能解析却不接受），但它避免的是更糟的情况：`config` 命令显示「配置可用」，而你花了半天排查为什么 `view-distance` 没生效。

**接受一个字段 = 承诺它生效。** 没做到就不接受。

## 代价：删除没有对应的源

声明式系统有一个经典难题：新增有源（yml 里那行），删除没有源（那行没了，但目标文件还在）。

`deploy` 是「按配置复制」，所以删掉一个条目之后，`plugins/` 里那个 jar 会永远留着 —— 服务器还在加载它，而你已经在配置里看不到它了。

mcsdev 的解法是**部署清单**：每次部署时记下「谁放的」（包括「已是最新」的条目）。`prune` 只删清单里、且当前配置不再产出的文件。这是唯一能既安全（不误删手工文件）又有效（能清掉残留）的办法。

代价是多一个状态文件（`plugins/.mcsdev-manifest.json`），以及「必须先部署过一次，prune 才有依据」这个前提 —— 换机器、删过清单之后，跑一次 `deploy` 就能重建。

## 代价：机器相关的部分无法共享

`link` 里是绝对路径，每人不同。这是这份配置里唯一不 portable 的东西。

现在可以把它模板化 —— `link`（路径形式）和 `plugins[].path` 都支持 `${VAR}` / `$VAR` 环境变量：

```yaml
link: '${MCSDEV_SERVER}'
plugins:
  - path: '${MCSDEV_BUILD_ROOT}/MyPlugin-*.jar'
```

```bash
export MCSDEV_SERVER='E:\Minecraft\开发\Pylon开发'
mcsdev dev
```

未定义的变量**保留原样**（不会变成空串），所以配错时你看到的是 `link 指向的目录不存在：E:\dev\${MCSDEV_SERVER}`，而不是一个悄悄指向别处的空路径。

这仍然不是零成本：环境变量要有人设置，新同事得知道该设哪些。但至少「机器相关的部分」从「必须改文件」变成了「必须设一个变量」，yml 本身可以原样提交。

## 相关

- [为什么是 link 模式](/explanation/why-link-mode)
- [从 run 迁移到 mcsdev.yml](/how-to/migrate-from-run)
- [mcsdev.yml 字段参考](/reference/mcsdev-yml)
