import { feedHealth } from '../public/feed-health.js';
import { pathToFileURL } from 'node:url';
export function validatePublishedFeed(feed, now = Date.now()) {
  if (!feed || !Array.isArray(feed.jobs) || !Array.isArray(feed.sourceStatus)) throw Error('Invalid published feed structure');
  const health = feedHealth(feed.updatedAt, now);
  if (!health.ok) throw Error(health.message);
  return { updatedAt: feed.updatedAt, jobs: feed.jobs.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = new URL(process.argv[2]);
  if (url.protocol !== 'https:') throw Error('Published feed must use HTTPS');
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`Published feed returned HTTP ${response.status}`);
  console.log(JSON.stringify(validatePublishedFeed(await response.json())));
}
