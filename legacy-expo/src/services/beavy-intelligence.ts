export type IntentMode =
  | 'generic_category'
  | 'attribute_constrained'
  | 'brand_locked';

export type ProductMatchTier =
  | 'exact_sku'
  | 'size_variant'
  | 'private_label_twin'
  | 'functional_substitute';

export type IntentConstraints = {
  fatPercent: number | null;
  lactoseFree: boolean;
  glutenFree: boolean;
  sugarFree: boolean;
  bio: boolean;
  wholegrain: boolean;
  waterType: 'still' | 'sparkling' | null;
  eggSize: 'S' | 'M' | 'L' | 'XL' | null;
  eggCount: number | null;
  targetBaseAmount: number | null;
  targetBaseKind: 'weight_g' | 'volume_ml' | 'count' | null;
  packageSizeLabel: string | null;
};

export type ParsedShoppingIntent = {
  rawText: string;
  normalizedText: string;
  coreQuery: string;
  intentMode: IntentMode;
  extractedQuantity: number;
  brandHint: string | null;
  constraints: IntentConstraints;
};

export type LearnedIntentResolution = {
  intentKey: string;
  productId: string;
  canonicalName: string;
  brand: string | null;
  packageSize: string | null;
  imageUrl: string | null;
  count: number;
  updatedAt: string;
};

export type UserPreferenceMemory = {
  learnedResolutions: Record<string, LearnedIntentResolution>;
  brandAffinity: Record<string, number>;
  rejectedProductIds: string[];
};

export const EMPTY_PREFERENCE_MEMORY: UserPreferenceMemory = {
  learnedResolutions: {},
  brandAffinity: {},
  rejectedProductIds: [],
};

export const DEFAULT_MIN_SPLIT_SAVINGS_RON = 8;

