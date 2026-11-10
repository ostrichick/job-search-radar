import fs from 'node:fs/promises';

export const ADDRESS_CACHE_FILE = 'config/address-coordinates.json';

export function addressCacheKey(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function addressQuery(value) {
  return addressCacheKey(value)
    .replace(/,\s*(?:\d+층|\d+호|\d+-\d+호|지하\s*\d+층).*$/u, '')
    .replace(/\s*\.\s*$/, '')
    .trim();
}

export async function loadAddressCache(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveAddressCache(file, cache) {
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b, 'ko')));
  await fs.writeFile(file, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

function addressParts(value) {
  const clean = addressQuery(value);
  const city = clean.match(/([가-힣]+(?:시|군))/)?.[1] || '';
  const district = clean.match(/([가-힣]+구)/)?.[1] || '';
  const road = clean.match(/([가-힣A-Za-z0-9]+(?:대로|로|길)\s*\d+(?:-\d+)?)/)?.[1] || '';
  const neighborhood = clean.match(/([가-힣0-9]+(?:동|읍|면|리)\s*\d+(?:-\d+)?)/)?.[1] || '';
  return { clean, city, district, road, neighborhood };
}

let lastGeocodeRequestAt = 0;
async function nominatimSearch(params, { fetchImpl, timeoutMs }) {
  const waitMs = 1100 - (Date.now() - lastGeocodeRequestAt);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastGeocodeRequestAt = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ ...params, format: 'jsonv2', limit: '1', countrycodes: 'kr', addressdetails: '1' }).toString();
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'ko',
      'User-Agent': 'job-search-radar/1.0 (personal job dashboard; address geocoding cache)'
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data[0] : null;
}

export async function geocodeAddress(address, { fetchImpl = fetch, timeoutMs = 15000, now = new Date().toISOString() } = {}) {
  const { clean, city, district, road, neighborhood } = addressParts(address);
  if (!clean) return null;
  const variants = [];
  if (road) {
    variants.push({ street: road, ...(city ? { city } : {}), ...(district ? { county: district } : {}), country: 'South Korea' });
  } else if (neighborhood) {
    variants.push({ street: neighborhood, ...(city ? { city } : {}), ...(district ? { county: district } : {}), country: 'South Korea' });
  }
  const withoutProvince = clean.replace(/^(?:전북특별자치도|전라북도|전북)\s*/, '').replace(/\s*,\s*.*$/, '');
  if (withoutProvince && withoutProvince !== clean) variants.push({ q: withoutProvince });
  variants.push({ q: clean.replace(/\s*,\s*.*$/, '') });
  let result = null;
  for (const variant of variants) {
    result = await nominatimSearch(variant, { fetchImpl, timeoutMs });
    if (result) break;
  }
  const lat = Number(result?.lat);
  const lon = Number(result?.lon);
  const countryCode = String(result?.address?.country_code || '').toLowerCase();
  if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < 33 || lat > 39 || lon < 124 || lon > 132 || (countryCode && countryCode !== 'kr')) return null;
  const type = String(result?.addresstype || result?.type || '').toLowerCase();
  const precision = result?.address?.house_number || ['house', 'building', 'apartments', 'residential'].includes(type)
    ? 'address'
    : result?.category === 'highway' || ['road', 'street', 'footway', 'pedestrian', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk', 'residential', 'service', 'living_street', 'motorway'].includes(type)
      ? 'road'
      : 'neighbourhood';
  return {
    lat, lon,
    displayName: String(result?.display_name || clean).slice(0, 300),
    precision,
    source: 'OpenStreetMap Nominatim address search',
    checkedAt: now
  };
}
