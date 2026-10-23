#!/usr/bin/env node
import { Command } from 'commander';
import * as pkg from '../package.json';
import { setupCmd } from './commands/setup';
import { javaCmd } from './commands/java';
import { newCmd } from './commands/new';
import { runCmd } from './commands/run';
import { lsCmd } from './commands/ls';
import { startCmd, stopCmd, restartCmd, logsCmd, rebuildCmd, resetCmd } from './commands/lifecycle';
import { initCmd } from './commands/init';
import { configCmd } from './commands/config';
import { deployCmd } from './commands/deploy';
import { devCmd } from './commands/dev';
import { psCmd } from './commands/ps';
import { pruneCmd } from './commands/prune';
import { execCmd } from './commands/exec';
import { error } from './util/log';
import { getActiveStop } from './server';

/**
 * 全局 Ctrl+C / 终止信号：任何提示、下载、等待场景下都能可靠退出。
 * 前台有正在托管的服务器时，先优雅停止（发送 stop 并等待保存世界），再退出。
 */
let signalHandling = false;
function handleSignal(code: number): void {
  if (signalHandling) return;
  signalHandling = true;
  const stop = getActiveStop();
  if (stop) {
    void stop()
      .catch(() => undefined)
      .finally(() => process.exit(code));
  } else {
    process.exit(code);
  }
}
process.on('SIGINT', () => handleSignal(130));
process.on('SIGTERM', () => handleSignal(143));

const program = new Command();
program
  .name('mcsdev')
  .description('Minecraft Server Dev — 终端里的插件开发者测试服环境（v0.1 原型）')
  .version(pkg.version, '-V, --version');

const wrap =
  (fn: (...args: any[]) => Promise<unknown> | unknown) =>
  async (...args: any[]): Promise<void> => {
    try {
      await fn(...args);
    } catch (e) {
      error((e as Error).message || String(e));
      process.exitCode = 1;
    }
  };

program.command('setup').description('首次环境配置：JDK 扫描 + 服务器根路径 + 偏好').action(wrap(setupCmd));

program
  .command('java')
  .description('JDK 管理（scan / list / use / validate）')
  .argument('<action>', 'scan | list | use | validate')
  .argument('[target]', 'use：JDK 路径或列表索引')
  .option('--instance <name>', '只把这个 JDK 绑定到指定实例（不改全局默认）')
  .action(wrap(javaCmd));

program
  .command('new')
  .description('创建实例（向导：名称 → 核心 → 版本 → 全局配置?）')
  .option('--name <name>', '实例名')
  .option('--core <paper|folia>', '服务器核心')
  .option('--mc-version <v>', 'MC 版本')
  .option('--yes', '使用全局默认配置，跳过提问')
  .action(wrap(newCmd));

program
  .command('run')
  .description('记忆式启动/重启：选实例与 jar → 部署 → 启动 → 日志回流')
  .argument('[version]', 'MC 版本（缺省时尝试从项目依赖探测）')
  .option('--forget', '清除该版本的选择记忆')
  .action(wrap(runCmd));

program.command('ls').description('列出实例').action(wrap(lsCmd));

// ---- 声明式配置（mcsdev.yml）----
program
  .command('init')
  .description('在当前插件项目生成 mcsdev.yml（自动探测构建产物与 monorepo 子项目）')
  .option('--link <target>', '绑定目标：mcsdev 实例名或服务器目录路径')
  .option('--name <name>', '项目名（默认取目录名）')
  .option('--force', '覆盖已存在的 mcsdev.yml')
  .option('--dry-run', '只打印将生成的内容，不写文件')
  .action(wrap(initCmd));

program
  .command('config')
  .description('打印 mcsdev.yml 的解析结果（产物命中 / 部署目标 / 将清理的旧版）')
  .option('--json', '输出 JSON（给脚本用）')
  .action(wrap(configCmd));

program
  .command('deploy')
  .description('按 mcsdev.yml 部署一次（不 watch）')
  .option('--force', '忽略"已是最新"，强制重装')
  .option('--dry-run', '只打印将做什么，不改文件')
  .option('--no-restart', '只拷文件，不重启')
  .argument('[ids...]', '只部署指定 id（mcsdev config 里能看到 id）')
  .action(wrap((ids: string[], o: { force?: boolean; dryRun?: boolean; restart?: boolean }) =>
    deployCmd({ force: o.force, dryRun: o.dryRun, noRestart: o.restart === false, only: ids })
  ));

