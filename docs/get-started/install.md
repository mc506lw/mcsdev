# 安装

mcsdev 是本地命令行工具。装它只需要 Node.js；只有当你让 mcsdev 自己跑服务器（`server` 模式或 `run`）时才需要 JDK。

## 前置条件

| 依赖 | 版本 | 什么时候需要 |
| --- | --- | --- |
| Node.js | ≥ 18.17（推荐 20 或 22 LTS） | 始终需要，mcsdev 本体是 Node 程序 |
| npm | 随 Node 附带 | 安装与构建 |
| JDK | MC 1.20.5+ → 21；1.17–1.20.4 → 17；更早 → 8 | 只有 mcsdev 需要**启动**服务器时需要。link 模式下服务器由你自己启，mcsdev 不校验 JDK |

检查一下：

```bash
node -v      # v18.17.0 或更高
npm -v
java -version
```

## 安装

当前版本**没有发布到 npm**（仓库 `package.json` 里是 `"private": true`），所以从源码安装：

```bash
git clone https://github.com/mc506lw/mcsdev.git
cd mcsdev
npm install
npm run build
npm link
```

`npm link` 会把 `mcsdev` 这个命令挂到全局。验证：

```bash
mcsdev --version     # 0.1.0-dev
mcsdev --help
```

`--help` 末尾会打印按用途分组的命令清单，那是最可靠的「这个版本有什么」的答案。

### 不想动全局环境

不执行 `npm link`，直接用绝对路径调用也可以，所有命令行为完全一致：

```bash
node /path/to/mcsdev/dist/cli.js --help
```

在 CI 里推荐这种做法：不需要写全局，也不怕污染构建机。

### 更新

```bash
cd mcsdev
git pull
npm install
npm run build
```

`npm link` 建立的是软链接，重新构建后立即生效，不需要重跑。

## 第一次配置：需要吗

分两种情况：

- **link 模式**（你已有一台跑着的开发服）：不需要 `mcsdev setup`。直接进项目跑 `mcsdev init --link <服务器目录>`，见[5 分钟快速上手](/get-started/quickstart)。
- **要让 mcsdev 建服务器**：先跑 `mcsdev setup`（扫描 JDK + 指定服务器根路径 + 确认 online-mode），再 `mcsdev new` 创建实例。见[用 mcsdev 管一台测试服](/tutorial/managed-instance)。

`setup` 会写 `~/.mcsdev/config.json`。这个目录的位置可以用环境变量覆盖：

```bash
MCSDEV_HOME=/tmp/mcsdev-try mcsdev ls     # 完全隔离的一套配置，适合试验
```

## 平台说明

mcsdev 在 Windows / macOS / Linux 上行为一致，有两处平台差异值得知道：

- **路径分隔符**：`mcsdev.yml` 里写 Windows 路径时用单引号包住，YAML 单引号内反斜杠不转义：

  ```yaml
  link: 'E:\Minecraft\开发\Pylon开发'
  ```

  或者干脆用正斜杠，Node 在 Windows 上同样认：`link: E:/Minecraft/开发/Pylon开发`。
- **Ctrl+C**：前台托管着服务器时（`run` / `dev`），Ctrl+C 会先向服务器发 `stop` 等世界保存，再退出。后台启动的实例（`start`）不受影响。

## 下一步

- [5 分钟快速上手](/get-started/quickstart)
- [核心概念](/get-started/concepts)
