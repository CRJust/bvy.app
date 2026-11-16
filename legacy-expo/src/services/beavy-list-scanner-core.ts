export type ScannedRawItem = {
  rawLine: string;
  name: string;
  quantity: number;
  unit: string | null;
  brandHint: string | null;
  packageSizeHint: string | null;
  confidence: number;
};

export type CatalogIndexProduct = {
  id: string;
  canonical_name: string;
  brand: string | null;
  package_size: string | null;
  quantity_value: number | null;
  quantity_unit: string | null;
  image_url: string | null;
  category: string | null;
  subcategory: string | null;
  search_aliases: string[];
  familyNames: string[];
  familyAliases: string[];
  attributes?: Record<string, unknown>;
  store_count?: number;
  retailer_slugs?: string[];
  min_price?: number | null;
  max_price?: number | null;
};

export type MatchCandidate = {
  product: CatalogIndexProduct;
  score: number;
  reasons: string[];
  isUnrequestedPrivateLabel?: boolean;
  isUnrequestedSnack?: boolean;
};

export type ScannedTierVariants = {
  /** Alimentul comun de referință (prioritizat >= 6 magazine). */
  common: CatalogIndexProduct | null;
  /** Varianta de brand propriu de supermarket (ex: Pilos, K-Classic, 365, Simpl, Pouce). */
  privateLabel: CatalogIndexProduct | null;
  /** Varianta mai ieftină (buget) disponibilă pentru același aliment. */
  cheaper: CatalogIndexProduct | null;
  /** Varianta mai premium (brand consacrat / calitate superioară). */
  premium: CatalogIndexProduct | null;
};

export const STORE_EXCLUSIVE_PRIVATE_LABEL_BRANDS = new Set([
  'mega',
  'mega image',
  '365',
  'delhaize',
  'gusturi romanesti',
  'gustona',
  'mega apetit',
  'mega grill',
  'delicata',
  'perla',
  'fine crunchy',
  'k classic',
  'k-classic',
  'k bio',
  'k-bio',
  'k favorites',
  'k-favorites',
  'k free',
  'k-free',
  'k purland',
  'k-purland',
  'vreau din romania',
  'pilos',
  'milbona',
  'pikok',
  'dulano',
  'cien',
  'w5',
  'lupilu',
  'solevita',
  'freeway',
  'freshona',
  'ocean sea',
  'bellarom',
  'italiamo',
  'chef select',
  'belbake',
  'gelatelli',
  'alesto',
  'favorina',
  'sondey',
  'combino',
  'tiradell',
  'camara noastra',
  'nautica',
  'golden sun',
  'tastino',
  'snack day',
  'kania',
  'vita d or',
  "vita d'or",
  'primadonna',
  'penny',
  'san fabio',
  'hanul boieresc',
  'boni',
  'gran mare',
  'bunte',
  'my bio',
  'today',
  'proxi',
  'gradina bunicii',
  'grădina bunicii',
  'ferma din deal',
  'deli di',
  'al saptesprezecelea',
  'al șaptesprezecelea',
  'profi',
  'carrefour',
  'carrefour classic',
  'carrefour bio',
  'carrefour extra',
  'carrefour discount',
  'simpl',
  'drag de romania',
  'reflets de france',
  'terre d italia',
  'auchan',
  'filiera auchan',
  'pouce',
  'inextenso',
  'actuel',
  'cosmia',
  'miil',
  'ubena',
  'ubomi',
  'yutto',
  'pappudia',
  'fjoru',
  'sutte',
  'pappamia',
  'dacello',
  'kitchin',
  'lambini',
  'delicatese sezamo',
]);

export const STORE_EXCLUSIVE_TITLE_PREFIX =
  /^(?:365|mega\s+image|mega\s+apetit|mega\s+grill|mega|delhaize|gusturi\s+romanesti|k[-\s]?classic|k[-\s]?favorites|k[-\s]?bio|k[-\s]?free|k[-\s]?purland|vreau\s+din\s+romania|pilos|milbona|pikok|dulano|solevita|freeway|freshona|ocean\s+sea|bellarom|italiamo|chef\s+select|belbake|gelatelli|alesto|favorina|sondey|combino|tiradell|camara\s+noastra|nautica|golden\s+sun|tastino|kania|penny|hanul\s+boieresc|san\s+fabio|gran\s+mare|bunte|boni|my\s+bio|carrefour|simpl|drag\s+de\s+romania|pouce|filiera\s+auchan|auchan|miil|ubena|ubomi|yutto|pappudia|fjoru|sutte|pappamia|dacello|kitchin)\b/i;

export type ScannedMatchStatus = 'matched' | 'ambiguous' | 'unmatched';

export type ScannedReviewItem = {
  localId: string;
  rawLine: string;
  editedName: string;
  quantity: number;
  unit: string | null;
  brandHint: string | null;
  packageSizeHint: string | null;
  ocrConfidence: number;
  matchConfidence: number;
  matchStatus: ScannedMatchStatus;
  selectedProduct: CatalogIndexProduct | null;
  candidates: MatchCandidate[];
  tierVariants?: ScannedTierVariants;
  included: boolean;
  userResolved: boolean;
};

const STOPWORDS = new Set([
  'de',
  'din',
  'cu',
  'si',
  'la',
  'in',
  'pe',
  'pentru',
  'sau',
  'un',
  'o',
  'niste',
  'pt',
]);

