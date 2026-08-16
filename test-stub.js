// 本地桩服务器：模拟 PaperMC Fill API v3（本机连不上 fill.papermc.io 时的离线冒烟测试）
// 用法：node test-stub.js <port>   （默认 18765）
// 然后：$env:MCSDEV_PAPER_BASE = "http://127.0.0.1:<port>" 指向本桩
const http = require('http');
const crypto = require('crypto');

const port = parseInt(process.argv[2] || '18765', 10);
const base = process.env.MCSDEV_PAPER_BASE || `http://127.0.0.1:${port}`;

// 假 server.jar 内容（不是合法 zip —— 用于验证"启动即失败"的错误处理路径）
const fakeJar = Buffer.from('mcsdev smoke test: this is NOT a valid jar file\n');
const sha256 = crypto.createHash('sha256').update(fakeJar).digest('hex');

const versions = ['1.21.6', '1.21.5', '1.21.4', '1.21.3', '1.20.1'];
const ver = (id) => ({
  version: {
    id,
    java: { version: { minimum: 21 }, flags: { recommended: ['-XX:+UseG1GC'] } },
    support: { status: 'SUPPORTED', end: null },
  },
  builds: [100, 99],
});
const latestBuild = (core, v) => ({
  id: 100,
  channel: 'STABLE',
  time: '2025-06-30T09:49:31Z',
  commits: [],
  downloads: {
    'server:default': {
      name: `${core}-${v}-100.jar`,
      size: fakeJar.length,
      url: `${base}/dl/${core}-${v}-100.jar`,
      checksums: { sha256 },
    },
  },
});

http
  .createServer((req, res) => {
    const p = new URL(req.url, 'http://localhost').pathname;
    const json = (obj) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (p === '/v3/projects/paper/versions') return json(versions.map(ver));
    if (p === '/v3/projects/folia/versions') return json(versions.map(ver));
    const latest = p.match(/^\/v3\/projects\/(paper|folia)\/versions\/([^/]+)\/builds\/latest$/);
    if (latest) return json(latestBuild(latest[1], latest[2]));
    const dl = p.match(/^\/dl\/(.+)$/);
    if (dl) {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': fakeJar.length });
      res.end(fakeJar);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found', message: 'no such path' }));
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`stub Fill API v3 listening on http://127.0.0.1:${port} (MCSDEV_PAPER_BASE=${base})`);
  });