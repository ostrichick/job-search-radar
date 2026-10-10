// Incruit publicly advertises this RSS feed at https://people.incruit.com/rss/rss.asp.
// It is a bounded Jeonbuk-wide feed, not a complete Jeonju/Wanju search result.
const rssUrl = 'https://www.incruit.com/rss/job.asp?ct=3&ty=2&cd=22';

function tag(block, name) {
  const raw = String(block);
  const opening = '<' + name + '>';
  const closing = '</' + name + '>';
  const start = raw.indexOf(opening);
  const end = start < 0 ? -1 : raw.indexOf(closing, start + opening.length);
  if (end < 0) return '';
  return raw.slice(start + opening.length, end).trim()
    .replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function parseIncruitJeonbukRss(xml, now = Date.now()) {
  const raw = String(xml || '');
  if (!/^\s*<\?xml\b/i.test(raw) || !/<rss\b[^>]*version=["']2\.0["']/i.test(raw)
    || !/\[인크루트\]\s*채용정보\s*-\s*전북/.test(tag(raw, 'title'))) {
    throw new Error('Incruit RSS is not a recognized Jeonbuk feed');
  }
  const builtAt = Date.parse(tag(raw, 'lastBuildDate'));
  if (!Number.isFinite(builtAt) || builtAt > now + 3600000 || now - builtAt > 48 * 3600000) {
    throw new Error('Incruit RSS publication date is missing, future or stale');
  }
  const blocks = [...raw.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 20).map((item) => item[1]);
  if (!blocks.length) throw new Error('Incruit RSS contains no public job entries');
  const candidates = [];
  const seen = new Set();
  for (const block of blocks) {
    const url = tag(block, 'link');
    const link = /^https:\/\/job\.incruit\.com\/jobdb_info\/jobpost\.asp\?job=(\d+)$/.exec(url);
    const title = tag(block, 'title').replace(/^\[[^\]]{1,120}\]\s*/, '').trim();
    const company = tag(block, 'author');
    const description = tag(block, 'description');
    const postedAt = Date.parse(tag(block, 'pubDate'));
    const regionField = /▨\s*지역\s*:\s*([^<]*)/i.exec(description)?.[1] || '';
    const regions = regionField.split('|').map((part) => part.trim()).filter(Boolean);
    // Reject multi-location, whole-province, nationwide and remote claims.
    // We cannot infer a specific workplace from those entries without details.
    if (regions.length !== 1) continue;
    const region = /^(?:전북|전라북도|전북특별자치도)>(전주시(?:\s+(?:덕진구|완산구))?|완주군)$/.exec(regions[0]);
    if (!link || !region || !title || !company || !Number.isFinite(postedAt)
      || postedAt > now + 3600000 || /인재\s*pool|인재풀|재택|원격|전국/i.test(title)
      || seen.has(link[1])) continue;
    seen.add(link[1]);
    candidates.push({
      id: link[1], url, title, company, postedAt: new Date(postedAt).toISOString(),
      listLocation: '전북특별자치도 ' + region[1],
      evidence: 'public_rss_list'
    });
  }
  return { candidates, itemCount: blocks.length, publishedAt: new Date(builtAt).toISOString() };
}

export { rssUrl as incruitJeonbukRssUrl };
