# 可选依赖还没构建

适用：monorepo 里有个子项目依赖另一个插件，但那个插件你还没构建（或它只在需要时才构建）。默认情况下这会挡住整个部署。

## 现象

```bash
$ mcsdev deploy
✖ cable: 没有匹配到 jar（Lapis-Cable/build/libs/Lapis-Cable-*.jar）—— 先构建，或写 required: false
```

`deploy` 的规则是：**条目级错误只挡住被点名的条目**。

- `mcsdev deploy` → 检查所有条目，有任何条目报错就整体失败（避免「以为全装上了」）。
- `mcsdev deploy pipez` → 只检查 `pipez`，`cable` 的缺失完全不影响。

所以最快的绕法是指名部署。但如果这个条目本来就该是「有就装，没有就算了」，用 `required`。

## 做法

```yaml
plugins:
  - id: cable
    path: Lapis-Cable/build/libs/Lapis-Cable-*.jar
    required: false
```

改完再跑：

```bash
$ mcsdev deploy
⚠ cable: 没有匹配到 jar（Lapis-Cable/build/libs/Lapis-Cable-*.jar）—— required: false，跳过
✔ pipez: 部署 Lapis-Pipez-0.1.59.jar
  ── 1 部署 · 0 已是最新 · 0 失败
```

警告还在（你该知道它没装），但不再阻塞。

## `required: false` 的准确语义

| 情况 | `required: true`（默认） | `required: false` |
| --- | --- | --- |
| glob 命中 0 个文件 | 错误，退出码 1 | 警告，跳过该条目 |
| 目录不存在 | 错误 | 警告，跳过 |
| 命中但被 `exclude` 全排掉 | 错误 | 警告，跳过 |
| 命中 1 个 | 部署 | 部署 |
| 命中多个 | 取最新（`newest`） | 取最新（`newest`） |

它**只影响「没有产物」这一件事**，不影响复制失败、清理失败这类真实错误。

## 什么时候该用它

- 插件有「软依赖」结构：`pipez` 是核心，`pipez-extra` 是可选的扩展，别人 clone 下来不一定构建扩展。
- monorepo 里混着参考源码/模板目录，`init` 已经把它们注释掉了，但你想留着条目以便按需启用。
- 你只想跑 `mcsdev dev` 而不想先构建全部 8 个子项目。

## 什么时候不该用它

- 这个插件**必须**在服务器上，缺了服务器会报 `Unknown dependency`。这时宁可让部署失败，也不要让一个静默的警告变成半小时的排查。
- 你在 CI 里跑。CI 里「少了东西但退出码 0」是最糟的组合 —— 那种情况下保持 `required: true`，让流水线红掉。

## 相关

- [`required` 字段参考](/reference/mcsdev-yml#plugins-条目字段)
- [只部署一个子项目](/how-to/deploy-one-subproject)
