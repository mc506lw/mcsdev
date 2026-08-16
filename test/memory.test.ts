import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../src/memory';

const A = { name: 'a.jar', size: 100, mtimeMs: 1000 };
const B = { name: 'b.jar', size: 200, mtimeMs: 2000 };

test('fingerprint: 与顺序无关', () => {
  assert.equal(fingerprint([A, B]), fingerprint([B, A]));
});

test('fingerprint: 集合变化 → 指纹变化', () => {
  const base = fingerprint([A, B]);
  assert.notEqual(base, fingerprint([A])); // 少一个
  assert.notEqual(base, fingerprint([A, B, { name: 'c.jar', size: 1, mtimeMs: 1 }])); // 多一个
});

test('fingerprint: 新增文件顺序无关但内容变化反映', () => {
  const fp1 = fingerprint([A, B]);
  // 同名 jar 内容/时间变化 = 指纹变化（触发重新选择）
  const fp2 = fingerprint([A, { name: 'b.jar', size: 201, mtimeMs: 2000 }]);
  assert.notEqual(fp1, fp2);
});