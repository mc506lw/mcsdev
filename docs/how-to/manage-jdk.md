# 管理 JDK

适用：服务器起不来报 `UnsupportedClassVersionError`、换了 MC 版本需要更高的 Java、或者你想确认 mcsdev 会用哪个 JDK。

## mcsdev 用 JDK 做什么

只在**它自己启动服务器**时用：`run`（前台）、`start` / `restart`（后台）、以及 `restart.type: mcsdev` 触发的重启。

link 模式（外部服务器）下，服务器由你启动，mcsdev 完全不碰 JDK。

## 版本要求

| MC 版本 | 最低 Java |
| --- | --- |
| 1.20.5 及以上 | 21 |
| 1.18 – 1.20.4 | 17 |
| 1.17 | 16（实际都用 17） |
| 1.16.5 及以下 | 8 |

低版本 Java 跑高版本服务器会在启动阶段直接退出，日志里是 `UnsupportedClassVersionError` 或 `class file version 65.0`。这种情况下端口探测会超时，`dev` 报「服务器可能没起来或崩了」—— 病因在日志里。

## 四个动作

```bash
mcsdev java scan       # 重新扫描本机所有 JDK，写入 ~/.mcsdev/java.json
mcsdev java list       # 打印已记录的 JDK 列表
mcsdev java use <目标> # 设默认 JDK
mcsdev java validate   # 逐个跑一遍，确认还能用
```

### `scan`

扫描范围包括：

- `JAVA_HOME` / `JDK_HOME`（以及它们的兄弟目录，因为很多人把一组 JDK 放在同一个父目录）；
- Windows：`Program Files` 下各家发行版、`.minecraft/runtime`、HMCL / ATLauncher / Modrinth App 的 runtime 目录；
- macOS：`/Library/Java/JavaVirtualMachines`、Homebrew；
- Linux：`/usr/lib/jvm`；
- 通用：`~/.jdks`（IntelliJ）、`~/.sdkman/candidates/java`、`~/.gradle/jdks`。

每个候选会跑一次 `java -XshowSettings:properties -version` 解析版本/厂商/位数。**32 位 JDK 会被拒绝** —— 跑 Paper 需要 64 位。

### `use`

三种写法：

```bash
mcsdev java use 2                                        # 列表里的序号（从 1 开始）
mcsdev java use "C:\Program Files\...\bin\java.exe"      # 绝对路径
mcsdev java use temurin                                  # 路径里包含这个子串
```

设置前会先验证这个 JDK 能跑，验证失败就拒绝：

```
✖ JDK 无效或探测失败：C:\...\java.exe
```

成功时：

```
✔ 默认 JDK 已设为 Java 21（21.0.4）：C:\Program Files\Eclipse Adoptium\jdk-21.0.4.7-hotspot\bin\java.exe
```

### `validate`

```bash
$ mcsdev java validate
  ✔ Java 21  C:\Program Files\Eclipse Adoptium\jdk-21.0.4.7-hotspot\bin\java.exe
  ✖ Java 17  C:\Program Files\Java\jdk-17\bin\java.exe
✔ 可用 1/2
```

适合：删过 JDK 目录、或者注册表是从别的机器拷来的。

## 让两个实例用不同 JDK

全局默认只能有一个，但实例可以各自绑定：

```bash
mcsdev java use 1 --instance test1     # test1 用列表里的第 1 个（Java 21）
mcsdev java use 2 --instance foliatest # foliatest 用 Java 17
mcsdev java list                       # 确认默认值没被改动
```

`--instance` 只写 `instances.json` 里那个实例的 `javaBin`，**不改全局默认**。实例绑定优先于全局默认，下次启动该实例时生效。

## 当前版本的限制

- `java install`（自动下载 JDK）没有实现，需要自己装。
- 启动前不校验 JDK 与 MC 版本的兼容性 —— 版本不匹配时服务器自己会在日志里报 `UnsupportedClassVersionError`。

## 相关

- [`java` 命令参考](/reference/cli/java)
- [`~/.mcsdev` 目录结构](/reference/files)
