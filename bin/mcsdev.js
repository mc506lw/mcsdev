#!/usr/bin/env node
/**
 * mcsdev —— 名称占位包
 *
 * 当前版本（0.0.1）不包含任何功能，仅用于在 npm 上保留 "mcsdev" 这个名字。
 * 真正的 CLI 正在开发中，首个功能版本发布时会原地替换本包（包名不变）。
 * 设计与进展见仓库内 DESIGN.md 与 README.md。
 */
'use strict';

const pkg = require('../package.json');

console.log('mcsdev v' + pkg.version + '（名称占位包）');
console.log('');
console.log('本包目前仅用于保留 npm 包名，CLI 正在开发中。');
console.log('');
console.log('mcsdev 是什么：终端里的插件开发者测试服环境。');
console.log('  一条命令完成「构建产物 → 选定实例 → 启动/重启 → 日志回流」，');
console.log('  内置 JDK 管理（mcsdev java）与可复用的 Paper / Folia 测试实例。');
console.log('');
console.log('更多信息请查看包内 README.md / DESIGN.md。');
