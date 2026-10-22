import { createHash } from 'node:crypto';

const ROLE_RULES = [
  { category: 'translation', re: /\b(translat(?:e|es|ed|ion|ions|or|ors|ing)|locali[sz](?:ation|e|ing|ed|er|ers)|language\s+(?:quality|review|qa|specialist)|linguist|subtitl(?:e|es|ing|er)|proofread(?:er|ing)?)\b|번역|현지화|교정|traducci[oó]n|traductor(?:a)?|traducir|localizaci[oó]n/i },
  { category: 'advertising', re: /\b(advertis(?:ing|ement|ements|er)|ads?\s+(?:ops|operations|campaigns?|specialist|manager|buyer|buying)|paid\s+(?:media|social|search|ads?|acquisition)|media\s+buy(?:er|ing)|ppc|programmatic|performance\s+market(?:er|ing)|google\s+ads?|meta\s+ads?)\b|광고|퍼포먼스\s*마케팅|publicidad|anuncios?\s+digitales?/i },
  { category: 'marketing', re: /\b(marketing|marketer|growth\s+(?:specialist|manager|marketing|associate)|seo|sem|crm|social\s+media(?:\s*&\s*community)?\s+(?:manager|specialist|strategist|coordinator)|brand\s+(?:manager|strategist|marketing)|email\s+marketing|demand\s+generation|campaign\s+manager|community\s+(?:manager|coordinator|specialist|associate)|digital\s+campaigns?)\b|마케팅|브랜드\s*관리|mercadotecnia|mercadeo|m[aá]rketing/i },
  { category: 'content', re: /\b(content\s+(?:creat(?:or|ion)|writer|editor|strategist|manager|marketing|producer|specialist|coordinator|moderator)|copywrit(?:er|ing)|social\s+(?:content|media\s+content)|video\s+editor|editorial\s+(?:writer|specialist|manager)|newsletter\s+(?:writer|editor)|ugc\s+creator)\b|콘텐츠\s*(?:제작|기획|마케팅|에디터)|카피라이터|redactor(?:a)?\s+de\s+contenidos?|creaci[oó]n\s+de\s+contenido/i }
];

const INTERPRETING_RE = /\b(interpreter|interpreters|interpreting|interpretation\s+(?:services?|specialist)|simultaneous\s+translation|consecutive\s+translation|live\s+interpretation)\b|통역|int[eé]rprete|interpretaci[oó]n/i;
const SPANISH_RE = /\b(spanish|espa[nñ]ol|castilian|latam|latin\s+american)\b|스페인어/i;
const KOREAN_RE = /\b(korean|hangul)\b|한국어|한국말/i;
const ENGLISH_RE = /\b(english|anglophone|englisch)\b|영어/i;

