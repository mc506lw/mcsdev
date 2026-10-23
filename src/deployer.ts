/**
 * 部署执行层：把 compose.ts 解析出的配置真正落到磁盘 + 触发重启。
 *
 * 关键设计（来自真实 deploy.py 的教训）：
 *  - 先复制新 jar 再删旧版本 —— 反过来的话复制失败就既没新版也没旧版
 *  - 增量：目标文件不比源新就跳过（--force 强制）
 *  - 重启策略可插拔：mcsdev 托管 / HTTP / shell 命令 / 不重启
 */

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as path from 'path';
import { exec } from 'child_process';
import * as pc from 'picocolors';
import { ResolvedConfig, ResolvedPlugin, probeHostOf } from './compose';
import { getConfig } from './config';
import { recordDeployed } from './manifest';
import { getInstance } from './registry';
import { startServer, stopServerExternal } from './server';
import { atomicCopy, ensureDir, exists, sha256File } from './util/fsx';
import { dim, error, hint, info, ok, step, warn } from './util/log';

export interface DeployOutcome {
  id: string;
  action: 'deployed' | 'skipped' | 'failed';
  detail: string;
}

function mtimeOf(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function pluginsDirOf(cfg: ResolvedConfig): string {
  return path.join(cfg.serverDir, 'plugins');
}

/**
 * 写盘的命令必须头一件事就说清楚"我用的是哪份配置、往哪儿写"。
 * 在子项目目录里跑 `deploy` 会用到上层的 mcsdev.yml —— 不提示的话
 * 用户会在错误的目录里把东西部署到错误的服务器，屏幕上还看不出任何线索。
 */
export function printTarget(cfg: ResolvedConfig): void {
  console.log();
  console.log(pc.dim('  配置  ') + cfg.spec.file);
  console.log(pc.dim('  目标  ') + pluginsDirOf(cfg));
  if (path.resolve(process.cwd()) !== path.resolve(cfg.spec.dir)) {
    warn(`当前在子目录，使用的是上层的 ${path.basename(cfg.spec.file)}（在 ${cfg.spec.dir}）`);
  }
}

/** 部署单条 plugins 条目 */
export function deployOne(
  cfg: ResolvedConfig,
  p: ResolvedPlugin,
  opts: { force?: boolean; dryRun?: boolean } = {}
): DeployOutcome {
  const pluginsDir = pluginsDirOf(cfg);

  if (p.chosen.length === 0) {
    return { id: p.id, action: 'skipped', detail: '无匹配产物' };
  }

  const toDir = pluginsDir;
  const plan: Array<{ src: string; dest: string; fresh: boolean }> = [];

  for (const src of p.chosen) {
    const destName = p.entry.rename ?? path.basename(src);
    const dest = path.join(toDir, destName);
    // 已是最新 = 内容相同（比 hash，不比 mtime —— gradle build cache 和 git checkout
    // 都能让新产物带着更旧的 mtime，那时按时间比会永久误判"已是最新"）
    let same = false;
    if (exists(dest) && !opts.force) {
      try {
        const a = fs.statSync(src);
        const b = fs.statSync(dest);
        same = a.size === b.size && sha256File(src) === sha256File(dest);
      } catch {
        same = false;
      }
    }
    plan.push({ src, dest, fresh: !same });
  }

  const fresh = plan.filter((x) => x.fresh);
  const cleanCount = p.willClean.length;

  if (fresh.length === 0 && cleanCount === 0) {
    return { id: p.id, action: 'skipped', detail: '已是最新' };
  }

  if (opts.dryRun) {
    const bits: string[] = [];
    if (fresh.length) bits.push(`复制 ${fresh.map((x) => path.basename(x.src)).join(', ')}`);
    if (cleanCount) bits.push(`删除 ${cleanCount} 个旧版`);
    return { id: p.id, action: 'deployed', detail: `[dry-run] ${bits.join(' + ')}` };
  }

  // 1) 先复制（失败则旧版本还在）
  const copied: string[] = [];
  for (const x of fresh) {
    try {
      atomicCopy(x.src, x.dest);
      copied.push(path.basename(x.src));
    } catch (e) {
      return { id: p.id, action: 'failed', detail: `复制失败 ${path.basename(x.src)}：${(e as Error).message}` };
    }
  }

  // 2) 再删旧版本（同名文件已被覆盖，跳过）
  let removed = 0;
  const keptNames = new Set(plan.map((x) => path.basename(x.dest)));
  for (const old of p.willClean) {
    if (keptNames.has(path.basename(old))) continue;
    try {
      fs.unlinkSync(old);
      removed++;
      step(`删除旧版 ${path.basename(old)}`);
    } catch (e) {
      warn(`删除失败 ${path.basename(old)}：${(e as Error).message}`);
    }
  }

  const bits: string[] = [];
  if (copied.length) bits.push(`部署 ${copied.join(', ')}`);
  if (removed) bits.push(`清理 ${removed} 个旧版`);
  return { id: p.id, action: copied.length || removed ? 'deployed' : 'skipped', detail: bits.join(' + ') || '无变化' };
}

/** 批量部署 */
export function deployAll(
  cfg: ResolvedConfig,
  opts: { force?: boolean; dryRun?: boolean; only?: string[] } = {}
): DeployOutcome[] {
  const targets = opts.only && opts.only.length > 0 ? cfg.plugins.filter((p) => opts.only!.includes(p.id)) : cfg.plugins;

  if (opts.only && opts.only.length > 0) {
    const known = new Set(cfg.plugins.map((p) => p.id));
    const unknown = opts.only.filter((x) => !known.has(x));
    if (unknown.length > 0) {
      error(`未知工程：${unknown.join(', ')}`);
      hint(`可选：${[...known].join(', ')}`);
      return [];
    }
  }

  const pluginsDir = pluginsDirOf(cfg);
  // dry-run 承诺"不改动任何文件" —— 连建目录都算写盘，所以也要跳过
  if (!opts.dryRun) ensureDir(pluginsDir);

  const out: DeployOutcome[] = [];
  for (const p of targets) {
    const r = deployOne(cfg, p, opts);
    out.push(r);

    // 记录到清单：以后 prune 靠它判断"哪些是我放的"，手工放入的 jar 永远不在清单里。
    // 注意 skipped 也要记 —— 否则 manifest 被删/换机器后全部"已是最新"，
    // 清单永远建立不起来，prune 会一直以为"没有部署记录"。
    if (!opts.dryRun && r.action !== 'failed' && p.chosen.length > 0) {
      const rels = p.chosen.map((src) => p.entry.rename ?? path.basename(src));
      recordDeployed(pluginsDir, p.id, rels);
    }

    if (r.action === 'failed') error(`${r.id}: ${r.detail}`);
    else if (r.action === 'skipped') console.log(pc.dim(`· ${r.id}: ${r.detail}`));
    else ok(`${r.id}: ${r.detail}`);
  }

  // 汇总一行：9 行状态不该让人自己去数
  const count = (a: DeployOutcome['action']): number => out.filter((o) => o.action === a).length;
  if (out.length > 0) {
    console.log(
      pc.dim(`  ── ${count('deployed')} 部署 · ${count('skipped')} 已是最新 · ${count('failed')} 失败`)
    );
  }
  return out;
}

// ============ 重启 ============

function httpRequest(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      u,
      { method: 'GET', timeout: timeoutMs },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`请求超时（${timeoutMs}ms）`));
    });
    req.on('error', reject);
    req.end();
  });
}

