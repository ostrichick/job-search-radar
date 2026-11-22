// Source coverage states are not interchangeable: an optional unconfigured
// source is not an outage, and a partially successful source is not healthy.
const informationalStatuses = new Set(['manual', 'disabled', 'not_configured', 'access_restricted']);
const failedStatuses = new Set(['error', 'failed']);

export function sourceHealthBuckets(sourceStatus = []) {
  const failed = [];
  const partial = [];
  const informational = [];
  for (const source of sourceStatus || []) {
    if (!source || typeof source !== 'object') continue;
    const status = typeof source.status === 'string' ? source.status : '';
    if (informationalStatuses.has(status)) {
      informational.push(source);
    } else if (failedStatuses.has(status) || (!status && source.ok === false)) {
      failed.push(source);
    } else if (status === 'partial' || (source.ok && (
      Number(source.searchFailureCount || 0) > 0
      || Number(source.rssListOnlyCount || 0) > 0
      || Boolean(source.detailCollapseSuspected)
      || Number(source.detailFailureCount || 0) > 0
      || Number(source.workplaceUnverifiedCount || 0) > 0
      || Number(source.accessRestrictedCount || 0) > 0
      || Number(source.listFallbackCount || 0) > 0
    ))) {
      partial.push(source);
    }
  }
  return { failed, partial, informational };
}
