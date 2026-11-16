import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const BRAND_ALIASES = {
  albalact: ['albalact'],
  napolact: ['napolact'],
  olympus: ['olympus'],
  danone: ['danone'],
  hochland: ['hochland'],
  delaco: ['delaco'],
  mirdatod: ['mirdatod'],
  chitriuc: ['chitriuc'],
  monor: ['monor'],
  nucet: ['nucet'],
  ladorna: ['la dorna', 'ladorna'],
  covalact: ['covalact', 'covalact de tara'],
  'covalact de tara': ['covalact de tara', 'covalact'],
  muller: ['muller', 'müller'],
  'laptaria cu caimac': ['laptaria cu caimac'],
  'aqua carpatica': ['aqua carpatica'],
  'vel pitar': ['vel pitar'],
  'riso scotti': ['riso scotti'],
  'grania pambac': ['grania', 'pambac', 'grania pambac'],
  'la minut lux': ['la minut', 'la minut lux'],
  'french toast': ['french toast'],
  'greek land': ['greek land'],
  silvaniabio: ['silvania bio', 'silvaniabio', 'silvania'],
  cristim: ['cris tim', 'cristim', 'cris-tim'],
  'matache macelaru': ['matache macelaru', 'matache macelarul'],
  sissi: ['sissi'],
  meda: ['meda'],
  fragedo: ['fragedo'],
  cocorico: ['cocorico'],
  'napolact bio': ['napolact bio', 'napolact'],
  'nescafe dolce gusto': ['nescafe dolce gusto', 'dolce gusto'],
  'nescafe brasero': ['nescafe brasero', 'brasero'],
  'dr oetker-guseppe': ['dr oetker-guseppe', 'dr oetker guseppe', 'guseppe'],
  'budureasca clasic': ['budureasca clasic', 'budureasca'],
  'purcari 1827': ['purcari 1827', 'purcari'],
  'pom-bar': ['pom-bar', 'pom bar'],
  'kit kat': ['kit kat', 'kitkat'],
  'jack daniel s': ['jack daniel s', 'jack daniels', 'jack daniel'],
  'costa d oro': ['costa d oro', 'costa doro'],
  'carte d or': ['carte d or', 'carte dor'],
  zuzu: ['zuzu', 'zuzu divin', 'zuzu max', 'zuzu bifidus'],
  pepsi: ['pepsi', 'pepsi cola'],
  'coca-cola': ['coca-cola', 'coca cola'],
  'sapte spice': ['sapte spice'],
  'reinert martinel': ['reinert martinel', 'martinel'],
};

export const SUBTYPE_CONFLICT_GROUPS = [
  ['lapte', 'iaurt', 'chefir', 'kefir', 'sana', 'lapte batut', 'smantana', 'unt', 'telemea', 'cascaval', 'branza', 'mozzarella', 'mascarpone', 'ricotta', 'crema de branza', 'cottage', 'halloumi', 'feta', 'fagaras', 'ayran', 'urda'],
  ['faina', 'malai', 'gris', 'cuscus', 'cous cous', 'paste', 'orez', 'fasole', 'linte', 'naut', 'mazare', 'porumb'],
  ['spaghetti', 'penne', 'fusilli', 'farfalle', 'rigatoni', 'tagliatelle', 'lasagna', 'casarecce', 'taitei', 'macaroni', 'melcisori', 'alfabet', 'express', 'spirale', 'fundite', 'tortiglioni', 'cornetti', 'linguine', 'bucatini', 'orecchiette', 'fidea'],
  ['plata', 'carbogazoasa', 'mineral', 'minerala', 'twist', 'zero'],
  ['alba', 'neagra', 'integrala', 'integrale', 'integrali', 'fullkorn', 'whole', 'graham', 'seminte'],
  ['secara', 'graham', 'campeneasca', 'franzela', 'toast'],
  ['boabe', 'macinata', 'solubila', 'capsule', 'instant'],
  ['crema', 'velvet', 'kronung', 'monarch', 'espresso', 'intense', 'selection', 'selected', 'gold', 'elita', 'green', 'qualita oro', 'qualita rossa', 'crema e gusto', 'il mattino', 'tierras'],
  ['3in1', '3 in 1', '2in1', '2 in 1', 'cappuccino', 'latte', 'macchiato'],
  ['masline', 'floarea soarelui', 'floarea-soarelui', 'rapita', 'porumb'],
  ['vaca', 'oaie', 'capra', 'bivolita'],
  ['dulce', 'picant', 'iute'],
  ['100%', 'nectar', 'nettare'],
  ['menta', 'musetel', 'salvie', 'tei', 'verde', 'negru', 'ghimbir', 'fructe de padure', 'fragu', 'echinacea', 'sunatoare', 'soc', 'hibiscus', 'rooibos'],
  ['ridichi', 'hrean', 'verdeturi', 'verdeata', 'usturoi', 'ceapa', 'somon', 'ardei'],
  ['basmati', 'arborio', 'jasmine', 'venere', 'salbatic', 'camolino', 'pilaf', 'risotto', 'sarmale', 'bob rotund', 'bob lung'],
  ['arahide', 'alune', 'caju', 'fistic', 'migdale', 'pecan', 'macadamia', 'dovleac', 'floarea soarelui'],
  ['pesto genovese', 'pesto rosso', 'sauce tomate', 'pomodoro', 'arrabbiata', 'bolognese', 'ketchup', 'mustar', 'maioneza', 'sos', 'sweet chilli', 'bbq', 'tzatziki', 'tartar', 'otet', 'dressing'],
  ['pentru paste', 'pentru muraturi', 'pentru pui', 'pentru porc', 'pentru gratar', 'pentru peste', 'pentru cartofi', 'pentru pizza', 'pentru sarmale', 'pentru friptura', 'pentru miel', 'pentru ciorba', 'pentru salata', 'pentru guacamole'],
  ['ras', 'pane', 'cuburi', 'mini', 'tartinabil'],
  ['smantana', 'sunca'],
  ['sinaia', 'sibiu', 'banatean', 'bacau', 'muscel', 'victoria', 'vara', 'palaciego', 'chorizo', 'presat uscat', 'porc extra'],
  ['mici', 'mititei', 'gulas', 'carne tocata', 'carnati', 'crenvursti', 'parizer', 'salam', 'sunca', 'bacon', 'costita', 'kaizer', 'muschi', 'cotlet', 'ceafa', 'pastrama', 'toba', 'pate'],
  ['turte', 'pufuleti', 'covrigei', 'sticksuri', 'biscuiti', 'napolitane', 'fursecuri', 'chec', 'cozonac', 'croissant'],
  ['rosie', 'alba', 'brun'],
  ['sec', 'demisec', 'demidulce', 'dulce'],
  ['fume', 'sauvignon blanc', 'chardonnay', 'pinot grigio', 'pinot noir', 'cabernet sauvignon', 'merlot', 'feteasca neagra', 'feteasca alba', 'feteasca regala', 'rara neagra', 'negru de purcari', 'rosu de purcari', 'tamaioasa', 'muscat ottonel', 'busuioaca', 'riesling', 'syrah', 'shiraz', 'cupaj', 'aligote'],
  ['finest', '7 yo', '12 yo', '15 yo', '18 yo', 'honey', 'fire'],
];

