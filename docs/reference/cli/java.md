# `mcsdev java`

JDK 环境管理：扫描、列出、设默认、校验。

```
mcsdev java <action> [target] [--instance <name>]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `<action>` | 是 | `scan` / `list` / `use` / `validate` |
| `[target]` | 仅 `use` | JDK 路径、列表索引或路径子串 |
| `--instance <name>` | 否 | 仅 `use`：只把这个 JDK 绑定到指定实例，**不改全局默认** |

其它 action 会打印用法：

```
✖ 用法：mcsdev java <scan | list | use <路径|索引> | validate>
```

## `scan`

```
mcsdev java scan
```

扫描本机所有 JDK，写入 `~/.mcsdev/java.json`，并打印表格：

```
mcsdev 扫描 JDK…
✔ 发现 3 个 JDK
  1   Java 21  21.0.4       Eclipse Adoptium  64位
      C:\Program Files\Eclipse Adoptium\jdk-21.0.4.7-hotspot\bin\java.exe
  2   Java 17  17.0.12      Microsoft         64位  (环境变量/PATH)
      C:\Program Files\Microsoft\jdk-17.0.12.7-hotspot\bin\java.exe
```

### 扫描范围

- **Windows**：`Program Files` 下各家发行版、`.minecraft/runtime`、HMCL（`.hmcl/java`）、ATLauncher、Modrinth App 的 runtime；
- **macOS**：`/Library/Java/JavaVirtualMachines`、Homebrew；
- **Linux**：`/usr/lib/jvm`；
- **通用**：`JAVA_HOME` / `JDK_HOME` 及其**兄弟目录**（很多人把一组 JDK 放在同一个父目录）、`~/.jdks`（IntelliJ）、`~/.sdkman/candidates/java`、`~/.gradle/jdks`。

每个候选执行 `java -XshowSettings:properties -version`（15 秒超时）解析版本、厂商、位数。

**32 位 JDK 会被拒绝** —— 跑 Paper 需要 64 位。

一个都没发现：

```
⚠ 未发现可用 JDK
  ? 可先安装 JDK 或检查 JAVA_HOME
```

## `list`

```
mcsdev java list
```

打印 `java.json` 里已记录的 JDK（不重新扫描）。没有记录时：

```
⚠ 还没有 JDK 记录
  ? 先运行 mcsdev java scan
```

## `use`

```
mcsdev java use <目标>
```

`<目标>` 三种写法，按顺序尝试：

1. **列表索引**（从 1 开始）：`mcsdev java use 2`
2. **绝对路径**：`mcsdev java use "C:\Program Files\...\bin\java.exe"`
3. **路径子串**（大小写不敏感）：`mcsdev java use temurin`

设置前会先验证这个 JDK 能跑：

```
✔ 默认 JDK 已设为 Java 21（21.0.4）：C:\Program Files\Eclipse Adoptium\jdk-21.0.4.7-hotspot\bin\java.exe
```

失败：

```
✖ 未找到 JDK：foo（先 mcsdev java scan，或用列表索引）
✖ JDK 无效或探测失败：C:\...\java.exe
```

缺 target：

```
✖ 用法：mcsdev java use <路径 | 列表索引> [--instance <实例名>]
```

### 只绑定到某个实例

```bash
mcsdev java use 2 --instance test1
```

```
✔ 实例 test1 已绑定 Java 21（21.0.4）：C:\Program Files\Eclipse Adoptium\jdk-21.0.4.7-hotspot\bin\java.exe
  ? 该实例下次启动时生效
```

它写的是 `instances.json` 里那个实例的 `javaBin`，**全局默认不变** —— 所以你可以让 `test1` 用 Java 21、`test2` 用 Java 17，同时开两台不同 MC 版本的服。

实例不存在时：

```
✖ 实例不存在：foo
  ? 先 mcsdev ls 看看有哪些实例
```

## `validate`

```
mcsdev java validate
```

逐个跑一遍已记录的 JDK：

```
  ✔ Java 21  C:\Program Files\Eclipse Adoptium\jdk-21.0.4.7-hotspot\bin\java.exe
  ✖ Java 17  C:\Program Files\Java\jdk-17\bin\java.exe
✔ 可用 1/2
```

适合：删过 JDK 目录、或 `java.json` 是从别的机器拷来的。

## 设置的作用范围

| 用法 | 写到哪 | 影响谁 |
| --- | --- | --- |
| `java use <x>` | `config.json` 的 `defaultJava` | 所有没单独绑定的实例 |
| `java use <x> --instance test1` | `instances.json` 里 `test1` 的 `javaBin` | 只有 `test1` |

实例绑定的优先级高于全局默认。启动实例时用的是该实例的 `javaBin`；没有绑定才回落到全局默认。

剩余限制：**`java install`（自动下载 JDK）未实现** —— JDK 需要自己装，然后 `java scan`。

## 版本要求

| MC 版本 | 最低 Java |
| --- | --- |
| 1.20.5+ | 21 |
| 1.18 – 1.20.4 | 17 |
| 1.17 | 16（实际用 17） |
| ≤ 1.16.5 | 8 |

## 退出码

| 情况 | 退出码 |
| --- | --- |
| 动作执行完成（含「未发现 JDK」这类警告） | 0 |
| 未知 action、`use` 找不到 JDK、JDK 无效、`--instance` 指向不存在的实例 | 1 |

错误路径统一返回 1（`error()` 会设置退出码），所以脚本里可以 `mcsdev java use 2 --instance test1 && mcsdev start test1`。

## 相关

- [管理 JDK](/how-to/manage-jdk)
- [环境变量](/reference/env)
