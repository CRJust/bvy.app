import type {
  BasketComparisonResult,
  DualBasketComparisonResult,
  MatchedBasketItem,
  MultiStoreMixStop,
  RetailerComparisonSummary,
} from '@/services/beavy-comparison';

/**
 * Logica pură (fără React) a ecranului „Live Smart Basket”.
 * Transformă rezultatul `compareShoppingBasketWithVariants` (deja reactiv în ShoppingContext)
 * în structuri gata de afișat: bandă de magazine, prețuri pe rând, sugestii de marcă proprie.
 */

export type BasketPricingMode = 'faithful' | 'economy';

export const SPLIT_STORE_ID = '__split__';

/** Prag minim de economie relativă pentru micro-chip-ul „Schimbă pe marcă proprie”. */
export const BRAND_SWAP_MIN_SAVINGS_RATIO = 0.2;

export type StoreOption = {
  id: string;
  slug: string | null;
  name: string;
  kind: 'store' | 'split';
  total: number;
  coveredCount: number;
  totalItemsCount: number;
  isFullCoverage: boolean;
  isBest: boolean;
  /** Diferența față de cea mai ieftină opțiune comparabilă (RON), 0 pentru best. */
  deltaVsBest: number;
  stopsCount?: number;
};

export type BasketLineStatus = 'priced' | 'unavailable' | 'missing';

export type BasketLine = {
  itemId: string;
  status: BasketLineStatus;
  match: MatchedBasketItem | null;
  /** Total linie (preț * cantitate) la magazinul selectat. */
  lineTotal: number | null;
  /** Magazinul din care provine linia (relevant în Split). */
  retailerName: string | null;
  retailerSlug: string | null;
  hasPromo: boolean;
  isBudgetSwap: boolean;
};

export type BrandSwapHint = {
  itemId: string;
  savings: number;
  savingsRatio: number;
  alternativeName: string;
  alternativePackageSize: string | null;
  /** Produs canonic real (din catalog) cu care se înlocuiește rândul la „Schimbă”. */
  replacement: {
    id: string;
    canonical_name: string;
    brand: string | null;
    package_size: string | null;
    image_url: string | null;
  } | null;
};

