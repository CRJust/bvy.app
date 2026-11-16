import type { BeavyProductOffer } from '@/services/beavy-comparison';

/**
 * Logica pură (fără rețea / fără React) a Grilei de Comparație pe Produs.
 * Primește oferte deja încărcate (câte una per magazin) și produce celule gata de afișat.
 */

export type PriceMatchKind = 'exact' | 'alternative';

export type PriceVariantTier =
  | 'exact'
  | 'private_label'
  | 'cheaper'
  | 'premium'
  | 'alternative';

export const MIN_COMMON_STORES = 6;

export type PriceGridInput = {
  offer: BeavyProductOffer;
  kind: PriceMatchKind;
  /** Pentru alternative: numele/brandul echivalentului (ex. „Pilos”). */
  altBrand?: string | null;
  altName?: string | null;
  altIsPrivateLabel?: boolean;
};

export type PriceCell = {
  key: string;
  retailerName: string;
  price: number;
  /** „33,96 lei/kg” sau null dacă nu se poate deriva curat. */
  unitPriceLabel: string | null;
  kind: PriceMatchKind;
  variantTier: PriceVariantTier;
  altLabel: string | null;
  isPrivateLabel: boolean;
  /** Reducere procentuală față de prețul de raft, ex. 25 pentru „-25%”. */
  discountPercent: number | null;
  /** Programul de fidelitate necesar pentru preț (ex. „Lidl Plus”), dacă e cazul. */
  cardProgram: string | null;
  loyaltyPrice: number | null;
  isCheapest: boolean;
  /** Diferența față de cel mai ieftin (RON). */
  deltaVsCheapest: number;
  packageSize: string | null;
};

export type PriceGridSummary = {
  cells: PriceCell[];
  storeCount: number;
  exactStoreCount: number;
  /** `true` dacă alimentul este comparat în cel puțin 6 supermarketuri. */
  isCommonAcrossStores: boolean;
  cheapest: PriceCell | null;
  mostExpensive: PriceCell | null;
  cheapestPrivateLabel: PriceCell | null;
  cheapestOption: PriceCell | null;
  premiumOption: PriceCell | null;
  spread: number;
};

export type ShelfPriceRetailerEntry = {
  price: number;
  name?: string | null;
  package_size?: string | null;
  normalized_unit_price?: number | null;
  normalized_unit_label?: string | null;
  updated_at?: string | null;
};

export type ShelfCatalogItem = {
  id: string;
  canonical_name: string;
  brand: string | null;
  category?: string | null;
  package_size: string | null;
  is_private_label?: boolean;
  fat_percentage?: number | null;
  prices_by_retailer: Record<string, ShelfPriceRetailerEntry>;
};

const RETAILER_DISPLAY_NAMES: Record<string, string> = {
  lidl: 'Lidl',
  kaufland: 'Kaufland',
  carrefour: 'Carrefour',
  auchan: 'Auchan',
  'mega-image': 'Mega Image',
  mega: 'Mega Image',
  penny: 'Penny',
  profi: 'Profi',
  freshful: 'Freshful',
  sezamo: 'Sezamo',
};

const ro2 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPriceLei(value: number): string {
  return `${ro2.format(value)} lei`;
}

/** „9.40 RON/L” -> „9,40 lei/L”; respinge etichetele cu coduri interne sau „buc”. */
export function formatUnitPriceLabel(
  value: number | null | undefined,
  label: string | null | undefined
): string | null {
  if (value == null || !(value > 0) || !label) return null;
  const clean = label.trim().replace(/^(RON|lei)\s*\/\s*/i, '').toLowerCase();
  if (!/^(kg|l|100g|100ml)$/.test(clean)) return null;
  const unit = clean === 'l' ? 'L' : clean;
  return `${ro2.format(value)} lei/${unit}`;
}