const KNOWN_GROCERY_BRANDS: string[] = [
  'Zuzu',
  'Napolact',
  'Olympus',
  'Covalact',
  'Albalact',
  'LaDorna',
  'Hochland',
  'Delaco',
  'President',
  'Philadelphia',
  'Muller',
  'Danone',
  'Activia',
  'Actimel',
  'Alpro',
  'Artesana',
  'Laptaria cu Caimac',
  'Boromir',
  'Vel Pitar',
  'Baneasa',
  'Pambac',
  'Barilla',
  'Panzani',
  'Monte Banato',
  'Deroni',
  'Scottis',
  'Riso Scotti',
  'Bunica',
  'Spornic',
  'Unisol',
  'Floriol',
  'Argus',
  'Monini',
  'Agricola',
  'Cocorico',
  'Fragedo',
  'Transavia',
  'Cris-Tim',
  'Fox',
  'Meda',
  'Caroli',
  'Sissi',
  'Matache Macelaru',
  'Reinert',
  'Aldis',
  'Unicarm',
  'Sergiana',
  'Moldovan',
  'Rio Mare',
  'Eva',
  'Mandy',
  'Scandia',
  'Bucegi',
  'Ardealul',
  'Capricii si Delicii',
  'Raureni',
  'Arovit',
  'Olympia',
  'Tomi',
  'Heinz',
  'Hellmanns',
  'Maggi',
  'Knorr',
  'Kamis',
  'Fuchs',
  'Coseli',
  'Dr. Oetker',
  'Pakmaya',
  'Margaritar',
  'Coronita',
  'Jacobs',
  'Tchibo',
  'Lavazza',
  'Doncafe',
  'Nescafe',
  'Fortuna',
  'Julius Meinl',
  'Lipton',
  'Fares',
  'Celmar',
  'Dorna',
  'Borsec',
  'Bucovina',
  'Aqua Carpatica',
  'Zizin',
  'Perla Harghitei',
  'Tusnad',
  'Biborteni',
  'Coca-Cola',
  'Pepsi',
  'Fanta',
  'Sprite',
  'Schweppes',
  'Mirinda',
  '7Up',
  'Tymbark',
  'Cappy',
  'Santal',
  'Prigat',
  'Granini',
  'Pfanner',
  'Red Bull',
  'Monster',
  'Hell',
  'Ursus',
  'Timisoreana',
  'Ciuc',
  'Bergenbier',
  'Heineken',
  'Becks',
  'Tuborg',
  'Carlsberg',
  'Peroni',
  'Kozel',
  'Birra Moretti',
  'Corona',
  'Stella Artois',
  'Neumarkt',
  'Bucegi Bere',
  'Milka',
  'Poiana',
  'Kandia',
  'Rom',
  'Heidi',
  'Lindt',
  'Ritter Sport',
  'Kinder',
  'Ferrero',
  'Nutella',
  'Raffaello',
  'Oreo',
  'Belvita',
  'Eugenia',
  'Joe',
  'Alka',
  'Boromir Croissant',
  '7Days',
  'Croco',
  'Chio',
  'Lays',
  'Pringles',
  'Star',
  'Gusto',
  'Loto',
  'Nutline',
  'Mogyi',
  'Edenia',
  'Bonduelle',
  'DGradina',
  'Frosta',
  'Iglo',
  'Toneli',
  'Agricola Oua',
  'Pufina',
  'Zewa',
  'Milde',
  'Ombia',
  'Cien',
  'W5',
  'Formil',
  'Lupilu',
  'Fairy',
  'Pur',
  'Somat',
  'Finish',
  'Ariel',
  'Persil',
  'Tide',
  'Dero',
  'Savex',
  'Perwoll',
  'Lenor',
  'Coccolino',
  'Silan',
  'Domestos',
  'Cif',
  'Duck',
  'Bref',
  'Pronto',
  'Mr. Proper',
  'Sano',
  'Igienol',
  'Colgate',
  'Sensodyne',
  'Parodontax',
  'Blend-a-Med',
  'Listerine',
  'Nivea',
  'Dove',
  'Rexona',
  'Old Spice',
  'Palmolive',
  'Fa',
  'Head & Shoulders',
  'Pantene',
  'Elseve',
  'Syoss',
  'Schauma',
  'Wash & Go',
  'Gillette',
  'Always',
  'Libresse',
  'Discreet',
  'Kotex',
  'Pampers',
  'Huggies',
  'Whiskas',
  'Pedigree',
  'Purina',
  'Felix',
  'Gourmet',
  'Friskies',
  'Pilos',
  'Milbona',
  'Pikok',
  'Camara Noastra',
  'Belbake',
  'Combino',
  'Freshona',
  'Sondey',
  'Alesto',
  'Bellarom',
  'Solevita',
  'Freeway',
  'Argus Lidl',
  'K-Classic',
  'K-Bio',
  'K-Free',
  'K-Favourites',
  '365',
  'Delhaize',
  'Gusturi Romanesti',
  'Nature Bio',
  'Care',
  'Hanul Boieresc',
  'Boni',
  'San Fabio',
  'Proxi',
  'Gradina Bunicii',
  'Aro',
  'Metro Chef',
];

const PRIVATE_LABEL_BRAND_SET = new Set([
  'pilos',
  'milbona',
  'pikok',
  'camara noastra',
  'belbake',
  'combino',
  'freshona',
  'sondey',
  'alesto',
  'bellarom',
  'solevita',
  'freeway',
  'cien',
  'w5',
  'formil',
  'lupilu',
  'k-classic',
  'kclassic',
  'k-bio',
  'k-free',
  'k-favourites',
  '365',
  'delhaize',
  'gusturi romanesti',
  'hanul boieresc',
  'boni',
  'san fabio',
  'proxi',
  'gradina bunicii',
  'aro',
  'metro chef',
  'carrefour',
  'carrefour classic',
  'carrefour bio',
  'carrefour extra',
  'simpl',
  'drag de romania',
  'auchan',
  'pouce',
  'actuel',
  'cosmia',
]);

export function normalizeIntelligenceText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Stratul 1: Intent Intelligence
 * Descompune cererea liberă a utilizatorului (ex. „2l lapte fără lactoză 1.5%”, „unt 82% zuzu”, „3 x apă plată 2L”)
 * în conceptul de bază, modul de intenție, cantitatea de bucăți și constrângerile tehnice.
 */
