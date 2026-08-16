import * as path from 'path';
import { mcsdevHome, readJson, writeJson } from './util/fsx';

/** 服务器偏好（全局默认 → 实例覆盖，见 DESIGN.md §4） */
export interface Prefs {
  onlineMode: boolean;
  worldType: 'normal' | 'flat' | 'void'; // 主世界类型：普通 / 超平坦 / 虚空
  allowNether: boolean;
  allowEnd: boolean;
  motd: string;
  memory: string; // 如 "2G"
  viewDistance: number;
  port: number;
}

export interface GlobalConfig {
  /** 服务器根路径（setup 时指定，实例都建在这里） */
  root?: string;
  /** 默认 JDK 的 java 可执行文件路径 */
  defaultJava?: string;
  prefs: Prefs;
}

const DEFAULT_PREFS: Prefs = {
  onlineMode: false,
  worldType: 'normal',
  allowNether: true,
  allowEnd: true,
  motd: 'mcsdev test server',
  memory: '2G',
  viewDistance: 8,
  port: 25565,
};

function configFile(): string {
  return path.join(mcsdevHome(), 'config.json');
}

export function defaultConfig(): GlobalConfig {
  return { prefs: { ...DEFAULT_PREFS } };
}

export function getConfig(): GlobalConfig {
  const saved = readJson<Partial<GlobalConfig>>(configFile(), {});
  const prefs = { ...DEFAULT_PREFS, ...(saved.prefs ?? {}) };
  return {
    root: saved.root,
    defaultJava: saved.defaultJava,
    prefs,
  };
}

export function saveConfig(cfg: GlobalConfig): void {
  writeJson(configFile(), cfg);
}

/** 实例生效配置 = 全局偏好 + 实例覆盖 */
export function effectivePrefs(cfg: GlobalConfig, overrides?: Partial<Prefs>): Prefs {
  return { ...cfg.prefs, ...overrides };
}