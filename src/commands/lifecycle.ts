import * as fs from 'fs';
import * as path from 'path';
import { resetInstance, rebuildInstance } from '../instance';
import { getInstance, listInstances } from '../registry';
import { runningPid, startServer, stopServerExternal, ServerHandle } from '../server';
import { error, ok, warn, hint } from '../util/log';
import { exists } from '../util/fsx';
import { confirm } from '../ui/prompts';
import { waitForExit } from './run';

/** 生命周期命令：start / stop / restart / logs / rebuild / reset */

export async function startCmd(name: string): Promise<void> {
  const inst = getInstance(name);
  if (!inst) {
    error(`实例不存在：${name}`);
    return;
  }
  const handle = await startServer(inst, { relayStdin: true });
  ok(`实例 ${name} 已启动：输入 stop 优雅停止，Ctrl+C 中断`);
  await waitForExit(handle);
}

export async function stopCmd(name: string): Promise<void> {
  const inst = getInstance(name);
  if (!inst) {
    error(`实例不存在：${name}`);
    return;
  }
  await stopServerExternal(inst);
}

export async function restartCmd(name: string): Promise<void> {
  const inst = getInstance(name);
  if (!inst) {
    error(`实例不存在：${name}`);
    return;
  }
  await stopServerExternal(inst);
  const handle = await startServer(inst, { relayStdin: true });
  ok(`实例 ${name} 已重启`);
  await waitForExit(handle);
}

export async function logsCmd(name: string | undefined, opts: { follow?: boolean }): Promise<void> {
  const inst = name
    ? getInstance(name)
    : listInstances().find((i) => runningPid(i.name) !== null) ?? listInstances()[0];
  if (!inst) {
    error('没有实例可用（mcsdev new 创建）');
    return;
  }
  const f = path.join(inst.dir, 'logs', 'latest.log');
  if (!exists(f)) {
    warn(`还没有日志文件（实例 ${inst.name} 尚未运行过）`);
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

  if (opts.follow) {
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

export async function rebuildCmd(name: string): Promise<void> {
  const inst = getInstance(name);
  if (!inst) {
    error(`实例不存在：${name}`);
    return;
  }
  rebuildInstance(inst);
  ok(`已重新生成 ${name} 的 server.properties / eula.txt（未触碰 world/ 与 plugins/）`);
  hint('运行中的实例需要重启才能生效：mcsdev restart ' + name);
}

export async function resetCmd(name: string): Promise<void> {
  const inst = getInstance(name);
  if (!inst) {
    error(`实例不存在：${name}`);
    return;
  }
  if (runningPid(name)) {
    error(`实例 ${name} 正在运行，先停止：mcsdev stop ${name}`);
    return;
  }
  const sure = await confirm(`确认重置 ${name}？将删除 world/（含地狱/末地）与日志`, false);
  if (!sure) {
    ok('已取消');
    return;
  }
  resetInstance(inst);
  ok(`实例 ${name} 已重置到初始状态`);
}