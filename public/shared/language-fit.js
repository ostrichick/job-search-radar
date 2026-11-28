const DEPRECATED_CODES = { in: 'id', iw: 'he', ji: 'yi', jw: 'jv', mo: 'ro', tw: 'ak' };
const ALIASES = {
  bengali: 'bn', bangla: 'bn', mandarin: 'zh', cantonese: 'zh', taiwanese: 'zh',
  'myanmar language': 'my', castilian: 'es', tagalog: 'tl', farsi: 'fa'
};
const HOMOGRAPHS = new Set(['afar', 'ewe', 'latin', 'nauru', 'polish']);
const MODIFIER_AFTER = /^\s+(?:america(?:n)?|market|markets|customers?|clients?|brand|company|region|countries|foreign|nationals?|citizens?|residents?|speaking\s+market)/i;
const REQUIREMENT_CUE = /\b(?:required|mandatory|must|need(?:ed)?|fluen(?:t|cy)|native|bilingual|proficien(?:t|cy)|speaking|speaker|language|translat(?:ion|or|ing)|locali[sz]ation|linguist|interpreter|teacher|tutor|specialist|trainer|annotator|evaluator|transcriber|kenntnisse|verhandlungssicher|c1|c2|level|minimum|required\s+languages?)\b|필수|능통|원어민|requerido| fluido|indispensable/i;
const PREFERENCE_CUE = /\b(?:preferred|optional|a\s+(?:[a-z]+\s+)?plus|nice\s+to\s+have|appreciate|might\s+also\s+bring|if\s+you\s+possess|additional\s+skills|not\s+(?:required|mandatory|necessary|specified|stated)|does\s+not\s+(?:state|require|specify|need)|no\s+(?:language\s+)?requirement|advantage|desirable)\b|우대|선택|필수\s*(?:아님|아니|없)/i;

