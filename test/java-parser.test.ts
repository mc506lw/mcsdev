import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMajor, parseJavaProps } from '../src/java';

test('parseMajor: 1.8.0_202 → 8', () => {
  assert.equal(parseMajor('1.8.0_202'), 8);
});

test('parseMajor: 17.0.9 → 17', () => {
  assert.equal(parseMajor('17.0.9'), 17);
});

test('parseMajor: 21.0.1+12 → 21', () => {
  assert.equal(parseMajor('21.0.1+12'), 21);
});

test('parseMajor: 1.7.0 → 7', () => {
  assert.equal(parseMajor('1.7.0'), 7);
});

test('parseMajor: 非法版本 → null', () => {
  assert.equal(parseMajor('abc'), null);
  assert.equal(parseMajor('999.0'), null); // 主版本 ≥100 视为非法
});

const SAMPLE = `Property settings:
    java.home = C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.9.9-hotspot
    java.vendor = Eclipse Adoptium
    java.version = 17.0.9
    sun.arch.data.model = 64
    file.encoding = GBK
    native.encoding = GBK
OS settings:
    sun.jnu.encoding = GBK
`;

test('parseJavaProps: 解析完整属性', () => {
  const p = parseJavaProps(SAMPLE);
  assert.equal(p.version, '17.0.9');
  assert.equal(p.home, 'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.9.9-hotspot');
  assert.equal(p.vendor, 'Eclipse Adoptium');
  assert.equal(p.arch, 64);
  assert.equal(p.fileEncoding, 'GBK');
});

test('parseJavaProps: 兼容 "java version" 输出', () => {
  const p = parseJavaProps('java version "1.8.0_202" 2019-10-15\nJava(TM) SE Runtime Environment');
  assert.equal(p.version, '1.8.0_202');
});