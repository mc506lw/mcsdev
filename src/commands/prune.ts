/**
 * `mcsdev prune` —— 清理"mcsdev 部署过、但当前配置已经不再产出"的 jar。
 *
 * 解决的语义缺口：声明式的承诺是"配置即真相"，但从 mcsdev.yml 里删掉一条 entry
 * 时，plugins/ 里那个 jar 会永远留着继续被加载 —— 用户以为卸载了，实际还在跑旧版本。
 *
 * 安全性：只删清单（.mcsdev-manifest.json）里记录的文件。
 * 手工放进 plugins/ 的第三方插件永远不在清单里，所以绝不会被误删。
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../compose';
import { findPruneCandidates, readManifest, writeManifest } from '../manifest';
import { exists } from '../util/fsx';
import { error, hint, info, ok, step, warn } from '../util/log';
import { confirm } from '../ui/prompts';
import * as pc from 'picocolors';

export interface PruneOptions {
  dryRun?: boolean;
  yes?: boolean;
}

export async function pruneCmd(opts: PruneOptions = {}): Promise<void> {
  let cfg;
  try {
    cfg = loadConfig(process.cwd());
  } catch (e) {
    error((e as Error).message);
    process.exitCode = 1;
    return;
  }

  if (cfg.errors.length > 0) {
    for (const e of cfg.errors) error(e);
    hint('配置有错时不建议 prune —— 先修好，否则"当前配置"不可信');
    process.exitCode = 1;
    return;
  }

  const pluginsDir = path.join(cfg.serverDir, 'plugins');
  console.log();
  console.log(pc.dim('  配置  ') + cfg.spec.file);
  console.log(pc.dim('  目标  ') + pluginsDir);

  if (!exists(pluginsDir)) {
    ok('plugins/ 目录还不存在，没有可清理的东西');
    return;
  }

  const manifest = readManifest(pluginsDir);
  const recorded = Object.keys(manifest.files).length;
  if (recorded === 0) {
    info('没有部署记录（manifest 为空）—— 无法安全判断哪些 jar 是 mcsdev 放的');
    hint('先跑一次 mcsdev deploy 建立记录；手工放入的插件永远不会被 prune 碰到');
    return;
  }

  // 当前配置期望存在的文件（相对 plugins/）
  const keepRel = new Set<string>();
  for (const p of cfg.plugins) {
    for (const src of p.chosen) {
      const name = p.entry.rename ?? path.basename(src);
      keepRel.add(name);
    }
  }
  const activeIds = new Set(cfg.plugins.map((p) => p.id));

  const candidates = findPruneCandidates(pluginsDir, keepRel, activeIds).filter((c) =>
    exists(path.join(pluginsDir, ...c.rel.split('/')))
  );

  if (candidates.length === 0) {
    ok(`没有残留（清单里 ${recorded} 个文件，与当前配置一致）`);
    return;
  }

  console.log();
  console.log(pc.bold(`将删除 ${candidates.length} 个残留 jar：`));
  for (const c of candidates) {
    console.log('  ' + pc.red('− ') + c.rel + pc.dim(`   (${c.reason})`));
  }

  if (opts.dryRun) {
    console.log();
    info('dry-run：未删除任何文件');
    return;
  }

  if (!opts.yes) {
    const okToGo = await confirm(`确认删除这 ${candidates.length} 个文件？`, false);
    if (!okToGo) {
      info('已取消');
      return;
    }
  }

  let removed = 0;
  const m = readManifest(pluginsDir);
  for (const c of candidates) {
    const abs = path.join(pluginsDir, ...c.rel.split('/'));
    try {
      fs.unlinkSync(abs);
      delete m.files[c.rel];
      removed++;
      step(`删除 ${c.rel}`);
    } catch (e) {
      warn(`删除失败 ${c.rel}：${(e as Error).message}`);
    }
  }
  writeManifest(pluginsDir, m);

  console.log();
  ok(`已清理 ${removed} 个残留 jar`);
  if (removed > 0) hint('重启服务器后生效：mcsdev restart（或让 dev 处理）');
}
