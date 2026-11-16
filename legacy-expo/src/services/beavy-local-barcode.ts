import AsyncStorage from '@react-native-async-storage/async-storage';

import { getRetailerBrandStyle } from '@/components/cart/retailer-brand';
import { supabase } from '@/lib/supabase';
import {
  type DisplayProduct,
  resolveBarcodeViaCatalogOrExternal,
  searchCatalogProductsByBarcode,
} from '@/services/beavy-catalog-search';
import {
  type BeavyProductOffer,
  type CatalogProductProfile,
  fetchVerifiedOffersForProducts,
  isCompatibleEquivalentProduct,
  isPrivateLabelProduct,
} from '@/services/beavy-comparison';

export type BarcodeFormat =
  | 'EAN-13'
  | 'EAN-8'
  | 'UPC-A'
  | 'UPC-E'
  | 'CODE-128'
  | 'CODE-39'
  | 'ITF-14'
  | 'UNKNOWN';

export type ChecksumValidationResult = {
  isValid: boolean;
  normalized: string;
  format: BarcodeFormat;
  checksumDigit?: number;
  expectedDigit?: number;
};

export type StorePodiumOffer = {
  retailerId: string;
  retailerName: string;
  retailerSlug: string;
  price: number;
  regularPrice: number | null;
  promoPrice: number | null;
  loyaltyPrice: number | null;
  hasPromo: boolean;
  hasLoyalty: boolean;
  loyaltyLabel: string | null;
  unitPrice: number | null;
  normalizedUnitLabel: string | null;
  packageSize: string | null;
  observedAt: string;
  isCheapest: boolean;
  priceDiffFromCheapest: number;
  stockStatus: string;
};

export type PrivateLabelAlternative = {
  product: DisplayProduct;
  cheapestOffer: StorePodiumOffer;
  savingsRon: number;
  savingsPercent: number;
  reason: string;
};

export type ScannedBarcodeResult = {
  rawBarcode: string;
  normalizedEan: string;
  format: BarcodeFormat;
  isChecksumValid: boolean;
  resolvedAt: string;
  fromLocalCache: boolean;
  product: DisplayProduct | null;
  offers: StorePodiumOffer[];
  cheapestStore: StorePodiumOffer | null;
  mostExpensiveStore: StorePodiumOffer | null;
  maxSavingsRon: number;
  maxSavingsPercent: number;
  privateLabelAlternative: PrivateLabelAlternative | null;
  source: 'beavy_db' | 'open_food_facts' | 'not_found';
  message: string;
};

export type LiveAisleBasketItem = {
  id: string;
  scannedResult: ScannedBarcodeResult;
  quantity: number;
  scannedAt: number;
};

export type AisleBasketSummary = {
  totalUnits: number;
  distinctProducts: number;
  cheapestStoreName: string | null;
  cheapestStoreSlug: string | null;
  cheapestTotal: number;
  mostExpensiveStoreName: string | null;
  mostExpensiveTotal: number;
  totalSavingsRon: number;
  totalSavingsPercent: number;
  storeBreakdowns: {
    retailerSlug: string;
    retailerName: string;
    total: number;
    availableCount: number;
    missingCount: number;
    isCheapest: boolean;
  }[];
};

const STORAGE_CACHE_KEY = '@beavy/local_ean_cache_v2';
const MAX_MEMORY_CACHE_SIZE = 150;
const MAX_PERSISTENT_CACHE_SIZE = 200;
const CACHE_FRESHNESS_TTL_MS = 12 * 60 * 60 * 1000; // 12 ore

const inMemoryEanCache = new Map<
  string,
  { data: ScannedBarcodeResult; timestamp: number }
>();

let isCacheLoadedFromDisk = false;

/**
 * Validare matematică Modulus 10 conform specificațiilor internaționale GS1
 * pentru coduri de bare EAN-13, EAN-8 și UPC-A.
 */