export function parseShoppingIntent(
  rawInput: string,
  explicitBrand?: string | null,
  explicitPackageSize?: string | null
): ParsedShoppingIntent {
  const rawText = String(rawInput ?? '').trim();
  const combinedSource = [rawText, explicitBrand, explicitPackageSize]
    .filter(Boolean)
    .join(' ');
  const normalizedText = normalizeIntelligenceText(combinedSource);

  let working = normalizeIntelligenceText(rawText).replace(/(\d),(\d)/g, '$1.$2');
  const fullNorm = normalizedText.replace(/(\d),(\d)/g, '$1.$2');

  // 1. Extragere multiplicator explicit de bucăți (ex: „2 x lapte 1L”, „3 sticle apă 2L”, „2 buc unt”, „2 pâini”)
  let extractedQuantity = 1;
  const multPrefix = working.match(
    /^(\d+)\s*(?:x|buc|bucati|sticle|sticla|pachete|pachet|cutii|cutie|caserole|caserola|borcane|borcan|doze|doza|plase|plasa|pungi|punga)\b\s*/i
  );
  if (multPrefix) {
    const parsedQty = Number(multPrefix[1]);
    if (Number.isFinite(parsedQty) && parsedQty >= 1 && parsedQty <= 99) {
      extractedQuantity = parsedQty;
      working = working.slice(multPrefix[0].length).trim();
    }
  } else {
    // Verificăm dacă e un număr direct urmat de un cuvânt care nu e unitate de măsură sau procentaj (ex. „2 paini”, „3 beri”)
    const bareNumberPrefix = working.match(/^(\d+)\s+([a-zăâîșț]+)/i);
    if (bareNumberPrefix) {
      const nextWord = bareNumberPrefix[2].toLowerCase();
      const isMeasurementUnit = /^(?:kg|g|gr|mg|l|litri|litru|ml|cl|%|procent)$/.test(nextWord);
      if (!isMeasurementUnit) {
        const parsedQty = Number(bareNumberPrefix[1]);
        if (Number.isFinite(parsedQty) && parsedQty >= 1 && parsedQty <= 99) {
          extractedQuantity = parsedQty;
          working = working.slice(bareNumberPrefix[1].length).trim();
        }
      }
    }
  }

  // 2. Constrângeri dietetice & funcționale
  const lactoseFree =
    /\b(fara\s+lactoza|zero\s+lactoza|delactozat|lactose\s*free|k-free)\b/.test(fullNorm);
  const glutenFree =
    /\b(fara\s+gluten|gluten\s*free)\b/.test(fullNorm);
  const sugarFree =
    /\b(fara\s+zahar|zero\s+zahar|0\s*%\s*zahar|sugar\s*free|\bzero\b)\b/.test(fullNorm);
  const bio =
    /\b(bio|ecologic|ecologica|ecologice|organic|organica|k-bio)\b/.test(fullNorm);
  const wholegrain =
    /\b(integral|integrala|integrale|wholegrain)\b/.test(fullNorm);

  let waterType: 'still' | 'sparkling' | null = null;
  if (/\b(apa)\b/.test(fullNorm)) {
    if (/\b(plata|necarbogazoasa)\b/.test(fullNorm)) {
      waterType = 'still';
    } else if (/\b(minerala|carbogazoasa|carbogazificata)\b/.test(fullNorm)) {
      waterType = 'sparkling';
    }
  }

  // 3. Procent de grăsime (ex. 1.5%, 3.5%, 82%, 65%, 20%, 10%, 0.1%)
  let fatPercent: number | null = null;
  const fatMatch = fullNorm.match(/\b(\d{1,2}(?:\.\d{1,2})?)\s*%/);
  if (fatMatch) {
    const val = Number(fatMatch[1]);
    if (Number.isFinite(val) && val >= 0 && val <= 99) {
      fatPercent = val;
    }
  }

  // 4. Ouă: mărime (S/M/L/XL) și număr în cofraj (6, 10, 15, 20, 30)
  let eggSize: 'S' | 'M' | 'L' | 'XL' | null = null;
  let eggCount: number | null = null;
  if (/\b(oua|ou)\b/.test(fullNorm)) {
    const sizeMatch = fullNorm.match(/\b(xl|l|m|s)\b/i);
    if (sizeMatch) {
      const upper = sizeMatch[1].toUpperCase();
      if (upper === 'S' || upper === 'M' || upper === 'L' || upper === 'XL') {
        eggSize = upper;
      }
    }
    const countMatch = fullNorm.match(/\b(6|8|10|12|15|20|30)\s*(?:buc|bucati|oua)?\b/);
    if (countMatch) {
      eggCount = Number(countMatch[1]);
    }
  }

  // 5. Gramaj / volum țintă (ex. 1L, 1.5L, 500g, 200g, 250ml)
  let targetBaseAmount: number | null = null;
  let targetBaseKind: 'weight_g' | 'volume_ml' | 'count' | null = null;
  let packageSizeLabel: string | null = explicitPackageSize?.trim() || null;

  const sizeMatch = fullNorm.match(
    /\b(\d+(?:\.\d+)?)\s*(kg|g|gr|mg|l|litri|litru|ml|cl)\b/
  );
  if (sizeMatch) {
    const val = Number(sizeMatch[1]);
    const unit = sizeMatch[2].toLowerCase();
    if (Number.isFinite(val) && val > 0) {
      if (unit === 'kg') {
        targetBaseAmount = Math.round(val * 1000);
        targetBaseKind = 'weight_g';
        if (!packageSizeLabel) packageSizeLabel = `${val}kg`;
      } else if (unit === 'g' || unit === 'gr') {
        targetBaseAmount = Math.round(val);
        targetBaseKind = 'weight_g';
        if (!packageSizeLabel) packageSizeLabel = `${val}g`;
      } else if (unit === 'l' || unit === 'litri' || unit === 'litru') {
        targetBaseAmount = Math.round(val * 1000);
        targetBaseKind = 'volume_ml';
        if (!packageSizeLabel) packageSizeLabel = `${val}L`;
      } else if (unit === 'ml') {
        targetBaseAmount = Math.round(val);
        targetBaseKind = 'volume_ml';
        if (!packageSizeLabel) packageSizeLabel = `${val}ml`;
      } else if (unit === 'cl') {
        targetBaseAmount = Math.round(val * 10);
        targetBaseKind = 'volume_ml';
        if (!packageSizeLabel) packageSizeLabel = `${val * 10}ml`;
      }
    }
  } else if (eggCount) {
    targetBaseAmount = eggCount;
    targetBaseKind = 'count';
    if (!packageSizeLabel) packageSizeLabel = `${eggCount} buc`;
  }

  // 6. Detectare brand explicit
  let brandHint: string | null =
    explicitBrand &&
    explicitBrand.trim().length > 0 &&
    normalizeIntelligenceText(explicitBrand) !== 'orice brand'
      ? explicitBrand.trim()
      : null;

  if (!brandHint) {
    for (const known of KNOWN_GROCERY_BRANDS) {
      const kNorm = normalizeIntelligenceText(known);
      if (kNorm.length < 3) continue;
      const re = new RegExp(`(?:^|\\s)${escapeRegExp(kNorm)}(?:$|\\s)`, 'i');
      if (re.test(fullNorm)) {
        brandHint = known;
        break;
      }
    }
  }

  // 7. Curățare `coreQuery` (conceptul de bază fără cantități/procente/brand)
  let coreQuery = working
    .replace(/\b(fara\s+lactoza|zero\s+lactoza|delactozat|fara\s+gluten|fara\s+zahar|zero\s+zahar)\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*%/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|gr|mg|l|litri|litru|ml|cl|buc|bucati)\b/g, ' ');

  if (brandHint) {
    const bNorm = normalizeIntelligenceText(brandHint);
    if (bNorm.length >= 3) {
      const bRe = new RegExp(`(?:^|\\s)${escapeRegExp(bNorm)}(?:$|\\s)`, 'gi');
      const stripped = coreQuery.replace(bRe, ' ').replace(/\s+/g, ' ').trim();
      if (stripped.length >= 2) {
        coreQuery = stripped;
      }
    }
  }

  coreQuery = coreQuery
    .replace(/\b(de|cu|la|in|din|pentru|sticla|pachet|cutie|caserola|cofraj)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (coreQuery.length < 2) {
    coreQuery = working.trim() || rawText.toLowerCase();
  }

  // 8. Clasificare mod de intenție
  const hasAnyConstraint =
    fatPercent !== null ||
    lactoseFree ||
    glutenFree ||
    sugarFree ||
    bio ||
    wholegrain ||
    waterType !== null ||
    eggSize !== null ||
    eggCount !== null ||
    targetBaseAmount !== null;

  let intentMode: IntentMode = 'generic_category';
  if (brandHint) {
    intentMode = 'brand_locked';
  } else if (hasAnyConstraint) {
    intentMode = 'attribute_constrained';
  }

  return {
    rawText,
    normalizedText,
    coreQuery,
    intentMode,
    extractedQuantity,
    brandHint,
    constraints: {
      fatPercent,
      lactoseFree,
      glutenFree,
      sugarFree,
      bio,
      wholegrain,
      waterType,
      eggSize,
      eggCount,
      targetBaseAmount,
      targetBaseKind,
      packageSizeLabel,
    },
  };
}

