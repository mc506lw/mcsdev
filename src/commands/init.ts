/**
 * `mcsdev init` —— 在插件项目里生成 mcsdev.yml。
 *
 * 目标：零输入可用。真实 monorepo（Pylon）里 13 个 gradle 工程混着参考源码，
 * 所以探测规则是"一级子目录里有构建文件就算工程"，有 jar 的顺便推导出 jar 前缀，
 * 让生成的 path 直接就是 `<sub>/build/libs/<prefix>-*.jar` —— 用户一个字都不用改。
 */

import * as fs from 'fs';
import * as path from 'path';
import { YML_NAMES, resolveLink } from '../compose';
import { listInstances } from '../registry';
import { detectMcVersion } from '../probe';
import { exists } from '../util/fsx';
import { dim, error, hint, info, ok, step, warn } from '../util/log';

export interface InitOptions {
  link?: string;
  name?: string;
  force?: boolean;
  /** 只探测并打印，不写文件 */
  dryRun?: boolean;
}

interface DetectedProject {
  /** 子目录名（单项目模式为 '.'） */
  dir: string;
  /** 构建文件 */
  buildFile: string;
  /** 推导出的 jar 前缀（可能为空） */
  prefix: string;
  /** jar 名里是否带版本号（决定生成 `前缀-*.jar` 还是精确文件名） */
  versioned: boolean;
  /** 产物目录（相对项目根）：gradle → build/libs，maven → target */
  libsRel: string;
  /** 现有 jar 数量 */
  jarCount: number;
  /** 最新 jar 名 */
  latestJar?: string;
}

const BUILD_FILES = ['build.gradle.kts', 'build.gradle', 'pom.xml'];

function findBuildFile(dir: string): string | null {
  for (const f of BUILD_FILES) {
    if (exists(path.join(dir, f))) return f;
  }
  return null;
}

/**
 * 从 jar 文件名推导插件前缀。
 * `Lapis-Pipez-0.1.59.jar` → { prefix: 'Lapis-Pipez', versioned: true }
 * `MyPlugin.jar`（没有版本号）→ { prefix: 'MyPlugin', versioned: false }
 *
 * 区分这两者是必要的：无版本号时如果硬生成 `MyPlugin-*.jar` 就一个都匹配不到。
 */
function prefixFromJar(jarName: string): { prefix: string; versioned: boolean } {
  const base = jarName.replace(/\.jar$/i, '');
  const m = base.match(/^(.+?)-\d/);
  if (m) return { prefix: m[1], versioned: true };
  return { prefix: base, versioned: false };
}

