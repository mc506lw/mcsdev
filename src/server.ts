import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { effectivePrefs, getConfig } from './config';
import { pickDefaultJava, listSavedJava } from './java';
import { InstanceMeta } from './registry';
import { colorLevel, dim, error, hint, info, ok, stripAnsi, warn } from './util/log';
import { ensureDir, exists, mcsdevHome, readJson, writeJson } from './util/fsx';
import { runCmd } from './util/run';
import * as pc from 'picocolors';

/**
 * 服务器子进程托管（DESIGN.md §7）：
 * - 工具拉起并托管子进程，stdin 直发命令（如 stop），stdout 直读日志
 * - 优雅停止优先 stdin `stop`，超时强杀；Windows 用 taskkill /T 清理进程树
 * - 运行状态记在 ~/.mcsdev/running.json（跨进程可见）
 */

interface RunningState {
  [instance: string]: { pid: number; startedAt: number };
}

function stateFile(): string {
  return path.join(mcsdevHome(), 'running.json');
}

function readState(): RunningState {
  return readJson<RunningState>(stateFile(), {});
}

function writeState(s: RunningState): void {
  writeJson(stateFile(), s);
}

function deleteState(name: string): void {
  const s = readState();
  if (s[name]) {
    delete s[name];
    writeState(s);
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function runningPid(name: string): number | null {
  const rec = readState()[name];
  if (!rec) return null;
  return isProcessAlive(rec.pid) ? rec.pid : null;
}

/** 决定实例用哪个 JDK：实例绑定 > 全局默认 > 扫描列表推荐 */
export function javaBinFor(meta: InstanceMeta): string | undefined {
  const cfg = getConfig();
  if (meta.javaBin && exists(meta.javaBin)) return meta.javaBin;
  if (cfg.defaultJava && exists(cfg.defaultJava)) return cfg.defaultJava;
  return pickDefaultJava(listSavedJava())?.bin;
}

export interface StartOptions {
  /** 是否把父进程 stdin 转给服务器（run 前台模式） */
  relayStdin?: boolean;
  /** 每个日志行回调（测试/二次处理用） */
  onLine?: (line: string) => void;
}

export interface ServerHandle {
  child: ChildProcess;
  meta: InstanceMeta;
}

/** 服务器日志行 → 带上色级别打印 + 写入 latest.log + 常见错误提示 */
function makeLineHandler(meta: InstanceMeta, opts: StartOptions) {
  const logDir = path.join(meta.dir, 'logs');
  ensureDir(logDir);
  const latest = path.join(logDir, 'latest.log');
  const seenHints = new Set<string>();

  const HINTS: Array<[RegExp, string]> = [
    [/NoClassDefFoundError|ClassNotFound/i, '插件依赖缺失（fat jar 需用 shadowJar 打包依赖）'],
    [/UnsupportedClassVersionError/i, 'Java 版本过旧：Paper 1.20.5+ 需要 Java 21；可用 mcsdev java use 换 JDK'],
    [/Failed to bind to port/i, `端口被占用，实例 ${meta.name} 的端口为 ${meta.port}`],
    [/Invalid plugin\.yml|plugin\.yml.*(?:invalid|error)|Failed to load.*plugin\.yml/i, 'plugin.yml 格式有误，检查主类/版本字段'],
    [/NoSuchMethodError|NoSuchFieldError|NoClassDefFound/i, '插件与 Paper API 版本不匹配，请重新编译插件'],
    [/Exception in thread "main"/i, '服务器启动失败，请看上方堆栈；常见原因：Java 版本 / 端口 / 核心不兼容'],
    [/a fatal error/i, 'JVM 崩溃（日志里会有 hs_err 提示）'],
    [/Error: Could not find or load main class/i, 'server.jar 损坏或不完整，用 mcsdev rebuild 或重新 mcsdev new'],
  ];

  let buf = '';
  const time = (): string => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  return (chunk: Buffer): void => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw;
      if (!line.trim()) continue;
      // stdout 着色：时间 + 级别
      const m = line.match(/^(\[[0-9:]+\])\s*(\[[A-Z]+\])?(.*)$/);
      let out: string;
      if (m) {
        const lvl = m[2] ? colorLevel(m[2].replace(/[\[\]]/g, '')) : '';
        out = `${pc.dim(m[1] as string)} ${lvl}${(m[3] ?? '').replace(/^\s/, ' ')}`;
      } else {
        out = pc.dim(line);
      }
      console.log(out);
      try {
        fs.appendFileSync(latest, stripAnsi(line) + '\n');
      } catch {
        /* 日志写入失败不阻塞 */
      }
      opts.onLine?.(line);
      // 错误提示（每种只提示一次）
      for (const [re, msg] of HINTS) {
        if (re.test(line) && !seenHints.has(msg)) {
          seenHints.add(msg);
          console.log(pc.cyan('   ↑ ') + pc.dim(msg));
        }
      }
    }
  };
}