function parseSiPackageSize(
  packageSize?: string | null,
  fallbackName?: string | null
): { kind: 'weight' | 'volume'; gramsOrMl: number } | null {
  const text = `${packageSize ?? ''} ${fallbackName ?? ''}`.toLowerCase().replace(/,/g, '.');
  if (!text.trim()) return null;

  const multKg = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*kg\b/);
  if (multKg) {
    return { kind: 'weight', gramsOrMl: parseFloat(multKg[1]) * parseFloat(multKg[2]) * 1000 };
  }
  const multG = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:g|gr|grame)\b/);
  if (multG) {
    return { kind: 'weight', gramsOrMl: parseFloat(multG[1]) * parseFloat(multG[2]) };
  }
  const multL = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:l|litri|litru)\b/);
  if (multL) {
    return { kind: 'volume', gramsOrMl: parseFloat(multL[1]) * parseFloat(multL[2]) * 1000 };
  }
  const multMl = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*ml\b/);
  if (multMl) {
    return { kind: 'volume', gramsOrMl: parseFloat(multMl[1]) * parseFloat(multMl[2]) };
  }

  const lMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:l|litri|litru)\b/);
  if (lMatch) {
    const v = parseFloat(lMatch[1]);
    if (v > 0 && v <= 50) return { kind: 'volume', gramsOrMl: v * 1000 };
  }
  const mlMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-\s*)?ml\b/);
  if (mlMatch) {
    const v = parseFloat(mlMatch[1]);
    if (v > 0 && v <= 20000) return { kind: 'volume', gramsOrMl: v };
  }
  const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-\s*)?kg\b/);
  if (kgMatch) {
    const v = parseFloat(kgMatch[1]);
    if (v > 0 && v <= 50) return { kind: 'weight', gramsOrMl: v * 1000 };
  }
  const gMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:g|gr|grame)\b/);
  if (gMatch) {
    const v = parseFloat(gMatch[1]);
    if (v > 0 && v <= 25000) return { kind: 'weight', gramsOrMl: v };
  }
  return null;
}

/**
 * Calculează prețul unitar standardizat (`33,96 lei/kg` sau `9,40 lei/L`),
 * folosind mai întâi câmpurile normalizate, apoi derivarea matematică din gramaj/volum.
 */
export function deriveUnitPriceLabel(
  price: number,
  rawUnitPrice: number | null | undefined,
  rawUnitLabel: string | null | undefined,
  packageSize?: string | null,
  fallbackName?: string | null
): string | null {
  const direct = formatUnitPriceLabel(rawUnitPrice, rawUnitLabel);
  if (direct) return direct;
  if (!(price > 0)) return null;
  const si = parseSiPackageSize(packageSize, fallbackName);
  if (!si || si.gramsOrMl <= 0) return null;
  const perStandard = price / (si.gramsOrMl / 1000);
  if (!Number.isFinite(perStandard) || perStandard <= 0) return null;
  return `${ro2.format(perStandard)} lei/${si.kind === 'volume' ? 'L' : 'kg'}`;
}

function discountOf(offer: BeavyProductOffer): number | null {
  const ref = offer.regular_price;
  if (ref != null && ref > offer.price + 0.004) {
    const pct = Math.round((1 - offer.price / ref) * 100);
    return pct >= 1 ? pct : null;
  }
  return null;
}

const CARD_RE =
  /(connect|myclub|lidl\s*plus|penny\s*card|sezamo\s*xtra|act\s*for\s*good|kaufland\s*card|genius|profi\s*card)/i;

function cardProgramOf(
  offer: BeavyProductOffer,
  resolveProgram: (retailerName: string, promoLabel?: string | null) => string
): string | null {
  const hasLoyaltyPrice =
    offer.loyalty_price != null && offer.loyalty_price > 0 && offer.loyalty_price < offer.price;
  const needsCard = Boolean(offer.promo_requires_card) || CARD_RE.test(offer.promo_label ?? '');
  if (!hasLoyaltyPrice && !needsCard) return null;
  return resolveProgram(offer.retailer_name, offer.promo_label);
}

