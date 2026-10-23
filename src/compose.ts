/**
 * mcsdev.yml 声明式配置（DESIGN.md §8）：
 *
 * 一份 yml 描述"这个插件项目要用哪个测试服、产物从哪来、怎么部署"。
 * 放项目根目录、进 git —— 配置从 ~/.mcsdev 的隐式状态变成项目里的显式资产。
 *
 * 设计来源：真实 monorepo（Pylon，4 个插件子项目共用一台开发服）的部署需求，
 * 见 compose.ts 各字段注释里的"为什么"。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as YAML from 'yaml';
import { exists } from './util/fsx';
import { getConfig } from './config';
import { getInstance } from './registry';

export const YML_NAMES = ['mcsdev.yml', 'mcsdev.yaml'];

/** 部署后要跳过的干扰产物（来自真实项目的 build/libs 现状） */
export const DEFAULT_EXCLUDE = [
  '*-sources.jar',
  '*-javadoc.jar',
  '*-dev.jar',
  '*-mojang-mapped.jar',
  '*-plain.jar',
];

// ============ 原始（yml 里写的）结构 ============

export interface PluginEntry {
  /** 可选别名，供 `mcsdev dev <id>` 只部署某一个工程 */
  id?: string;
  /** 源 glob，相对 yml 所在目录；支持 ../、绝对路径、~ */
  path: string;
  /** 排除 glob（匹配 basename） */
  exclude?: string[];
  /** 部署后改名；不给则保持源文件名 */
  rename?: string;
  /**
   * 旧版本识别前缀。部署前删除目标目录里 "<prefix>*" 的 jar，避免同插件多版本共存。
   * 不给时从 path 推导（`Lapis-Pipez-*.jar` → `Lapis-Pipez-`）。
   */
  prefix?: string;
  /** 部署前清理旧版本（默认 true —— 多版本共存会让服务器双加载同一个插件） */
  clean?: boolean;
  /** 无匹配时报错（默认 true）；false 则只警告，适合还没构建过的可选依赖 */
  required?: boolean;
  /**
   * 多个匹配时只取最新一个（默认 true）。
   * 真实项目的 build/libs 会累积几十个历史 jar（Lapis-Pipez 曾有 41 个），
   * 全部部署进去就是灾难。要一次装多个 jar 请写多个条目。
   */
  newest?: boolean;
}

export type RestartType = 'mcsdev' | 'http' | 'command' | 'none';

export interface RestartSpec {
  type: RestartType;
  /** type=http：请求这个 URL，2xx 视为重启成功 */
  url?: string;
  /** type=command：执行这条 shell 命令 */
  run?: string;
  /** 等待超时（毫秒），默认 180000 */
  timeoutMs?: number;
}

export interface ServerSpec {
  core: string;
  mc: string;
  memory?: string;
  java?: string;
  port?: number;
  onlineMode?: boolean;
}

export interface WorldSpec {
  type: 'normal' | 'flat' | 'void';
  nether?: boolean;
  end?: boolean;
}

export interface DevSpec {
  /** 是否 watch（默认 true）；false 时 dev 等同于 deploy */
  watch?: boolean;
  /** 防抖窗口（毫秒），默认 800 */
  debounce?: number;
  /** 额外 watch 的目录（相对 yml） */
  extraWatch?: string[];
  /**
   * 源码变化时先执行的构建命令（如 `gradlew build`）。
   * 不配则 dev 只 watch 构建产物 —— 需要你自己/IDE 负责编译。
   */
  build?: string;
  /** 源码目录（相对 yml），配了 build 才生效，默认 ['src/main'] */
  sources?: string[];
}

/** RCON：给 `mcsdev exec` 用；不配则尝试从 link 目录的 server.properties 读 */
export interface RconSpec {
  host?: string;
  port?: number;
  password: string;
}

