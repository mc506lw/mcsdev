import * as path from 'path';
import { getConfig, saveConfig } from '../config';
import { listSavedJava, scanJava, validateJava } from '../java';
import { error, hint, ok, warn, info } from '../util/log';
import { exists } from '../util/fsx';
import { endProgress, progress } from '../ui/prompts';
import { printJavaTable } from './setup';

/** `mcsdev java <scan|list|use|validate>`：JDK 环境管理（DESIGN.md §5.3） */
export async function javaCmd(action: string, target?: string): Promise<void> {
  switch (action) {
    case 'scan': {
      info('扫描 JDK…');
      const javas = await scanJava({
        onProgress: (done, total) => progress('扫描 JDK', done, total),
      });
      endProgress();
      if (javas.length === 0) {
        warn('未发现可用 JDK');
        hint('可先安装 JDK 或检查 JAVA_HOME');
      } else {
        ok(`发现 ${javas.length} 个 JDK`);
        printJavaTable(javas);
      }
      return;
    }
    case 'list': {
      const javas = listSavedJava();
      if (javas.length === 0) {
        warn('还没有 JDK 记录');
        hint('先运行 mcsdev java scan');
        return;
      }
      printJavaTable(javas);
      return;
    }
    case 'use': {
      if (!target) {
        error('用法：mcsdev java use <路径 | 列表索引>');
        return;
      }
      const saved = listSavedJava();
      let bin: string | null = null;
      const idx = parseInt(target, 10);
      if (!Number.isNaN(idx) && idx >= 1 && idx <= saved.length) {
        bin = saved[idx - 1].bin;
      } else if (path.isAbsolute(target)) {
        bin = target;
      } else {
        const hit = saved.find((j) => j.bin.toLowerCase().includes(target.toLowerCase()));
        if (hit) bin = hit.bin;
      }
      if (!bin || !exists(bin)) {
        error(`未找到 JDK：${target}（先 mcsdev java scan，或用列表索引）`);
        return;
      }
      const info = await validateJava(bin);
      if (!info) {
        error(`JDK 无效或探测失败：${bin}`);
        return;
      }
      const cfg = getConfig();
      cfg.defaultJava = bin;
      saveConfig(cfg);
      ok(`默认 JDK 已设为 Java ${info.major}（${info.version}）：${bin}`);
      return;
    }
    case 'validate': {
      const saved = listSavedJava();
      if (saved.length === 0) {
        warn('还没有 JDK 记录，先 mcsdev java scan');
        return;
      }
      let good = 0;
      for (const j of saved) {
        const r = await validateJava(j.bin);
        console.log(`  ${r ? '✔' : '✖'} Java ${j.major}  ${j.bin}`);
        if (r) good++;
      }
      ok(`可用 ${good}/${saved.length}`);
      return;
    }
    default:
      error('用法：mcsdev java <scan | list | use <路径|索引> | validate>');
  }
}