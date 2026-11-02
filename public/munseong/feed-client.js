// Network policy shared by the two profile screens. Presentation and stored state live in app.js.
export function createFeedClient({ profile, hostname, normalizeFeed, fetchImpl = fetch }) {
  const staticPages = hostname.endsWith('.github.io');

  async function request(url, options = {}) {
    const response = await fetchImpl(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${response.status}`);
    return normalizeFeed(await response.json());
  }

  async function fetchFeed() {
    if (profile.id === 'nicole') return request(`${profile.feedUrl}?ts=${Date.now()}`);
    const candidates = staticPages ? [`${profile.feedUrl}?ts=${Date.now()}`]
      : ['/api/jobs', `${profile.feedUrl}?ts=${Date.now()}`];
    let lastError;
    for (const url of candidates) {
      try { return await request(url); }
      catch (error) { lastError = error; }
    }
    throw new Error(`공고 데이터를 불러오지 못했습니다 (${lastError?.message || 'unknown'})`);
  }

  async function refreshFeed() {
    if (staticPages) return { data: await fetchFeed() };
    try {
      const url = profile.id === 'nicole' ? '/api/refresh?profile=nicole' : '/api/refresh';
      return { data: await request(url, { method: 'POST' }) };
    } catch (collectionError) {
      return { data: await fetchFeed(), collectionError };
    }
  }

  return { fetchFeed, refreshFeed };
}
