import { test, expect } from '@playwright/test';
// Hidden-state sync link: a URL fragment carries one profile's hidden list.
// The receiving device previews the difference and replaces its own list only
// after an explicit confirmation.

const JOBS = ['job:alpha', 'job:beta', 'job:gamma'];

function job(id, title) {
  const now = '2026-10-04T06:00:00.000Z';
  return {
    id, source: 'RWS TrainAI', title, company: 'RWS', location: 'South Korea',
    remote: true, type: 'Freelance', salary: '$10/시급', url: `https://example.com/job/${id}`,
    postedAt: '2026-10-03T00:00:00.000Z', description: 'Evaluate Korean AI data.',
    tags: ['Korean', 'AI'], category: 'AI 평가·데이터',
    eligibility: '한국에서 지원 가능', eligibilityCode: 'korea', eligibilityBasis: 'location',
    eligibilityReason: '원격 근무지가 한국으로 표시됨: South Korea',
    salaryInfo: { raw: '$10/hour', display: '$10/시급', currency: 'USD', min: 10, max: 10, period: 'hour', confidence: 'parsed' },
    sourceKind: 'official_ats', sourceCoverage: 'current_catalog', sourceEvidenceRefreshability: 'direct_api',
    sourceQualityTier: 'strong', sourceReliabilityState: 'reliable', sourceRecentSuccessRate: 1,
    recommendationEligible: true, roleFitEvidence: true, roleFitBasis: 'keyword_match',
    sourceTrustLabel: '공식 채용', sourceOfficiality: 'official', sourceSummary: '공식 ATS에서 수집했습니다.',
    sourceEvidence: [{ type: 'official_source', label: '공식 채용', url: 'https://example.com/source' }],
    sourceReviewAt: '2026-10-04', paymentStatus: 'caution', paymentLabel: '지급 이력 주의',
    paymentEvidenceState: 'caution_repeated', paymentEvidenceLabel: '반복 신호', paymentConfidence: 'moderate',
    paymentSummary: '지급 조건에 반복 신호가 있습니다.', paymentEvidenceFreshness: 'fresh',
    paymentEvidenceCheckedAt: '2026-10-04', paymentEvidenceNextReviewAt: '2027-01-30T00:00:00.000Z',
    paymentSignals: [{ type: 'review_aggregate', direction: 'caution', recurrence: 'repeated', checkedAt: '2026-10-04', latestSourceAt: '2026-10-02', freshness: 'fresh', maxAgeDays: 120, expiresAt: '2027-01-30T00:00:00.000Z', label: '지급 신호', url: 'https://example.com/reviews' }],
    listingStatus: 'verified_open', listingLabel: '모집 확인됨', listingBasis: 'official_feed',
    listingVerification: 'direct_open', listingReason: '공식 ATS에서 모집 중으로 확인',
    listingCheckedAt: now, listingEvidence: [{ type: 'official_listing', label: '모집 확인', url: `https://example.com/job/${id}`, checkedAt: now }],
    verifiedAt: now, contentFingerprint: `fixture-${id}`, firstSeenAt: '2026-10-01T06:00:00.000Z',
    lastSeenAt: now, lastVerifiedAt: now, lastChangeKind: 'verified_unchanged', lastChangeAt: now,
    lastChangedFields: [], verificationHistory: [{ at: now, event: 'verified_unchanged', fromStatus: 'verified_open', toStatus: 'verified_open', reason: '변경 없음' }],
    stale: false, score: 90, marketScopes: ['overseas_remote'], marketSegment: 'overseas_remote',
    matchedKeywords: ['korean', 'ai data'], fitReasons: ['위치 키워드 일치'], fitWarnings: [], fitWarning: '',
    requirementChecks: [], requirementsStatus: 'clear', requirementsLabel: '추가 확인 필요 없음',
    applyValueReasons: ['공식 ATS 확인', '원격'], decisionUnknowns: [], legacyIds: [`raw:${id}`],
    sources: ['RWS TrainAI'], alternateUrls: [], duplicateCount: 1
  };
}

