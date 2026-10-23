// Both routes run the same application. Only the person-specific inputs differ.
export const profiles = Object.freeze({
  munseong: {
    id: 'munseong', displayName: 'Munseong', language: 'ko',
    feedUrl: '../jobs.json', dbName: 'job-search-radar', theme: 'dark-lime',
    markets: { overseas_remote: '해외 / 원격근무', domestic: '국내' },
    features: { marketPulse: true, workflow: true, batch: true, backup: true }
  },
  nicole: {
    id: 'nicole', displayName: 'Nicole', language: 'en',
    feedUrl: '../feeds/dubu.json', dbName: 'job-search-radar-nicole', theme: 'light-green',
    markets: { overseas_remote: 'Online', domestic: 'In-person' },
    features: { marketPulse: true, workflow: true, batch: true, backup: true }
  }
});

export function getProfile(id) {
  return profiles[id] || profiles.munseong;
}
