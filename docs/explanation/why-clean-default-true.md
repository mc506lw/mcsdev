# 为什么 clean 默认是 true

`plugins[].clean` 的默认值是 `true`，意思是：**每次部署前，删掉目标目录里同前缀的其它版本 jar**。

这是一个会删你文件的默认值。它值得被解释清楚。

## 两个版本共存会发生什么

Bukkit / Paper 加载 `plugins/` 里所有 `.jar`。假设目录里有：

```
plugins/
├── Lapis-Pipez-0.1.58.jar
└── Lapis-Pipez-0.1.59.jar
```

两个 jar 里都有 `plugin.yml`，都声明 `name: Lapis-Pipez`。服务器的反应取决于版本和加载顺序，但常见结果只有两种，而且都很糟：

1. **只加载一个，另一个被忽略** —— 你无法知道加载的是哪个。你改的代码可能根本没生效。
2. **两个都加载** —— 同一个插件被实例化两次，监听器注册两次。症状是「发一条消息，聊天框出现两遍」「玩家进服执行两次入服逻辑」「计分板翻倍」。

第二种尤其恶劣：它看起来不像环境问题，像你的代码写错了。你会开始怀疑事件优先级、怀疑自己注册了两次监听器、怀疑另一个插件也在监听同一个事件 —— 而这些怀疑都指向错误的方向。

真实的 monorepo 场景里这不是假想：`build/libs/` 里能堆 41 个历史 jar（这是设计文档里记下的真实数字），如果不清理，部署几次之后 `plugins/` 里就会有几个版本共存。

## 为什么不默认关掉

「删文件」是危险操作，所以默认值本该保守 —— 但这里的风险不对称：

| | 默认 `clean: true` | 默认 `clean: false` |
| --- | --- | --- |
| 最常见的结果 | 目录里只有一个版本，行为符合预期 | 目录里逐渐堆积多个版本 |
| 失败表现 | 无 | 静默的双载、玄学 bug |
| 恢复成本 | 重新 `gradlew build` 就有了（构建产物不唯一） | 花半小时排查一个不存在的问题 |
| 数据丢失风险 | **极低**：删的是构建产物，源头还在 | 无 |

关键在于：**被删的文件是可以重新生成的**。`plugins/Lapis-Pipez-0.1.58.jar` 的唯一来源是 `Lapis-Pipez/build/libs/Lapis-Pipez-0.1.58.jar`，删掉 `plugins/` 里那份不影响源码、不影响 git、不影响构建。而双载带来的排查成本是不可逆的时间。

所以这是一个「删可再生文件」换「避免静默错误」的交易。

## 清理的边界

`clean` 不是「清空 `plugins/`」。它的范围被三个条件同时约束：

1. **只删 `.jar` 文件**（`clean` 的匹配显式要求 `.jar` 结尾，`.jaroff` 不动）；
2. **只删匹配 `<prefix>*` 的文件**，前缀从条目的 `path` 推导（`Lapis-Pipez-*.jar` → `Lapis-Pipez-`）；
3. **跳过本次要部署的同名文件** —— 那是覆盖，不是清理。

所以一个条目只会影响「它自己那个插件的旧版本」。`LuckPerms-5.4.jar` 这种你手工放的插件，永远不会被任何条目的 `clean` 碰到。

## 什么时候 `clean` 什么都不做

有一个刻意的空白：如果 `path` 的文件名部分是纯通配符，推导不出前缀：

```yaml
plugins:
  - path: build/libs/*.jar     # 前缀为空
```

这时 `clean` 不会执行，并给出警告：

```
⚠ pipez: path 的文件名部分是纯通配符（如 build/libs/*.jar），推导不出插件名前缀，
  因此不会清理旧版本。想自动清旧版请写成 build/libs/<插件名>-*.jar
```

原因还是「不猜」：`build/libs/*.jar` 可能匹配到多个不同插件，按什么前缀清理？如果按「删除所有不认识的 jar」来清，就会误删。所以它选择不做，并告诉你如何让它能做。

## 什么时候该关掉

```yaml
plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
    clean: false
```

少数合理场景：

- 你确实需要在 `plugins/` 里同时保留两个版本（比如做兼容性对照测试），并且能接受双载风险；
- 目标目录由别的工具管理，你只想让 mcsdev 复制文件、不参与清理；
- `prefix` 推导会误伤（比如你的插件名是另一个插件名的前缀：`Foo` 和 `FooBar`，而 `Foo-*` 会匹配到 `FooBar` 吗？不会 —— 前缀带尾部 `-`，`FooBar` 不匹配 `Foo-*`。但如果 `path` 写成 `build/libs/Foo.jar`，前缀就是 `Foo`，会匹配 `FooBar.jar`）。这种情况下显式写 `prefix: 'Foo-'` 更精确。

## 和 prune 的分工

`clean` 解决「同一个插件的多个版本」，`prune` 解决「已经不存在的条目留下的文件」。

```
你从 mcsdev.yml 里删掉一条 entry
  → 没有 entry，就没有 prefix，clean 无从下手
  → 只能靠部署清单 + prune
```

两者互补，都指向同一个目标：**`plugins/` 里的东西应该恰好等于配置描述的东西**。这是声明式配置的基本承诺。

## 相关

- [为什么用 sha256 判等而不是 mtime](/explanation/why-sha256-not-mtime)
- [清理配置里已删除的残留 jar](/how-to/clean-stale-jars)
- [`plugins` 条目字段](/reference/mcsdev-yml#plugins-条目字段)