function feed(jobs) {
  return {
    updatedAt: '2026-10-04T06:00:00.000Z',
    domesticProvinceOptions: ['전북특별자치도', '서울특별시'],
    locationReference: {
      id: 'kr-jeonbuk-jeonju', label: '전북특별자치도 전주시', province: '전북특별자치도',
      city: '전주시', district: '', neighborhood: '', lat: 35.84434, lon: 127.1736277,
      precision: 'city', coordinateSource: 'OpenStreetMap Nominatim', distanceMethod: 'haversine_straight_line'
    },
    recommendationPolicyVersion: 5,
    sourceStatus: [{ source: 'RWS TrainAI', ok: true, count: jobs.length, qualityTier: 'strong', kept: jobs.length, recommended: jobs.length }],
    sourceMetrics: {
      'RWS TrainAI': {
        source: 'RWS TrainAI', kind: 'official_ats', officiality: 'official', coverage: 'current_catalog',
        evidenceRefreshability: 'direct_api', qualityTier: 'strong', reliabilityState: 'reliable',
        recentSuccessRate: 1, matchedCount: jobs.length, keptCount: jobs.length, recommendedCount: jobs.length
      }
    },
    jobs
  };
}

const DEFAULT_JOBS = [job('job:alpha', 'Alpha Korean AI'), job('job:beta', 'Beta Korean AI'), job('job:gamma', 'Gamma Korean AI')];

async function useFeed(page, data = feed(DEFAULT_JOBS)) {
  await page.route('**/jobs.json*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
}

async function storedHidden(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('job-search-radar', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction('state').objectStore('state').get('current');
        req.onsuccess = () => resolve(JSON.parse(req.result?.values?.jobHidden || '[]').sort());
        req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  });
}

async function openFilterToHidden(page) {
  await page.selectOption('#statusFilter', 'hidden');
}

