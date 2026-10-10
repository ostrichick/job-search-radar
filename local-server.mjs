import { atomicWriteJson, withFileLock } from './scripts/file-storage.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectJobs } from './scripts/collect-jobs.mjs';

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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      const body = await fs.readFile(path.join(root, 'data/jobs.json'), 'utf8');
      return send(res, 200, body);
    }

    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      const result = await collectJobs();
      return send(res, 200, JSON.stringify(result));
    }

    if (req.method === 'POST' && url.pathname === '/api/manual-jobs') {
      const input = JSON.parse(await readBody(req));
      const manualPath = path.join(root, 'data/manual-jobs.json');
      const job = {
        source: String(input.source || '직접 추가').slice(0, 40),
        title: String(input.title || '').trim(),
        company: String(input.company || '').trim(),
        location: String(input.location || '').trim(),
        remote: Boolean(input.remote),
        type: String(input.type || ''),
        salary: String(input.salary || ''),
        url: String(input.url || '').trim(),
        postedAt: input.postedAt || new Date().toISOString(),
        description: String(input.description || '').trim(),
        tags: Array.isArray(input.tags) ? input.tags : []
      };
      if (!job.title || !job.url) return send(res, 400, JSON.stringify({ error: 'title과 url은 필수입니다.' }));
      if (!['http:', 'https:'].includes(new URL(job.url).protocol)) return send(res, 400, JSON.stringify({ error: 'HTTP/HTTPS URL required' }));
      await withFileLock(manualPath, async () => {
        let current;
        try { current = JSON.parse(await fs.readFile(manualPath, 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; current = []; }
        if (!Array.isArray(current)) throw new Error('manual-jobs must be an array');
        current.push(job);
        await atomicWriteJson(manualPath, current);
      });
      const result = await collectJobs();
      return send(res, 201, JSON.stringify({ ok: true, jobs: result.jobs.length }));
    }

    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
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
