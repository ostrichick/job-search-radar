import fs from 'node:fs/promises';
import { collectJobs } from './collect-jobs.mjs';
import { apiNetworkOptions } from './network.mjs';

let baseline;
export async function collectApiJobs() {
  // Load lazily so a packaging/read failure is handled by the request's error
  // path, and share the same baseline and flight across both API entrypoints.
  baseline ??= fs.readFile(new URL('../docs/jobs.json', import.meta.url), 'utf8').then(JSON.parse).catch((error) => { baseline = null; throw error; });
  const previousFeed = await baseline;
  return collectJobs({ includeManual: false, persist: false, previousFeed, networkOptions: apiNetworkOptions });
}
