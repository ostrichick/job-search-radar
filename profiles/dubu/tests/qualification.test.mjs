import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excludeQualificationReason } from '../scripts/rules.mjs';
import { normalizeAtsJob } from '../scripts/collect-korea-ats.mjs';
import { parseWork24Xml } from '../scripts/collect-korea.mjs';
import { mergeHistoricalFeed } from '../scripts/collect.mjs';

test('preferred and explicitly optional Korean do not become mandatory qualifications', () => {
  const job = { title: 'Spanish Content Marketer' };
  for (const description of ['Native Spanish. Fluent Korean is a plus, but not required.', 'Preferred qualifications: business-level Korean.', '한국어 능통 우대, 필수 아님']) {
    assert.equal(excludeQualificationReason({ ...job, description }), null, description);
  }
  for (const description of ['Fluent Korean required.', 'Business-level Korean is mandatory.', 'Fluent Korean preferred. However Korean C1 required.', 'English is optional, fluent Korean required.']) {
    assert.equal(excludeQualificationReason({ ...job, description }), 'advanced_korean_required', description);
  }
});

test('Korean-language specialist roles are excluded, not all Korea market jobs', () => {
  assert.equal(excludeQualificationReason({ title: '[Studio Support Div.] Korean Localization Specialist (1년 이상 / 계약직)' }), 'korean_language_professional');
  assert.equal(excludeQualificationReason({ title: 'Korean Translator / Linguist' }), 'korean_language_professional');
  assert.equal(excludeQualificationReason({ title: '한국어 번역 담당자' }), 'korean_language_professional');
  assert.equal(excludeQualificationReason({ title: '한일 통번역 담당자' }), 'unsupported_language_or_sales_role');
  assert.equal(excludeQualificationReason({ title: 'Sales Manager, Advertising Solutions' }), 'unsupported_language_or_sales_role');
  assert.equal(excludeQualificationReason({ title: 'Spanish marketing assistant for Korea', description: 'Marketing to Korean consumers.' }), null);
  assert.equal(excludeQualificationReason({ title: 'International marketing assistant', description: 'Fluent Korean required.' }), 'advanced_korean_required');
  assert.equal(excludeQualificationReason({ title: '해외 마케팅 담당자', description: '한국어 비즈니스 회화 수준 필수' }), 'advanced_korean_required');
});

test('explicit five-plus professional years excluded without treating company history as tenure', () => {
  assert.equal(excludeQualificationReason({ title: '[Corporate Brand Div.] Brand Planning Manager (5년 이상)' }), 'experience_5plus_required');
  assert.equal(excludeQualificationReason({ title: 'PR Manager (10년 이상)' }), 'experience_5plus_required');
  assert.equal(excludeQualificationReason({ title: 'Senior Marketing Manager', description: 'Requirements: 5+ years of B2B marketing experience.' }), 'experience_5plus_required');
  assert.equal(excludeQualificationReason({ title: 'Marketing Manager', description: 'Must have at least 10 years of relevant experience.' }), 'experience_5plus_required');
  assert.equal(excludeQualificationReason({ title: 'Marketing Assistant', description: 'Our firm has 10 years of experience in the industry.' }), null);
  assert.equal(excludeQualificationReason({ title: 'Marketing Assistant (1년 이상)', description: '1 year of experience preferred.' }), null);
  assert.equal(excludeQualificationReason({ title: 'Spanish marketing junior', description: 'Since 2015 our company has supported 5,000 brands.' }), null);
});

test('official Korean ATS rejects Korean professional and 5+/10+ roles', () => {
  const board = { board: 'krafton', company: 'KRAFTON', source: 'KRAFTON' };
  const job = (id, title) => ({ id, title, location: { name: 'Seoul' },
    absolute_url: `https://boards.greenhouse.io/krafton/jobs/${id}`, content: '<p>Marketing</p>' });
  assert.equal(normalizeAtsJob(job(1, 'Korean Localization Specialist'), board), null);
  assert.equal(normalizeAtsJob(job(2, 'Brand Planning Manager (5년 이상)'), board), null);
  assert.equal(normalizeAtsJob(job(3, 'PR Manager (10년 이상)'), board), null);
  assert.ok(normalizeAtsJob(job(4, 'Korea Marketing Coordinator (1년 이상)'), board));
});

test('previously seen excluded offline listings do not reappear as historical', () => {
  const now = '2026-10-19T02:20:00Z';
  const baseline = { updatedAt: '2026-10-17T02:20:00Z', jobs: [
    { id: 'bad-korean', title: 'Korean Localization Specialist', source: 'KRAFTON', sourceKind: 'official_ats', company: 'KRAFTON', market: 'offline', location: 'Seoul', url: 'https://boards.greenhouse.io/krafton/jobs/1', lastSeenAt: now },
    { id: 'bad-5yr', title: 'Brand Planning Manager (5년 이상)', source: 'KRAFTON', sourceKind: 'official_ats', company: 'KRAFTON', market: 'offline', location: 'Seoul', url: 'https://boards.greenhouse.io/krafton/jobs/2', lastSeenAt: now },
    { id: 'good-1yr', title: 'Korea Marketing Coordinator (1년 이상)', source: 'KRAFTON', sourceKind: 'official_ats', company: 'KRAFTON', market: 'offline', location: 'Seoul', url: 'https://boards.greenhouse.io/krafton/jobs/3', lastSeenAt: now },
  ] };
  const incoming = { updatedAt: now, jobs: [], sourceStatus: [{ source: 'KRAFTON', status: 'ok' }] };
  const next = mergeHistoricalFeed(incoming, baseline);
  assert.deepEqual(next.jobs.map((x) => x.id), ['good-1yr']);
  assert.equal(next.jobs[0].collectionState, 'not_seen');
});

test('Work24 title parser excludes known seniority even without description', () => {
  const xml = `<wantedRoot><wanted><wantedAuthNo>W0001</wantedAuthNo><title>브랜드 마케팅 경력 10년 이상</title><region>전북 전주시</region><wantedInfoUrl>https://www.work24.go.kr/work/1</wantedInfoUrl></wanted><wanted><wantedAuthNo>W0002</wantedAuthNo><title>해외 마케팅 신입</title><region>전북 전주시</region><wantedInfoUrl>https://www.work24.go.kr/work/2</wantedInfoUrl></wanted></wantedRoot>`;
  const jobs = parseWork24Xml(xml);
  assert.deepEqual(jobs.map((x) => x.id), ['work24:W0002']);
});
