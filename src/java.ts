import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exists, listFilesRecursive, mcsdevHome, readJson, writeJson } from './util/fsx';
import { runCmd } from './util/run';

/**
 * JDK 扫描与注册表 —— 实现思路参照 PCL2（PCLCS/Java.cs）：
 * 1. 候选目录枚举（.jdks / .sdkman / Program Files 各家 / JAVA_HOME / 各家启动器 runtime…）
 * 2. 逐个跑 `java -XshowSettings:properties -version`（15s 超时）解析版本/位数/编码
 * 3. 拒绝 32 位、损坏项；排序优先候选目录内发现，其次主版本靠近 21（PCL 同款）
 */

export interface JavaInfo {
  /** java 可执行文件完整路径 */
  bin: string;
  /** java.home */
  home: string;
  /** 原始版本串，如 17.0.9 */
  version: string;
  /** 主版本，如 8 / 11 / 17 / 21 */
  major: number;
  vendor: string;
  /** 位数：32 / 64 */
  arch: number;
  fileEncoding?: string;
  nativeEncoding?: string;
  /** 是否来自候选目录（PCL2 排序优先项） */
  fromCandidate: boolean;
}

const isWin = process.platform === 'win32';
const BIN_NAME = isWin ? 'java.exe' : 'java';

/* ---------- 候选目录（PCL2 CandidateFolders 移植 + POSIX 常规目录） ---------- */

function candidateFolders(): string[] {
  const home = os.homedir();
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const la = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const pf64 = process.env['ProgramW6432'] || pf;

  const dirs = new Set<string>();
  const add = (p?: string | null): void => {
    if (p && p.length > 1) dirs.add(p);
  };

  if (isWin) {
    // 各家启动器自带的 runtime（含 PCL2 自己的下载路径）
    add(path.join(appdata, '.minecraft', 'runtime'));
    add(path.join(appdata, '.hmcl', 'java'));
    add(path.join(appdata, 'ATLauncher', 'runtimes', 'minecraft'));
    add(path.join(appdata, 'ModrinthApp', 'meta', 'java_versions'));
    add(path.join(appdata, 'PrismLauncher', 'java'));
    add(path.join(home, 'curseforge', 'minecraft', 'Install', 'runtime'));
    add(path.join(la, '.ftba', 'bin', 'runtime'));
    add(path.join(la, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime'));
    add(path.join(pfx86, 'Minecraft Launcher', 'runtime'));
    add(path.join(pfx86, 'Minecraft', 'runtime'));
    add(path.join(home, 'Documents', 'Curse', 'Minecraft', 'Install', 'runtime'));
    // 常见安装位置
    add(path.join(pf, 'Java'));
    add(path.join(pf, 'Eclipse Adoptium'));
    add(path.join(pf, 'Amazon Corretto'));
    add(path.join(pf, 'Zulu'));
    add(path.join(pfx86, 'Java'));
    add(path.join(pf64, 'Eclipse Adoptium'));
    add(path.join(pf64, 'Microsoft'));
    for (const d of [pf, pf64]) {
      try {
        for (const sub of fs.readdirSync(path.join(d, 'Microsoft'))) {
          if (sub.startsWith('jdk-')) add(path.join(d, 'Microsoft', sub));
        }
      } catch {
        /* 目录不存在 */
      }
    }
  } else if (process.platform === 'darwin') {
    add('/Library/Java/JavaVirtualMachines');
    add(path.join(home, 'Library', 'Java', 'JavaVirtualMachines'));
  } else {
    add('/usr/lib/jvm');
    add('/usr/java');
    add('/opt/java');
  }

  // 通用：IDE/工具链目录 + JAVA_HOME 等环境变量
  add(path.join(home, '.jdks'));
  add(path.join(home, '.sdkman', 'candidates', 'java'));
  add(path.join(home, '.gradle', 'jdks'));
  for (const name of ['JAVA_HOME', 'JDK_HOME']) {
    const val = process.env[name];
    if (val) {
      const jh = val.trim().replace(/^"|"$/g, '');
      add(jh);
      add(path.join(jh, 'jre'));
    }
  }
  // PATH 中含 java 的条目
  for (const entry of (process.env.PATH || '').split(path.delimiter)) {
    if (/java/i.test(entry)) add(entry);
  }
  return [...dirs].filter((d) => d !== path.parse(d).root);
}

function isCandidateFolder(dir: string): boolean {
  const d = dir.toLowerCase();
  return candidateFolders().some((f) => {
    const fd = f.toLowerCase();
    return d === fd || d.startsWith(fd.endsWith(path.sep) ? fd : fd + path.sep);
  });
}

function isSpecialPath(dir: string): boolean {
  const d = dir.toLowerCase();
  return d.includes('system32') || d.includes('javapath_target_') || d.includes('javatmp');
}

/* ---------- 探测（probe） ---------- */

export interface JavaProps {
  version?: string;
  home?: string;
  vendor?: string;
  arch?: number;
  fileEncoding?: string;
  nativeEncoding?: string;
}

/** 解析 `-XshowSettings:properties -version` 的输出（纯函数，可单测） */
export function parseJavaProps(output: string): JavaProps {
  const props: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s*([a-zA-Z0-9_.]+)\s*=\s*(.*?)\s*$/);
    if (m) props[m[1]] = m[2].trim();
  }
  let version = props['java.version'];
  if (!version) {
    const alt = output.match(/version "([^"]+)"/);
    if (alt) version = alt[1];
  }
  const archText = props['sun.arch.data.model'];
  const arch = archText ? parseInt(archText, 10) : undefined;
  return {
    version,
    home: props['java.home'],
    vendor: props['java.vendor']?.replace(/^"|"$/g, ''),
    arch,
    fileEncoding: props['file.encoding'],
    nativeEncoding: props['native.encoding'],
  };
}