function jarsIn(libsDir: string): Array<{ name: string; mtime: number }> {
  if (!exists(libsDir)) return [];
  let names: string[] = [];
  try {
    names = fs.readdirSync(libsDir);
  } catch {
    return [];
  }
  const out: Array<{ name: string; mtime: number }> = [];
  for (const n of names) {
    if (!n.toLowerCase().endsWith('.jar')) continue;
    if (/-sources\.jar$|-javadoc\.jar$/i.test(n)) continue;
    const full = path.join(libsDir, n);
    try {
      const st = fs.statSync(full);
      if (st.isFile()) out.push({ name: n, mtime: st.mtimeMs });
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function detectProject(dir: string, dirName: string): DetectedProject | null {
  const buildFile = findBuildFile(dir);
  if (!buildFile) return null;
  // Maven 的产物在 target/，不是 build/libs/
  const libsRel = buildFile === 'pom.xml' ? 'target' : 'build/libs';
  const jars = jarsIn(path.join(dir, ...libsRel.split('/')));
  const latest = jars[0];
  const pj = latest ? prefixFromJar(latest.name) : { prefix: '', versioned: true };
  return {
    dir: dirName,
    buildFile,
    prefix: pj.prefix,
    versioned: pj.versioned,
    libsRel,
    jarCount: jars.length,
    latestJar: latest?.name,
  };
}

/** 扫描：单项目 or monorepo */
function detect(rootDir: string): { mode: 'single' | 'monorepo'; projects: DetectedProject[] } {
  const self = detectProject(rootDir, '.');
  if (self) return { mode: 'single', projects: [self] };

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return { mode: 'monorepo', projects: [] };
  }

  const projects: DetectedProject[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = detectProject(path.join(rootDir, e.name), e.name);
    if (p) projects.push(p);
  }
  projects.sort((a, b) => a.dir.localeCompare(b.dir));
  return { mode: 'monorepo', projects };
}

/**
 * 识别"厂商前缀"：多个子目录共有的第一段（Pylon 里 Lapis- 出现在 4 个目录 → 去掉它）。
 * 这样 id 会生成 pipez / cable，而不是 lapispipez / lapiscable。
 */
function vendorSegments(projects: DetectedProject[]): Set<string> {
  const count = new Map<string, number>();
  for (const p of projects) {
    if (p.dir === '.') continue;
    const seg = p.dir.split('-')[0];
    // 长度约束很关键：Lapis(5) 是厂商名，IronFurnaces(12) 只是同名项目的副本前缀
    if (seg.length < 3 || seg.length > 8) continue;
    count.set(seg, (count.get(seg) ?? 0) + 1);
  }
  const vendors = new Set<string>();
  for (const [seg, n] of count) if (n >= 2) vendors.add(seg);
  return vendors;
}

/** id 生成：去掉厂商前缀后小写去符号（Lapis-Pipez → pipez，Sided-IO → sidedio） */
function idOf(p: DetectedProject, vendors: Set<string> = new Set()): string {
  let src = p.dir === '.' ? p.prefix || 'plugin' : p.dir;
  if (p.dir !== '.') {
    const seg = src.split('-')[0];
    if (vendors.has(seg) && src.length > seg.length + 1) {
      src = src.slice(seg.length + 1);
    }
  }
  const id = src.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return id || 'plugin';
}

function yamlStr(s: string): string {
  // 反斜杠路径用单引号（YAML 单引号里反斜杠不转义，比 "E:\\x" 可读）
  if (s.includes('\\')) return `'${s.replace(/'/g, "''")}'`;
  if (/[:#]/.test(s) || /^\s|\s$/.test(s)) return JSON.stringify(s);
  return s;
}

/** 探测到的"版本号"可能是依赖版本（Pylon 根 build.gradle 抓出过 1.1.0），做一次合理性校验 */
function plausibleMcVersion(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const m = v.match(/^(1)\.(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (!m) return undefined;
  const minor = Number(m[2]);
  if (minor < 8 || minor > 30) return undefined;
  return v;
}

function renderYml(opts: {
  name: string;
  link: string;
  /** link 是否指向 mcsdev 自己管理的实例（决定 restart 默认值） */
  linkManaged: boolean;
  projects: DetectedProject[];
  mode: 'single' | 'monorepo';
  mcVersion?: string;
}): string {
  const withJar = opts.projects.filter((p) => p.jarCount > 0);
  const withoutJar = opts.projects.filter((p) => p.jarCount === 0);
  const active = withJar.length > 0 ? withJar : opts.projects;
  const vendors = vendorSegments(opts.projects);

  const L: string[] = [];
  L.push('# mcsdev.yml —— 由 `mcsdev init` 生成');
  L.push('# 这份文件描述"当前插件项目要用哪个测试服、产物从哪来、怎么部署"，请一并提交到 git。');
  L.push('# 命令：mcsdev config 查看解析结果 / mcsdev dev 启动开发循环 / mcsdev deploy 只部署一次');
  L.push('version: 1');
  L.push(`name: ${yamlStr(opts.name)}`);
  L.push('');
  L.push('link: ' + yamlStr(opts.link));
  L.push('# 或者自建容器（把上面 link 那行换成下面几行）：');
  L.push('# server:');
  L.push('#   core: paper');
  L.push(`#   mc: ${opts.mcVersion ?? '1.20.1'}`);
  L.push('#   memory: 2G');
  L.push('');
  L.push('plugins:');

  if (active.length === 0) {
    L.push('  - build/libs/*.jar');
  } else {
    for (const p of active) {
      const base = p.dir === '.' ? '' : `${p.dir}/`;
      const glob = !p.prefix ? '*.jar' : p.versioned ? `${p.prefix}-*.jar` : `${p.prefix}.jar`;
      L.push(`  - id: ${idOf(p, vendors)}`);
      L.push(`    path: ${yamlStr(`${base}${p.libsRel}/${glob}`)}`);
      if (!p.prefix) {
        L.push('    # 还没有构建产物，这条路径是猜的 —— 首次构建后按实际文件名改这一行');
      } else if (!p.versioned) {
        L.push('    # 产物没有版本号，所以用精确文件名；将来加了版本号要改成 <前缀>-*.jar');
      } else if (p.jarCount > 1) {
        L.push(`    # ${p.libsRel} 里有 ${p.jarCount} 个历史 jar，默认只部署最新的那个`);
      }
    }
  }

  if (withoutJar.length > 0) {
    L.push('');
    L.push('# ---- 以下子项目还没有构建产物，默认没启用（像是参考源码/模板，需要就取消注释）----');
    for (const p of withoutJar) {
      const base = `${p.dir}/`;
      L.push(`#  - id: ${idOf(p, vendors)}`);
      L.push(`#    path: ${yamlStr(`${base}${p.libsRel}/*.jar`)}`);
    }
  }

  L.push('');
  L.push('restart:');
  if (opts.linkManaged) {
    L.push('  type: mcsdev');
    L.push('  # 这是 mcsdev 自己管理的实例。');
    L.push('  # 注意：只有 dev / run 在前台持有进程句柄时才能优雅停服（save-all → stop）；');
    L.push('  # 一次性的 deploy 只能跨进程强杀（Windows 上是 taskkill /T /F，世界可能未保存）。');
    L.push('  # 想改成只部署不重启：type: none');
  } else {
    L.push('  type: none');
    L.push('  # 外部服务器（link 指向目录）默认只部署不重启。要自动重启请二选一：');
    L.push('  # type: http');
    L.push('  # url: http://127.0.0.1:25566/restart     # 换成你的重启接口');
    L.push('  # type: command');
    L.push('  # run: <你的重启命令>');
  }
  L.push('');
  L.push('dev:');
  L.push('  watch: true');
  L.push('  debounce: 800');
  L.push('');
  return L.join('\n');
}

export async function initCmd(opts: InitOptions = {}): Promise<void> {
  const rootDir = process.cwd();

  // 已存在就不覆盖
  for (const n of YML_NAMES) {
    const p = path.join(rootDir, n);
    if (exists(p) && !opts.force) {
      error(`${n} 已存在：${p}`);
      hint('要重新生成请加 --force（会覆盖，注意先备份你的改动）');
      return;
    }
  }

  step(`扫描 ${rootDir}`);
  const { mode, projects } = detect(rootDir);

  if (mode === 'single') {
    info(`单项目模式（${projects[0].buildFile}）`);
  } else {
    info(`monorepo 模式：探测到 ${projects.length} 个含构建文件的子项目`);
  }
  const withJar = projects.filter((p) => p.jarCount > 0);
  if (mode === 'monorepo') {
    dim(`  其中 ${withJar.length} 个已有构建产物：${withJar.map((p) => p.dir).join(', ') || '无'}`);
  }

  // link 目标
  let link = opts.link;
  if (!link) {
    const insts = listInstances();
    if (insts.length === 1) {
      link = insts[0].name;
      warn(`未指定 --link，自动使用唯一的 mcsdev 实例：${link}`);
      hint('如果这不是你要的目标，重跑并加 --link <实例名或服务器目录路径>');
    } else if (insts.length > 1) {
      error('有多个 mcsdev 实例，请用 --link 指定');
      hint(`可选：${insts.map((i) => i.name).join(', ')}；也可以直接给服务器目录路径`);
      process.exitCode = 1;
      return;
    } else {
      error('没有可用的 mcsdev 实例，也没有指定 --link');
      hint('指向一个已有的服务器目录：mcsdev init --link "D:\\你的服务器目录"');
      hint('或先建一个 mcsdev 管理的实例：mcsdev setup → mcsdev new');
      process.exitCode = 1;
      return;
    }
  }

  // link 指向 mcsdev 实例还是外部目录 —— 决定 restart 的默认值
  const resolvedLink = resolveLink(link, rootDir);
  const linkManaged = !('error' in resolvedLink) && resolvedLink.managed;

  const name =
    opts.name ?? path.basename(rootDir).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const mcVersion =
    plausibleMcVersion(detectMcVersion(rootDir)) ??
    projects.map((p) => plausibleMcVersion(detectMcVersion(path.join(rootDir, p.dir)))).find(Boolean);

  const content = renderYml({ name, link, linkManaged, projects, mode, mcVersion });

  if (opts.dryRun) {
    info('dry-run：以下内容将被写入 mcsdev.yml');
    console.log('\n' + content);
    return;
  }

  const outFile = path.join(rootDir, 'mcsdev.yml');
  try {
    fs.writeFileSync(outFile, content, 'utf8');
  } catch (e) {
    error(`写入失败：${(e as Error).message}`);
    process.exitCode = 1;
    return;
  }

  ok(`已生成 ${outFile}`);
  if (mode === 'monorepo' && projects.length > 0) {
    hint(`写入了 ${projects.length} 个条目 —— 不需要的删掉，缺的补上`);
  }
  hint('下一步：mcsdev config 看解析结果 → mcsdev dev 开始开发循环');
}