export function normalizeRetailerStoreKey(
  retailerName?: string | null,
  retailerId?: string | null
): string {
  const raw = (retailerName || retailerId || '').toLowerCase().trim();
  if (!raw) return 'unknown';
  if (raw.includes('mega')) return 'mega-image';
  if (raw.includes('kaufland')) return 'kaufland';
  if (raw.includes('lidl')) return 'lidl';
  if (raw.includes('carrefour')) return 'carrefour';
  if (raw.includes('auchan')) return 'auchan';
  if (raw.includes('penny')) return 'penny';
  if (raw.includes('profi')) return 'profi';
  if (raw.includes('freshful')) return 'freshful';
  if (raw.includes('sezamo')) return 'sezamo';
  return raw;
}

/**
 * Construiește grila: o celulă per magazin (cea mai bună ofertă), sortată crescător după preț.
 * Dacă același magazin apare de mai multe ori, se păstrează varianta „exact”, apoi cea mai ieftină.
 */
export function buildPriceGrid(
  inputs: PriceGridInput[],
  resolveProgram: (retailerName: string, promoLabel?: string | null) => string,
  fallbackContext?: { packageSize?: string | null; canonicalName?: string | null }
): PriceGridSummary {
  const byStore = new Map<string, PriceGridInput>();
  for (const input of inputs) {
    const key = normalizeRetailerStoreKey(input.offer.retailer_name, input.offer.retailer_id);
    const cur = byStore.get(key);
    if (!cur) {
      byStore.set(key, input);
      continue;
    }
    if (cur.kind !== input.kind) {
      if (input.kind === 'exact') byStore.set(key, input);
      continue;
    }
    if (input.offer.price < cur.offer.price) byStore.set(key, input);
  }

  const sorted = Array.from(byStore.entries())
    .map(([key, input]) => ({ key, input }))
    .sort((a, b) => a.input.offer.price - b.input.offer.price);

  const exactPrices = sorted
    .filter(({ input }) => input.kind === 'exact' && input.offer.price > 0)
    .map(({ input }) => input.offer.price);
  const referencePrice =
    exactPrices.length > 0
      ? exactPrices.reduce((acc, p) => acc + p, 0) / exactPrices.length
      : sorted[Math.floor(sorted.length / 2)]?.input.offer.price ?? 0;

  const minPrice = sorted[0]?.input.offer.price ?? 0;
  const cells: PriceCell[] = sorted.map(({ key, input }, idx) => {
    const { offer } = input;
    const alt =
      input.kind === 'alternative'
        ? [input.altBrand, input.altName && !input.altBrand ? input.altName : null]
            .filter(Boolean)
            .join(' ') || null
        : null;
    const pkgSize = offer.package_size ?? fallbackContext?.packageSize ?? null;
    const isPl = Boolean(input.altIsPrivateLabel);
    let variantTier: PriceVariantTier = 'exact';
    if (input.kind === 'alternative') {
      if (isPl) {
        variantTier = 'private_label';
      } else if (referencePrice > 0 && offer.price < referencePrice * 0.94) {
        variantTier = 'cheaper';
      } else if (referencePrice > 0 && offer.price > referencePrice * 1.12) {
        variantTier = 'premium';
      } else {
        variantTier = 'alternative';
      }
    }

    return {
      key,
      retailerName: offer.retailer_name,
      price: offer.price,
      unitPriceLabel: deriveUnitPriceLabel(
        offer.price,
        offer.normalized_unit_price ?? offer.unit_price,
        offer.normalized_unit_label,
        pkgSize,
        input.altName ?? fallbackContext?.canonicalName ?? null
      ),
      kind: input.kind,
      variantTier,
      altLabel: alt,
      isPrivateLabel: isPl,
      discountPercent: discountOf(offer),
      cardProgram: cardProgramOf(offer, resolveProgram),
      loyaltyPrice:
        offer.loyalty_price != null && offer.loyalty_price > 0 && offer.loyalty_price < offer.price
          ? offer.loyalty_price
          : null,
      isCheapest: idx === 0 && sorted.length > 0,
      deltaVsCheapest: Math.round((offer.price - minPrice) * 100) / 100,
      packageSize: pkgSize,
    };
  });

  const cheapest = cells[0] ?? null;
  const mostExpensive = cells[cells.length - 1] ?? null;
  const exactStoreCount = cells.filter((c) => c.kind === 'exact').length;
  const cheapestPrivateLabel = cells.find((c) => c.isPrivateLabel) ?? null;
  const cheapestOption = cheapest;
  const premiumOption =
    [...cells]
      .reverse()
      .find(
        (c) =>
          !c.isPrivateLabel &&
          cheapest !== null &&
          c.key !== cheapest.key &&
          c.price > cheapest.price * 1.08
      ) ?? null;

  return {
    cells,
    storeCount: cells.length,
    exactStoreCount,
    isCommonAcrossStores: cells.length >= MIN_COMMON_STORES,
    cheapest,
    mostExpensive,
    cheapestPrivateLabel,
    cheapestOption,
    premiumOption,
    spread: cheapest && mostExpensive ? Math.round((mostExpensive.price - cheapest.price) * 100) / 100 : 0,
  };
}

