import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { patchKeyValue, patchYamlValue } from '../src/config-patch';
import { mergeServerProperties, writeInstanceConfigs, buildServerProperties } from '../src/instance';

const PREFS = {
  onlineMode: false,
  worldType: 'void' as const,
  allowNether: false,
  allowEnd: false,
  motd: 'mcsdev test server',
  memory: '1G',
  viewDistance: 8,
  port: 25565,
};

test('patchKeyValue: 替换已有键，保留其它行', () => {
  const out = patchKeyValue('level-type=minecraft:normal\nallow-nether=true\n', 'allow-nether', 'false');
  assert.equal(out, 'level-type=minecraft:normal\nallow-nether=false\n');
});

test('patchKeyValue: 缺失键追加到末尾', () => {
  const out = patchKeyValue('difficulty=hard\n', 'motd', 'abc');
  assert.equal(out, 'difficulty=hard\nmotd=abc\n');
});

test('patchYamlValue: 替换嵌套键值', () => {
  const out = patchYamlValue('settings:\n  allow-end: true\n  warn-on-overload: true\n', 'allow-end', 'false', 'settings');
  assert.match(out, /^\s*allow-end: false$/m);
  assert.match(out, /warn-on-overload: true/);
});

test('patchYamlValue: 不存在时插入到父块下', () => {
  const out = patchYamlValue('settings:\n  warn-on-overload: true\n', 'allow-end', 'false', 'settings');
  assert.match(out, /^  allow-end: false$/m);
  assert.match(out, /warn-on-overload: true/);
});

test('mergeServerProperties: 键级合并，保留版本特有键', () => {
  const vanilla = [
    'level-type=minecraft:normal',
    'accepts-transfers=true', // 1.21.6+ 特有大键 —— 必须保留
    'allow-nether=true',
    'online-mode=true',
    'motd=old motd',
    'some-future-key=xyz',
  ].join('\n') + '\n';
  const merged = mergeServerProperties(PREFS, 25565, vanilla);
  assert.match(merged, /accepts-transfers=true/); // 版本特有键保留
  assert.match(merged, /some-future-key=xyz/);
  assert.match(merged, /allow-nether=false/); // 我们的键已改
  assert.match(merged, /online-mode=false/);
  assert.match(merged, /level-type=minecraft:flat/);
  assert.match(merged, /generator-settings=/); // 虚空配方
});

test('writeInstanceConfigs: 首次播种 + 二次替换合并（allow-end 进 bukkit.yml）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcsdev-ict-'));
  try {
    // 首次：播种
    writeInstanceConfigs(PREFS, 25565, dir);
    const bukkit1 = fs.readFileSync(path.join(dir, 'bukkit.yml'), 'utf8');
    assert.match(bukkit1, /allow-end: false/);
    const props1 = fs.readFileSync(path.join(dir, 'server.properties'), 'utf8');
    assert.match(props1, /allow-nether=false/);

    // 模拟服务器启动后的原生文件：加入版本特有大键 + 修改了我们的键
    fs.writeFileSync(path.join(dir, 'server.properties'), props1 + 'accepts-transfers=true\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'bukkit.yml'), bukkit1 + 'connection-throttle: 4000\n', 'utf8');

    // 二次替换：合并后必须保留服务器键
    writeInstanceConfigs(PREFS, 25565, dir);
    const props2 = fs.readFileSync(path.join(dir, 'server.properties'), 'utf8');
    assert.match(props2, /accepts-transfers=true/);
    assert.match(props2, /allow-nether=false/);
    const bukkit2 = fs.readFileSync(path.join(dir, 'bukkit.yml'), 'utf8');
    assert.match(bukkit2, /connection-throttle: 4000/);
    assert.match(bukkit2, /allow-end: false/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('buildServerProperties: 虚空含空层生成配方', () => {
  const p = buildServerProperties(PREFS, 25565);
  assert.match(p, /level-type=minecraft:flat/);
  assert.match(p, /generator-settings=\{"layers":\[\]/);
});