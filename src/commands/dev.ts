/**
 * `mcsdev dev` —— 开发循环：watch 构建产物 → 自动部署 → 按策略重启。
 *
 * 三个必须处理好的点（否则会随机抽风）：
 *  1. 写入竞态：gradle 写 jar 不是原子的，必须防抖 + 大小稳定检测，否则复制到半个 jar
 *  2. 重启串行化：重启期间又出新 jar 不能并发重启，只保留最后一次（中间几次没意义）
 *  3. 优雅退出：Ctrl+C 时如果 mcsdev 托管着服务器，先 stop 等世界保存
 */

import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { loadConfig, ResolvedConfig } from '../compose';
import { applyRestart, deployAll, printTarget, runShell } from '../deployer';
import { getInstance } from '../registry';
import {
  ServerHandle,
  gracefulStopHandle,
  runningPid,
  setActiveStop,
  startServer,
  stopServerExternal,
} from '../server';
import { exists, listFilesRecursive, writeJson } from '../util/fsx';
import { acquireLock, releaseLock } from '../util/lock';
import { dim, error, hint, info, ok, step, warn } from '../util/log';
import * as pc from 'picocolors';

export interface DevOptions {
  /** 只跑一轮，不 watch */
  once?: boolean;
  /** 只打印将要做什么，不落盘也不重启 */
  dryRun?: boolean;
  /** 忽略"已是最新"，强制重装 */
  force?: boolean;
  /** 只 watch/部署指定 id */
  only?: string[];
  /** 轮询间隔（毫秒），默认 500 */
  intervalMs?: number;
}

/** watch 时忽略的干扰产物（跟部署阶段的 DEFAULT_EXCLUDE 对齐） */
const NOISE_SUFFIX = ['-sources.jar', '-javadoc.jar', '-dev.jar', '-mojang-mapped.jar', '-plain.jar'];

function isNoiseJar(name: string): boolean {
  const l = name.toLowerCase();
  return NOISE_SUFFIX.some((s) => l.endsWith(s));
}

/** 从 plugins 条目的 glob 里提取要 watch 的目录（only 过滤时只 watch 选中的 id） */
function watchDirs(cfg: ResolvedConfig, only?: string[]): { dirs: string[]; missing: string[] } {
  const dirs = new Set<string>();
  const missing: string[] = [];
  const targets = only && only.length > 0 ? cfg.plugins.filter((p) => only.includes(p.id)) : cfg.plugins;
  for (const p of targets) {
    const norm = p.entry.path.replace(/\\/g, '/');
    const slash = norm.lastIndexOf('/');
    const rel = slash >= 0 ? norm.slice(0, slash) : '.';
    const abs = path.resolve(cfg.spec.dir, rel);
    if (exists(abs)) dirs.add(abs);
    else missing.push(`${p.id}: ${abs}`);
  }
  for (const e of cfg.spec.dev?.extraWatch ?? []) {
    const abs = path.resolve(cfg.spec.dir, e);
    if (exists(abs)) dirs.add(abs);
    else missing.push(`extraWatch: ${abs}`);
  }
  return { dirs: [...dirs], missing };
}

/** 目录快照：文件名 + 大小 + mtime。任何变化都会让快照不同 */
function snapshot(dirs: string[]): string {
  const parts: string[] = [];
  for (const d of dirs) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(d);
    } catch {
      continue;
    }
    for (const n of names) {
      if (!n.toLowerCase().endsWith('.jar')) continue;
      if (isNoiseJar(n)) continue; // sources/javadoc 不该触发一轮部署
      try {
        const st = fs.statSync(path.join(d, n));
        if (!st.isFile()) continue;
        parts.push(`${d}|${n}|${st.size}|${st.mtimeMs}`);
      } catch {
        /* 竞态跳过 */
      }
    }
  }
  parts.sort();
  return parts.join('\n');
}

/** 源码快照（递归）：只用来判断"要不要跑一次构建"，不关心具体内容 */
function sourceSnapshot(dirs: string[]): string {
  const parts: string[] = [];
  for (const d of dirs) {
    for (const f of listFilesRecursive(d, 8)) {
      try {
        const st = fs.statSync(f);
        parts.push(`${f}|${st.size}|${st.mtimeMs}`);
      } catch {
        /* 竞态跳过 */
      }
    }
  }
  parts.sort();
  return parts.join('\n');
}

