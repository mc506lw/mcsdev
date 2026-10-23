/**
 * `mcsdev ps` —— 只读状态视图。
 *
 * 为什么需要它：`config` 只说"配置想干什么"，`deploy` 真的去干。
 * 中间缺一档"现在是什么"—— 没有它，想确认服务器上装了哪个版本，
 * 唯一办法就是跑一次会写盘的 deploy --dry-run。这个命令纯只读，零副作用。
 */

import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { loadConfig, probeHostOf, ResolvedConfig } from '../compose';
import { exists, sha256File } from '../util/fsx';
import { error, hint, ok, warn } from '../util/log';
import * as pc from 'picocolors';

export interface PsOptions {
  json?: boolean;
}

type State = '最新' | '落后' | '未部署' | '已禁用' | '缺产物';

interface Row {
  id: string;
  build: string;
  installed: string;
  state: State;
}

function readPort(serverDir: string): number | undefined {
  try {
    const txt = fs.readFileSync(path.join(serverDir, 'server.properties'), 'utf8');
    const m = txt.match(/^server-port=(\d+)\s*$/m);
    if (m) return Number(m[1]);
  } catch {
    /* 无 */
  }
  return undefined;
}

/** 从 latest.log 首几行抓服务器版本（比解析 version_history.json 稳） */
function readVersion(serverDir: string): string | undefined {
  const log = path.join(serverDir, 'logs', 'latest.log');
  if (!exists(log)) return undefined;
  try {
    // 只读前 8KB，日志可能很大
    const fd = fs.openSync(log, 'r');
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const txt = buf.subarray(0, n).toString('utf8');
    const m = txt.match(/Starting minecraft server version ([\w.\-]+)/i);
    if (m) return m[1];
    const p = txt.match(/\b(Paper|Leaf|Purpur|Folia|Spigot|CraftBukkit)\b.*?version\s+([\w.\-]+)/i);
    if (p) return `${p[1]} ${p[2]}`;
  } catch {
    /* 无 */
  }
  return undefined;
}

function tcpProbe(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let settled = false;
    const done = (v: boolean): void => {
      if (settled) return;
      settled = true;
      s.destroy();
      resolve(v);
    };
    s.setTimeout(800);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
    s.connect(port, host);
  });
}

export async function psCmd(opts: PsOptions = {}): Promise<void> {
  let cfg: ResolvedConfig;
  try {
    cfg = loadConfig(process.cwd());
  } catch (e) {
    error((e as Error).message);
    process.exitCode = 1;
    return;
  }

  const pluginsDir = path.join(cfg.serverDir, 'plugins');
  let installed: string[] = [];
  if (exists(pluginsDir)) {
    try {
      installed = fs.readdirSync(pluginsDir).filter((n) => n.toLowerCase().endsWith('.jar'));
    } catch {
      installed = [];
    }
  }

  const rows: Row[] = [];
  const covered = new Set<string>();

  for (const p of cfg.plugins) {
    if (p.chosen.length === 0) {
      rows.push({ id: p.id, build: pc.dim('(无产物)'), installed: '-', state: '缺产物' });
      continue;
    }
    for (const src of p.chosen) {
      const targetName = p.entry.rename ?? path.basename(src);
      const toDir = pluginsDir;
      const destPath = path.join(toDir, targetName);
      covered.add(targetName);

      let state: State;
      let installedName = pc.dim('(无)');
      if (!exists(destPath)) {
        // .jaroff 是用户手动禁用 —— 跟"从没部署过"是两回事
        const offPath = path.join(toDir, targetName.replace(/\.jar$/i, '.jaroff'));
        state = exists(offPath) ? '已禁用' : '未部署';
      } else {
        installedName = targetName;
        const same = sha256File(src) === sha256File(destPath);
        state = same ? '最新' : '落后';
      }
      rows.push({ id: p.id, build: path.basename(src), installed: installedName, state });
    }
  }

  // plugins/ 里有、但配置里没管的 jar（别人手放的 / 已从配置里删掉的）
  const extra = installed.filter((n) => !covered.has(n));

  // 服务器信息
  const port = readPort(cfg.serverDir);
  const version = readVersion(cfg.serverDir);
  const running = port ? await tcpProbe(port, probeHostOf(cfg)) : false;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          file: cfg.spec.file,
          serverDir: cfg.serverDir,
          pluginsDir,
          server: { version: version ?? null, port: port ?? null, running },
          entries: rows,
          extra,
        },
        null,
        2
      )
    );
    return;
  }

  // ---- 人读输出 ----
  console.log();
  console.log(pc.dim('  配置  ') + cfg.spec.file);
  console.log(pc.dim('  目标  ') + pluginsDir);
  const srv = [
    version ?? pc.dim('版本未知'),
    port ? `端口 ${port}` : pc.dim('端口未知'),
    running ? pc.green('运行中') : pc.dim('已停止'),
  ].join(' · ');
  console.log(pc.dim('  服务器 ') + srv);

  console.log();
  const w1 = Math.max(4, ...rows.map((r) => r.id.length));
  const w2 = Math.max(8, ...rows.map((r) => r.build.length));
  const w3 = Math.max(8, ...rows.map((r) => r.installed.length));
  console.log(
    '  ' + pc.bold('id'.padEnd(w1)) + '  ' + pc.bold('构建产物'.padEnd(w2)) + '  ' + pc.bold('已装'.padEnd(w3)) + '  状态'
  );
  for (const r of rows) {
    const mark =
      r.state === '最新'
        ? pc.green('最新')
        : r.state === '落后'
          ? pc.yellow('落后')
          : r.state === '已禁用'
            ? pc.cyan('已禁用')
            : r.state === '未部署'
              ? pc.dim('未部署')
              : pc.red('缺产物');
    console.log(
      '  ' + r.id.padEnd(w1) + '  ' + r.build.padEnd(w2) + '  ' + r.installed.padEnd(w3) + '  ' + mark
    );
  }

  if (extra.length > 0) {
    console.log();
    console.log(pc.dim('  plugins/ 里还有 ' + extra.length + ' 个配置没管的 jar：'));
    for (const e of extra) console.log('    ' + pc.dim(e));
    hint('这些不会被 deploy 碰（也不会被清理）');
  }

  console.log();
  const stale = rows.filter((r) => r.state === '落后' || r.state === '未部署').length;
  if (stale === 0) ok('全部与构建产物一致');
  else warn(`${stale} 个条目需要部署 —— mcsdev deploy`);
}