// This user's Korean is beginner/intermediate, and marketing experience is
// entry-level. These are mandatory suitability exclusions for *automatic*
// collection, separate from geography and informational manual bookmarks.
export function excludeQualificationReason({ title = '', description = '' } = {}) {
  const heading = safeText(title, 400);
  const body = safeText(description, 10000);
  if (/한일\s*(?:통번역|번역|통역)|일본어\s*(?:통번역|번역|통역)|^(?:account\s+manager|sales\s+manager|business\s+development\s+manager)\b/i.test(heading)) {
    return 'unsupported_language_or_sales_role';
  }
  const combined = `${heading} ${body}`;
  // A Korean-language localization professional is necessarily being hired
  // to produce/review Korean, regardless of whether the ad spells out TOPIK.
  if (/(?:\bkorean\b|한국어)\s+(?:locali[sz](?:ation|er|ing)|translat(?:ion|or|ing)|linguist|copy\s*edit(?:or|ing)|proofread(?:er|ing)|subtitl(?:e|ing))\b|한국어\s*(?:번역|현지화|감수|교정|자막)/i.test(heading)) {
    return 'korean_language_professional';
  }
  const koreanHigh = /\b(?:native|near[- ]native|fluent|advanced|business[- ]level|professional[- ]level|excellent)\s+(?:spoken\s+|written\s+|oral\s+)?korean\b|\bkorean\b.{0,40}\b(?:native|near[- ]native|fluen(?:t|cy)|advanced|business[- ]level|professional[- ]level|c1|c2)\b|한국어.{0,20}(?:능통|원어민\s*수준|고급|상급|비즈니스\s*(?:수준|회화)|유창|5급|6급)|(?:비즈니스\s*한국어|한국어\s*원어민)/i;
  // A role title is explicit. In the body, preference/negation applies only
  // to its own clause; a later mandatory clause must still exclude the role.
  if (koreanHigh.test(heading) || body.split(/[\n.;,]|\bbut\b|\bhowever\b/i).some((clause) =>
    koreanHigh.test(clause) && !/\b(?:preferred|optional|a plus|nice to have|not required|not mandatory|not necessary)\b|우대|선택|필수\s*(?:아님|아니|없)/i.test(clause))) return 'advanced_korean_required';
  // Restrict experience matching to role *requirements*: "company has 10
  // years of experience" and "company founded 10 years ago" are not criteria.
  const experienceTitle = /(?:경력\s*)?(?:[5-9]|1\d|[2-9]\d)\s*년\s*(?:이상|이상의|차\s*이상|경력)|(?:\b[5-9]|\b[1-9]\d)\s*\+\s*years?\b|\b(?:senior|lead|principal)\b.*\b(?:[5-9]|1\d)\s*years?\b/i;
  if (experienceTitle.test(heading)) return 'experience_5plus_required';
  const requiredExperience = /(?:\b(?:minimum\s+of|at\s+least|minimum|required|requires?|must\s+have|looking\s+for)\s+)?\b(?:[5-9]|[1-9]\d)\s*\+?\s*(?:to\s*\d+\s*)?years?\s+(?:of\s+)?(?:relevant\s+|professional\s+|proven\s+|prior\s+|hands[- ]on\s+)?(?:experience|background|expertise)\b|\b(?:experience|background|expertise)\s+(?:of\s+|for\s+|minimum\s+|at\s+least\s+)?(?:[5-9]|[1-9]\d)\s*\+?\s*years?\b|(?:경력|실무\s*경력|관련\s*경력)\s*(?:[5-9]|[1-9]\d)\s*년\s*(?:이상|이상의|필수|요구)|(?:[5-9]|[1-9]\d)\s*년\s*이상\s*(?:경력|실무)/i;
  const domainExperience = /\b(?:[5-9]|[1-9]\d)\s*\+?\s*years?\s+of\s+(?:[\w&/-]+\s+){1,4}experience\b/gi;
  for (const match of body.matchAll(domainExperience)) {
    const prefix = body.slice(Math.max(0, match.index - 110), match.index);
    if (/\b(?:requirements?|qualifications?|must\s+have|need(?:ed)?|candidate|you\s+(?:have|bring)|minimum|at\s+least|seeking)\b/i.test(prefix) ||
        (/\+/.test(match[0]) && !/\b(?:company|firm|business|agency|organisation|organization|we\s+have)\b/i.test(prefix))) {
      return 'experience_5plus_required';
    }
  }
  // The experience requirement normally appears under Requirements/
  // Qualifications, or in an explicit "5+ years of experience" statement.
  const withoutEmployerTenure = body.replace(/\b(?:our|the|this)\s+(?:company|firm|agency|organisation|organization|business)\s+(?:has|brings|boasts|possesses)\s+(?:over\s+|more\s+than\s+)?\d+\s*\+?\s*years?\s+of\s+(?:relevant\s+|professional\s+)?experience\b/gi, '');
  if (requiredExperience.test(withoutEmployerTenure)) return 'experience_5plus_required';
  return null;
}
const GERMAN_RE = /\b(german|deutsch|deutschkenntnisse)\b|독일어/i;
const FRENCH_RE = /\b(french|fran[cç]ais|franz[oö]sisch)\b|프랑스어/i;
const REQUIREMENT_RE = /\b(required|mandatory|must\s+(?:speak|be|have)|fluency\s+in|fluent\s+in|native\s+(?:speaker|level)|proficien(?:t|cy)|bilingual|written\s+and\s+spoken|kenntnisse|niveau|verhandlungssicher(?:e|em|er|es)?|sehr\s+gut(?:e|es)?|c1|c2)\b|필수|능통|requerido|imprescindible|fluido|indispensable/i;