export interface McsdevSpec {
  version: number;
  name: string;
  /** 绑定已有实例：mcsdev 实例名，或服务器目录路径 */
  link?: string;
  server?: ServerSpec;
  world?: WorldSpec;
  plugins: PluginEntry[];
  /** 自建模式下的 server.properties 键级 patch；link 模式默认忽略 */
  config?: Record<string, string | number | boolean>;
  /** link 模式下是否也 patch 实例配置（默认 false —— 不碰你手调好的服务器） */
  configApply?: boolean;
  restart?: RestartSpec;
  dev?: DevSpec;
  /** `mcsdev exec` 用的 RCON 连接；不给则从 link 目录的 server.properties 推断 */
  rcon?: RconSpec;
  /**
   * 服务器所在主机，用于重启后的就绪探测。
   * 默认：link 是 UNC 路径（`\\server\share\…`）时取其中的 server，否则 127.0.0.1。
   */
  host?: string;
  onStart?: string[];
  /** yml 文件绝对路径 */
  file: string;
  /** yml 所在目录（所有相对路径的基准） */
  dir: string;
}

// ============ 解析后的结构 ============

export interface ResolvedPlugin {
  id: string;
  entry: PluginEntry;
  /** glob 命中的全部文件 */
  matched: string[];
  /** 被 exclude 排除的 */
  excluded: string[];
  /** 最终部署的（newest 时只有 1 个） */
  chosen: string[];
  /** 部署前会删掉的旧版本 */
  willClean: string[];
  warnings: string[];
  errors: string[];
}

export interface ResolvedLink {
  /** 服务器目录（绝对路径） */
  dir: string;
  /** 显示名 */
  name: string;
  /** 是否由 mcsdev 注册表管理（决定默认重启策略） */
  managed: boolean;
  /** 注册表里的实例名（managed 时有值） */
  instanceName?: string;
}

export interface ResolvedConfig {
  spec: McsdevSpec;
  link?: ResolvedLink;
  /** 目标服务器目录（link 指向的目录，或自建容器目录） */
  serverDir: string;
  plugins: ResolvedPlugin[];
  /** 生效的重启策略 */
  restart: RestartSpec;
  warnings: string[];
  /**
   * 全局错误（yml 级：语法、link 不存在、未实现字段…）。
   * 条目级错误留在 plugins[].errors —— 这样 `deploy <id>` 只被点名的条目挡住，
   * 不会被"另一个工程还没构建"连坐。
   */
  errors: string[];
}

/** 全部错误（全局 + 所有条目） */
export function allErrors(cfg: ResolvedConfig): string[] {
  return [...cfg.errors, ...cfg.plugins.flatMap((p) => p.errors)];
}

/** 从 jar 文件名推导插件前缀：Lapis-Pipez-0.1.59.jar → Lapis-Pipez- */
export function jarPrefix(jarName: string): string {
  const base = jarName.replace(/\.jar$/i, '');
  const m = base.match(/^(.+?)-\d/);
  return m ? `${m[1]}-` : '';
}

// ============ 查找与读取 ============

