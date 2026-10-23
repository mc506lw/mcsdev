# 教程

教程是**学习导向**的：你照着做，它保证结果。这里不解释设计取舍，也不给「你也可以选另一种」的分支 —— 想看分支去[操作指南](/how-to/)，想看理由去[理解](/explanation/)。

## 什么时候该看这个

- 你从没跑过 mcsdev，想完整走一遍并理解每一步在干什么；
- 你想知道「一个 monorepo 八个插件共用一个开发服」这种真实场景是怎么配起来的；
- 你跑通过快速上手，但想搞清 `config` / `ps` / `dev` 三者分别在什么时候用。

## 两篇教程

| 教程 | 适合谁 | 你会得到 |
| --- | --- | --- |
| [从零到「改一行代码自动重启」](/tutorial/first-dev-loop) | 已经有一台跑着的开发服（外部 Leaf / Paper / Spigot），想让 mcsdev 往里部署 | 一份 monorepo 的 `mcsdev.yml`、自动重启、以及一条可用的开发循环 |
| [用 mcsdev 管一台测试服](/tutorial/managed-instance) | 没有现成服务器，或者想要一台跟别人隔离的干净服 | `setup` → `new` → `run` 建一台实例并跑起来，理解实例与 link 的关系 |

两篇都从零开始，互不依赖。第二篇结束时你会明白为什么第一篇里 `restart.type` 是 `none`。

## 教程之外

教程不覆盖的东西，按性质分流：

- 「我要在 CI 里跑」「我要清理残留 jar」→ [操作指南](/how-to/)
- 「clean 为什么默认 true」→ [理解](/explanation/)
- 「`newest` 的默认值到底是什么」→ [参考](/reference/mcsdev-yml)
