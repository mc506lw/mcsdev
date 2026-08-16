import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { atomicCopy, ensureDir, exists, mcsdevHome } from './util/fsx';
import { info, warn } from './util/log';

/**
 * PaperMC Downloads API v3 客户端（"Fill"：https://fill.papermc.io）。
 * v2 (api.papermc.io/v2) 已 410 下线，v3 路径均以 /v3/ 开头；
 * 下载 URL 由 API 直接给出（fill-data.papermc.io CDN）。
 * 本机连不上时可用 MCSDEV_PAPER_BASE 指向镜像或本地桩服务器（测试用）。
 * 缓存（~/.mcsdev/cache/）：
 *   versions-{core}/list.json   版本列表，TTL 6h
 *   builds/{core}-{version}.json 最新构建信息，TTL 4h
 *   jars/{core}-{version}-{build}.jar  server.jar 文件缓存，实例从这里复制
 */
const BASE = (process.env.MCSDEV_PAPER_BASE || 'https://fill.papermc.io').replace(/\/+$/, '');

export const CORES = ['paper', 'folia'] as const;
export type Core = (typeof CORES)[number];

export interface BuildInfo {
  build: number;
  jarName: string;
  sha256?: string;
  downloadUrl: string;
  channel?: string;
  size?: number;
}

interface V3BuildResponse {
  id?: number;
  channel?: string;
  time?: string;
  downloads?: Record<string, { name?: string; size?: number; url?: string; checksums?: { sha256?: string } }>;
}

type V3VersionsBody =
  | Array<{ version?: { id?: string }; builds?: number[] }>
  | { versions?: Array<{ version?: { id?: string }; builds?: number[] }> };

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch {
    throw new Error(
      `无法连接 PaperMC API（${BASE}）—— 请检查网络/代理；可用环境变量 MCSDEV_PAPER_BASE 指向镜像或代理`
    );
  }
  if (!res.ok) {
    if (res.status === 410) {
      throw new Error(`PaperMC API 版本已下线（HTTP 410，${url}）—— 请升级 mcsdev 或检查 MCSDEV_PAPER_BASE`);
    }
    throw new Error(`PaperMC API 请求失败（HTTP ${res.status}）：${url}`);
  }
  return (await res.json()) as T;
}

/* ---------- 缓存（~/.mcsdev/cache/） ---------- */

const VERSIONS_TTL = 6 * 60 * 60 * 1000; // 6 小时
const BUILD_TTL = 4 * 60 * 60 * 1000; // 4 小时

function cachePath(kind: string, key: string): string {
  return path.join(mcsdevHome(), 'cache', kind, `${key}.json`);
}

function readCache<T>(kind: string, key: string, ttlMs: number | null): T | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath(kind, key), 'utf8')) as { fetchedAt: number; data: T };
    if (ttlMs === null || Date.now() - raw.fetchedAt <= ttlMs) return raw.data;
  } catch {
    /* 无缓存/损坏 */
  }
  return undefined;
}

function writeCache<T>(kind: string, key: string, data: T): void {
  try {
    ensureDir(path.dirname(cachePath(kind, key)));
    fs.writeFileSync(cachePath(kind, key), JSON.stringify({ fetchedAt: Date.now(), data }), 'utf8');
  } catch {
    /* 缓存写失败不影响主流程 */
  }
}

function sha256OfFile(file: string): string | null {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/* ---------- 元数据 ---------- */

/** 获取某核心的全部可用版本（如 paper 的 1.8.8 ... 1.21.x），带 6h 缓存 */
export async function fetchVersions(core: Core): Promise<string[]> {
  const kind = `versions-${core}`;
  const cached = readCache<string[]>(kind, 'list', VERSIONS_TTL);
  if (cached) return cached;
  try {
    const body = await fetchJson<V3VersionsBody>(`${BASE}/v3/projects/${core}/versions`);
    const list = (Array.isArray(body) ? body : body.versions ?? [])
      .map((v) => v.version?.id)
      .filter((x): x is string => !!x);
    writeCache(kind, 'list', list);
    return list;
  } catch (e) {
    const stale = readCache<string[]>(kind, 'list', null);
    if (stale) {
      warn('PaperMC API 不可用，使用缓存的版本列表');
      return stale;
    }
    throw e;
  }
}

/** 获取某版本的最新构建信息（build 号 / jar 名 / sha256 / 下载 URL），带 4h 缓存 */
export async function fetchLatestBuild(core: Core, version: string): Promise<BuildInfo | null> {
  const key = `${core}-${version}`;
  const cached = readCache<BuildInfo>('builds', key, BUILD_TTL);
  if (cached) return cached;
  try {
    const body = await fetchJson<V3BuildResponse>(
      `${BASE}/v3/projects/${core}/versions/${encodeURIComponent(version)}/builds/latest`
    );
    const info = normalizeBuild(body);
    if (!info) return null;
    writeCache('builds', key, info);
    return info;
  } catch (e) {
    const stale = readCache<BuildInfo>('builds', key, null);
    if (stale) {
      warn(`API 不可用，使用缓存的构建信息（${core} ${version}，可能不是最新）`);
      return stale;
    }
    throw e;
  }
}

/** v3 的 downloads 是映射 {名称: {url, checksums}}"；优先 server:default，其次 server，最后第一个 */
function normalizeBuild(body: V3BuildResponse): BuildInfo | null {
  const id = body.id;
  const downloads = body.downloads ?? {};
  const entries = Object.entries(downloads);
  if (typeof id !== 'number' || entries.length === 0) return null;
  const pick =
    entries.find(([k]) => k.includes('server') && k.includes('default')) ??
    entries.find(([k]) => k.includes('server')) ??
    entries[0];
  const [name, d] = pick;
  if (!d?.url) return null;
  return {
    build: id,
    jarName: d.name ?? name,
    sha256: d.checksums?.sha256,
    downloadUrl: d.url,
    channel: body.channel,
    size: d.size,
  };
}

/* ---------- 下载 ---------- */

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

/**
 * 下载（或复用缓存）server.jar 到实例目录。
 * 缓存策略：按 core-version-build 落 ~/.mcsdev/cache/jars/，
 * 同版本的多个实例共享一份，sha256 校验通过则直接复制。
 */
export async function downloadServerJar(
  core: Core,
  version: string,
  build: BuildInfo,
  dest: string,
  opts: DownloadOptions = {}
): Promise<void> {
  ensureDir(path.dirname(dest));
  const cacheDir = path.join(mcsdevHome(), 'cache', 'jars');
  ensureDir(cacheDir);
  const cached = path.join(cacheDir, `${core}-${version}-${build.build}.jar`);

  if (exists(cached)) {
    if (!build.sha256 || sha256OfFile(cached) === build.sha256.toLowerCase()) {
      info(`复用缓存 jar：${path.basename(cached)}`);
      atomicCopy(cached, dest);
      return;
    }
    warn('缓存 jar 校验失败，重新下载');
    fs.rmSync(cached, { force: true });
  }
  await downloadJar(build.downloadUrl, cached, { sha256: build.sha256, onProgress: opts.onProgress });
  atomicCopy(cached, dest);
}

/** 给版本列表排序用（1.20.1 < 1.20.10 < 1.21） */
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