export function runShell(cmd: string, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    exec(cmd, { timeout: timeoutMs, windowsHide: false }, (err, stdout, stderr) => {
      const out = `${stdout}${stderr}`.trim();
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 从 server.properties 读真实端口（外部服务器可能不是 25565） */
function readServerPort(serverDir: string, fallback: number): number {
  try {
    const txt = fs.readFileSync(path.join(serverDir, 'server.properties'), 'utf8');
    const m = txt.match(/^server-port=(\d+)\s*$/m);
    if (m) return Number(m[1]);
  } catch {
    /* 没有就 fallback */
  }
  return fallback;
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
    s.setTimeout(1500);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
    s.connect(port, host);
  });
}

/**
 * 等待服务器真正可连。
 * 重启接口返回 200 只代表"请求被接受"，此时服务器可能还在 boot（甚至 3 秒后崩在
 * 插件 onEnable）。不探针的话 `dev` 每轮都会给出一个虚假的 ✔。
 */
async function waitReady(
  host: string,
  serverDir: string,
  fallbackPort: number,
  timeoutMs: number
): Promise<boolean> {
  const port = readServerPort(serverDir, fallbackPort);
  const deadline = Date.now() + timeoutMs;
  let waited = 0;
  while (Date.now() < deadline) {
    if (await tcpProbe(port, host)) {
      ok(`服务器已就绪（端口 ${port} 可连，等待 ${waited}s）`);
      return true;
    }
    await sleep(1000);
    waited++;
    if (waited % 10 === 0) step(`  等待服务器就绪… 已等 ${waited}s（探测端口 ${port}）`);
  }
  warn(
    `等待就绪超时（${Math.round(timeoutMs / 1000)}s，${host}:${port} 仍不可连）` +
      ` —— 服务器可能没起来或崩了，检查 logs/latest.log`
  );
  return false;
}

/**
 * 按配置的重启策略重启服务器。
 * dev 模式自己托管进程时不走这里（它能优雅停服），这里服务一次性的 deploy。
 */
export async function applyRestart(cfg: ResolvedConfig, opts: { skip?: boolean } = {}): Promise<boolean> {
  if (opts.skip) {
    info('已跳过重启');
    return true;
  }
  const r = cfg.restart;
  const timeoutMs = r.timeoutMs ?? 180_000;
  const port = cfg.spec.server?.port ?? 25565;
  const readyTimeout = Math.min(timeoutMs, 120_000);

  if (r.type === 'none') {
    info('重启策略 none —— 只部署，不重启');
    return true;
  }

  if (r.type === 'http') {
    step(`请求重启：${r.url}`);
    try {
      const res = await httpRequest(r.url!, timeoutMs);
      if (res.status < 200 || res.status >= 300) {
        error(`重启接口返回 HTTP ${res.status}：${res.body.slice(0, 300)}`);
        return false;
      }
      ok(`重启请求已接受（HTTP ${res.status}）`);
      // 200 不等于起来了 —— 探针确认端口真的能连
      return await waitReady(probeHostOf(cfg), cfg.serverDir, port, readyTimeout);
    } catch (e) {
      error(`重启请求失败：${(e as Error).message}`);
      hint('检查守护进程是否在运行，或把 restart.type 改成 command');
      return false;
    }
  }

  if (r.type === 'command') {
    step(`执行重启命令：${r.run}`);
    const res = await runShell(r.run!, timeoutMs);
    if (res.code !== 0) {
      error(`重启命令失败（exit ${res.code}）：${res.out.slice(0, 300)}`);
      return false;
    }
    ok('重启命令执行完成');
    if (res.out) dim(res.out.split('\n').slice(-5).join('\n'));
    return await waitReady(probeHostOf(cfg), cfg.serverDir, port, readyTimeout);
  }

  // type === 'mcsdev'：由 mcsdev 管理的实例
  const instName = cfg.link?.instanceName;
  if (!instName) {
    error('restart.type=mcsdev 但 link 不是 mcsdev 管理的实例');
    hint('外部服务器请用 restart: { type: http, url: ... } 或 { type: command, run: ... }');
    return false;
  }
  const inst = getInstance(instName);
  if (!inst) {
    error(`实例 ${instName} 不在注册表里`);
    return false;
  }
  step(`重启 mcsdev 实例 ${inst.name}`);
  await stopServerExternal(inst);
  await startServer(inst, { detach: true });
  ok(`实例 ${inst.name} 已重启（后台）`);
  return await waitReady('127.0.0.1', inst.dir, inst.port, readyTimeout);
}