async function makeSyncLink(page) {
  if (await page.locator('#syncSharePanel').isHidden()) await page.locator('#toggleSyncShare').click();
  await page.locator('#createSyncLinkBtn').click();
  const field = page.locator('#syncLinkField');
  // Encoding is async (CompressionStream), so wait for the finished link.
  await expect(field).toBeVisible();
  await expect.poll(async () => (await field.inputValue()).length).toBeGreaterThan(0);
  return field.inputValue();
}
// Directly encode a payload the way the app does, so tests can inject
// malformed or cross-profile links without duplicating the codec.
async function encodeFor(page, payload) {
  return page.evaluate(async (value) => {
    const json = new TextEncoder().encode(JSON.stringify(value));
    const toB64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (typeof CompressionStream !== 'function') return `s1r.${toB64(json)}`;
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return `s1z.${toB64(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
  }, payload);
}

test.afterEach(async ({ page }) => {
  await page.close();
});

test('PC에서 숨긴 공고를 링크로 다른 기기에 전달한다', async ({ browser }) => {
  const sender = await browser.newContext();
  const senderPage = await sender.newPage();
  await useFeed(senderPage);
  await senderPage.goto('/munseong/');
  await expect(senderPage.locator('.job-card')).toHaveCount(3);

  await senderPage.locator('.job-card').filter({ hasText: 'Alpha' }).locator('.dismiss').click();
  await expect.poll(() => storedHidden(senderPage)).toEqual(['job:alpha']);

  const link = await makeSyncLink(senderPage);
  expect(link).toContain('#sync=');

  const receiver = await browser.newContext();
  const receiverPage = await receiver.newPage();
  await useFeed(receiverPage);
  await receiverPage.goto(link);

  const panel = receiverPage.locator('#syncPanel');
  await expect(panel).toBeVisible();
  await expect(receiverPage.locator('#syncPanelDetail')).toContainText('새로 숨김 1개');
  await expect(receiverPage.locator('#syncPanelDetail')).toContainText('다시 표시 0개');

  await receiverPage.locator('#syncPanelApply').click();
  await expect(panel).toBeHidden();
  await expect.poll(() => storedHidden(receiverPage)).toEqual(['job:alpha']);

  // The fragment is stripped from the address bar after decoding.
  expect(receiverPage.url()).not.toContain('#sync=');

  await sender.close();
  await receiver.close();
});

test('적용 후 이 기기에서만 숨긴 공고는 다시 표시된다', async ({ browser }) => {
  const sender = await browser.newContext();
  const senderPage = await sender.newPage();
  await useFeed(senderPage);
  await senderPage.goto('/munseong/');
  await senderPage.locator('.job-card').filter({ hasText: 'Alpha' }).locator('.dismiss').click();
  const link = await makeSyncLink(senderPage);

  const receiver = await browser.newContext();
  const receiverPage = await receiver.newPage();
  await useFeed(receiverPage);
  await receiverPage.addInitScript(() => localStorage.setItem('jobHidden', JSON.stringify(['job:gamma'])));
  await receiverPage.goto(link);

  // gamma is hidden only on the receiving device and must be listed as restored.
  await expect(receiverPage.locator('#syncPanelDetail')).toContainText('다시 표시 1개');
  await receiverPage.locator('#syncPanelApply').click();
  await expect.poll(() => storedHidden(receiverPage)).toEqual(['job:alpha']);

  await sender.close();
  await receiver.close();
});

test('같은 링크를 다시 열면 확인 버튼이 비활성화되고 상태가 바뀌지 않는다', async ({ browser }) => {
  const sender = await browser.newContext();
  const senderPage = await sender.newPage();
  await useFeed(senderPage);
  await senderPage.goto('/munseong/');
  await senderPage.locator('.job-card').filter({ hasText: 'Alpha' }).locator('.dismiss').click();
  const link = await makeSyncLink(senderPage);

  const receiver = await browser.newContext();
  const receiverPage = await receiver.newPage();
  await useFeed(receiverPage);
  await receiverPage.goto(link);
  await receiverPage.locator('#syncPanelApply').click();
  await expect.poll(() => storedHidden(receiverPage)).toEqual(['job:alpha']);

  await receiverPage.goto(link);
  await expect(receiverPage.locator('#syncPanelTitle')).toContainText('이미 이 기기와 같은 상태입니다');
  await expect(receiverPage.locator('#syncPanelApply')).toBeDisabled();
  expect(await storedHidden(receiverPage)).toEqual(['job:alpha']);

  await sender.close();
  await receiver.close();
});

test('적용 후 복원한 공고는 같은 링크 재적용으로 다시 숨지 않는다', async ({ browser }) => {
  const sender = await browser.newContext();
  const senderPage = await sender.newPage();
  await useFeed(senderPage);
  await senderPage.goto('/munseong/');
  await senderPage.locator('.job-card').filter({ hasText: 'Alpha' }).locator('.dismiss').click();
  const link = await makeSyncLink(senderPage);

  const receiver = await browser.newContext();
  const receiverPage = await receiver.newPage();
  await useFeed(receiverPage);
  await receiverPage.goto(link);
  await receiverPage.locator('#syncPanelApply').click();
  await expect.poll(() => storedHidden(receiverPage)).toEqual(['job:alpha']);

  // Restore on the receiving device, then reopen the same link.
  await openFilterToHidden(receiverPage);
  await receiverPage.locator('.job-card').filter({ hasText: 'Alpha' }).locator('.dismiss').click();
  await expect.poll(() => storedHidden(receiverPage)).toEqual([]);

  await receiverPage.goto(link);
  // Reopening re-offers the transfer; it must not auto-apply.
  await expect.poll(() => storedHidden(receiverPage)).toEqual([]);
  await expect(receiverPage.locator('#syncPanelDetail')).toContainText('새로 숨김 1개');

  await sender.close();
  await receiver.close();
});

test('보낸 기기에서 복원한 공고는 새 링크로 다시 표시된다', async ({ browser }) => {
  const sender = await browser.newContext();
  const senderPage = await sender.newPage();
  await useFeed(senderPage);
  await senderPage.goto('/munseong/');
  await senderPage.locator('.job-card').filter({ hasText: 'Alpha' }).locator('.dismiss').click();
  const firstLink = await makeSyncLink(senderPage);

  const receiver = await browser.newContext();
  const receiverPage = await receiver.newPage();
  await useFeed(receiverPage);
  await receiverPage.goto(firstLink);
  await receiverPage.locator('#syncPanelApply').click();
  await expect.poll(() => storedHidden(receiverPage)).toEqual(['job:alpha']);

  // Sender restores alpha and produces a new link with an empty hidden list.
  await openFilterToHidden(senderPage);
  await senderPage.locator('.job-card').filter({ hasText: 'Alpha' }).locator('.dismiss').click();
  await expect.poll(() => storedHidden(senderPage)).toEqual([]);
  const secondLink = await makeSyncLink(senderPage);

  await receiverPage.goto(secondLink);
  await expect(receiverPage.locator('#syncPanelDetail')).toContainText('다시 표시 1개');
  await receiverPage.locator('#syncPanelApply').click();
  await expect.poll(() => storedHidden(receiverPage)).toEqual([]);

  await sender.close();
  await receiver.close();
});

test('취소하면 아무것도 저장되지 않고 fragment는 제거된다', async ({ browser }) => {
  const sender = await browser.newContext();
  const senderPage = await sender.newPage();
  await useFeed(senderPage);
  await senderPage.goto('/munseong/');
  await senderPage.locator('.job-card').filter({ hasText: 'Alpha' }).locator('.dismiss').click();
  const link = await makeSyncLink(senderPage);

  const receiver = await browser.newContext();
  const receiverPage = await receiver.newPage();
  await useFeed(receiverPage);
  await receiverPage.goto(link);
  await expect(receiverPage.locator('#syncPanel')).toBeVisible();
  await receiverPage.locator('#syncPanelCancel').click();
  await expect(receiverPage.locator('#syncPanel')).toBeHidden();
  expect(await storedHidden(receiverPage)).toEqual([]);
  expect(receiverPage.url()).not.toContain('#sync=');

  await sender.close();
  await receiver.close();
});

test('다른 프로필의 링크는 거부하고 상태를 바꾸지 않는다', async ({ browser }) => {
  const receiver = await browser.newContext();
  const receiverPage = await receiver.newPage();
  await useFeed(receiverPage);
  await receiverPage.goto('/munseong/');
  const encoded = await encodeFor(receiverPage, {
    schema: 'job-search-radar-hidden-sync', version: 1, profile: 'nicole',
    exportedAt: '2026-11-28T00:00:00.000Z', hiddenIds: ['job:alpha'], hiddenReasons: {}
  });

  await receiverPage.goto(`/munseong/#sync=${encoded}`);
  await expect(receiverPage.locator('#toast')).toBeVisible();
  await expect(receiverPage.locator('#toast')).toContainText('다른 프로필의 링크');
  await expect(receiverPage.locator('#syncPanel')).toBeHidden();
  expect(await storedHidden(receiverPage)).toEqual([]);

  await receiver.close();
});

test('손상된 링크는 거부하고 상태를 바꾸지 않는다', async ({ browser }) => {
  const cases = [
    ['알 수 없는 접두사', 'zzz.bm90LWEtcGF5bG9hZA'],
    ['잘못된 base64', 's1r.!!!not-base64!!!'],
    ['잘못된 JSON', 's1r.bm90LWpzb24'],
    ['알 수 없는 스키마', await (async () => null)()]
  ];
  for (const [label, fragment] of cases) {
    if (!fragment) continue;
    const context = await browser.newContext();
    const page = await context.newPage();
    await useFeed(page);
    await page.goto(`/munseong/#sync=${fragment}`);
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#syncPanel')).toBeHidden();
    expect(await storedHidden(page)).toEqual([]);
    await context.close();
  }

  // Wrong schema/version via a valid transport.
  const context = await browser.newContext();
  const page = await context.newPage();
  await useFeed(page);
  await page.goto('/munseong/');
  const encoded = await encodeFor(page, {
    schema: 'wrong-schema', version: 1, profile: 'munseong',
    hiddenIds: ['job:alpha'], hiddenReasons: {}
  });
  await page.goto(`/munseong/#sync=${encoded}`);
  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('#syncPanel')).toBeHidden();
  expect(await storedHidden(page)).toEqual([]);
  await context.close();
});

