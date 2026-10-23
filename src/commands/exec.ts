/**
 * `mcsdev exec <命令...>` —— 通过 RCON 往运行中的服务器发一条命令。
 *
 * 为什么需要：改插件配置、`reload confirm`、`plugins` 这类验证操作，
 * 比整服重启便宜得多。之前只能去开守护进程的控制台敲。
 *
 * RCON 配置来源（优先级从高到低）：
 *  1. mcsdev.yml 的 `rcon:` 段
 *  2. link 指向的服务器目录里 server.properties 的 enable-rcon / rcon.port / rcon.password
 */

import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { loadConfig, RconSpec } from '../compose';
import { rconCommand } from '../rcon';
import { exists, readJson } from '../util/fsx';
import { error, hint, info, ok } from '../util/log';
import * as pc from 'picocolors';

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 优先走 dev 会话的本地 IPC：dev 前台托管着服务器进程、手里有 stdin，
 * 没必要为了发一条命令就要求用户去开 enable-rcon。
 * 返回 null 表示没有可用的 dev 会话（或连接失败），调用方退回 RCON。
 */
function tryDevIpc(serverDir: string, command: string): Promise<string | null> {
  const f = path.join(serverDir, 'plugins', '.mcsdev-dev.json');
  if (!exists(f)) return Promise.resolve(null);
  const meta = readJson<{ port?: number; pid?: number } | null>(f, null);
  if (!meta || typeof meta.port !== 'number' || typeof meta.pid !== 'number') return Promise.resolve(null);
  if (!isAlive(meta.pid)) return Promise.resolve(null);
  const port: number = meta.port;

  return new Promise((resolve) => {
    const sock = new net.Socket();
    let out = '';
    let done = false;
    const finish = (v: string | null): void => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(3000);
    sock.on('timeout', () => finish(null));
    sock.on('error', () => finish(null));
    sock.on('connect', () => sock.write(command + '\n'));
    sock.on('data', (d: Buffer) => (out += d.toString()));
    sock.on('close', () => finish(out.trim() || 'OK'));
    sock.connect(port, '127.0.0.1');
  });
}

function readRconFromProps(serverDir: string): RconSpec | { error: string } {
  const p = path.join(serverDir, 'server.properties');
  if (!exists(p)) return { error: `找不到 ${p}` };
  let txt: string;
  try {
    txt = fs.readFileSync(p, 'utf8');
  } catch (e) {
    return { error: `读不到 server.properties：${(e as Error).message}` };
  }
  const get = (k: string): string | undefined => {
    const m = txt.match(new RegExp(`^${k.replace(/\./g, '\\.')}=(.*)$`, 'm'));
    return m ? m[1].trim() : undefined;
  };
  if (get('enable-rcon') !== 'true') {
    return { error: '服务器没开 RCON（server.properties 里 enable-rcon=false）' };
  }
  const password = get('rcon.password');
  if (!password) return { error: 'server.properties 里没有 rcon.password' };
  return {
    host: '127.0.0.1',
    port: Number(get('rcon.port') ?? 25575),
    password,
  };
}

export async function execCmd(parts: string[]): Promise<void> {
  let cfg;
  try {
    cfg = loadConfig(process.cwd());
  } catch (e) {
    error((e as Error).message);
    process.exitCode = 1;
    return;
  }

  const command = parts.join(' ').trim().replace(/^\//, '');
  if (!command) {
    error('要给一条命令，例如：mcsdev exec say hello');
    process.exitCode = 1;
    return;
  }

  // 优先：dev 会话的 stdin 通道（不需要 RCON）
  const viaIpc = await tryDevIpc(cfg.serverDir, command);
  if (viaIpc !== null) {
    info(`通过 dev 会话的 stdin 发送：${pc.dim(command)}`);
    if (viaIpc.startsWith('ERR')) {
      error(viaIpc.replace(/^ERR\s*/, ''));
      process.exitCode = 1;
      return;
    }
    ok('已发送（服务器输出见 dev 会话的终端）');
    return;
  }

  let rcon: RconSpec | undefined = cfg.spec.rcon;
  if (!rcon) {
    const r = readRconFromProps(cfg.serverDir);
    if ('error' in r) {
      error(`无法确定 RCON 连接：${r.error}`);
      hint('在 mcsdev.yml 里显式配置：rcon: { host, port, password }');
      hint('或在该服务器的 server.properties 里设 enable-rcon=true 和 rcon.password');
      process.exitCode = 1;
      return;
    }
    rcon = r;
  }

  info(`RCON → ${rcon.host ?? '127.0.0.1'}:${rcon.port ?? 25575}  ${pc.dim(command)}`);
  try {
    const out = await rconCommand(
      {
        host: rcon.host ?? '127.0.0.1',
        port: rcon.port ?? 25575,
        password: rcon.password,
        timeoutMs: 10_000,
      },
      command
    );
    if (out.trim()) console.log(out);
    ok('命令已执行');
  } catch (e) {
    error((e as Error).message);
    hint('服务器在跑吗？端口和密码对得上吗？（默认 RCON 端口 25575）');
    process.exitCode = 1;
  }
}