/**
 * Stratul 2: Product Intelligence
 * Evaluează cât de bine răspunde un produs din catalog la intenția structurată a utilizatorului
 * și aplică memoria de preferințe (Stratul 4).
 */
export function evaluateCandidateAgainstIntent(params: {
  intent: ParsedShoppingIntent;
  candidate: {
    id: string;
    canonical_name: string;
    brand: string | null;
    package_size: string | null;
    quantity_value?: number | null;
    quantity_unit?: string | null;
    attributes?: Record<string, unknown>;
  };
  preferenceMemory?: UserPreferenceMemory | null;
  learnPreferencesEnabled?: boolean;
}): {
  compatible: boolean;
  scoreBoost: number;
  tier: ProductMatchTier;
} {
  const {
    intent,
    candidate,
    preferenceMemory = null,
    learnPreferencesEnabled = true,
  } = params;

  const candText = normalizeIntelligenceText(
    `${candidate.canonical_name} ${candidate.brand ?? ''} ${candidate.package_size ?? ''}`
  ).replace(/(\d),(\d)/g, '$1.$2');
  const candBrandNorm = normalizeIntelligenceText(candidate.brand);
  const { constraints } = intent;

  // 1. Verificare constrângeri obligatorii (hard filters)
  if (constraints.lactoseFree) {
    const candLactoseFree =
      /\b(fara\s+lactoza|zero\s+lactoza|delactozat|lactose\s*free|k-free)\b/.test(candText) ||
      candidate.attributes?.lactose_free === true;
    if (!candLactoseFree) {
      return { compatible: false, scoreBoost: -1, tier: 'functional_substitute' };
    }
  }

  if (constraints.glutenFree) {
    const candGlutenFree =
      /\b(fara\s+gluten|gluten\s*free)\b/.test(candText) ||
      candidate.attributes?.gluten_free === true;
    if (!candGlutenFree) {
      return { compatible: false, scoreBoost: -1, tier: 'functional_substitute' };
    }
  }

  if (constraints.sugarFree) {
    const candSugarFree =
      /\b(fara\s+zahar|zero\s+zahar|0\s*%\s*zahar|sugar\s*free|\bzero\b|max)\b/.test(candText) ||
      candidate.attributes?.sugar_free === true;
    if (!candSugarFree) {
      return { compatible: false, scoreBoost: -1, tier: 'functional_substitute' };
    }
  }

  if (constraints.bio) {
    const candBio =
      /\b(bio|ecologic|ecologica|ecologice|organic|organica|k-bio)\b/.test(candText) ||
      candidate.attributes?.is_bio === true;
    if (!candBio) {
      return { compatible: false, scoreBoost: -1, tier: 'functional_substitute' };
    }
  }

  if (constraints.waterType === 'still') {
    if (/\b(carbogazoasa|carbogazificata)\b/.test(candText) && !/\bnecarbogazoasa\b/.test(candText)) {
      return { compatible: false, scoreBoost: -1, tier: 'functional_substitute' };
    }
  } else if (constraints.waterType === 'sparkling') {
    if (/\b(plata|necarbogazoasa)\b/.test(candText)) {
      return { compatible: false, scoreBoost: -1, tier: 'functional_substitute' };
    }
  }

  let scoreBoost = 0;

  // 2. Procent de grăsime
  if (constraints.fatPercent !== null) {
    const candFatMatch = candText.match(/\b(\d{1,2}(?:\.\d{1,2})?)\s*%/);
    if (candFatMatch) {
      const candFat = Number(candFatMatch[1]);
      const diff = Math.abs(candFat - constraints.fatPercent);
      const tolerance = constraints.fatPercent >= 30 ? 5 : 0.6;
      if (diff > tolerance) {
        return { compatible: false, scoreBoost: -1, tier: 'functional_substitute' };
      }
      scoreBoost += 0.18;
    } else {
      scoreBoost -= 0.08;
    }
  }

  // 3. Gramaj / volum țintă
  if (constraints.targetBaseAmount !== null && constraints.targetBaseKind !== null) {
    const candSizeMatch = candText.match(
      /\b(\d+(?:\.\d+)?)\s*(kg|g|gr|l|litri|litru|ml|cl)\b/
    );
    if (candSizeMatch) {
      const val = Number(candSizeMatch[1]);
      const u = candSizeMatch[2].toLowerCase();
      let candBase: number | null = null;
      let candKind: 'weight_g' | 'volume_ml' | null = null;
      if (u === 'kg') {
        candBase = val * 1000;
        candKind = 'weight_g';
      } else if (u === 'g' || u === 'gr') {
        candBase = val;
        candKind = 'weight_g';
      } else if (u === 'l' || u === 'litri' || u === 'litru') {
        candBase = val * 1000;
        candKind = 'volume_ml';
      } else if (u === 'ml') {
        candBase = val;
        candKind = 'volume_ml';
      } else if (u === 'cl') {
        candBase = val * 10;
        candKind = 'volume_ml';
      }

      if (candBase !== null && candKind === constraints.targetBaseKind) {
        const ratio = candBase / constraints.targetBaseAmount;
        if (ratio >= 0.9 && ratio <= 1.1) {
          scoreBoost += 0.16;
        } else if (ratio >= 0.7 && ratio <= 1.35) {
          scoreBoost += 0.05;
        } else {
          scoreBoost -= 0.15;
        }
      }
    }
  }

  // 4. Potrivire Brand și clasificare MatchTier
  const isPrivateLabel =
    PRIVATE_LABEL_BRAND_SET.has(candBrandNorm) ||
    candidate.attributes?.is_private_label === true;

  let tier: ProductMatchTier = isPrivateLabel
    ? 'private_label_twin'
    : 'functional_substitute';

  if (intent.brandHint) {
    const targetBrandNorm = normalizeIntelligenceText(intent.brandHint);
    const matchesBrand =
      candBrandNorm === targetBrandNorm ||
      candText.includes(targetBrandNorm);
    if (matchesBrand) {
      scoreBoost += 0.25;
      tier = 'exact_sku';
    } else {
      scoreBoost -= 0.1;
    }
  }

  // 5. Stratul 4: Preference Intelligence (dacă e permis de utilizator)
  if (learnPreferencesEnabled && preferenceMemory) {
    if (preferenceMemory.rejectedProductIds?.includes(candidate.id)) {
      scoreBoost -= 0.35;
    }
    const learned = preferenceMemory.learnedResolutions?.[intent.coreQuery];
    if (learned) {
      if (learned.productId === candidate.id) {
        scoreBoost += 0.4;
        tier = 'exact_sku';
      } else if (
        learned.brand &&
        candBrandNorm &&
        normalizeIntelligenceText(learned.brand) === candBrandNorm
      ) {
        scoreBoost += 0.18;
      }
    }
    if (candBrandNorm && preferenceMemory.brandAffinity?.[candBrandNorm]) {
      const affinityCount = preferenceMemory.brandAffinity[candBrandNorm];
      scoreBoost += Math.min(0.15, affinityCount * 0.03);
    }
  }

  return {
    compatible: true,
    scoreBoost,
    tier,
  };
}