/** 从 startDir 向上找 mcsdev.yml（最多 8 层） */
export function findYml(startDir: string): string | null {
  let cur = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    for (const n of YML_NAMES) {
      const p = path.join(cur, n);
      if (exists(p)) return p;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function bool(v: unknown, dflt: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (['true', 'yes', 'on', '1'].includes(s)) return true;
    if (['false', 'no', 'off', '0'].includes(s)) return false;
  }
  return dflt;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter((s): s is string => !!s);
}

/** 解析 yml 文件；格式级错误直接抛（无法继续），语义级问题收集进 errors */
export function parseYmlFile(file: string): McsdevSpec {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`读不到 ${file}：${(e as Error).message}`);
  }

  let doc: unknown;
  try {
    doc = YAML.parse(raw);
  } catch (e) {
    throw new Error(`${path.basename(file)} 不是合法 YAML：${(e as Error).message}`);
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`${path.basename(file)} 顶层必须是一个映射（key: value）`);
  }
  const o = doc as Record<string, unknown>;

  const version = num(o.version);
  if (version !== 1) {
    throw new Error(`${path.basename(file)} 的 version 必须是 1（当前：${String(o.version)}）`);
  }

  const name = str(o.name);
  if (!name) throw new Error(`${path.basename(file)} 缺少 name（用作实例/容器名）`);

  const link = str(o.link);
  const serverRaw = o.server as Record<string, unknown> | undefined;
  const worldRaw = o.world as Record<string, unknown> | undefined;

  // 二选一：link 或 server
  if (link && serverRaw) {
    throw new Error('link 与 server 只能二选一：link 绑定已有实例，server 让 mcsdev 自建');
  }
  if (!link && !serverRaw) {
    throw new Error('必须写 link（绑定已有实例）或 server（自建容器）之一');
  }

  let server: ServerSpec | undefined;
  if (serverRaw) {
    const mc = str(serverRaw.mc);
    if (!mc) throw new Error('server.mc 必填（如 1.20.1）');
    server = {
      core: (str(serverRaw.core) ?? 'paper').toLowerCase(),
      mc,
      memory: str(serverRaw.memory),
      java: str(serverRaw.java),
      port: num(serverRaw.port),
      onlineMode: serverRaw['online-mode'] === undefined ? undefined : bool(serverRaw['online-mode'], false),
    };
  }

  let world: WorldSpec | undefined;
  if (worldRaw) {
    const t = (str(worldRaw.type) ?? 'normal').toLowerCase();
    if (!['normal', 'flat', 'void'].includes(t)) {
      throw new Error(`world.type 只能是 normal / flat / void（当前：${t}）`);
    }
    world = {
      type: t as WorldSpec['type'],
      nether: worldRaw.nether === undefined ? undefined : bool(worldRaw.nether, true),
      end: worldRaw.end === undefined ? undefined : bool(worldRaw.end, true),
    };
  }

  // plugins：字符串或对象数组
  const pluginsRaw = o.plugins;
  const plugins: PluginEntry[] = [];
  if (!Array.isArray(pluginsRaw) || pluginsRaw.length === 0) {
    throw new Error('plugins 必须是非空数组（至少一条产物来源）');
  }
  pluginsRaw.forEach((item, i) => {
    const at = `plugins[${i}]`;
    if (typeof item === 'string') {
      if (!item.trim()) throw new Error(`${at} 是空字符串`);
      plugins.push({ path: item.trim() });
      return;
    }
    if (!item || typeof item !== 'object') {
      throw new Error(`${at} 必须是字符串路径或对象`);
    }
    const p = item as Record<string, unknown>;
    const pth = str(p.path);
    if (!pth) throw new Error(`${at} 缺少 path`);
    const rename = str(p.rename);
    if (rename && !rename.toLowerCase().endsWith('.jar')) {
      throw new Error(`${at} 的 rename 必须以 .jar 结尾（部署后服务器只认 .jar）：${rename}`);
    }
    const exclude = strList(p.exclude);
    // to: 已移除 —— Bukkit/Paper 只扫描 plugins/ 根目录的 jar，放进子目录根本不会被加载。
    // 静默接受一个无效字段比报错更糟。
    if (p.to !== undefined) {
      throw new Error(
        `${at} 的 to: 已移除 —— Bukkit/Paper 只加载 plugins/ 根目录的 jar，子目录里的不会被读取`
      );
    }
    plugins.push({
      id: str(p.id),
      path: pth,
      exclude: exclude.length > 0 ? exclude : undefined,
      rename,
      prefix: str(p.prefix),
      clean: p.clean === undefined ? undefined : bool(p.clean, true),
      required: p.required === undefined ? undefined : bool(p.required, true),
      newest: p.newest === undefined ? undefined : bool(p.newest, true),
    });
  });

  // config：键值映射
  let config: Record<string, string | number | boolean> | undefined;
  if (o.config !== undefined) {
    if (!o.config || typeof o.config !== 'object' || Array.isArray(o.config)) {
      throw new Error('config 必须是键值映射（如 view-distance: 8）');
    }
    config = {};
    for (const [k, v] of Object.entries(o.config as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') config[k] = v;
      else throw new Error(`config.${k} 只能是字符串/数字/布尔`);
    }
  }

  // restart
  let restart: RestartSpec | undefined;
  if (o.restart !== undefined) {
    if (!o.restart || typeof o.restart !== 'object' || Array.isArray(o.restart)) {
      throw new Error('restart 必须是映射（type: http | command | mcsdev | none）');
    }
    const r = o.restart as Record<string, unknown>;
    const t = (str(r.type) ?? 'none').toLowerCase();
    if (!['mcsdev', 'http', 'command', 'none'].includes(t)) {
      throw new Error(`restart.type 只能是 mcsdev / http / command / none（当前：${t}）`);
    }
    if (t === 'http' && !str(r.url)) throw new Error('restart.type=http 时必须给 url');
    if (t === 'command' && !str(r.run)) throw new Error('restart.type=command 时必须给 run');
    restart = {
      type: t as RestartType,
      url: str(r.url),
      run: str(r.run),
      timeoutMs: num(r.timeoutMs),
    };
  }

  // dev
  let dev: DevSpec | undefined;
  if (o.dev !== undefined) {
    if (!o.dev || typeof o.dev !== 'object' || Array.isArray(o.dev)) {
      throw new Error('dev 必须是映射（watch / debounce）');
    }
    const d = o.dev as Record<string, unknown>;
    dev = {
      watch: d.watch === undefined ? undefined : bool(d.watch, true),
      debounce: num(d.debounce),
      extraWatch: strList(d.extraWatch),
      build: str(d.build),
      sources: strList(d.sources).length > 0 ? strList(d.sources) : undefined,
    };
  }

  // rcon
  let rcon: RconSpec | undefined;
  if (o.rcon !== undefined) {
    if (!o.rcon || typeof o.rcon !== 'object' || Array.isArray(o.rcon)) {
      throw new Error('rcon 必须是映射（host / port / password）');
    }
    const r = o.rcon as Record<string, unknown>;
    const password = str(r.password);
    if (!password) throw new Error('rcon.password 必填（对应 server.properties 的 rcon.password）');
    rcon = {
      host: str(r.host) ?? '127.0.0.1',
      port: num(r.port) ?? 25575,
      password,
    };
  }

  const abs = path.resolve(file);
  return {
    version: 1,
    name,
    link,
    server,
    world,
    plugins,
    config,
    configApply: o.configApply === undefined ? undefined : bool(o.configApply, false),
    restart,
    dev,
    rcon,
    host: str(o.host),
    onStart: strList(o.onStart),
    file: abs,
    dir: path.dirname(abs),
  };
}

