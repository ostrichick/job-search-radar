// Hidden-state sync link: a self-contained URL fragment that carries one
// profile's hidden job ids and reasons. The fragment never reaches the server.
//
// Transport markers: `s1z.` = deflate-raw + base64url, `s1r.` = raw JSON +
// base64url (used when CompressionStream is unavailable). The body schema
// version is always 1.

export const SCHEMA = 'job-search-radar-hidden-sync';
export const VERSION = 1;
export const MAX_URL_LENGTH = 8000;
export const MAX_JSON_BYTES = 64 * 1024;
export const REASONS = ['not_relevant', 'location', 'requirements', 'pay', 'duplicate', 'other'];

export const MAX_HIDDEN_IDS = 500;
export const MAX_ENCODED_LENGTH = 30000;

const SAFE_ID = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200
  && !['__proto__', 'constructor', 'prototype'].includes(value);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function collect(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    // Abort as soon as the decompressed output passes the cap instead of
    // buffering an unbounded payload.
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new Error('sync-link: payload too large');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return merged;
}

export function normalizeHiddenState(hiddenIds, hiddenReasons) {
  const ids = [...new Set((hiddenIds || []).filter(SAFE_ID))];
  const allowed = new Set(ids);
  const reasons = {};
  for (const [id, reason] of Object.entries(hiddenReasons || {})) {
    if (!allowed.has(id) || !REASONS.includes(reason)) continue;
    reasons[id] = reason;
  }
  return { hiddenIds: ids, hiddenReasons: reasons };
}

export function buildHiddenPayload({ profile, hiddenIds, hiddenReasons, exportedAt = new Date().toISOString() }) {
  if (typeof profile !== 'string' || !profile) throw new Error('sync-link: profile required');
  // A replacement link must describe the whole list. Refuse instead of
  // silently dropping ids the sender still has hidden, because the receiver
  // would then un-hide them.
  const raw = hiddenIds || [];
  const distinct = new Set(raw);
  if (raw.length !== distinct.size) throw new Error('sync-link: duplicate hidden ids');
  for (const id of distinct) {
    if (!SAFE_ID(id)) throw new Error(`sync-link: unusable hidden id (${String(id).length} chars)`);
  }
  const state = normalizeHiddenState(raw, hiddenReasons);
  if (state.hiddenIds.length > MAX_HIDDEN_IDS) {
    throw new Error(`sync-link: too many hidden ids (${state.hiddenIds.length} > ${MAX_HIDDEN_IDS})`);
  }
  return {
    schema: SCHEMA,
    version: VERSION,
    profile,
    exportedAt,
    hiddenIds: state.hiddenIds,
    hiddenReasons: state.hiddenReasons
  };
}

export async function encodeHiddenPayload(payload) {
  const json = encoder.encode(JSON.stringify(payload));
  if (json.byteLength > MAX_JSON_BYTES) throw new Error('sync-link: payload too large');
  if (typeof CompressionStream !== 'function') return `s1r.${toBase64Url(json)}`;
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const compressed = await collect(stream, MAX_JSON_BYTES);
  return `s1z.${toBase64Url(compressed)}`;
}

export async function decodeHiddenPayload(text) {
  if (typeof text !== 'string' || !text) throw new Error('sync-link: empty payload');
  // Reject over-long input before allocating a base64 buffer. A 64 KiB JSON
  // body cannot exceed this many base64url characters.
  if (text.length > MAX_ENCODED_LENGTH) throw new Error('sync-link: payload too large');
  const separator = text.indexOf('.');
  if (separator < 0) throw new Error('sync-link: unknown payload format');
  const prefix = text.slice(0, separator);
  const body = text.slice(separator + 1);
  if (!body || !/^[A-Za-z0-9_-]+$/.test(body)) throw new Error('sync-link: invalid encoding');
  if (body.length > MAX_ENCODED_LENGTH) throw new Error('sync-link: payload too large');
  let bytes;
  try { bytes = fromBase64Url(body); } catch { throw new Error('sync-link: invalid encoding'); }
  if (prefix === 's1z') {
    if (typeof DecompressionStream !== 'function') throw new Error('sync-link: decompression unsupported');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = await collect(stream, MAX_JSON_BYTES);
  } else if (prefix !== 's1r') {
    throw new Error('sync-link: unknown payload format');
  }
  if (bytes.byteLength > MAX_JSON_BYTES) throw new Error('sync-link: payload too large');
  let parsed;
  try { parsed = JSON.parse(decoder.decode(bytes)); } catch { throw new Error('sync-link: invalid JSON'); }
  return validateHiddenPayload(parsed);
}

export function validateHiddenPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('sync-link: invalid payload');
  if (payload.schema !== SCHEMA) throw new Error('sync-link: wrong schema');
  if (payload.version !== VERSION) throw new Error('sync-link: unsupported version');
  if (typeof payload.profile !== 'string' || !payload.profile) throw new Error('sync-link: profile required');
  if (!Array.isArray(payload.hiddenIds) || !payload.hiddenIds.every(SAFE_ID)) throw new Error('sync-link: invalid hiddenIds');
  if (payload.hiddenIds.length > 500) throw new Error('sync-link: too many hidden ids');
  const reasons = payload.hiddenReasons;
  if (!reasons || typeof reasons !== 'object' || Array.isArray(reasons)) throw new Error('sync-link: invalid hiddenReasons');
  const allowed = new Set(payload.hiddenIds);
  for (const [id, reason] of Object.entries(reasons)) {
    if (!allowed.has(id)) throw new Error('sync-link: reason for unknown id');
    if (!REASONS.includes(reason)) throw new Error('sync-link: invalid reason');
  }
  return {
    schema: SCHEMA,
    version: VERSION,
    profile: payload.profile,
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt.slice(0, 40) : '',
    hiddenIds: payload.hiddenIds,
    hiddenReasons: reasons
  };
}

// URL construction and parsing. The payload lives in the fragment so it is
// never sent in a request line or stored in server logs.
export function syncUrlFor(base, encoded) {
  const url = new URL(base);
  url.hash = `sync=${encoded}`;
  return url.toString();
}

export function readSyncFragment(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw.startsWith('sync=')) return null;
  return raw.slice('sync='.length) || null;
}

export function fingerprintHidden(hiddenIds, hiddenReasons) {
  const ids = [...new Set(hiddenIds || [])].sort();
  const reasons = Object.entries(hiddenReasons || {})
    .filter(([id]) => ids.includes(id))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify({ ids, reasons });
}
