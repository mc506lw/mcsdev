import { getConfig } from '../config';
import { createInstance } from '../instance';
import { pickDefaultJava, listSavedJava, scanJava } from '../java';
import { CORES, compareVersions, fetchVersions, Core } from '../paper';
import { getInstance, InstanceMeta } from '../registry';
import { error, hint, ok, step, warn } from '../util/log';
import { ensureDir, exists, mcsdevHome } from '../util/fsx';
import { confirm, endProgress, progress, select, text, Choice } from '../ui/prompts';

export interface NewOptions {
  name?: string;
  core?: string;
  mcVersion?: string;
  yes?: boolean;
}

/** `mcsdev new`：实例向导（DESIGN.md §5.4）：名称 → 核心 → 版本 → 全局配置？ */
export async function newCmd(opts: NewOptions = {}): Promise<InstanceMeta | undefined> {
  const cfg = getConfig();
  if (!cfg.root) {
    error('尚未初始化：请先运行 mcsdev setup');
    return undefined;
  }
  ensureDir(mcsdevHome());

  // JDK：实例绑定 = 默认 JDK；没有则扫一次
  let javaBin = cfg.defaultJava;
  if (!javaBin || !exists(javaBin)) {
    step('未配置默认 JDK，先扫描…');
    const javas = await scanJava({
      onProgress: (done, total) => progress('扫描 JDK', done, total),
    });
    endProgress();
    if (javas.length === 0) {
      error('未发现可用的 64 位 JDK，请先安装 JDK 再创建实例');
      return undefined;
    }
    javaBin = pickDefaultJava(javas)!.bin;
  }

  // 名称
  const name =
    opts.name ??
    (await text('实例名称（ID）', {
      validate: (v) => (/^[a-zA-Z0-9._-]{1,40}$/.test(v) ? null : '仅允许字母/数字/._-（≤40 字符）'),
    }));
  if (getInstance(name)) {
    error(`实例 ${name} 已存在`);
    return undefined;
  }

  // 核心
  const core: Core = opts.core
    ? (CORES.includes(opts.core as Core) ? (opts.core as Core) : 'paper')
    : await select<Core>(
        '服务器核心',
        CORES.map((c) => ({
          value: c,
          label: c === 'paper' ? 'paper（默认，社区标准）' : 'folia（多线程分支）',
        })),
        { initial: 'paper' }
      );

  // 版本（API 拉取；拉不到且有 --version 也能继续）
  let versions: string[] = [];
  let apiError: string | null = null;
  try {
    versions = (await fetchVersions(core)).sort(compareVersions);
  } catch (e) {
    apiError = (e as Error).message;
  }
  const version = opts.mcVersion ?? (await pickVersion(versions, apiError));
  if (versions.length > 0 && !versions.includes(version)) {
    warn(`${core} 没有版本 ${version}（可用末尾几个：${versions.slice(-5).join(', ')}）`);
  }

  // 全局配置？
  const useGlobal = opts.yes ?? (await confirm('使用全局默认配置？', true));
  let overrides: InstanceMeta['overrides'] | undefined;
  if (!useGlobal) {
    step('逐个确认服务器配置（可回车用默认）：');
    overrides = {
      worldType: await select<'normal' | 'flat'>(
        '世界类型',
        [
          { value: 'normal', label: '普通' },
          { value: 'flat', label: '超平坦' },
        ],
        { initial: cfg.prefs.worldType }
      ),
      allowNether: await confirm('启用地狱？', cfg.prefs.allowNether),
      allowEnd: await confirm('启用末地？', cfg.prefs.allowEnd),
      onlineMode: !(await confirm('离线登录（online-mode=false，仅限本地测试）？', !cfg.prefs.onlineMode)),
      memory: await text('内存分配', {
        initial: cfg.prefs.memory,
        validate: (v) => (/^\d+[mMgG]$/.test(v) ? null : '如 2G / 1024M'),
      }),
    };
  }

  const meta = await createInstance({
    name,
    core,
    mcVersion: version,
    root: cfg.root,
    javaBin,
    overrides,
    onDownloadProgress: (received, total) => progress('下载 server.jar', received, total),
  });
  endProgress();
  ok(`实例 ${name} 创建完成（${core} ${version}，端口 ${meta.port}）`);
  hint(`运行：mcsdev run ${version}`);
  return meta;
}

/** 版本选择：≤15 个用选择列表（最新在前）；太多则输入关键字过滤 */
async function pickVersion(versions: string[], apiError: string | null): Promise<string> {
  if (versions.length === 0) {
    if (apiError) error(apiError);
    error('无法获取版本列表（需连接 PaperMC API；可用 MCSDEV_PAPER_BASE 指向镜像）');
    process.exitCode = 1;
    throw new Error('没有可用版本');
  }
  if (versions.length <= 15) {
    const recent = versions.slice(-15).reverse();
    const choices: Choice<string>[] = recent.map((v) => ({ value: v, label: v }));
    return select('MC 版本', choices, { initial: recent[0] });
  }
  const key = await text('MC 版本关键字（如 1.20 或 1.21，须能唯一匹配）', {
    validate: (v) => {
      const hits = versions.filter((x) => x.startsWith(v));
      return hits.length === 1 ? null : hits.length > 1 ? `匹配多个：${hits.slice(0, 3).join(', ')}…` : '没有匹配的版本';
    },
  });
  return versions.find((x) => x.startsWith(key))!;
}