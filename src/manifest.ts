/**
 * 部署清单（manifest）—— 记录"哪些 jar 是 mcsdev 放进去的"。
 *
 * 为什么需要它：声明式的承诺是"文件是唯一真相，跑一次就收敛"。但把一条 entry
 * 从 mcsdev.yml 里删掉时，plugins/ 里那个 jar 会永远留着继续被服务器加载 ——
 * 用户以为卸载了，实际还在跑旧版本。要安全地清理，就必须知道哪些文件是自己放的，
 * 不能靠文件名猜（会误删手工放入的第三方插件）。
 *
 * 位置：<serverDir>/plugins/.mcsdev-manifest.json
 * 内容：相对 plugins/ 的路径 → 归属 entry id
 */

import * as fs from 'fs';
import * as path from 'path';
import { readJson, writeJson, exists } from './util/fsx';

export interface ManifestData {
  version: 1;
  /** 相对 plugins/ 的路径（用 / 分隔）→ 归属 id 与部署时间 */
  files: Record<string, { id: string; at: string }>;
}

const EMPTY: ManifestData = { version: 1, files: {} };

export function manifestPath(pluginsDir: string): string {
  return path.join(pluginsDir, '.mcsdev-manifest.json');
}

export function readManifest(pluginsDir: string): ManifestData {
  const p = manifestPath(pluginsDir);
  if (!exists(p)) return { version: 1, files: {} };
  const raw = readJson<Partial<ManifestData>>(p, EMPTY);
  if (!raw || raw.version !== 1 || !raw.files || typeof raw.files !== 'object') {
    return { version: 1, files: {} };
  }
  return { version: 1, files: raw.files };
}

export function writeManifest(pluginsDir: string, data: ManifestData): void {
  try {
    fs.mkdirSync(pluginsDir, { recursive: true });
    writeJson(manifestPath(pluginsDir), data);
  } catch {
    /* 写清单失败不阻塞部署 */
  }
}

/** 记录一批文件归属某 id（相对 plugins/ 的路径） */
export function recordDeployed(pluginsDir: string, id: string, relPaths: string[]): void {
  const m = readManifest(pluginsDir);
  const at = new Date().toISOString();
  // 该 id 之前记录的文件里，这次没部署的应当被移除（避免清单越滚越大）
  for (const [p, meta] of Object.entries(m.files)) {
    if (meta.id === id && !relPaths.includes(p)) delete m.files[p];
  }
  for (const p of relPaths) {
    m.files[p] = { id, at };
  }
  writeManifest(pluginsDir, m);
}

export interface PruneCandidate {
  /** 相对 plugins/ 的路径 */
  rel: string;
  id: string;
  reason: string;
}

/**
 * 找出该删的文件：清单里有记录、但当前配置已经不再产出的。
 * 只认清单 —— 手工放进 plugins/ 的 jar 永远不在清单里，所以绝不会被删。
 */
export function findPruneCandidates(
  pluginsDir: string,
  keepRel: Set<string>,
  activeIds: Set<string>
): PruneCandidate[] {
  const m = readManifest(pluginsDir);
  const out: PruneCandidate[] = [];
  for (const [rel, meta] of Object.entries(m.files)) {
    if (keepRel.has(rel)) continue;
    const reason = activeIds.has(meta.id)
      ? `${meta.id} 的旧版本（当前配置不再产出）`
      : `entry「${meta.id}」已从配置里删除`;
    out.push({ rel, id: meta.id, reason });
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