test('사유 변경만 있는 링크는 적용 버튼이 활성화된다', async ({ browser }) => {
  const receiver = await browser.newContext();
  const receiverPage = await receiver.newPage();
  await useFeed(receiverPage);
  await receiverPage.addInitScript(() => {
    localStorage.setItem('jobHidden', JSON.stringify(['job:alpha']));
    localStorage.setItem('jobHiddenReasons', JSON.stringify({ 'job:alpha': 'location' }));
  });
  await receiverPage.goto('/munseong/');
  const encoded = await encodeFor(receiverPage, {
    schema: 'job-search-radar-hidden-sync', version: 1, profile: 'munseong',
    exportedAt: '2026-11-28T00:00:00.000Z', hiddenIds: ['job:alpha'], hiddenReasons: { 'job:alpha': 'pay' }
  });
  await receiverPage.goto(`/munseong/#sync=${encoded}`);

  await expect(receiverPage.locator('#syncPanelDetail')).toContainText('새로 숨김 0개');
  await expect(receiverPage.locator('#syncPanelDetail')).toContainText('다시 표시 0개');
  await expect(receiverPage.locator('#syncPanelDetail')).toContainText('사유 변경 1개');
  await expect(receiverPage.locator('#syncPanelApply')).toBeEnabled();

  await receiver.close();
});

