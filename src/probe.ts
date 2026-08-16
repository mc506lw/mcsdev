import * as fs from 'fs';
import * as path from 'path';
import { exists } from './util/fsx';

/**
 * 项目探测 —— best-effort（DESIGN.md §6）：
 * 只为 run 的"产物目录/版本"提供提示，探测失败永远有手动兜底。
 */
export interface ProjectInfo {
  dir: string;
  isGradle: boolean;
  /** 构建产物目录（build/libs 等），可能不存在 */
  libsDir: string | null;
  /** 从依赖推断的 MC 版本（尽力而为） */
  mcVersion?: string;
}

export function findProject(cwd: string): ProjectInfo | null {
  const isGradle = [
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle',
    'settings.gradle.kts',
  ].some((n) => exists(path.join(cwd, n)));

  // gradle 项目：build/libs；maven 项目：target；兜底看 libs/plugins
  const candidates = ['build/libs', 'target', 'libs', 'plugins'];
  if (isGradle) candidates.unshift('build/libs');
  const libsDir = candidates
    .map((d) => path.join(cwd, d))
    .find((d) => exists(d)) ?? null;

  return {
    dir: cwd,
    isGradle,
    libsDir,
    mcVersion: isGradle ? detectMcVersion(cwd) : undefined,
  };
}

/** 从依赖字符串尽力推断 MC 版本（1.20.4-R0.1-SNAPSHOT → 1.20.4） */
export function detectMcVersion(dir: string): string | undefined {
  const files = ['build.gradle', 'build.gradle.kts', 'gradle.properties', 'gradle/libs.versions.toml'];
  for (const rel of files) {
    const full = path.join(dir, rel);
    if (!exists(full)) continue;
    let txt: string;
    try {
      txt = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    // 优先找 paper 附近的版本
    const nearPaper = txt.match(/paper[^0-9]{0,30}(1\.\d{1,2}(?:\.\d{1,2})?)/i);
    if (nearPaper) return normalize(nearPaper[1]);
    const anyVer = txt.match(/1\.\d{1,2}(?:\.\d{1,2})?/);
    if (anyVer) return normalize(anyVer[0]);
  }
  return undefined;
}

function normalize(v: string): string {
  // 去掉 -R0.1-SNAPSHOT 之类后缀
  return v.replace(/-[A-Za-z0-9_.-]+$/, '');
}