function normText(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFatPct(str?: string | null): number | null {
  const m = String(str ?? '').match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return v > 0 && v <= 100 ? Math.round(v * 10) / 10 : null;
}

const SHELF_NOISE_WORDS = new Set([
  'de', 'cu', 'si', 'in', 'la', 'din', 'pentru', 'pt', 'fara', 'proaspat', 'proaspata',
  'proaspete', 'feliat', 'feliata', 'felii', 'clasic', 'clasica', 'original', 'natural',
  'naturala', 'bio', 'eco', 'ecologic', 'ecologica', 'buc', 'bucati', 'pachet', 'caserola',
  'sticla', 'cutie', 'punga', 'borcan', 'vrac', 'kg', 'gr', 'grame', 'ml', 'litri', 'litru',
  'grasime', 'gras', 'grasa', 'dulce', 'acra', 'fermentata', 'superioara', 'alba', 'albi',
  'galbena', 'rosie', 'verde', 'negru', 'macinat', 'macinata', 'ras', 'rasa', 'fasii',
  'file', 'dezosat', 'dezosata', 'piele', 'sol', 'fainoase', 'dop', 'msc', 'esl', 'uht',
  'german', 'irlandez', 'salbatic', 'sort', 'div', 'min', 'max', 'marimea', 'mar',
  // Brand tokens care pot apărea la începutul titlului fără a fi substantivul alimentar
  'pilos', 'milbona', 'pikok', 'dulano', 'combino', 'tiradell', 'barilla', 'baneasa',
  'boromir', 'delaco', 'hochland', 'lurpak', 'president', 'dorna', 'borsec', 'aqua',
  'carpatica', 'jacobs', 'kronung', 'monini', 'primadonna', 'unisol', 'bunica', 'ardealul',
  'belbake', 'freshona', 'ocean', 'sea', 'nautica', 'camara', 'noastra', 'vel', 'pitar',
  'cris', 'tim', 'cristim', 'agricola', 'fragedo', 'transavia', 'covalact', 'danone',
  'olympus', 'albalact', 'zuzu', 'napolact', 'muller', 'mega', 'image', 'gusturi',
  'romanesti', 'simpl', 'pouce', 'auchan', 'carrefour', 'kaufland', 'classic', 'penny',
  'hanul', 'boieresc', 'san', 'fabio', 'boni', 'proxi', 'profi', 'miil', 'dacello',
  'yutto', 'kitchin', 'fjoru', 'ubomi',
]);

const SHELF_TOKEN_SYNONYMS: Record<string, string> = {
  spaghete: 'spaghetti',
  spagete: 'spaghetti',
  parmigiano: 'parmezan',
  reggiano: 'parmezan',
  grana: 'parmezan',
  padano: 'parmezan',
  pecorino: 'parmezan',
  smintana: 'smantana',
  ouale: 'oua',
  lamai: 'lamaie',
  rosie: 'rosii',
  cartof: 'cartofi',
  morcov: 'morcovi',
  castravete: 'castraveti',
  banana: 'banane',
  cepe: 'ceapa',
  pancetta: 'bacon',
  guanciale: 'bacon',
  kaizer: 'bacon',
};

function extractCoreFoodTokens(name?: string | null, brand?: string | null): string[] {
  const brandTokens = new Set(normText(brand).split(/\s+/).filter((t) => t.length >= 2));
  const raw = normText(name)
    .split(/\s+/)
    .map((t) => SHELF_TOKEN_SYNONYMS[t] ?? t)
    .filter(
      (t) =>
        t.length >= 3 &&
        !/^\d/.test(t) &&
        !t.endsWith('%') &&
        !SHELF_NOISE_WORDS.has(t) &&
        !brandTokens.has(t)
    );
  return Array.from(new Set(raw));
}

const NON_FOOD_SHELF_CATEGORIES = new Set([
  'baby',
  'cosmetice',
  'detergenti',
  'produse pentru curatenie',
  'hartie igienica si servetele',
  'hrana pentru animale',
  'uz casnic',
  'otc',
  'suplimente alimentare',
]);

const SNACK_SHELF_PATTERNS =
  /\b(chips\w*|popcorn|biscuit\w*|vafe|croissant\w*|inghetat\w*|cornet|batoane|baton|pufulet\w*|bomboan\w*|ciocolat\w*\s+cu\s+lapte|desert|budinca|taitei)\b/;

type IndexedShelfItem = {
  item: ShelfCatalogItem;
  tokens: string[];
  normName: string;
  normCat: string;
  si: { kind: 'weight' | 'volume'; gramsOrMl: number } | null;
  fat: number | null;
  brandNorm: string;
};

const shelfIndexCache = new WeakMap<ShelfCatalogItem[], Map<string, IndexedShelfItem[]>>();

function getIndexedShelfItems(shelfItems: ShelfCatalogItem[]): Map<string, IndexedShelfItem[]> {
  const cached = shelfIndexCache.get(shelfItems);
  if (cached) return cached;

  const byFirstToken = new Map<string, IndexedShelfItem[]>();
  for (const item of shelfItems) {
    if (!item.prices_by_retailer) continue;
    const tokens = extractCoreFoodTokens(item.canonical_name, item.brand);
    if (tokens.length === 0) continue;
    const first = tokens[0];
    const entry: IndexedShelfItem = {
      item,
      tokens,
      normName: normText(item.canonical_name),
      normCat: normText(item.category),
      si: parseSiPackageSize(item.package_size, item.canonical_name),
      fat: item.fat_percentage ?? extractFatPct(item.canonical_name),
      brandNorm: normText(item.brand),
    };
    const list = byFirstToken.get(first);
    if (list) list.push(entry);
    else byFirstToken.set(first, [entry]);
  }
  shelfIndexCache.set(shelfItems, byFirstToken);
  return byFirstToken;
}

/**
 * Potrivește un produs canonic cu intrările din `shelf-prices.json` (care include Lidl `.xlsb`),
 * returnând oferte `exact` (același brand + gramaj) sau `alternative` (același aliment + % grăsime + gramaj).
 */
export function matchShelfCatalogOffers(
  target: {
    id: string;
    canonical_name?: string | null;
    brand?: string | null;
    package_size?: string | null;
  },
  shelfItems: ShelfCatalogItem[]
): PriceGridInput[] {
  const targetTokens = extractCoreFoodTokens(target.canonical_name, target.brand);
  if (targetTokens.length === 0) return [];
  const byFirstToken = getIndexedShelfItems(shelfItems);
  const candidates = byFirstToken.get(targetTokens[0]);
  if (!candidates || candidates.length === 0) return [];

  const targetNormName = normText(target.canonical_name);
  const targetSi = parseSiPackageSize(target.package_size, target.canonical_name);
  const targetFat = extractFatPct(target.canonical_name);
  const targetBrandNorm = normText(target.brand);
  const targetSet = new Set(targetTokens);
  const targetIsSnack = SNACK_SHELF_PATTERNS.test(targetNormName);
  const nowIso = new Date().toISOString();

  const matchedInputs: PriceGridInput[] = [];

  for (const cand of candidates) {
    const {
      item,
      tokens: candTokens,
      normName: candNormName,
      normCat: candNormCat,
      si: candSi,
      fat: candFat,
      brandNorm: candBrandNorm,
    } = cand;

    if (NON_FOOD_SHELF_CATEGORIES.has(candNormCat)) continue;
    if (!targetIsSnack && SNACK_SHELF_PATTERNS.test(candNormName)) continue;

    // Gărzi împotriva fals-pozitivelor compuse (ex: „Legume cu unt” pt „Unt”, „Ton în ulei” pt „Ulei”, „Cola 0% zahăr” pt „Zahăr”)
    if (targetTokens[0] === 'unt' && /\b(legume|arahide|peanut|peste|ton|somon|usturoi|prajitur)\b/.test(candNormName)) {
      continue;
    }
    if (targetTokens[0] === 'ulei' && /\b(ton|macrou|ansoa|hering|sardine|maionez|sos|conserv)\b/.test(candNormName)) {
      continue;
    }
    if (targetTokens[0] === 'zahar' && /\b(cola|pepsi|bautur|aloe|0%|zero|fara\s+adaos|f\.zahar|redus)\b/.test(candNormName)) {
      continue;
    }
    if (targetTokens[0] === 'lapte' && /\b(praf|condensat|cacao|cocos|migdale|soia|ovaz|corp|demachi)\b/.test(candNormName) !== /\b(praf|condensat|cacao|cocos|migdale|soia|ovaz)\b/.test(targetNormName)) {
      continue;
    }
    if (/\bmasline\b/.test(targetNormName) !== /\bmasline\b/.test(candNormName)) {
      continue;
    }

    if (targetFat !== null && candFat !== null && Math.abs(targetFat - candFat) > 1.5) {
      continue;
    }

    if (targetSi && candSi) {
      if (targetSi.kind !== candSi.kind) continue;
      const ratio = candSi.gramsOrMl / targetSi.gramsOrMl;
      if (ratio < 0.65 || ratio > 1.55) continue;
    }

    const overlap = candTokens.filter((t) => targetSet.has(t)).length;
    if (overlap < 1) continue;

    const isSameBrand =
      Boolean(targetBrandNorm) &&
      Boolean(candBrandNorm) &&
      (targetBrandNorm === candBrandNorm ||
        targetBrandNorm.includes(candBrandNorm) ||
        candBrandNorm.includes(targetBrandNorm));

    const isTightSize =
      !targetSi ||
      !candSi ||
      (candSi.gramsOrMl / targetSi.gramsOrMl >= 0.85 &&
        candSi.gramsOrMl / targetSi.gramsOrMl <= 1.15);

    const kind: PriceMatchKind = isSameBrand && isTightSize ? 'exact' : 'alternative';

    for (const [slug, entry] of Object.entries(item.prices_by_retailer)) {
      if (!entry || !(entry.price > 0)) continue;
      const retailerKey = slug.toLowerCase();
      const retailerName = RETAILER_DISPLAY_NAMES[retailerKey] ?? slug;
      const syntheticOffer: BeavyProductOffer = {
        id: `shelf-${item.id}-${retailerKey}`,
        product_id: target.id,
        retailer_id: retailerKey,
        retailer_name: retailerName,
        fulfillment_node_id: null,
        price: entry.price,
        regular_price: null,
        promo_price: null,
        loyalty_price: null,
        promo_label: null,
        promo_requires_card: false,
        sgr_fee: null,
        currency: 'RON',
        unit_price: entry.normalized_unit_price ?? null,
        normalized_unit_price: entry.normalized_unit_price ?? null,
        normalized_unit_label: entry.normalized_unit_label ?? null,
        sell_by_mode: 'unit',
        quantity_value: null,
        quantity_unit: null,
        package_size: entry.package_size ?? item.package_size ?? target.package_size ?? null,
        product_url: null,
        image_url: null,
        fulfillment_channel: 'store',
        city: 'București',
        availability: 'in_stock',
        stock_status: 'in_stock',
        observed_at: entry.updated_at ?? nowIso,
        valid_until: null,
      };

      matchedInputs.push({
        offer: syntheticOffer,
        kind,
        altBrand: kind === 'alternative' ? item.brand : null,
        altName: kind === 'alternative' ? (entry.name ?? item.canonical_name) : null,
        altIsPrivateLabel: Boolean(item.is_private_label),
      });
    }
  }

  return matchedInputs;
}

/** „De la 8,49 lei la Lidl” */
export function cheapestHeadline(summary: PriceGridSummary): string | null {
  if (!summary.cheapest) return null;
  return `De la ${formatPriceLei(summary.cheapest.price)} la ${summary.cheapest.retailerName}`;
}

/** „de la 14,99 lei · în 6 magazine” */
export function compactStoresLabel(summary: PriceGridSummary): string | null {
  if (!summary.cheapest) return null;
  const n = summary.storeCount;
  return `de la ${formatPriceLei(summary.cheapest.price)} · în ${n} ${n === 1 ? 'magazin' : 'magazine'}`;
}

/**
 * Standardizează gramajul unui produs într-o etichetă canonică pentru filtrare rapidă
 * (ex: `200g`, `250g`, `500g`, `1kg`, `1L`, `1.5L`, `10 buc`).
 */
export function normalizeGramajFacet(
  packageSize?: string | null,
  fallbackName?: string | null
): string | null {
  const si = parseSiPackageSize(packageSize, fallbackName);
  if (si && si.gramsOrMl > 0) {
    if (si.kind === 'weight') {
      if (si.gramsOrMl >= 1000 && si.gramsOrMl % 250 === 0) {
        const kg = Math.round((si.gramsOrMl / 1000) * 100) / 100;
        return `${kg}kg`;
      }
      return `${Math.round(si.gramsOrMl)}g`;
    }
    if (si.gramsOrMl >= 1000 && si.gramsOrMl % 250 === 0) {
      const l = Math.round((si.gramsOrMl / 1000) * 100) / 100;
      return `${l}L`;
    }
    return `${Math.round(si.gramsOrMl)}ml`;
  }
  const text = `${packageSize ?? ''} ${fallbackName ?? ''}`.toLowerCase();
  const bucMatch = text.match(/\b(\d+)\s*(?:buc|bucati|bucăți|oua|ouă)\b/);
  if (bucMatch) {
    const n = parseInt(bucMatch[1], 10);
    if (n > 1 && n <= 100) return `${n} buc`;
  }
  return null;
}

export type GramajFacetOption = {
  label: string;
  count: number;
  sortValue: number;
};

/**
 * Extrage gramajele disponibile dintr-o listă de produse (ordonate crescător după cantitate).
 */
export function extractGramajFacets<
  T extends { package_size?: string | null; canonical_name?: string | null },
>(items: T[]): GramajFacetOption[] {
  const map = new Map<string, { count: number; sortValue: number }>();
  for (const item of items) {
    const label = normalizeGramajFacet(item.package_size, item.canonical_name);
    if (!label) continue;
    const si = parseSiPackageSize(item.package_size, item.canonical_name);
    const sortValue = si ? si.gramsOrMl : parseInt(label, 10) || 9999;
    const prev = map.get(label);
    if (prev) {
      prev.count += 1;
    } else {
      map.set(label, { count: 1, sortValue });
    }
  }
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, count: v.count, sortValue: v.sortValue }))
    .sort((a, b) => a.sortValue - b.sortValue);
}