const LANGUAGE_RULES = [
  { code: 'es', name: 'Spanish', re: SPANISH_RE },
  { code: 'ko', name: 'Korean', re: KOREAN_RE },
  { code: 'en', name: 'English', re: ENGLISH_RE },
  { code: 'de', name: 'German', re: GERMAN_RE },
  { code: 'fr', name: 'French', re: FRENCH_RE },
  { code: 'he', name: 'Hebrew', re: /\bhebrew\b|히브리어/i },
  { code: 'my', name: 'Burmese', re: /\b(burmese|myanmar\s+language)\b|버마어|미얀마어/i },
  { code: 'ja', name: 'Japanese', re: /\bjapanese\b|일본어/i },
  { code: 'zh', name: 'Chinese', re: /\b(?:mandarin|cantonese|chinese)\b|중국어/i },
  { code: 'pt', name: 'Portuguese', re: /\bportuguese\b|포르투갈어/i },
  { code: 'ar', name: 'Arabic', re: /\barabic\b|아랍어/i },
  { code: 'hi', name: 'Hindi', re: /\bhindi\b|힌디어/i },
  { code: 'th', name: 'Thai', re: /\bthai\b|태국어/i },
  { code: 'vi', name: 'Vietnamese', re: /\bvietnamese\b|베트남어/i },
  { code: 'id', name: 'Indonesian', re: /\bindonesian\b|인도네시아어/i },
  { code: 'ru', name: 'Russian', re: /\brussian\b|러시아어/i },
  { code: 'it', name: 'Italian', re: /\bitalian\b|이탈리아어/i },
  { code: 'tr', name: 'Turkish', re: /\bturkish\b|튀르키예어|터키어/i },
  { code: 'da', name: 'Danish', re: /\bdanish\b|덴마크어/i },
  { code: 'sv', name: 'Swedish', re: /\bswedish\b|스웨덴어/i },
  { code: 'no', name: 'Norwegian', re: /\bnorwegian\b|노르웨이어/i },
  { code: 'fi', name: 'Finnish', re: /\bfinnish\b|핀란드어/i },
  { code: 'nl', name: 'Dutch', re: /\bdutch\b|네덜란드어/i },
  { code: 'pl', name: 'Polish', re: /\bpolish\b|폴란드어/i },
  { code: 'el', name: 'Greek', re: /\bgreek\b|그리스어/i },
  { code: 'cs', name: 'Czech', re: /\bczech\b|체코어/i },
  { code: 'sk', name: 'Slovak', re: /\bslovak\b|슬로바키아어/i },
  { code: 'hu', name: 'Hungarian', re: /\bhungarian\b|헝가리어/i },
  { code: 'ro', name: 'Romanian', re: /\bromanian\b|루마니아어/i },
  { code: 'bg', name: 'Bulgarian', re: /\bbulgarian\b|불가리아어/i },
  { code: 'uk', name: 'Ukrainian', re: /\bukrainian\b|우크라이나어/i },
  { code: 'sr', name: 'Serbian', re: /\bserbian\b|세르비아어/i },
  { code: 'hr', name: 'Croatian', re: /\bcroatian\b|크로아티아어/i },
  { code: 'lt', name: 'Lithuanian', re: /\blithuanian\b|리투아니아어/i },
  { code: 'lv', name: 'Latvian', re: /\blatvian\b|라트비아어/i },
  { code: 'et', name: 'Estonian', re: /\bestonian\b|에스토니아어/i },
  { code: 'ms', name: 'Malay', re: /\bmalay\b|말레이어/i },
  { code: 'tl', name: 'Filipino', re: /\b(?:filipino|tagalog)\b|타갈로그어|필리핀어/i },
  { code: 'ur', name: 'Urdu', re: /\burdu\b|우르두어/i },
  { code: 'bn', name: 'Bengali', re: /\bbengali\b|벵골어/i },
  { code: 'ta', name: 'Tamil', re: /\btamil\b|타밀어/i },
  { code: 'fa', name: 'Persian', re: /\b(?:persian|farsi)\b|페르시아어/i },
];

