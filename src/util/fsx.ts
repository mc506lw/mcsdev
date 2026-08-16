import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

/** 全局配置目录（可用 MCSDEV_HOME 覆盖，便于测试） */
export function mcsdevHome(): string {
  return process.env.MCSDEV_HOME || path.join(os.homedir(), '.mcsdev');
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** 原子写 JSON（先写临时文件再 rename，避免半截文件） */
export function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** 目录为空（不存在也视为空） */
export function isEmptyDir(dir: string): boolean {
  if (!exists(dir)) return true;
  return fs.readdirSync(dir).filter((n) => n !== '.gitkeep').length === 0;
}

export function sha256File(file: string): string | null {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/** 递归枚举目录下所有文件（限深，忽略隐藏目录与 node_modules） */
export function listFilesRecursive(dir: string, maxDepth = 4): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number): void => {
    if (depth > maxDepth || !exists(d)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else out.push(full);
    }
  };
  walk(dir, 0);
  return out;
}

/** 原子复制：先复制到目标目录内临时文件，再 rename 覆盖 */
export function atomicCopy(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  const tmp = `${dest}.mcsdev-tmp${process.pid}`;
  fs.copyFileSync(src, tmp);
  fs.renameSync(tmp, dest);
}