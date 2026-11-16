import { PRODUCT_MAP } from '../data/catalog.ts';
import { STORES, STORE_MAP } from '../data/stores.ts';
import type {
  BasketItem,
  CanonicalProduct,
  EquivalenceLevel,
  LoyaltyCardId,
  MatchKind,
  StoreFilterMode,
  StoreId,
} from '../types.ts';

export interface EffectiveOffer {
  storeId: StoreId;
  price: number;
  basePrice: number;
  usedCardProgram: string | null;
  promoLabel: string | null;
  matchKind: MatchKind;
  equivalenceLevel: EquivalenceLevel;
  variantLabel: string | null;
  unitPriceLabel: string;
  /** Shelf price before a public promo (struck-through) when higher than basePrice. */
  regularPrice: number | null;
  /** promoLabel is a multi-buy / conditional deal, not a lower unit price. */
  promoIsInfoOnly: boolean;
  /** No verified offer at this store: price is 0 and must never be summed, ranked or shown as a price. */
  isUnavailable: boolean;
  isOutOfStock: boolean;
}

export function getEquivalenceLevelLabel(level: EquivalenceLevel): string {
  switch (level) {
    case 1:
      return 'Același produs';
    case 2:
      return 'Același produs, altă denumire';
    case 3:
      return 'Produs echivalent';
    case 4:
      return 'Marcă proprie';
  }
}

export interface MatchQualitySummary {
  exactCount: number;
  twinCount: number;
  functionalCount: number;
  privateLabelCount: number;
  totalItems: number;
  qualityPct: number;
}

export interface StoreBasketSummary {
  storeId: StoreId;
  subtotal: number;
  shelfSubtotal: number;
  cardSavings: number;
  deliveryFee: number;
  totalWithDelivery: number;
  meetsMinOrder: boolean;
  amountToMinOrder: number;
  amountToFreeDelivery: number | null;
  economySavingsVsFidelity: number;
  potentialMissingCardId: LoyaltyCardId | null;
  potentialMissingCardSavings: number;
  matchSummary: MatchQualitySummary;
  /** Basket lines with a verified offer at this store (the only ones in the subtotal). */
  availableCount: number;
  /** Lines sold at another store but not here: excluded from this store's subtotal. */
  missingCount: number;
  /** Lines with no verified price at any store: excluded everywhere, listed separately. */
  unpricedCount: number;
  missingProductIds: string[];
}

export type OptimizationStrategy = 'balanced' | 'cheapest' | 'fidelity';

export interface OptimizationOptions {
  maxStores?: 1 | 2;
  excludedStoreIds?: StoreId[];
  excludedSwapFromIds?: string[];
}

export interface BalancedSwapRecommendation {
  fromProductId: string;
  toProductId: string;
  fromName: string;
  toName: string;
  savings: number;
  percentSaved: number;
}

export interface OptimizationPlan {
  strategy: OptimizationStrategy;
  storeId: StoreId | 'split';
  storeLabel: string;
  isSplit: boolean;
  splitResult: SplitTwoStoreResult | null;
  totalWithDelivery: number;
  shelfSubtotal: number;
  cardSavings: number;
  swapSavings: number;
  deliveryFee: number;
  meetsMinOrder: boolean;
  amountToMinOrder: number;
  averageMarketTotal: number;
  savingsVsAverage: number;
  savingsVsFidelityWinner: number;
  balancedScore: number;
  scoreBreakdown: {
    pricePts: number;
    matchPts: number;
    conveniencePts: number;
  };
  matchSummary: MatchQualitySummary;
  /** Basket lines covered by this plan / sold elsewhere but not covered / without any verified price. */
  availableCount: number;
  missingCount: number;
  unpricedCount: number;
  swapsApplied: BalancedSwapRecommendation[];
  applyEconomyMode: boolean;
  reasons: string[];
  warnings: string[];
  cardOpportunity: {
    cardId: LoyaltyCardId;
    cardProgram: string;
    extraSavings: number;
  } | null;
}

export interface SplitTwoStoreResult {
  storeA: StoreId;
  storeB: StoreId;
  subtotalA: number;
  subtotalB: number;
  deliveryA: number;
  deliveryB: number;
  totalWithDelivery: number;
  bestSingleStoreId: StoreId;
  bestSingleTotal: number;
  netSavings: number;
  savingsPercent: number;
  isWorthwhile: boolean;
  /** Priced lines that neither store sells. */
  missingCount: number;
  /** Extra basket lines covered compared with the best single store (0 => pure price comparison). */
  coverageGain: number;
  assignments: Record<string, StoreId>;
}

export interface FidelitySuggestion {
  equivalentProduct: CanonicalProduct;
  variantLabel: string;
  savingsPerUnit: number;
  savingsPercent: number;
}

export interface InStoreProgress {
  checkedTotal: number;
  remainingTotal: number;
  checkedCount: number;
  totalCount: number;
}

