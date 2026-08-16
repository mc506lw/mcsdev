import * as pc from 'picocolors';
import { listInstances } from '../registry';
import { runningPid } from '../server';
import { hint, warn } from '../util/log';

/** `mcsdev ls`：列出实例（名字 / 核心 / 版本 / 端口 / 状态） */
export function lsCmd(): void {
  const all = listInstances();
  if (all.length === 0) {
    warn('还没有实例');
    hint('mcsdev new 创建第一个实例');
    return;
  }
  console.log();
  for (const i of all) {
    const pid = runningPid(i.name);
    const status = pid ? pc.green(`运行中 (PID ${pid})`) : pc.dim('已停止');
    console.log(
      `  ${pc.bold(i.name.padEnd(20))}${pc.dim(i.core.padEnd(6))} ${i.mcVersion.padEnd(9)} 端口 ${String(i.port).padEnd(5)} ${status}`
    );
    console.log(pc.dim(`      ${i.dir}`));
  }
  console.log();
}