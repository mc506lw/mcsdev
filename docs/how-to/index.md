# 操作指南

操作指南是**任务导向**的：你已经有目标，只需要步骤。这里不教基础（那是[教程](/tutorial/)的事），也不解释设计理由（那是[理解](/explanation/)的事）。

## 什么时候该看这个

- 你知道自己要做什么，但不确定用哪条命令、哪个字段；
- 你遇到了具体现象（部署了没生效 / 命中了一堆历史 jar / 换了个 JDK）需要处理；
- 你要把 mcsdev 接进别人的流程（CI、脚本、同事的机器）。

## 按任务找

### 部署相关

| 我想… | 看这个 |
| --- | --- |
| 只部署 monorepo 里的一个子项目 | [只部署一个子项目](/how-to/deploy-one-subproject) |
| 让 `build/libs` 里那几十个历史 jar 不要全被部署 | [处理多份产物](/how-to/handle-many-jars) |
| 有个可选依赖还没构建，别让它挡住其他部署 | [可选依赖还没构建](/how-to/optional-dependencies) |
| 从配置里删掉一个插件后，清掉服务器上残留的 jar | [清理残留 jar](/how-to/clean-stale-jars) |
| 部署完自动重启服务器 | [配置自动重启](/how-to/configure-restart) |

### 排查

| 我想… | 看这个 |
| --- | --- |
| 搞清楚「部署成功了但游戏里没变化」 | [部署了但服务器没变，怎么查](/how-to/diagnose-not-updating) |

### 环境与实例

| 我想… | 看这个 |
| --- | --- |
| 启停/重置/重建 mcsdev 管理的实例 | [管理实例生命周期](/how-to/manage-instances) |
| 换 JDK、检查 JDK 能不能用 | [管理 JDK](/how-to/manage-jdk) |

### 流程

| 我想… | 看这个 |
| --- | --- |
| 在 CI 里校验 `mcsdev.yml` | [在 CI 里使用](/how-to/use-in-ci) |
| 从 `mcsdev run` 的老用法换成 `mcsdev.yml` | [从 run 迁移](/how-to/migrate-from-run) |

## 一条通用排查路径

遇到「不对劲」时，按这个顺序走，四步能定位绝大多数问题：

```bash
mcsdev config          # 1. 配置想干什么（命中/排除/将清理）
mcsdev ps              # 2. 服务器上现在是什么（只读）
mcsdev deploy --dry-run # 3. 真跑的话会改什么（不写盘）
mcsdev logs -f         # 4. 服务器自己说了什么
```
