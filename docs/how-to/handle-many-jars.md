# 处理 build/libs 里的多份产物

适用：`build/libs/` 里躺着几十个 jar（历史版本、sources、javadoc、dev、plain……），你不想全被塞进 `plugins/`。

## 默认已经处理掉三件事

不配置任何东西，mcsdev 就会：

1. **排除干扰产物**。以下后缀的文件一律跳过（大小写不敏感，匹配文件名）：

   ```
   *-sources.jar  *-javadoc.jar  *-dev.jar  *-mojang-mapped.jar  *-plain.jar
   ```

2. **只取最新一个**。剩下的如果还有多个，先按**版本号**（从文件名解析，如 `Foo-1.2.5.jar`）取版本最高的；解析不出版本号时才按 mtime 取最新的那个。无论用哪种依据，都会打印一条警告告诉你它选了谁、依据是什么、怎么改。

3. **清理同前缀旧版本**。部署前删掉目标目录里 `<前缀>*.jar` 的其他 jar，避免服务器双加载同一个插件。

## 想装多个 jar：`newest: false`

```yaml
plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
    newest: false
```

`newest: false` 表示「匹配到几个就部署几个」。

⚠️ **不要同时对多产物条目用 `rename`**。`rename` 给所有选中的文件起同一个目标名，后一个会覆盖前一个。要多产物就别改名，或者写成多条 entry（各自 `path` + 各自 `rename`）。

## 想排除更多：`exclude`

`exclude` 是**文件名 glob 数组**，追加在默认排除之后：

```yaml
plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/*.jar
    exclude: ['*-all.jar', 'old-*.jar', '*-shaded.jar']
```

它只匹配 basename，不匹配路径。

## 想让目标文件名固定：`rename`

```yaml
plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/Lapis-Pipez-*.jar
    rename: LapisPipez.jar
```

`rename` 必须以 `.jar` 结尾（写错了会直接报错，因为服务器只认 `.jar`）。

固定目标名的好处：插件目录里不会因为版本号变化堆出多个文件，`ps` 的输出也稳定。坏处：看不出当前装的是哪个版本 —— `mcsdev ps` 会显示构建产物名和已装名两列，正好补上这点。

## 前缀推导与「不清理」的情况

`clean` 靠**前缀**找旧版本。前缀默认从 `path` 推导：

| `path` 的文件名部分 | 推导出的前缀 | 会清理 |
| --- | --- | --- |
| `Lapis-Pipez-*.jar` | `Lapis-Pipez-` | `Lapis-Pipez-0.1.58.jar` 等 |
| `MyPlugin.jar` | `MyPlugin` | `MyPlugin.jar` 之外的 `MyPlugin*` |
| `*.jar`（纯通配） | 空 | **不清理**，并警告 |

第三种情况是常见坑：

```
⚠ pipez: path 的文件名部分是纯通配符（如 build/libs/*.jar），推导不出插件名前缀，
  因此不会清理旧版本。想自动清旧版请写成 build/libs/<插件名>-*.jar
```

想显式指定前缀：

```yaml
plugins:
  - id: pipez
    path: Lapis-Pipez/build/libs/*.jar
    prefix: Lapis-Pipez-
```

## 手动禁用的插件（`.jaroff`）

有些人用改名的办法禁用插件：`Foo-1.0.jar` → `Foo-1.0.jaroff`。

mcsdev 部署同名 jar 等于替你重新启用了它，所以会明确告知：

```
⚠ pipez: plugins/ 里有 Lapis-Pipez-0.1.59.jaroff（你手动禁用过这个插件）。
  部署会把 Lapis-Pipez-0.1.59.jar 放回去，等于重新启用它 —— 要它保持禁用就把这条 entry 注释掉
```

`mcsdev ps` 也会把这种状态显示为 `已禁用`，而不是 `未部署`。

## 双载风险会被拦下来

两个条目产出同前缀的 jar（比如 `pipez` 和 `pipez-legacy` 都出 `Lapis-Pipez-*.jar`），`plugins/` 里就会共存两个版本 —— 服务器会把同一个插件加载两次，典型症状是监听器执行两遍。

`mcsdev config` 会直接报错：

```
✖ 双载风险：pipez 与 pipez-legacy 都会产出 Lapis-Pipez-*.jar，两个版本会在 plugins/ 里共存
  —— 服务器会把同一个插件加载两次（典型症状：监听器执行两遍）
```

## 相关

- [`plugins` 条目字段完整参考](/reference/mcsdev-yml#plugins-条目字段)
- [为什么 clean 默认是 true](/explanation/why-clean-default-true)
- [清理配置里已删除的残留 jar](/how-to/clean-stale-jars)
