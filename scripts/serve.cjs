const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.env.SITE_BUILD_DIR || path.join(__dirname, '../build'));
const base = process.env.SITE_BASE_PATH || '';
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

http
  .createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (base && pathname === base) {
      response.writeHead(302, { Location: `${base}/` }).end();
      return;
    }
    if (base && !pathname.startsWith(`${base}/`)) {
      response.writeHead(404).end();
      return;
    }
    const relative = pathname.slice(base.length).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(data);
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}${base}/`));
