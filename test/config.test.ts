import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, effectivePrefs, Prefs } from '../src/config';

test('effectivePrefs: 全局默认 + 实例覆盖合并', () => {
  const cfg = defaultConfig();
  cfg.prefs.onlineMode = false;
  cfg.prefs.memory = '2G';
  const merged = effectivePrefs(cfg, { onlineMode: true, worldType: 'flat' });
  assert.equal(merged.onlineMode, true);
  assert.equal(merged.worldType, 'flat');
  assert.equal(merged.memory, '2G'); // 未覆盖项保留全局值
});

test('effectivePrefs: 无覆盖 = 全局值', () => {
  const cfg = defaultConfig();
  const merged = effectivePrefs(cfg);
  assert.deepEqual(merged, cfg.prefs);
});

test('defaultConfig: 默认 dev 偏好', () => {
  const p: Prefs = defaultConfig().prefs;
  assert.equal(p.onlineMode, false);
  assert.equal(p.worldType, 'normal');
  assert.equal(p.allowNether, true);
  assert.equal(p.memory, '2G');
});