export function stripHtml(value) {
  const s = String(value ?? '');
  return s
    .replace(/<(script|style|svg|iframe|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);?/gi, (_full, number) => {
      const n = number.toLowerCase().startsWith('x') ? parseInt(number.slice(1), 16) : Number(number);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ' ';
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (_full, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" })[name.toLowerCase()] ?? ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function safeText(value, length = 1000) {
  return stripHtml(value).slice(0, length);
}

export function safePublicUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') ||
        host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
        /^\d+(?:\.\d+){3}$/.test(host) || host.includes(':')) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref_src$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch { return null; }
}

export function isoDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const timestamp = typeof value === 'number' && Number.isFinite(value)
    ? (value < 1e11 ? value * 1000 : value)
    : Date.parse(String(value));
  if (!Number.isFinite(timestamp) || timestamp < Date.UTC(2000, 0, 1) || timestamp > Date.now() + 86400_000) return null;
  return new Date(timestamp).toISOString();
}

export function classifyRole({ title = '', description = '', categories = [], market = 'online' }) {
  const heading = safeText(title, 300);
  const tags = (Array.isArray(categories) ? categories : [categories]).filter(Boolean).join(' ');
  const supporting = safeText(tags, 500);
  const body = safeText(description, 3000);
  if (market === 'online' && (INTERPRETING_RE.test(heading) || (INTERPRETING_RE.test(supporting) && !ROLE_RULES[0].re.test(heading)))) return null;
  if (market === 'offline' && INTERPRETING_RE.test(heading)) return 'interpreting';
  const headingMatch = ROLE_RULES.find(({ re }) => re.test(heading));
  if (headingMatch) return headingMatch.category;
  // Generic titles can be considered only with a strong provider category and related body.
  if (/\b(coordinator|specialist|associate|manager|consultant|assistant|intern|analyst|freelancer|contractor)\b|담당자|사원/i.test(heading)) {
    return ROLE_RULES.find(({ re }) => re.test(supporting) && re.test(body))?.category ?? null;
  }
  return null;
}

export function extractLanguages({ title = '', description = '' }) {
  const titleText = safeText(title, 300);
  const text = safeText(description, 5000);
  const required = [];
  // Preserve explicit title languages; mark body occurrences only near requirement wording.
  for (const { name, re } of LANGUAGE_RULES) {
    const titleHit = re.test(titleText);
    const bodyHit = [...text.matchAll(new RegExp(re.source, 'gi'))].some((match) => {
      const context = text.slice(Math.max(0, match.index - 90), match.index + match[0].length + 90);
      return REQUIREMENT_RE.test(context);
    });
    if (titleHit || bodyHit) required.push(name);
  }
  return required;
}

