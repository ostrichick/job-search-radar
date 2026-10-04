const workflowRank = { '': 0, planned: 1, applied: 2 };

export function mergeWorkflowState(current = '', incoming = '') {
  const currentRank = workflowRank[current] ?? 0;
  const incomingRank = workflowRank[incoming] ?? 0;
  return incomingRank > currentRank ? incoming : current;
}

export function reconcileNewIds(newIds, reviewedIds, currentIds) {
  const reviewed = reviewedIds instanceof Set ? reviewedIds : new Set(reviewedIds || []);
  const current = currentIds instanceof Set ? currentIds : new Set(currentIds || []);
  return new Set([...(newIds || [])].filter((id) => current.has(id) && !reviewed.has(id)));
}