/**
 * Stratul 3: Basket Intelligence
 * Decide dacă împărțirea coșului în 2 magazine merită efortul suplimentar de deplasare/comandă.
 */
export function isMultiStoreSplitWorthwhile(params: {
  improvesCoverage: boolean;
  savingsRon: number;
  bestSingleTotalRon: number;
  minSplitSavingsRon?: number;
}): boolean {
  const {
    improvesCoverage,
    savingsRon,
    bestSingleTotalRon,
    minSplitSavingsRon = DEFAULT_MIN_SPLIT_SAVINGS_RON,
  } = params;

  // Dacă un singur magazin nu are toate produsele, iar mixul de 2 magazine acoperă mai multe produse, merită întotdeauna afișat.
  if (improvesCoverage) return true;

  if (savingsRon <= 0) return false;

  // Pentru coșuri mici (< 80 RON), acceptăm un prag proporțional (minim 4 RON și minim 6% din coș);
  // pentru coșuri normale, folosim pragul minim de rentabilitate (implicit 8 RON).
  const dynamicThreshold =
    bestSingleTotalRon > 0 && bestSingleTotalRon < 80
      ? Math.max(4, Math.min(minSplitSavingsRon, bestSingleTotalRon * 0.06))
      : minSplitSavingsRon;

  return savingsRon >= dynamicThreshold;
}

