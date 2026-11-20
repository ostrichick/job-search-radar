import { evaluateProfileFit } from './profile-fit.js';

const blockedListingStatuses = new Set(['stale', 'source_error', 'archived_missing', 'talent_pool', 'expired']);

export function hasRoleFitEvidence(job, policyVersion = 3) {
  if (job?.roleFitBasis === 'public_institution') {
    return job.roleFitEvidence !== false && ((job.matchedKeywords || []).length > 0
      || Boolean(job.category && job.category !== '기타'));
  }
  if (job?.roleFitEvidence === true) return true;
  if (job?.roleFitEvidence === false) return false;
  return Number(policyVersion || 0) < 3;
}

export function isDefaultRecommendation(job, policyVersion = 3, options = {}) {
  const recommendationCandidate = job?.recommendationEligible !== false
    && hasRoleFitEvidence(job, policyVersion)
    && Number(job?.score || 0) >= 20
    && ['korea', 'worldwide'].includes(job?.eligibilityCode)
    && (job?.requirementsStatus || 'clear') !== 'hard_check'
    && !blockedListingStatuses.has(job?.listingStatus);
  if (!recommendationCandidate) return false;
  if (Number(policyVersion || 0) < 5) return true;
  const fitStatus = options.fitStatus || evaluateProfileFit(job, options).status;
  return fitStatus !== 'fail';
}