/** Language fit is separate from eligibility to reside/work in a given country. */
export function assessLanguageFit({ title = '', description = '', category = '', languageRequirements = '' },
  knownLanguages = { es: 'native', ko: 'beginner', en: 'unverified' }) {
  const heading = safeText(title, 300);
  const body = safeText(description, 7000);
  const explicit = safeText(languageRequirements, 500);
  const languageRole = category === 'translation' || category === 'interpreting' ||
    /\b(translat(?:ion|or|ing)|locali[sz]ation|linguist|language\s+(?:review|quality)|interpreter)\b|번역|통역|현지화/i.test(heading);
  const mentioned = LANGUAGE_RULES.filter(({ re }) => {
    if (re.test(heading) && (languageRole || /\b(?:speaking|speaker|fluency|fluent|native|bilingual|language)\b|언어|능통|원어민/i.test(heading))) return true;
    if (re.test(explicit) && !/공고\s*원문\s*확인\s*필요/.test(explicit)) return true;
    const bodyMatches = [...body.matchAll(new RegExp(re.source, 'gi'))];
    return bodyMatches.some((match) => {
      const context = body.slice(Math.max(0, match.index - 65), match.index + match[0].length + 65);
      return REQUIREMENT_RE.test(context) ||
        /\b(?:fluent|native|bilingual|speaking|language\s+skills?|kenntnisse|verhandlungssicher|mandatory|required)\b/i.test(context);
    });
  });
  if (!mentioned.length) return {
    languageFitStatus: 'unknown', languageFitReason: '공고에서 요구 언어를 확정할 근거가 부족합니다.',
  };
  const absent = mentioned.filter((x) => !['native', 'fluent', 'advanced', 'intermediate', 'beginner', 'unverified'].includes(knownLanguages?.[x.code]));
  const lowProficiency = mentioned.filter((x) => knownLanguages?.[x.code] === 'beginner' && languageRole);
  if (absent.length || lowProficiency.length) {
    const lang = [...absent, ...lowProficiency].map((x) => x.name).join(', ');
    return { languageFitStatus: 'mismatch',
      languageFitReason: `${lang}: 현재 확인된 언어 역량으로는 직무 요구 수준을 충족한다고 판단하기 어렵습니다. 실제 능력과 요건 확인 필요.` };
  }
  const unspecified = mentioned.filter((x) => ['unverified', 'beginner'].includes(knownLanguages?.[x.code]));
  if (unspecified.length) {
    return { languageFitStatus: 'unknown',
      languageFitReason: `${unspecified.map((x) => x.name).join(', ')} 능력 또는 직무에 필요한 숙련도가 확인되지 않았습니다.` };
  }
  return { languageFitStatus: 'match',
    languageFitReason: `${mentioned.map((x) => x.name).join(', ')}: 등록된 언어 정보와 공고의 확인된 언어 단서가 일치합니다. 세부 지원 자격은 확인 필요.` };
}

const RESTRICTED_COUNTRIES = [
  [/(?:^|\b)(?:united\s+states|usa|u\.?s\.?a?\.?|us\s+only|america\s+only|canada|canadian|uk\s+only|united\s+kingdom|britain|australia|new\s+zealand|germany|france|poland|portugal|spain|italy|netherlands|europe|eu\s+only|emea|north\s+america|latin\s+america|latam|south\s+america)\b/i, 'outside the stated location'],
];

const NON_KOREAN_RESIDENCY_RE = /\b(?:wohn(?:sitz|haft)|ans[aä]ssig|residen(?:t|ce)|based|located|resid(?:e|ing))\b.{0,90}\b(?:deutschland|[oö]sterreich|germany|austria|france|spain|united\s+states|canada|usa|uk|europa|europe)\b|\b(?:ausschlie[sß]lich|nur|only)\b.{0,100}\b(?:kandidat(?:en|innen|:innen)|bewerber(?:innen|:innen)?|applicants?|candidates?)\b.{0,100}\b(?:deutschland|[oö]sterreich|germany|austria|france|spain|usa|europe)\b|\b(?:residentes?|candidatos?)\b.{0,70}\b(?:espa[nñ]a|m[eé]xico|argentina)\b/i;

