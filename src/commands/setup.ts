import * as path from 'path';
import { defaultConfig, getConfig, saveConfig } from '../config';
import { pickDefaultJava, scanJava, JavaInfo } from '../java';
import { hint, ok, step, warn, info } from '../util/log';
import { ensureDir, exists, isEmptyDir, mcsdevHome } from '../util/fsx';
import { confirm, endProgress, progress, select, text } from '../ui/prompts';

/** `mcsdev setup`：JDK 扫描 + 默认 JDK + 服务器根路径 + 偏好（DESIGN.md §5.2） */
export async function setupCmd(): Promise<void> {
  info('开始初始化 mcsdev 全局环境…');
  ensureDir(mcsdevHome());
  const cfg = getConfig();

  // 1. JDK 扫描（参照 PCL2 候选目录 + 二进制探测）
  step('扫描本机 JDK…');
  const javas = await scanJava({
    onProgress: (done, total) => progress('扫描 JDK', done, total),
  });
  endProgress();
  if (javas.length === 0) {
    warn('未发现可用的 64 位 JDK');
    hint('请先安装 JDK（如 Adoptium Temurin / Microsoft OpenJDK / Amazon Corretto），装好后再跑 mcsdev java scan');
  } else {
    ok(`发现 ${javas.length} 个 JDK`);
    printJavaTable(javas);
    const def = pickDefaultJava(javas)!;
    const chosen = await select(
      '选择默认 JDK',
      javas.map((j) => ({
        value: j.bin,
        label: `Java ${j.major}（${j.version}）${j.vendor}`,
        hint: j.fromCandidate ? '候选目录' : '环境变量/PATH',
      })),
      { initial: def.bin }
    );
    cfg.defaultJava = chosen;
    ok('默认 JDK 已记录');
  }

  // 2. 服务器根路径（空目录；默认放当前项目 .tmp —— 测试服临时目录）
  let root = '';
  while (!root) {
    const ans = await text('服务器根路径（所有实例建在这里，需为空目录）', {
      initial: path.join(process.cwd(), '.tmp'),
    });
    if (exists(ans) && !isEmptyDir(ans)) {
      warn(`目录非空（${ans}），请换一个空目录`);
      continue;
    }
    ensureDir(ans);
    root = ans;
  }
  cfg.root = root;

  // 3. 有安全含义的偏好：online-mode
  const offline = await confirm('本地测试默认关闭 online-mode（离线登录，无需正版账号）？', !cfg.prefs.onlineMode);
  cfg.prefs.onlineMode = !offline;
  if (!cfg.prefs.onlineMode) {
    hint('离线模式仅适合本地开发测试，切勿用于公网服务器');
  }

  saveConfig(cfg);
  console.log();
  ok('setup 完成！');
  hint(`接下来：mcsdev new 创建实例，或 mcsdev run <版本> 直接跑`);
  info('也可随时用 mcsdev java scan / use 调整 JDK，mcsdev config 文件在 ~/.mcsdev/config.json');
}

export function printJavaTable(javas: JavaInfo[]): void {
  javas.forEach((j, i) => {
    const tag = j.fromCandidate ? '' : '  (环境变量/PATH)';
    console.log(`  ${String(i + 1).padEnd(3)} Java ${String(j.major).padEnd(3)} ${j.version.padEnd(12)} ${j.vendor.padEnd(16)} ${j.arch}位${tag}`);
    console.log(`      ${j.bin}`);
  });
}