// ============ glob 匹配 ============

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * 展开 `${VAR}` / `$VAR`。未定义的环境变量保留原样（而不是变成空串）——
 * 变成空串会让路径悄悄指向别的地方，保留原文更容易看出问题。
 */
function expandEnv(s: string): string {
  return s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, a?: string, b?: string) => {
    const name = a ?? b;
    if (!name) return m;
    const v = process.env[name];
    return v === undefined ? m : v;
  });
}

/** 路径类字段的统一展开：先环境变量，再 ~ */
function expandPath(p: string): string {
  return expandHome(expandEnv(p));
}

/** 单段文件名 glob → 正则（* 不跨目录分隔符） */
function nameGlobToRegExp(pattern: string): RegExp {
  let re = '';
  for (const ch of pattern) {
    if (ch === '*') re += '[^/\\\\]*';
    else if (ch === '?') re += '[^/\\\\]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

/**
 * 匹配 `dir/name-glob` 形式的路径。
 * 目录部分按字面解析（支持 . .. ~ 与绝对路径），文件名部分支持 * 和 ?。
 * 这是刻意的限制：真实需求里没有"跨目录通配"，但字面目录更可预测、报错更清楚。
 */
export function matchGlob(baseDir: string, pattern: string): string[] {
  const norm = expandPath(pattern).replace(/\\/g, '/');
  const slash = norm.lastIndexOf('/');
  const dirPart = slash >= 0 ? norm.slice(0, slash) : '.';
  const namePart = slash >= 0 ? norm.slice(slash + 1) : norm;

  if (!namePart) return [];

  const absDir = path.resolve(baseDir, dirPart || '.');
  if (!exists(absDir)) return [];

  const re = nameGlobToRegExp(namePart);
  let names: string[];
  try {
    names = fs.readdirSync(absDir);
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const n of names) {
    if (!re.test(n)) continue;
    const full = path.join(absDir, n);
    try {
      if (fs.statSync(full).isFile()) out.push(full);
    } catch {
      /* 权限/竞态，跳过 */
    }
  }
  return out.sort();
}

/** 从 glob 推导旧版本前缀：`Lapis-Pipez-*.jar` → `Lapis-Pipez-`；无通配符则取去掉 .jar 的名字 */
export function derivePrefix(pattern: string): string {
  const norm = pattern.replace(/\\/g, '/');
  const base = norm.slice(norm.lastIndexOf('/') + 1);
  const star = base.indexOf('*');
  if (star >= 0) return base.slice(0, star);
  return base.replace(/\.jar$/i, '');
}

function mtimeOf(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** 从 jar 文件名提取版本号元组：`Foo-1.2.5.jar` → [1,2,5]；提不出返回 null */
export function versionTuple(p: string): number[] | null {
  const base = path.basename(p).replace(/\.jar$/i, '');
  const m = base.match(/(\d+(?:\.\d+)+)/);
  if (!m) return null;
  const nums = m[1].split('.').map(Number);
  return nums.every((n) => Number.isFinite(n)) ? nums : null;
}

/**
 * `newest` 的排序依据：版本号降序；任一方解析不出版本号时回退 mtime 降序。
 * 版本号相同时仍回退 mtime（同版本的重复产物，取最近构建的那个）。
 */
export function compareNewest(a: string, b: string): number {
  const va = versionTuple(a);
  const vb = versionTuple(b);
  if (va && vb) {
    const n = Math.max(va.length, vb.length);
    for (let i = 0; i < n; i++) {
      const d = (vb[i] ?? 0) - (va[i] ?? 0); // 降序：大的在前
      if (d !== 0) return d;
    }
  }
  return mtimeOf(b) - mtimeOf(a);
}

// ============ 解析 link ============

/**
 * link 的值可以是：
 *   - mcsdev 注册表里的实例名（test1）
 *   - 服务器目录路径（E:\Minecraft\开发\Pylon开发）—— 外部实例，mcsdev 不管它的启停
 * 判定顺序：注册表命中 > 像路径 > 目录存在
 */
export function resolveLink(link: string, baseDir: string): ResolvedLink | { error: string } {
  const inst = getInstance(link);
  if (inst) {
    return { dir: inst.dir, name: inst.name, managed: true, instanceName: inst.name };
  }

  const looksLikePath = /[\\/]/.test(link) || path.isAbsolute(link);
  const abs = path.resolve(baseDir, expandPath(link));
  if (exists(abs)) {
    return { dir: abs, name: path.basename(abs), managed: false };
  }
  if (looksLikePath) {
    return { error: `link 指向的目录不存在：${abs}` };
  }
  return {
    error: `link 既不是已注册的 mcsdev 实例（${link}），也不是存在的目录。外部服务器请直接写目录路径`,
  };
}

// ============ 归一化 ============

function defaultRestart(link: ResolvedLink | undefined): RestartSpec {
  if (link && link.managed) return { type: 'mcsdev' };
  // 外部实例：mcsdev 不知道它怎么启停，默认只部署
  return { type: 'none' };
}

/** 计算某条 plugins 条目最终要部署什么、要清什么 */
export function resolvePlugin(entry: PluginEntry, baseDir: string, pluginsDir: string): ResolvedPlugin {
  const warnings: string[] = [];
  const errors: string[] = [];

  const id = entry.id ?? (derivePrefix(entry.path).replace(/-$/, '') || entry.path);
  const matched = matchGlob(baseDir, entry.path);

  // 排除
  const excludePats = [...DEFAULT_EXCLUDE, ...(entry.exclude ?? [])].map(nameGlobToRegExp);
  const excluded: string[] = [];
  const kept: string[] = [];
  for (const f of matched) {
    const base = path.basename(f);
    if (excludePats.some((re) => re.test(base))) excluded.push(f);
    else kept.push(f);
  }

  if (kept.length === 0) {
    const msg = `${id}: 没有匹配到 jar（${entry.path}）`;
    if (entry.required === false) warnings.push(`${msg} —— required: false，跳过`);
    else errors.push(`${msg} —— 先构建，或写 required: false`);
  }

  // newest：优先按版本号取最新，解析不出版本号才回退 mtime。
  // 为什么不能只用 mtime：gradle build cache 和 git checkout 都会把旧产物还原成
  // 更旧的 mtime，此时按时间选会选错版本，而部署阶段又用 sha256 判等说"已是最新" ——
  // 两个判据在同一套流程里打架。
  let chosen = kept;
  const useNewest = entry.newest !== false;
  if (useNewest && kept.length > 1) {
    const sorted = [...kept].sort(compareNewest);
    chosen = [sorted[0]];
    const byVersion = versionTuple(sorted[0]) !== null && versionTuple(sorted[1]) !== null;
    warnings.push(
      `${id}: 命中 ${kept.length} 个，按${byVersion ? '版本号' : '修改时间'}取最新的 ${path.basename(sorted[0])}` +
        `（要全装请在 mcsdev.yml 该条目下写 newest: false，不是命令行参数）`
    );
  }

  // 目标名
  const targetName = (src: string): string => entry.rename ?? path.basename(src);

  // 旧版本清理 + .jaroff 检测
  const willClean: string[] = [];
  const clean = entry.clean !== false;
  const destDir = pluginsDir;
  const targetSet = new Set(chosen.map(targetName));

  // .jaroff：用户手动改名禁用的插件（Foo-1.0.jar → Foo-1.0.jaroff）。
  // 部署把 .jar 放回去 = 替他重新启用，必须告知
  for (const n of targetSet) {
    const offName = n.replace(/\.jar$/i, '.jaroff');
    if (exists(path.join(destDir, offName))) {
      warnings.push(
        `${id}: plugins/ 里有 ${offName}（你手动禁用过这个插件）。部署会把 ${n} 放回去，等于重新启用它 —— 要它保持禁用就把这条 entry 注释掉`
      );
    }
  }

  if (clean && exists(destDir)) {
    const prefix = entry.prefix ?? derivePrefix(entry.path);
    let names: string[] = [];
    try {
      names = fs.readdirSync(destDir);
    } catch {
      names = [];
    }
    if (prefix) {
      const re = nameGlobToRegExp(`${prefix}*`);
      for (const n of names) {
        if (!n.toLowerCase().endsWith('.jar')) continue;
        if (!re.test(n)) continue;
        if (targetSet.has(n)) continue; // 同名直接覆盖，不算清理
        willClean.push(path.join(destDir, n));
      }
    } else {
      warnings.push(
        `${id}: path 的文件名部分是纯通配符（如 build/libs/*.jar），推导不出插件名前缀，因此不会清理旧版本。` +
          `想自动清旧版请写成 build/libs/<插件名>-*.jar`
      );
    }
  }

  return { id, entry, matched, excluded, chosen, willClean, warnings, errors };
}

/** 完整解析：yml → 可执行配置 */
export function resolveConfig(spec: McsdevSpec): ResolvedConfig {
  const warnings: string[] = [];
  const errors: string[] = [];

  let link: ResolvedLink | undefined;
  if (spec.link) {
    const r = resolveLink(spec.link, spec.dir);
    if ('error' in r) errors.push(r.error);
    else link = r;
  }

  // 目标服务器目录
  let serverDir = '';
  if (link) {
    serverDir = link.dir;
  } else {
    const root = getConfig().root;
    if (!root) errors.push('自建模式需要先 mcsdev setup 指定服务器根路径');
    else serverDir = path.join(root, spec.name);
  }

  const pluginsDir = path.join(serverDir, 'plugins');
  const plugins = spec.plugins.map((e) => resolvePlugin(e, spec.dir, pluginsDir));
  for (const p of plugins) warnings.push(...p.warnings);
  // 条目级错误保留在 plugins[].errors，不合并进来：
  // 这样 `deploy <id>` 只被点名的条目挡住，不会被"另一个工程还没构建"连坐

  // id 去重
  const seen = new Map<string, number>();
  for (const p of plugins) {
    const n = (seen.get(p.id) ?? 0) + 1;
    seen.set(p.id, n);
    if (n > 1) errors.push(`plugins 里有重复的 id「${p.id}」—— 用 id: 显式区分`);
  }

  // 未实现的字段：宁可报错，也不能让 `config` 显示"配置可用"
  if (spec.config && Object.keys(spec.config).length > 0) {
    errors.push(
      'config: 尚未实现 —— 当前版本不会把这些键写进 server.properties。请删掉这一段（等 v0.2）'
    );
  }
  if (spec.configApply === true) {
    errors.push('configApply: 尚未实现 —— 当前版本不会 patch 实例配置。请删掉这个字段（等 v0.2）');
  }
  if (spec.onStart && spec.onStart.length > 0) {
    errors.push('onStart: 尚未实现 —— 当前版本不会执行这些命令。请删掉这一段（等 v0.2）');
  }

  // 双载检测：两个条目产出同一插件前缀的 jar，会在 plugins/ 里共存被加载两次。
  // 用条目索引而不是 id 判断"是否同一条" —— 两条 entry 可能推导出相同 id
  const prefixOwner = new Map<string, number>();
  plugins.forEach((p, idx) => {
    for (const src of p.chosen) {
      const pre = jarPrefix(p.entry.rename ?? path.basename(src));
      if (!pre) continue;
      const key = pre.toLowerCase();
      const ownerIdx = prefixOwner.get(key);
      if (ownerIdx !== undefined && ownerIdx !== idx) {
        errors.push(
          `双载风险：${plugins[ownerIdx].id} 与 ${p.id} 都会产出 ${pre}*.jar，两个版本会在 plugins/ 里共存 —— ` +
            `服务器会把同一个插件加载两次（典型症状：监听器执行两遍）`
        );
      } else {
        prefixOwner.set(key, idx);
      }
    }
  });

  const restart = spec.restart ?? defaultRestart(link);
  if (!spec.restart && link && !link.managed) {
    warnings.push(
      `link 指向外部服务器（${link.dir}），默认只部署不重启。要自动重启请配 restart（http 或 command）`
    );
  }
  // link 只验证了"目录存在"，顺手看一眼像不像 Minecraft 服务器
  if (link && !link.managed && !exists(path.join(link.dir, 'server.properties'))) {
    warnings.push(
      `link 目录里没有 server.properties —— 这可能不是 Minecraft 服务器目录（${link.dir}）`
    );
  }

  return { spec, link, serverDir, plugins, restart, warnings, errors };
}

/**
 * 探测服务器在哪个主机（就绪探测 / ps 的运行状态都靠它）：
 * 显式 host > UNC 路径里的 server 名 > 127.0.0.1
 */
export function probeHostOf(cfg: ResolvedConfig): string {
  if (cfg.spec.host) return cfg.spec.host;
  // UNC 路径：\\server\share\...  →  server
  const unc = cfg.serverDir.match(/^\\+([^\\/]+)/);
  if (unc) return unc[1];
  return '127.0.0.1';
}

/** 读并解析（供命令层调用） */
export function loadConfig(startDir: string = process.cwd()): ResolvedConfig {
  const file = findYml(startDir);
  if (!file) {
    throw new Error(
      `没找到 mcsdev.yml（从 ${startDir} 向上找了 8 层）。先运行 mcsdev init 生成一份`
    );
  }
  return resolveConfig(parseYmlFile(file));
}
