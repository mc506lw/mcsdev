/**
 * `mcsdev deploy` —— 部署一次（不 watch）。
 * 对应真实项目里的 `python deploy.py`：装 jar、清旧版、按策略重启。
 */

import { loadConfig } from '../compose';
import { applyRestart, deployAll, printTarget } from '../deployer';
import { error, hint, info, ok, warn } from '../util/log';

export interface DeployOptions {
  /** 忽略"已是最新"，强制重装 */
  force?: boolean;
  /** 只打印将要做什么 */
  dryRun?: boolean;
  /** 只拷文件不重启 */
  noRestart?: boolean;
  /** 只部署指定 id */
  only?: string[];
}

export async function deployCmd(opts: DeployOptions = {}): Promise<void> {
  let cfg;
  try {
    cfg = loadConfig(process.cwd());
  } catch (e) {
    error((e as Error).message);
    process.exitCode = 1;
    return;
  }

  printTarget(cfg);

  // 全局错误（yml 级）—— 一律致命
  if (cfg.errors.length > 0) {
    for (const e of cfg.errors) error(e);
    hint('先修好配置错误（mcsdev config 可看详情）');
    process.exitCode = 1;
    return;
  }

  // 点名校验：未知 id 立即退出，不要"先报错再继续跑"
  if (opts.only && opts.only.length > 0) {
    const known = new Set(cfg.plugins.map((p) => p.id));
    const unknown = opts.only.filter((x) => !known.has(x));
    if (unknown.length > 0) {
      error(`未知工程：${unknown.join(', ')}`);
      hint(`可选：${[...known].join(', ')}`);
      process.exitCode = 1;
      return;
    }
  }

  // 条目级错误：只检查点名的那些 —— 一个还没构建的工程不该连坐其他工程
  const targets =
    opts.only && opts.only.length > 0 ? cfg.plugins.filter((p) => opts.only!.includes(p.id)) : cfg.plugins;
  const entryErrors = targets.flatMap((p) => p.errors);
  if (entryErrors.length > 0) {
    for (const e of entryErrors) error(e);
    process.exitCode = 1;
    return;
  }

  for (const w of cfg.warnings) warn(w);

  const outcomes = deployAll(cfg, { force: opts.force, dryRun: opts.dryRun, only: opts.only });
  if (outcomes.length === 0) {
    process.exitCode = 1;
    return;
  }

  const failed = outcomes.filter((o) => o.action === 'failed');
  const deployed = outcomes.filter((o) => o.action === 'deployed');

  if (failed.length > 0) {
    error(`${failed.length} 条失败 —— 不执行重启`);
    process.exitCode = 1;
    return;
  }

  if (opts.dryRun) {
    info('dry-run 结束，未改动任何文件');
    if (cfg.restart.type !== 'none' && !opts.noRestart) {
      info(`（真跑的话，之后会按 restart.${cfg.restart.type} 重启服务器）`);
    }
    return;
  }

  if (deployed.length === 0) {
    ok('没有需要更新的产物');
    if (!opts.force) hint('要强制重装请加 --force');
    return;
  }

  // 重启失败必须冒泡成非 0 —— 否则 `mcsdev deploy && 下一步` 永远是绿的
  const restarted = await applyRestart(cfg, { skip: opts.noRestart });
  if (!restarted) process.exitCode = 1;
}