/** 版本串归一化出主版本：1.8.0_202 → 8；17.0.9 → 17（纯函数，可单测） */
export function parseMajor(version: string): number | null {
  let v = version.replace(/_/g, '.').replace(/\+/g, '.').split('-')[0];
  if (v.startsWith('1.')) v = v.slice(2);
  const m = v.match(/^(\d+)/);
  if (!m) return null;
  const major = parseInt(m[1], 10);
  return major >= 5 && major <= 99 ? major : null;
}

/** 探测单个 java 可执行文件；无效返回 null */
export async function probeJava(bin: string): Promise<JavaInfo | null> {
  if (!exists(bin)) return null;
  const res = await runCmd(bin, ['-XshowSettings:properties', '-version'], { timeoutMs: 15000 });
  const output = res.output;
  if (res.timedOut || output === '') return null;
  if (output.includes('/lib/ext exists')) return null;
  if (/a fatal error/i.test(output) || /^error: /m.test(output)) return null;
  const p = parseJavaProps(output);
  if (!p.version) return null;
  const major = parseMajor(p.version);
  if (major === null) return null;
  // 拒绝 32 位
  const arch = p.arch ?? (/\b64[- ](?:bit|位)/i.test(output) || /64-bit/i.test(output) ? 64 : 32);
  if (arch !== 64) return null;
  return {
    bin,
    home: p.home || path.dirname(path.dirname(bin)),
    version: p.version,
    major,
    vendor: p.vendor || 'unknown',
    arch,
    fileEncoding: p.fileEncoding,
    nativeEncoding: p.nativeEncoding,
    fromCandidate: isCandidateFolder(path.dirname(bin)),
  };
}

/** PCL2 同款排序：候选目录内优先级高，其次主版本离 21 近 */
function javaSort(a: JavaInfo, b: JavaInfo): number {
  if (a.fromCandidate !== b.fromCandidate) return a.fromCandidate ? -1 : 1;
  const da = Math.abs(a.major - 21);
  const db = Math.abs(b.major - 21);
  if (da !== db) return da - db;
  return b.major - a.major;
}

/* ---------- 扫描与持久化 ---------- */

function savedFile(): string {
  return path.join(mcsdevHome(), 'java.json');
}

export function listSavedJava(): JavaInfo[] {
  return readJson<{ javas: JavaInfo[] }>(savedFile(), { javas: [] }).javas;
}

export function saveJavaList(javas: JavaInfo[]): void {
  writeJson(savedFile(), { javas });
}

export interface ScanOptions {
  onProgress?: (done: number, total: number) => void;
}

/** 全量扫描：候选目录递归找 java 二进制 → 并发探测 → 排序 → 落盘 java.json */
export async function scanJava(opts: ScanOptions = {}): Promise<JavaInfo[]> {
  const bins = new Map<string, string>(); // realpath(dirname).toLowerCase() -> bin 路径
  const putBin = (bin: string): void => {
    const dir = path.dirname(bin);
    if (isSpecialPath(dir)) return;
    try {
      bins.set(fs.realpathSync(dir).toLowerCase(), bin);
    } catch {
      bins.set(dir.toLowerCase(), bin);
    }
  };

  for (const folder of candidateFolders()) {
    for (const f of listFilesRecursive(folder, 5)) {
      if (path.basename(f).toLowerCase() !== BIN_NAME.toLowerCase()) continue;
      putBin(f);
    }
  }
  for (const entry of (process.env.PATH || '').split(path.delimiter)) {
    if (!entry) continue;
    const cand = path.join(entry, BIN_NAME);
    if (exists(cand)) putBin(cand);
  }

  const list = [...bins.values()];
  const results: JavaInfo[] = [];
  let idx = 0;
  let done = 0;
  const concurrency = Math.min(4, Math.max(1, list.length));
  const worker = async (): Promise<void> => {
    while (idx < list.length) {
      const bin = list[idx++];
      const j = await probeJava(bin);
      if (j) results.push(j);
      done++;
      opts.onProgress?.(done, list.length);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  results.sort(javaSort);
  saveJavaList(results);
  return results;
}

/** 从已保存列表中挑一个"最合适"的默认 JDK：候选目录内、离 21 最近（PCL 排序第一位） */
export function pickDefaultJava(saved: JavaInfo[]): JavaInfo | undefined {
  if (saved.length === 0) return undefined;
  const sorted = [...saved].sort(javaSort);
  return sorted[0];
}

/** 校验某个 java 可执行文件是否可用（并返回详情） */
export function validateJava(bin: string): Promise<JavaInfo | null> {
  return probeJava(bin);
}