#!/usr/bin/env node
import { Command } from 'commander';
import * as pkg from '../package.json';
import { setupCmd } from './commands/setup';
import { javaCmd } from './commands/java';
import { newCmd } from './commands/new';
import { runCmd } from './commands/run';
import { lsCmd } from './commands/ls';
import { startCmd, stopCmd, restartCmd, logsCmd, rebuildCmd, resetCmd } from './commands/lifecycle';
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

program.parseAsync(process.argv).catch((e: Error) => {
  error(e.message || String(e));
  process.exitCode = 1;
});