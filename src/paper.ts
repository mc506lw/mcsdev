import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Paper / Folia Downloads API v2 客户端。
 * 本机连不上 papermc.io 时可用 MCSDEV_PAPER_BASE 指向镜像或本地桩服务器（测试用）。
 */
const BASE = process.env.MCSDEV_PAPER_BASE || 'https://api.papermc.io/v2';

export const CORES = ['paper', 'folia'] as const;
export type Core = (typeof CORES)[number];

export interface BuildInfo {
  build: number;
  jarName: string;
  sha256?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch {
    throw new Error(
      `无法连接 PaperMC API（${BASE}）—— 请检查网络/代理；本机无法直连时可用环境变量 MCSDEV_PAPER_BASE 指向镜像或代理`
    );
  }
  if (!res.ok) {
    throw new Error(`PaperMC API 请求失败（HTTP ${res.status}）：${url}`);
  }
  return (await res.json()) as T;
}

/** 获取某核心的全部可用版本（如 paper 的 1.8.8 ... 1.21.x） */
export async function fetchVersions(core: Core): Promise<string[]> {
  const data = await fetchJson<{ versions?: string[] }>(`${BASE}/projects/${core}`);
  return data.versions ?? [];
}

/** 获取某版本的最新构建信息（build 号 / jar 文件名 / sha256） */
export async function fetchLatestBuild(core: Core, version: string): Promise<BuildInfo | null> {
  const data = await fetchJson<{
    build?: number;
    downloads?: { application?: { name?: string; sha256?: string } };
  }>(`${BASE}/projects/${core}/versions/${encodeURIComponent(version)}/builds/latest`);
  const app = data.downloads?.application;
  if (!data.build || !app?.name) return null;
  return { build: data.build, jarName: app.name, sha256: app.sha256 };
}

export function downloadUrl(core: Core, version: string, build: number, jarName: string): string {
  return `${BASE}/projects/${core}/versions/${encodeURIComponent(version)}/builds/${build}/downloads/${encodeURIComponent(jarName)}`;
}

export interface DownloadOptions {
  sha256?: string;
  onProgress?: (received: number, total: number) => void;
}

/** 流式下载并校验 sha256；失败清理 .part 文件 */
export async function downloadJar(url: string, dest: string, opts: DownloadOptions = {}): Promise<void> {
  const part = dest + '.part';
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(600000) });
  } catch {
    fs.rmSync(part, { force: true });
    throw new Error(`下载失败（无法连接）：${url}`);
  }
  if (!res.ok || !res.body) {
    fs.rmSync(part, { force: true });
    throw new Error(`下载失败（HTTP ${res.status}）：${url}`);
  }
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  let received = 0;
  let lastReportMb = -1;
  const f = fs.createWriteStream(part);
  const reader = res.body.getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    hash.update(value);
    f.write(value);
    const mb = Math.floor(received / (1024 * 1024));
    if (mb !== lastReportMb) {
      lastReportMb = mb;
      opts.onProgress?.(received, total);
    }
  }
  await new Promise<void>((r) => f.end(() => r()));
  const digest = hash.digest('hex');
  if (opts.sha256 && digest !== opts.sha256.toLowerCase()) {
    fs.rmSync(part, { force: true });
    throw new Error('下载文件 sha256 校验失败，文件可能损坏或被篡改');
  }
  fs.renameSync(part, dest);
}

/** 给 fetchVersions 排序用的版本比较（1.20.1 > 1.20.10 > 1.21） */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}