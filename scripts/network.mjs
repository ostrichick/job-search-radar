import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

const context = new AsyncLocalStorage();
export const defaultNetworkOptions = Object.freeze({ requestTimeoutMs: 15000, sourceTimeoutMs: 60000, concurrency: 3, hostConcurrency: 2 });
export const apiNetworkOptions = Object.freeze({ requestTimeoutMs: 8000, sourceTimeoutMs: 20000, totalTimeoutMs: 25000, concurrency: 3, hostConcurrency: 2 });

export function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function timeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Collection time budget exceeded', 'TimeoutError')), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}
async function acquire(host, state, signal) {
  let pool = state.hosts.get(host);
  if (!pool) { pool = { active: 0, queue: [] }; state.hosts.set(host, pool); }
  if (pool.active >= state.options.hostConcurrency) {
    await new Promise((resolve, reject) => {
      const entry = { resolve: () => { signal.removeEventListener('abort', abort); resolve(); } };
      const abort = () => { pool.queue = pool.queue.filter((v) => v !== entry); reject(signal.reason); };
      pool.queue.push(entry);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  } else pool.active++;
  return () => { const next = pool.queue.shift(); if (next) next.resolve(); else pool.active--; };
}
async function fetchBody(url, options, format) {
  const current = context.getStore();
  const budget = timeout(current?.options.requestTimeoutMs ?? defaultNetworkOptions.requestTimeoutMs);
  const signal = AbortSignal.any([budget.signal, ...(current ? [current.signal] : []), ...(options.signal ? [options.signal] : [])]);
  let release;
  try {
    signal.throwIfAborted();
    if (current) release = await acquire(new URL(url).host, current, signal);
    signal.throwIfAborted();
    const { charset, ...fetchOptions } = options;
    const response = await abortable(fetch(url, {
      ...fetchOptions, signal,
      headers: { 'User-Agent': `DigitalNomadJobDashboard/${format === 'json' ? '0.1' : '0.2'}`, Accept: format === 'json' ? 'application/json' : 'text/html,application/rss+xml,application/xml,text/xml,*/*', ...(options.headers || {}) }
    }), signal);
    if (!response.ok) {
      // Do not put query strings (including government API keys) in diagnostics.
      const error = new Error(`${response.status} ${response.statusText} - ${new URL(url).origin}${new URL(url).pathname}`);
      error.status = response.status; throw error;
    }
    return await abortable(format === 'json' ? response.json() : charset ? response.arrayBuffer().then((body) => new TextDecoder(charset).decode(body)) : response.text(), signal);
  } finally { release?.(); budget.clear(); }
}
export const fetchJson = (url, options = {}) => fetchBody(url, options, 'json');
export const fetchText = (url, options = {}) => fetchBody(url, options, 'text');

// Collect concurrently but expose results in declaration order. A timed-out task
// cannot contribute late results, even if a faulty adapter ignores cancellation.
export async function runSources(sources, networkOptions = {}) {
  const options = { ...defaultNetworkOptions, ...networkOptions };
  for (const key of ['requestTimeoutMs', 'sourceTimeoutMs', 'concurrency', 'hostConcurrency']) {
    if (!Number.isInteger(options[key]) || options[key] < 1) throw new Error(`Invalid network option: ${key}`);
  }
  const total = options.totalTimeoutMs ? timeout(options.totalTimeoutMs) : new AbortController();
  const hosts = new Map(), results = new Array(sources.length);
  let cursor = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(options.concurrency, sources.length) }, async () => {
      while (cursor < sources.length) {
        const index = cursor++, [, collector] = sources[index], started = performance.now();
        const budget = timeout(options.sourceTimeoutMs), signal = AbortSignal.any([total.signal, budget.signal]);
        try {
          signal.throwIfAborted();
          const result = await context.run({ options, hosts, signal }, () => abortable(Promise.resolve().then(collector), signal));
          signal.throwIfAborted();
          results[index] = { result, durationMs: Math.round(performance.now() - started), timedOut: false };
        } catch (error) {
          results[index] = { error, durationMs: Math.round(performance.now() - started), timedOut: error?.name === 'TimeoutError' || signal.aborted };
        } finally { budget.clear(); }
      }
    }));
  } finally { total.clear?.(); }
  return results;
}
