// 本地桩服务器：模拟 PaperMC API v2（用于本机无法连接 papermc.io 时的端到端冒烟测试）
// 用法：node test-stub.js <port>
const http = require('http');
const crypto = require('crypto');

const port = parseInt(process.argv[2] || '18765', 10);

// 假 server.jar 内容（不是合法 zip —— 用于验证"启动即失败"的错误处理路径）
const fakeJar = Buffer.from('mcsdev smoke test: this is NOT a valid jar file\n');
const sha256 = crypto.createHash('sha256').update(fakeJar).digest('hex');

const routes = (pathname) => {
  const p = pathname;
  if (p === '/v2/projects/paper') {
    return { project_id: 'paper', project_name: 'Paper', version_groups: ['1.20'], versions: ['1.20.1'] };
  }
  if (p === '/v2/projects/folia') {
    return { project_id: 'folia', project_name: 'Folia', version_groups: ['1.20'], versions: ['1.20.1'] };
  }
  const latest = p.match(/^\/v2\/projects\/(paper|folia)\/versions\/([^/]+)\/builds\/latest$/);
  if (latest) {
    return {
      project_id: latest[1],
      project_name: latest[1] === 'paper' ? 'Paper' : 'Folia',
      version: latest[2],
      build: 99,
      downloads: { application: { name: `${latest[1]}-${latest[2]}-99.jar`, sha256 } },
    };
  }
  const dl = p.match(/^\/v2\/projects\/(paper|folia)\/versions\/([^/]+)\/builds\/(\d+)\/downloads\/(.+)$/);
  if (dl) {
    return { __raw: fakeJar, __type: 'application/octet-stream', __name: dl[4] };
  }
  return null;
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const hit = routes(url.pathname);
    if (!hit) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    if (hit.__raw) {
      res.writeHead(200, { 'content-type': hit.__type, 'content-length': hit.__raw.length });
      res.end(hit.__raw);
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(hit));
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`stub PaperMC API listening on http://127.0.0.1:${port}`);
  });