export async function devCmd(opts: DevOptions = {}): Promise<void> {
  let cfg: ResolvedConfig;
  try {
    cfg = loadConfig(process.cwd());
  } catch (e) {
    error((e as Error).message);
    process.exitCode = 1;
    return;
  }

  printTarget(cfg);

  if (cfg.errors.length > 0) {
    for (const e of cfg.errors) error(e);
    hint('先修好配置错误（mcsdev config 可看详情）');
    process.exitCode = 1;
    return;
  }

  // 未知 id 立即退出：报错后继续往下跑会用一句无关的病因把用户带偏
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

  const targets =
    opts.only && opts.only.length > 0 ? cfg.plugins.filter((p) => opts.only!.includes(p.id)) : cfg.plugins;
  const entryErrors = targets.flatMap((p) => p.errors);
  if (entryErrors.length > 0) {
    for (const e of entryErrors) error(e);
    process.exitCode = 1;
    return;
  }

  for (const w of cfg.warnings) warn(w);

  if (opts.dryRun) {
    warn('dry-run：只打印计划，不写目标目录、不重启');
  }

  const debounce = Math.max(200, cfg.spec.dev?.debounce ?? 800);
  const interval = Math.max(150, opts.intervalMs ?? 500);

  // mcsdev 托管的实例：dev 自己持有进程句柄，才能优雅重启
  let handle: ServerHandle | null = null;
  const managedInstance =
    cfg.restart.type === 'mcsdev' && cfg.link?.instanceName ? getInstance(cfg.link.instanceName) : undefined;

  let busy = false;
  let queued = false;
  let cycles = 0;
  let hadFailure = false;

  // 自动构建（可选）：源码变了先跑构建命令，产物更新后由产物通道触发部署
  const buildCmd = cfg.spec.dev?.build;
  const sourceDirs = buildCmd
    ? (cfg.spec.dev?.sources ?? ['src/main'])
        .map((s) => path.resolve(cfg.spec.dir, s))
        .filter((d) => exists(d))
    : [];
  let building = false;

  const runBuild = async (): Promise<void> => {
    if (!buildCmd || building) return;
    building = true;
    try {
      info(`源码变化 → 执行构建：${pc.dim(buildCmd)}`);
      const res = await runShell(buildCmd, 600_000);
      if (res.code !== 0) {
        error(`构建失败（exit ${res.code}）—— 产物没更新，服务器还是旧版本`);
        if (res.out) dim(res.out.split('\n').slice(-15).join('\n'));
        hadFailure = true;
        return;
      }
      ok('构建完成，等产物更新…');
    } finally {
      building = false;
    }
  };

  const restartServer = async (): Promise<void> => {
    if (opts.dryRun) {
      dim(`  [dry-run] 会按 restart.${cfg.restart.type} 重启服务器`);
      return;
    }
    if (cfg.restart.type === 'none') {
      dim('  重启策略 none —— 已部署，需要你手动重启服务器');
      return;
    }
    if (cfg.restart.type === 'mcsdev' && managedInstance) {
      if (handle) {
        await gracefulStopHandle(handle);
        handle = null;
      } else if (runningPid(managedInstance.name)) {
        warn('实例由外部启动，mcsdev 拿不到句柄，只能强杀（世界可能未保存）');
        await stopServerExternal(managedInstance);
      }
      handle = await startServer(managedInstance, { relayStdin: true });
      return;
    }
    const okRestart = await applyRestart(cfg);
    if (!okRestart) hadFailure = true;
  };

  const runCycle = async (reason: string): Promise<void> => {
    if (busy) {
      queued = true;
      return;
    }
    busy = true;
    cycles++;
    try {
      console.log();
      info(`${pc.bold(`第 ${cycles} 轮`)}  ${pc.dim(reason)}`);
      const outcomes = deployAll(cfg, { force: opts.force, only: opts.only, dryRun: opts.dryRun });
      const failed = outcomes.filter((o) => o.action === 'failed');
      const changed = outcomes.filter((o) => o.action === 'deployed');

      if (failed.length > 0) {
        error(`${failed.length} 条失败 —— 跳过重启，等你修`);
        hadFailure = true;
        return;
      }
      if (changed.length === 0) {
        dim('  产物无变化，跳过重启');
        return;
      }
      await restartServer();
    } finally {
      busy = false;
      if (queued) {
        queued = false;
        // 让事件循环喘口气，避免连续变化时刷屏
        setTimeout(() => void runCycle('排队的变化'), 50);
      }
    }
  };

  // ---- 初始部署 ----
  await runCycle('初始部署');

  // dry-run 隐含"只跑一轮"：用户说"预演"，不该得到一个挂住的 watch 进程
  if (opts.once || opts.dryRun || cfg.spec.dev?.watch === false) {
    if (hadFailure) process.exitCode = 1;
    if (opts.dryRun) {
      ok('dry-run 结束（未写盘、未重启、未进入 watch）');
    } else {
      ok('已完成一轮部署（未 watch）');
    }
    return;
  }

  // ---- 进入 watch ----
  const { dirs, missing } = watchDirs(cfg, opts.only);
  if (missing.length > 0) {
    warn(`以下目录不存在，不会监视：`);
    for (const m of missing) dim(`   ${m}`);
    hint('先构建一次（./gradlew build），或从 mcsdev.yml 里删掉对应条目');
  }
  if (dirs.length === 0) {
    error('没有可 watch 的目录 —— plugins 的 path 都没指向已存在的构建目录');
    process.exitCode = 1;
    return;
  }

  // 跨进程锁：两个 dev 打同一个 plugins/ 不是报错而是更难查的事 ——
  // 交替部署、交替重启，服务器反复起停，日志里看不出是谁干的
  const lockFile = path.join(cfg.serverDir, 'plugins', '.mcsdev-dev.lock');
  const acquired = acquireLock(lockFile, 'dev');
  if (!acquired.ok) {
    error(
      `另一个 mcsdev 正在操作这台服务器（PID ${acquired.holder.pid}，工作目录 ${acquired.holder.cwd}，开始于 ${acquired.holder.startedAt}）`
    );
    hint('先退出那个会话；如果那个进程已经不在了，删掉锁文件重试：' + lockFile);
    process.exitCode = 1;
    return;
  }

  console.log();
  ok('进入 watch 模式');
  for (const d of dirs) console.log('   ' + pc.dim('监视 ') + d);
  if (buildCmd && sourceDirs.length > 0) {
    for (const d of sourceDirs) console.log('   ' + pc.dim('源码 ') + d);
    console.log('   ' + pc.dim(`构建 ${buildCmd}`));
  }
  console.log('   ' + pc.dim(`防抖 ${debounce}ms · 轮询 ${interval}ms · Ctrl+C 退出`));
  if (!buildCmd) {
    warn('dev 只 watch 构建产物，不负责编译 —— 改完代码记得先构建');
    hint('想让它自动构建：在 mcsdev.yml 的 dev 段写 build: "gradlew build"');
  } else if (sourceDirs.length === 0) {
    warn(`配了 dev.build 但源码目录都不存在（${(cfg.spec.dev?.sources ?? ['src/main']).join(', ')}）`);
    hint('用 dev.sources 指定源码目录，如 sources: ["src/main/java"]');
  }
  if (cfg.restart.type === 'none') {
    warn('重启策略是 none —— 每次部署后需要你手动重启服务器才会生效');
    hint('想自动重启：在 mcsdev.yml 里配 restart（http 或 command）');
  }


  // 本地 IPC：dev 托管服务器时 `mcsdev exec` 可以直接走 stdin，不必为了发一条命令去开 RCON
  const ipcFile = path.join(cfg.serverDir, 'plugins', '.mcsdev-dev.json');
  let ipcServer: net.Server | null = null;
  if (managedInstance) {
    ipcServer = net.createServer((sock) => {
      let buf = '';
      sock.on('error', () => undefined);
      sock.on('data', (d: Buffer) => {
        buf += d.toString();
        const idx = buf.indexOf('\n');
        if (idx < 0) return;
        const cmd = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!handle || !handle.child.stdin) {
          sock.write('ERR 服务器未在运行\n');
          sock.end();
          return;
        }
        try {
          handle.child.stdin.write(cmd + '\n');
          sock.write('OK\n');
        } catch (e) {
          sock.write(`ERR ${(e as Error).message}\n`);
        }
        sock.end();
      });
    });
    ipcServer.listen(0, '127.0.0.1', () => {
      const addr = ipcServer?.address();
      if (addr && typeof addr === 'object') {
        writeJson(ipcFile, { port: addr.port, pid: process.pid, startedAt: new Date().toISOString() });
      }
    });
  }

  // Ctrl+C：如果托管着服务器，先优雅停
  setActiveStop(async () => {
    if (handle) {
      await gracefulStopHandle(handle);
      handle = null;
    }
  });

  let lastArtifacts = snapshot(dirs);
  let lastArtifactChangeAt = 0;
  let artifactPending = false;

  let lastSources = sourceSnapshot(sourceDirs);
  let lastSourceChangeAt = 0;
  let sourcePending = false;

  const timer = setInterval(() => {
    // 通道一：构建产物变化 → 部署
    const curA = snapshot(dirs);
    if (curA !== lastArtifacts) {
      lastArtifacts = curA;
      lastArtifactChangeAt = Date.now();
      if (!artifactPending) {
        artifactPending = true;
        step('检测到产物变化，等待写稳…');
      }
    } else if (artifactPending && Date.now() - lastArtifactChangeAt >= debounce) {
      artifactPending = false;
      void runCycle('产物变化');
    }

    // 通道二：源码变化 → 构建（产物更新后由通道一接手）
    if (buildCmd && sourceDirs.length > 0) {
      const curS = sourceSnapshot(sourceDirs);
      if (curS !== lastSources) {
        lastSources = curS;
        lastSourceChangeAt = Date.now();
        if (!sourcePending) {
          sourcePending = true;
          step('检测到源码变化…');
        }
      } else if (sourcePending && Date.now() - lastSourceChangeAt >= debounce) {
        sourcePending = false;
        void runBuild();
      }
    }
  }, interval);

  // 保持进程存活直到 Ctrl+C
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      clearInterval(timer);
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });

  setActiveStop(null);
  if (ipcServer) {
    ipcServer.close();
    try {
      fs.unlinkSync(ipcFile);
    } catch {
      /* 已删 */
    }
  }
  releaseLock(lockFile);
  if (hadFailure) process.exitCode = 1;
  ok('dev 会话结束');
}
