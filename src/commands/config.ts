/**
 * `mcsdev config` —— 打印 mcsdev.yml 的解析结果。
 *
 * 声明式配置最烦的问题是"这个值到底哪来的"，所以这里把每条 plugins 的
 * 命中/排除/最终部署/将清理全部摊开，调错时不用猜。
 */

import * as path from 'path';
import { allErrors, loadConfig, ResolvedConfig } from '../compose';
import { error, hint, info, ok, warn } from '../util/log';
import * as pc from 'picocolors';

export interface ConfigOptions {
  /** 只打印 JSON（给脚本用） */
  json?: boolean;
}

function label(s: string, w = 10): string {
  return pc.dim(s.padEnd(w));
}

function rel(p: string, base: string): string {
  const r = path.relative(base, p);
  return r && !r.startsWith('..') ? r.replace(/\\/g, '/') : p;
}

export async function configCmd(opts: ConfigOptions = {}): Promise<void> {
  let cfg: ResolvedConfig;
  try {
    cfg = loadConfig(process.cwd());
  } catch (e) {
    error((e as Error).message);
    process.exitCode = 1;
    return;
  }

  if (opts.json) {
    const plain = {
      file: cfg.spec.file,
      name: cfg.spec.name,
      link: cfg.link ?? null,
      serverDir: cfg.serverDir,
      restart: cfg.restart,
      plugins: cfg.plugins.map((p) => ({
        id: p.id,
        path: p.entry.path,
        matched: p.matched.map((m) => rel(m, cfg.spec.dir)),
        excluded: p.excluded.map((m) => rel(m, cfg.spec.dir)),
        chosen: p.chosen.map((m) => rel(m, cfg.spec.dir)),
        rename: p.entry.rename ?? null,
        willClean: p.willClean.map((m) => rel(m, path.dirname(cfg.spec.file))),
        warnings: p.warnings,
        errors: p.errors,
      })),
      config: cfg.spec.config ?? {},
      warnings: cfg.warnings,
      errors: allErrors(cfg),
    };
    console.log(JSON.stringify(plain, null, 2));
    if (allErrors(cfg).length > 0) process.exitCode = 1;
    return;
  }

  // ---- 头部 ----
  console.log();
  console.log(pc.bold('mcsdev.yml') + '  ' + pc.dim(cfg.spec.file));
  console.log('  ' + label('name') + cfg.spec.name);

  if (cfg.link) {
    const kind = cfg.link.managed ? pc.cyan('mcsdev 实例') : pc.yellow('外部目录');
    console.log('  ' + label('模式') + `link → ${cfg.link.dir}  (${kind})`);
  } else if (cfg.spec.server) {
    console.log('  ' + label('模式') + `自建容器  ${cfg.spec.server.core} ${cfg.spec.server.mc}`);
    if (cfg.spec.world) {
      const w = cfg.spec.world;
      console.log(
        '  ' + label('世界') + `${w.type}  ` + pc.dim(`地狱:${w.nether === false ? '关' : '开'} 末地:${w.end === false ? '关' : '开'}`)
      );
    }
  }

  const r = cfg.restart;
  const rdesc =
    r.type === 'none'
      ? pc.yellow('none（只部署，不重启）')
      : r.type === 'http'
        ? `http → ${r.url}`
        : r.type === 'command'
          ? `command → ${r.run}`
          : 'mcsdev（mcsdev 自己重启实例）';
  console.log('  ' + label('重启') + rdesc);

  if (cfg.link) {
    console.log('  ' + label('部署到') + path.join(cfg.link.dir, 'plugins'));
  }

  // ---- plugins ----
  console.log();
  console.log(pc.bold(`plugins`) + pc.dim(`  ${cfg.plugins.length} 条`));

  cfg.plugins.forEach((p, i) => {
    const n = String(i + 1);
    const head = p.errors.length > 0 ? pc.red(`  ${n}. ${p.id}`) : pc.bold(`  ${n}. ${p.id}`);
    console.log(head);
    console.log('     ' + label('path', 8) + p.entry.path);

    const bits: string[] = [];
    bits.push(`命中 ${p.matched.length}`);
    if (p.excluded.length > 0) bits.push(`排除 ${p.excluded.length}`);
    console.log('     ' + label('glob', 8) + bits.join('  '));

    if (p.excluded.length > 0) {
      for (const e of p.excluded) {
        console.log('       ' + pc.dim('– ' + path.basename(e) + '  (排除)'));
      }
    }

    for (const c of p.chosen) {
      const destName = p.entry.rename ?? path.basename(c);
      console.log(
        '       ' + pc.green('→ ') + path.basename(c) + pc.dim('  ⇒  plugins/') + destName
      );
    }

    if (p.willClean.length > 0) {
      console.log(
        '     ' +
          label('clean', 8) +
          pc.yellow(`将删除 ${p.willClean.length} 个旧版：`) +
          pc.dim(p.willClean.map((x) => path.basename(x)).join(', '))
      );
    }

    for (const e of p.errors) console.log('     ' + pc.red('✖ ') + pc.red(e));
  });

  // ---- config 键 ----
  const cfgKeys = cfg.spec.config ? Object.entries(cfg.spec.config) : [];
  if (cfgKeys.length > 0) {
    console.log();
    const effective = cfg.link && !cfg.spec.configApply;
    console.log(pc.bold('config') + (effective ? pc.yellow('  （link 模式下不生效，需 configApply: true）') : ''));
    for (const [k, v] of cfgKeys) {
      console.log('  ' + label(k, 18) + String(v));
    }
  }

  // ---- 警告 / 错误 ----
  if (cfg.warnings.length > 0) {
    console.log();
    for (const w of cfg.warnings) warn(w);
  }

  const errs = allErrors(cfg);
  if (errs.length > 0) {
    console.log();
    for (const e of errs) error(e);
    process.exitCode = 1;
    hint('修好上面的错误后再运行 mcsdev deploy / dev');
    return;
  }

  const jars = cfg.plugins.reduce((n, p) => n + p.chosen.length, 0);
  console.log();
  ok(`配置可用 —— ${cfg.plugins.length} 个条目 · ${jars} 个 jar`);
  hint('想知道实际会更新几个：mcsdev deploy --dry-run');
}
