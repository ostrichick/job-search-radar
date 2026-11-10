import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADDRESS_CACHE_FILE, addressCacheKey, geocodeAddress, loadAddressCache, saveAddressCache } from './address-geocoder.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const feedPath = path.resolve(arg('--feed', path.join(root, 'public/jobs.json')));
const cachePath = path.resolve(arg('--cache', path.join(root, ADDRESS_CACHE_FILE)));
const limit = Number(arg('--limit', '0')) || 0;
const delayMs = Number(arg('--delay', '1100'));
const retryAfterDays = 30;

const feed = JSON.parse(await fs.readFile(feedPath, 'utf8'));
const cache = await loadAddressCache(cachePath);
const addresses = [...new Set((feed.jobs || [])
  .filter((job) => job.workAddress && job.domesticRegion && job.workplaceMode !== 'remote')
  .map((job) => addressCacheKey(job.workAddress))
  .filter(Boolean))];
const now = new Date().toISOString();
const pending = addresses.filter((address) => {
  const cached = cache[address];
  if (!cached) return true;
  if (cached.failed) {
    const checked = Date.parse(cached.checkedAt);
    return !Number.isFinite(checked) || Date.now() - checked > retryAfterDays * 86400000;
  }
  return !Number.isFinite(cached.lat) || !Number.isFinite(cached.lon);
}).slice(0, limit || undefined);

console.log(`addresses=${addresses.length} pending=${pending.length} cache=${cachePath}`);
for (const [index, address] of pending.entries()) {
  try {
    const result = await geocodeAddress(address, { now });
    cache[address] = result || { failed: true, checkedAt: now };
    console.log(`${index + 1}/${pending.length} ${result ? result.precision : 'not-found'} ${address}`);
  } catch (error) {
    cache[address] = { failed: true, checkedAt: now };
    console.log(`${index + 1}/${pending.length} error ${address} (${error.message})`);
  }
  if ((index + 1) % 10 === 0 || index === pending.length - 1) await saveAddressCache(cachePath, cache);
  if (delayMs && index < pending.length - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
}
console.log(`saved ${pending.length} checked addresses`);