function pickResult(
  dual: DualBasketComparisonResult | null,
  mode: BasketPricingMode
): BasketComparisonResult | null {
  if (!dual) return null;
  return mode === 'economy' ? dual.budget : dual.standard;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function compareSummaries(a: RetailerComparisonSummary, b: RetailerComparisonSummary): number {
  if (a.hasFullBasketCoverage !== b.hasFullBasketCoverage) {
    return a.hasFullBasketCoverage ? -1 : 1;
  }
  if (a.coveredCount !== b.coveredCount) return b.coveredCount - a.coveredCount;
  return a.estimatedTotalWithFees - b.estimatedTotalWithFees;
}

/**
 * Bandă de magazine ordonate după costul total (acoperire completă întâi),
 * plus opțiunea „Split” când împărțirea pe mai multe magazine bate cel mai bun magazin singular.
 */
export function buildStoreOptions(
  dual: DualBasketComparisonResult | null,
  mode: BasketPricingMode
): StoreOption[] {
  const result = pickResult(dual, mode);
  if (!result) return [];

  const sorted = [...result.retailerSummaries]
    .filter((s) => s.coveredCount > 0)
    .sort(compareSummaries);

  const best = sorted[0];
  const options: StoreOption[] = sorted.map((s, idx) => ({
    id: s.retailer.id,
    slug: s.retailer.slug ?? null,
    name: s.retailer.name,
    kind: 'store',
    total: round2(s.estimatedTotalWithFees),
    coveredCount: s.coveredCount,
    totalItemsCount: s.totalItemsCount,
    isFullCoverage: s.hasFullBasketCoverage,
    isBest: idx === 0,
    deltaVsBest: best ? round2(Math.max(0, s.estimatedTotalWithFees - best.estimatedTotalWithFees)) : 0,
  }));

  const mix = result.bestStoreMix;
  if (mix && mix.stops.length > 1 && mix.savingsVsBestSingleStore > 0.01) {
    options.push({
      id: SPLIT_STORE_ID,
      slug: null,
      name: `Split ${mix.stops.length} magazine`,
      kind: 'split',
      total: round2(mix.totalWithFees),
      coveredCount: mix.coveredItemsCount,
      totalItemsCount: mix.totalItemsCount,
      isFullCoverage: mix.hasFullBasketCoverage,
      isBest: false,
      deltaVsBest: 0,
      stopsCount: mix.stops.length,
    });
  }
  return options;
}

/** Magazinul implicit: cel mai ieftin cu acoperire cât mai bună. */
export function pickDefaultStoreId(options: StoreOption[]): string | null {
  const firstStore = options.find((o) => o.kind === 'store');
  return firstStore?.id ?? null;
}

function lineFromMatch(
  itemId: string,
  match: MatchedBasketItem,
  retailerName: string,
  retailerSlug: string | null
): BasketLine {
  const hasPromo =
    match.offer.promo_price != null ||
    Boolean(match.offer.promo_label) ||
    (match.offer.regular_price != null && match.offer.regular_price > match.offer.price);
  return {
    itemId,
    status: 'priced',
    match,
    lineTotal: round2(match.lineTotal),
    retailerName,
    retailerSlug,
    hasPromo,
    isBudgetSwap: Boolean(match.isBudgetSwap),
  };
}

/**
 * Prețul fiecărui rând din listă la magazinul selectat (sau, pentru Split, la magazinul ales de mix).
 * Returnează un Map itemId -> linie. Rândurile fără ofertă sunt marcate `unavailable` / `missing`.
 */
export function buildLinesForStore(
  dual: DualBasketComparisonResult | null,
  mode: BasketPricingMode,
  storeId: string | null,
  itemIds: string[]
): Map<string, BasketLine> {
  const lines = new Map<string, BasketLine>();
  const result = pickResult(dual, mode);
  const empty = (itemId: string, status: BasketLineStatus): BasketLine => ({
    itemId,
    status,
    match: null,
    lineTotal: null,
    retailerName: null,
    retailerSlug: null,
    hasPromo: false,
    isBudgetSwap: false,
  });

  if (!result || !storeId) {
    for (const id of itemIds) lines.set(id, empty(id, 'missing'));
    return lines;
  }

  if (storeId === SPLIT_STORE_ID) {
    const stops: MultiStoreMixStop[] = result.bestStoreMix?.stops ?? [];
    for (const stop of stops) {
      for (const match of stop.items) {
        lines.set(
          match.item.id,
          lineFromMatch(match.item.id, match, stop.retailer.name, stop.retailer.slug ?? null)
        );
      }
    }
  } else {
    const summary = result.retailerSummaries.find((s) => s.retailer.id === storeId);
    if (summary) {
      for (const match of summary.matchedItems) {
        lines.set(
          match.item.id,
          lineFromMatch(match.item.id, match, summary.retailer.name, summary.retailer.slug ?? null)
        );
      }
      for (const u of summary.unavailableItems) {
        if (!lines.has(u.item.id)) lines.set(u.item.id, empty(u.item.id, 'unavailable'));
      }
    }
  }

  for (const id of itemIds) {
    if (!lines.has(id)) lines.set(id, empty(id, 'missing'));
  }
  return lines;
}

/**
 * Micro-chip „Economisești X lei cu <marcă proprie>” — doar în Mod Fidel, doar pentru
 * rândurile unde varianta de buget la ACELAȘI magazin e cu cel puțin 20% mai ieftină.
 */
export function buildBrandSwapHints(
  dual: DualBasketComparisonResult | null,
  storeId: string | null
): Map<string, BrandSwapHint> {
  const hints = new Map<string, BrandSwapHint>();
  if (!dual || !storeId || storeId === SPLIT_STORE_ID) return hints;

  const standard = dual.standard.retailerSummaries.find((s) => s.retailer.id === storeId);
  const budget = dual.budget.retailerSummaries.find((s) => s.retailer.id === storeId);
  if (!standard || !budget) return hints;

  const standardById = new Map(standard.matchedItems.map((m) => [m.item.id, m]));
  for (const swap of budget.matchedItems) {
    if (!swap.isBudgetSwap) continue;
    const base = standardById.get(swap.item.id);
    if (!base || base.lineTotal <= 0) continue;
    const savings = base.lineTotal - swap.lineTotal;
    const ratio = savings / base.lineTotal;
    if (savings <= 0.009 || ratio < BRAND_SWAP_MIN_SAVINGS_RATIO) continue;
    hints.set(swap.item.id, {
      itemId: swap.item.id,
      savings: round2(savings),
      savingsRatio: ratio,
      alternativeName: swap.equivalentProductName ?? swap.item.name,
      alternativePackageSize: swap.equivalentPackageSize,
      replacement:
        swap.equivalentProductId && swap.equivalentProductName
          ? {
              id: swap.equivalentProductId,
              canonical_name: swap.equivalentProductName,
              brand: swap.equivalentBrand ?? swap.offer.retailer_name ?? null,
              package_size: swap.equivalentPackageSize ?? swap.offer.package_size ?? null,
              image_url: swap.equivalentImageUrl ?? swap.offer.image_url ?? null,
            }
          : null,
    });
  }
  return hints;
}

export type BasketTotals = {
  total: number;
  pricedCount: number;
  itemsCount: number;
  missingCount: number;
  /** Economia față de varianta Fidel la același magazin (doar Mod Economie). */
  economySavings: number;
  promoSavings: number;
};

export function summarizeLines(
  lines: Map<string, BasketLine>,
  itemIds: string[],
  options: { economySavings?: number } = {}
): BasketTotals {
  let total = 0;
  let pricedCount = 0;
  let promoSavings = 0;
  for (const id of itemIds) {
    const line = lines.get(id);
    if (!line || line.status !== 'priced' || line.lineTotal == null) continue;
    total += line.lineTotal;
    pricedCount += 1;
    const offer = line.match?.offer;
    const qty = line.match?.item.quantity ?? 1;
    if (offer && offer.regular_price != null && offer.regular_price > offer.price) {
      promoSavings += (offer.regular_price - offer.price) * qty;
    }
  }
  return {
    total: round2(total),
    pricedCount,
    itemsCount: itemIds.length,
    missingCount: itemIds.length - pricedCount,
    economySavings: round2(options.economySavings ?? 0),
    promoSavings: round2(promoSavings),
  };
}

/** Economia totală a Modului Economie la magazinul dat (0 dacă nu există). */
export function economySavingsAtStore(
  dual: DualBasketComparisonResult | null,
  storeId: string | null
): number {
  if (!dual || !storeId) return 0;
  if (storeId === SPLIT_STORE_ID) {
    const a = dual.standard.bestStoreMix?.totalWithFees;
    const b = dual.budget.bestStoreMix?.totalWithFees;
    return a != null && b != null ? round2(Math.max(0, a - b)) : 0;
  }
  const a = dual.standard.retailerSummaries.find((s) => s.retailer.id === storeId);
  const b = dual.budget.retailerSummaries.find((s) => s.retailer.id === storeId);
  if (!a || !b) return 0;
  return round2(Math.max(0, a.estimatedTotalWithFees - b.estimatedTotalWithFees));
}

const RON = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** „78,40 lei” — separator zecimal românesc. */
export function formatLei(value: number): string {
  return `${RON.format(value)} lei`;
}

/** Totalul pentru modul „În magazin”: coș fizic (bifat) vs. rămas pe listă. */
export function splitInStoreTotals(
  lines: Map<string, BasketLine>,
  checkedIds: ReadonlySet<string>,
  itemIds: string[]
): { inCart: number; remaining: number } {
  let inCart = 0;
  let remaining = 0;
  for (const id of itemIds) {
    const line = lines.get(id);
    if (!line || line.lineTotal == null) continue;
    if (checkedIds.has(id)) inCart += line.lineTotal;
    else remaining += line.lineTotal;
  }
  return { inCart: round2(inCart), remaining: round2(remaining) };
}
