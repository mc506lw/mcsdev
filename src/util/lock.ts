/**
 * 跨进程锁 —— 防止两个 `mcsdev dev` 打同一个 plugins/ 目录。
 *
 * 没有锁的后果不是"报错"，而是更难查的东西：两个会话交替部署、交替重启，
 * 服务器反复起停，日志里看不出是谁干的。
 *
 * 锁文件里记 pid；持有者进程已死则视为陈旧锁直接接管（否则崩溃一次就永远锁住）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { ensureDir, exists, readJson, writeJson } from './fsx';

export interface LockInfo {
  pid: number;
  startedAt: string;
  cwd: string;
  command: string;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export type AcquireResult = { ok: true } | { ok: false; holder: LockInfo };

/** 尝试取锁。成功返回 ok；被活着的进程占着则返回持有者信息。 */
export function acquireLock(lockFile: string, command: string): AcquireResult {
  if (exists(lockFile)) {
    const prev = readJson<LockInfo | null>(lockFile, null);
    if (prev && typeof prev.pid === 'number' && prev.pid !== process.pid && isAlive(prev.pid)) {
      return { ok: false, holder: prev };
    }
    // 陈旧锁（持有者已退出或文件损坏）：接管
  }
  ensureDir(path.dirname(lockFile));
  const info: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    cwd: process.cwd(),
    command,
  };
  writeJson(lockFile, info);
  return { ok: true };
}

/** 释放锁（只删自己持有的那把） */
export function releaseLock(lockFile: string): void {
  try {
    const cur = readJson<LockInfo | null>(lockFile, null);
    if (cur && cur.pid === process.pid) fs.unlinkSync(lockFile);
  } catch {
    /* 已经不在了 */
  }
}

/** 读当前锁持有者（不取锁，只查看） */
export function peekLock(lockFile: string): LockInfo | null {
  if (!exists(lockFile)) return null;
  const info = readJson<LockInfo | null>(lockFile, null);
  if (!info || typeof info.pid !== 'number') return null;
  return isAlive(info.pid) ? info : null;
}
