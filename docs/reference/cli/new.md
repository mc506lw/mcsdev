# `mcsdev new`

创建实例：向导式，下载 `server.jar`，生成 `eula.txt` 与 `server.properties`，注册到全局注册表。

```
mcsdev new [options]
```

## 参数

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--name <name>` | 字符串 | 交互询问 | 实例名，`^[a-zA-Z0-9._-]{1,40}$` |
| `--core <paper\|folia>` | 字符串 | 交互选择（默认 `paper`） | 服务器核心 |
| `--mc-version <v>` | 字符串 | 交互选择 | MC 版本，如 `1.20.4` |
| `--yes` | 开关 | 关 | 使用全局默认配置，跳过后续提问 |

## 前置条件

- 必须已跑过 `mcsdev setup`（需要 `root`）：

  ```
  ✖ 尚未初始化：请先运行 mcsdev setup
  ```

- 需要一个可用的 JDK。没有默认 JDK 时会先自动扫描一次；扫不到则报错：

  ```
  ✖ 未发现可用的 64 位 JDK，请先安装 JDK 再创建实例
  ```

## 交互流程

```
? 实例名称（ID） › test1
? 服务器核心 › paper（默认，社区标准） / folia（多线程分支）
? MC 版本 › 1.20.4
? 使用全局默认配置？ › 是
```

选「否」时会逐个问：

- 主世界类型：`normal` / `flat` / `void`
- 启用世界：地狱、末地（多选）
- 关闭正版验证？
- 内存分配（`2G` / `1024M`）

## 创建时发生什么

1. 检查 `<root>/<name>` 是否为空目录（非空直接报错）；
2. 从 PaperMC Fill Downloads API（`https://fill.papermc.io`，v3）取该核心该版本的最新构建；
3. 下载 `server.jar` 到实例目录。下载走缓存：`~/.mcsdev/cache/jars/<core>-<version>-<build>.jar`，同版本复用；
4. 写 `eula.txt`（`eula=true`）与 `server.properties`；
5. 分配端口（默认取偏好里的 `25565`，被占用则自动偏移）；
6. 写实例元数据 `<dir>/mcsdev.json`；
7. 追加到 `~/.mcsdev/instances.json`。

成功输出：

```
✔ 实例 test1 创建完成（paper 1.20.4，端口 25565）
  ? 运行：mcsdev run 1.20.4
```

## 版本列表拿不到时

```
✖ 无法获取版本列表（需连接 PaperMC API；可用 MCSDEV_PAPER_BASE 指向镜像）
```

用 `MCSDEV_PAPER_BASE` 指向镜像或代理后重试。显式给了 `--mc-version` 且 API 不可用时，mcsdev 会继续创建（只在版本不在列表里时警告）：

```
⚠ paper 没有版本 1.99.9（可用末尾几个：1.21.4, 1.21.5, ...）
```

## 退出码

| 情况 | 退出码 |
| --- | --- |
| 创建成功 | 0 |
| 未 setup / 无 JDK / 实例重名 / 目录非空 | 1 |
| 版本列表拉取失败且未给 `--mc-version` | 1 |

错误路径统一返回 1，脚本里可以 `mcsdev new ... && mcsdev start <name>`。

## 相关

- [`setup`](/reference/cli/setup)
- [`run`](/reference/cli/run)
- [`start / stop / restart`](/reference/cli/lifecycle)
- [用 mcsdev 管一台测试服](/tutorial/managed-instance)
