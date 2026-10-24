// Local/LAN preview of Creator's Web Mobile build; no dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('build/web-mobile');
const port = Number(process.env.PORT || 8080);
if (!fs.existsSync(path.join(root, 'index.html'))) throw Error('请先在 Creator 构建 Web Mobile 到 build/web-mobile');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json',
  '.css':'text/css', '.wasm':'application/wasm', '.png':'image/png', '.bin':'application/octet-stream', '.svg':'image/svg+xml' };
http.createServer((req, res) => {
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`CatBox: http://localhost:${port} (手机同 Wi-Fi 使用本机局域网 IP:${port})`));