const FOREIGN_RESIDENCE = '(?:latam|latin\\s+america|south\\s+america|mexico|mexico\\s+city|argentina|brazil|colombia|peru|philippines|philippine|germany|deutschland|austria|[oö]sterreich|france|spain|europe|eu|usa|united\\s+states|canada|united\\s+kingdom|uk|australia|new\\s+zealand)';
const FOREIGN_RESIDENCE_RULES = [
  new RegExp(`\\b(?:candidates?|applicants?|freelancers?|contractors?|employees?|talent|you|someone|somebody|person)\\b.{0,100}\\b(?:must\\s+)?(?:be\\s+)?(?:based|located|resid(?:e|ing))\\s+(?:in|within)\\s+(?:the\\s+)?${FOREIGN_RESIDENCE}\\b`, 'i'),
  new RegExp(`\\b(?:we\\s+(?:need|seek|want|hire|are\\s+looking\\s+for)\\s+(?:a|an)?|(?:role|position|job)\\s+(?:is\\s+)?).{0,85}\\b(?:based|located|resid(?:e|ing))\\s+(?:in|within)\\s+(?:the\\s+)?${FOREIGN_RESIDENCE}\\b`, 'i'),
  new RegExp(`\\b(?:must|need\\s+to|required\\s+to)\\s+(?:be\\s+)?(?:based|located|resid(?:e|ing))\\s+(?:in|within)\\s+(?:the\\s+)?${FOREIGN_RESIDENCE}\\b`, 'i'),
  new RegExp(`\\b(?:based|located|residing)\\s+(?:in|within)\\s+(?:the\\s+)?${FOREIGN_RESIDENCE}\\s+(?:residents?|candidates?|applicants?)\\s+only\\b`, 'i'),
  new RegExp(`\\b(?:looking\\s+for|seeking|hiring)\\s+(?:[a-z-]+\\s+)?(?:${FOREIGN_RESIDENCE})[- ]based\\s+(?:residents?|candidates?|applicants?)\\b`, 'i'),
];

