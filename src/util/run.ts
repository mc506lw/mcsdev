import { spawn } from 'child_process';

export interface RunResult {
  code: number | null;
  output: string;
  timedOut: boolean;
}

/** 运行命令并捕获输出（stdout+stderr 合并），带超时 */
export function runCmd(
  file: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (out += d.toString()));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* 已退出 */
      }
    }, opts.timeoutMs ?? 15000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: null, output: out, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output: out, timedOut });
    });
  });
}