export function validateBarcodeChecksum(raw: string): ChecksumValidationResult {
  const clean = raw.trim();
  const digits = clean.replace(/\D/g, '');

  // EAN-13
  if (digits.length === 13) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const d = parseInt(digits[i], 10);
      sum += i % 2 === 0 ? d * 1 : d * 3;
    }
    const expected = (10 - (sum % 10)) % 10;
    const actual = parseInt(digits[12], 10);
    return {
      isValid: expected === actual,
      normalized: digits,
      format: 'EAN-13',
      checksumDigit: actual,
      expectedDigit: expected,
    };
  }

  // UPC-A (12 cifre, convertibil matematic în EAN-13 cu 0 adăugat la început)
  if (digits.length === 12) {
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      const d = parseInt(digits[i], 10);
      sum += i % 2 === 0 ? d * 3 : d * 1;
    }
    const expected = (10 - (sum % 10)) % 10;
    const actual = parseInt(digits[11], 10);
    return {
      isValid: expected === actual,
      normalized: `0${digits}`,
      format: 'UPC-A',
      checksumDigit: actual,
      expectedDigit: expected,
    };
  }

  // EAN-8
  if (digits.length === 8) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = parseInt(digits[i], 10);
      sum += i % 2 === 0 ? d * 3 : d * 1;
    }
    const expected = (10 - (sum % 10)) % 10;
    const actual = parseInt(digits[7], 10);
    return {
      isValid: expected === actual,
      normalized: digits,
      format: 'EAN-8',
      checksumDigit: actual,
      expectedDigit: expected,
    };
  }

  // ITF-14
  if (digits.length === 14) {
    let sum = 0;
    for (let i = 0; i < 13; i++) {
      const d = parseInt(digits[i], 10);
      sum += i % 2 === 0 ? d * 3 : d * 1;
    }
    const expected = (10 - (sum % 10)) % 10;
    const actual = parseInt(digits[13], 10);
    return {
      isValid: expected === actual,
      normalized: digits,
      format: 'ITF-14',
      checksumDigit: actual,
      expectedDigit: expected,
    };
  }

  // Alte formate non-EAN (Code 128, Code 39 etc.)
  if (digits.length >= 6) {
    return {
      isValid: true,
      normalized: digits,
      format: 'CODE-128',
    };
  }

  return {
    isValid: false,
    normalized: digits,
    format: 'UNKNOWN',
  };
}

/**
 * Încarcă cache-ul local persistent din AsyncStorage în memoria RAM pentru rezoluție sub-5ms.
 */
async function ensureDiskCacheLoaded(): Promise<void> {
  if (isCacheLoadedFromDisk) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<
        string,
        { data: ScannedBarcodeResult; timestamp: number }
      >;
      for (const [ean, entry] of Object.entries(parsed)) {
        if (entry?.data && typeof entry.timestamp === 'number') {
          inMemoryEanCache.set(ean, entry);
        }
      }
    }
  } catch {
    // Ignorăm erorile de citire cache local pentru reziliență
  } finally {
    isCacheLoadedFromDisk = true;
  }
}

/**
 * Salvează rezultatul scanării în memoria RAM și pe disc.
 */
async function persistScannedResult(
  ean: string,
  result: ScannedBarcodeResult
): Promise<void> {
  const now = Date.now();
  inMemoryEanCache.set(ean, { data: result, timestamp: now });

  // Păstrează LRU RAM sub limită
  if (inMemoryEanCache.size > MAX_MEMORY_CACHE_SIZE) {
    const firstKey = inMemoryEanCache.keys().next().value;
    if (firstKey) inMemoryEanCache.delete(firstKey);
  }

  try {
    const snapshot: Record<
      string,
      { data: ScannedBarcodeResult; timestamp: number }
    > = {};
    let count = 0;
    for (const [k, v] of inMemoryEanCache.entries()) {
      if (count++ >= MAX_PERSISTENT_CACHE_SIZE) break;
      snapshot[k] = v;
    }
    await AsyncStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Salvarea în AsyncStorage e best-effort
  }
}

/**
 * Caută codul de bare în memoria RAM și pe disc.
 */
export async function getCachedBarcode(
  rawBarcode: string
): Promise<ScannedBarcodeResult | null> {
  const digits = rawBarcode.replace(/\D/g, '').trim();
  if (!digits) return null;

  await ensureDiskCacheLoaded();
  const hit = inMemoryEanCache.get(digits);
  if (!hit) return null;

  const isFresh = Date.now() - hit.timestamp < CACHE_FRESHNESS_TTL_MS;
  return {
    ...hit.data,
    fromLocalCache: true,
    message: isFresh
      ? 'Încărcat instantaneu din memoria locală (sub 5ms).'
      : 'Date din memoria locală (verifică o actualizare live dacă este necesar).',
  };
}

