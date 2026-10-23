/**
 * 最小 RCON 客户端（Source RCON 协议）。
 *
 * 包格式：length(int32 LE) + id(int32) + type(int32) + body(utf8) + 两个 null 字节
 *   type 3 = AUTH，2 = AUTH_RESPONSE / COMMAND，0 = RESPONSE
 *
 * 只实现 `mcsdev exec` 需要的部分：认证 → 发一条命令 → 收响应。
 */

import * as net from 'net';

const TYPE_AUTH = 3;
const TYPE_AUTH_RESPONSE = 2;
const TYPE_COMMAND = 2;
const TYPE_RESPONSE = 0;

function pack(id: number, type: number, body: string): Buffer {
  const b = Buffer.from(body, 'utf8');
  const size = 4 + 4 + b.length + 2;
  const buf = Buffer.alloc(4 + size);
  buf.writeInt32LE(size, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  b.copy(buf, 12);
  buf.writeUInt16LE(0, 12 + b.length);
  return buf;
}

export interface RconOptions {
  host: string;
  port: number;
  password: string;
  timeoutMs?: number;
}

/** 执行一条 RCON 命令，返回服务器响应文本 */
export function rconCommand(opts: RconOptions, command: string): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 10_000;

  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let buf = Buffer.alloc(0);
    let done = false;
    const chunks: string[] = [];
    let settleTimer: NodeJS.Timeout | null = null;

    const finish = (err?: Error, out?: string): void => {
      if (done) return;
      done = true;
      if (settleTimer) clearTimeout(settleTimer);
      sock.destroy();
      if (err) reject(err);
      else resolve(out ?? '');
    };

    sock.setTimeout(timeoutMs);
    sock.on('timeout', () => finish(new Error(`RCON 超时（${timeoutMs}ms）—— 服务器可能没在跑`)));
    sock.on('error', (e) => finish(e));
    sock.on('close', () => {
      if (!done) finish(undefined, chunks.join('\n'));
    });

    sock.on('data', (data: Buffer) => {
      buf = Buffer.concat([buf, data]);
      for (;;) {
        if (buf.length < 4) break;
        const len = buf.readInt32LE(0);
        if (len < 10 || buf.length < 4 + len) break;
        const id = buf.readInt32LE(4);
        const type = buf.readInt32LE(8);
        const body = buf.subarray(12, 4 + len - 2).toString('utf8');
        buf = buf.subarray(4 + len);

        if (type === TYPE_AUTH_RESPONSE) {
          if (id === -1) {
            finish(new Error('RCON 认证失败：密码错误（看 server.properties 的 rcon.password）'));
            return;
          }
          sock.write(pack(2, TYPE_COMMAND, command));
          continue;
        }
        if (type === TYPE_RESPONSE) {
          chunks.push(body);
          // 长响应会被拆成多个包，等一小会儿没有新包再收尾
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(() => finish(undefined, chunks.join('\n')), 200);
        }
      }
    });

    sock.connect(opts.port, opts.host, () => {
      sock.write(pack(1, TYPE_AUTH, opts.password));
    });
  });
}