export const KEYWORD_ALIASES = {
  faina: ['faina', 'flour', 'wheat flour'],
  malai: ['malai', 'corn flour', 'cornmeal'],
  unt: ['unt', 'butter'],
  lapte: ['lapte', 'milk'],
  oua: ['oua', 'ou', 'eggs'],
  zahar: ['zahar', 'sugar', 'indulcitori'],
  zero: ['zero', 'indulcitori'],
  twist: ['twist', 'lamaie'],
  lamaie: ['lamaie', 'twist', 'lemon'],
  orez: ['orez', 'rice'],
  rosii: ['rosii', 'tomato', 'tomatoes', 'pomodori', 'passata', 'polpa'],
  paste: ['paste', 'pasta'],
  spaghetti: ['spaghetti', 'spaghete'],
  iaurt: ['iaurt', 'yogurt', 'yoghurt'],
  grecesc: ['grecesc', 'greek'],
  apa: ['apa', 'water'],
  plata: ['plata', 'still'],
  carbogazoasa: ['carbogazoasa', 'sparkling'],
  usturoi: ['usturoi', 'garlic'],
  busuioc: ['busuioc', 'basil', 'basilic'],
  mere: ['mere', 'apple'],
  portocale: ['portocale', 'orange'],
  smantana: ['smantana', 'cream', 'sour cream'],
  clasic: ['clasic', 'classic', 'original', 'natur'],
  dulce: ['dulce', 'sweet', 'mild'],
};

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro-RO')
    .replace(/[^a-z0-9.,%\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value) {
  const norm = normalizeText(value);
  if (!norm) return [];
  const stop = new Set([
    'de', 'din', 'cu', 'si', 'la', 'in', 'pe', 'pentru', 'min', 'max', 'ca', 'the', 'and', 'with',
  ]);
  return norm.split(/\s+/).filter((t) => t.length >= 2 && !stop.has(t));
}

export function isValidEanCheckDigit(code) {
  const digits = String(code ?? '').trim();
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false;
  let sum = 0;
  const len = digits.length;
  for (let i = 0; i < len - 1; i++) {
    const d = Number(digits[i]);
    const weight = (len - 1 - i) % 2 === 1 ? 3 : 1;
    sum += d * weight;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[len - 1]);
}

/**
 * Clasifică codul de bare și separă explicit codurile interne de cântar (`20`-`29`) / PLU
 * de GTIN-urile globale comerciale.
 */
export function classifyBarcode(rawCode) {
  const code = String(rawCode ?? '').replace(/\s+/g, '').trim();
  if (!code) return null;

  if (!/^\d+$/.test(code)) {
    return { code, barcodeType: 'retailer_plu', isGlobalGtin: false, validCheckDigit: false };
  }

  if (code.length < 8) {
    return { code, barcodeType: 'retailer_plu', isGlobalGtin: false, validCheckDigit: false };
  }

  const validCheckDigit = isValidEanCheckDigit(code);
  if (code.length === 13 && /^2[0-9]/.test(code)) {
    return { code, barcodeType: 'weigh_scale', isGlobalGtin: false, validCheckDigit };
  }

  if (code.length === 8 && /^2[0-9]/.test(code)) {
    return { code, barcodeType: 'retailer_plu', isGlobalGtin: false, validCheckDigit };
  }

  const barcodeType =
    code.length === 8
      ? 'gtin8'
      : code.length === 12
      ? 'gtin12'
      : code.length === 14
      ? 'gtin14'
      : 'gtin13';

  return {
    code,
    barcodeType,
    isGlobalGtin: validCheckDigit,
    validCheckDigit,
  };
}

export function toBaseUnit(val, unitRaw, packCount = 1) {
  if (!Number.isFinite(val) || val <= 0) return null;
  const u = String(unitRaw ?? '').replace(/\./g, '').toLowerCase().trim();
  if (u === 'kg') return { kind: 'mass', baseValue: val * 1000, baseUnit: 'g', packCount };
  if (u === 'g' || u === 'gr') return { kind: 'mass', baseValue: val, baseUnit: 'g', packCount };
  if (u === 'l' || u === 'litri' || u === 'litru') {
    return { kind: 'volume', baseValue: val * 1000, baseUnit: 'ml', packCount };
  }
  if (u === 'cl') return { kind: 'volume', baseValue: val * 10, baseUnit: 'ml', packCount };
  if (u === 'ml') return { kind: 'volume', baseValue: val, baseUnit: 'ml', packCount };
  if (u.startsWith('buc') || u === 'pcs') {
    return { kind: 'count', baseValue: val, baseUnit: 'pcs', packCount };
  }
  return null;
}

export function parseQuantity(raw) {
  const text = String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro-RO')
    .replace(/,/g, '.')
    .replace(/[^a-z0-9.%+\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  const bonusMulti = text.match(
    /(\d+)\s*\+\s*(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|l|litri|litru|ml|cl|buc\.?|bucati|pcs)(?=\b|\s|$|[,;)])/
  );
  if (bonusMulti) {
    const count = Number(bonusMulti[1]) + Number(bonusMulti[2]);
    const unitVal = Number(bonusMulti[3]);
    return toBaseUnit(count * unitVal, bonusMulti[4], count);
  }

  const multi = text.match(
    /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|l|litri|litru|ml|cl|buc\.?|bucati|pcs)(?=\b|\s|$|[,;)])/
  );
  if (multi) {
    const count = Number(multi[1]);
    const unitVal = Number(multi[2]);
    return toBaseUnit(count * unitVal, multi[3], count);
  }

  const single = text.match(
    /(\d+(?:\.\d+)?)\s*(kg|g|gr|l|litri|litru|ml|cl|buc\.?|bucati|pcs)(?=\b|\s|$|[,;)])/
  );
  if (single) {
    return toBaseUnit(Number(single[1]), single[2], 1);
  }
  return null;
}