const UNIT_ALIAS_MAP: Record<string, string> = {
  buc: 'buc',
  bucata: 'buc',
  bucati: 'buc',
  pachet: 'pachet',
  pachete: 'pachet',
  cutie: 'cutie',
  cutii: 'cutie',
  sticla: 'sticlă',
  sticle: 'sticlă',
  borcan: 'borcan',
  borcane: 'borcan',
  conserva: 'conservă',
  conserve: 'conservă',
  legatura: 'legătură',
  legaturi: 'legătură',
  cofraj: 'cofraj',
  cofraje: 'cofraj',
  carton: 'carton',
  cartoane: 'carton',
  plasa: 'plasă',
  plase: 'plasă',
  rola: 'rolă',
  role: 'rolă',
  sul: 'sul',
  suluri: 'sul',
  kg: 'kg',
  g: 'g',
  gr: 'g',
  l: 'l',
  litru: 'l',
  litri: 'l',
  ml: 'ml',
  cl: 'cl',
};

const ROMANIAN_SYNONYMS: Record<string, string[]> = {
  oua: ['ou'],
  ou: ['oua'],
  rosii: ['rosie'],
  rosie: ['rosii'],
  banane: ['banana'],
  banana: ['banane'],
  mere: ['mar'],
  mar: ['mere'],
  pere: ['para'],
  para: ['pere'],
  cartofi: ['cartof'],
  cartof: ['cartofi'],
  castraveti: ['castravete'],
  castravete: ['castraveti'],
  ceapa: ['cepe'],
  cepe: ['ceapa'],
  paine: ['paini'],
  paini: ['paine'],
  paste: ['pasta', 'spaghetti', 'penne', 'fusilli', 'farfalle', 'rigatoni'],
  spagete: ['spaghetti'],
  spaghete: ['spaghetti'],
  spaghetti: ['spaghete', 'spagete'],
  fusili: ['fusilli'],
  pene: ['penne'],
  kefir: ['chefir'],
  chefir: ['kefir'],
  iaurturi: ['iaurt'],
  iaurt: ['iaurturi'],
  smantana: ['smintana'],
  cascaval: ['cascaval'],
  branza: ['branzeturi'],
  branzeturi: ['branza'],
  parmezan: ['parmigiano', 'grana', 'padano'],
  parmigiano: ['parmezan', 'grana', 'padano'],
  pecorino: ['parmezan', 'parmigiano'],
  grana: ['parmezan', 'parmigiano'],
  bacon: ['pancetta', 'guanciale'],
  pancetta: ['bacon', 'guanciale'],
  guanciale: ['bacon', 'pancetta'],
};

