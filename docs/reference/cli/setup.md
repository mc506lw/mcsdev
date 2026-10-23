# `mcsdev setup`

首次环境配置：扫描 JDK、选择默认 JDK、指定服务器根路径、确认 online-mode。写入 `~/.mcsdev/config.json`。

```
mcsdev setup
```

无参数，全交互。只在你要让 mcsdev 自己建服务器时需要；link 模式（外部服务器）可以跳过它。

## 四个步骤

### 1. 扫描 JDK

```
→ 扫描本机 JDK…
  1   Java 21  21.0.4       Eclipse Adoptium  64位
      C:\Program Files\Eclipse Adoptium\jdk-21.0.4.7-hotspot\bin\java.exe
  2   Java 17  17.0.12      Microsoft         64位
      C:\Program Files\Microsoft\jdk-17.0.12.7-hotspot\bin\java.exe
✔ 发现 2 个 JDK
```

扫描范围见 [`java scan`](/reference/cli/java#scan)。32 位与损坏的 JDK 会被过滤掉。

一个都没发现时警告并继续（你仍然可以完成 setup，之后再装 JDK 跑 `mcsdev java scan`）：

```
⚠ 未发现可用的 64 位 JDK
  ? 请先安装 JDK（如 Adoptium Temurin / Microsoft OpenJDK / Amazon Corretto），装好后再跑 mcsdev java scan
```

### 2. 选择默认 JDK

```
? 选择默认 JDK › Java 21（21.0.4）Eclipse Adoptium
```

默认选中项由 `pickDefaultJava` 给出（优先候选目录内发现、主版本靠近 21）。这个值写入 `config.json` 的 `defaultJava`。

### 3. 服务器根路径

```
? 服务器根路径（所有实例建在这里，需为空目录） › E:\dev\mcsdev-servers
```

- 默认值是 `<当前目录>/.tmp`（测试服临时目录）；
- **必须是空目录**（不存在会被创建；存在但非空会要求重填）：

  ```
  ⚠ 目录非空（E:\dev\mcsdev-servers），请换一个空目录
  ```

- 所有实例建在 `<root>/<实例名>/`。

### 4. online-mode

```
mcsdev online-mode：正版验证。开启后玩家必须用正版账号登录；本地开发测试一般关闭（离线）。
⚠ 注意：offline 模式任何人都能进服，切勿用于公网服务器。
? 默认关闭正版验证（online-mode=false）？ › 是
```

只问这一个偏好，因为它有安全含义。世界类型、维度、内存这些走默认值，需要时在 `mcsdev new` 里覆盖。

## 写入什么

`~/.mcsdev/config.json`（`MCSDEV_HOME` 可覆盖目录）：

```json
{
  "root": "E:\\dev\\mcsdev-servers",
  "defaultJava": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.4.7-hotspot\\bin\\java.exe",
  "prefs": {
    "onlineMode": false,
    "worldType": "normal",
    "allowNether": true,
    "allowEnd": true,
    "motd": "mcsdev test server",
    "memory": "2G",
    "viewDistance": 8,
    "port": 25565
  }
}
```

## 可以重复跑

重复执行 `mcsdev setup` 会重新扫描 JDK 并覆盖 `root` / `defaultJava` / `prefs.onlineMode`。已注册的实例不受影响（它们各自的元数据在 `~/.mcsdev/instances.json` 与实例目录的 `mcsdev.json` 里）。

## 退出码

| 情况 | 退出码 |
| --- | --- |
| 完成 | 0 |
| 交互被中断（Ctrl+C） | 130 |
| 写配置失败 | 1 |

## 相关

- [`new`](/reference/cli/new)
- [`java`](/reference/cli/java)
- [用 mcsdev 管一台测试服](/tutorial/managed-instance)
