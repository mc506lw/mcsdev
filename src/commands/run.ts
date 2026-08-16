import * as path from 'path';
import { getConfig } from '../config';
import { byVersion, getInstance } from '../registry';
import { forgetVersion, getMemory, setMemory, stampsOfJars } from '../memory';
import { findProject } from '../probe';
import { compareVersions, fetchVersions } from '../paper';
import { ServerHandle, startServer, stopServerExternal, runningPid, gracefulStopHandle } from '../server';
import { atomicCopy, exists } from '../util/fsx';
import { error, hint, ok, step, warn } from '../util/log';
import { confirm, select, Choice } from '../ui/prompts';
import { newCmd } from './new';

export interface RunOptions {
  forget?: boolean;
}

/**
 * `mcsdev run [版本]` —— 记忆式启动（DESIGN.md §5.5）：
 * 查记忆 → 选实例（可 new）→ 选 jar（无歧义零提示）→ 部署 → 启动/重启 → 日志回流
 */
export async function runCmd(versionArg: string | undefined, opts: RunOptions = {}): Promise<void> {
  const cfg = getConfig();
  if (!cfg.root) {
    error('尚未初始化：请先运行 mcsdev setup');
    return;
  }

  // 1. 解析版本：参数 > 项目探测 > 交互选择
  let version = versionArg;
  if (!version) {
    const proj = findProject(process.cwd());
    if (proj?.mcVersion) {
      version = proj.mcVersion;
      step(`从项目依赖探测到 MC ${version}`);
    }
  }
  if (!version) {
    try {
      const vs = (await fetchVersions('paper')).sort(compareVersions);
      const recent = vs.slice(-12).reverse();
      version = await select('MC 版本', recent.map((v) => ({ value: v, label: v })), { initial: recent[0] });
    } catch (e) {
      error((e as Error).message);
      error('且未提供 <版本> 参数');
      return;
    }
  }

  if (opts.forget) {
    forgetVersion(version);
    ok(`已清除 ${version} 的选择记忆`);
    return;
  }

  // 2. 构建产物：扫描当前项目的 jar 目录
  const proj = findProject(process.cwd());
  const dirs = [
    proj?.libsDir,
    path.join(process.cwd(), 'build', 'libs'),
    path.join(process.cwd(), 'libs'),
    path.join(process.cwd(), 'plugins'),
  ].filter((d): d is string => !!d);
  const uniqueDirs = [...new Set(dirs)];
  const stamps = stampsOfJars(uniqueDirs);
  const jarNames = stamps.map((s) => s.name);

  // 3. 记忆查询（键 = 版本 + 产物集合指纹）
  let instName: string | undefined;
  let jar: string | undefined;
  const mem = stamps.length > 0 ? getMemory(version, stamps) : undefined;
  if (mem && getInstance(mem.instance) && jarNames.includes(mem.jar)) {
    instName = mem.instance;
    jar = mem.jar;
    ok(`沿用上次选择：${mem.instance} → ${mem.jar}`);
  } else if (mem) {
    warn('上次的选择已失效（实例或 jar 变化），重新选择');
  }

  // 4. 选实例
  if (!instName) {
    const candidates = byVersion(version);
    if (candidates.length === 0) {
      warn(`还没有 ${version} 的实例`);
      if (await confirm('现在创建一个？', true)) {
        const meta = await newCmd({ mcVersion: version });
        if (!meta) return;
        instName = meta.name;
      } else {
        return;
      }
    } else if (candidates.length === 1) {
      instName = candidates[0].name;
      step(`使用实例 ${instName}`);
    } else {
      const choices: Choice<string>[] = [
        ...candidates.map((c) => ({ value: c.name, label: c.name, hint: `${c.core} · 端口 ${c.port}` })),
        { value: '__new__', label: '（新建实例…）' },
      ];
      const choice = await select('选择实例', choices);
      if (choice === '__new__') {
        const meta = await newCmd({ mcVersion: version });
        if (!meta) return;
        instName = meta.name;
      } else {
        instName = choice;
      }
    }
  }
  const inst = getInstance(instName);
  if (!inst) {
    error(`实例不存在：${instName}`);
    return;
  }

  // 5. 选 jar
  if (!jar) {
    if (jarNames.length === 0) {
      error(`未找到构建产物 jar（当前目录：${process.cwd()}）`);
      hint('先运行 gradlew build；或在插件项目目录（build/libs）下执行');
      return;
    }
    jar = jarNames.length === 1 ? jarNames[0] : await select('选择 jar', jarNames.map((j) => ({ value: j, label: j })));
  }

  // 6. 记忆落盘
  if (stamps.length > 0) {
    setMemory(version, stamps, { instance: inst.name, jar });
  }

  // 7. 部署（原子复制到 plugins/）
  const srcJar = uniqueDirs.map((d) => path.join(d, jar)).find((f) => exists(f));
  if (!srcJar) {
    error(`找不到 ${jar}（产物目录已变化？）`);
    return;
  }
  step(`部署 ${jar} → ${inst.name}/plugins/`);
  atomicCopy(srcJar, path.join(inst.dir, 'plugins', jar));
  ok('部署完成');

  // 8. 若已在运行 → 重启；否则启动
  const prevPid = runningPid(inst.name);
  if (prevPid) {
    warn(`实例 ${inst.name} 正在运行（PID ${prevPid}），执行重启…`);
    await stopServerExternal(inst);
  }
  const handle = await startServer(inst, { relayStdin: true });
  ok(`实例 ${inst.name} 已启动：控制台输入 stop 可优雅停止；Ctrl+C 中断并强制停止`);

  // 9. 前台等待直到子进程退出或 Ctrl+C
  await waitForExit(handle);
  ok('run 会话结束');
}

/** 前台等待：子进程自然退出，或 SIGINT/SIGTERM 时优雅停止 */
export async function waitForExit(handle: ServerHandle): Promise<void> {
  await new Promise<void>((resolve) => {
    handle.child.once('close', () => resolve());
    const onSig = (): void => {
      console.log();
      warn('收到中断，正在停止服务器…');
      void gracefulStopHandle(handle).then(() => resolve());
    };
    process.on('SIGINT', onSig);
    process.on('SIGTERM', onSig);
  });
}