program
  .command('dev')
  .description('开发循环：watch 构建产物 → 自动部署 → 重启')
  .option('--dry-run', '只打印计划，不写目标目录、不重启（预演用）')
  .option('--once', '真部署一轮后退出（会写目标目录；只想预演请配 --dry-run）')
  .option('--force', '忽略"已是最新"，强制重装')
  .option('--interval <ms>', '轮询间隔（默认 500）')
  .argument('[ids...]', '只 watch/部署指定 id（mcsdev config 里能看到 id）')
  .action(
    wrap(
      async (ids: string[], o: { once?: boolean; dryRun?: boolean; force?: boolean; interval?: string }) => {
        let intervalMs: number | undefined;
        if (o.interval !== undefined) {
          const n = Number(o.interval);
          if (!Number.isFinite(n) || n <= 0) {
            error(`--interval 需要一个正数（你给的是「${o.interval}」）`);
            process.exitCode = 1;
            return;
          }
          intervalMs = n;
        }
        await devCmd({ once: o.once, dryRun: o.dryRun, force: o.force, only: ids, intervalMs });
      }
    )
  );

program
  .command('ps')
  .description('只读状态：配置里的条目 vs 服务器上实际装的 jar（不会改任何文件）')
  .option('--json', '输出 JSON（给脚本用）')
  .action(wrap(psCmd));

program
  .command('prune')
  .description('清理 mcsdev 部署过、但配置里已删除的残留 jar（不碰手工放入的插件）')
  .option('--dry-run', '只列出将删除什么，不动文件')
  .option('--yes', '跳过确认')
  .action(wrap(pruneCmd));

program
  .command('exec')
  .description('通过 RCON 往运行中的服务器发一条命令（比整服重启便宜）')
  .argument('<command...>', '命令（不要带前导 /）')
  .action(wrap(execCmd));

program.command('start').description('启动实例（后台分离）').argument('[instance]', '实例名或 MC 版本（缺省时选择）').action(wrap(startCmd));
program.command('stop').description('停止实例').argument('[instance]', '实例名或 MC 版本（缺省时选择）').action(wrap(stopCmd));
program.command('restart').description('重启实例').argument('[instance]', '实例名或 MC 版本（缺省时选择）').action(wrap(restartCmd));
program
  .command('logs')
  .description('查看实例日志')
  .argument('[instance]', '实例名或 MC 版本（缺省时选择）')
  .option('-f, --follow', '持续跟踪')
  .action(wrap(logsCmd));
program
  .command('rebuild')
  .description('从实例配置重生成 server.properties / eula.txt')
  .argument('[instance]', '实例名或 MC 版本（缺省时选择）')
  .action(wrap(rebuildCmd));
program
  .command('reset')
  .description('重置实例（清 world/ 与日志）')
  .argument('[instance]', '实例名或 MC 版本（缺省时选择）')
  .action(wrap(resetCmd));

// 命令按用途分组显示（commander 12 没有 helpGroup，只能手写）
program.addHelpText(
  'after',
  `
按用途分组：
  声明式开发（有 mcsdev.yml 时用这套）
    init      在插件项目生成 mcsdev.yml
    config    查看解析结果（产物命中 / 部署目标 / 将清理的旧版）
    ps        只读状态：服务器上实际装的是什么（不改任何文件）
    dev       ★ 日常用这个：watch 构建产物，自动部署 + 重启
    deploy    只部署一次就退出（脚本化用）
    prune     清掉配置里已删除条目的残留 jar（不碰手工放的插件）
    exec      通过 RCON 往运行中的服务器发命令（reload / say / plugins…）

  实例管理（不用 mcsdev.yml 时用这套）
    setup     首次环境配置（JDK + 服务器根路径）
    new       创建实例
    run       记忆式启动：选实例与 jar → 部署 → 启动（不用 yml 的旧方式）
    ls        列出实例与运行状态

  生命周期
    start / stop / restart    后台启停
    logs [-f]                 看日志
    rebuild                   重生成服务器配置
    reset                     清世界和日志

  其它
    java      JDK 扫描 / 绑定 / 校验

快速开始：
  cd 到你的插件项目  →  mcsdev init  →  mcsdev config  →  mcsdev dev
`
);

program.parseAsync(process.argv).catch((e: Error) => {
  error(e.message || String(e));
  process.exitCode = 1;
});