test('두 탭이 서로 다른 링크를 적용하면 나중에 적용한 링크의 목록이 남는다', async ({ browser }) => {
  const context = await browser.newContext();
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await useFeed(tabA);
  await useFeed(tabB);
  await tabA.goto('/munseong/');
  await tabB.goto('/munseong/');
  await expect(tabA.locator('.job-card')).toHaveCount(3);

  const linkFor = (ids) => encodeFor(tabA, {
    schema: 'job-search-radar-hidden-sync', version: 1, profile: 'munseong',
    exportedAt: '2026-11-28T00:00:00.000Z', hiddenIds: ids, hiddenReasons: {}
  });
  const linkA = await linkFor(['job:alpha']);
  const linkB = await linkFor(['job:beta']);

  await tabA.goto(`/munseong/#sync=${linkA}`);
  await tabA.locator('#syncPanelApply').click();
  await expect.poll(() => storedHidden(tabA)).toEqual(['job:alpha']);

  await tabB.goto(`/munseong/#sync=${linkB}`);
  await tabB.locator('#syncPanelApply').click();
  await expect.poll(() => storedHidden(tabB)).toEqual(['job:beta']);

  // Replacement, not a union: the later link wins outright.
  await expect.poll(() => storedHidden(tabA)).toEqual(['job:beta']);
  await context.close();
});

test('URL 길이 상한을 넘는 링크는 만들지 않고 안내한다', async ({ page }) => {
  await useFeed(page);
  // High-entropy ids survive compression, so the encoded URL really does grow
  // past 8000 characters while the payload stays under the 64 KiB JSON cap.
  await page.addInitScript(() => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const many = Array.from({ length: 60 }, (_, index) => {
      const bytes = crypto.getRandomValues(new Uint8Array(190));
      let suffix = '';
      for (const byte of bytes) suffix += alphabet[byte % 36];
      return `job:${index}-${suffix}`;
    });
    localStorage.setItem('jobHidden', JSON.stringify(many));
  });
  await page.goto('/munseong/');
  await page.locator('#toggleSyncShare').click();
  await page.locator('#createSyncLinkBtn').click();
  await expect(page.locator('#toast')).toContainText('링크가 너무 깁니다');
  // The panel stays open so the user sees the message next to the button.
  await expect(page.locator('#syncLinkField')).toHaveValue('');
});

test('64 KiB를 넘는 압축 해제 결과는 거부한다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/munseong/');
  const encoded = await page.evaluate(async () => {
    const payload = {
      schema: 'job-search-radar-hidden-sync', version: 1, profile: 'munseong',
      exportedAt: '2026-11-28T00:00:00.000Z',
      hiddenIds: Array.from({ length: 400 }, (_, index) => `job:${index}-${'y'.repeat(180)}`),
      hiddenReasons: {}
    };
    const json = new TextEncoder().encode(JSON.stringify(payload));
    const toB64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return `s1z.${toB64(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
  });
  await page.goto(`/munseong/#sync=${encoded}`);
  await expect(page.locator('#syncPanel')).toBeHidden();
  expect(await storedHidden(page)).toEqual([]);
});

test('수신 측도 8,000자를 넘는 링크를 디코딩 없이 거부하고 fragment를 지운다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/munseong/');
  const oversized = `s1r.${'A'.repeat(8100)}`;
  await page.goto(`/munseong/#sync=${oversized}`);
  await expect(page.locator('#toast')).toContainText('너무 깁니다');
  await expect(page.locator('#syncPanel')).toBeHidden();
  expect(page.url()).not.toContain('#sync=');
  expect(await storedHidden(page)).toEqual([]);
});

test('숨긴 공고가 500개를 넘으면 잘라내지 않고 링크 생성을 거부한다', async ({ page }) => {
  await useFeed(page);
  await page.addInitScript(() => {
    const many = Array.from({ length: 501 }, (_, index) => `job:hidden-${index}`);
    localStorage.setItem('jobHidden', JSON.stringify(many));
  });
  await page.goto('/munseong/');
  await page.locator('#toggleSyncShare').click();
  await page.locator('#createSyncLinkBtn').click();
  await expect(page.locator('#toast')).toContainText('숨긴 공고가 너무 많아');
  await expect(page.locator('#syncLinkField')).toBeHidden();
});

