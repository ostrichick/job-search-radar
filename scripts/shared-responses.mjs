// Both collectors query the same public job APIs. In CI the main collector runs
// first and records each shared response (or its failure) under
// SHARED_RESPONSE_DIR; the Dubu collector then reuses it instead of calling the
// API again, so each source is queried once per refresh (Remotive asks for at
// most four refreshes a day). Without the variable, each collector fetches on its own.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const SHARED_SOURCE_URLS = Object.freeze({
  remotive: 'https://remotive.com/api/remote-jobs?limit=500',
  jobicy: 'https://jobicy.com/api/v2/remote-jobs?count=200',
  remoteok: 'https://remoteok.com/api',
  arbeitnow: 'https://www.arbeitnow.com/api/job-board-api?page=1'
});
const shared = new Set(Object.values(SHARED_SOURCE_URLS));
const maxAgeMs = 60 * 60 * 1000;

function fileFor(url, dir) {
  return path.join(dir, `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.json`);
}

export async function saveSharedResponse(url, outcome, dir = process.env.SHARED_RESPONSE_DIR) {
  if (!dir || !shared.has(url)) return;
  await fs.mkdir(dir, { recursive: true });
  const record = outcome.error
    ? { url, savedAt: new Date().toISOString(), error: String(outcome.error?.message ?? outcome.error).slice(0, 200) }
    : { url, savedAt: new Date().toISOString(), body: outcome.body };
  await fs.writeFile(fileFor(url, dir), JSON.stringify(record));
}

// Returns null when this URL was not shared (fetch it yourself), otherwise
// { body } or { error }. Records from another run are ignored.
export async function loadSharedResponse(url, dir = process.env.SHARED_RESPONSE_DIR, now = Date.now()) {
  if (!dir || !shared.has(url)) return null;
  let record;
  try { record = JSON.parse(await fs.readFile(fileFor(url, dir), 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  if (record?.url !== url || !(now - Date.parse(record.savedAt) <= maxAgeMs)) return null;
  return record.error ? { error: record.error } : { body: record.body };
}
