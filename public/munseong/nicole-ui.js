// Nicole-specific controls on the shared cards and shared workflow UI.
const normalize = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const platforms = [
  ['Upwork · Spanish', 'https://www.upwork.com/nx/search/jobs/?q=spanish%20translation'],
  ['Upwork · Marketing', 'https://www.upwork.com/nx/search/jobs/?q=digital%20marketing'],
  ['KOWORK', 'https://kowork.kr/en'], ['KOWORK · Spanish', 'https://kowork.kr/en?keyword=spanish'],
  ['K-WORK', 'https://k-work.or.kr/empmnInfo/empmn/list.do'],
  ['Hanultari', 'https://mcfamily.or.kr/en/jobs/opening'],
  ['JOBPLOY', 'https://www.jobploy.kr/en']
];

export function createNicoleUI({ state, storage, persist, mergeJobs, rerender }) {
  const $ = (id) => document.getElementById(id);
  const editor = (kind, id, label) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'button compact secondary-light';
    button.textContent = label;
    button.addEventListener('click', async () => {
      if (storage.readOnly) return;
      if (kind === 'jobs') state.hiddenIds.add(id);
      if (kind === 'companies') state.hiddenCompanies.add(normalize(id));
      if (kind === 'sources') state.hiddenSources.add(normalize(id));
      await persist(); rerender();
      $('nicoleHiddenManager')?.scrollIntoView({ block: 'nearest' });
    });
    return button;
  };
  function decorateCard(node, job) {
    const toolbar = node.querySelector('.mini-actions');
    if (!toolbar) return;
    if (job.company && !['Company not specified', '회사 미상'].includes(job.company)) toolbar.append(editor('companies', job.company, 'Hide company'));
    toolbar.append(editor('sources', job.source, 'Hide source'));
    const dates = node.querySelector('.collection-dates');
    if (dates) {
      const first = job.firstSeenAt?.slice(0, 10) || 'Not listed';
      const last = job.lastSeenAt?.slice(0, 10) || 'Not listed';
      const reviewed = job.researchReviewedAt?.slice(0, 10);
      dates.textContent = `Posted ${job.postedAt?.slice(0, 10) || 'Not listed'} · Added to Radar ${first} · Last collected ${last}` +
        (reviewed ? ` · Source last reviewed ${reviewed}` : '');
      if (job.collectionState === 'not_seen') dates.textContent += ' · Historical listing';
      if (job.collectionState === 'unverified') dates.textContent += ' · Collection unverified';
    }
    const meta = node.querySelector('.meta');
    if (meta && job.languageRequirements) {
      const text = Array.isArray(job.languageRequirements) ? job.languageRequirements.join(' · ') : String(job.languageRequirements);
      const item = document.createElement('span'); item.textContent = `Languages: ${text}`;
      meta.append(item);
    }
    const badges = node.querySelector('.quality-badges');
    if (badges) {
      const badge = document.createElement('span');
      badge.className = 'language-fit-badge';
      badge.textContent = job.languageFitStatus === 'match' ? 'Language fit' : job.languageFitStatus === 'mismatch' ? 'Language mismatch' : 'Language fit unverified';
      badges.append(badge);
      if (job.domesticRegion?.commuteClass) {
        const region = document.createElement('span');
        region.className = `region-${job.domesticRegion.commuteClass}`;
        region.textContent = ({ nearby: 'Jeonju / Wanju', expanded: 'Nearby · Check commute', relocation: 'Other region', unknown: 'Location unverified' })[job.domesticRegion.commuteClass];
        badges.append(region);
      }
    }
    // Nicole feed has no payment verification history; omit those unsupported claims.
    if (!job.paymentEvidenceCheckedAt && !job.paymentSignals?.length) node.querySelector('.payment-badge')?.remove();
    if (!job.verificationHistory?.length) node.querySelector('.verification-badges')?.remove();
  }
  const restoreButton = (kind, value, display) => {
    const row = document.createElement('div'); row.className = 'hidden-row';
    const text = document.createElement('span'); text.textContent = `${kind === 'jobs' ? 'Job' : kind === 'companies' ? 'Company' : 'Source'} · ${display}`;
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = 'Restore'; button.setAttribute('aria-label', `Restore hidden ${kind === 'jobs' ? 'job' : kind === 'companies' ? 'company' : 'source'}: ${display}`);
    button.addEventListener('click', async () => {
      if (kind === 'jobs') state.hiddenIds.delete(value);
      if (kind === 'companies') state.hiddenCompanies.delete(value);
      if (kind === 'sources') state.hiddenSources.delete(value);
      await persist(); rerender();
    });
    row.append(text, button); return row;
  };
  function update() {
    const statuses = $('nicoleSourceList');
    if (statuses) {
      statuses.replaceChildren();
      for (const source of state.meta?.sourceStatus || []) {
        const row = document.createElement('li');
        const status = ({ ok: 'Collected', partial: 'Partial', manual: 'Manual search', error: 'Collection failed', unavailable: 'Unavailable', not_configured: 'Not configured' })[source.status] || 'Status unknown';
        const name = document.createElement('strong'); name.textContent = source.source;
        const description = document.createElement('span');
        description.textContent = ` · ${status} · ${source.count || 0} jobs · Last checked ${source.checkedAt?.slice(0, 10) || 'Unknown'}`;
        row.append(name, description);
        for (const search of source.manualSearches || []) {
          try {
            const url = new URL(search.url);
            if (!['http:', 'https:'].includes(url.protocol)) continue;
            const link = document.createElement('a'); link.href = url.href; link.target = '_blank';
            link.rel = 'noopener noreferrer'; link.textContent = ` ${search.label} ↗`;
            row.append(link);
          } catch { /* A malformed source link is not shown. */ }
        }
        statuses.append(row);
      }
    }
    const list = $('nicoleHiddenList');
    if (list) {
      list.replaceChildren();
      for (const id of state.hiddenIds) list.append(restoreButton('jobs', id, state.jobs.find((job) => job.id === id)?.title || id));
      for (const item of state.hiddenCompanies) list.append(restoreButton('companies', item, item));
      for (const item of state.hiddenSources) list.append(restoreButton('sources', item, item));
      const total = state.hiddenIds.size + state.hiddenCompanies.size + state.hiddenSources.size;
      const count = $('nicoleHiddenCount'); if (count) count.textContent = `${total} hidden`;
      const restoreAll = $('nicoleRestoreAll');
      if (restoreAll) restoreAll.hidden = total === 0;
    }
    const entries = $('nicoleManualEntries');
    if (entries) {
      entries.replaceChildren();
      for (const job of state.manualJobs) {
        const row = document.createElement('div'); row.className = 'hidden-row';
        const link = document.createElement('a'); link.href = job.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = job.title;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete';
        remove.setAttribute('aria-label', `Delete manually added job: ${job.title}`);
        remove.addEventListener('click', async () => {
          if (storage.readOnly || !confirm(`Delete "${job.title}"?`)) return;
          state.manualJobs = state.manualJobs.filter((item) => item.id !== job.id);
          state.favorites.delete(job.id); state.hiddenIds.delete(job.id);
          await persist(); mergeJobs(); rerender();
        });
        row.append(link, remove); entries.append(row);
      }
    }
  }
  function initialize() {
    const hiddenPanel = $('nicoleHiddenManager');
    if (hiddenPanel) {
      hiddenPanel.hidden = false;
      const title = document.createElement('h2'); title.textContent = 'Manage hidden items';
      const count = document.createElement('span'); count.id = 'nicoleHiddenCount';
      const list = document.createElement('div'); list.id = 'nicoleHiddenList';
      const restore = document.createElement('button'); restore.id = 'nicoleRestoreAll';
      restore.type = 'button'; restore.className = 'button compact secondary-light'; restore.textContent = 'Restore all hidden items';
      hiddenPanel.append(title, count, list, restore);
    }
    const links = $('nicolePlatformLinks');
    if (links) {
      links.hidden = false;
      const title = document.createElement('h2'); title.textContent = 'Explore job platforms'; links.append(title);
      const note = document.createElement('p'); note.textContent = 'These platforms require a manual search. Results are not indexed in the feed.';
      links.append(note);
    }
    if (links) for (const [name, url] of platforms) {
      const a = document.createElement('a'); a.textContent = `${name} ↗`; a.href = url;
      a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a);
    }
    const sources = $('nicoleSourceList');
    if (sources) sources.hidden = false;
    const manual = $('nicoleManualEntries');
    if (manual) {
      manual.hidden = false;
      const title = document.createElement('h2'); title.textContent = 'Manually added jobs';
      manual.before(title);
    }
    $('nicoleRestoreAll')?.addEventListener('click', async () => {
      state.hiddenIds.clear(); state.hiddenCompanies.clear(); state.hiddenSources.clear();
      await persist(); rerender();
    });
  }
  return { decorateCard, update, initialize };
}