export function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function formatRon(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} lei`;
}

export function formatUnitPrice(price: number, product: CanonicalProduct): string {
  const base = product.quantityBase > 0 ? product.quantityBase : 1;
  const unitPrice = price / base;
  return `${unitPrice.toFixed(2).replace('.', ',')} lei/${product.unitType}`;
}

/** True when at least one store has a verified, in-stock offer for the product. */
export function hasVerifiedPrice(product: CanonicalProduct): boolean {
  return Object.values(product.offers).some((offer) => offer && !offer.isUnavailable);
}

/** Number of stores with a verified offer (9 for the static catalog). */
export function countVerifiedStores(product: CanonicalProduct): number {
  return Object.values(product.offers).filter((offer) => offer && !offer.isUnavailable).length;
}

function pluralProduse(n: number): string {
  return n === 1 ? '1 produs' : `${n} produse`;
}

/** Plain-language warnings about lines that are not part of a store / plan total. */
export function buildCoverageWarnings(
  storeLabel: string,
  missingCount: number,
  unpricedCount: number
): string[] {
  const warnings: string[] = [];
  if (missingCount > 0) {
    warnings.push(
      `${pluralProduse(missingCount)} din coș ${missingCount === 1 ? 'nu are' : 'nu au'} ofertă verificată la ${storeLabel} și ${missingCount === 1 ? 'nu este inclus' : 'nu sunt incluse'} în total.`
    );
  }
  if (unpricedCount > 0) {
    warnings.push(
      `${pluralProduse(unpricedCount)} fără preț verificat la niciun magazin nu intră în total.`
    );
  }
  return warnings;
}

export function getEffectiveOffer(
  product: CanonicalProduct,
  storeId: StoreId,
  activeCards: LoyaltyCardId[]
): EffectiveOffer {
  const offer = product.offers[storeId];
  if (!offer || offer.isUnavailable) {
    return {
      storeId,
      price: 0,
      basePrice: 0,
      usedCardProgram: null,
      promoLabel: null,
      matchKind: offer?.matchKind ?? (product.isPrivateLabel ? 'Marcă proprie / Alternativă' : 'Exact'),
      equivalenceLevel: offer?.equivalenceLevel ?? (product.isPrivateLabel ? 4 : 1),
      variantLabel: null,
      unitPriceLabel: '—',
      regularPrice: null,
      promoIsInfoOnly: false,
      isUnavailable: true,
      isOutOfStock: Boolean(offer?.isOutOfStock),
    };
  }
  const hasCard =
    offer.cardId !== undefined &&
    offer.cardPrice !== undefined &&
    activeCards.includes(offer.cardId);

  const price = hasCard && offer.cardPrice !== undefined ? offer.cardPrice : offer.basePrice;

  const equivalenceLevel: EquivalenceLevel =
    offer.equivalenceLevel ?? (offer.matchKind === 'Exact' ? 1 : 4);

  return {
    storeId,
    price,
    basePrice: offer.basePrice,
    usedCardProgram: hasCard && offer.cardProgram ? offer.cardProgram : null,
    promoLabel: offer.promoLabel ?? null,
    matchKind: offer.matchKind,
    equivalenceLevel,
    variantLabel: offer.variantLabel ?? null,
    unitPriceLabel: formatUnitPrice(price, product),
    regularPrice:
      offer.regularPrice !== undefined && offer.regularPrice > offer.basePrice
        ? offer.regularPrice
        : null,
    promoIsInfoOnly: Boolean(offer.promoIsInfoOnly),
    isUnavailable: false,
    isOutOfStock: false,
  };
}

export function resolveProductForMode(
  product: CanonicalProduct,
  economyMode: boolean,
  productMap: Record<string, CanonicalProduct> = PRODUCT_MAP,
  excludedSwapFromIds: string[] = []
): { resolvedProduct: CanonicalProduct; swappedFrom: CanonicalProduct | null } {
  if (economyMode) {
    if (product.isPrivateLabel) {
      const nationalBrand = Object.values(productMap).find(
        (candidate) => !candidate.isPrivateLabel && candidate.economyEquivalentId === product.id
      );
      if (nationalBrand && excludedSwapFromIds.includes(nationalBrand.id)) {
        return { resolvedProduct: nationalBrand, swappedFrom: null };
      }
      return {
        resolvedProduct: product,
        swappedFrom: nationalBrand ?? null,
      };
    }
    if (
      product.economyEquivalentId &&
      !excludedSwapFromIds.includes(product.id) &&
      productMap[product.economyEquivalentId]
    ) {
      return {
        resolvedProduct: productMap[product.economyEquivalentId],
        swappedFrom: product,
      };
    }
    return { resolvedProduct: product, swappedFrom: null };
  }

  // Mod Fidel: if product is private label, resolve back to its consecrated national brand
  if (product.isPrivateLabel) {
    const nationalBrand = Object.values(productMap).find(
      (candidate) => !candidate.isPrivateLabel && candidate.economyEquivalentId === product.id
    );
    if (nationalBrand) {
      return {
        resolvedProduct: nationalBrand,
        swappedFrom: product,
      };
    }
  }

  return { resolvedProduct: product, swappedFrom: null };
}

export function getFidelitySavingsSuggestion(
  product: CanonicalProduct,
  storeId: StoreId,
  activeCards: LoyaltyCardId[],
  productMap: Record<string, CanonicalProduct> = PRODUCT_MAP
): FidelitySuggestion | null {
  if (!product.economyEquivalentId) return null;
  const equivalent = productMap[product.economyEquivalentId];
  if (!equivalent) return null;

  const currentOffer = getEffectiveOffer(product, storeId, activeCards);
  const altOffer = getEffectiveOffer(equivalent, storeId, activeCards);
  // A swap is only a saving when both products are actually sold at this store
  if (currentOffer.isUnavailable || altOffer.isUnavailable) return null;
  const savings = round2(currentOffer.price - altOffer.price);
  if (currentOffer.price <= 0 || savings <= 0) return null;

  const savingsPercent = (savings / currentOffer.price) * 100;
  if (savingsPercent <= 20) return null;

  return {
    equivalentProduct: equivalent,
    variantLabel: altOffer.variantLabel ?? equivalent.canonicalName,
    savingsPerUnit: savings,
    savingsPercent: Math.round(savingsPercent),
  };
}

export function getFilteredStoreIds(filterMode: StoreFilterMode): StoreId[] {
  if (filterMode === 'physical') {
    return STORES.filter((s) => s.channel === 'physical' || s.channel === 'hybrid').map((s) => s.id);
  }
  if (filterMode === 'online') {
    return STORES.filter((s) => s.channel === 'online' || s.channel === 'hybrid').map((s) => s.id);
  }
  return STORES.map((s) => s.id);
}

export function computeDeliveryFee(
  storeId: StoreId,
  subtotal: number,
  activeCards: LoyaltyCardId[],
  channelMode: StoreFilterMode
): {
  deliveryFee: number;
  meetsMinOrder: boolean;
  amountToMinOrder: number;
  amountToFreeDelivery: number | null;
} {
  const store = STORE_MAP[storeId];
  if (subtotal <= 0) {
    return {
      deliveryFee: 0,
      meetsMinOrder: true,
      amountToMinOrder: 0,
      amountToFreeDelivery: null,
    };
  }

  const appliesOnlineRules =
    store.channel === 'online' || (channelMode === 'online' && store.channel === 'hybrid');

  if (!appliesOnlineRules) {
    return {
      deliveryFee: 0,
      meetsMinOrder: true,
      amountToMinOrder: 0,
      amountToFreeDelivery: null,
    };
  }

  const meetsMinOrder = subtotal >= store.minOrder;
  const amountToMinOrder = meetsMinOrder ? 0 : round2(store.minOrder - subtotal);

  if (storeId === 'sezamo' && activeCards.includes('sezamo_xtra')) {
    return {
      deliveryFee: 0,
      meetsMinOrder,
      amountToMinOrder,
      amountToFreeDelivery: 0,
    };
  }

  const threshold = store.freeDeliveryThreshold;
  const freeDelivery = threshold !== null && subtotal >= threshold;
  const deliveryFee = freeDelivery ? 0 : store.deliveryFee;
  const amountToFreeDelivery =
    threshold === null ? null : freeDelivery ? 0 : round2(threshold - subtotal);

  return {
    deliveryFee,
    meetsMinOrder,
    amountToMinOrder,
    amountToFreeDelivery,
  };
}

function computeMatchQualityScore(summary: MatchQualitySummary): number {
  if (summary.totalItems <= 0) return 100;
  const weighted =
    summary.exactCount * 100 +
    summary.twinCount * 95 +
    summary.functionalCount * 85 +
    summary.privateLabelCount * 72;
  return Math.round(weighted / summary.totalItems);
}

export function calculateStoreBasketSummary(
  basket: BasketItem[],
  storeId: StoreId,
  activeCards: LoyaltyCardId[],
  economyMode: boolean,
  channelMode: StoreFilterMode = 'all',
  productMap: Record<string, CanonicalProduct> = PRODUCT_MAP,
  excludedSwapFromIds: string[] = []
): StoreBasketSummary {
  let subtotal = 0;
  let shelfSubtotal = 0;
  let fidelitySubtotal = 0;
  let potentialMissingCardSavings = 0;
  const storeInfo = STORE_MAP[storeId];

  let exactCount = 0;
  let twinCount = 0;
  let functionalCount = 0;
  let privateLabelCount = 0;
  let totalItems = 0;
  let missingCount = 0;
  let unpricedCount = 0;
  const missingProductIds: string[] = [];

  for (const item of basket) {
    const baseProd = productMap[item.productId];
    if (!baseProd) continue;

    const { resolvedProduct } = resolveProductForMode(
      baseProd,
      economyMode,
      productMap,
      excludedSwapFromIds
    );
    const activeOffer = getEffectiveOffer(resolvedProduct, storeId, activeCards);
    if (activeOffer.isUnavailable) {
      // Never priced here: keep it out of the subtotal and report it as coverage instead
      if (hasVerifiedPrice(resolvedProduct)) {
        missingCount += 1;
        missingProductIds.push(item.productId);
      } else {
        unpricedCount += 1;
      }
      continue;
    }

    const { resolvedProduct: fidelityProd } = resolveProductForMode(baseProd, false, productMap);
    const fidelityOffer = getEffectiveOffer(fidelityProd, storeId, activeCards);
    // Economy savings are only comparable when the consecrated brand is sold here too
    fidelitySubtotal +=
      (fidelityOffer.isUnavailable ? activeOffer.price : fidelityOffer.price) * item.quantity;

    subtotal += activeOffer.price * item.quantity;
    shelfSubtotal += activeOffer.basePrice * item.quantity;

    const rawOffer = resolvedProduct.offers[storeId];
    if (
      rawOffer.cardId &&
      rawOffer.cardPrice !== undefined &&
      !activeCards.includes(rawOffer.cardId) &&
      rawOffer.cardPrice < rawOffer.basePrice
    ) {
      potentialMissingCardSavings += (rawOffer.basePrice - rawOffer.cardPrice) * item.quantity;
    }

    totalItems += 1;
    if (activeOffer.equivalenceLevel === 1) exactCount += 1;
    else if (activeOffer.equivalenceLevel === 2) twinCount += 1;
    else if (activeOffer.equivalenceLevel === 3) functionalCount += 1;
    else privateLabelCount += 1;
  }

  subtotal = round2(subtotal);
  shelfSubtotal = round2(shelfSubtotal);
  fidelitySubtotal = round2(fidelitySubtotal);

  const delivery = computeDeliveryFee(storeId, subtotal, activeCards, channelMode);

  // Include delivery savings if Sezamo Xtra isn't active
  const potentialMissingCardId =
    storeInfo.cardId && !activeCards.includes(storeInfo.cardId) ? storeInfo.cardId : null;
  if (storeId === 'sezamo' && potentialMissingCardId === 'sezamo_xtra' && delivery.deliveryFee > 0) {
    potentialMissingCardSavings += delivery.deliveryFee;
  }

  const partialMatch: MatchQualitySummary = {
    exactCount,
    twinCount,
    functionalCount,
    privateLabelCount,
    totalItems,
    qualityPct: 100,
  };
  partialMatch.qualityPct = computeMatchQualityScore(partialMatch);

  return {
    storeId,
    subtotal,
    shelfSubtotal,
    cardSavings: round2(Math.max(0, shelfSubtotal - subtotal)),
    deliveryFee: delivery.deliveryFee,
    totalWithDelivery: round2(subtotal + delivery.deliveryFee),
    meetsMinOrder: delivery.meetsMinOrder,
    amountToMinOrder: delivery.amountToMinOrder,
    amountToFreeDelivery: delivery.amountToFreeDelivery,
    economySavingsVsFidelity: economyMode ? round2(Math.max(0, fidelitySubtotal - subtotal)) : 0,
    potentialMissingCardId,
    potentialMissingCardSavings: round2(potentialMissingCardSavings),
    matchSummary: partialMatch,
    availableCount: totalItems,
    missingCount,
    unpricedCount,
    missingProductIds,
  };
}

/**
 * Coverage first, price second: a store that sells only 1 of 5 basket lines has a tiny
 * subtotal and must never outrank a store that sells all 5.
 */
export function compareStoreSummaries(a: StoreBasketSummary, b: StoreBasketSummary): number {
  return a.missingCount - b.missingCount || a.totalWithDelivery - b.totalWithDelivery;
}

export function getRankedStores(
  basket: BasketItem[],
  activeCards: LoyaltyCardId[],
  economyMode: boolean,
  channelMode: StoreFilterMode = 'all',
  productMap: Record<string, CanonicalProduct> = PRODUCT_MAP,
  excludedStoreIds: StoreId[] = [],
  excludedSwapFromIds: string[] = []
): StoreBasketSummary[] {
  const allFiltered = getFilteredStoreIds(channelMode);
  const available = allFiltered.filter((id) => !excludedStoreIds.includes(id));
  const storeIds = available.length > 0 ? available : allFiltered;
  return storeIds
    .map((storeId) =>
      calculateStoreBasketSummary(
        basket,
        storeId,
        activeCards,
        economyMode,
        channelMode,
        productMap,
        excludedSwapFromIds
      )
    )
    .sort(compareStoreSummaries);
}

/** Pick store A or B for a line: only stores that sell it compete, then cheapest wins. */
function pickSplitStore(a: EffectiveOffer, b: EffectiveOffer): 'A' | 'B' | null {
  if (a.isUnavailable && b.isUnavailable) return null;
  if (a.isUnavailable) return 'B';
  if (b.isUnavailable) return 'A';
  return a.price <= b.price ? 'A' : 'B';
}

export function computeSplitTwoStores(
  basket: BasketItem[],
  activeCards: LoyaltyCardId[],
  economyMode: boolean,
  channelMode: StoreFilterMode = 'all',
  productMap: Record<string, CanonicalProduct> = PRODUCT_MAP,
  excludedStoreIds: StoreId[] = [],
  excludedSwapFromIds: string[] = []
): SplitTwoStoreResult | null {
  if (basket.length < 2) return null;

  const ranked = getRankedStores(
    basket,
    activeCards,
    economyMode,
    channelMode,
    productMap,
    excludedStoreIds,
    excludedSwapFromIds
  );
  if (ranked.length < 2) return null;

  const bestSingle = ranked.find((r) => r.meetsMinOrder) ?? ranked[0];
  const storeIds = ranked.map((r) => r.storeId);

  let bestSplit: SplitTwoStoreResult | null = null;

  for (let i = 0; i < storeIds.length; i++) {
    for (let j = i + 1; j < storeIds.length; j++) {
      const storeA = storeIds[i];
      const storeB = storeIds[j];
      let subtotalA = 0;
      let subtotalB = 0;
      let splitMissing = 0;
      const assignments: Record<string, StoreId> = {};

      for (const item of basket) {
        const baseProd = productMap[item.productId];
        if (!baseProd) continue;
        const { resolvedProduct } = resolveProductForMode(
          baseProd,
          economyMode,
          productMap,
          excludedSwapFromIds
        );
        const offA = getEffectiveOffer(resolvedProduct, storeA, activeCards);
        const offB = getEffectiveOffer(resolvedProduct, storeB, activeCards);
        const priceA = offA.price * item.quantity;
        const priceB = offB.price * item.quantity;

        const pick = pickSplitStore(offA, offB);
        if (pick === 'A') {
          subtotalA += priceA;
          assignments[item.productId] = storeA;
        } else if (pick === 'B') {
          subtotalB += priceB;
          assignments[item.productId] = storeB;
        } else if (hasVerifiedPrice(resolvedProduct)) {
          splitMissing += 1;
        }
      }

      if (subtotalA === 0 || subtotalB === 0) continue;

      subtotalA = round2(subtotalA);
      subtotalB = round2(subtotalB);
      const delivA = computeDeliveryFee(storeA, subtotalA, activeCards, channelMode);
      const delivB = computeDeliveryFee(storeB, subtotalB, activeCards, channelMode);

      // Cannot split onto an online store whose sub-basket falls below minimum order
      if (!delivA.meetsMinOrder || !delivB.meetsMinOrder) continue;

      const deliveryA = delivA.deliveryFee;
      const deliveryB = delivB.deliveryFee;
      const totalWithDelivery = round2(subtotalA + subtotalB + deliveryA + deliveryB);

      if (
        !bestSplit ||
        splitMissing < bestSplit.missingCount ||
        (splitMissing === bestSplit.missingCount && totalWithDelivery < bestSplit.totalWithDelivery)
      ) {
        const coverageGain: number = bestSingle.missingCount - splitMissing;
        // Totals are only comparable when both options cover the same basket lines
        const netSavings: number =
          coverageGain === 0 ? round2(bestSingle.totalWithDelivery - totalWithDelivery) : 0;
        const savingsPercent: number =
          coverageGain === 0 && bestSingle.totalWithDelivery > 0
            ? round2((netSavings / bestSingle.totalWithDelivery) * 100)
            : 0;

        bestSplit = {
          storeA,
          storeB,
          subtotalA,
          subtotalB,
          deliveryA,
          deliveryB,
          totalWithDelivery,
          bestSingleStoreId: bestSingle.storeId,
          bestSingleTotal: bestSingle.totalWithDelivery,
          netSavings,
          savingsPercent,
          // Worth 2 stops when it covers more of the basket, or saves real money on the same lines
          isWorthwhile: coverageGain > 0 || (coverageGain === 0 && netSavings > 10 && savingsPercent > 8),
          missingCount: splitMissing,
          coverageGain,
          assignments,
        };
      }
    }
  }

  return bestSplit;
}

export function computeOptimizationPlan(
  basket: BasketItem[],
  activeCards: LoyaltyCardId[],
  economyMode: boolean,
  channelMode: StoreFilterMode,
  strategy: OptimizationStrategy,
  productMap: Record<string, CanonicalProduct> = PRODUCT_MAP,
  options: OptimizationOptions = {}
): OptimizationPlan | null {
  if (basket.length === 0) return null;

  const maxStores = options.maxStores ?? 2;
  const excludedStoreIds = options.excludedStoreIds ?? [];
  const excludedSwapFromIds = options.excludedSwapFromIds ?? [];

  const fidelityRanked = getRankedStores(
    basket,
    activeCards,
    false,
    channelMode,
    productMap,
    excludedStoreIds
  );
  const economyRanked = getRankedStores(
    basket,
    activeCards,
    economyMode,
    channelMode,
    productMap,
    excludedStoreIds,
    economyMode ? excludedSwapFromIds : []
  );
  if (fidelityRanked.length === 0) return null;

  // Market stats only compare stores that cover the same number of basket lines as the best one
  const comparableStores = fidelityRanked.filter(
    (r) => r.missingCount === fidelityRanked[0].missingCount
  );
  const averageMarketTotal = round2(
    comparableStores.reduce((sum, r) => sum + r.totalWithDelivery, 0) / comparableStores.length
  );
  const maxMarketTotal = Math.max(...comparableStores.map((r) => r.totalWithDelivery));
  const minEconomySingle = economyRanked[0]?.totalWithDelivery ?? fidelityRanked[0].totalWithDelivery;
  const fidelityWinner =
    fidelityRanked.find((r) => r.meetsMinOrder) ?? fidelityRanked[0];

  if (strategy === 'fidelity') {
    const chosen = fidelityWinner;
    const store = STORE_MAP[chosen.storeId];
    const priceRange = Math.max(1, maxMarketTotal - minEconomySingle);
    const pricePts = Math.round(
      Math.max(0, Math.min(45, ((maxMarketTotal - chosen.totalWithDelivery) / priceRange) * 45))
    );
    const matchPts = Math.round((chosen.matchSummary.qualityPct / 100) * 30);
    const conveniencePts = 15 + (chosen.meetsMinOrder ? 10 : 0);

    const reasons: string[] = [
      `Mod Fidel activ: compară exclusiv branduri consacrate (fără mărci proprii) într-un singur drum la ${store.name}.`,
    ];
    if (chosen.cardSavings > 0) {
      reasons.push(
        `Cardurile tale active reduc coșul cu ${formatRon(chosen.cardSavings)} față de prețul standard de raft.`
      );
    }
    const vsAvg = round2(averageMarketTotal - chosen.totalWithDelivery);
    if (vsAvg > 0 && comparableStores.length > 1) {
      reasons.push(
        `Este cu ${formatRon(vsAvg)} mai ieftin decât media celor ${comparableStores.length} magazine comparabile (${formatRon(averageMarketTotal)}), într-un singur drum.`
      );
    }

    const warnings: string[] = buildCoverageWarnings(
      store.name,
      chosen.missingCount,
      chosen.unpricedCount
    );
    if (!chosen.meetsMinOrder) {
      warnings.push(
        `Comandă sub pragul minim la ${store.name} (mai lipsesc ${formatRon(chosen.amountToMinOrder)}).`
      );
    }

    return {
      strategy: 'fidelity',
      storeId: chosen.storeId,
      storeLabel: store.name,
      isSplit: false,
      splitResult: null,
      totalWithDelivery: chosen.totalWithDelivery,
      shelfSubtotal: chosen.shelfSubtotal,
      cardSavings: chosen.cardSavings,
      swapSavings: 0,
      deliveryFee: chosen.deliveryFee,
      meetsMinOrder: chosen.meetsMinOrder,
      amountToMinOrder: chosen.amountToMinOrder,
      averageMarketTotal,
      savingsVsAverage: round2(averageMarketTotal - chosen.totalWithDelivery),
      savingsVsFidelityWinner: 0,
      balancedScore: Math.min(100, pricePts + matchPts + conveniencePts),
      scoreBreakdown: { pricePts, matchPts, conveniencePts },
      matchSummary: chosen.matchSummary,
      availableCount: chosen.availableCount,
      missingCount: chosen.missingCount,
      unpricedCount: chosen.unpricedCount,
      swapsApplied: [],
      applyEconomyMode: false,
      reasons,
      warnings,
      cardOpportunity:
        chosen.potentialMissingCardId && chosen.potentialMissingCardSavings > 0 && store.cardProgram
          ? {
              cardId: chosen.potentialMissingCardId,
              cardProgram: store.cardProgram,
              extraSavings: chosen.potentialMissingCardSavings,
            }
          : null,
    };
  }

  if (strategy === 'cheapest') {
    const economySplit =
      maxStores === 2
        ? computeSplitTwoStores(
            basket,
            activeCards,
            economyMode,
            channelMode,
            productMap,
            excludedStoreIds,
            economyMode ? excludedSwapFromIds : []
          )
        : null;
    const bestEconomySingle =
      economyRanked.find((r) => r.meetsMinOrder) ?? economyRanked[0];
    const useSplit = maxStores === 2 && Boolean(economySplit && economySplit.isWorthwhile);

    if (useSplit && economySplit) {
      const storeA = STORE_MAP[economySplit.storeA];
      const storeB = STORE_MAP[economySplit.storeB];
      const deliveryFee = round2(economySplit.deliveryA + economySplit.deliveryB);

      let shelfSubtotal = 0;
      let subtotalAfterCard = 0;
      let exactCount = 0;
      let twinCount = 0;
      let functionalCount = 0;
      let privateLabelCount = 0;
      let splitAvailable = 0;
      let splitUnpriced = 0;
      const swapsApplied: BalancedSwapRecommendation[] = [];

      for (const item of basket) {
        const baseProd = productMap[item.productId];
        if (!baseProd) continue;
        const targetStore = economySplit.assignments[item.productId] ?? economySplit.storeA;
        const { resolvedProduct, swappedFrom } = resolveProductForMode(
          baseProd,
          economyMode,
          productMap,
          economyMode ? excludedSwapFromIds : []
        );
        const eff = getEffectiveOffer(resolvedProduct, targetStore, activeCards);
        if (eff.isUnavailable) {
          if (!hasVerifiedPrice(resolvedProduct)) splitUnpriced += 1;
          continue;
        }
        splitAvailable += 1;
        subtotalAfterCard += eff.price * item.quantity;
        shelfSubtotal += eff.basePrice * item.quantity;

        if (eff.equivalenceLevel === 1) exactCount += 1;
        else if (eff.equivalenceLevel === 2) twinCount += 1;
        else if (eff.equivalenceLevel === 3) functionalCount += 1;
        else privateLabelCount += 1;

        if (economyMode && swappedFrom && !swappedFrom.isPrivateLabel) {
          const baseOffer = getEffectiveOffer(swappedFrom, targetStore, activeCards);
          const diff = baseOffer.isUnavailable
            ? 0
            : round2((baseOffer.price - eff.price) * item.quantity);
          if (diff > 0) {
            swapsApplied.push({
              fromProductId: swappedFrom.id,
              toProductId: resolvedProduct.id,
              fromName: swappedFrom.canonicalName,
              toName: eff.variantLabel ?? resolvedProduct.canonicalName,
              savings: diff,
              percentSaved: Math.round(((baseOffer.price - eff.price) / baseOffer.price) * 100),
            });
          }
        }
      }

      shelfSubtotal = round2(shelfSubtotal);
      subtotalAfterCard = round2(subtotalAfterCard);
      const cardSavings = round2(Math.max(0, shelfSubtotal - subtotalAfterCard));
      const swapSavings = round2(swapsApplied.reduce((s, sw) => s + sw.savings, 0));
      const matchSummary: MatchQualitySummary = {
        exactCount,
        twinCount,
        functionalCount,
        privateLabelCount,
        totalItems: splitAvailable,
        qualityPct: 100,
      };
      matchSummary.qualityPct = computeMatchQualityScore(matchSummary);
      const matchPts = Math.round((matchSummary.qualityPct / 100) * 30);
      const coverageReason =
        economySplit.coverageGain > 0
          ? `Împărțit între ${storeA.name} și ${storeB.name}, coșul acoperă ${splitAvailable} produse verificate, cu ${economySplit.coverageGain} mai mult decât cel mai bun magazin unic.`
          : null;

      return {
        strategy: 'cheapest',
        storeId: 'split',
        storeLabel: `${storeA.name} + ${storeB.name}`,
        isSplit: true,
        splitResult: economySplit,
        totalWithDelivery: economySplit.totalWithDelivery,
        shelfSubtotal,
        cardSavings,
        swapSavings,
        deliveryFee,
        meetsMinOrder: true,
        amountToMinOrder: 0,
        averageMarketTotal,
        savingsVsAverage: round2(averageMarketTotal - economySplit.totalWithDelivery),
        savingsVsFidelityWinner: round2(
          Math.max(0, fidelityWinner.totalWithDelivery - economySplit.totalWithDelivery)
        ),
        balancedScore: Math.min(100, 45 + matchPts + 14),
        scoreBreakdown: { pricePts: 45, matchPts, conveniencePts: 14 },
        matchSummary,
        availableCount: splitAvailable,
        missingCount: economySplit.missingCount,
        unpricedCount: splitUnpriced,
        swapsApplied,
        applyEconomyMode: economyMode,
        reasons: coverageReason
          ? [coverageReason, `Total pentru produsele acoperite: ${formatRon(economySplit.totalWithDelivery)}.`]
          : economyMode
          ? [
              `Combină ${storeA.name} și ${storeB.name} cu mărci proprii pentru cel mai mic cost total (${formatRon(economySplit.totalWithDelivery)}).`,
              `Economisești ${formatRon(economySplit.netSavings)} (${economySplit.savingsPercent}%) față de cel mai ieftin magazin unic.`,
            ]
          : [
              `Combină ${storeA.name} și ${storeB.name} păstrând brandurile consacrate (${formatRon(economySplit.totalWithDelivery)}).`,
              `Economisești ${formatRon(economySplit.netSavings)} (${economySplit.savingsPercent}%) față de un singur magazin.`,
            ],
        warnings: [
          `Necesită 2 opriri separate (${storeA.shortName} și ${storeB.shortName}) pentru a obține acest preț.`,
          ...buildCoverageWarnings(
            `${storeA.shortName} + ${storeB.shortName}`,
            economySplit.missingCount,
            splitUnpriced
          ),
        ],
        cardOpportunity: null,
      };
    }

    const store = STORE_MAP[bestEconomySingle.storeId];
    const swapsApplied: BalancedSwapRecommendation[] = [];
    if (economyMode) {
      for (const item of basket) {
        const baseProd = productMap[item.productId];
        if (!baseProd) continue;
        const { resolvedProduct, swappedFrom } = resolveProductForMode(
          baseProd,
          true,
          productMap,
          excludedSwapFromIds
        );
        if (swappedFrom && !swappedFrom.isPrivateLabel) {
          const baseOffer = getEffectiveOffer(swappedFrom, bestEconomySingle.storeId, activeCards);
          const ecoOffer = getEffectiveOffer(
            resolvedProduct,
            bestEconomySingle.storeId,
            activeCards
          );
          if (baseOffer.isUnavailable || ecoOffer.isUnavailable) continue;
          const diff = round2((baseOffer.price - ecoOffer.price) * item.quantity);
          if (diff > 0) {
            swapsApplied.push({
              fromProductId: swappedFrom.id,
              toProductId: resolvedProduct.id,
              fromName: swappedFrom.canonicalName,
              toName: ecoOffer.variantLabel ?? resolvedProduct.canonicalName,
              savings: diff,
              percentSaved: Math.round(
                ((baseOffer.price - ecoOffer.price) / baseOffer.price) * 100
              ),
            });
          }
        }
      }
    }

    const matchPts = Math.round((bestEconomySingle.matchSummary.qualityPct / 100) * 30);
    const conveniencePts = 15 + (bestEconomySingle.meetsMinOrder ? 10 : 0);

    return {
      strategy: 'cheapest',
      storeId: bestEconomySingle.storeId,
      storeLabel: store.name,
      isSplit: false,
      splitResult: economySplit,
      totalWithDelivery: bestEconomySingle.totalWithDelivery,
      shelfSubtotal: bestEconomySingle.shelfSubtotal,
      cardSavings: bestEconomySingle.cardSavings,
      swapSavings: economyMode ? bestEconomySingle.economySavingsVsFidelity : 0,
      deliveryFee: bestEconomySingle.deliveryFee,
      meetsMinOrder: bestEconomySingle.meetsMinOrder,
      amountToMinOrder: bestEconomySingle.amountToMinOrder,
      averageMarketTotal,
      savingsVsAverage: round2(averageMarketTotal - bestEconomySingle.totalWithDelivery),
      savingsVsFidelityWinner: round2(
        Math.max(0, fidelityWinner.totalWithDelivery - bestEconomySingle.totalWithDelivery)
      ),
      balancedScore: Math.min(100, 45 + matchPts + conveniencePts),
      scoreBreakdown: { pricePts: 45, matchPts, conveniencePts },
      matchSummary: bestEconomySingle.matchSummary,
      availableCount: bestEconomySingle.availableCount,
      missingCount: bestEconomySingle.missingCount,
      unpricedCount: bestEconomySingle.unpricedCount,
      swapsApplied,
      applyEconomyMode: economyMode,
      reasons: economyMode
        ? [
            `Activează echivalentele marcă proprie la ${store.name} pentru prețul minim absolut.`,
            `Economisești ${formatRon(bestEconomySingle.economySavingsVsFidelity)} față de brandurile consacrate din același magazin.`,
          ]
        : [
            `Cel mai mic total pentru brandurile consacrate este la ${store.name} (${formatRon(bestEconomySingle.totalWithDelivery)}).`,
            bestEconomySingle.cardSavings > 0
              ? `Cardurile active reduc coșul cu -${formatRon(bestEconomySingle.cardSavings)}.`
              : `Compară exclusiv brandurile consacrate disponibile în toate magazinele.`,
          ],
      warnings: [
        ...buildCoverageWarnings(
          store.name,
          bestEconomySingle.missingCount,
          bestEconomySingle.unpricedCount
        ),
        ...(!bestEconomySingle.meetsMinOrder
          ? [
              `Sub pragul minim de comandă la ${store.name} (mai lipsesc ${formatRon(bestEconomySingle.amountToMinOrder)}).`,
            ]
          : []),
      ],
      cardOpportunity:
        bestEconomySingle.potentialMissingCardId &&
        bestEconomySingle.potentialMissingCardSavings > 0 &&
        store.cardProgram
          ? {
              cardId: bestEconomySingle.potentialMissingCardId,
              cardProgram: store.cardProgram,
              extraSavings: bestEconomySingle.potentialMissingCardSavings,
            }
          : null,
    };
  }

  // BALANCED OPTIMIZATION (Default & Recommended)
  // In Mod Fidel (economyMode === false): strictly compares consecrated national brands (0 private labels).
  // In Mod Economie (economyMode === true): applies selective >20% private-label swaps (debifabile individual).
  const allStoreIds = getFilteredStoreIds(channelMode);
  const filteredStoreIds = allStoreIds.filter((id) => !excludedStoreIds.includes(id));
  const storeIds = filteredStoreIds.length > 0 ? filteredStoreIds : allStoreIds;
  const priceRange = Math.max(1, maxMarketTotal - minEconomySingle);

  interface CandidateEval {
    plan: OptimizationPlan;
    missingCount: number;
  }

  const candidates: CandidateEval[] = storeIds.map((storeId) => {
    let missingCount = 0;
    let unpricedCount = 0;
    let availableCount = 0;
    const store = STORE_MAP[storeId];
    let subtotal = 0;
    let shelfSubtotal = 0;
    let swapSavings = 0;
    let potentialMissingCardSavings = 0;

    let exactCount = 0;
    let twinCount = 0;
    let functionalCount = 0;
    let privateLabelCount = 0;

    const swapsApplied: BalancedSwapRecommendation[] = [];

    for (const item of basket) {
      const baseProd = productMap[item.productId];
      if (!baseProd) continue;

      const { resolvedProduct: normalizedBase } = resolveProductForMode(
        baseProd,
        false,
        productMap
      );
      const fidelityOffer = getEffectiveOffer(normalizedBase, storeId, activeCards);
      const rawSuggestion = economyMode
        ? getFidelitySavingsSuggestion(normalizedBase, storeId, activeCards, productMap)
        : null;
      const suggestion =
        rawSuggestion && !excludedSwapFromIds.includes(normalizedBase.id) ? rawSuggestion : null;

      let chosenProd = normalizedBase;
      let chosenOffer = fidelityOffer;

      if (suggestion) {
        chosenProd = suggestion.equivalentProduct;
        chosenOffer = getEffectiveOffer(chosenProd, storeId, activeCards);
        const diff = round2(suggestion.savingsPerUnit * item.quantity);
        swapSavings += diff;
        swapsApplied.push({
          fromProductId: normalizedBase.id,
          toProductId: chosenProd.id,
          fromName: normalizedBase.canonicalName,
          toName: suggestion.variantLabel,
          savings: diff,
          percentSaved: suggestion.savingsPercent,
        });
      }

      if (chosenOffer.isUnavailable) {
        if (hasVerifiedPrice(chosenProd)) missingCount += 1;
        else unpricedCount += 1;
        continue;
      }
      availableCount += 1;
      subtotal += chosenOffer.price * item.quantity;
      shelfSubtotal += chosenOffer.basePrice * item.quantity;

      const rawOffer = chosenProd.offers[storeId];
      if (
        rawOffer.cardId &&
        rawOffer.cardPrice !== undefined &&
        !activeCards.includes(rawOffer.cardId) &&
        rawOffer.cardPrice < rawOffer.basePrice
      ) {
        potentialMissingCardSavings += (rawOffer.basePrice - rawOffer.cardPrice) * item.quantity;
      }

      if (chosenOffer.equivalenceLevel === 1) exactCount += 1;
      else if (chosenOffer.equivalenceLevel === 2) twinCount += 1;
      else if (chosenOffer.equivalenceLevel === 3) functionalCount += 1;
      else privateLabelCount += 1;
    }

    subtotal = round2(subtotal);
    shelfSubtotal = round2(shelfSubtotal);
    swapSavings = round2(swapSavings);

    const delivery = computeDeliveryFee(storeId, subtotal, activeCards, channelMode);
    const totalWithDelivery = round2(subtotal + delivery.deliveryFee);
    const cardSavings = round2(Math.max(0, shelfSubtotal - subtotal));

    if (storeId === 'sezamo' && !activeCards.includes('sezamo_xtra') && delivery.deliveryFee > 0) {
      potentialMissingCardSavings += delivery.deliveryFee;
    }
    potentialMissingCardSavings = round2(potentialMissingCardSavings);

    const matchSummary: MatchQualitySummary = {
      exactCount,
      twinCount,
      functionalCount,
      privateLabelCount,
      totalItems: availableCount,
      qualityPct: 100,
    };
    matchSummary.qualityPct = computeMatchQualityScore(matchSummary);

    const pricePts = Math.round(
      Math.max(0, Math.min(45, ((maxMarketTotal - totalWithDelivery) / priceRange) * 45))
    );
    const matchPts = Math.round((matchSummary.qualityPct / 100) * 30);
    const conveniencePts = 15 + (delivery.meetsMinOrder ? 10 : 0);
    // A low total caused by missing lines is not a good deal: scale the score by coverage
    const pricedLines = availableCount + missingCount;
    const coverageRatio = pricedLines > 0 ? availableCount / pricedLines : 1;
    const balancedScore = Math.round(
      Math.min(100, pricePts + matchPts + conveniencePts) * coverageRatio
    );

    const vsAvg = round2(averageMarketTotal - totalWithDelivery);
    const vsFidelity = round2(Math.max(0, fidelityWinner.totalWithDelivery - totalWithDelivery));

    const reasons: string[] = [];
    reasons.push(
      `Scor Balanced ${balancedScore}/100 la ${store.name}: îmbină un singur drum cu economii reale (${formatRon(totalWithDelivery)}${vsAvg > 0 ? `, -${formatRon(vsAvg)} sub media celor ${storeIds.length} magazine` : ''}).`
    );
    if (swapsApplied.length > 0) {
      reasons.push(
        `Înlocuiește selectiv doar ${swapsApplied.length} produse cu marcă proprie unde economia depășește 20% (-${formatRon(swapSavings)}), păstrând restul brandurilor originale.`
      );
    } else {
      reasons.push(
        `Păstrează brandurile tale principale fără compromisuri inutile, cu ${matchSummary.exactCount + matchSummary.twinCount}/${matchSummary.totalItems} potriviri directe.`
      );
    }
    if (cardSavings > 0) {
      reasons.push(
        `Cardurile tale active reduc automat nota cu -${formatRon(cardSavings)}.`
      );
    }
    if (delivery.deliveryFee === 0) {
      reasons.push(
        store.channel === 'physical'
          ? 'Fără taxă de livrare (cumpărături directe într-o singură oprire).'
          : 'Livrare gratuită atinsă (prag îndeplinit).'
      );
    } else {
      reasons.push(`Include taxa de livrare de ${formatRon(delivery.deliveryFee)}.`);
    }

    const warnings: string[] = buildCoverageWarnings(store.name, missingCount, unpricedCount);
    if (!delivery.meetsMinOrder) {
      warnings.push(
        `Comanda la ${store.name} este sub minimul de ${store.minOrder} lei (mai lipsesc ${formatRon(delivery.amountToMinOrder)}).`
      );
    }

    return {
      missingCount,
      plan: {
        strategy: 'balanced',
        storeId,
        storeLabel: store.name,
        isSplit: false,
        splitResult: null,
        totalWithDelivery,
        shelfSubtotal,
        cardSavings,
        swapSavings,
        deliveryFee: delivery.deliveryFee,
        meetsMinOrder: delivery.meetsMinOrder,
        amountToMinOrder: delivery.amountToMinOrder,
        averageMarketTotal,
        savingsVsAverage: vsAvg,
        savingsVsFidelityWinner: vsFidelity,
        balancedScore,
        scoreBreakdown: { pricePts, matchPts, conveniencePts },
        matchSummary,
        availableCount,
        missingCount,
        unpricedCount,
        swapsApplied,
        applyEconomyMode: economyMode && swapsApplied.length > 0,
        reasons,
        warnings,
        cardOpportunity:
          store.cardId &&
          !activeCards.includes(store.cardId) &&
          potentialMissingCardSavings > 0 &&
          store.cardProgram
            ? {
                cardId: store.cardId,
                cardProgram: store.cardProgram,
                extraSavings: potentialMissingCardSavings,
              }
            : null,
      },
    };
  });

  candidates.sort((a, b) => {
    // Coverage first: a store missing basket lines never outranks one that sells them
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    if (b.plan.balancedScore !== a.plan.balancedScore) {
      return b.plan.balancedScore - a.plan.balancedScore;
    }
    return a.plan.totalWithDelivery - b.plan.totalWithDelivery;
  });

  const bestSingleBalanced = candidates[0].plan;

  // Evaluate 2-store split in Balanced mode (applying >20% selective swaps per assigned store)
  let bestBalancedSplit: {
    splitResult: SplitTwoStoreResult;
    shelfSubtotal: number;
    cardSavings: number;
    swapSavings: number;
    swapsApplied: BalancedSwapRecommendation[];
    matchSummary: MatchQualitySummary;
    availableCount: number;
    unpricedCount: number;
  } | null = null;

  if (maxStores === 2 && basket.length >= 2 && storeIds.length >= 2) {
    for (let i = 0; i < storeIds.length; i++) {
      for (let j = i + 1; j < storeIds.length; j++) {
        const storeA = storeIds[i];
        const storeB = storeIds[j];
        let subtotalA = 0;
        let subtotalB = 0;
        let shelfSubtotal = 0;
        let swapSavings = 0;
        let exactCount = 0;
        let twinCount = 0;
        let functionalCount = 0;
        let privateLabelCount = 0;
        let splitMissing = 0;
        let splitUnpriced = 0;
        let splitAvailable = 0;
        const assignments: Record<string, StoreId> = {};
        const swapsApplied: BalancedSwapRecommendation[] = [];

        for (const item of basket) {
          const baseProd = productMap[item.productId];
          if (!baseProd) continue;

          const { resolvedProduct: normalizedBase } = resolveProductForMode(
            baseProd,
            false,
            productMap
          );
          const rawSuggA = economyMode
            ? getFidelitySavingsSuggestion(normalizedBase, storeA, activeCards, productMap)
            : null;
          const suggA =
            rawSuggA && !excludedSwapFromIds.includes(normalizedBase.id) ? rawSuggA : null;
          const prodA = suggA ? suggA.equivalentProduct : normalizedBase;
          const offerA = getEffectiveOffer(prodA, storeA, activeCards);

          const rawSuggB = economyMode
            ? getFidelitySavingsSuggestion(normalizedBase, storeB, activeCards, productMap)
            : null;
          const suggB =
            rawSuggB && !excludedSwapFromIds.includes(normalizedBase.id) ? rawSuggB : null;
          const prodB = suggB ? suggB.equivalentProduct : normalizedBase;
          const offerB = getEffectiveOffer(prodB, storeB, activeCards);

          const pick = pickSplitStore(offerA, offerB);
          if (pick === null) {
            if (hasVerifiedPrice(normalizedBase)) splitMissing += 1;
            else splitUnpriced += 1;
            continue;
          }
          const useA = pick === 'A';
          const targetStore = useA ? storeA : storeB;
          const chosenSugg = useA ? suggA : suggB;
          const chosenOffer = useA ? offerA : offerB;
          splitAvailable += 1;

          assignments[item.productId] = targetStore;
          const lineTotal = chosenOffer.price * item.quantity;
          if (useA) subtotalA += lineTotal;
          else subtotalB += lineTotal;
          shelfSubtotal += chosenOffer.basePrice * item.quantity;

          if (chosenOffer.equivalenceLevel === 1) exactCount += 1;
          else if (chosenOffer.equivalenceLevel === 2) twinCount += 1;
          else if (chosenOffer.equivalenceLevel === 3) functionalCount += 1;
          else privateLabelCount += 1;

          if (chosenSugg) {
            const diff = round2(chosenSugg.savingsPerUnit * item.quantity);
            swapSavings += diff;
            swapsApplied.push({
              fromProductId: normalizedBase.id,
              toProductId: chosenSugg.equivalentProduct.id,
              fromName: normalizedBase.canonicalName,
              toName: chosenSugg.variantLabel,
              savings: diff,
              percentSaved: chosenSugg.savingsPercent,
            });
          }
        }

        if (subtotalA === 0 || subtotalB === 0) continue;

        subtotalA = round2(subtotalA);
        subtotalB = round2(subtotalB);
        const delivA = computeDeliveryFee(storeA, subtotalA, activeCards, channelMode);
        const delivB = computeDeliveryFee(storeB, subtotalB, activeCards, channelMode);
        if (!delivA.meetsMinOrder || !delivB.meetsMinOrder) continue;

        const totalWithDelivery = round2(
          subtotalA + subtotalB + delivA.deliveryFee + delivB.deliveryFee
        );

        if (
          !bestBalancedSplit ||
          splitMissing < bestBalancedSplit.splitResult.missingCount ||
          (splitMissing === bestBalancedSplit.splitResult.missingCount &&
            totalWithDelivery < bestBalancedSplit.splitResult.totalWithDelivery)
        ) {
          shelfSubtotal = round2(shelfSubtotal);
          const totalItemsSubtotal = round2(subtotalA + subtotalB);
          const coverageGain: number = candidates[0].missingCount - splitMissing;
          // Totals are only comparable when both options cover the same basket lines
          const netSavings: number =
            coverageGain === 0
              ? round2(bestSingleBalanced.totalWithDelivery - totalWithDelivery)
              : 0;
          const savingsPercent: number =
            coverageGain === 0 && bestSingleBalanced.totalWithDelivery > 0
              ? round2((netSavings / bestSingleBalanced.totalWithDelivery) * 100)
              : 0;

          const matchSummary: MatchQualitySummary = {
            exactCount,
            twinCount,
            functionalCount,
            privateLabelCount,
            totalItems: splitAvailable,
            qualityPct: 100,
          };
          matchSummary.qualityPct = computeMatchQualityScore(matchSummary);

          bestBalancedSplit = {
            splitResult: {
              storeA,
              storeB,
              subtotalA,
              subtotalB,
              deliveryA: delivA.deliveryFee,
              deliveryB: delivB.deliveryFee,
              totalWithDelivery,
              bestSingleStoreId: bestSingleBalanced.storeId as StoreId,
              bestSingleTotal: bestSingleBalanced.totalWithDelivery,
              netSavings,
              savingsPercent,
              isWorthwhile:
                coverageGain > 0 ||
                (coverageGain === 0 && netSavings > 12 && savingsPercent > 10),
              missingCount: splitMissing,
              coverageGain,
              assignments,
            },
            shelfSubtotal,
            cardSavings: round2(Math.max(0, shelfSubtotal - totalItemsSubtotal)),
            swapSavings: round2(swapSavings),
            swapsApplied,
            matchSummary,
            availableCount: splitAvailable,
            unpricedCount: splitUnpriced,
          };
        }
      }
    }
  }

  // In Balanced mode, only recommend Split 2 if it saves > 12 RON AND > 10% over Balanced single store
  if (bestBalancedSplit && bestBalancedSplit.splitResult.isWorthwhile) {
    const split = bestBalancedSplit.splitResult;
    const storeA = STORE_MAP[split.storeA];
    const storeB = STORE_MAP[split.storeB];
    const deliveryFee = round2(split.deliveryA + split.deliveryB);
    const pricePts = Math.round(
      Math.max(0, Math.min(45, ((maxMarketTotal - split.totalWithDelivery) / priceRange) * 45))
    );
    const matchPts = Math.round((bestBalancedSplit.matchSummary.qualityPct / 100) * 30);
    const conveniencePts = 14;
    const balancedScore = Math.min(100, pricePts + matchPts + conveniencePts);

    const reasons: string[] = [
      split.coverageGain > 0
        ? `Împărțit între ${storeA.name} și ${storeB.name}, coșul acoperă ${bestBalancedSplit.availableCount} produse verificate, cu ${split.coverageGain} mai mult decât cel mai bun magazin unic.`
        : `Split-ul ${storeA.name} + ${storeB.name} economisește ${formatRon(split.netSavings)} (${split.savingsPercent}%) chiar și față de cel mai bun magazin unic în modul Balanced, justificând 2 opriri.`,
    ];
    if (bestBalancedSplit.swapsApplied.length > 0) {
      reasons.push(
        `Include ${bestBalancedSplit.swapsApplied.length} înlocuiri selective >20% (-${formatRon(bestBalancedSplit.swapSavings)}) cu mărci proprii dedicate fiecărui magazin.`
      );
    }
    if (bestBalancedSplit.cardSavings > 0) {
      reasons.push(
        `Cardurile tale active reduc nota cumulată cu -${formatRon(bestBalancedSplit.cardSavings)}.`
      );
    }

    return {
      strategy: 'balanced',
      storeId: 'split',
      storeLabel: `${storeA.name} + ${storeB.name}`,
      isSplit: true,
      splitResult: split,
      totalWithDelivery: split.totalWithDelivery,
      shelfSubtotal: bestBalancedSplit.shelfSubtotal,
      cardSavings: bestBalancedSplit.cardSavings,
      swapSavings: bestBalancedSplit.swapSavings,
      deliveryFee,
      meetsMinOrder: true,
      amountToMinOrder: 0,
      averageMarketTotal,
      savingsVsAverage: round2(averageMarketTotal - split.totalWithDelivery),
      savingsVsFidelityWinner: round2(
        Math.max(0, fidelityWinner.totalWithDelivery - split.totalWithDelivery)
      ),
      balancedScore,
      scoreBreakdown: { pricePts, matchPts, conveniencePts },
      matchSummary: bestBalancedSplit.matchSummary,
      availableCount: bestBalancedSplit.availableCount,
      missingCount: split.missingCount,
      unpricedCount: bestBalancedSplit.unpricedCount,
      swapsApplied: bestBalancedSplit.swapsApplied,
      applyEconomyMode: economyMode && bestBalancedSplit.swapsApplied.length > 0,
      reasons,
      warnings: [
        `Necesită 2 opriri separate (${storeA.shortName} și ${storeB.shortName}) pentru a obține acest preț.`,
        ...buildCoverageWarnings(
          `${storeA.shortName} + ${storeB.shortName}`,
          split.missingCount,
          bestBalancedSplit.unpricedCount
        ),
      ],
      cardOpportunity: null,
    };
  }

  return bestSingleBalanced;
}

export function getSortedOffersForProduct(
  product: CanonicalProduct,
  activeCards: LoyaltyCardId[]
): Array<EffectiveOffer & { isCheapest: boolean }> {
  const offers = STORES.map((s) => getEffectiveOffer(product, s.id, activeCards)).sort(
    (a, b) => {
      // Stores that actually sell the product first, cheapest on top
      if (a.isUnavailable !== b.isUnavailable) return a.isUnavailable ? 1 : -1;
      return a.price - b.price;
    }
  );
  const firstOffer = offers[0];
  const minPrice = firstOffer && !firstOffer.isUnavailable ? firstOffer.price : null;
  return offers.map((offer) => ({
    ...offer,
    isCheapest: !offer.isUnavailable && minPrice !== null && offer.price === minPrice,
  }));
}

export function computeInStoreProgress(
  basket: BasketItem[],
  storeId: StoreId,
  activeCards: LoyaltyCardId[],
  economyMode: boolean,
  splitAssignments?: Record<string, StoreId> | null,
  productMap: Record<string, CanonicalProduct> = PRODUCT_MAP,
  excludedSwapFromIds: string[] = []
): InStoreProgress {
  let checkedTotal = 0;
  let remainingTotal = 0;
  let checkedCount = 0;

  for (const item of basket) {
    const baseProd = productMap[item.productId];
    if (!baseProd) continue;
    const { resolvedProduct } = resolveProductForMode(
      baseProd,
      economyMode,
      productMap,
      excludedSwapFromIds
    );
    const targetStore = splitAssignments?.[item.productId] ?? storeId;
    const lineTotal =
      getEffectiveOffer(resolvedProduct, targetStore, activeCards).price * item.quantity;

    if (item.checkedInStore) {
      checkedTotal += lineTotal;
      checkedCount += 1;
    } else {
      remainingTotal += lineTotal;
    }
  }

  return {
    checkedTotal: round2(checkedTotal),
    remainingTotal: round2(remainingTotal),
    checkedCount,
    totalCount: basket.length,
  };
}
