# mcsdev

**Minecraft Server Dev** —— 终端里的插件开发者测试服环境。

> GitHub 仓库：[mc506lw/mcsdev](https://github.com/mc506lw/mcsdev)

> ⚠️ **当前为名称占位包（v0.0.1）**：本包仅用于在 npm 上保留 `mcsdev` 这个名字，**不包含任何功能**。安装后运行只会打印占位说明。CLI 正在开发中，首个功能版本会原地替换本包内容（包名保持不变）。

## 这是什么 / What is this

mcsdev 是一个本地 CLI 工具，面向 Bukkit / Paper / Folia 系插件开发者，把"改代码 → 验证"循环变成一条命令：

```
构建产物（build/libs/*.jar）
   → mcsdev run 1.20.1
   → 选定实例（papertest / foliatest / new）
   → 选定 jar（如 goodplugin-1.0.0-all.jar）
   → 自动启动 / 重启实例 → 日志回流
```

核心特性：

- **记忆式交互**：实例与 jar 只问一次，之后默认沿用；构建产物集合不变就不再问。
- **实例抽象**：Paper / Folia 测试实例按 MC 版本隔离，自包含、可复用、可打包复现 bug。
- **JDK 管理**（`mcsdev java`）：自动扫描本机 JDK，按实例绑定，启动前校验兼容性。
- **一个终端窗口就是全部**：不增加"要开的软件"数量。

## 为什么有占位包 / Why the placeholder exists

npm 不支持"预订"包名，**只有发布之后才能真正持有这个名字**。为了在开发期间防止名称被抢注，我们先用一个 README-only 的 `0.0.1` 占住 `mcsdev`。首个功能版本发布时，会用真正的 CLI 替换占位内容。

## 现状 / Status

| 项目 | 状态 |
|---|---|
| 设计文档 v2（`DESIGN.md`） | ✅ 已完成 |
| v0.1（`setup` / `new` / `run` / `stop` / `logs` / `ls`） | 🚧 开发中 |
| 首个功能版本发布 | ⏳ 待定 |

## 使用 / Usage

```bash
npm install -g mcsdev
mcsdev
# 输出：mcsdev v0.0.1（名称占位包）—— CLI 开发中
```

## 路线图 / Roadmap

- **v0.1**：`setup`（极简）+ `new`（实例向导）+ `run`（记忆式启动）+ `stop / logs / ls`
- **v0.2**：`java` 完整管理、`rebuild`、`reset`
- **v0.3**：`dev`（watch 自动构建 → 部署 → 重启）、Folia 兼容校验
- **v0.4+**：`package`（实例打包复现 bug）、`mcsdev test`（集成测试）

详细设计见 [`DESIGN.md`](https://github.com/mc506lw/mcsdev/blob/main/DESIGN.md)。

## 许可证 / License

[MIT](./LICENSE)