let registry = null;
function buildRegistry() {
  if (registry) return registry;
  const en = new Intl.DisplayNames(['en'], { type: 'language' });
  const ko = new Intl.DisplayNames(['ko'], { type: 'language' });
  const entries = [];
  for (let a = 97; a <= 122; a++) for (let b = 97; b <= 122; b++) {
    const raw = String.fromCharCode(a, b);
    const code = DEPRECATED_CODES[raw] || raw;
    const english = en.of(raw);
    const korean = ko.of(raw);
    if (english === raw || korean === raw) continue;
    if (entries.some((x) => x.code === code && x.en === english)) continue;
    entries.push({ code, en: english, ko: korean });
  }
  for (const [name, code] of Object.entries(ALIASES)) {
    if (!entries.some((x) => x.code === code)) entries.push({ code, en: name, ko: '' });
    entries.push({ code, en: name, ko: '', alias: true });
  }
  entries.sort((a, b) => (b.en.length + b.ko.length) - (a.en.length + a.ko.length));
  const latin = entries.map((x) => x.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const korean = entries.filter((x) => x.ko).map((x) => x.ko.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  registry = {
    entries,
    latinRe: new RegExp(`(?<![\\p{L}\\p{N}])(?:${latin.join('|')})(?![\\p{L}\\p{N}])`, 'giu'),
    koreanRe: new RegExp(`(?:${korean.join('|')})`, 'gi'),
    byName: new Map(entries.flatMap((x) => [[x.en.toLowerCase(), x.code], ...(x.ko ? [[x.ko, x.code]] : [])]))
  };
  return registry;
}

const esc = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function languageRegex(name) {
  const reg = buildRegistry();
  const entry = reg.entries.find((x) => x.en.toLowerCase() === String(name).toLowerCase() || x.ko === name);
  if (!entry) return null;
  const korean = entry.ko ? `|${esc(entry.ko)}` : '';
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc(entry.en)}(?![\\p{L}\\p{N}])${korean}`, 'iu');
}

export function languageNamesIn(text) {
  const { latinRe, koreanRe, byName } = buildRegistry();
  const found = [];
  const seen = new Set();
  const add = (name, index) => {
    const code = byName.get(name.toLowerCase());
    if (!code || seen.has(code)) return;
    seen.add(code);
    found.push({ code, name, index });
  };
  for (const m of String(text || '').matchAll(latinRe)) add(m[0], m.index);
  for (const m of String(text || '').matchAll(koreanRe)) add(m[0], m.index);
  return found;
}

export function isLanguageHomograph(name, clause, index) {
  const before = clause.slice(Math.max(0, index - 40), index);
  const after = clause.slice(index + name.length, index + name.length + 40);
  if (MODIFIER_AFTER.test(after)) return true;
  if (name.toLowerCase() === 'greek' && /^\s+life\b/i.test(after)) return true;
  if (name.toLowerCase() === 'polish') {
    const roleContext = /\b(?:language|translat(?:ion|or|ing)|locali[sz]ation|linguist|interpreter|speaker|specialist|trainer|teacher|tutor|annotator|evaluator|transcriber|fluent|native|bilingual|proficien(?:t|cy)|c1|c2)\b/i.test(`${before} ${after}`);
    const explicitRequirement = name === 'Polish' && /^\s*(?:required|mandatory)?\s*$/i.test(after);
    return !(roleContext || explicitRequirement);
  }
  if (!HOMOGRAPHS.has(name.toLowerCase())) return false;
  return !REQUIREMENT_CUE.test(`${before} ${after}`);
}

function requiredGroups(text, origin) {
  const groups = [];
  const clauses = String(text || '').split(/[\n.;]|\bbut\b|\bhowever\b/i);
  let preferenceSection = false;
  for (const clause of clauses) {
    const preference = PREFERENCE_CUE.test(clause);
    const requiredHeading = !preference && /\b(?:required|requirements|mandatory|must|needed?|language\s+skills?)\b/i.test(clause);
    const commaParts = clause.split(',');
    const mixedPreference = preference && commaParts.some((part, index) => index > 0 &&
      PREFERENCE_CUE.test(part) && REQUIREMENT_CUE.test(commaParts[index - 1]));
    if (requiredHeading) preferenceSection = false;
    if (preference) preferenceSection = true;
    if (preferenceSection && !requiredHeading && !mixedPreference) continue;
    const parts = mixedPreference ? commaParts : [clause];
    for (const part of parts) {
      if (PREFERENCE_CUE.test(part)) continue;
      const options = part.split(/\s+(?:or|either)\s+|\s*\/\s*|\|/i);
      const names = [];
      let languageOptionCount = 0;
      let required = false;
      let strong = false;
      for (const option of options) {
        if (PREFERENCE_CUE.test(option)) continue;
        required = required || REQUIREMENT_CUE.test(option) || /^(?:required|must|need)\s*:/i.test(option.trim());
        strong = strong || /\b(?:native|fluent|advanced|bilingual|c1|c2|translat(?:ion|or|ing)|linguist|interpreter|language\s+(?:specialist|trainer|expert)|proficien(?:t|cy))\b|능통|원어민|고급/i.test(option);
        const optionNames = languageNamesIn(option)
          .filter((n) => !isLanguageHomograph(n.name, option, n.index));
        if (optionNames.length) languageOptionCount++;
        for (const n of optionNames) {
          if (!names.some((x) => x.code === n.code)) names.push(n);
        }
      }
      if (names.length) groups.push({ names, required, strong, origin, alternative: languageOptionCount > 1 });
    }
  }
  return groups;
}

export function requiredLanguageNames(text, origin = 'description') {
  return [...new Set(requiredGroups(text, origin)
    .filter((group) => group.required || group.strong)
    .flatMap((group) => group.names.map((name) => name.name)))];
}

export function assessLanguageFit({ title = '', description = '', category = '', languageRequirements = '' },
  knownLanguages = { es: 'native', ko: 'beginner', en: 'unverified' }) {
  const explicit = String(languageRequirements || '');
  const hasExplicit = Boolean(explicit.trim()) && !/공고\s*원문\s*확인\s*필요/i.test(explicit);
  const groups = [
    ...(hasExplicit ? requiredGroups(explicit, 'explicit').map((g) => ({ ...g, required: true })) : []),
    ...requiredGroups(title, 'title'),
    ...requiredGroups(description, 'description')
  ];
  const languageRole = category === 'translation' || category === 'interpreting' ||
    /\b(translat(?:ion|or|ing)|locali[sz]ation|linguist|language\s+(?:review|quality|specialist|trainer|expert|annotator|evaluator|teacher|tutor|interpreter)|interpreter)\b|번역|통역|현지화/i.test(title);
  const relevant = groups.filter((group) => group.required ||
    (languageRole && group.origin === 'title' && group.names.length > 0) ||
    (languageRole && group.strong));
  if (!relevant.length) {
    return { languageFitStatus: 'unknown', languageFitReason: '공고에서 요구 언어를 확정할 근거가 부족합니다.' };
  }
  const supported = (code) => ['native', 'fluent', 'advanced', 'intermediate'].includes(knownLanguages?.[code]);
  const mismatch = [];
  const unknown = [];
  const satisfied = [];
  for (const group of relevant) {
    const strong = group.strong || (languageRole && group.origin === 'title');
    if (group.alternative) {
      if (group.names.some((n) => supported(n.code))) {
        group.names.forEach((n) => (supported(n.code) ? satisfied : unknown).push(n.name));
        continue;
      }
      const hasUnverified = group.names.some((n) => knownLanguages?.[n.code] === 'unverified');
      const hasKnown = group.names.some((n) => Object.hasOwn(knownLanguages || {}, n.code));
      if (hasUnverified || (!strong && hasKnown)) {
        group.names.forEach((n) => unknown.push(n.name));
        continue;
      }
      group.names.forEach((n) => mismatch.push(n.name));
      continue;
    }
    for (const name of group.names) {
      if (supported(name.code)) satisfied.push(name.name);
      else if (!knownLanguages || !(name.code in knownLanguages) || (strong && knownLanguages[name.code] === 'beginner')) mismatch.push(name.name);
      else unknown.push(name.name);
    }
  }
  const unique = (xs) => [...new Set(xs)];
  if (mismatch.length) return {
    languageFitStatus: 'mismatch',
    languageFitReason: `${unique(mismatch).join(', ')}: 현재 확인된 언어 역량으로는 직무 요구 수준을 충족한다고 판단하기 어렵습니다. 실제 능력과 요건 확인 필요.`
  };
  if (unknown.length) return {
    languageFitStatus: 'unknown',
    languageFitReason: `${unique(unknown).join(', ')} 능력 또는 직무에 필요한 숙련도가 확인되지 않았습니다.`
  };
  return {
    languageFitStatus: 'match',
    languageFitReason: `${unique([...satisfied, ...unknown]).join(', ')}: 등록된 언어 정보와 공고의 확인된 언어 단서가 일치합니다. 세부 지원 자격은 확인 필요.`
  };
}
