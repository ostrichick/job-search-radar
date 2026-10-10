const blockedListingStatuses = new Set(['stale', 'source_error', 'archived_missing', 'talent_pool', 'expired']);

export function hasRoleFitEvidence(job, policyVersion = 3) {
  if (job?.roleFitEvidence === true) return true;
  if (job?.roleFitEvidence === false) return false;
  return Number(policyVersion || 0) < 3;
}

export function isDefaultRecommendation(job, policyVersion = 3) {
  return job?.recommendationEligible !== false
    && hasRoleFitEvidence(job, policyVersion)
    && Number(job?.score || 0) >= 20
    && ['korea', 'worldwide'].includes(job?.eligibilityCode)
    && (job?.requirementsStatus || 'clear') !== 'hard_check'
    && !blockedListingStatuses.has(job?.listingStatus);
}
