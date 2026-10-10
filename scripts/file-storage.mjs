import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

export async function atomicWriteJson(target, value, { beforeRename } = {}) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const body = `${JSON.stringify(value, null, 2)}\n`;
    JSON.parse(body);
    const handle = await fs.open(temporary, 'wx');
    try { await handle.writeFile(body, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    JSON.parse(await fs.readFile(temporary, 'utf8'));
    await beforeRename?.();
    await fs.rename(temporary, target);
  } finally { await fs.rm(temporary, { force: true }); }
}

export async function withFileLock(target, task) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const lock = `${target}.lock`, token = randomUUID();
  let handle;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { handle = await fs.open(lock, 'wx'); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const busy = () => Object.assign(new Error(`수집 또는 저장이 이미 실행 중입니다: ${path.basename(target)}`), { code: 'collection_busy' });
      let owner;
      try { owner = JSON.parse(await fs.readFile(lock, 'utf8')); } catch { throw busy(); }
      if (!Number.isInteger(owner.pid) || owner.pid < 1 || owner.host !== os.hostname() || !owner.token) throw busy();
      try { process.kill(owner.pid, 0); throw busy(); }
      catch (probe) { if (probe.code !== 'ESRCH') throw busy(); }
      // Serialize reclamation as well: two reclaimers must never remove a new
      // live owner's lock after both observed the same dead PID.
      const reclaimPath = `${lock}.reclaim`;
      let reclaim;
      try { reclaim = await fs.open(reclaimPath, 'wx'); } catch { throw busy(); }
      try {
        if (await fs.readFile(lock, 'utf8') !== JSON.stringify(owner)) throw busy();
        try { process.kill(owner.pid, 0); throw busy(); }
        catch (probe) { if (probe.code !== 'ESRCH') throw busy(); }
        await fs.unlink(lock);
        try { handle = await fs.open(lock, 'wx'); } catch (retry) { if (retry.code === 'EEXIST') throw busy(); throw retry; }
        break;
      } finally { await reclaim.close(); await fs.unlink(reclaimPath); }
    }
  }
  if (!handle) throw new Error('Could not acquire file lock');
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), token }));
    await handle.close();
    return await task();
  } finally {
    await handle.close().catch(() => {});
    try { if (JSON.parse(await fs.readFile(lock, 'utf8')).token === token) await fs.unlink(lock); } catch { /* Preserve unknown ownership. */ }
  }
}

const running = new Map();
export function singleFlight(key, task) {
  if (running.has(key)) return running.get(key);
  const promise = Promise.resolve().then(task).finally(() => { if (running.get(key) === promise) running.delete(key); });
  running.set(key, promise);
  return promise;
}
