export const maximumFeedAgeMs = 24 * 60 * 60 * 1000;
export function feedHealth(updatedAt, now = Date.now()) {
  const timestamp = typeof updatedAt === 'string' ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(timestamp)) return { ok: false, message: 'Feed update time is unknown. Check original listings before applying.' };
  if (timestamp > now + 5 * 60000) return { ok: false, message: 'Feed update time is in the future. Check collection status.' };
  if (now - timestamp > maximumFeedAgeMs) return { ok: false, message: 'The feed has not been updated for over 24 hours. Scheduled collection may have failed; this is the last available list.' };
  return { ok: true, message: '' };
}
