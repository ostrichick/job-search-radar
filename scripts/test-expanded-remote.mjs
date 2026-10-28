import assert from 'node:assert/strict';
import { expandedRemoteCandidates } from './expanded-remote-sources.mjs';
import { normalizeExpandedRemote } from '../profiles/dubu/scripts/collect.mjs';

const now = Date.parse('2026-10-28T06:00:00Z');
const h = {
  title: 'Korean AI Response Reviewer', companyName: 'Test Agency',
  locationRestrictions: ['South Korea'],
  applicationLink: 'https://himalayas.app/companies/test/jobs/korean-ai-reviewer?utm_source=api',
  pubDate: now / 1000 - 1000, expiryDate: now / 1000 + 86400,
  employmentType: 'Contractor', description: '<p>Korean annotation and review.</p>',
  minSalary: 30, maxSalary: 50, salaryPeriod: 'hourly', currency: 'USD'
};
const himalayas = expandedRemoteCandidates('himalayas', { jobs: [
  h,
  { ...h, title: 'Spanish Marketing', locationRestrictions: ['United States'] },
  { ...h, title: 'Internal Job Posting', applicationLink: 'https://himalayas.app/companies/test/jobs/internal' },
  { ...h, expiryDate: now / 1000 - 1, applicationLink: 'https://himalayas.app/companies/test/jobs/expired' }
] }, now);
assert.equal(himalayas.length, 1);
assert.equal(himalayas[0].salary, 'USD 30–50 hourly');
assert.equal(himalayas[0].listingExpiresAt, '2026-10-29T06:00:00.000Z');
const nicole = normalizeExpandedRemote('himalayas', { jobs: [{
  ...h, title: 'Spanish Social Media Content Creator',
  description: 'Create Spanish TikTok and Instagram content for a global audience.'
}] }, { now: new Date(now).toISOString(), homeCountry: 'KR', languages: { es: 'native', en: 'unverified', ko: 'beginner' } });
assert.equal(nicole.length, 1);
assert.equal(nicole[0].url, h.applicationLink, 'Himalayas Apply link must remain unchanged');
const remote = {
  id: 'test1', title: 'Korean AI Data Labeler', url: 'https://remotejobs.org/remote-jobs/korean-labeler',
  company: { name: 'Test Agency' }, description: 'Review Korean AI annotations',
  posted_at: '2026-10-27T10:00:00Z',
  applicant_location_requirements: {
    status: 'known', allowed_countries: ['KR'], work_arrangement: 'remote', worldwide_permission_verified: false
  },
  location_normalization: {
    status: 'known', scope: 'restricted', allowed_countries: ['KR'], allowed_subdivisions: [], allowed_regions: []
  }
};
const output = expandedRemoteCandidates('remotejobs', { data: [
  remote,
  { ...remote, id: 'us-only', applicant_location_requirements: { status: 'known', allowed_countries: ['US'], work_arrangement: 'remote' } },
  { ...remote, id: 'conflict', applicant_location_requirements: { status: 'known', allowed_countries: [], worldwide_permission_verified: true, work_arrangement: 'remote' },
    location_normalization: { status: 'known', scope: 'restricted', allowed_countries: [], allowed_subdivisions: ['US-NY'] } },
  { ...remote, id: 'ireland', title: 'Engineer - Ireland',
    applicant_location_requirements: { status: 'known', allowed_countries: [], worldwide_permission_verified: true, work_arrangement: 'remote' },
    location_normalization: { status: 'unknown' } },
  { ...remote, id: 'onsite', applicant_location_requirements: { status: 'known', allowed_countries: ['KR'], work_arrangement: 'onsite' } }
] }, now);
assert.equal(output.length, 1);
assert.equal(output[0].source, 'RemoteJobs.org');
assert.throws(() => expandedRemoteCandidates('himalayas', {}), /jobs array missing/);
console.log('Expanded remote sources eligibility, expiry and attribution tests passed');