/**
 * Stratul 4: Preference Intelligence — Înregistrarea unei alegeri explicite a utilizatorului.
 */
export function recordLearnedProductSelection(
  memory: UserPreferenceMemory,
  rawQueryOrName: string,
  product: {
    id: string;
    canonical_name: string;
    brand?: string | null;
    package_size?: string | null;
    image_url?: string | null;
  }
): UserPreferenceMemory {
  const parsed = parseShoppingIntent(rawQueryOrName);
  const key = parsed.coreQuery;
  if (!key || key.length < 2) return memory;

  const existing = memory.learnedResolutions[key];
  const nextCount =
    existing && existing.productId === product.id ? existing.count + 1 : 1;

  const nextResolutions: Record<string, LearnedIntentResolution> = {
    ...memory.learnedResolutions,
    [key]: {
      intentKey: key,
      productId: product.id,
      canonicalName: product.canonical_name,
      brand: product.brand ?? null,
      packageSize: product.package_size ?? null,
      imageUrl: product.image_url ?? null,
      count: nextCount,
      updatedAt: new Date().toISOString(),
    },
  };

  const nextBrandAffinity = { ...memory.brandAffinity };
  if (product.brand) {
    const bKey = normalizeIntelligenceText(product.brand);
    if (bKey && bKey !== 'orice brand') {
      nextBrandAffinity[bKey] = (nextBrandAffinity[bKey] ?? 0) + 1;
    }
  }

  // Dacă produsul era în lista de respinse, îl scoatem pentru că utilizatorul l-a ales explicit acum
  const nextRejected = memory.rejectedProductIds.filter((id) => id !== product.id);

  return {
    learnedResolutions: nextResolutions,
    brandAffinity: nextBrandAffinity,
    rejectedProductIds: nextRejected,
  };
}

/**
 * Stratul 4: Preference Intelligence — Înregistrarea unui produs înlocuit/respins de utilizator.
 */
export function recordRejectedProduct(
  memory: UserPreferenceMemory,
  rejectedProductId: string
): UserPreferenceMemory {
  if (!rejectedProductId) return memory;
  const currentRejected = memory.rejectedProductIds ?? [];
  if (currentRejected.includes(rejectedProductId)) return memory;
  return {
    ...memory,
    rejectedProductIds: [rejectedProductId, ...currentRejected].slice(0, 100),
  };
}
