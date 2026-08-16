import pc from 'picocolors';

/** 通用控制台输出（一切走这里，方便将来统一改样式） */
export function info(msg: string): void {
  console.log(pc.cyan('mcsdev') + ' ' + msg);
}

export function step(msg: string): void {
  console.log(pc.dim('  → ' + msg));
}

export function ok(msg: string): void {
  console.log(pc.green('✔ ') + msg);
}

export function warn(msg: string): void {
  console.log(pc.yellow('⚠ ') + msg);
}

export function error(msg: string): void {
  console.error(pc.red('✖ ') + msg);
}

export function hint(msg: string): void {
  console.log(pc.cyan('  ? ') + pc.dim(msg));
}

export function dim(msg: string): void {
  console.log(pc.dim(msg));
}

/** 服务器日志行的级别着色 */
export function colorLevel(level: string): string {
  switch (level) {
    case 'WARN':
      return pc.yellow(level);
    case 'ERROR':
      return pc.red(level);
    case 'FATAL':
      return pc.red(pc.bold(level));
    default:
      return pc.dim(level);
  }
}

/** 去掉 ANSI 转义（写 latest.log 用） */
export function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}