export function normalizeScanText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.,%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeAlphaNum(value: string): string[] {
  return normalizeScanText(value)
    .replace(/[.,%]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function isNoiseLine(raw: string): boolean {
  const norm = normalizeScanText(raw);
  if (norm.length < 2) return true;
  if (/^\d+([.,:/-]\d+)*$/.test(norm)) return true;
  if (/^\d+([.,]\d+)?\s*(lei|ron|eur)$/i.test(norm)) return true;
  const ignoredHeaders = new Set([
    'lista',
    'lista de cumparaturi',
    'lista cumparaturi',
    'cumparaturi',
    'shopping list',
    'total',
    'subtotal',
    'bon fiscal',
    'data',
  ]);
  return ignoredHeaders.has(norm);
}

function extractPackageSizeHint(text: string): string | null {
  const pkgMatch = text.match(
    /\b(\d+(?:[.,]\d+)?)\s*(kg|gr|g|k|litri|litru|l|ml|cl)\b\.?/i
  );
  if (!pkgMatch) return null;
  const num = pkgMatch[1].replace(',', '.');
  const rawUnit = normalizeScanText(pkgMatch[2]).replace(/\.+$/, '');
  const unit =
    rawUnit === 'litri' || rawUnit === 'litru'
      ? 'l'
      : rawUnit === 'gr'
        ? 'g'
        : rawUnit === 'k'
          ? 'kg'
          : rawUnit;
  return `${num} ${unit}`;
}

function capitalizeFirst(value: string): string {
  const clean = value.trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function extractKnownBrandFromText(
  text: string,
  knownBrands: string[]
): string | null {
  if (knownBrands.length === 0) return null;
  const padded = ` ${normalizeScanText(text)} `;
  const sorted = [...knownBrands]
    .map((b) => ({ raw: b, norm: normalizeScanText(b) }))
    .filter((b) => b.norm.length >= 3)
    .sort((a, b) => b.norm.length - a.norm.length);

  for (const b of sorted) {
    if (padded.includes(` ${b.norm} `)) {
      return b.raw;
    }
  }
  return null;
}

/**
 * Deterministic Romanian shopping list parser for raw OCR or pasted text.
 * Never invents brands, package sizes, or EANs not present in the source text.
 */
export function parseShoppingListRawText(
  rawText: string,
  knownBrands: string[] = []
): ScannedRawItem[] {
  const lines = rawText
    .split(/\r?\n|;+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: ScannedRawItem[] = [];

  for (const rawLine of lines) {
    let working = rawLine
      .replace(/^[-•*▪◦✓✔☐☑[\]\s]+/, '')
      .replace(/^\d{1,2}[.)]\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!working || isNoiseLine(working)) continue;

    let quantity = 1;
    let unit: string | null = null;

    const leadingMult = working.match(/^(\d{1,2})\s*[x×*]\s*(.+)$/i);
    if (leadingMult) {
      quantity = Math.min(Math.max(parseInt(leadingMult[1], 10) || 1, 1), 99);
      unit = 'buc';
      working = leadingMult[2].trim();
    } else {
      const trailingMult = working.match(/^(.+?)\s*[x×*]\s*(\d{1,2})$/i);
      if (trailingMult) {
        quantity = Math.min(Math.max(parseInt(trailingMult[2], 10) || 1, 1), 99);
        unit = 'buc';
        working = trailingMult[1].trim();
      } else {
        const containerMatch = working.match(
          /^(\d{1,2})\s+(buc|bucati|bucăți|pachet|pachete|cutie|cutii|sticla|sticlă|sticle|borcan|borcane|conserva|conservă|conserve|legatura|legătură|legaturi|legături|cofraj|cofraje|carton|cartoane|plasa|plasă|plase|rola|rolă|role|sul|suluri)\.?\s+(?:de\s+)?(.+)$/i
        );
        if (containerMatch) {
          quantity = Math.min(
            Math.max(parseInt(containerMatch[1], 10) || 1, 1),
            99
          );
          const uKey = normalizeScanText(containerMatch[2]);
          unit = UNIT_ALIAS_MAP[uKey] ?? 'buc';
          working = containerMatch[3].trim();
        } else {
          const plainCount = working.match(
            /^(\d{1,2})\s+(?!(?:kg|gr|g|l|litri|litru|ml|cl|%)\b)(.+)$/i
          );
          if (plainCount) {
            quantity = Math.min(
              Math.max(parseInt(plainCount[1], 10) || 1, 1),
              99
            );
            unit = 'buc';
            working = plainCount[2].trim();
          }
        }
      }
    }

    working = working
      .replace(/\s[-–—]\s*\d+(?:[.,]\d+)?\s*(?:lei|ron)\b.*$/i, '')
      .replace(/\s+\d+(?:[.,]\d+)?\s*(?:lei|ron)\s*$/i, '')
      .trim();

    if (!working || isNoiseLine(working)) continue;

    const packageSizeHint = extractPackageSizeHint(working);
    const brandHint = extractKnownBrandFromText(working, knownBrands);

    items.push({
      rawLine,
      name: capitalizeFirst(working),
      quantity,
      unit,
      brandHint,
      packageSizeHint,
      confidence: 0.74,
    });
  }

  return items;
}

function toBasePackageSize(
  val: number | null | undefined,
  unit: string | null | undefined,
  packageSize: string | null | undefined
): { kind: 'mass' | 'volume'; baseValue: number } | null {
  let num =
    val != null && Number.isFinite(Number(val)) ? Number(val) : null;
  let u = unit ? normalizeScanText(unit) : null;

  if ((num === null || !u) && packageSize) {
    const norm = normalizeScanText(packageSize).replace(/,/g, '.');
    const m = norm.match(/(\d+(?:\.\d+)?)\s*(kg|gr|g|litri|litru|l|ml|cl)\b/);
    if (m) {
      num = Number(m[1]);
      u = m[2];
    }
  }

  if (num === null || !u || num <= 0) return null;
  if (u === 'kg') return { kind: 'mass', baseValue: num * 1000 };
  if (u === 'g' || u === 'gr') return { kind: 'mass', baseValue: num };
  if (u === 'l' || u === 'litri' || u === 'litru') {
    return { kind: 'volume', baseValue: num * 1000 };
  }
  if (u === 'cl') return { kind: 'volume', baseValue: num * 10 };
  if (u === 'ml') return { kind: 'volume', baseValue: num };
  return null;
}

function extractFatNumber(text: string): number | null {
  const m = normalizeScanText(text)
    .replace(/,/g, '.')
    .match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n < 99 ? n : null;
}

function tokenMatchStrength(queryToken: string, candidateTokens: string[]): number {
  if (candidateTokens.includes(queryToken)) return 1.0;

  const syns = ROMANIAN_SYNONYMS[queryToken] ?? [];
  for (const syn of syns) {
    if (candidateTokens.includes(syn)) return 1.0;
  }

  // Stem prefix match for Romanian plural/definite forms
  if (queryToken.length >= 4) {
    for (const ct of candidateTokens) {
      if (ct.length >= 4 && (ct.startsWith(queryToken) || queryToken.startsWith(ct))) {
        const diff = Math.abs(ct.length - queryToken.length);
        if (diff <= 2) return 0.9;
      }
    }
  } else if (queryToken.length === 3) {
    for (const ct of candidateTokens) {
      if (
        ct.startsWith(queryToken) &&
        (ct.length <= 5 && ['ul', 'le', 'a', 'e', 'i'].some((suf) => ct === `${queryToken}${suf}`))
      ) {
        return 0.9;
      }
    }
  }

  // Conservative fuzzy tolerance for OCR typos
  if (queryToken.length >= 5) {
    for (const ct of candidateTokens) {
      const dist = levenshtein(queryToken, ct);
      if (ct.length >= 5 && dist === 1) {
        return 0.78;
      }
      if (queryToken.length >= 7 && ct.length >= 7 && dist === 2) {
        return 0.68;
      }
    }
  }

  return 0;
}

/**
 * Matches one extracted shopping item against the canonical Beavy catalog.
 * Enforces anti-hallucination & disambiguation rules:
 * - Never invents brands/sizes
 * - Never auto-picks a single variant when multiple plausible variants compete
 */
export function matchScannedItemAgainstCatalog(
  item: ScannedRawItem,
  catalogProducts: CatalogIndexProduct[],
  knownBrands: string[] = [],
  indexOverride?: number
): ScannedReviewItem {
  const localId = `scan-${Date.now()}-${indexOverride ?? Math.random().toString(36).slice(2, 7)}`;

  const queryText = item.name.trim();
  const normQuery = normalizeScanText(queryText);

  const detectedBrand =
    item.brandHint ?? extractKnownBrandFromText(queryText, knownBrands);
  const detectedBrandNorm = detectedBrand ? normalizeScanText(detectedBrand) : null;

  const detectedSizeText =
    item.packageSizeHint ?? extractPackageSizeHint(queryText);
  const querySize = detectedSizeText
    ? toBasePackageSize(null, null, detectedSizeText)
    : null;
  const queryFat = extractFatNumber(`${queryText} ${item.rawLine}`);
  const queryLactoseFree = normQuery.includes('fara lactoza');

  // Remove explicit brand, package-size (e.g. "1l", "500 g", OCR "2k."), and fat% tokens from core product query
  const queryWithoutSizeOrFat = queryText
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|gr|g|k|litri|litru|l|ml|cl)\b\.?/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*%/g, ' ');
  const rawTokens = tokenizeAlphaNum(queryWithoutSizeOrFat);
  const brandTokens = new Set(
    detectedBrandNorm ? tokenizeAlphaNum(detectedBrandNorm) : []
  );
  const STOP_CONNECTORS = new Set([
    'sau',
    'si',
    'de',
    'din',
    'cu',
    'la',
    'in',
    'fara',
    'proaspat',
    'proaspata',
    'proaspeti',
    'proaspete',
    'clasic',
    'clasica',
    'traditional',
    'traditionala',
  ]);
  const coreTokens = rawTokens.filter(
    (t) => !brandTokens.has(t) && !/^\d+$/.test(t) && !STOP_CONNECTORS.has(t)
  );
  const fallbackTokens = tokenizeAlphaNum(queryText);
  const activeTokens = coreTokens.length > 0 ? coreTokens : fallbackTokens;

  // Interogări alternative cu „sau” (ex: „Bacon sau Pancetta”, „Dulceață de vișine sau afine”)
  const disjunctiveBranches = queryWithoutSizeOrFat
    .split(/\s+(?:sau|or|\/)\s+/i)
    .map((branchStr) => {
      const bTokens = tokenizeAlphaNum(branchStr);
      return bTokens.filter(
        (t) => !brandTokens.has(t) && !/^\d+$/.test(t) && !STOP_CONNECTORS.has(t)
      );
    })
    .filter((branch) => branch.length > 0);
  const hasDisjunction = disjunctiveBranches.length > 1;

  const COMPOSITE_OR_SNACK_TERMS = [
    'chips',
    'chipsuri',
    'snack',
    'snackuri',
    'popcorn',
    'floricele',
    'rollitos',
    'foietaj',
    'foietaje',
    'placinta',
    'placinte',
    'patiserie',
    'biscuiti',
    'crocant',
    'crocante',
    'crackers',
    'rondele',
    'napolitane',
    'croissant',
    'tortelloni',
    'ravioli',
    'risotto',
    'pizza',
    'wrap',
    'sandvis',
    'sandwich',
    'ketchup',
    'aroma de',
    'gust de',
  ];
  const queryHasCompositeTerm = COMPOSITE_OR_SNACK_TERMS.some((kw) =>
    normQuery.includes(kw)
  );

  const PROCESSED_OR_FLAVORED_TERMS = [
    'nuggets',
    'crispy',
    'cordon bleu',
    'snitel',
    'gujoane',
    'popcorn',
    'marinat',
    'marinata',
    'marinate',
    'crenvurst',
    'crenwurst',
    'parizer',
    'salam',
    'sunca',
    'pate',
    'chips',
    'condiment',
    'supa',
    'bors',
    'conserv',
    'aroma',
    'sos',
    'bebelus',
    'semipreparat',
    'congelat',
  ];

  const PET_FOOD_TERMS = [
    'pisic',
    'caine',
    'caini',
    'cat joy',
    'purina',
    'whiskas',
    'felix',
    'pedigree',
    'friskies',
    'gourmet gold',
    'hrana pisici',
    'hrana caini',
    'hr umeda',
    'hrana umeda',
    'hrana uscata',
    'animale de companie',
    'pet food',
    'batoane pisica',
    'one mini dog',
    'plic pisic',
    'litiera',
  ];
  const userAskedForPetFood =
    /\b(pisic\w*|cain\w*|cat|dog|pet|animale|litier\w*)\b/i.test(normQuery);
  const meatTokens = new Set(['pui', 'porc', 'vita', 'curcan']);
  const isGenericMeatQuery =
    activeTokens.some((t) => meatTokens.has(t)) &&
    !PROCESSED_OR_FLAVORED_TERMS.some((kw) => normQuery.includes(kw));
  const isGenericChickenIntent =
    activeTokens.length === 1 && activeTokens[0] === 'pui' && !detectedBrandNorm;

  const scored: MatchCandidate[] = [];

  if (activeTokens.length > 0) {
    for (const prod of catalogProducts) {
      const prodTitleNorm = normalizeScanText(prod.canonical_name);
      const prodTokens = Array.from(
        new Set([
          ...tokenizeAlphaNum(prod.canonical_name),
          ...tokenizeAlphaNum(prod.brand ?? ''),
          ...tokenizeAlphaNum(prod.subcategory ?? ''),
          ...(prod.search_aliases ?? []).flatMap((a) => tokenizeAlphaNum(a)),
          ...(prod.familyNames ?? []).flatMap((f) => tokenizeAlphaNum(f)),
          ...(prod.familyAliases ?? []).flatMap((fa) => tokenizeAlphaNum(fa)),
        ])
      );

      let coverage = 0;
      let titleCoverage = 0;
      const titleTokens = tokenizeAlphaNum(
        `${prod.canonical_name} ${prod.subcategory ?? ''} ${(prod.familyNames ?? []).join(' ')}`
      );

      if (hasDisjunction) {
        let bestCov = 0;
        let bestTitleCov = 0;
        for (const branch of disjunctiveBranches) {
          let bSum = 0;
          let bTitle = 0;
          for (const qt of branch) {
            bSum += tokenMatchStrength(qt, prodTokens);
            bTitle += tokenMatchStrength(qt, titleTokens);
          }
          const c = bSum / branch.length;
          const tc = bTitle / branch.length;
          if (c > bestCov) {
            bestCov = c;
            bestTitleCov = tc;
          }
        }
        coverage = bestCov;
        titleCoverage = bestTitleCov;
      } else {
        let tokenSum = 0;
        let coreTitleSum = 0;
        for (const qt of activeTokens) {
          const bestAny = tokenMatchStrength(qt, prodTokens);
          const bestTitle = tokenMatchStrength(qt, titleTokens);
          tokenSum += bestAny;
          coreTitleSum += bestTitle;
        }
        coverage = tokenSum / activeTokens.length;
        titleCoverage = coreTitleSum / activeTokens.length;
      }

      if (coverage < 0.55) continue;

      // Anti-pet food protection: dacă utilizatorul caută produse alimentare umane (pui, somon, carne etc.)
      // și nu a cerut explicit hrană pentru animale, excludem complet produsele pentru câini/pisici
      if (!userAskedForPetFood) {
        const prodAllText = normalizeScanText(
          `${prod.canonical_name} ${prod.category ?? ''} ${prod.subcategory ?? ''} ${prod.brand ?? ''}`
        );
        const isPetFood = PET_FOOD_TERMS.some((kw) => prodAllText.includes(kw));
        if (isPetFood) {
          continue;
        }
      }

      let score = coverage * 0.62 + titleCoverage * 0.24;
      const reasons: string[] = [];

      if (prodTitleNorm === normQuery) {
        score += 0.14;
        reasons.push('potrivire exactă');
      }

      // Brand comparison (strict anti-substitution)
      const prodBrandNorm = prod.brand ? normalizeScanText(prod.brand) : null;
      let brandMismatch = false;
      if (detectedBrandNorm) {
        if (prodBrandNorm && prodBrandNorm === detectedBrandNorm) {
          score += 0.14;
          reasons.push(`brand ${prod.brand}`);
        } else {
          score -= 0.45;
          brandMismatch = true;
        }
      }

      // Package size comparison (prevents auto-matching mismatched size without hiding valid alternatives)
      let sizeMismatch = false;
      if (querySize) {
        const prodSize = toBasePackageSize(
          prod.quantity_value,
          prod.quantity_unit,
          prod.package_size
        );
        if (prodSize) {
          if (prodSize.kind === querySize.kind) {
            const ratio = prodSize.baseValue / querySize.baseValue;
            if (ratio >= 0.9 && ratio <= 1.1) {
              score += 0.1;
              reasons.push(`gramaj ${prod.package_size ?? detectedSizeText}`);
            } else {
              score -= 0.16;
              sizeMismatch = true;
            }
          } else {
            score -= 0.16;
            sizeMismatch = true;
          }
        }
      }

      // Fat percentage check
      if (queryFat !== null) {
        const prodFat = extractFatNumber(prod.canonical_name);
        if (prodFat !== null) {
          if (Math.abs(prodFat - queryFat) <= 0.4) {
            score += 0.08;
            reasons.push(`${queryFat}% grăsime`);
          } else {
            score -= 0.12;
          }
        }
      }

      // Reward primary family match (e.g. "Lapte" family for "lapte", rather than "Ciocolată cu lapte")
      const familyMatchTokens = tokenizeAlphaNum((prod.familyNames ?? []).join(' '));
      if (familyMatchTokens.length > 0) {
        const famHits = activeTokens.reduce(
          (sum, qt) => sum + tokenMatchStrength(qt, familyMatchTokens),
          0
        );
        const famCoverage = famHits / activeTokens.length;
        if (famCoverage >= 0.85) {
          score += 0.08;
        }
      }

      // Slight tie-breaker against compound foods where query token follows "cu " ("Ciocolată cu lapte")
      if (activeTokens.length === 1) {
        const qt = activeTokens[0];
        if (
          prodTitleNorm.includes(` cu ${qt}`) &&
          !prodTitleNorm.startsWith(`${qt} `) &&
          !familyMatchTokens.includes(qt)
        ) {
          score -= 0.16;
        }
      }

      // Raw meat intent: prefer fresh butcher cuts ("varianta brută"), especially "Piept de pui" for generic "pui"
      if (isGenericMeatQuery) {
        const prodMetaNorm = normalizeScanText(
          `${prod.canonical_name} ${prod.category ?? ''} ${prod.subcategory ?? ''} ${(prod.familyNames ?? []).join(' ')}`
        );
        const isProcessed = PROCESSED_OR_FLAVORED_TERMS.some((kw) =>
          prodMetaNorm.includes(kw)
        );
        const isFreshMeatSection =
          prodMetaNorm.includes('pui si curcan') ||
          prodMetaNorm.includes('carne de pasare') ||
          prodMetaNorm.includes('carne, peste');

        if (isProcessed) {
          score -= 0.32;
        } else if (isFreshMeatSection) {
          score += 0.12;
          if (isGenericChickenIntent) {
            if (prodTitleNorm.includes('piept de pui') || prodTitleNorm.includes('piept dezosat')) {
              score += 0.18;
              reasons.push('variantă brută · piept de pui');
              if (prodTitleNorm.includes('dezosat')) {
                score += 0.04;
              }
            }
          }
        }
      }

      // Lactose-free check
      if (queryLactoseFree) {
        const prodHasLf =
          prodTitleNorm.includes('fara lactoza') ||
          prod.attributes?.lactose_free === true;
        if (prodHasLf) {
          score += 0.08;
        } else {
          score -= 0.35;
        }
      }

      // Slight preference when query is concise and matches product family tightly
      if (!brandMismatch && !sizeMismatch && titleTokens.length <= 5 && titleCoverage >= 0.9) {
        score += 0.03;
      }

      // Salmon / fresh fish dinner portion preference:
      // Dacă utilizatorul caută generic „somon” sau „file somon” fără a specifica un gramaj de 1kg,
      // favorizăm porțiile normale de masă/cină (150g - 350g caserolă) față de 1kg vrac/en-gros
      if (!querySize && /\b(somon|pastrav|dorada)\b/i.test(normQuery) && prodTitleNorm.includes('somon')) {
        const prodSize = toBasePackageSize(
          prod.quantity_value,
          prod.quantity_unit,
          prod.package_size
        );
        if (prodSize && prodSize.kind === 'mass') {
          if (prodSize.baseValue >= 150 && prodSize.baseValue <= 350) {
            score += 0.14;
            reasons.push('porție optimă cină (200g-250g)');
          } else if (prodSize.baseValue >= 900) {
            score -= 0.22;
          }
        }
      }

      // Anti-snack & anti-composite food protection:
      // Dacă utilizatorul caută un ingredient de gătit sau aliment de bază (sare, parmezan, bacon, etc.)
      // și NU a cerut explicit chipsuri / snacks / foietaj, penalizăm sever produsele compuse/aromate
      let isUnrequestedSnack = false;
      if (!queryHasCompositeTerm) {
        const prodAllText = normalizeScanText(
          `${prod.canonical_name} ${prod.category ?? ''} ${prod.subcategory ?? ''}`
        );
        const isCompositeOrSnack = COMPOSITE_OR_SNACK_TERMS.some((kw) =>
          prodAllText.includes(kw)
        );
        if (isCompositeOrSnack) {
          isUnrequestedSnack = true;
          // Dacă este un aliment de bază/ingredient căutat (sare, piper, parmezan, bacon, unt, lapte, somon, lămâi, cartofi, usturoi etc.)
          // NU îl admitem deloc ca snack compus (ex: Alfa Mini Rollitos pentru Parmezan, Napolitane cu lămâie pentru lămâi, Rondele orez pentru cartofi)
          const isBasicIngredientQuery =
            /\b(sare|piper|zahar|zahăr|faina|făină|malai|mălai|orez|paste|spaghete|drojdie|ulei|otet|oțet|unt|lapte|smantana|smântână|iaurt|parmezan|parmigiano|pecorino|cascaval|cașcaval|mozzarella|bacon|pancetta|oua|ouă|ou|somon|peste|pește|lamaie|lămâie|lamai|lămâi|cartof|cartofi|usturoi|ceapa|ceapă|morcov|morcovi|rosii|roșii|ardei|castravet|castraveti|castraveți|pui|porc|vita|vită|curcan|carne)\b/i.test(
              normQuery
            );
          if (isBasicIngredientQuery) {
            continue;
          }
          score -= 0.65;
          reasons.push('produs compus / gustare');
        }
      }

      // Echitate căutare rețete & disponibilitate multi-magazin (Store Ubiquity Factor)
      // Recompensează puternic alimentul comun prezent în >= 6 supermarketuri (Kaufland, Lidl, Penny, Carrefour, Auchan, Mega, Profi, Freshful, Sezamo)
      const storeCount = prod.store_count ?? 1;
      if (storeCount >= 6) {
        score += 0.24;
        reasons.push(`aliment comun în ${storeCount} magazine`);
      } else if (storeCount >= 2) {
        const ubiquityBoost = Math.min(0.18, Math.round((storeCount / 6) * 0.18 * 100) / 100);
        score += ubiquityBoost;
        reasons.push(`disponibil în ${storeCount} magazine`);
      } else if (!detectedBrandNorm && storeCount === 1) {
        // Penalizare pentru exclusivități dintr-un singur magazin când cererea este un ingredient generic de rețetă
        score -= 0.08;
      }

      // Izolare mărci proprii exclusive de magazin (MEGA, K-Classic, Pilos, San Fabio, etc.):
      // Dacă utilizatorul a căutat generic (ex: "lapte 1.5%", "iaurt grecesc", "pâine toast") fără să specifice
      // marca acelui magazin, produsul exclusiv este plasat după brandul comun, dar păstrat în candidați ca variantă „Brand propriu”.
      const cleanProdBrand = prodBrandNorm ?? '';
      const isPrivateLabel =
        Boolean(prod.attributes?.is_private_label) ||
        (Boolean(cleanProdBrand) && STORE_EXCLUSIVE_PRIVATE_LABEL_BRANDS.has(cleanProdBrand)) ||
        STORE_EXCLUSIVE_TITLE_PREFIX.test(prodTitleNorm);

      const userAskedForThisStoreBrand =
        (Boolean(detectedBrandNorm) &&
          (detectedBrandNorm === cleanProdBrand || normQuery.includes(cleanProdBrand))) ||
        (Boolean(cleanProdBrand) &&
          STORE_EXCLUSIVE_PRIVATE_LABEL_BRANDS.has(cleanProdBrand) &&
          normQuery.includes(cleanProdBrand)) ||
        STORE_EXCLUSIVE_TITLE_PREFIX.test(normQuery);

      const isUnrequestedPrivateLabel = isPrivateLabel && !userAskedForThisStoreBrand;
      if (isUnrequestedPrivateLabel) {
        score -= 0.14;
        reasons.push('marcă proprie de magazin');
      }

      const clampedScore = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
      const minThreshold = isUnrequestedPrivateLabel ? 0.42 : 0.45;
      if (clampedScore >= minThreshold) {
        scored.push({
          product: prod,
          score: clampedScore,
          reasons,
          isUnrequestedPrivateLabel,
          isUnrequestedSnack,
        });
      }
    }
  }

  scored.sort((a, b) => {
    // 1. Un snack compus sau o marcă proprie exclusivă de magazin NE-CERUTĂ explicit nu trebuie NICIODATĂ să depășească
    // un ingredient brut sau un brand național comun disponibil în mai multe supermarketuri
    const aSnack = a.isUnrequestedSnack ? 1 : 0;
    const bSnack = b.isUnrequestedSnack ? 1 : 0;
    if (aSnack !== bSnack) return aSnack - bSnack;

    const aPl = a.isUnrequestedPrivateLabel ? 1 : 0;
    const bPl = b.isUnrequestedPrivateLabel ? 1 : 0;
    if (aPl !== bPl) return aPl - bPl;

    // 1.5 Prioritate pentru alimentul comun în >= 6 magazine când ambele produse sunt relevante (scor apropiat <= 0.10)
    const aCommon6 = (a.product.store_count ?? 1) >= 6 ? 1 : 0;
    const bCommon6 = (b.product.store_count ?? 1) >= 6 ? 1 : 0;
    if (aCommon6 !== bCommon6 && Math.abs(b.score - a.score) <= 0.1) {
      return bCommon6 - aCommon6;
    }

    // 2. Dacă scorurile sunt foarte apropiate (diferență <= 0.06), produsul comun în mai multe magazine are prioritate
    const diff = b.score - a.score;
    if (Math.abs(diff) > 0.06) return diff;

    const bStores = b.product.store_count ?? 1;
    const aStores = a.product.store_count ?? 1;
    if (bStores !== aStores) return bStores - aStores;

    const aImg = a.product.image_url ? 1 : 0;
    const bImg = b.product.image_url ? 1 : 0;
    if (bImg !== aImg) return bImg - aImg;

    // Preferăm varianta mai economică dacă produsele au aceeași disponibilitate
    const aPrice = a.product.min_price ?? 9999;
    const bPrice = b.product.min_price ?? 9999;
    if (Math.abs(aPrice - bPrice) > 0.5) return aPrice - bPrice;

    return a.product.canonical_name.localeCompare(b.product.canonical_name, 'ro');
  });

  const nonSnackScored = scored.filter((c) => !c.isUnrequestedSnack);
  const topCandidate = scored[0] ?? null;
  const commonProduct =
    nonSnackScored.find((c) => !c.isUnrequestedPrivateLabel)?.product ??
    topCandidate?.product ??
    null;

  const plCandidate =
    nonSnackScored.find(
      (c) =>
        c.product.id !== commonProduct?.id &&
        (c.isUnrequestedPrivateLabel ||
          Boolean(c.product.attributes?.is_private_label) ||
          (c.product.brand &&
            STORE_EXCLUSIVE_PRIVATE_LABEL_BRANDS.has(normalizeScanText(c.product.brand))) ||
          STORE_EXCLUSIVE_TITLE_PREFIX.test(normalizeScanText(c.product.canonical_name)))
    )?.product ?? null;

  const commonPrice = commonProduct?.min_price ?? null;
  const pricedAlternatives = nonSnackScored.filter(
    (c) =>
      c.product.id !== commonProduct?.id &&
      c.product.min_price != null &&
      c.product.min_price > 0
  );

  const cheaperProduct =
    [...pricedAlternatives]
      .filter((c) => (commonPrice != null ? (c.product.min_price ?? 0) < commonPrice - 0.05 : true))
      .sort((a, b) => (a.product.min_price ?? 9999) - (b.product.min_price ?? 9999))[0]?.product ??
    plCandidate ??
    null;

  const premiumProduct =
    [...pricedAlternatives]
      .filter(
        (c) =>
          !c.isUnrequestedPrivateLabel &&
          c.product.id !== cheaperProduct?.id &&
          (commonPrice != null ? (c.product.min_price ?? 0) > commonPrice + 0.05 : true)
      )
      .sort((a, b) => {
        const aStores = a.product.store_count ?? 1;
        const bStores = b.product.store_count ?? 1;
        if (bStores !== aStores) return bStores - aStores;
        return (b.product.min_price ?? 0) - (a.product.min_price ?? 0);
      })[0]?.product ?? null;

  const tierVariants: ScannedTierVariants = {
    common: commonProduct,
    privateLabel: plCandidate,
    cheaper: cheaperProduct,
    premium: premiumProduct,
  };

  // Ne asigurăm că lista `candidates` (max 8) include și variantele de Brand propriu / Mai ieftin / Mai premium
  const baseCandidates = scored.slice(0, 6);
  const includedIds = new Set(baseCandidates.map((c) => c.product.id));
  for (const tierProd of [plCandidate, cheaperProduct, premiumProduct]) {
    if (tierProd && !includedIds.has(tierProd.id)) {
      const found = scored.find((c) => c.product.id === tierProd.id);
      if (found) {
        baseCandidates.push(found);
        includedIds.add(tierProd.id);
      }
    }
  }
  const candidates = baseCandidates.slice(0, 8);
  const top = candidates[0] ?? null;
  const second = candidates[1] ?? null;

  let matchStatus: ScannedMatchStatus = 'unmatched';
  let selectedProduct: CatalogIndexProduct | null = null;
  let matchConfidence = item.confidence * 0.5;

  if (top) {
    const gap = second ? top.score - second.score : top.score;
    const isRawChickenAutoDefault =
      isGenericChickenIntent &&
      top.score >= 0.78 &&
      (normalizeScanText(top.product.canonical_name).includes('piept de pui') ||
        normalizeScanText(top.product.canonical_name).includes('piept dezosat')) &&
      !PROCESSED_OR_FLAVORED_TERMS.some((kw) =>
        normalizeScanText(
          `${top.product.canonical_name} ${top.product.category ?? ''} ${top.product.subcategory ?? ''}`
        ).includes(kw)
      );
    const isDisjunctionClear = hasDisjunction && top.score >= 0.65;
    const isStrongMatch = top.score >= 0.74;
    const isClearWinner =
      !top.isUnrequestedPrivateLabel &&
      !top.isUnrequestedSnack &&
      ((top.score >= 0.84 && (!second || gap >= 0.12)) ||
        isRawChickenAutoDefault ||
        isDisjunctionClear ||
        isStrongMatch);

    if (isClearWinner) {
      matchStatus = 'matched';
      selectedProduct = top.product;
      matchConfidence = Math.round((top.score * 0.72 + item.confidence * 0.28) * 100) / 100;
    } else if (top.score >= 0.5) {
      // Variantă incertă -> nu asociem automat o variantă aleatorie
      matchStatus = 'ambiguous';
      selectedProduct = null;
      matchConfidence = Math.round((top.score * 0.7 + item.confidence * 0.3) * 100) / 100;
    }
  }

  return {
    localId,
    rawLine: item.rawLine,
    editedName: queryText,
    quantity: Math.max(1, Math.round(item.quantity)),
    unit: item.unit,
    brandHint: detectedBrand,
    packageSizeHint: detectedSizeText,
    ocrConfidence: item.confidence,
    matchConfidence,
    matchStatus,
    selectedProduct,
    candidates,
    tierVariants,
    included: true,
    userResolved: matchStatus === 'matched',
  };
}

export type ConfirmedScanBatch = {
  canonicalItems: { product: CatalogIndexProduct; quantity: number }[];
  manualItems: { name: string; quantity: number }[];
};

/**
 * Deduplicates confirmed review items by canonical product ID or normalized manual name,
 * summing quantities accurately before inserting into the active shopping list.
 */
export function deduplicateConfirmedScanItems(
  reviewItems: ScannedReviewItem[]
): ConfirmedScanBatch {
  const canonicalMap = new Map<
    string,
    { product: CatalogIndexProduct; quantity: number }
  >();
  const manualMap = new Map<string, { name: string; quantity: number }>();

  for (const item of reviewItems) {
    if (!item.included) continue;
    const qty = Math.max(1, Math.floor(item.quantity || 1));

    if (item.selectedProduct) {
      const existing = canonicalMap.get(item.selectedProduct.id);
      if (existing) {
        existing.quantity += qty;
      } else {
        canonicalMap.set(item.selectedProduct.id, {
          product: item.selectedProduct,
          quantity: qty,
        });
      }
    } else {
      const cleanName = item.editedName.trim();
      if (!cleanName) continue;
      const formatted = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      const key = normalizeScanText(formatted);
      if (!key) continue;
      const existing = manualMap.get(key);
      if (existing) {
        existing.quantity += qty;
      } else {
        manualMap.set(key, { name: formatted, quantity: qty });
      }
    }
  }

  return {
    canonicalItems: Array.from(canonicalMap.values()),
    manualItems: Array.from(manualMap.values()),
  };
}
