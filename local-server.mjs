import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectJobs } from './scripts/collect-jobs.mjs';
import { run as collectNicole } from './profiles/dubu/scripts/collect.mjs';
import { isTrustedLocalRequest } from './scripts/local-origin.mjs';
import { singleFlight, withFileLock } from './scripts/file-storage.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 4317);
const nicoleBaseline = path.join(root, 'profiles/dubu/public/jobs.json');
// Keep locally refreshed Nicole leads out of the CI-maintained tracked baseline.
const nicoleLocalFeed = path.join(root, 'data/nicole-jobs.json');

async function readNicoleFeed() {
  try {
    const contents = await fs.readFile(nicoleLocalFeed, 'utf8');
    const feed = JSON.parse(contents);
    if (!feed || typeof feed !== 'object' || !Array.isArray(feed.jobs) || !Array.isArray(feed.sourceStatus)) {
      throw new SyntaxError('Invalid local Nicole feed');
    }
    return contents;
  }
  catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    return fs.readFile(nicoleBaseline, 'utf8');
  }
}

function refreshNicole() {
  return singleFlight('local-nicole-refresh', () => withFileLock(nicoleLocalFeed, () =>
    collectNicole({ root: path.join(root, 'profiles/dubu'), outputPath: nicoleLocalFeed,
      fallbackPath: nicoleBaseline })));
}

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
      if (url.searchParams.get('profile') === 'nicole') {
        const result = await refreshNicole();
        if (!result.written) return send(res, 503, JSON.stringify({ error: result.message }));
        return send(res, 200, JSON.stringify(result.feed));
      }
      if (url.searchParams.has('profile') && url.searchParams.get('profile') !== 'munseong') {
        return send(res, 400, JSON.stringify({ error: 'Unknown profile' }));
      }
      const result = await collectJobs();
      return send(res, 200, JSON.stringify(result));
    }

    // CI publishes this path; local refreshes use a separate ignored file.
    if (req.method === 'GET' && url.pathname === '/feeds/dubu.json') {
      return send(res, 200, await readNicoleFeed());
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

async function refreshNicoleIfStale() {
  let stale = true;
  try {
    const current = JSON.parse(await readNicoleFeed());
    stale = !current.updatedAt || Date.now() - (Date.parse(current.updatedAt) || 0) > 6 * 60 * 60 * 1000;
  } catch { /* Missing or invalid Nicole feed requires a refresh. */ }
  if (stale) {
    const result = await refreshNicole();
    if (!result.written) console.warn('Nicole refresh kept the last good feed:', result.message);
  }
}

refreshIfStale().catch((error) => console.error('Initial refresh failed:', error.message));
refreshNicoleIfStale().catch((error) => console.error('Initial Nicole refresh failed:', error.message));
setInterval(() => {
  collectJobs().catch((error) => console.error('Scheduled refresh failed:', error.message));
  refreshNicole().catch((error) => console.error('Scheduled Nicole refresh failed:', error.message));
}, 6 * 60 * 60 * 1000).unref();