// Job location and target-market wording are different. These phrases state that
// the WORKER must physically work within Europe, including French-language posts
// that Arbeitnow marks as remote without exposing a machine-readable geo scope.
const EUROPE_ONLY_REMOTE_RE = /(?:^|\s)(?:[àa]\s+distance|t[eé]l[eé]travail|remote|work\s+from\s+home)\b.{0,100}\b(?:depuis|uniquement\s+(?:depuis|en)|from|within)\s+(?:l['’]\s*|the\s+)?(?:europe|europa|european\s+economic\s+area|eea)\b/i;

// An exclusion requires a clear demand, rather than mere mentions of target markets,
// translations in marketing copy, or a language marked optional/preferred.
function explicitlyRequiresLanguage(description, re) {
  const body = safeText(description, 9000);
  for (const match of body.matchAll(new RegExp(re.source, 'gi'))) {
    const before = body.slice(Math.max(0, match.index - 85), match.index);
    const after = body.slice(match.index + match[0].length, match.index + match[0].length + 85);
    if (/\b(?:or|oder)\s*$/i.test(before) || /^\s*(?:or|oder)\b/i.test(after)) continue;
    if (/^\s*(?:(?:is|would\s+be)\s+)?(?:not\s+required|optional|preferred|a\s+plus|an\s+advantage|nice\s+to\s+have)\b/i.test(after)) continue;
    if (/\b(?:fluent|fluency\s+in|proficien(?:t|cy)\s+in|native(?:[- ]level)?|business[- ]level|must\s+speak|required:\s*|mandatory:\s*|excellent\s+(?:written\s+and\s+spoken\s+)?)\s*$/i.test(before)) return true;
    if (/^\s*(?:is\s+)?(?:required|mandatory|essential|fluen(?:t|cy)|proficien(?:t|cy)|native[- ]level|c1\b|c2\b|skills?\s+required|kenntnisse\s+(?:erforderlich|auf)|auf\s+(?:verhandlungssicherem|c1|c2)|verhandlungssicher)/i.test(after)) return true;
    if (/^\s*(?:language\s+)?(?:skills?|ability)\s+(?:are\s+)?(?:required|mandatory)\b/i.test(after)) return true;
  }
  return false;
}

function germanLanguagePosting(description) {
  const text = safeText(description, 6500);
  if (text.length < 180) return false;
  const markers = [
    /\b(?:wir|unser(?:e|en|em|er)?|unsere[nr]?)\b/i,
    /\b(?:dich|dir|deine[msnr]?|du)\b/i,
    /\b(?:aufgaben|anforderungen|kenntnisse|berufserfahrung)\b/i,
    /\b(?:bewerbung|bewerben|bewerber|bewerberinnen)\b/i,
    /\b(?:suchen|suchst|suchst|erwartest|erwartungen|bieten)\b/i,
    /\b(?:und|mit|für|sowie|über)\b/i,
  ];
  return markers.filter((re) => re.test(text)).length >= 4;
}

/** Definitive automated exclusions; uncertain English/Korean skill stays undecided. */
export function excludeOnlineJobReason({ source = '', market = 'online', title = '', description = '',
  location = '', restriction = '', category = '' } = {},
{ homeCountry = 'KR', knownLanguages = { es: 'native', en: 'unverified', ko: 'beginner' } } = {}) {
  if (market === 'offline') return null;
  const heading = safeText(title, 300);
  const translationRole = category === 'translation' || /\b(?:translator|translation|linguist|locali[sz]ation|language\s+(?:quality|review|specialist))\b|번역|현지화/i.test(heading);
  const supportedLanguages = knownLanguages && typeof knownLanguages === 'object' ? knownLanguages : { es: 'native', en: 'unverified', ko: 'beginner' };
  for (const { code, re } of LANGUAGE_RULES) {
    // Treat proficiency gaps (including Korean beginner or English unverified) as
    // unknown; only a missing language is demonstrably outside the stated profile.
    if (Object.hasOwn(supportedLanguages, code)) continue;
    const titleMention = re.test(heading);
    if (titleMention && (translationRole ||
        /\b(?:speaking|speaker|fluency|native|bilingual|language)\b/i.test(heading))) {
      // 'Spanish OR French translator' may accept Spanish: not a definitive exclusion.
      if (!/\b(?:or|oder|또는)\b/i.test(heading)) return 'unsupported_required_language';
    }
    if (explicitlyRequiresLanguage(description, re)) return 'unsupported_required_language';
  }
  if (homeCountry !== 'KR') return null;
  if (EUROPE_ONLY_REMOTE_RE.test(safeText(description, 9000))) return 'outside_supported_residence';
  const employerOnlyLocation = source === 'Arbeitnow';
  const eligibility = assessEligibility({
    location: employerOnlyLocation ? '' : location,
    restriction: employerOnlyLocation ? '' : restriction,
    description, homeCountry,
  });
  if (eligibility.status === 'restricted') return 'outside_supported_residence';
  if (FOREIGN_RESIDENCE_RULES.some((re) => re.test(safeText(description, 9000)))) return 'outside_supported_residence';
  // Arbeitnow's 'remote' flag can mean remote *within Germany*. The city is HQ,
  // so an English worldwide role should still survive.
  if (employerOnlyLocation &&
      /\b(?:berlin|hamburg|münchen|munich|germany|deutschland|frankfurt|monheim|düsseldorf|duesseldorf|köln|cologne|essen|leverkusen|bonn|stuttgart|austria|[oö]sterreich|wien|vienna)\b/i.test(location) &&
      germanLanguagePosting(description) &&
      !/\b(?:worldwide|anywhere|global\s+remote|work\s+from\s+anywhere|south\s+korea|republic\s+of\s+korea)\b|대한민국|한국/i.test(description)) {
    return 'german_only_germany_job';
  }
  return null;
}

export function requiresPhysicalAttendance(description = '') {
  const text = safeText(description, 5500);
  return /\b(?:\d+(?:\s*[-–]\s*\d+)?\s+(?:feste\s+)?drehtage|(?:on[- ]site|in[- ]person|vor\s+ort|pr[eé]senti[ae]l)\s+(?:shoots?|filming|work|workdays?|meetings?|required|pflicht|drehen|t[aä]tigkeit)|shoots?\s+(?:at|with)\s+(?:clients?|customers?)|(?:must|required\s+to)\s+(?:work|shoot|film)\s+(?:at|on)[- ]?site)\b/i.test(text);
}

export function assessEligibility({ market = 'online', location = '', restriction = '', description = '', homeCountry = 'KR' }) {
  if (market === 'offline') return { status: 'unknown', geoScope: safeText(location, 140) || 'Unspecified', reason: 'On-site eligibility and commute require verification.', requiresVerification: true };
  const geo = safeText(restriction || location, 160);
  const body = safeText(description, 5000);
  const text = `${geo} ${body}`;
  const explicitKorea = /\b(south\s+korea|republic\s+of\s+korea|korea|seoul|kr\s+only)\b|대한민국|한국/i.test(geo);
  const universal = /\b(worldwide|anywhere|global|work\s+from\s+anywhere|no\s+geographic\s+restriction|any\s+country)\b/i.test(geo);
  const regional = /\b(apac|asia(?:\s+pacific)?|asia-wide)\b/i.test(geo);
  const restrictPattern = /\b(?:must\s+(?:be\s+)?(?:based|located|resid(?:e|ing))\s+in|only\s+(?:in|for|from)|residents?\s+of|candidates?\s+in|within\s+(?:the\s+)?(?:us|usa|eu|europe)|us\s+work\s+authori[sz]ation\s+required|(?:us|usa|u\.s\.|uk|eu|europe|canada)\s+(?:residents?|applicants?|candidates?)\s+only|(?:us|usa|u\.s\.|uk|eu|europe|canada)[ -]only)\b/i;
  if (homeCountry === 'KR' && !explicitKorea && !universal && !regional && RESTRICTED_COUNTRIES.some(([re]) => re.test(geo))) {
    return { status: 'restricted', geoScope: geo, reason: 'The advertised geographic scope does not include South Korea.', requiresVerification: true };
  }
  const matchAt = text.search(restrictPattern);
  const context = matchAt >= 0 ? text.slice(Math.max(0, matchAt - 30), matchAt + 140) : '';
  if (homeCountry === 'KR' && !explicitKorea && NON_KOREAN_RESIDENCY_RE.test(body)) {
    return { status: 'restricted', geoScope: geo || 'See residency requirement in posting', reason: 'The job description explicitly limits country of residence or physical work location.', requiresVerification: true };
  }
  if (homeCountry === 'KR' && !explicitKorea && matchAt >= 0 && /\b(us|usa|u\.s\.|united\s+states|canada|uk|europe|eu|australia|new\s+zealand)\b/i.test(context)) {
    return { status: 'restricted', geoScope: geo || 'See posting', reason: 'The description includes a geographic or work-authorization restriction.', requiresVerification: true };
  }
  if (explicitKorea || universal || regional) {
    return { status: 'possible', geoScope: geo || 'See posting', reason: 'The stated region may include South Korea; employment, language and tax eligibility remain unverified.', requiresVerification: true };
  }
  return { status: 'unknown', geoScope: geo || 'Unspecified', reason: 'Remote work is advertised, but working from South Korea has not been confirmed.', requiresVerification: true };
}

export function stableId(source, providerId, url) {
  const key = `${source}:${String(providerId || url).trim()}`;
  return `${source.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${createHash('sha256').update(key).digest('hex').slice(0, 20)}`;
}

export function dedupeJobs(jobs) {
  const byId = new Set();
  const byUrl = new Set();
  const byRole = new Set();
  return jobs.filter((job) => {
    const cleanUrl = safePublicUrl(job.url);
    if (!cleanUrl || !job.title || !job.company || !job.id || byId.has(job.id) || byUrl.has(cleanUrl)) return false;
    const roleKey = `${safeText(job.company, 200).toLowerCase()}|${safeText(job.title, 200).toLowerCase()}|${safeText(job.location, 100).toLowerCase()}`;
    if (byRole.has(roleKey)) return false;
    byId.add(job.id); byUrl.add(cleanUrl); byRole.add(roleKey);
    return true;
  });
}
