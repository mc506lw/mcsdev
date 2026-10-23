import * as fs from 'fs';
import * as path from 'path';
import { findYml, parseYmlFile, resolveLink } from '../compose';
import { resetInstance, rebuildInstance } from '../instance';
import { getInstance, listInstances, InstanceMeta } from '../registry';
import { runningPid, startServer, stopServerExternal } from '../server';
import { error, ok, warn, hint, info } from '../util/log';
import { exists } from '../util/fsx';
import { confirm, select } from '../ui/prompts';

/** 生命周期命令：start / stop / restart / logs / rebuild / reset */

/**
 * 统一"实例解析"：参数可为实例名或 MC 版本；缺省时若有多个实例则交互选择。
 * （之前 start 1.20.1 报"实例不存在"、logs 无参静默取第一个 —— 都不友好）
 */
async function resolveInstance(arg?: string): Promise<InstanceMeta | undefined> {
  const all = listInstances();
  if (arg) {
    const exact = getInstance(arg);
    if (exact) return exact;
    const byVer = all.filter((i) => i.mcVersion === arg);
    if (byVer.length === 1) return byVer[0];
    if (byVer.length > 1) {
      error(`版本 ${arg} 对应多个实例：${byVer.map((i) => i.name).join('、')}——请改用实例名`);
      return undefined;
    }
    error(`未找到实例「${arg}」。提示：这里填实例名（如 test1）或 MC 版本（如 1.20.1）；先 mcsdev ls 查看`);
    return undefined;
  }
  if (all.length === 0) {
    error('还没有任何实例（mcsdev new 创建）');
    return undefined;
  }
  if (all.length === 1) return all[0];
  const chosen = await select(
    '选择实例',
    all.map((i) => ({ value: i.name, label: i.name, hint: `${i.core} ${i.mcVersion} · 端口 ${i.port}` }))
  );
  return getInstance(chosen) ?? undefined;
}

export async function startCmd(arg?: string): Promise<void> {
  const inst = await resolveInstance(arg);
  if (!inst) return;
  await startServer(inst, { detach: true });
  ok(`实例 ${inst.name} 已在后台启动（日志：mcsdev logs ${inst.name}；停止：mcsdev stop ${inst.name}）`);
}

export async function stopCmd(arg?: string): Promise<void> {
  const inst = await resolveInstance(arg);
  if (!inst) return;
  await stopServerExternal(inst);
}

export async function restartCmd(arg?: string): Promise<void> {
  const inst = await resolveInstance(arg);
  if (!inst) return;
  await stopServerExternal(inst);
  await startServer(inst, { detach: true });
  ok(`实例 ${inst.name} 已重启（日志：mcsdev logs ${inst.name}）`);
}

/** 解析出"要看哪个服务器的日志"：支持外部服务器目录与 mcsdev.yml 的 link */
function resolveLogDir(arg?: string): { dir: string; label: string } | undefined {
  // 1) 已注册实例优先（mcsdev logs test1）
  if (arg && getInstance(arg)) return undefined; // 交给原来的实例路径

  // 2) 参数直接是服务器目录
  if (arg && /[\\/]/.test(arg)) {
    const abs = path.resolve(arg);
    if (exists(path.join(abs, 'logs', 'latest.log'))) return { dir: abs, label: path.basename(abs) };
  }

  // 3) 当前项目有 mcsdev.yml 且 link 指向目录
  try {
    const yml = findYml(process.cwd());
    if (yml) {
      const spec = parseYmlFile(yml);
      if (spec.link) {
        const r = resolveLink(spec.link, spec.dir);
        if (!('error' in r) && exists(path.join(r.dir, 'logs', 'latest.log'))) {
          return { dir: r.dir, label: r.name };
        }
      }
    }
  } catch {
    /* 配置坏了就走实例路径 */
  }
  return undefined;
}

export async function logsCmd(arg?: string, opts: { follow?: boolean } = {}): Promise<void> {
  // 外部服务器（link 指向目录）：日志就在 <dir>/logs/latest.log，零成本可看
  const external = resolveLogDir(arg);
  if (external) {
    const f = path.join(external.dir, 'logs', 'latest.log');
    info(`看的是 ${external.label}（${external.dir}）`);
    await tailFile(f, opts.follow);
    return;
  }

  const inst = await resolveInstance(arg);
  if (!inst) return;
  info(`看的是 ${inst.name}（${inst.dir}）`);
  const f = path.join(inst.dir, 'logs', 'latest.log');
  if (!exists(f)) {
    warn(`还没有日志文件（实例 ${inst.name} 尚未运行过）`);
    return;
  }
  await tailFile(f, opts.follow);
}

/** tail 一个日志文件（从最后 ~20KB 开始；follow 时轮询追加） */
async function tailFile(f: string, follow?: boolean): Promise<void> {
  if (!exists(f)) {
    warn(`还没有日志文件：${f}`);
    return;
  }

  const show = (from: number): number => {
    const fd = fs.openSync(f, 'r');
    const size = fs.fstatSync(fd).size;
    if (size > from) {
      const buf = Buffer.alloc(Math.min(size - from, 64 * 1024));
      fs.readSync(fd, buf, 0, buf.length, from);
      process.stdout.write(buf.toString());
    }
    fs.closeSync(fd);
    return size;
  };

  let pos = Math.max(0, fs.statSync(f).size - 20000); // 最近 ~20KB
  pos = show(pos);

  if (follow) {
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        try {
          pos = show(pos);
        } catch {
          clearInterval(timer);
          resolve();
        }
      }, 500);
      process.on('SIGINT', () => {
        clearInterval(timer);
        resolve();
      });
    });
  }
}

export async function rebuildCmd(arg: string | undefined): Promise<void> {
  const inst = await resolveInstance(arg);
  if (!inst) return;
  rebuildInstance(inst);
  ok(`已重新生成 ${inst.name} 的 server.properties / eula.txt（未触碰 world/ 与 plugins/）`);
  hint('运行中的实例需要重启才能生效：mcsdev restart ' + inst.name);
}

export async function resetCmd(arg: string | undefined): Promise<void> {
  const inst = await resolveInstance(arg);
  if (!inst) return;
  if (runningPid(inst.name)) {
    error(`实例 ${inst.name} 正在运行，先停止：mcsdev stop ${inst.name}`);
    return;
  }
  const sure = await confirm(`确认重置 ${inst.name}？将删除 world/（含地狱/末地）与日志`, false);
  if (!sure) {
    ok('已取消');
    return;
  }
  resetInstance(inst);
  ok(`实例 ${inst.name} 已重置到初始状态`);
}