test('링크로 표현할 수 없는 ID가 있으면 일부만 담은 링크를 만들지 않는다', async ({ page }) => {
  await useFeed(page);
  await page.addInitScript(() => {
    localStorage.setItem('jobHidden', JSON.stringify(['job:alpha', `job:${'z'.repeat(220)}`]));
  });
  await page.goto('/munseong/');
  await page.locator('#toggleSyncShare').click();
  await page.locator('#createSyncLinkBtn').click();
  await expect(page.locator('#toast')).toContainText('링크를 만들지 못했습니다');
  await expect(page.locator('#syncLinkField')).toBeHidden();
});

test('경로·쿼리까지 포함한 전체 URL이 상한을 넘으면 수신 측이 거부한다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/munseong/');
  // Body alone stays under 8,000 chars; the long path pushes the full URL over.
  const encoded = await encodeFor(page, {
    schema: 'job-search-radar-hidden-sync', version: 1, profile: 'munseong',
    exportedAt: '2026-11-28T00:00:00.000Z', hiddenIds: ['job:alpha'], hiddenReasons: {}
  });
  expect(encoded.length).toBeLessThan(8000);
  // A long query string keeps the page valid while pushing the full URL over.
  await page.goto(`/munseong/?padding=${'p'.repeat(8100)}#sync=${encoded}`);
  await expect(page.locator('#toast')).toContainText('너무 깁니다');
  await expect(page.locator('#syncPanel')).toBeHidden();
  expect(page.url()).not.toContain('#sync=');
});

test('같은 탭에서 나중에 연 링크가 먼저 디코딩된 링크를 덮어쓴다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/munseong/');
  const linkFor = (ids) => encodeFor(page, {
    schema: 'job-search-radar-hidden-sync', version: 1, profile: 'munseong',
    exportedAt: '2026-11-28T00:00:00.000Z', hiddenIds: ids, hiddenReasons: {}
  });
  const older = await linkFor(['job:alpha']);
  const newer = await linkFor(['job:beta']);

  await page.goto(`/munseong/#sync=${older}`);
  await expect(page.locator('#syncPanelDetail')).toContainText('새로 숨김 1개');
  await page.goto(`/munseong/#sync=${newer}`);
  // The newer link wins regardless of which decode finished first.
  await expect(page.locator('#syncPanelApply')).toBeEnabled();
  await page.locator('#syncPanelApply').click();
  await expect.poll(() => storedHidden(page)).toEqual(['job:beta']);
});


test('적용 직전 다른 탭이 목록을 바꾸면 안내와 함께 다시 확인할 수 있다', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await useFeed(page);
  await page.goto('/munseong/');
  const encoded = await encodeFor(page, {
    schema: 'job-search-radar-hidden-sync', version: 1, profile: 'munseong',
    exportedAt: '2026-11-28T00:00:00.000Z', hiddenIds: ['job:alpha'], hiddenReasons: {}
  });
  await page.goto(`/munseong/#sync=${encoded}`);
  await expect(page.locator('#syncPanelApply')).toBeEnabled();

  // Another tab makes a real edit (hide beta) between preview and confirmation.
  const other = await context.newPage();
  await useFeed(other);
  await other.goto('/munseong/');
  await expect(other.locator('.job-card')).toHaveCount(3);
  await other.locator('.job-card').filter({ hasText: 'Beta' }).locator('.dismiss').click();
  await expect.poll(() => storedHidden(other)).toEqual(['job:beta']);

  await page.locator('#syncPanelApply').click();

  // The conflict is shown, and the confirm button becomes usable again so the
  // user can re-confirm against the new baseline.
  await expect(page.locator('#syncPanelDetail')).toContainText('다른 탭에서 숨김 목록이 바뀌었습니다');
  await expect(page.locator('#syncPanelApply')).toBeEnabled();
  expect(await storedHidden(page)).toEqual(['job:beta']);

  // Confirming again applies the link's list.
  await page.locator('#syncPanelApply').click();
  await expect.poll(() => storedHidden(page)).toEqual(['job:alpha']);
  await context.close();
});
