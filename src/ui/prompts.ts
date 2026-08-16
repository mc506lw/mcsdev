import * as readline from 'readline';
import * as pc from 'picocolors';

/**
 * 交互层：TTY 下方向键选择 + 回车确认；非 TTY（管道/脚本）下编号输入兜底。
 * 设计原则（DESIGN.md §2）：无歧义零提示 —— 只有一个选项时直接返回，不弹框。
 */

function clearLine(): void {
  if (process.stdout.isTTY) {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  }
}

function askLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string): void => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    // 管道/EOF 场景：静默结束返回空串，避免挂起；done 守卫保证不覆盖真实答案
    rl.on('close', () => finish(''));
    rl.question(question, (ans) => {
      finish(ans.trim());
      rl.close();
    });
  });
}

export interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

export async function select<T>(msg: string, choices: Choice<T>[], opts: { initial?: T } = {}): Promise<T> {
  if (choices.length === 0) throw new Error('没有可选项');
  if (choices.length === 1) {
    console.log(pc.cyan('? ') + msg + '  ' + pc.dim('→ ') + choices[0].label);
    return choices[0].value;
  }
  const initialIdx = opts.initial === undefined ? -1 : choices.findIndex((c) => c.value === opts.initial);
  let cur = initialIdx >= 0 ? initialIdx : 0;

  // Promise 句柄：TTY 分支在键盘事件里异步 resolve；非 TTY 分支直接 return
  let resolveSelect!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolveSelect = r;
  });

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    // 块级重绘：问题行 + 选项行共 choices.length+1 行。
    // 每次渲染先把光标回到块顶 → 清掉旧块 → 重画 → 再回到块顶；
    // 旧实现只回退 choices.length 行，导致每次按键问题行下行错位、越堆越多。
    const blockHeight = choices.length + 1;
    let first = true;
    const clearDown = (): void => {
      readline.cursorTo(process.stdout, 0);
      readline.clearScreenDown(process.stdout);
    };
    const toTop = (): void => {
      readline.cursorTo(process.stdout, 0);
      readline.moveCursor(process.stdout, 0, -blockHeight);
    };
    const render = (): void => {
      if (!first) clearDown();
      first = false;
      process.stdout.write(pc.cyan('? ') + msg + pc.dim('（↑/↓ 或数字选择，回车确认）') + '\n');
      choices.forEach((c, i) => {
        const mark = i === cur ? pc.green('❯ ') : '  ';
        const label = i === cur ? pc.green(c.label) : pc.dim(c.label);
        const hintStr = c.hint ? pc.dim('  — ' + c.hint) : '';
        process.stdout.write(mark + label + hintStr + '\n');
      });
      toTop();
    };
    const finish = (value: T): void => {
      clearDown();
      const chosen = choices.find((c) => c.value === value);
      process.stdout.write(pc.cyan('? ') + msg + pc.dim(' → ') + pc.green(chosen?.label ?? String(value)) + '\n');
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      resolveSelect(value);
    };

    render();
    const onData = (key: string): void => {
      if (key === '\u0003') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.exit(130);
      }
      if (key === '\r' || key === '\n') {
        finish(choices[cur].value);
      } else if (key === '\u001b[A' || key === 'k') {
        cur = (cur - 1 + choices.length) % choices.length;
        render();
      } else if (key === '\u001b[B' || key === 'j') {
        cur = (cur + 1) % choices.length;
        render();
      } else if (/^[0-9]$/.test(key)) {
        const n = parseInt(key, 10);
        if (n >= 1 && n <= choices.length) {
          finish(choices[n - 1].value);
        }
      }
    };
    process.stdin.on('data', onData);
    return promise;
  }

  // 非 TTY：编号选择
  console.log(pc.cyan('? ') + msg);
  choices.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.label}${c.hint ? pc.dim('  — ' + c.hint) : ''}`);
  });
  const ans = await askLine('  > ');
  const n = parseInt(ans, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= choices.length) return choices[n - 1].value;
  const byValue = choices.find((c) => String(c.value) === ans);
  if (byValue) return byValue.value;
  return choices[cur].value;
}

export async function confirm(msg: string, initial = false): Promise<boolean> {
  const hintTag = initial ? 'Y/n' : 'y/N';
  const ans = await askLine(pc.cyan('? ') + msg + pc.dim(` [${hintTag}] `));
  if (ans === '') return initial;
  return /^(y|yes|是)$/i.test(ans);
}

export async function text(
  msg: string,
  opts: { initial?: string; validate?: (v: string) => string | null } = {}
): Promise<string> {
  while (true) {
    const suffix = opts.initial !== undefined ? pc.dim(`（默认 ${opts.initial}）`) : '';
    const ans = await askLine(pc.cyan('? ') + msg + suffix + ' ');
    const v = ans === '' && opts.initial !== undefined ? opts.initial : ans;
    const err = opts.validate ? opts.validate(v) : null;
    if (!err) return v;
    console.log(pc.yellow('  ✗ ' + err));
  }
}

/** 进度条（仅 TTY 显示，覆盖当前行） */
export function progress(label: string, received: number, total: number): void {
  if (!process.stdout.isTTY) return;
  const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : -1;
  const mb = (received / 1048576).toFixed(1);
  clearLine();
  process.stdout.write(
    pct >= 0 ? pc.dim(`  → ${label} ${pct}% (${mb} MB)`) : pc.dim(`  → ${label} ${mb} MB`)
  );
  readline.cursorTo(process.stdout, 0);
}

export function endProgress(): void {
  if (process.stdout.isTTY) clearLine();
}