/**
 * Curăță cache-ul local de coduri de bare.
 */
export async function clearLocalBarcodeCache(): Promise<void> {
  inMemoryEanCache.clear();
  try {
    await AsyncStorage.removeItem(STORAGE_CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Construiește podiumul de prețuri pe magazine pentru produsul scanat.
 */
export function buildStorePodium(
  offers: BeavyProductOffer[]
): {
  podium: StorePodiumOffer[];
  cheapestStore: StorePodiumOffer | null;
  mostExpensiveStore: StorePodiumOffer | null;
  maxSavingsRon: number;
  maxSavingsPercent: number;
} {
  if (offers.length === 0) {
    return {
      podium: [],
      cheapestStore: null,
      mostExpensiveStore: null,
      maxSavingsRon: 0,
      maxSavingsPercent: 0,
    };
  }

  // Grupăm după magazin și reținem cea mai avantajoasă ofertă activă per magazin
  const bestOfferByStore = new Map<string, BeavyProductOffer>();

  for (const offer of offers) {
    if (offer.stock_status === 'out_of_stock') continue;
    const storeKey = (offer.retailer_name || '').toLowerCase().trim();
    if (!storeKey) continue;

    const existing = bestOfferByStore.get(storeKey);
    if (!existing || offer.price < existing.price) {
      bestOfferByStore.set(storeKey, offer);
    }
  }

  // Dacă toate sunt out_of_stock, folosim toate ofertele pentru a avea informații de preț
  if (bestOfferByStore.size === 0) {
    for (const offer of offers) {
      const storeKey = (offer.retailer_name || '').toLowerCase().trim();
      if (!storeKey) continue;
      const existing = bestOfferByStore.get(storeKey);
      if (!existing || offer.price < existing.price) {
        bestOfferByStore.set(storeKey, offer);
      }
    }
  }

  const sortedList = Array.from(bestOfferByStore.values()).sort(
    (a, b) => a.price - b.price
  );

  if (sortedList.length === 0) {
    return {
      podium: [],
      cheapestStore: null,
      mostExpensiveStore: null,
      maxSavingsRon: 0,
      maxSavingsPercent: 0,
    };
  }

  const cheapestRaw = sortedList[0];
  const mostExpensiveRaw = sortedList[sortedList.length - 1];
  const cheapestPrice = cheapestRaw.price;

  const podium: StorePodiumOffer[] = sortedList.map((off, index) => {
    const brandStyle = getRetailerBrandStyle(off.retailer_name);
    const hasPromo = Boolean(off.promo_price && off.promo_price < (off.regular_price ?? off.price));
    const hasLoyalty = Boolean(off.loyalty_price || off.promo_requires_card);
    const diff = Number((off.price - cheapestPrice).toFixed(2));

    return {
      retailerId: off.retailer_id || brandStyle.shortCode,
      retailerName: off.retailer_name || brandStyle.shortName,
      retailerSlug: brandStyle.shortCode.toLowerCase(),
      price: off.price,
      regularPrice: off.regular_price,
      promoPrice: off.promo_price,
      loyaltyPrice: off.loyalty_price,
      hasPromo,
      hasLoyalty,
      loyaltyLabel: off.promo_requires_card
        ? off.promo_label || `Card ${brandStyle.shortName}`
        : null,
      unitPrice: off.unit_price ?? off.normalized_unit_price,
      normalizedUnitLabel: off.normalized_unit_label,
      packageSize: off.package_size,
      observedAt: off.observed_at,
      isCheapest: index === 0,
      priceDiffFromCheapest: diff,
      stockStatus: off.stock_status,
    };
  });

  const cheapestStore = podium[0] ?? null;
  const mostExpensiveStore = podium[podium.length - 1] ?? null;
  const maxSavingsRon = Number(
    Math.max(0, mostExpensiveRaw.price - cheapestRaw.price).toFixed(2)
  );
  const maxSavingsPercent =
    mostExpensiveRaw.price > 0
      ? Math.round((maxSavingsRon / mostExpensiveRaw.price) * 100)
      : 0;

  return {
    podium,
    cheapestStore,
    mostExpensiveStore,
    maxSavingsRon,
    maxSavingsPercent,
  };
}

/**
 * Caută automat alternativa de Marcă Proprie (K-Classic, Hanul Boieresc, Proxi, 365 etc.)
 * din aceeași categorie/familie dacă produsul scanat este un brand național mai scump.
 */
async function findPrivateLabelAlternative(
  targetProduct: DisplayProduct,
  currentCheapestPrice: number,
  city?: string
): Promise<PrivateLabelAlternative | null> {
  // Dacă produsul scanat este deja marcă proprie, nu recomandăm altă marcă proprie
  if (
    isPrivateLabelProduct({
      brand: targetProduct.brand,
      canonical_name: targetProduct.canonical_name,
      category: targetProduct.category_name,
      subcategory: targetProduct.subcategory,
    })
  ) {
    return null;
  }

  try {
    // Căutăm candidați din aceeași subcategorie sau categorie
    const searchTerms: string[] = [];
    if (targetProduct.subcategory) {
      searchTerms.push(targetProduct.subcategory);
    }
    if (targetProduct.family_name) {
      searchTerms.push(targetProduct.family_name);
    }
    if (searchTerms.length === 0 && targetProduct.category_name) {
      searchTerms.push(targetProduct.category_name);
    }

    if (searchTerms.length === 0) return null;

    const queryTerm = searchTerms[0];
    const { data: candidates, error } = await supabase
      .from('beavy_products')
      .select('id, canonical_name, brand, package_size, image_url, category, subcategory')
      .ilike('canonical_name', `%${queryTerm}%`)
      .neq('id', targetProduct.id)
      .limit(20);

    if (error || !candidates || candidates.length === 0) return null;

    // Filtrăm doar produsele de Marcă Proprie compatibile
    const targetProfile: CatalogProductProfile = {
      id: targetProduct.id,
      canonical_name: targetProduct.canonical_name,
      brand: targetProduct.brand,
      package_size: targetProduct.package_size,
      quantity_value: null,
      quantity_unit: null,
      category: targetProduct.category_name ?? null,
      subcategory: targetProduct.subcategory ?? null,
      attributes: {},
      familyIds: targetProduct.family_name ? [targetProduct.family_name] : [],
    };

    const plCandidates: CatalogProductProfile[] = [];
    for (const cand of candidates) {
      const candProfile: CatalogProductProfile = {
        id: cand.id,
        canonical_name: cand.canonical_name,
        brand: cand.brand,
        package_size: cand.package_size,
        quantity_value: null,
        quantity_unit: null,
        category: cand.category ?? null,
        subcategory: cand.subcategory ?? null,
        attributes: {},
        familyIds: [],
      };

      if (
        isPrivateLabelProduct(candProfile) &&
        isCompatibleEquivalentProduct(targetProfile, candProfile, {
          allowSameCategoryWithoutFamily: true,
          skipCategoryCheck: false,
        })
      ) {
        plCandidates.push(candProfile);
      }
    }

    if (plCandidates.length === 0) return null;

    const candIds = plCandidates.map((c) => c.id);
    const plOffers = await fetchVerifiedOffersForProducts(candIds, city);
    if (plOffers.length === 0) return null;

    // Găsim cel mai ieftin candidat de marcă proprie
    let bestPlProd: CatalogProductProfile | null = null;
    let bestPlOffer: StorePodiumOffer | null = null;

    for (const cand of plCandidates) {
      const offersForCand = plOffers.filter((o) => o.product_id === cand.id);
      const podium = buildStorePodium(offersForCand);
      if (podium.cheapestStore) {
        if (
          !bestPlOffer ||
          podium.cheapestStore.price < bestPlOffer.price
        ) {
          bestPlOffer = podium.cheapestStore;
          bestPlProd = cand;
        }
      }
    }

    if (!bestPlProd || !bestPlOffer) return null;

    // Verificăm dacă marca proprie este într-adevăr mai ieftină decât produsul de brand scanat
    if (bestPlOffer.price < currentCheapestPrice) {
      const savingsRon = Number(
        (currentCheapestPrice - bestPlOffer.price).toFixed(2)
      );
      const savingsPercent = Math.round(
        (savingsRon / currentCheapestPrice) * 100
      );

      // Cerem un prag minim de economie (cel puțin 0.50 lei sau 8%)
      if (savingsRon >= 0.5 || savingsPercent >= 8) {
        const plDisplay: DisplayProduct = {
          id: bestPlProd.id,
          canonical_name: bestPlProd.canonical_name,
          brand: bestPlProd.brand,
          package_size: bestPlProd.package_size,
          image_url:
            candidates.find((c) => c.id === bestPlProd?.id)?.image_url ?? null,
          category_name: bestPlProd.category ?? undefined,
          subcategory: bestPlProd.subcategory ?? null,
          min_price: bestPlOffer.price,
          cheapest_retailer_name: bestPlOffer.retailerName,
          cheapest_retailer_slug: bestPlOffer.retailerSlug,
        };

        return {
          product: plDisplay,
          cheapestOffer: bestPlOffer,
          savingsRon,
          savingsPercent,
          reason: `Alternativă Marcă Proprie (${bestPlProd.brand ?? 'Marcă magazin'}) la ${bestPlOffer.retailerName}`,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Rezolvă complet un cod de bare EAN/UPC:
 * 1. Validare matematică Modulus 10 (EAN-13, EAN-8).
 * 2. Căutare ultra-rapidă în cache-ul local offline (sub 5ms).
 * 3. Rezoluție în catalogul Beavy DB (peste 64.000 produse).
 * 4. Fallback inteligent Open Food Facts + legare automată în catalog.
 * 5. Hidratare oferte live verificate pentru podiumul de magazine (Kaufland, Penny, Carrefour, Profi, Mega, Auchan, Sezamo, Freshful).
 * 6. Calcul automat al alternativei Marcă Proprie mai ieftine.
 * 7. Persistență locală în AsyncStorage pentru acces instantaneu ulterior.
 */
export async function resolveScannedBarcode(
  rawBarcode: string,
  options?: { city?: string; skipCache?: boolean }
): Promise<ScannedBarcodeResult> {
  const cleanRaw = rawBarcode.trim();
  const validation = validateBarcodeChecksum(cleanRaw);
  const normalizedDigits = validation.normalized;

  // 1. Verificare Cache local dacă nu s-a cerut explicit skip
  if (!options?.skipCache) {
    const cached = await getCachedBarcode(normalizedDigits);
    if (cached && cached.product) {
      return cached;
    }
  }

  // 2. Rezoluție prin catalog Beavy DB sau Open Food Facts
  const resolved = await resolveBarcodeViaCatalogOrExternal(normalizedDigits);

  let primaryProduct: DisplayProduct | null = null;
  if (resolved.products.length > 0) {
    primaryProduct = resolved.products[0];
  } else {
    // Încercare secundară de căutare directă pe variantă UPC/EAN
    const directHits = await searchCatalogProductsByBarcode(normalizedDigits);
    if (directHits.length > 0) {
      primaryProduct = directHits[0];
    }
  }

  if (!primaryProduct) {
    const notFoundResult: ScannedBarcodeResult = {
      rawBarcode: cleanRaw,
      normalizedEan: normalizedDigits,
      format: validation.format,
      isChecksumValid: validation.isValid,
      resolvedAt: new Date().toISOString(),
      fromLocalCache: false,
      product: null,
      offers: [],
      cheapestStore: null,
      mostExpensiveStore: null,
      maxSavingsRon: 0,
      maxSavingsPercent: 0,
      privateLabelAlternative: null,
      source: 'not_found',
      message: validation.isValid
        ? `Codul ${validation.format} ${normalizedDigits} este valid, dar produsul nu se află încă în catalogul Beavy.`
        : `Codul ${normalizedDigits} nu are un format EAN valid. Verifică numărul și reîncearcă.`,
    };

    return notFoundResult;
  }

  // 3. Hidratare oferte live din magazine
  const productIdsToHydrate = [
    primaryProduct.id,
    ...(primaryProduct.mergedProductIds ?? []),
  ];

  let rawOffers: BeavyProductOffer[] = [];
  try {
    rawOffers = await fetchVerifiedOffersForProducts(
      productIdsToHydrate,
      options?.city
    );
    if (rawOffers.length === 0 && options?.city) {
      rawOffers = await fetchVerifiedOffersForProducts(productIdsToHydrate);
    }
  } catch {
    rawOffers = [];
  }

  const {
    podium,
    cheapestStore,
    mostExpensiveStore,
    maxSavingsRon,
    maxSavingsPercent,
  } = buildStorePodium(rawOffers);

  // 4. Căutare inteligentă alternativă marcă proprie
  let plAlternative: PrivateLabelAlternative | null = null;
  if (cheapestStore) {
    plAlternative = await findPrivateLabelAlternative(
      primaryProduct,
      cheapestStore.price,
      options?.city
    );
  }

  const result: ScannedBarcodeResult = {
    rawBarcode: cleanRaw,
    normalizedEan: normalizedDigits,
    format: validation.format,
    isChecksumValid: validation.isValid,
    resolvedAt: new Date().toISOString(),
    fromLocalCache: false,
    product: primaryProduct,
    offers: podium,
    cheapestStore,
    mostExpensiveStore,
    maxSavingsRon,
    maxSavingsPercent,
    privateLabelAlternative: plAlternative,
    source: resolved.source,
    message: cheapestStore
      ? `Găsit la ${podium.length} ${podium.length === 1 ? 'magazin' : 'magazine'}. Cel mai bun preț la ${cheapestStore.retailerName}.`
      : 'Produs identificat în catalog (prețurile live se actualizează).',
  };

  // 5. Salvare în cache local
  void persistScannedResult(normalizedDigits, result);

  return result;
}

/**
 * Calculează rezumatul sesiunii „Cărucior Live la Raft”
 * pentru cumpărături continue pe culoar.
 */
export function calculateAisleBasketSummary(
  items: LiveAisleBasketItem[]
): AisleBasketSummary {
  if (items.length === 0) {
    return {
      totalUnits: 0,
      distinctProducts: 0,
      cheapestStoreName: null,
      cheapestStoreSlug: null,
      cheapestTotal: 0,
      mostExpensiveStoreName: null,
      mostExpensiveTotal: 0,
      totalSavingsRon: 0,
      totalSavingsPercent: 0,
      storeBreakdowns: [],
    };
  }

  let totalUnits = 0;
  const storeTotals: Record<
    string,
    { name: string; slug: string; total: number; availableCount: number }
  > = {};

  for (const item of items) {
    totalUnits += item.quantity;
    const offers = item.scannedResult.offers;

    for (const off of offers) {
      const slug = off.retailerSlug;
      if (!storeTotals[slug]) {
        storeTotals[slug] = {
          name: off.retailerName,
          slug,
          total: 0,
          availableCount: 0,
        };
      }
      storeTotals[slug].total += off.price * item.quantity;
      storeTotals[slug].availableCount += 1;
    }
  }

  const breakdowns = Object.values(storeTotals).map((st) => ({
    retailerSlug: st.slug,
    retailerName: st.name,
    total: Number(st.total.toFixed(2)),
    availableCount: st.availableCount,
    missingCount: Math.max(0, items.length - st.availableCount),
    isCheapest: false,
  }));

  // Sortăm magazinele care au toate sau cele mai multe produse disponibile
  breakdowns.sort((a, b) => {
    if (a.missingCount !== b.missingCount) {
      return a.missingCount - b.missingCount;
    }
    return a.total - b.total;
  });

  if (breakdowns.length > 0) {
    breakdowns[0].isCheapest = true;
  }

  const cheapest = breakdowns[0];
  const mostExpensive =
    breakdowns.length > 1
      ? [...breakdowns]
          .filter((b) => b.missingCount === 0 || b.missingCount === cheapest?.missingCount)
          .sort((a, b) => b.total - a.total)[0]
      : null;

  const totalSavingsRon =
    cheapest && mostExpensive
      ? Number(Math.max(0, mostExpensive.total - cheapest.total).toFixed(2))
      : 0;
  const totalSavingsPercent =
    mostExpensive && mostExpensive.total > 0
      ? Math.round((totalSavingsRon / mostExpensive.total) * 100)
      : 0;

  return {
    totalUnits,
    distinctProducts: items.length,
    cheapestStoreName: cheapest?.retailerName ?? null,
    cheapestStoreSlug: cheapest?.retailerSlug ?? null,
    cheapestTotal: cheapest?.total ?? 0,
    mostExpensiveStoreName: mostExpensive?.retailerName ?? null,
    mostExpensiveTotal: mostExpensive?.total ?? 0,
    totalSavingsRon,
    totalSavingsPercent,
    storeBreakdowns: breakdowns,
  };
}
