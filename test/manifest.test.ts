/**
 * manifest / prune 的测试：核心是「只删自己放过的东西」这条安全边界。
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mcsdev-manifest-'));
process.env.MCSDEV_HOME = path.join(TMP_ROOT, 'home');
fs.mkdirSync(process.env.MCSDEV_HOME, { recursive: true });

import { findPruneCandidates, readManifest, recordDeployed, writeManifest } from '../src/manifest';

let seq = 0;
function freshDir(): string {
  const d = path.join(TMP_ROOT, `c${++seq}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

test('manifest: 空目录读出空清单', () => {
  const d = freshDir();
  const m = readManifest(d);
  assert.deepEqual(m.files, {});
});

test('manifest: recordDeployed 累积记录', () => {
  const d = freshDir();
  recordDeployed(d, 'foo', ['Foo-1.0.jar']);
  recordDeployed(d, 'bar', ['Bar-2.0.jar']);
  const m = readManifest(d);
  assert.equal(m.files['Foo-1.0.jar'].id, 'foo');
  assert.equal(m.files['Bar-2.0.jar'].id, 'bar');
});

test('manifest: 同一 id 重新部署时清掉它不再产出的旧文件记录', () => {
  const d = freshDir();
  recordDeployed(d, 'foo', ['Foo-1.0.jar']);
  recordDeployed(d, 'foo', ['Foo-1.1.jar']); // 版本升级
  const m = readManifest(d);
  assert.equal(m.files['Foo-1.0.jar'], undefined, '旧版本记录应被移除');
  assert.ok(m.files['Foo-1.1.jar']);
});

test('prune: 只挑出清单里记录过、且当前配置不再产出的文件', () => {
  const d = freshDir();
  recordDeployed(d, 'foo', ['Foo-1.0.jar']);
  recordDeployed(d, 'bar', ['Bar-2.0.jar']);
  // 手工放的 jar 不在清单里
  fs.writeFileSync(path.join(d, 'HandPlaced.jar'), 'x');

  const candidates = findPruneCandidates(d, new Set(['Foo-1.0.jar']), new Set(['foo']));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].rel, 'Bar-2.0.jar');
  assert.match(candidates[0].reason, /已从配置里删除/);
});

test('prune: 手工放入的 jar 永远不会成为候选', () => {
  const d = freshDir();
  fs.writeFileSync(path.join(d, 'HandPlaced.jar'), 'x');
  fs.writeFileSync(path.join(d, 'ViaVersion.jar'), 'x');
  recordDeployed(d, 'foo', ['Foo-1.0.jar']);

  const candidates = findPruneCandidates(d, new Set(['Foo-1.0.jar']), new Set(['foo']));
  assert.equal(candidates.length, 0, '清单为空或文件未被记录 → 不该删');
});

test('prune: 同 id 的旧版本也算残留', () => {
  const d = freshDir();
  recordDeployed(d, 'foo', ['Foo-1.0.jar']);
  // 现在配置产出 1.1，但清单里还留着 1.0（模拟历史遗留）
  const candidates = findPruneCandidates(d, new Set(['Foo-1.1.jar']), new Set(['foo']));
  assert.equal(candidates.length, 1);
  assert.match(candidates[0].reason, /旧版本/);
});

test('manifest: 损坏的清单退化为空，不炸', () => {
  const d = freshDir();
  fs.writeFileSync(path.join(d, '.mcsdev-manifest.json'), '{ not json');
  const m = readManifest(d);
  assert.deepEqual(m.files, {});
});

test('manifest: version 不对也退化为空', () => {
  const d = freshDir();
  writeManifest(d, { version: 1, files: {} });
  const p = path.join(d, '.mcsdev-manifest.json');
  fs.writeFileSync(p, JSON.stringify({ version: 99, files: { 'a.jar': { id: 'x', at: '' } } }));
  const m = readManifest(d);
  assert.deepEqual(m.files, {});
});