/** 启动服务器子进程（同进程内持有句柄，可 stdin 优雅停止） */
export async function startServer(meta: InstanceMeta, opts: StartOptions = {}): Promise<ServerHandle> {
  const bin = javaBinFor(meta);
  if (!bin) {
    throw new Error(`实例 ${meta.name} 无可用 JDK：先运行 mcsdev java scan，或在 mcsdev new 时绑定`);
  }
  const prev = runningPid(meta.name);
  if (prev) {
    throw new Error(`实例 ${meta.name} 已在运行（PID ${prev}）——请先 stop 再 start`);
  }

  const cfg = getConfig();
  const prefs = effectivePrefs(cfg, meta.overrides);
  const mem = prefs.memory;
  const args = ['-Xms' + mem, '-Xmx' + mem, '-Dfile.encoding=UTF-8', '-jar', 'server.jar', 'nogui'];

  info(`启动 ${meta.name}（${meta.core} ${meta.mcVersion}，PID 待定，内存 ${mem}）`);
  const child = spawn(bin, args, { cwd: meta.dir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: false });

  writeState({ ...readState(), [meta.name]: { pid: child.pid ?? 0, startedAt: Date.now() } });
  info(`Java：${bin}`);

  const handler = makeLineHandler(meta, opts);
  child.stdout?.on('data', handler);
  child.stderr?.on('data', handler);

  child.on('error', (e) => {
    deleteState(meta.name);
    error(`启动失败：${e.message}`);
  });

  child.on('close', (code, signal) => {
    const wasRunning = runningPid(meta.name) !== null;
    deleteState(meta.name);
    if (code === 0) {
      ok(`实例 ${meta.name} 已停止（exit 0）`);
    } else if (!wasRunning) {
      // 启动瞬间崩溃
      error(`实例 ${meta.name} 启动失败（code=${code} signal=${signal}）`);
      hint('常见原因：JDK 版本不符、server.jar 损坏、端口占用；详见上方日志提示');
    } else {
      error(`实例 ${meta.name} 异常退出（code=${code} signal=${signal}）`);
    }
  });

  if (opts.relayStdin && process.stdin.isTTY) {
    process.stdin.on('data', (d: Buffer) => {
      try {
        child.stdin?.write(d);
      } catch {
        /* 子进程已退出 */
      }
    });
  }
  return { child, meta };
}

/** 同一进程内优雅停止：stdin 发 stop → 超时强杀进程树 */
export async function gracefulStopHandle(handle: ServerHandle, timeoutMs = 10000): Promise<void> {
  const { child, meta } = handle;
  if (child.exitCode !== null) return;
  info(`发送 stop 命令到 ${meta.name}…`);
  try {
    child.stdin?.write('stop\n');
  } catch {
    /* 管道已关 */
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    await sleep(300);
  }
  if (child.exitCode === null) {
    warn(`stop 超时，强制结束进程树（PID ${child.pid}）`);
    await forceKillPid(child.pid ?? 0);
  }
  deleteState(meta.name);
}

/** 跨进程停止（mcsdev stop）：进程树强杀（Windows taskkill /T /F；POSIX SIGTERM→SIGKILL） */
export async function stopServerExternal(meta: InstanceMeta, opts: { timeoutMs?: number } = {}): Promise<boolean> {
  const pid = runningPid(meta.name);
  if (!pid) {
    warn(`实例 ${meta.name} 未在运行`);
    return false;
  }
  const timeout = opts.timeoutMs ?? 10000;
  if (process.platform === 'win32') {
    info(`强制停止 ${meta.name}（PID ${pid}，Windows 独立 stop 无法经 stdin 优雅停止，世界可能未保存）`);
    await runCmd('taskkill', ['/pid', String(pid), '/T', '/F']);
  } else {
    info(`停止 ${meta.name}（PID ${pid}，SIGTERM→SIGKILL）`);
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* 已退出 */
    }
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (!isProcessAlive(pid)) break;
      await sleep(500);
    }
    if (isProcessAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* 已退出 */
      }
    }
  }
  deleteState(meta.name);
  ok(`实例 ${meta.name} 已停止`);
  return true;
}

/** 强杀某个 PID 的进程树 */
export async function forceKillPid(pid: number): Promise<void> {
  if (!pid) return;
  if (process.platform === 'win32') {
    await runCmd('taskkill', ['/pid', String(pid), '/T', '/F']);
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* 已退出 */
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}