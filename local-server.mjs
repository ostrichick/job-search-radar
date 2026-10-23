import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectJobs } from './scripts/collect-jobs.mjs';
import { isTrustedLocalRequest } from './scripts/local-origin.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 4317);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      const body = await fs.readFile(path.join(root, 'data/jobs.json'), 'utf8');
      return send(res, 200, body);
    }

    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      if (!isTrustedLocalRequest(req.headers, port)) return send(res, 403, JSON.stringify({ error: 'Forbidden origin' }));
      const result = await collectJobs();
      return send(res, 200, JSON.stringify(result));
    }

    // CI publishes the Dubu feed at /feeds/dubu.json; locally serve the tracked baseline.
    if (req.method === 'GET' && url.pathname === '/feeds/dubu.json') {
      return send(res, 200, await fs.readFile(path.join(root, 'profiles/dubu/public/jobs.json'), 'utf8'));
    }
    if (['/nicole', '/munseong', '/dubu'].includes(url.pathname)) { res.writeHead(301, { Location: `${url.pathname}/` }); return res.end(); }
    const requested = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const filePath = path.normalize(path.join(publicDir, requested));
    if (!filePath.startsWith(publicDir + path.sep)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    if (error?.code === 'ENOENT') return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    send(res, 500, JSON.stringify({ error: String(error.message ?? error) }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Digital Nomad Job Dashboard: http://127.0.0.1:${port}`);
});

async function refreshIfStale() {
  let stale = true;
  try {
    const current = JSON.parse(await fs.readFile(path.join(root, 'data/jobs.json'), 'utf8'));
    stale = !current.updatedAt || Date.now() - (Date.parse(current.updatedAt) || 0) > 6 * 60 * 60 * 1000;
  } catch { /* Missing or unreadable feed requires one refresh. */ }
  if (stale) await collectJobs();
}

refreshIfStale().catch((error) => console.error('Initial refresh failed:', error.message));
setInterval(() => collectJobs().catch((error) => console.error('Scheduled refresh failed:', error.message)), 6 * 60 * 60 * 1000).unref();
