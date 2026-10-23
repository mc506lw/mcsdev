/**
 * compose.ts 的核心逻辑测试：
 *  - glob 匹配与排除（真实项目里 build/libs 会堆几十个 jar）
 *  - newest 只取最新
 *  - clean 按前缀清理旧版本（多版本共存会让服务器双加载同一插件）
 *  - 校验红线（link/server 互斥、rename 必须 .jar）
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// 必须在 import compose 之前隔离 MCSDEV_HOME（compose 会读全局配置）
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mcsdev-compose-'));
process.env.MCSDEV_HOME = path.join(TMP_ROOT, 'home');
fs.mkdirSync(process.env.MCSDEV_HOME, { recursive: true });

import { derivePrefix, matchGlob, parseYmlFile, probeHostOf, resolveConfig, resolvePlugin } from '../src/compose';

function mkdirp(p: string): string {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function writeFile(p: string, content = 'x'): string {
  mkdirp(path.dirname(p));
  fs.writeFileSync(p, content);
  return p;
}

let seq = 0;
function freshDir(): string {
  return mkdirp(path.join(TMP_ROOT, `case${++seq}`));
}

function writeYml(dir: string, body: string): string {
  const f = path.join(dir, 'mcsdev.yml');
  fs.writeFileSync(f, body);
  return f;
}

// ============ derivePrefix ============

test('derivePrefix: 从 glob 推导旧版本前缀', () => {
  assert.equal(derivePrefix('Lapis-Pipez/build/libs/Lapis-Pipez-*.jar'), 'Lapis-Pipez-');
  assert.equal(derivePrefix('build/libs/*.jar'), '');
  assert.equal(derivePrefix('target/MyPlugin-*.jar'), 'MyPlugin-');
});

test('derivePrefix: 无通配符时去掉 .jar', () => {
  assert.equal(derivePrefix('libs/Vault-1.7.3.jar'), 'Vault-1.7.3');
});

// ============ matchGlob ============

test('matchGlob: 只匹配文件，且大小写不敏感', () => {
  const d = freshDir();
  writeFile(path.join(d, 'build/libs/A-1.0.jar'));
  writeFile(path.join(d, 'build/libs/B-2.0.JAR'));
  writeFile(path.join(d, 'build/libs/readme.txt'));
  mkdirp(path.join(d, 'build/libs/subdir'));

  const hits = matchGlob(d, 'build/libs/*.jar').map((p) => path.basename(p));
  assert.deepEqual(hits.sort(), ['A-1.0.jar', 'B-2.0.JAR']);
});

test('matchGlob: 目录不存在时返回空而不是抛错', () => {
  const d = freshDir();
  assert.deepEqual(matchGlob(d, 'nope/libs/*.jar'), []);
});

test('matchGlob: 支持 ../ 相对路径', () => {
  const root = freshDir();
  writeFile(path.join(root, 'other/build/libs/X-1.0.jar'));
  const sub = mkdirp(path.join(root, 'me'));
  const hits = matchGlob(sub, '../other/build/libs/*.jar');
  assert.equal(hits.length, 1);
});

// ============ parseYmlFile 校验 ============

test('parseYmlFile: link 与 server 互斥', () => {
  const d = freshDir();
  const f = writeYml(
    d,
    ['version: 1', 'name: t', 'link: abc', 'server:', '  mc: 1.20.1', 'plugins:', '  - build/libs/*.jar'].join('\n')
  );
  assert.throws(() => parseYmlFile(f), /只能二选一/);
});

test('parseYmlFile: 既没 link 也没 server 要报错', () => {
  const d = freshDir();
  const f = writeYml(d, ['version: 1', 'name: t', 'plugins:', '  - build/libs/*.jar'].join('\n'));
  assert.throws(() => parseYmlFile(f), /必须写 link.*或 server/);
});

test('parseYmlFile: rename 必须以 .jar 结尾', () => {
  const d = freshDir();
  const f = writeYml(
    d,
    ['version: 1', 'name: t', 'link: abc', 'plugins:', '  - path: build/libs/*.jar', '    rename: MyPlugin'].join('\n')
  );
  assert.throws(() => parseYmlFile(f), /必须以 \.jar 结尾/);
});

test('parseYmlFile: version 不是 1 要报错', () => {
  const d = freshDir();
  const f = writeYml(d, ['version: 2', 'name: t', 'link: abc', 'plugins:', '  - a/*.jar'].join('\n'));
  assert.throws(() => parseYmlFile(f), /version 必须是 1/);
});

test('parseYmlFile: 字符串简写与对象写法都能解析', () => {
  const d = freshDir();
  const f = writeYml(
    d,
    [
      'version: 1',
      'name: t',
      'link: abc',
      'plugins:',
      '  - build/libs/*.jar',
      '  - path: other/libs/*.jar',
      '    rename: Fixed.jar',
      '    clean: false',
      '    required: false',
      '    newest: false',
    ].join('\n')
  );
  const spec = parseYmlFile(f);
  assert.equal(spec.plugins.length, 2);
  assert.equal(spec.plugins[0].path, 'build/libs/*.jar');
  assert.equal(spec.plugins[1].rename, 'Fixed.jar');
  assert.equal(spec.plugins[1].clean, false);
  assert.equal(spec.plugins[1].required, false);
  assert.equal(spec.plugins[1].newest, false);
});

// ============ resolvePlugin：newest ============

test('newest: 多个历史 jar 只取最新一个', () => {
  const d = freshDir();
  const libs = path.join(d, 'build/libs');
  const old = writeFile(path.join(libs, 'MyPlugin-1.0.jar'));
  const newest = writeFile(path.join(libs, 'MyPlugin-1.1.jar'));
  // 明确拉开 mtime
  fs.utimesSync(old, new Date(2020, 0, 1), new Date(2020, 0, 1));
  fs.utimesSync(newest, new Date(2024, 0, 1), new Date(2024, 0, 1));

  const pluginsDir = path.join(d, 'server/plugins');
  const r = resolvePlugin({ path: 'build/libs/MyPlugin-*.jar' }, d, pluginsDir);

  assert.equal(r.matched.length, 2);
  assert.equal(r.chosen.length, 1);
  assert.equal(path.basename(r.chosen[0]), 'MyPlugin-1.1.jar');
});

test('newest: false 时全部部署', () => {
  const d = freshDir();
  writeFile(path.join(d, 'build/libs/A-1.0.jar'));
  writeFile(path.join(d, 'build/libs/B-1.0.jar'));

  const r = resolvePlugin({ path: 'build/libs/*.jar', newest: false }, d, path.join(d, 'server/plugins'));
  assert.equal(r.chosen.length, 2);
});

// ============ resolvePlugin：排除 ============

test('exclude: 默认排除 sources/javadoc/dev 产物', () => {
  const d = freshDir();
  const libs = path.join(d, 'build/libs');
  writeFile(path.join(libs, 'MyPlugin-1.0.jar'));
  writeFile(path.join(libs, 'MyPlugin-1.0-sources.jar'));
  writeFile(path.join(libs, 'MyPlugin-1.0-javadoc.jar'));
  writeFile(path.join(libs, 'MyPlugin-1.0-dev.jar'));
  writeFile(path.join(libs, 'MyPlugin-1.0-mojang-mapped.jar'));

  const r = resolvePlugin({ path: 'build/libs/*.jar' }, d, path.join(d, 'server/plugins'));
  assert.equal(r.chosen.length, 1);
  assert.equal(path.basename(r.chosen[0]), 'MyPlugin-1.0.jar');
  assert.equal(r.excluded.length, 4);
});

// ============ resolvePlugin：clean ============

test('clean: 按前缀清掉 plugins 里的旧版本（避免双加载）', () => {
  const d = freshDir();
  writeFile(path.join(d, 'build/libs/MyPlugin-2.0.jar'));
  const pluginsDir = mkdirp(path.join(d, 'server/plugins'));
  writeFile(path.join(pluginsDir, 'MyPlugin-1.0.jar'));
  writeFile(path.join(pluginsDir, 'MyPlugin-1.1.jar'));
  writeFile(path.join(pluginsDir, 'OtherPlugin-1.0.jar')); // 不能误删
  writeFile(path.join(pluginsDir, 'MyPlugin-1.0.jaroff')); // 手动禁用的，不能碰

  const r = resolvePlugin({ path: 'build/libs/MyPlugin-*.jar' }, d, pluginsDir);
  const cleaned = r.willClean.map((p) => path.basename(p)).sort();

  assert.deepEqual(cleaned, ['MyPlugin-1.0.jar', 'MyPlugin-1.1.jar']);
  assert.ok(!cleaned.includes('OtherPlugin-1.0.jar'), '不能删别的插件');
  assert.ok(!cleaned.includes('MyPlugin-1.0.jaroff'), '不能碰 .jaroff');
});

test('clean: false 时不清任何东西', () => {
  const d = freshDir();
  writeFile(path.join(d, 'build/libs/MyPlugin-2.0.jar'));
  const pluginsDir = mkdirp(path.join(d, 'server/plugins'));
  writeFile(path.join(pluginsDir, 'MyPlugin-1.0.jar'));

  const r = resolvePlugin({ path: 'build/libs/MyPlugin-*.jar', clean: false }, d, pluginsDir);
  assert.equal(r.willClean.length, 0);
});

test('clean: 目标同名文件不算"旧版本"（会被直接覆盖）', () => {
  const d = freshDir();
  writeFile(path.join(d, 'build/libs/MyPlugin-1.0.jar'));
  const pluginsDir = mkdirp(path.join(d, 'server/plugins'));
  writeFile(path.join(pluginsDir, 'MyPlugin-1.0.jar'));

  const r = resolvePlugin({ path: 'build/libs/MyPlugin-*.jar' }, d, pluginsDir);
  assert.equal(r.willClean.length, 0);
});

test('clean: 推导不出前缀时只覆盖同名，并给出警告', () => {
  const d = freshDir();
  writeFile(path.join(d, 'build/libs/thing.jar'));
  const pluginsDir = mkdirp(path.join(d, 'server/plugins'));
  writeFile(path.join(pluginsDir, 'other.jar'));

  const r = resolvePlugin({ path: 'build/libs/*.jar' }, d, pluginsDir);
  assert.equal(r.willClean.length, 0, '不能猜着删别的插件');
  assert.ok(r.warnings.some((w) => w.includes('推导不出插件名前缀')));
});

// ============ resolvePlugin：required ============

test('required: 无匹配默认报错', () => {
  const d = freshDir();
  const r = resolvePlugin({ path: 'build/libs/*.jar' }, d, path.join(d, 'server/plugins'));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /没有匹配到 jar/);
});

test('required: false 时只警告', () => {
  const d = freshDir();
  const r = resolvePlugin({ path: 'build/libs/*.jar', required: false }, d, path.join(d, 'server/plugins'));
  assert.equal(r.errors.length, 0);
  assert.ok(r.warnings.some((w) => w.includes('required: false')));
});

// ============ rename / to ============

test('rename: 部署时改名（目标名以 rename 为准）', () => {
  const d = freshDir();
  writeFile(path.join(d, 'build/libs/MyPlugin-1.0.jar'));
  const pluginsDir = mkdirp(path.join(d, 'server/plugins'));

  const r = resolvePlugin({ path: 'build/libs/MyPlugin-*.jar', rename: 'Fixed.jar' }, d, pluginsDir);
  assert.equal(r.chosen.length, 1);
  assert.equal(r.entry.rename, 'Fixed.jar');
});

test('to: 已移除 —— 写了直接报错（Bukkit 不加载 plugins/ 子目录）', () => {
  const d = freshDir();
  const f = writeYml(
    d,
    ['version: 1', 'name: t', 'link: ./srv', 'plugins:', '  - path: build/libs/*.jar', '    to: update'].join('\n')
  );
  assert.throws(() => parseYmlFile(f), /to: 已移除/);
});

test('newest: 按版本号选最新，不受 mtime 干扰（gradle cache 会把旧产物还原成旧 mtime）', () => {
  const d = freshDir();
  const libs = path.join(d, 'build/libs');
  const v1 = writeFile(path.join(libs, 'Foo-1.0.jar'));
  const v2 = writeFile(path.join(libs, 'Foo-2.0.jar'));
  // 故意让 1.0 的 mtime 更新 —— 按 mtime 会选错
  fs.utimesSync(v2, new Date(2020, 0, 1), new Date(2020, 0, 1));
  fs.utimesSync(v1, new Date(2024, 0, 1), new Date(2024, 0, 1));

  const r = resolvePlugin({ path: 'build/libs/Foo-*.jar' }, d, path.join(d, 'server/plugins'));
  assert.equal(path.basename(r.chosen[0]), 'Foo-2.0.jar', '应该按版本号选 2.0，而不是按 mtime 选 1.0');
});

// ============ 安全相关（评审暴露出来的） ============

test('.jaroff: 手动禁用的插件被部署会警告（不会静默重新启用）', () => {
  const d = freshDir();
  writeFile(path.join(d, 'build/libs/Foo-1.0.jar'));
  const pluginsDir = mkdirp(path.join(d, 'server/plugins'));
  writeFile(path.join(pluginsDir, 'Foo-1.0.jaroff')); // 用户把 .jar 改名成 .jaroff 来禁用

  const r = resolvePlugin({ path: 'build/libs/Foo-*.jar' }, d, pluginsDir);
  assert.ok(
    r.warnings.some((w) => w.includes('.jaroff') && w.includes('重新启用')),
    '应该警告：部署会重新启用被 .jaroff 禁用的插件'
  );
});

test('未实现字段: config 写了就报错，不能让 config 显示"可用"', () => {
  const d = freshDir();
  mkdirp(path.join(d, 'srv'));
  const f = writeYml(
    d,
    ['version: 1', 'name: t', 'link: ./srv', 'plugins:', '  - build/libs/*.jar', 'config:', '  view-distance: 8'].join(
      '\n'
    )
  );
  const cfg = resolveConfig(parseYmlFile(f));
  assert.ok(cfg.errors.some((e) => e.includes('config: 尚未实现')));
});

test('未实现字段: onStart 写了就报错', () => {
  const d = freshDir();
  mkdirp(path.join(d, 'srv'));
  const f = writeYml(
    d,
    ['version: 1', 'name: t', 'link: ./srv', 'plugins:', '  - build/libs/*.jar', 'onStart:', '  - say hi'].join('\n')
  );
  const cfg = resolveConfig(parseYmlFile(f));
  assert.ok(cfg.errors.some((e) => e.includes('onStart: 尚未实现')));
});

test('双载检测: 两条 entry 产出同前缀 jar → 报错', () => {
  const d = freshDir();
  mkdirp(path.join(d, 'srv'));
  writeFile(path.join(d, 'a/build/libs/Foo-1.0.jar'));
  writeFile(path.join(d, 'b/build/libs/Foo-2.0.jar'));
  const f = writeYml(
    d,
    [
      'version: 1',
      'name: t',
      'link: ./srv',
      'plugins:',
      '  - path: a/build/libs/Foo-*.jar',
      '  - path: b/build/libs/Foo-*.jar',
    ].join('\n')
  );
  const cfg = resolveConfig(parseYmlFile(f));
  assert.ok(cfg.errors.some((e) => e.includes('双载风险')));
});

test('双载检测: 不同插件前缀不误报', () => {
  const d = freshDir();
  mkdirp(path.join(d, 'srv'));
  writeFile(path.join(d, 'a/build/libs/Foo-1.0.jar'));
  writeFile(path.join(d, 'b/build/libs/Bar-1.0.jar'));
  const f = writeYml(
    d,
    [
      'version: 1',
      'name: t',
      'link: ./srv',
      'plugins:',
      '  - path: a/build/libs/Foo-*.jar',
      '  - path: b/build/libs/Bar-*.jar',
    ].join('\n')
  );
  const cfg = resolveConfig(parseYmlFile(f));
  assert.equal(cfg.errors.filter((e) => e.includes('双载风险')).length, 0);
});

test('条目错误不并入全局错误（deploy <id> 不会被别的工程连坐）', () => {
  const d = freshDir();
  mkdirp(path.join(d, 'srv'));
  writeFile(path.join(d, 'a/build/libs/Foo-1.0.jar'));
  // b 没有任何产物
  const f = writeYml(
    d,
    [
      'version: 1',
      'name: t',
      'link: ./srv',
      'plugins:',
      '  - path: a/build/libs/Foo-*.jar',
      '  - path: b/build/libs/Bar-*.jar',
    ].join('\n')
  );
  const cfg = resolveConfig(parseYmlFile(f));
  assert.equal(cfg.errors.length, 0, '全局错误应为空');
  const bar = cfg.plugins.find((p) => p.entry.path.includes('Bar'));
  assert.ok(bar && bar.errors.length > 0, '未构建的条目自己带错误');
  const foo = cfg.plugins.find((p) => p.entry.path.includes('Foo'));
  assert.equal(foo?.errors.length, 0, '已构建的条目不受影响');
});

test('probeHostOf: UNC 路径取 server 名，本地盘符回退 127.0.0.1，显式 host 优先', () => {
  const B = String.fromCharCode(92);
  const unc = B + B + 'fileserver' + B + 'share' + B + 'plugins';
  assert.equal(probeHostOf({ spec: {}, serverDir: unc } as never), 'fileserver');

  const local = 'E:' + B + 'Minecraft' + B + 'srv';
  assert.equal(probeHostOf({ spec: {}, serverDir: local } as never), '127.0.0.1');

  assert.equal(probeHostOf({ spec: { host: '10.0.0.5' }, serverDir: local } as never), '10.0.0.5');
});