export function computeNormalizedUnitPrice(price, parsedQty) {
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0 || !parsedQty || parsedQty.baseValue <= 0) {
    return { normalizedUnitPrice: null, normalizedUnitLabel: null };
  }
  if (parsedQty.kind === 'mass') {
    return {
      normalizedUnitPrice: Math.round(((p * 1000) / parsedQty.baseValue) * 100) / 100,
      normalizedUnitLabel: 'RON/kg',
    };
  }
  if (parsedQty.kind === 'volume') {
    return {
      normalizedUnitPrice: Math.round(((p * 1000) / parsedQty.baseValue) * 100) / 100,
      normalizedUnitLabel: 'RON/L',
    };
  }
  if (parsedQty.kind === 'count') {
    return {
      normalizedUnitPrice: Math.round((p / parsedQty.baseValue) * 100) / 100,
      normalizedUnitLabel: 'RON/buc',
    };
  }
  return { normalizedUnitPrice: null, normalizedUnitLabel: null };
}

export function extractFatPercentages(text) {
  const norm = normalizeText(text).replace(/,/g, '.');
  const results = [];
  for (const m of norm.matchAll(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*%/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (Number.isFinite(a) && a >= 0 && a <= 100) results.push(a);
    if (Number.isFinite(b) && b >= 0 && b <= 100) results.push(b);
  }
  for (const m of norm.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    const val = Number(m[1]);
    if (Number.isFinite(val) && val >= 0 && val <= 100 && !results.includes(val)) {
      results.push(val);
    }
  }
  return results;
}

export function getBrandCandidateNames(brand) {
  const norm = normalizeText(brand);
  const aliases = BRAND_ALIASES[norm] ?? [norm];
  const noSpaces = norm.replace(/\s+/g, '');
  return Array.from(new Set([...aliases, noSpaces])).filter(Boolean);
}

export function brandMatches(beavyBrand, externalBrandsRaw) {
  if (!beavyBrand) return false;
  const offStr = Array.isArray(externalBrandsRaw)
    ? externalBrandsRaw.join(' ')
    : String(externalBrandsRaw ?? '');
  const offNorm = normalizeText(offStr).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const offCompact = offNorm.replace(/\s+/g, '');
  if (!offNorm) return false;
  const candidates = getBrandCandidateNames(beavyBrand).map((c) =>
    c.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  );
  return candidates.some(
    (c) => Boolean(c) && (offNorm.includes(c) || offCompact.includes(c.replace(/\s+/g, '')))
  );
}

export function normalizeBrandKey(rawBrand) {
  return normalizeText(rawBrand).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildBrandPhraseIndex(canonicals) {
  const phraseToCanonicals = new Map();
  const firstWordToPhrases = new Map();

  const registerPhrase = (phraseRaw, prod) => {
    const phrase = normalizeBrandKey(phraseRaw);
    if (!phrase || phrase.length < 2) return;
    if (!phraseToCanonicals.has(phrase)) phraseToCanonicals.set(phrase, new Set());
    phraseToCanonicals.get(phrase).add(prod);

    const firstWord = phrase.split(' ')[0];
    if (!firstWordToPhrases.has(firstWord)) firstWordToPhrases.set(firstWord, new Set());
    firstWordToPhrases.get(firstWord).add(phrase);
  };

  for (const p of canonicals) {
    if (!p.brand) continue;
    registerPhrase(p.brand, p);
    const normKey = normalizeBrandKey(p.brand);
    for (const [aliasKey, variants] of Object.entries(BRAND_ALIASES)) {
      const normVariants = [normalizeBrandKey(aliasKey), ...variants.map(normalizeBrandKey)];
      if (normVariants.includes(normKey)) {
        for (const v of normVariants) registerPhrase(v, p);
      }
    }
  }

  return { phraseToCanonicals, firstWordToPhrases };
}

export function findBrandCandidatesForTitle(title, { phraseToCanonicals, firstWordToPhrases }) {
  const normKey = normalizeBrandKey(title);
  if (!normKey) return [];
  const normTitle = ` ${normKey} `;
  const words = normKey.split(/\s+/).filter(Boolean);
  const candidates = new Set();

  for (const w of words) {
    const phrases = firstWordToPhrases.get(w);
    if (!phrases) continue;
    for (const phrase of phrases) {
      if (normTitle.includes(` ${phrase} `)) {
        const prods = phraseToCanonicals.get(phrase);
        if (prods) {
          for (const p of prods) candidates.add(p);
        }
      }
    }
  }
  return Array.from(candidates);
}

/**
 * Evaluează strict potrivirea dintre un produs canonic Beavy și un produs extern
 * (folosit atât pentru Open Food Facts cât și pentru feed-uri de retaileri fără EAN).
 */
export function scoreCanonicalCandidate(beavyProduct, externalHit) {
  const reasons = [];
  const code = String(externalHit.code ?? '').trim();
  const genericRaw = Array.isArray(externalHit.generic_name)
    ? externalHit.generic_name[0]
    : externalHit.generic_name;
  const extNameAllRaw = [
    externalHit.product_name_ro,
    externalHit.product_name,
    genericRaw,
    externalHit.abbreviated_product_name,
  ]
    .filter(Boolean)
    .join(' ');
  const extImage = externalHit.image_front_url || externalHit.image_url || '';
  const extQuantity = externalHit.quantity || '';
  const requireImage = externalHit.requireImage !== false;

  if (requireImage && (!code || !extImage)) {
    return { confidence: 0, validEan: false, quantityExact: false, reasons: ['Lipsă cod sau imagine front'] };
  }

  if (beavyProduct.brand) {
    if (!brandMatches(beavyProduct.brand, externalHit.brands || extNameAllRaw)) {
      return { confidence: 0, validEan: false, quantityExact: false, reasons: ['Brand diferit'] };
    }
  } else if (externalHit.brands) {
    // Unbranded canonical item vs branded retailer item -> block wrong cross-match
    return { confidence: 0, validEan: false, quantityExact: false, reasons: ['Produs canonic vrac vs produs cu brand'] };
  }

  const beavyNameNorm = normalizeText(beavyProduct.canonical_name);
  const extNameNorm = normalizeText(extNameAllRaw);

  if (!extNameNorm || (beavyProduct.brand && extNameNorm === normalizeText(beavyProduct.brand))) {
    return { confidence: 0.15, validEan: false, quantityExact: false, reasons: ['Denumire incompletă (doar brand)'] };
  }

  let score = beavyProduct.brand ? 0.35 : 0.25;
  reasons.push(beavyProduct.brand ? '+ Brand verificat' : '+ Categorie/vrac fără brand');

  // Lactose-free guard (title-based so naturally dairy-free items like Alpro/Schar match cleanly)
  const beavyLactoseFree = beavyNameNorm.includes('fara lactoza');
  const extLactoseFree =
    extNameNorm.includes('fara lactoza') || extNameNorm.includes('lactose free');
  if (beavyLactoseFree !== extLactoseFree) {
    return { confidence: 0.1, validEan: false, quantityExact: false, reasons: ['Conflict fără lactoză vs standard'] };
  }

  // Gluten-free guard
  const beavyGlutenFree = beavyNameNorm.includes('fara gluten');
  const extGlutenFree =
    extNameNorm.includes('fara gluten') || extNameNorm.includes('gluten free');
  if (beavyGlutenFree && !extGlutenFree) {
    score -= 0.25;
    reasons.push('- Nu menționează fără gluten');
  }

  // Wholegrain / Integrale guard (only for grain/bakery items — "lapte integral" refers to full-fat milk)
  const isMilkComparison = /\blapte\b/.test(beavyNameNorm) && /\blapte\b/.test(extNameNorm);
  if (!isMilkComparison) {
    const beavyWhole = /\b(integrali|integrala|integrale|integral|fullkorn|whole)\b/.test(beavyNameNorm);
    const extWhole = /\b(integrali|integrala|integrale|integral|fullkorn|whole)\b/.test(extNameNorm);
    if (beavyWhole !== extWhole) {
      return { confidence: 0.12, validEan: false, quantityExact: false, reasons: ['Conflict integral / standard'] };
    }
  }

  // UHT vs pasteurized milk preference (UHT vs fresh milk are distinct products)
  const beavyUht = /\buht\b/.test(beavyNameNorm);
  const extUht = /\buht\b/.test(extNameNorm);
  if (isMilkComparison && beavyUht !== extUht) {
    return { confidence: 0.12, validEan: false, quantityExact: false, reasons: ['Conflict lapte UHT vs lapte de consum'] };
  }
  if (beavyUht && !extUht) {
    score -= 0.15;
    reasons.push('- Produs Beavy UHT');
  } else if (!beavyUht && extUht) {
    score -= 0.15;
    reasons.push('- Produs extern UHT');
  } else if (beavyUht && extUht) {
    score += 0.08;
    reasons.push('+ Potrivire UHT');
  }

  // BIO / Ecologic guard (checks titles + labels)
  const extLabelsNorm = normalizeText(
    `${Array.isArray(externalHit.labels_tags) ? externalHit.labels_tags.join(' ') : ''} ${externalHit.labels ?? ''}`
  );
  const beavyBio = /\b(bio|organic|eco|ecologic|ecologica)\b/.test(beavyNameNorm);
  const extBio =
    /\b(bio|organic|eco|ecologic|ecologica)\b/.test(extNameNorm) ||
    /\b(en organic|eu organic|ro eco)\b/.test(extLabelsNorm);
  if (beavyBio && !extBio) {
    score -= 0.35;
    reasons.push('- Produs Beavy BIO/Ecologic, lipsește extern');
  } else if (!beavyBio && extBio) {
    score -= 0.35;
    reasons.push('- Produs extern BIO/Ecologic, Beavy standard');
  } else if (beavyBio && extBio) {
    score += 0.08;
    reasons.push('+ Potrivire BIO');
  }

  // Decaf / Caffeine-free guard
  const decafRe = /\b(decofeinizat|decofeinizata|decaff|decaf|fara cofeina|caffeine[- ]?free)\b/;
  if (decafRe.test(beavyNameNorm) !== decafRe.test(extNameNorm)) {
    return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict decofeinizat vs standard'] };
  }

  // Vegan / Vegetal / De post guard (never cross-match meat/dairy with vegan/vegetal substitutes)
  const veganRe = /\b(vegetal|vegetala|vegan|vegana|de post)\b/;
  if (veganRe.test(beavyNameNorm) !== veganRe.test(extNameNorm)) {
    return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict vegetal / de post vs standard'] };
  }

  // Chocolate base type & cheese-flavored baking mix guard (conflict only when both state an explicit different chocolate type)
  if (/\bciocolata\b/.test(beavyNameNorm)) {
    const chocoType = (s) => {
      if (/\bciocolata\s+(?:[a-z]+\s+)?alba\b/.test(s)) return 'alba';
      if (/\bciocolata\s+(?:[a-z]+\s+)?(?:neagra|amaruie)\b/.test(s)) return 'neagra';
      if (/\bciocolata\s+(?:[a-z]+\s+)?cu\s+lapte\b/.test(s)) return 'lapte';
      return null;
    };
    const bChoc = chocoType(beavyNameNorm);
    const eChoc = chocoType(extNameNorm);
    if (bChoc && eChoc && bChoc !== eChoc) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: [`Conflict tip ciocolată (${bChoc} vs ${eChoc})`] };
    }
    if (!bChoc && eChoc === 'neagra') {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict ciocolată standard vs amăruie/neagră'] };
    }
  }
  if (/\b(cascaval|branza|salam|sunca|costita|slana|pastrama)\b/.test(beavyNameNorm)) {
    const smokedRe = /\b(afumat|afumata|smoked)\b/;
    if (smokedRe.test(beavyNameNorm) !== smokedRe.test(extNameNorm)) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict afumat vs standard'] };
    }
  }
  if (/\bcafea\s+solubila\b/.test(beavyNameNorm)) {
    const solSubRe = /\b(espresso|intense|crema|velvet|gold)\b/;
    const bSol = beavyNameNorm.match(solSubRe)?.[1] ?? null;
    const eSol = extNameNorm.match(solSubRe)?.[1] ?? null;
    if (bSol !== eSol) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict sub-gamă cafea solubilă'] };
    }
  }
  if (/\bpandispan\b/.test(beavyNameNorm)) {
    const saltyMixRe = /\b(telemea|cascaval|branza)\b/;
    if (saltyMixRe.test(beavyNameNorm) !== saltyMixRe.test(extNameNorm)) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict mix dulce vs sărat cu brânză'] };
    }
  }

  // Alcohol-free & iconic wine/whisky edition guard
  const isAlcoholDrink = /\b(bere|vin|cidru|spumant|prosecco|aperitiv|radler|hugo|whisky)\b/.test(beavyNameNorm);
  if (isAlcoholDrink) {
    const alcoFreeRe = /\b(fara alcool|non[- ]?alcoolic|0\.0%|0%|alcohol[- ]?free)\b/;
    if (alcoFreeRe.test(beavyNameNorm) !== alcoFreeRe.test(extNameNorm)) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict fără alcool vs cu alcool'] };
    }
    const iconicCues = [
      'negru de purcari', 'rosu de purcari', 'fume', 'origini', 'sauvignon blanc',
      'cabernet', 'feteasca neagra', 'rara neagra', '7 yo', '12 yo', '15 yo', '18 yo',
      'finest', 'black label', 'double black', 'gold label',
    ];
    for (const cue of iconicCues) {
      const escaped = cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`);
      if (re.test(beavyNameNorm) !== re.test(extNameNorm)) {
        return { confidence: 0.08, validEan: false, quantityExact: false, reasons: [`Conflict soi/ediție alcool (${cue})`] };
      }
    }
  }

  // Olive oil grade guard & Gelatin sheets vs powder & Sugar/Coffee sachet/cube/baghete format guard
  if (/\bgelatina\b/.test(beavyNameNorm)) {
    const sheetsRe = /\b(foi|foite)\b/;
    if (sheetsRe.test(beavyNameNorm) !== sheetsRe.test(extNameNorm)) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict foi de gelatină vs pudră'] };
    }
  }
  if (/\bulei\b/.test(beavyNameNorm)) {
    const normOilB = beavyNameNorm.replace(/\bextra[- ]?virgin\b/g, 'extravirgin');
    const normOilE = extNameNorm.replace(/\bextra[- ]?virgin\b/g, 'extravirgin');
    if (/\bextravirgin\b/.test(normOilB) !== /\bextravirgin\b/.test(normOilE)) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict ulei extravirgin vs standard'] };
    }
    if (/\b(pomace|turte de masline|sansa)\b/.test(normOilB) !== /\b(pomace|turte de masline|sansa)\b/.test(normOilE)) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict ulei pomace vs pur'] };
    }
  }
  if (/\b(zahar|indulcitor)\b/.test(beavyNameNorm)) {
    const normSugB = beavyNameNorm.replace(/\b(baghete|pliculete|plicuri|plic)\b/g, 'plic');
    const normSugE = extNameNorm.replace(/\b(baghete|pliculete|plicuri|plic)\b/g, 'plic');
    if (/\bplic\b/.test(normSugB) !== /\bplic\b/.test(normSugE)) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict zahăr la plic/baghete vs vrac'] };
    }
    if (/\b(cubic|cuburi|pudra)\b/.test(normSugB) !== /\b(cubic|cuburi|pudra)\b/.test(normSugE)) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict formă zahăr (cubic/pudră/cristal)'] };
    }
  }

  // Unsalted / light / salt guard (both directions)
  const beavySalted = /\b(cu sare|sarat|sarata|sarate|demi[- ]?sel|salted)\b/.test(beavyNameNorm);
  const extSalted = /\b(cu sare|sarat|sarata|sarate|demi[- ]?sel|salted)\b/.test(extNameNorm);
  const beavyUnsalted = /\b(nesarat|nesarata|nesarate|fara sare|unsalted)\b/.test(beavyNameNorm);
  const extUnsalted = /\b(nesarat|nesarata|nesarate|fara sare|unsalted)\b/.test(extNameNorm);
  if (((beavyUnsalted || !beavySalted) && extSalted) || (beavySalted && extUnsalted)) {
    return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict sărat vs nesărat/standard'] };
  }
  const beavyLight = /\b(light|lighter|degresat|continut redus de grasime|redus de grasime|0%|0\.1%)\b/.test(beavyNameNorm);
  const extLight = /\b(light|lighter|continut redus de grasime|redus de grasime)\b/.test(extNameNorm);
  if (!beavyLight && extLight) {
    return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict Light / conținut redus de grăsime vs standard'] };
  }

  // Plain / natural / cu smantana / standard milk & juice vs added flavors or multi-fruit variants
  const flavorWords = [
    'stafide', 'merisoare', 'merisoarele', 'goji', 'capsuni', 'visine', 'cirese', 'zmeura', 'afine',
    'fructe', 'vanilie', 'ciocolata', 'cacao', 'caramel', 'piersici', 'caise', 'banane', 'mango',
    'portocale', 'mere', 'pere', 'rodie', 'struguri', 'lamaie', 'lime', 'aronia', 'ananas', 'kiwi', 'pepene',
    'hrean', 'ridichi', 'verdeturi', 'verdeata', 'usturoi', 'ceapa', 'somon', 'ardei', 'piper',
    'busuioc', 'trufe', 'menta', 'ghimbir', 'barista', 'protein', 'proteic', 'cafea',
    'dovleac', 'morcovi', 'broccoli', 'spanac', 'mazare', 'telina', 'rosii', 'paprika', 'boia',
    'sriracha', 'chilli', 'curry', 'chimion', 'susan', 'oregano', 'rozmarin', 'masline',
    'ciuperci', 'cascaval', 'pui', 'vita', 'curcan', 'fistic', 'soc', 'rom',
  ];
  const extraFlavorRe = new RegExp(`\\b(${flavorWords.join('|')})\\b`);
  const beavyPlain =
    /\b(natural|natur|simplu|simpla|clasic|clasica)\b/.test(beavyNameNorm) ||
    beavyNameNorm.includes('cu smantana') ||
    /\b(lapte|iaurt|chefir|kefir|sana|branza)\b/.test(beavyNameNorm);
  if (beavyPlain && !extraFlavorRe.test(beavyNameNorm) && extraFlavorRe.test(extNameNorm)) {
    return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict produs simplu/natur vs cu arome/specialitate'] };
  }
  const isFlavorSensitiveCategory =
    /\b(suc|nectar|apa|limonada|ceai|sirop|bautura|pepsi|cola|fanta|sprite|schweppes|bere|cidru|vin|energizant|cafea|cappuccino|esenta|budinca|desert|iaurt|lapte|sana|chefir|smantana|branza|crema|ciocolata|inghetata|piure|preparat|biscuiti|napolitane|bomboane|jeleuri|croissant|prajitura|batoane|dulceata|gem|chips|saratele|covrigei|crackers|pufuleti|alune|seminte|sos|ketchup|cereale|musli|granola|amestec)\b/.test(
      beavyNameNorm
    );
  const normalizeFlavorName = (nameNorm) => {
    let s = nameNorm
      .replace(/\blamaie\s+verde\b/g, 'lime')
      .replace(/\blemon\b/g, 'lamaie')
      .replace(/\bvitel\b/g, 'vita')
      .replace(/\bcapsune\b/g, 'capsuni')
      .replace(/\bmar\b/g, 'mere')
      .replace(/\bpara\b/g, 'pere')
      .replace(/\bpiersica\b/g, 'piersici')
      .replace(/\bcaisa\b/g, 'caise')
      .replace(/\bbanana\b/g, 'banane')
      .replace(/\bbrocoli\b/g, 'broccoli')
      .replace(/\bciuperca\b/g, 'ciuperci')
      .replace(/\bchili\b/g, 'chilli')
      .replace(/\bmorcov\b/g, 'morcovi');
    if (/\b(bautura|pepsi|cola|fanta|sprite|schweppes)\b/.test(s)) {
      s = s.replace(/\btwist\b/g, 'lamaie');
    }
    return s;
  };
  if (isFlavorSensitiveCategory) {
    const beavyFlavNorm = normalizeFlavorName(beavyNameNorm);
    const extFlavNorm = normalizeFlavorName(extNameNorm);
    const extFlavorTokens = new Set(flavorWords.filter((w) => new RegExp(`\\b${w}\\b`).test(extFlavNorm)));
    const beavyFlavorTokens = new Set(flavorWords.filter((w) => new RegExp(`\\b${w}\\b`).test(beavyFlavNorm)));
    const mismatch =
      [...extFlavorTokens].some((w) => !beavyFlavorTokens.has(w)) ||
      [...beavyFlavorTokens].some((w) => !extFlavorTokens.has(w));
    if (mismatch) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict aromă / ingrediente adiționale'] };
    }
    const zeroSugarRe = /\b(zero(?:\s+zahar)?|fara\s+zahar|no\s+sugar|sugar\s+free|max|diet|cu\s+indulcitori)\b/;
    if (zeroSugarRe.test(beavyNameNorm) !== zeroSugarRe.test(extNameNorm)) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict zahăr vs zero zahăr / cu îndulcitori'] };
    }
  }
  // Specialty modifiers (e.g. Barista, Vitamina D3, Ciocolată, Proteic, Iaurt pe biscuiți) on either side must align
  for (const modRe of [
    /\bbarista\b/,
    /\b(ciocolata|cacao)\b/,
    /\b(perlata|perle|perlat)\b/,
    /\b(proteic|protein)\b/,
    /\b(vitamina|vit\.)\b/,
  ]) {
    if (modRe.test(beavyNameNorm) !== modRe.test(extNameNorm)) {
      return { confidence: 0.1, validEan: false, quantityExact: false, reasons: ['Conflict variantă specială'] };
    }
  }
  if (/\b(biscuiti|cereale|musli)\b/.test(beavyNameNorm) && /\biaurt\b/.test(beavyNameNorm) !== /\biaurt\b/.test(extNameNorm)) {
    return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict biscuiți/cereale cu iaurt vs simplu'] };
  }
  if (/\bsalam\s+de\s+sibiu\b/.test(beavyNameNorm) && /\b(curcan|pui)\b/.test(extNameNorm)) {
    return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict Salam de Sibiu vs pasăre'] };
  }

  // Specialty rice tokens must match symmetrically when present (prevents Basmati <-> Basmati & Salbatic)
  if (/\borez\b/.test(beavyNameNorm)) {
    const riceTypes = ['basmati', 'arborio', 'jasmine', 'venere', 'salbatic', 'camolino', 'negru', 'rosu'];
    const bRice = riceTypes.filter((t) => new RegExp(`\\b${t}\\b`).test(beavyNameNorm));
    const eRice = riceTypes.filter((t) => new RegExp(`\\b${t}\\b`).test(extNameNorm));
    if (bRice.length > 0 && eRice.length > 0 && (bRice.length !== eRice.length || bRice.some((t) => !eRice.includes(t)))) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict soi de orez'] };
    }
  }

  // Meat & Fish species symmetric check
  const meatSpeciesWords = ['porc', 'pui', 'vita', 'curcan', 'miel', 'oaie', 'rata', 'gasca', 'somon', 'ton', 'macrou', 'hering', 'pastrav', 'cod', 'sardine', 'creveti'];
  const bSpecies = meatSpeciesWords.filter((sp) => new RegExp(`\\b${sp}\\b`).test(beavyNameNorm));
  const eSpecies = meatSpeciesWords.filter((sp) => new RegExp(`\\b${sp}\\b`).test(extNameNorm));
  if (bSpecies.length > 0 && eSpecies.length > 0) {
    if (bSpecies.length !== eSpecies.length || bSpecies.some((sp) => !eSpecies.includes(sp))) {
      return { confidence: 0.08, validEan: false, quantityExact: false, reasons: [`Conflict specie (${bSpecies.join('+')} vs ${eSpecies.join('+')})`] };
    }
  }

  // Cross-language cornmeal vs wheat flour & white sugar vs cane/brown sugar
  const beavyMalai = /\bmalai\b/.test(beavyNameNorm);
  const extWheatFlour =
    /\b(faina|wheat flour|white flour)\b/.test(extNameNorm) && !/\b(corn|malai)\b/.test(extNameNorm);
  const beavyWheatFlour = /\bfaina\b/.test(beavyNameNorm);
  const extCornFlour = /\b(malai|corn flour|cornmeal)\b/.test(extNameNorm);
  if ((beavyMalai && extWheatFlour) || (beavyWheatFlour && extCornFlour)) {
    return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict mălai vs făină de grâu'] };
  }
  const beavyWhiteSugar = /\bzahar\b/.test(beavyNameNorm) && /\balb\b/.test(beavyNameNorm);
  const extCaneSugar = /\b(brun|cane|trzcinowy|nerafinat|nierafinowany)\b/.test(extNameNorm);
  if (beavyWhiteSugar && extCaneSugar) {
    return { confidence: 0.08, validEan: false, quantityExact: false, reasons: ['Conflict zahăr alb vs brun/trestie'] };
  }

  // Distinctive variant tokens required when specified in Beavy
  const extCombinedVariant = normalizeText(
    `${extNameAllRaw} ${externalHit.categories ?? ''} ${externalHit.ingredients_text ?? ''}`
  );
  const requiredVariants = [
    [/\btwist\b/, /\b(twist|lamaie)\b/, 'Twist'],
    [/\bzero\b/, /\b(zero|fara zahar|no sugar|cu indulcitori|indulcitori)\b/, 'Zero'],
    [/\bbasmati\b/, /\bbasmati\b/, 'Basmati'],
    [/\barborio\b/, /\barborio\b/, 'Arborio'],
    [/\bjasmine\b/, /\bjasmine\b/, 'Jasmine'],
    [/\bsusan\b/, /\b(susan|sesame)\b/, 'Susan'],
    [/\bafumat\b/, /\b(afumat|afumata|smoked)\b/, 'Afumat'],
  ];
  for (const [bRe, oRe, lbl] of requiredVariants) {
    if (bRe.test(beavyNameNorm) && !oRe.test(extCombinedVariant)) {
      score -= 0.28;
      reasons.push(`- Lipsește varianta specifică (${lbl})`);
    }
  }

  // Animal species & plant-milk origin guard (goat/sheep/buffalo/plant must align explicitly when specified)
  const speciesOrPlantGroups = [
    /\b(capra|capră)\b/,
    /\b(oaie)\b/,
    /\b(bivolita|bivoliță)\b/,
    /\b(magarita|măgăriță)\b/,
    /\b(soia|soy)\b/,
    /\b(migdale|almond)\b/,
    /\b(ovaz|oat)\b/,
    /\b(cocos|coconut)\b/,
  ];
  for (const spRe of speciesOrPlantGroups) {
    if (spRe.test(beavyNameNorm) !== spRe.test(extNameNorm)) {
      return {
        confidence: 0.08,
        validEan: false,
        quantityExact: false,
        reasons: ['Conflict specie / sursă (ex: vacă vs capră/oaie/vegetal)'],
      };
    }
  }

  // Subtype conflict guard (boundary-aware & canonical synonyms)
  const normalizeForSubtypes = (s) =>
    s
      .replace(/\bspaghete\b/g, 'spaghetti')
      .replace(/\bextra[- ]?virgin\b/g, 'extravirgin')
      .replace(/\b(rasa)\b/g, 'ras')
      .replace(/\btartinabila\b/g, 'tartinabil');
  const bSubNorm = normalizeForSubtypes(beavyNameNorm);
  const eSubNorm = normalizeForSubtypes(extNameNorm);
  const hasSubPhrase = (text, kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}(?=$|\\s|[,;)])`).test(text);
  };

  for (const group of SUBTYPE_CONFLICT_GROUPS) {
    const beavyTerms = group.filter((kw) => hasSubPhrase(bSubNorm, kw));
    const extTerms = group.filter((kw) => hasSubPhrase(eSubNorm, kw));
    if (beavyTerms.length > 0 && extTerms.length > 0) {
      const overlap = beavyTerms.some((t) => extTerms.includes(t));
      if (!overlap) {
        return {
          confidence: 0.08,
          validEan: false,
          quantityExact: false,
          reasons: [`Conflict subtip (${beavyTerms.join('/')} vs ${extTerms.join('/')})`],
        };
      }
    }
  }

  // Token overlap (excluding brand tokens, size/numeric noise & processing words verified via fat%)
  const dairyMetaNoise = new Set(['consum', 'pasteurizat', 'pasteurizata', 'semidegresat', 'grasime', 'integral', 'integrala']);
  const isLapteItem = /\blapte\b/.test(beavyNameNorm) && /\blapte\b/.test(extNameNorm);
  const brandTokens = new Set(tokenize(beavyProduct.brand));
  const beavyTokens = tokenize(beavyProduct.canonical_name).filter(
    (t) =>
      !brandTokens.has(t) &&
      !/^\d/.test(t) &&
      !['kg', 'gr', 'ml', 'buc', 'plicuri'].includes(t) &&
      !(isLapteItem && dairyMetaNoise.has(t))
  );
  const extTokens = new Set(
    tokenize(`${extNameAllRaw} ${externalHit.categories ?? ''} ${externalHit.ingredients_text ?? ''}`)
  );

  if (beavyTokens.length > 0) {
    let matchedTokens = 0;
    for (const tok of beavyTokens) {
      const variants = KEYWORD_ALIASES[tok] ?? [tok];
      const hitMatch = variants.some(
        (v) => extTokens.has(v) || [...extTokens].some((ot) => ot.includes(v) || v.includes(ot))
      );
      if (hitMatch) {
        matchedTokens++;
      }
    }
    if (matchedTokens === 0) {
      return {
        confidence: 0,
        validEan: false,
        quantityExact: false,
        reasons: ['Niciun termen specific al produsului nu coincide'],
      };
    }
    const ratio = matchedTokens / beavyTokens.length;
    score += ratio * 0.28;
    reasons.push(`+ Potrivire termeni ${(ratio * 100).toFixed(0)}%`);
  }

  // Fat percentage check (ignore 100% e.g. juice; verify against text + nutriments.fat_100g)
  const beavyFatRaw = [];
  if (beavyProduct.attributes?.fat_percentage != null) {
    beavyFatRaw.push(Number(beavyProduct.attributes.fat_percentage));
  }
  if (beavyProduct.attributes?.fat_percentage_min != null) {
    beavyFatRaw.push(Number(beavyProduct.attributes.fat_percentage_min));
  }
  if (beavyProduct.attributes?.fat_percentage_max != null) {
    beavyFatRaw.push(Number(beavyProduct.attributes.fat_percentage_max));
  }
  if (beavyFatRaw.length === 0) {
    beavyFatRaw.push(...extractFatPercentages(beavyProduct.canonical_name));
  }
  const beavyFat = beavyFatRaw.filter((f) => Number.isFinite(f) && f < 99);
  const extFat = extractFatPercentages(extNameAllRaw).filter((f) => Number.isFinite(f) && f < 99);
  const extNutrFat =
    externalHit.nutriments?.fat_100g != null && Number.isFinite(Number(externalHit.nutriments.fat_100g))
      ? Number(externalHit.nutriments.fat_100g)
      : null;

  if (beavyFat.length > 0) {
    if (extFat.length > 0) {
      const fatMatch = beavyFat.some((bf) => extFat.some((ef) => Math.abs(bf - ef) <= 0.25));
      if (fatMatch) {
        score += 0.14;
        reasons.push(`+ Grăsime ${beavyFat[0]}%`);
      } else {
        return {
          confidence: 0.1,
          validEan: false,
          quantityExact: false,
          reasons: [`Conflict grăsime text (${beavyFat[0]}% vs ${extFat[0]}%)`],
        };
      }
    }
    if (extNutrFat != null) {
      const delta = Math.abs(beavyFat[0] - extNutrFat);
      if (delta <= 2.5) {
        score += extFat.length === 0 ? 0.12 : 0.04;
        reasons.push(`+ Grăsime nutrițională verificată (${extNutrFat}g/100g)`);
      } else if (delta > 3.5) {
        return {
          confidence: 0.1,
          validEan: false,
          quantityExact: false,
          reasons: [`Conflict grăsime nutrițională (${beavyFat[0]}% vs ${extNutrFat}g/100g)`],
        };
      }
    }
  }

  // Quantity / Shrinkflation & Multipack check (±3% tolerance)
  const parsedFromPkg = parseQuantity(beavyProduct.package_size || beavyProduct.canonical_name);
  const beavyQty =
    parsedFromPkg && parsedFromPkg.packCount > 1
      ? parsedFromPkg
      : beavyProduct.quantity_value && beavyProduct.quantity_unit
      ? toBaseUnit(
          Number(beavyProduct.quantity_value),
          beavyProduct.quantity_unit,
          parsedFromPkg?.packCount ?? 1
        )
      : parsedFromPkg;
  const extQtyFromField = parseQuantity(extQuantity);
  const extQtyFromName = parseQuantity(extNameAllRaw);
  const extQty =
    extQtyFromName && extQtyFromName.packCount > (extQtyFromField?.packCount ?? 1)
      ? extQtyFromName
      : extQtyFromField || extQtyFromName;

  let quantityExact = false;
  if (beavyQty && extQty) {
    if (beavyQty.kind === extQty.kind) {
      const diffRatio = Math.abs(beavyQty.baseValue - extQty.baseValue) / beavyQty.baseValue;
      if (diffRatio <= 0.03) {
        const beavyPack = beavyQty.packCount || 1;
        const extPack = extQty.packCount || 1;
        let packCompatible = beavyPack === extPack;
        if (!packCompatible) {
          const portionMatch =
            new RegExp(`\\b${extPack}\\s*(portii|buc|bucati)\\b`).test(beavyNameNorm) ||
            new RegExp(`\\b${beavyPack}\\s*(portii|buc|bucati)\\b`).test(extNameNorm);
          const isSmallTwinPack =
            Math.max(beavyPack, extPack) === 2 &&
            Math.min(beavyPack, extPack) === 1 &&
            beavyQty.kind === 'mass' &&
            beavyQty.baseValue <= 160 &&
            !/\b(porumb|naut|ton|fasole|orez|cafea|pate|pesto|sos|smantana|iaurt)\b/.test(
              beavyNameNorm
            );
          packCompatible = portionMatch || isSmallTwinPack;
        }
        if (packCompatible) {
          score += 0.22;
          quantityExact = true;
          reasons.push(`+ Gramaj identic (${extQuantity || beavyProduct.package_size})`);
        } else {
          return {
            confidence: 0.1,
            validEan: false,
            quantityExact: false,
            reasons: [`Conflict multipack (${beavyPack}x vs ${extPack}x)`],
          };
        }
      } else {
        score -= 0.42;
        reasons.push(`- Gramaj diferit (${beavyProduct.package_size} vs ${extQuantity})`);
      }
    } else {
      score -= 0.25;
      reasons.push(`- Unitate diferită (${beavyProduct.package_size} vs ${extQuantity})`);
    }
  } else if (beavyQty && !extQty) {
    score -= 0.06;
    reasons.push('~ Lipsește gramajul extern');
  }

  const validEan = code ? isValidEanCheckDigit(code) : false;
  if (code) {
    if (!validEan && requireImage) {
      score -= 0.2;
      reasons.push('- Cod de bare invalid (checksum)');
    } else if (validEan && code.startsWith('594')) {
      score += 0.04;
      reasons.push('+ EAN România (594)');
    }
  }

  if (String(extImage).includes('front_ro.')) {
    score += 0.03;
  }

  const clamped = Math.max(0, Math.min(0.99, Math.round(score * 100) / 100));
  return {
    confidence: clamped,
    validEan,
    quantityExact,
    reasons,
  };
}

export function computeContentHash(record) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(record))
    .digest('hex')
    .slice(0, 32);
}

export function sqlLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

export async function loadEnv(rootDir) {
  const envPath = path.join(rootDir, '.env');
  const raw = await fs.readFile(envPath, 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}
