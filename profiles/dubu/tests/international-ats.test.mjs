import test from 'node:test';
import assert from 'node:assert/strict';
import { collectInternationalAtsJobs, normalizeLeverJob, normalizeAshbyJob } from '../scripts/collect-international-ats.mjs';

const now = '2026-10-19T06:00:00Z';
const lever = { source: 'ShopBack', slug: 'shopback-2' };
const ashby = { source: 'Sahara AI', slug: 'Sahara' };
const shopback = (extra = {}) => ({
  id: 'green-1', text: 'Social Media & Community Coordinator (Contract)',
  hostedUrl: 'https://jobs.lever.co/shopback-2/green-1',
  createdAt: '2026-09-22T10:00:00Z', workplaceType: 'onsite',
  categories: { location: 'Seoul, South Korea', department: 'Marketing', commitment: 'Contract' },
  descriptionPlain: 'Help organize social media campaigns for English speaking customers. Junior position.',
  ...extra,
});

test('public Lever employer job becomes Korea relocation lead, without making unverified eligibility claims', () => {
  const job = normalizeLeverJob(shopback(), lever, { now });
  assert.equal(job.market, 'offline');
  assert.equal(job.commuteClass, 'relocation');
  assert.equal(job.source, 'ShopBack (Official ATS)');
  assert.equal(job.category, 'marketing');
  assert.equal(job.sourceKind, 'official_ats');
  assert.ok(job.url.includes('jobs.lever.co'));
});

test('new employer feeds exclude overseas jobs, old jobs, five-plus experience and advanced Korean', () => {
  assert.equal(normalizeLeverJob(shopback({ categories: { location: 'Singapore', department: 'Marketing' } }), lever, { now }), null);
  assert.equal(normalizeLeverJob(shopback({ createdAt: '2020-01-01T00:00:00Z' }), lever, { now }), null);
  assert.equal(normalizeLeverJob(shopback({ createdAt: Date.parse('2025-10-01T00:00:00Z') }), lever, { now }), null);
  assert.equal(normalizeLeverJob(shopback({ text: 'Marketing Manager 10년 이상' }), lever, { now }), null);
  assert.equal(normalizeLeverJob(shopback({ descriptionPlain: 'Fluent Korean required for marketing role.' }), lever, { now }), null);
  assert.equal(normalizeLeverJob(shopback({ hostedUrl: 'https://attacker.invalid/jobs/x' }), lever, { now }), null);
  assert.equal(normalizeLeverJob(shopback({ text: '한일 통번역 담당자' }), lever, { now }), null);
  assert.equal(normalizeLeverJob(shopback({ text: 'Account Manager' }), lever, { now }), null);
});

test('public Ashby employer job with Seoul remote location stays online and Korean-unqualified roles excluded', () => {
  const candidate = {
    id: 'seoul-community', title: 'Community Manager', location: 'Seoul',
    workplaceType: 'Remote', isRemote: true, isListed: true,
    publishedAt: '2026-10-01T00:00:00Z',
    jobUrl: 'https://jobs.ashbyhq.com/Sahara/seoul-community',
    descriptionPlain: 'Operate online communities. Entry-level role with cross-border team.',
  };
  const job = normalizeAshbyJob(candidate, ashby, { now });
  assert.equal(job.market, 'online');
  assert.equal(job.location, 'Seoul, South Korea');
  assert.equal(normalizeAshbyJob({ ...candidate, descriptionPlain: 'Korean native-level required.' }, ashby, { now }), null);
  assert.equal(normalizeAshbyJob({ ...candidate, isListed: false }, ashby, { now }), null);
});

test('international official employer feeds record each publisher status and do not call restricted aggregators', async () => {
  const called = [];
  const { jobs, sourceStatus, successfulRequests } = await collectInternationalAtsJobs({
    now, fetchImpl: async (url) => {
      called.push(url);
      if (url.includes('/shopback-2?')) return { ok: true, json: async () => [shopback()] };
      if (url.includes('/Sahara')) return { ok: true, json: async () => ({ jobs: [] }) };
      throw new Error('fixture offline');
    },
  });
  assert.equal(jobs.length, 1);
  assert.equal(successfulRequests, 2);
  assert.equal(sourceStatus.length, 6);
  assert.equal(sourceStatus.find((s) => s.source === 'ShopBack').status, 'ok');
  assert.ok(called.every((url) => url.startsWith('https://api.lever.co/') || url.startsWith('https://api.ashbyhq.com/')));
});
