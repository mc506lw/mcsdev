# 清理配置里已删除的残留 jar

适用：你从 `mcsdev.yml` 里删掉了一个条目（或者某个条目换了产物名），但 `plugins/` 里那个旧 jar 还在 —— 服务器仍然在加载它。

## 为什么需要单独一步

声明式的承诺是「配置即真相」，但**删除**这件事没有对应的动作。`mcsdev deploy` 只会往里放东西、清同前缀的旧版本；它不会去猜「这个 jar 是不是已经没人要了」。靠文件名猜很危险 —— 你手工放进去的第三方插件和「配置里删掉的 jar」在文件系统上长得一模一样。

所以 mcsdev 用**部署清单**解决：每次部署（包括「已是最新」的那些）就把「哪个文件、属于哪个 id」记到 `<link>/plugins/.mcsdev-manifest.json`。`prune` 只删这份清单里、且当前配置不再产出的文件。

**手工放进 `plugins/` 的 jar 永远不在清单里，所以永远不会被删。**

## 先看会删什么

```bash
mcsdev prune --dry-run
```

```
  配置  E:\dev\pylon\mcsdev.yml
  目标  E:\Minecraft\开发\Pylon开发\plugins

将删除 2 个残留 jar：
  − Lapis-Legacy-0.3.1.jar   (entry「legacy」已从配置里删除)
  − Lapis-Pipez-0.1.50.jar   (pipez 的旧版本（当前配置不再产出）)

mcsdev dry-run：未删除任何文件
```

两类原因，注意区分：

| 原因 | 含义 |
| --- | --- |
| `entry「X」已从配置里删除` | 这个 id 整个不在配置里了 |
| `X 的旧版本（当前配置不再产出）` | id 还在，但它现在产出的文件名变了（比如加了 `rename`） |

## 真的删

```bash
mcsdev prune
```

会二次确认（默认 `否`）：

```
? 确认删除这 2 个文件？ › 否
```

跳过确认：

```bash
mcsdev prune --yes
```

删完提示：

```
✔ 已清理 2 个残留 jar
  ? 重启服务器后生效：mcsdev restart（或让 dev 处理）
```

**必须重启才生效** —— 被删的 jar 已经在 JVM 里加载着了，文件消失不会卸载它。

## 前提：得先有清单

清单是部署时写的。所以第一次用 `prune` 之前，至少要跑过一次 `deploy`（`dev` 也会写）。

如果你从没部署过（或者 `plugins/` 是别人手工维护的），`prune` 会拒绝行动：

```
mcsdev 没有部署记录（manifest 为空）—— 无法安全判断哪些 jar 是 mcsdev 放的
  ? 先跑一次 mcsdev deploy 建立记录；手工放入的插件永远不会被 prune 碰到
```

不需要 `--force`：「已是最新」的条目也会被记进清单。想确认清单覆盖了什么，直接看文件：

```bash
mcsdev deploy            # 跑一次即可（即使全部"已是最新"也会补记）
mcsdev prune --dry-run   # 再来看残留
```

## 不会被动到的东西

| 文件 | 会被 prune 删吗 | 为什么 |
| --- | --- | --- |
| 你手工放进 `plugins/` 的 jar | 不会 | 不在清单里 |
| `Foo.jaroff`（你手动禁用的） | 不会 | 清单记的是 `Foo.jar`，该路径已不存在，`prune` 跳过 |
| 服务器自己生成的 `plugins/某插件/` 配置目录 | 不会 | `prune` 只处理清单里的文件路径 |
| 清单本身 | 不会 | 只在删除成功后更新记录 |

## 配置有错时它拒绝执行

```
✖ config: 尚未实现 —— 当前版本不会把这些键写进 server.properties。请删掉这一段（等 v0.2）
  ? 配置有错时不建议 prune —— 先修好，否则"当前配置"不可信
```

这条规则值得理解：`prune` 的判断依据是「当前配置产出什么」。如果配置本身解析失败，那么「当前配置」就是不可信的，此时删文件等于凭一个坏掉的输入破坏磁盘。所以它宁可什么都不做。

## 相关

- [`prune` 命令参考](/reference/cli/prune)
- [部署清单](/get-started/concepts#部署清单-deployment-manifest)
- [为什么 clean 默认是 true](/explanation/why-clean-default-true)（`clean` 和 `prune` 解决的不是同一个问题）
