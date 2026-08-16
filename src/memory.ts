import * as fs from 'fs';
import * as path from 'path';
import { mcsdevHome, readJson, writeJson } from './util/fsx';

/**
 * run 的选择记忆（DESIGN.md §5.5）：
 * 键 = (mcVersion, 构建产物文件集合指纹)；集合不变则沿用上次选择的 {实例, jar}。
 * 注意：同名 jar 内容变化不算集合变化 —— 重新构建后直接部署是预期行为。
 */
interface RunMemory {
  [key: string]: { instance: string; jar: string };
}

export interface FileStamp {
  name: string;
  size: number;
  mtimeMs: number;
}

function memoryFile(): string {
  return path.join(mcsdevHome(), 'run-memory.json');
}

export function fingerprint(stamps: FileStamp[]): string {
  return [...stamps]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `${s.name}:${s.size}:${s.mtimeMs}`)
    .join(';');
}

export function getMemory(version: string, stamps: FileStamp[]): { instance: string; jar: string } | undefined {
  const mem = readJson<RunMemory>(memoryFile(), {});
  return mem[`${version}|${fingerprint(stamps)}`];
}

export function setMemory(
  version: string,
  stamps: FileStamp[],
  value: { instance: string; jar: string }
): void {
  const mem = readJson<RunMemory>(memoryFile(), {});
  mem[`${version}|${fingerprint(stamps)}`] = value;
  writeJson(memoryFile(), mem);
}

/** `run --forget`：清掉该版本的全部记忆 */
export function forgetVersion(version: string): void {
  const mem = readJson<RunMemory>(memoryFile(), {});
  for (const key of Object.keys(mem)) {
    if (key.startsWith(version + '|')) delete mem[key];
  }
  writeJson(memoryFile(), mem);
}

/** 收集目录下所有 *.jar 的指纹 */
export function stampsOfJars(dirs: string[]): FileStamp[] {
  const out: FileStamp[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (!n.endsWith('.jar')) continue;
      const full = path.join(dir, n);
      if (seen.has(full)) continue;
      seen.add(full);
      try {
        const st = fs.statSync(full);
        out.push({ name: n, size: st.size, mtimeMs: Math.floor(st.mtimeMs) });
      } catch {
        /* 忽略 */
      }
    }
  }
  return out;
}