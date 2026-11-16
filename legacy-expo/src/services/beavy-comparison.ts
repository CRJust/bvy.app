import { supabase } from '@/lib/supabase';
import {
  evaluateCandidateAgainstIntent,
  type IntentMode,
  isMultiStoreSplitWorthwhile,
  parseShoppingIntent,
  type ProductMatchTier,
  type UserPreferenceMemory,
} from '@/services/beavy-intelligence';

export type BeavyRetailer = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  supports_physical: boolean;
  supports_delivery: boolean;
  is_active: boolean;
  updated_at: string;
};

export type BeavyFulfillmentNode = {
  id: string;
  retailer_id: string;
  node_key: string;
  name: string;
  node_type: 'physical_store' | 'delivery_area' | 'online_service' | 'pickup_point';
  fulfillment_channel: 'store' | 'delivery' | 'online';
  city: string;
  is_active: boolean;
};

export type BeavyFulfillmentRule = {
  id: string;
  fulfillment_node_id: string;
  currency: string;
  delivery_fee: number | null;
  service_fee: number | null;
  packaging_fee: number | null;
  small_order_fee: number | null;
  small_order_fee_threshold: number | null;
  minimum_order_value: number | null;
  free_delivery_threshold: number | null;
  effective_from: string;
  effective_until: string | null;
  is_active: boolean;
};

export type BeavyProductOffer = {
  id: string;
  product_id: string | null;
  retailer_id: string | null;
  retailer_name: string;
  fulfillment_node_id: string | null;
  price: number;
  regular_price: number | null;
  promo_price: number | null;
  loyalty_price: number | null;
  promo_label: string | null;
  promo_requires_card: boolean;
  sgr_fee: number | null;
  currency: string;
  unit_price: number | null;
  normalized_unit_price: number | null;
  normalized_unit_label: string | null;
  sell_by_mode: 'unit' | 'kg' | 'catch_weight';
  quantity_value: number | null;
  quantity_unit: string | null;
  package_size: string | null;
  product_url: string | null;
  image_url: string | null;
  fulfillment_channel: 'store' | 'delivery' | 'online';
  city: string;
  availability: string | null;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';
  observed_at: string;
  valid_until: string | null;
};

export type BasketItemInput = {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  productId?: string | null;
  brand?: string | null;
  packageSize?: string | null;
  imageUrl?: string | null;
  isCustom?: boolean;
};

export type CatalogProductProfile = {
  id: string;
  canonical_name: string;
  brand: string | null;
  package_size: string | null;
  quantity_value: number | null;
  quantity_unit: string | null;
  image_url?: string | null;
  category?: string | null;
  subcategory?: string | null;
  attributes: Record<string, unknown>;
  familyIds: string[];
  canonical_fingerprint?: string | null;
};

export type BasketVariantMode = 'standard' | 'private_label_budget';

export type ItemComparisonStatus = {
  item: BasketItemInput;
  status: 'has_offers' | 'equivalent_only' | 'unavailable' | 'no_offers_yet' | 'manual_item';
  offers: BeavyProductOffer[];
  equivalentOffersCount: number;
  unavailableOffers: BeavyProductOffer[];
  lowestPrice: number | null;
  highestPrice: number | null;
  hasLoyaltyOffer: boolean;
  lowestLoyaltyPrice: number | null;
  bestLoyaltyLabel: string | null;
  bestLoyaltyRetailerName: string | null;
  hasRegularPromo: boolean;
  bestRegularPromoLabel: string | null;
  canonicalName: string | null;
  canonicalBrand: string | null;
  canonicalPackageSize: string | null;
  canonicalImageUrl: string | null;
  canonicalCategoryName: string | null;
};

export type ProduceOfferPricing = {
  isProduce: boolean;
  sellMode: 'per_kg' | 'per_buc';
  pricePerKg: number | null;
  packPrice: number;
  packWeightGrams: number | null;
  packWeightKg: number | null;
  packType: 'sac' | 'plasa' | 'caserola' | 'punga' | 'legatura' | 'bucata' | 'vrac';
  packLabel: string;
  packCheckoutSummary: string;
  effectivePricePerUnit: number;
};

export type MatchedBasketItem = {
  item: BasketItemInput;
  offer: BeavyProductOffer;
  lineTotal: number;
  standardLineTotal?: number;
  loyaltyLineTotal: number | null;
  loyaltySavings: number;
  hasLoyaltyOffer: boolean;
  matchType: 'exact' | 'equivalent';
  matchTier?: ProductMatchTier;
  intentMode?: IntentMode;
  equivalentProductId?: string | null;
  equivalentProductName: string | null;
  equivalentPackageSize: string | null;
  equivalentBrand?: string | null;
  equivalentImageUrl?: string | null;
  isPrivateLabel?: boolean;
  isBudgetSwap?: boolean;
  baselineExactPrice?: number | null;
  budgetSavingsLine?: number;
  produceMeta?: ProduceOfferPricing;
};

export type UnavailableBasketItem = {
  item: BasketItemInput;
  offer: BeavyProductOffer;
  matchType: 'exact' | 'equivalent';
  equivalentProductName: string | null;
};

export type RetailerComparisonSummary = {
  retailer: BeavyRetailer;
  channelLabel: string;
  coveredCount: number;
  exactCoveredCount: number;
  equivalentCoveredCount: number;
  budgetSwapCount?: number;
  budgetSavingsTotal?: number;
  totalItemsCount: number;
  coveragePercent: number;
  confirmedSubtotal: number;
  standardSubtotalWithoutLoyalty?: number;
  loyaltyOfferCount: number;
  loyaltyConditionalCount?: number;
  potentialLoyaltySavings: number;
  estimatedTotalWithLoyalty: number;
  appliedLoyaltyCards?: boolean;
  loyaltyProgramName: string | null;
  deliveryFee: number;
  serviceFee: number;
  packagingFee: number;
  smallOrderFee: number;
  estimatedFeesTotal: number;
  estimatedTotalWithFees: number;
  freeDeliveryThreshold: number | null;
  minimumOrderValue: number | null;
  belowMinimumOrder: boolean;
  matchedNodeName: string | null;
  currency: string;
  matchedItems: MatchedBasketItem[];
  unavailableItems: UnavailableBasketItem[];
  missingPriceItems: BasketItemInput[];
  missingItems: BasketItemInput[];
  lastObservedAt: string | null;
  hasFullCatalogCoverage: boolean;
  hasFullBasketCoverage: boolean;
};

export type MultiStoreMixStop = {
  retailer: BeavyRetailer;
  channelLabel: string;
  items: MatchedBasketItem[];
  itemsCount: number;
  exactCoveredCount: number;
  equivalentCoveredCount: number;
  budgetSwapCount: number;
  budgetSavingsTotal: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  packagingFee: number;
  smallOrderFee: number;
  estimatedFeesTotal: number;
  totalWithFees: number;
  loyaltyOfferCount: number;
  potentialLoyaltySavings: number;
  estimatedTotalWithLoyalty: number;
  loyaltyProgramName: string | null;
  freeDeliveryThreshold: number | null;
  minimumOrderValue: number | null;
  belowMinimumOrder: boolean;
};

export type MultiStoreMixPlan = {
  stops: MultiStoreMixStop[];
  coveredItemsCount: number;
  totalItemsCount: number;
  catalogItemsCount: number;
  coveragePercent: number;
  hasFullCatalogCoverage: boolean;
  hasFullBasketCoverage: boolean;
  exactCoveredCount: number;
  equivalentCoveredCount: number;
  budgetSwapCount: number;
  budgetSavingsTotal: number;
  subtotal: number;
  estimatedFeesTotal: number;
  totalWithFees: number;
  potentialLoyaltySavings: number;
  estimatedTotalWithLoyalty: number;
  bestSingleStoreId: string | null;
  bestSingleStoreName: string | null;
  bestSingleStoreTotal: number | null;
  bestSingleStoreCoveredCount: number;
  savingsVsBestSingleStore: number;
  savingsPercentVsBestSingleStore: number;
  improvesCoverage: boolean;
  strategy: BasketVariantMode;
  appliedLoyaltyCards?: boolean;
};

export type BasketComparisonResult = {
  retailers: BeavyRetailer[];
  retailerSummaries: RetailerComparisonSummary[];
  itemStatuses: ItemComparisonStatus[];
  totalItemsCount: number;
  totalUnitsCount: number;
  catalogItemsCount: number;
  manualItemsCount: number;
  coveredItemsCount: number;
  unavailableItemsCount: number;
  noPriceItemsCount: number;
  overallCoveragePercent: number;
  latestOfferDate: string | null;
  canCompareFairly: boolean;
  potentialSavings: number | null;
  cheapestComparableRetailerId: string | null;
  bestStoreMix?: MultiStoreMixPlan | null;
  transparencyNote: string;
  strategy?: BasketVariantMode;
  appliedLoyaltyCards?: boolean;
};

export type BasketBudgetSummary = {
  standardBestTotal: number | null;
  standardBestStoreName: string | null;
  budgetBestTotal: number | null;
  budgetBestStoreName: string | null;
  savingsVsStandardBest: number | null;
  savingsPercentVsStandardBest: number;
  swappedItemsCountAtBest: number;
  hasBudgetVariant: boolean;
  canCompareStandardVsBudgetFairly: boolean;
};

export type ProductMatchScoreResult = {
  compatible: boolean;
  score: number;
  qtyRatio: number | null;
  brandMatch: boolean;
  isCrossCanonicalExact: boolean;
};

export type HiddenChannelOffersHint = {
  excludedChannel: 'online' | 'physical';
  retailerNames: string[];
  coveredItemsCount: number;
};

export type DualBasketComparisonResult = {
  standard: BasketComparisonResult;
  budget: BasketComparisonResult;
  budgetSummary: BasketBudgetSummary;
  hiddenChannelHint?: HiddenChannelOffersHint | null;
};

export const UUID_IN_CHUNK_SIZE = 60;
export const FAMILY_IN_CHUNK_SIZE = 20;
const OFFER_CHUNK_SIZE = 60;
const POSTGREST_PAGE_SIZE = 1000;
const FRESHNESS_TIE_WINDOW_MS = 12 * 60 * 60 * 1000;
export const MAX_VERIFIED_OFFER_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 zile (fereastră săptămânală standard supermarket)

export function isFreshVerifiedOffer(
  offer: Pick<BeavyProductOffer, 'observed_at' | 'valid_until'>,
  nowMs = Date.now()
): boolean {
  const observedAt = new Date(offer.observed_at).getTime();
  if (
    !Number.isFinite(observedAt) ||
    observedAt > nowMs + 5 * 60 * 1000 ||
    nowMs - observedAt > MAX_VERIFIED_OFFER_AGE_MS
  ) {
    return false;
  }

  if (offer.valid_until) {
    const validUntil = new Date(offer.valid_until).getTime();
    if (!Number.isFinite(validUntil) || validUntil < nowMs) return false;
  }
  return true;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function fetchPaginatedByChunks<Row>(
  ids: string[],
  chunkSize: number,
  fetchPage: (
    chunk: string[],
    from: number,
    to: number
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
): Promise<Row[]> {
  const uniqueIds = Array.from(new Set(ids));
  const chunks = chunkArray(uniqueIds, chunkSize);
  if (chunks.length === 0) return [];

  const perChunkRows = await Promise.all(
    chunks.map(async (chunk) => {
      const collected: Row[] = [];
      let offset = 0;
      while (true) {
        const to = offset + POSTGREST_PAGE_SIZE - 1;
        const { data, error } = await fetchPage(chunk, offset, to);
        if (error) {
          throw new Error(error.message);
        }
        const rows = data ?? [];
        collected.push(...rows);
        if (rows.length < POSTGREST_PAGE_SIZE) break;
        offset += POSTGREST_PAGE_SIZE;
      }
      return collected;
    })
  );

  return perChunkRows.flat();
}

function normalizeCompareText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.%\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toBaseQuantity(
  quantityValue: number | null | undefined,
  quantityUnit: string | null | undefined,
  packageSize: string | null | undefined
): { kind: 'mass' | 'volume' | 'count'; baseValue: number; packCount: number } | null {
  let val =
    quantityValue != null && Number.isFinite(Number(quantityValue))
      ? Number(quantityValue)
      : null;
  let unit = quantityUnit ? normalizeCompareText(quantityUnit) : null;
  let packCount = 1;

  if (packageSize) {
    const normPkg = normalizeCompareText(packageSize.replace(/(\d),(\d)/g, '$1.$2'));
    const bonusMulti = normPkg.match(
      /(\d+)\s*\+\s*(\d+)\s*(?:doze|sticle|buc|pachete|cutii|role|plicuri)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|l|litri|litru|ml|cl|buc)\b/
    );
    const multi = normPkg.match(
      /(\d+)\s*(?:doze|sticle|buc|pachete|cutii|role|plicuri)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|l|litri|litru|ml|cl|buc)\b/
    );
    if (bonusMulti) {
      packCount = Number(bonusMulti[1]) + Number(bonusMulti[2]);
      if (val === null || !unit) {
        val = packCount * Number(bonusMulti[3]);
        unit = bonusMulti[4];
      }
    } else if (multi) {
      packCount = Number(multi[1]);
      if (val === null || !unit) {
        val = packCount * Number(multi[2]);
        unit = multi[3];
      }
    } else if (val === null || !unit) {
      const single = normPkg.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|l|litri|litru|ml|cl|buc)\b/);
      if (single) {
        val = Number(single[1]);
        unit = single[2];
      }
    }
  }

  if (val === null || !unit || val <= 0) return null;
  if (unit === 'kg') return { kind: 'mass', baseValue: val * 1000, packCount };
  if (unit === 'g' || unit === 'gr') return { kind: 'mass', baseValue: val, packCount };
  if (unit === 'l' || unit === 'litri' || unit === 'litru') {
    return { kind: 'volume', baseValue: val * 1000, packCount };
  }
  if (unit === 'cl') return { kind: 'volume', baseValue: val * 10, packCount };
  if (unit === 'ml') return { kind: 'volume', baseValue: val, packCount };
  if (unit.startsWith('buc') || unit === 'pcs') {
    return { kind: 'count', baseValue: val, packCount };
  }
  return null;
}

function extractFatPercent(profile: CatalogProductProfile): number | null {
  const attrFat = profile.attributes?.fat_percentage;
  if (attrFat != null && Number.isFinite(Number(attrFat))) {
    return Number(attrFat);
  }
  const m = normalizeCompareText(
    String(profile.canonical_name ?? '').replace(/(\d),(\d)/g, '$1.$2')
  ).match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n < 99 ? n : null;
}

type EquivalentTokenMatcher = {
  tag: string;
  pattern: RegExp;
  exclude?: RegExp;
};

type EquivalentGroupConfig = {
  /**
   * 'exclusive': cel mai specific pattern (primul din listă) câștigă (ex. lapte bătut vs lapte).
   * 'all': colectează toate tag-urile prezente (ex. arome fructe sau condimente compuse).
   */
  mode: 'exclusive' | 'all';
  /**
   * true: dacă un produs are tag din grup și celălalt nu are niciunul, se respinge echivalarea.
   * false: se respinge doar dacă ambele produse declară tag-uri incompatibile din grup.
   */
  requireSymmetric: boolean;
  matchers: EquivalentTokenMatcher[];
};

const STRICT_SYMMETRIC_MODIFIERS: {
  pattern: RegExp;
  attrKey?: string;
}[] = [
  { pattern: /\b(bio|organic|ecologic\w*)\b/i, attrKey: 'bio' },
  { pattern: /\b(fara\s+lactoz\w*|lactose\s*free|fara-lactoza)\b/i, attrKey: 'lactose_free' },
  { pattern: /\b(fara\s+gluten|gluten\s*free|fara-gluten)\b/i, attrKey: 'gluten_free' },
  { pattern: /\bketo\b/i, attrKey: 'keto' },
  {
    pattern: /\b(zero(?:\s+zahar)?|fara\s+zahar(?:\s+adaugat)?|sugar\s*free|no\s+sugar|fara\s+calorii|max)\b/i,
    attrKey: 'sugar_free',
  },
  { pattern: /\b(decofeinizat\w*|fara\s+cofeina|decaf)\b/i },
  { pattern: /\b(fara\s+alcool|non-?alcoolic\w*|0[.,]0\s*%|0\s*%)\b/i },
  { pattern: /\b(vegan\w*|vegetal\w*|de\s+post)\b/i },
  { pattern: /\bcapr[ae]\b/i },
  { pattern: /\boaie\b/i },
  { pattern: /\bbivolit[ae]\b/i },
  { pattern: /\b(soia|ovaz|migdale|cocos|caju)\b/i },
  { pattern: /\b(protein\w*|proteic\w*|high\s+protein)\b/i },
  { pattern: /\b(afumat\w*|smoked)\b/i },
  { pattern: /\b(light|lite|diet)\b/i },
  { pattern: /\btwist\b/i },
  { pattern: /\b(congelat\w*|surgelat\w*|deep\s*frozen)\b/i },
  { pattern: /\b(conserv\w*|in\s+ulei|in\s+suc\s+propriu|in\s+saramura)\b/i },
  // Carbonatare apă / răcoritoare (carbogazoasă vs plată)
  { pattern: /\b(carbogazoas\w*|acidulat\w*|cu\s+gaz|carbo|sparkling|cola|pepsi|fanta|sprite|mirinda|7up|schweppes)\b/i },
  { pattern: /\b(necarbo\w*|plata|plată|neacidulat\w*|fara\s+gaz|still)\b/i },
  // Formă cafea (măcinată vs boabe vs capsule vs solubilă/instant)
  { pattern: /\b(boabe|beans)\b/i },
  { pattern: /\b(macinat\w*|măcinat\w*|ground)\b/i },
  { pattern: /\b(capsul\w*|pods)\b/i },
  { pattern: /\b(solubil\w*|instant|ness)\b/i },
  // Tip ulei (măsline vs floarea soarelui vs extravirgin)
  { pattern: /\b(masline|măsline|olive)\b/i },
  { pattern: /\b(floarea(?:\s+soarelui)?|sunflower)\b/i },
  { pattern: /\b(extravirgin\w*|extra\s+virgin)\b/i },
];

const EQUIVALENT_DOMAIN_GROUPS: EquivalentGroupConfig[] = [
  // Tip produs lactat / desert (ordine strictă de la compus spre generic)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'prajitura', pattern: /\bprajitur\w*\b/ },
      { tag: 'orez_lapte', pattern: /\borez cu lapte\b/ },
      { tag: 'gris_lapte', pattern: /\bgris cu lapte\b/ },
      { tag: 'frisca', pattern: /\b(frisca|creme patisserie|patisserie|hulala)\b/ },
      { tag: 'lapte_batut', pattern: /\blapte batut\b/ },
      { tag: 'lapte_ciocolata', pattern: /\blapte.*ciocolat\w*\b/ },
      { tag: 'lapte_praf', pattern: /\blapte praf\b/ },
      { tag: 'lapte_condensat', pattern: /\blapte condensat\b/ },
      {
        tag: 'bautura_vegetala',
        pattern:
          /\b(bautur\w*\s+vegetal\w*|lapte\s+(?:de\s+)?(?:soia|migdale|ovaz|cocos|orez|caju)|bautura\s+(?:de\s+)?(?:soia|migdale|ovaz|cocos|orez|caju)|alpro)\b/,
      },
      { tag: 'sana', pattern: /\bsana\b/ },
      { tag: 'kefir', pattern: /\b(kefir|chefir)\b/ },
      {
        tag: 'iaurt_baut',
        pattern: /\b(iaurt\s+(?:de\s+)?baut|iaurt\s+baut|actimel|danonino\s+de\s+baut)\b/,
      },
      {
        tag: 'iaurt_grecesc',
        pattern: /\b(iaurt\s+grecesc|iaurt\s+in\s+stil\s+grecesc|stil\s+grecesc|stragghisto)\b/,
      },
      {
        tag: 'iaurt_fructe',
        pattern: /\biaurt\s+cu\s+fructe\b/,
      },
      { tag: 'iaurt', pattern: /\biaurt\b/ },
      {
        tag: 'smantana_gatit',
        pattern:
          /\b(smantana\s+(?:pentru\s+gatit|dulce|lichida)|crema\s+(?:pentru\s+gatit|vegetala\s+pentru\s+gatit)|creme\s+cuisine|gran\s+cucina|cooking\s+cream)\b/,
      },
      { tag: 'smantana_fermentata', pattern: /\bsmantan\w*\b/ },
      {
        tag: 'unt_arahide',
        pattern: /\bunt(?:\s+de)?\s+arahide\b|\bpeanut\s+butter\b/,
      },
      { tag: 'unt', pattern: /\bunt\b/ },
      { tag: 'margarina', pattern: /\bmargarina\b/ },
      { tag: 'lapte', pattern: /\blapte\b/ },
    ],
  },
  // Sortiment brânzeturi (exclusiv; brânza topită/făgăraș/burduf înaintea altora)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'snack_foietaj_branza',
        pattern:
          /\b(rollitos|foietaj|placint\w*|saratele|biscuit\w*|croissant\w*|pufuleti|chips\w*)\b/,
      },
      { tag: 'branza_topita', pattern: /\bbranza topita\b/ },
      { tag: 'crema_branza', pattern: /\bcrema de branza\b/ },
      { tag: 'branza_fagaras', pattern: /\b(branza fagaras|fagaras|perlute)\b/ },
      { tag: 'branza_burduf', pattern: /\b(branza de burduf|burduf)\b/ },
      { tag: 'cascaval', pattern: /\bcascaval\b/ },
      { tag: 'telemea', pattern: /\btelemea\b/ },
      { tag: 'urda', pattern: /\burda\b/ },
      { tag: 'mozzarella', pattern: /\bmozzarella\b/ },
      { tag: 'parmesan', pattern: /\b(parmesan|parmezan|grana padano|parmigiano)\b/ },
      { tag: 'camembert', pattern: /\bcamembert\b/ },
      { tag: 'brie', pattern: /\bbrie\b/ },
      { tag: 'halloumi', pattern: /\bhalloumi\b/ },
      { tag: 'ricotta', pattern: /\bricotta\b/ },
      { tag: 'mascarpone', pattern: /\bmascarpone\b/ },
      { tag: 'feta', pattern: /\bfeta\b/ },
      { tag: 'burrata', pattern: /\bburrata\b/ },
      { tag: 'cheddar', pattern: /\bcheddar\b/ },
      { tag: 'gorgonzola', pattern: /\bgorgonzola\b/ },
      { tag: 'emmental', pattern: /\b(emmental|svaiter|emmentaler)\b/ },
      { tag: 'cas', pattern: /\bcas\b/ },
    ],
  },
  // Proveniență lapte
  {
    mode: 'all',
    requireSymmetric: false,
    matchers: [
      { tag: 'vaca', pattern: /\bvaca\b/ },
      { tag: 'capra', pattern: /\bcapra\b/ },
      { tag: 'oaie', pattern: /\boaie\b/ },
      { tag: 'bivolita', pattern: /\bbivolita\b/ },
    ],
  },
  // Preparare cafea
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'capsule', pattern: /\b(capsul\w*|nespresso|dolce gusto|tassimo)\b/ },
      { tag: 'paduri', pattern: /\b(pad\w*|monodoz\w*)\b/ },
      { tag: 'solubila', pattern: /\b(solubil\w*|ness|instant)\b/ },
      { tag: 'boabe', pattern: /\bboabe\b/ },
      { tag: 'macinata', pattern: /\bmacinata\b/ },
    ],
  },
  // Ulei vs Oțet + Tip ulei
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'otet_balsamic',
        pattern: /\b(?:otet\s+balsamic|crema\s+balsamic\w*|glazura\s+balsamic\w*)\b/,
      },
      { tag: 'otet_mere', pattern: /\botet\s+(?:de\s+)?mere\b/ },
      { tag: 'otet', pattern: /\botet\b/ },
      {
        tag: 'ulei_masline_extravirgin',
        pattern: /\b(?:ulei\s+(?:de\s+)?masline\s+extra\s*virgin|extra\s*virgin)\b/,
      },
      {
        tag: 'ulei_masline_pomace',
        pattern: /\b(?:turte\s+(?:de\s+)?masline|pomace|sansa)\b/,
      },
      { tag: 'ulei_masline', pattern: /\bulei(?:[^a-z]+|\s+de\s+)masline\b/ },
      { tag: 'ulei_rapita', pattern: /\bulei(?:[^a-z]+|\s+de\s+)rapita\b/ },
      { tag: 'ulei_cocos', pattern: /\bulei(?:[^a-z]+|\s+de\s+)cocos\b/ },
      { tag: 'ulei_floare', pattern: /\bulei\b/ },
    ],
  },
  // Apă: diferențiere strictă carbogazoasă vs plată vs aromată vs tonică
  // Previne complet înlocuirea apei carbogazoase (ex: Dorna carbogazoasă) cu apă plată (ex: Aqua Carpatica plată)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'apa_tonica',
        pattern: /\b(tonica|tonic|schweppes|evervess)\b/,
      },
      {
        tag: 'apa_aromata',
        pattern:
          /\bapa\b.*\b(aromat\w*|cu\s+aroma|grapefr\w*|capsuna|capsuni|zmeura|lamaie|soc|piersica|mango|merisoare)\b/,
      },
      {
        tag: 'apa_carbogazoasa',
        pattern:
          /\bapa\b.*\b(carbogazoas\w*|carbo\b|acidulat\w*|forte|cu\s+bule|sparkling)\b/,
      },
      {
        tag: 'apa_plata',
        pattern: /\bapa\b.*\b(plat[ae]\b|still|necarbogazoas\w*|\bpla\d|plata\d)\b/,
      },
    ],
  },
  // Conserve, sosuri, condimente și supe (ordine de la compus la generic)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'maioneza', pattern: /\bmaionez\w*\b/ },
      { tag: 'mustar', pattern: /\bmustar\b/ },
      { tag: 'ketchup', pattern: /\bketchup\b/ },
      { tag: 'hrean', pattern: /\bhrean\b/ },
      { tag: 'pate', pattern: /\bpate\b/ },
      { tag: 'pasta_tartinabila', pattern: /\bpasta\b.*\btartinabil\w*\b|\btartinabil\w*\b/ },
      { tag: 'sarmale', pattern: /\bsarmal\w*\b/ },
      { tag: 'zacusca', pattern: /\bzacusc\w*\b/ },
      { tag: 'salata', pattern: /\bsalata\b/ },
      { tag: 'carne_conserva', pattern: /\bcarne\b/ },
      { tag: 'bulion', pattern: /\b(bulion|pasta de tomate|pulpa de rosii|rosii decojite|passata)\b/ },
      { tag: 'supa', pattern: /\bsup[ae]\b/ },
      {
        tag: 'baza_mancaruri',
        pattern: /\b(vegeta|delikat|baza\s+pentru\s+mancaruri|condiment\s+universal)\b/,
      },
      { tag: 'dafin', pattern: /\b(dafin|foi\s+de\s+dafin)\b/ },
      { tag: 'marar', pattern: /\bmarar\b/ },
      { tag: 'patrunjel', pattern: /\bpatrunjel\b/ },
      { tag: 'leustean', pattern: /\bleustean\b/ },
      { tag: 'rozmarin', pattern: /\brozmarin\b/ },
      { tag: 'chimen', pattern: /\b(chimen|cumin)\b/ },
      { tag: 'nucsoara', pattern: /\bnucsoara\b/ },
      { tag: 'piper', pattern: /\bpiper\b/ },
      { tag: 'boia', pattern: /\bboia\b/ },
      { tag: 'oregano', pattern: /\boregano\b/ },
      { tag: 'busuioc', pattern: /\bbusuioc\b/ },
      { tag: 'sofran', pattern: /\bsofran\b/ },
      { tag: 'curry', pattern: /\bcurry\b/ },
      { tag: 'scortisoara', pattern: /\bscortisoara\b/ },
      { tag: 'cimbru', pattern: /\bcimbru\b/ },
      { tag: 'ceapa', pattern: /\bceapa\b/ },
      { tag: 'usturoi', pattern: /\busturoi\b/ },
      { tag: 'sos', pattern: /\bsos\b/ },
    ],
  },
  // Murături & conserve de legume tradiționale (strict simetrice: previne „Varză murată” -> „Castraveți murați” sau „Gogoșari”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'varza_murata', pattern: /\b(?:foi\s+de\s+)?varza\s+murata\b/ },
      {
        tag: 'castraveti_murati',
        pattern: /\bcastravet\w*\s+(?:murat\w*|in\s+otet|cornison)\b/,
      },
      {
        tag: 'gogosari_otet',
        pattern: /\bgogosar\w*\s+(?:in\s+otet|feliat\w*|sferturi)\b/,
      },
      { tag: 'ardei_copti', pattern: /\bardei\s+copt\w*\b/ },
      { tag: 'sfecla_rosie_conserva', pattern: /\bsfecl\w*\s+rosi\w*\b/ },
      { tag: 'ardei_iute_murat', pattern: /\bardei\s+iut\w*\s+in\s+otet\b/ },
      { tag: 'gogonele', pattern: /\bgogonel\w*\b/ },
    ],
  },
  // Surse carne / pește / leguminoase conserve
  {
    mode: 'all',
    requireSymmetric: true,
    matchers: [
      { tag: 'porc', pattern: /\bporc\b/ },
      { tag: 'pui', pattern: /\bpui\b/ },
      { tag: 'vita', pattern: /\bvita\b/ },
      { tag: 'curcan', pattern: /\bcurcan\b/ },
      { tag: 'rata', pattern: /\brata\b/ },
      { tag: 'ton', pattern: /\bton\b/ },
      { tag: 'somon', pattern: /\bsomon\b/ },
      { tag: 'sardine', pattern: /\bsardine\b/ },
      { tag: 'macrou', pattern: /\bmacrou\b/ },
      { tag: 'sprot_hering', pattern: /\b(sprot|hering|anchois|anchov\w*)\b/ },
      { tag: 'fasole', pattern: /\bfasole\b/ },
      { tag: 'porumb', pattern: /\bporumb\b/ },
      { tag: 'mazare', pattern: /\bmazare\b/ },
      { tag: 'linte', pattern: /\blinte\b/ },
      { tag: 'naut', pattern: /\bnaut\b/ },
      { tag: 'ciuperci_conserva', pattern: /\b(ciuperc\w*|champignon)\b/ },
      { tag: 'spanac', pattern: /\bspanac\b/ },
    ],
  },
  // Tip bere (strict simetrice: previne „Bere blondă” -> „Bere fără alcool”, „Radler” sau „Bere brună”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'bere_fara_alcool',
        pattern: /\b(fara\s+alcool|non-?alcoolic\w*|0[.,]0\s*%|0\s*%)\b/,
      },
      {
        tag: 'radler',
        pattern: /\b(radler|shandy|bere\s+cu\s+lamaie|bere\s+cu\s+grapefruit)\b/,
      },
      {
        tag: 'bere_bruna_neagra',
        pattern: /\b(bruna|neagra|stout|porter|dunkel)\b/,
      },
      {
        tag: 'bere_craft_ipa',
        pattern: /\b(ipa|pale\s+ale|artizanala|nefiltrata)\b/,
      },
      { tag: 'bere_blonda', pattern: /\b(blonda|pils|lager|bere\b)/ },
    ],
  },
  // Tip vin & spumant (strict simetrice: previne „Vin alb” -> „Vin roșu” sau „Prosecco”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'vin_spumant',
        pattern: /\b(spumant\w*|prosecco|cava|sampanie|champagne)\b/,
      },
      { tag: 'vin_alb', pattern: /\b(?:vin\s+)?alb\b/ },
      { tag: 'vin_rosu', pattern: /\b(?:vin\s+)?rosu\b/ },
      { tag: 'vin_roze', pattern: /\b(?:vin\s+)?roz[ee]\b/ },
    ],
  },
  // Tip băutură răcoritoare (bază)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'cola', pattern: /\b(cola|pepsi)\b/ },
      { tag: 'tonic', pattern: /\b(tonic\w*|schweppes)\b/ },
      { tag: 'limonada', pattern: /\b(limonada|sprite|7up)\b/ },
      { tag: 'portocale_soda', pattern: /\b(fanta|mirinda)\b/ },
    ],
  },
  // Arome fructe / desert (strict simetrice pentru a nu amesteca sortimentele)
  {
    mode: 'all',
    requireSymmetric: true,
    matchers: [
      { tag: 'portocale', pattern: /\b(portocal\w*|orange)\b/ },
      { tag: 'lamaie', pattern: /\b(lamaie|lamai|lemon|twist|lime)\b/ },
      { tag: 'mere', pattern: /\bmere\b/ },
      { tag: 'pere', pattern: /\bpere\b/ },
      { tag: 'piersici', pattern: /\bpiersici\b/ },
      { tag: 'visine', pattern: /\bvisine\b/ },
      { tag: 'cirese', pattern: /\b(cirese|cherr\w*)\b/ },
      { tag: 'capsuni', pattern: /\b(capsun\w*|strawberr\w*)\b/ },
      { tag: 'zmeura', pattern: /\b(zmeura|raspberr\w*)\b/ },
      { tag: 'caise', pattern: /\bcaise\b/ },
      { tag: 'ananas', pattern: /\bananas\b/ },
      { tag: 'mango', pattern: /\bmango\b/ },
      { tag: 'pepene', pattern: /\bpepene\b/ },
      { tag: 'afine', pattern: /\bafine\b/ },
      { tag: 'grapefruit', pattern: /\bgrapefruit\b/ },
      { tag: 'cocos', pattern: /\bcocos\b/ },
      { tag: 'banane', pattern: /\bbanan\w*\b/ },
      { tag: 'vanilie', pattern: /\bvanili\w*\b/ },
      { tag: 'tiramisu', pattern: /\btiramisu\b/ },
      { tag: 'caramel', pattern: /\bcaramel\b/ },
      { tag: 'ghimbir', pattern: /\b(ghimbir|ginger)\b/ },
      { tag: 'menta', pattern: /\b(menta|mint|mojito)\b/ },
      { tag: 'fructe_padure', pattern: /\bfructe de padure\b/ },
      { tag: 'soc', pattern: /\bsoc\b/ },
    ],
  },
  // Dulciuri & panificație
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'ou_ciocolata', pattern: /\bou de ciocolata\b/ },
      { tag: 'ciocolata_alba', pattern: /\bciocolata alba\b/ },
      { tag: 'ciocolata_neagra', pattern: /\bciocolata (?:neagra|amaruie)\b|\bamaruie\b/ },
      { tag: 'ciocolata_lapte', pattern: /\bciocolata cu lapte\b/ },
      { tag: 'praline', pattern: /\bpraline\b/ },
      { tag: 'napolitana', pattern: /\bnapolitan\w*\b/ },
      { tag: 'biscuiti', pattern: /\bbiscuit\w*\b/ },
    ],
  },
  // Făină, mălai, orez, paste
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'faina_integrala',
        pattern: /\bfaina\s+(?:de\s+grau\s+)?integral\w*\b|\b(?:grau|faina)\s+integral\w*\b/,
      },
      { tag: 'faina_secara', pattern: /\bfaina\s+(?:de\s+)?secara\b/ },
      { tag: 'faina_migdale', pattern: /\bfaina\s+(?:de\s+)?migdale\b/ },
      { tag: 'faina_ovaz', pattern: /\bfaina\s+(?:de\s+)?ovaz\b/ },
      { tag: 'faina_000', pattern: /\b(?:faina\s+(?:alba\s+)?(?:superioara\s+)?000|tip\s+000)\b/ },
      { tag: 'faina_650', pattern: /\b(?:faina\s+(?:semialba\s+)?650|tip\s+650)\b/ },
      { tag: 'amidon', pattern: /\bamidon\b/ },
      { tag: 'faina', pattern: /\bfaina\b/ },
      { tag: 'malai', pattern: /\bmalai\b/ },
      { tag: 'gris', pattern: /\bgris\b/ },
      { tag: 'pesmet', pattern: /\bpesmet\b/ },
      { tag: 'orez', pattern: /\borez\b/ },
      {
        tag: 'paste',
        pattern:
          /\b(paste|spaghett?i|spaghete|penne|fusilli|farfalle|rigatoni|tagliatelle|macaroane|lasagn\w*|taitei|taietei|fidea)\b/,
      },
    ],
  },
  {
    mode: 'all',
    requireSymmetric: false,
    matchers: [
      { tag: 'alba', pattern: /\balb[ae]\b/ },
      { tag: 'rosie', pattern: /\brosi[ei]\b/ },
      { tag: 'brun', pattern: /\bbrun[ae]?\b/ },
      { tag: 'neagra', pattern: /\bneagr[ae]\b/ },
      { tag: 'integrala', pattern: /\bintegral[ae]\b/ },
    ],
  },
  {
    mode: 'all',
    requireSymmetric: false,
    matchers: [
      { tag: 'dulce', pattern: /\bdulce\b/ },
      { tag: 'picant', pattern: /\b(picant\w*|iute|chili)\b/ },
    ],
  },
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'plata',
        pattern: /(?:\b(plat[ae]|necarbogazoas\w*|izvorul\s+alb|still)\b|\bpla\s*\d|\bpla[a-z0-9])/i,
      },
      {
        tag: 'carbogazoasa',
        pattern: /(?:\b(carbogazoas\w*|carbogazificat\w*|acidulat\w*|forte|sparkling|gazat\w*|cola|pepsi|fanta|sprite|mirinda|7up|schweppes)\b|\bcarb\s*\d|\bcarb[a-z0-9])/i,
      },
    ],
  },
  {
    mode: 'all',
    requireSymmetric: true,
    matchers: [
      { tag: 'spaghetti', pattern: /\b(spaghett?i|spaghete)\b/ },
      { tag: 'penne', pattern: /\bpenne\b/ },
      { tag: 'fusilli', pattern: /\bfusilli\b/ },
      { tag: 'farfalle', pattern: /\bfarfalle\b/ },
      { tag: 'rigatoni', pattern: /\brigatoni\b/ },
      { tag: 'tagliatelle', pattern: /\btagliatelle\b/ },
      { tag: 'lasagna', pattern: /\blasagn\w*\b/ },
      { tag: 'taitei_fidea', pattern: /\b(taitei|taietei|fidea)\b/ },
      { tag: 'paste_umplute', pattern: /\b(tortelloni|tortellini|ravioli)\b/ },
    ],
  },
  {
    mode: 'all',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'bob_rotund',
        pattern: /\b(bob\s+rotund|pentru\s+sarmale|camolino)\b/,
      },
      { tag: 'bob_colosal', pattern: /\b(bob\s+colosal|colosal)\b/ },
      { tag: 'basmati', pattern: /\bbasmati\b/ },
      { tag: 'arborio', pattern: /\barborio\b/ },
      { tag: 'pilaf', pattern: /\bpilaf\b/ },
      { tag: 'bob_lung', pattern: /\bbob lung\b/ },
      { tag: 'salbatic', pattern: /\b(orez\s+salbatic|orez\s+negru)\b/ },
      { tag: 'jasmine', pattern: /\bjasmine\b/ },
      { tag: 'brun_integral', pattern: /\b(orez\s+brun|orez\s+integral)\b/ },
    ],
  },
  {
    mode: 'all',
    requireSymmetric: false,
    matchers: [
      { tag: 'cod 0', pattern: /\bcod 0\b/ },
      { tag: 'cod 1', pattern: /\bcod 1\b/ },
      { tag: 'cod 2', pattern: /\bcod 2\b/ },
      { tag: 'cod 3', pattern: /\bcod 3\b/ },
    ],
  },
  // Panificație & ouă & cămară de bază
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'cozonac', pattern: /\b(cozonac|panettone|pandoro)\b/ },
      { tag: 'croissant', pattern: /\bcroissant\w*\b/ },
      { tag: 'covrig', pattern: /\bcovrig\w*\b/ },
      { tag: 'franzela', pattern: /\bfranzel\w*\b/ },
      { tag: 'bagheta', pattern: /\bbaghet\w*\b/ },
      { tag: 'lipie', pattern: /\blipi[ei]\b/ },
      { tag: 'toast', pattern: /\btoast\b/ },
      { tag: 'chifla', pattern: /\bchifl\w*\b/ },
      { tag: 'paine', pattern: /\bpaine\b/ },
    ],
  },
  // Agenți de dospire și copt (strict simetrice: previne „Drojdie” -> „Praf de copt” sau „Bicarbonat”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'drojdie_proaspata', pattern: /\bdrojdie\s+proaspata\b/ },
      { tag: 'drojdie_uscata', pattern: /\b(drojdie\s+uscata|drojdie\s+activa)\b/ },
      { tag: 'drojdie', pattern: /\bdrojdie\b/ },
      { tag: 'praf_de_copt', pattern: /\bpraf\s+de\s+copt\b/ },
      { tag: 'bicarbonat', pattern: /\bbicarbonat\b/ },
      { tag: 'gelatina', pattern: /\bgelatin\w*\b/ },
    ],
  },
  // Tipuri de sare (strict simetrice: previne „Sare de masă” -> „Sare de lămâie” [acid citric] sau „Sare grunjoasă”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'sare_lamaie', pattern: /\bsare\s+de\s+lamaie\b/ },
      { tag: 'sare_grunjoasa', pattern: /\bsare\s+(?:grunjoasa|pentru\s+muraturi)\b/ },
      { tag: 'sare_de_mare', pattern: /\bsare\s+de\s+mare\b/ },
      { tag: 'sare_bucatarie', pattern: /\bsare\b/ },
    ],
  },
  // Tipuri de zahăr și îndulcitori (strict simetrice: previne „Zahăr vanilat” -> „Zahăr pudră” sau „Zahăr brun”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'indulcitor',
        pattern: /\b(indulcitor\w*|stevia|eritritol|tagatoza|xylitol|zaharina)\b/,
      },
      { tag: 'zahar_vanilat', pattern: /\bzahar\s+vanilat\b/ },
      { tag: 'zahar_pudra', pattern: /\bzahar\s+pudra\b/ },
      { tag: 'zahar_brun', pattern: /\bzahar\s+brun\b/ },
      { tag: 'zahar_cristal', pattern: /\bzahar\b/, exclude: /\b(?:zero|fara|no|0)\s+zahar\b/ },
    ],
  },
  {
    mode: 'all',
    requireSymmetric: true,
    matchers: [
      { tag: 'oua', pattern: /\boua\b/ },
      { tag: 'cacao', pattern: /\bcacao\b/ },
    ],
  },
  // Sortiment miere (strict simetrice: previne „Miere de salcâm” -> „Miere polifloră” sau „Miere de tei”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'miere_salcam', pattern: /\bmiere.*salcam\b/ },
      { tag: 'miere_tei', pattern: /\bmiere.*tei\b/ },
      { tag: 'miere_poliflora', pattern: /\bmiere.*poliflor\w*\b/ },
      { tag: 'miere_mana', pattern: /\bmiere.*mana\b/ },
      { tag: 'miere', pattern: /\bmiere\b/ },
    ],
  },
  // Creme tartinabile dulci & magiun (strict simetrice: previne Nutella -> Unt de arahide sau Gem)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'crema_cacao_alune',
        pattern:
          /\b(nutella|fineti|crema\s+(?:de\s+)?ciocolata|crema\s+(?:de\s+)?alune\s+cu\s+cacao)\b/,
      },
      {
        tag: 'unt_arahide',
        pattern: /\b(unt(?:\s+de)?\s+arahide|peanut\s+butter)\b/,
      },
      {
        tag: 'crema_biscuiti',
        pattern: /\b(crema\s+(?:de\s+)?biscuiti|lotus\s+biscoff)\b/,
      },
      { tag: 'magiun', pattern: /\bmagiun\b/ },
      { tag: 'gem_dulceata', pattern: /\b(gem|dulceata|marmelada)\b/ },
    ],
  },
  // Forme de produse pe bază de ovăz (strict simetrice: previne „Fulgi de ovăz” -> „Baton cu ovăz”, „Băutură de ovăz”, „Biscuiți cu ovăz”, „Terci la plic”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'bautura_ovaz',
        pattern: /\b(bautur\w*|barista|lapte)\b.*\bovaz\b|\bovaz\b.*\b(bautur\w*|barista)\b/,
      },
      {
        tag: 'biscuiti_ovaz',
        pattern:
          /\b(biscuit\w*|fursec\w*|prajitur\w*|painic\w*|paine|lipi[ei]|chifl\w*|digestiv\w*|cracker\w*)\b.*\bovaz\b|\bovaz\b.*\b(biscuit\w*|fursec\w*|painic\w*)\b/,
      },
      {
        tag: 'baton_ovaz',
        pattern: /\b(baton|batoane|mini-batoane|flapjack)\b.*\bovaz\b|\bovaz\b.*\b(baton|batoane)\b/,
      },
      {
        tag: 'terci_gustare_ovaz',
        pattern:
          /\b(terci|porridge|gustare\s+de\s+ovaz|super\s+gustare\s+de\s+ovaz|vitalis|amestec\s+cu\s+ovaz|piure\b.*\bovaz)\b/,
      },
      { tag: 'tarate_ovaz', pattern: /\btarate\s+(?:de\s+)?ovaz\b/ },
      {
        tag: 'fulgi_ovaz',
        pattern: /\b(fulgi\s+(?:fini\s+|integrali\s+|eco\w*\s+|bio\s+)*(?:de\s+)?ovaz|ovaz\s+integral|ovaz\s+fini)\b/,
      },
    ],
  },
  // Forme de produse cu ouă (previne „Ouă de găină” -> „Tăieței cu ouă”, „Fierbător de ouă”, „Pișcoturi cu ouă”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'non_food_oua',
        pattern: /\b(fierbator|aparat|polistiren|vopsea|decor\w*|plastic|suport)\b.*\boua\b/,
      },
      {
        tag: 'paste_oua',
        pattern:
          /\b(paste|taitei|taietei|fidea|spaghete|macaroane|farfalle|pappardelle|tagliatelle|lasagna|galuste|noodles)\b.*\b(ou|oua)\b/,
      },
      {
        tag: 'dulciuri_oua',
        pattern:
          /\b(biscuit\w*|piscot\w*|gofr\w*|waffl\w*|cozonac|chec|prajitur\w*|ciocolat\w*|kinder|maionez\w*)\b.*\b(ou|oua)\b/,
      },
      { tag: 'oua_prepelita', pattern: /\boua\s+(?:de\s+)?prepelita\b/ },
      { tag: 'oua_consum', pattern: /\boua\b/ },
    ],
  },
  // Grad de procesare carne / semipreparate / mezeluri (strict simetrice: previne „Piept de pui dezosat” -> „Șnițel”, „Chiftele”, „Crispy”, „La grătar”, „Crenvurști” sau „Șuncă”)
  {
    mode: 'all',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'snitel_pane',
        pattern:
          /\b(snitel\w*|pane|crispy|strips|nuggets|gujoane|cordon\s+bleu|kentucky|invelis\s+crocant|popcorn)\b/,
      },
      {
        tag: 'chiftele',
        pattern: /\b(chiftel\w*|perisoare|burger\w*|mici|mititei)\b/,
      },
      {
        tag: 'carnati_crenvursti',
        pattern:
          /\b(carnat\w*|carnacior\w*|crenvurst\w*|parizer|salam\w*|sunca|pastrama|afumat\w*|bacon|kaizer)\b/,
      },
      {
        tag: 'gatit_marinat',
        pattern:
          /\b(la\s+gratar|gratar|marinat\w*|frigarui|piri|curry|capresse|noodles|piure|asortat|deshidratat\w*|snack)\b/,
      },
    ],
  },
  // Subtipuri mezeluri și preparate din carne (strict simetrice: previne echivalențe absurde gen „Bacon” -> „Șuncă de Praga” sau „Salam” -> „Parizer”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      {
        tag: 'bacon_kaizer',
        pattern:
          /\b(bacon|pancetta|guanciale|kaizer|kaiser|costita\s+afumata|piept\s+afumat|piept\s+de\s+porc\s+afumat)\b/,
      },
      {
        tag: 'sunca_presata',
        pattern:
          /\b(sunca|prosciutto|jamon|jambon)\b/,
      },
      {
        tag: 'salam',
        pattern:
          /\b(salam\w*|chorizo|pepperoni|salchichon)\b/,
      },
      {
        tag: 'parizer_mortadella',
        pattern:
          /\b(parizer\w*|mortadella)\b/,
      },
      {
        tag: 'crenvursti',
        pattern:
          /\b(crenvurst\w*|crenwurst\w*|frankfurter|hot\s*dog)\b/,
      },
      {
        tag: 'carnati',
        pattern:
          /\b(carnat\w*|carnacior\w*|cabanos\w*|polonez\w*|plescoi|oltenesti|patricieni)\b/,
      },
      {
        tag: 'pastrama_muschi',
        pattern:
          /\b(pastrama\w*|muschi\s+file|muschiulet\s+afumat|ceafa\s+afumata)\b/,
      },
      {
        tag: 'leber_toba',
        pattern:
          /\b(leber\w*|toba\b|caltabos\w*|drob\b)\b/,
      },
    ],
  },
  // Identitate culinară strictă (previne echivalențe greșite gen „Humus cu ciuperci” -> „Ciuperci” sau „Sos vinegretă” -> „Sos de stridii”)
  {
    mode: 'all',
    requireSymmetric: true,
    matchers: [
      { tag: 'humus', pattern: /\b(humus|hummus)\b/ },
      { tag: 'guacamole', pattern: /\bguacamole\b/ },
      { tag: 'tzatziki', pattern: /\btzatziki\b/ },
      { tag: 'vinegreta', pattern: /\b(vinegret\w*|vinaigrette|dressing)\b/ },
      { tag: 'sos_stridii', pattern: /\b(stridii|oyster)\b/ },
      { tag: 'sos_soia', pattern: /\bsos\s+(?:de\s+)?soia\b/ },
      { tag: 'teriyaki', pattern: /\bteriyaki\b/ },
      { tag: 'bbq', pattern: /\b(bbq|barbecue)\b/ },
      { tag: 'maioneza', pattern: /\bmaionez\w*\b/ },
      { tag: 'ketchup', pattern: /\bketchup\b/ },
      { tag: 'mustar', pattern: /\bmustar\b/ },
      { tag: 'pesto', pattern: /\bpesto\b/ },
      { tag: 'speculoos', pattern: /\bspeculoos\b/ },
      { tag: 'petit_beurre', pattern: /\bpetit(?:\s+beurre)?\b/ },
      { tag: 'digestive', pattern: /\bdigestiv\w*\b/ },
      { tag: 'napolitane', pattern: /\bnapolitan\w*\b/ },
      { tag: 'icre', pattern: /\bicre\b/ },
    ],
  },
  // Carne & Păsări - Piese și organe (strict simetrice: previne echivalențe greșite gen „Piept de pui” -> „Ficat de pui” sau „Aripi” -> „Pulpe”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'piept', pattern: /\b(piept|muschiulet\s+din\s+piept|file\s+din\s+piept)\b/ },
      { tag: 'pulpe', pattern: /\b(pulp[ae]|pulpite|copanele)\b/ },
      { tag: 'aripi', pattern: /\b(arip[ai]|aripioare)\b/ },
      { tag: 'ficat', pattern: /\b(ficat|ficatei)\b/ },
      { tag: 'pipote_inimi', pattern: /\b(pipot\w*|inim\w*)\b/ },
      { tag: 'carne_tocata', pattern: /\bcarne\s+tocata\b/ },
      { tag: 'pui_intreg', pattern: /\b(pui\s+grill|pui\s+intreg|jumatat\w*\s+de\s+pui)\b/ },
      { tag: 'ceafa', pattern: /\bceaf[ae]\b/ },
      { tag: 'cotlet', pattern: /\bcotlet\w*\b/ },
      { tag: 'muschi', pattern: /\b(muschi|muschiulet)\b/ },
      { tag: 'coaste', pattern: /\b(coaste|costit\w*)\b/ },
    ],
  },
  // Specii de carne (strict simetrice: previne „Pui” -> „Curcan” sau „Porc” -> „Vită”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'curcan', pattern: /\bcurcan\w*\b/ },
      { tag: 'pui', pattern: /\b(pui|puiul|puisor)\b/ },
      { tag: 'porc', pattern: /\bporc\w*\b/ },
      { tag: 'vita', pattern: /\b(vit[ae]|mancarica|manzat\w*|black\s+angus)\b/ },
      { tag: 'rata', pattern: /\brat[ae]\b/ },
      { tag: 'oaie_miel', pattern: /\b(oaie|oita|miel|berbec\w*)\b/ },
      { tag: 'somon', pattern: /\bsomon\w*\b/ },
      { tag: 'pastrav', pattern: /\bpastrav\w*\b/ },
    ],
  },
  // Preparare carne: dezosat / file vs cu os (strict simetrice: previne „Pulpe dezosate” -> „Pulpe cu os”)
  {
    mode: 'exclusive',
    requireSymmetric: true,
    matchers: [
      { tag: 'dezosat', pattern: /\b(dezosat\w*|fara\s+os|file\b)/ },
      { tag: 'cu_os', pattern: /\bcu\s+os\b/ },
    ],
  },
];

const EXCLUSIVE_PRIVATE_LABEL_OWNER_BY_BRAND: Record<string, string> = {
  // Auchan
  auchan: 'auchan',
  'filiera auchan': 'auchan',
  pouce: 'auchan',
  actuel: 'auchan',
  // Mega Image
  '365': 'mega-image',
  mega: 'mega-image',
  'mega image': 'mega-image',
  'mega apetit': 'mega-image',
  'mega grill': 'mega-image',
  delhaize: 'mega-image',
  'gusturi romanesti': 'mega-image',
  // Carrefour
  carrefour: 'carrefour',
  'carrefour classic': 'carrefour',
  'carrefour extra': 'carrefour',
  'carrefour bio': 'carrefour',
  'carrefour selection': 'carrefour',
  simpl: 'carrefour',
  'drag de romania': 'carrefour',
  'reflets de france': 'carrefour',
  'terre d italia': 'carrefour',
  // Sezamo
  miil: 'sezamo',
  ubena: 'sezamo',
  ubomi: 'sezamo',
  yutto: 'sezamo',
  pappudia: 'sezamo',
  fjoru: 'sezamo',
  sutte: 'sezamo',
  modilac: 'sezamo',
  pappamia: 'sezamo',
  dacello: 'sezamo',
  kitchin: 'sezamo',
  lambini: 'sezamo',
  'delicatese sezamo': 'sezamo',
  'marks spencer': 'sezamo',
  'marks & spencer': 'sezamo',
  'marks and spencer': 'sezamo',
  // Lidl
  pilos: 'lidl',
  sondey: 'lidl',
  pikok: 'lidl',
  cien: 'lidl',
  dulano: 'lidl',
  'dulano selection': 'lidl',
  solevita: 'lidl',
  freeway: 'lidl',
  milbona: 'lidl',
  alesto: 'lidl',
  deluxe: 'lidl',
  favorina: 'lidl',
  italiamo: 'lidl',
  'chef select': 'lidl',
  culinea: 'lidl',
  freshona: 'lidl',
  nixe: 'lidl',
  'ocean sea': 'lidl',
  kania: 'lidl',
  gelatelli: 'lidl',
  belbake: 'lidl',
  castello: 'lidl',
  bellarom: 'lidl',
  // Kaufland
  'k classic': 'kaufland',
  'k-classic': 'kaufland',
  'k favorites': 'kaufland',
  'k-favorites': 'kaufland',
  'k bio': 'kaufland',
  'k-bio': 'kaufland',
  'k free': 'kaufland',
  'k-free': 'kaufland',
  // PENNY
  penny: 'penny',
  'san fabio': 'penny',
  'hanul boieresc': 'penny',
  bunte: 'penny',
  boni: 'penny',
  'gran mare': 'penny',
  'my bio': 'penny',
  // Profi
  proxi: 'profi',
  'gradina bunicii': 'profi',
  'grădina bunicii': 'profi',
  'ferma din deal': 'profi',
  'deli di': 'profi',
  'al saptesprezecelea': 'profi',
  'al șaptesprezecelea': 'profi',
  profi: 'profi',
};

const TITLE_PREFIX_PRIVATE_LABEL_OWNERS: { prefix: RegExp; owner: string }[] = [
  { prefix: /^(?:365|mega\s+image|mega\s+apetit|mega\s+grill|mega|delhaize|gusturi\s+romanesti)\b/, owner: 'mega-image' },
  { prefix: /^(?:auchan|filiera\s+auchan|pouce)\b/, owner: 'auchan' },
  { prefix: /^(?:carrefour|simpl|drag\s+de\s+romania|reflets\s+de\s+france|terre\s+d\s*italia)\b/, owner: 'carrefour' },
  { prefix: /^(?:k[-\s]?classic|k[-\s]?favorites|k[-\s]?bio|k[-\s]?free)\b/, owner: 'kaufland' },
  { prefix: /^(?:pilos|milbona|pikok|dulano|solevita|freeway|freshona|ocean\s+sea|bellarom|italiamo|chef\s+select|belbake|gelatelli|alesto|favorina|sondey)\b/, owner: 'lidl' },
  { prefix: /^(?:miil|ubena|ubomi|yutto|pappudia|fjoru|sutte|pappamia|dacello|kitchin|lambini|delicatese\s+sezamo|marks\s*(?:&|and)?\s*spencer)\b/, owner: 'sezamo' },
  { prefix: /^(?:penny|hanul\s+boieresc|san\s+fabio|gran\s+mare|bunte|boni|my\s+bio)\b/, owner: 'penny' },
  { prefix: /^(?:proxi|gradina\s+bunicii|grădina\s+bunicii|ferma\s+din\s+deal|deli\s+di|al\s+(?:ș|s)aptesprezecelea|profi)\b/, owner: 'profi' },
];

/**
 * Identifică retailerul proprietar al unei mărci proprii exclusive (slug ex. `mega-image`, `sezamo`, `kaufland`).
 * Returnează `null` pentru branduri naționale sau mărci vândute multi-retailer (ex. `Albert`, `Casa Țărănească`).
 */
export function resolvePrivateLabelOwnerRetailer(
  profile?:
    | (Pick<CatalogProductProfile, 'brand' | 'canonical_name'> &
        Partial<
          Pick<
            CatalogProductProfile,
            'attributes' | 'category' | 'subcategory' | 'package_size'
          >
        >)
    | null
): string | null {
  if (!profile) return null;
  // Fructele și legumele proaspete sunt mărfuri agricole naturale, nu aparțin unui retailer privat exclusiv
  if (isFreshProduceItemProfile(profile)) {
    return null;
  }
  const attrOwner = profile.attributes?.private_label_retailer_slug;
  if (typeof attrOwner === 'string' && attrOwner.trim().length > 0) {
    return attrOwner.trim().toLowerCase();
  }
  const bNorm = normalizeCompareText(profile.brand).replace(/\s+/g, ' ').trim();
  if (bNorm && EXCLUSIVE_PRIVATE_LABEL_OWNER_BY_BRAND[bNorm]) {
    return EXCLUSIVE_PRIVATE_LABEL_OWNER_BY_BRAND[bNorm];
  }
  const nNorm = normalizeCompareText(profile.canonical_name).replace(/\s+/g, ' ').trim();
  for (const rule of TITLE_PREFIX_PRIVATE_LABEL_OWNERS) {
    if (rule.prefix.test(nNorm)) {
      return rule.owner;
    }
  }
  return null;
}

const PRIVATE_LABEL_BRANDS_SET = new Set([
  'auchan',
  'filiera auchan',
  'pouce',
  '365',
  'mega',
  'mega image',
  'mega apetit',
  'mega grill',
  'delhaize',
  'albert',
  'gusturi romanesti',
  'gustona',
  'fine crunchy',
  'fish market',
  'gonuts',
  'emma',
  'excellent',
  'delicata',
  'kitbis',
  'caffe gondoliere',
  'ever-g',
  'carrefour',
  'simpl',
  'drag de romania',
  'reflets de france',
  'terre d italia',
  'miil',
  'ubena',
  'ubomi',
  'yutto',
  'pappudia',
  'fjoru',
  'sutte',
  'modilac',
  'pappamia',
  'dacello',
  'kitchin',
  'lambini',
  'delicatese sezamo',
  'marks spencer',
  'marks & spencer',
  'marks and spencer',
  'pilos',
  'sondey',
  'pikok',
  'cien',
  'dulano',
  'dulano selection',
  'solevita',
  'freeway',
  'milbona',
  'alesto',
  'deluxe',
  'favorina',
  'italiamo',
  'chef select',
  'culinea',
  'freshona',
  'nixe',
  'ocean sea',
  'kania',
  'gelatelli',
  'belbake',
  'castello',
  'bellarom',
  'k classic',
  'k-classic',
  'kclassic',
  'k favorites',
  'k-favorites',
  'kfavourites',
  'k favourites & friends',
  'k-favourites & friends',
  'kfj',
  'k purland',
  'k-purland',
  'kpurland',
  'k bio',
  'k-bio',
  'k free',
  'k-free',
  'take it veggie',
  'k-take it veggie',
  'penny',
  'clever',
  'san fabio',
  'hanul boieresc',
  'bunte',
  'boni',
  'gran mare',
  'my bio',
  'casa taraneasca',
  'proxi',
  'gradina bunicii',
  'grădina bunicii',
  'ferma din deal',
  'deli di',
  'al saptesprezecelea',
  'al șaptesprezecelea',
  'profi',
  'combino',
  'maribel',
]);

const TITLE_SAFE_PRIVATE_BRANDS = [
  'k-classic',
  'k classic',
  'kclassic',
  'k-bio',
  'k bio',
  'k-free',
  'k-favorites',
  'k favorites',
  'k-favourites',
  'k favourites',
  'kfj',
  'k-purland',
  'k purland',
  'pilos',
  'milbona',
  'pikok',
  'dulano',
  'combino',
  'maribel',
  'clever',
  'favorina',
  'sondey',
  'kania',
  'freshona',
  'ocean sea',
  'italiamo',
  'chef select',
  'gelatelli',
  'solevita',
  'freeway',
  'alesto',
  'belbake',
  'bellarom',
  'miil',
  'yutto',
  'kitchin',
  'dacello',
  'pappudia',
  'ubomi',
  'fjoru',
  'lambini',
  'modilac',
  'delicatese sezamo',
  'marks & spencer',
  'marks and spencer',
  'mega image',
  'mega apetit',
  'gusturi romanesti',
  'drag de romania',
  'reflets de france',
  'carrefour',
  'auchan',
  'pouce',
  'hanul boieresc',
  'san fabio',
  'gran mare',
  'boni',
];

/**
 * Verifică dacă un produs canonic aparține unei mărci proprii de supermarket.
 * Fructele și legumele proaspete sunt mărfuri agricole naturale, NU mărci proprii de supermarket
 * (chiar dacă Mega Image le etichetează cu „Gusturi Românești” sau alte branduri umbrelă).
 */
export function isPrivateLabelProduct(
  profile?:
    | (Pick<CatalogProductProfile, 'brand' | 'canonical_name'> &
        Partial<
          Pick<
            CatalogProductProfile,
            'attributes' | 'category' | 'subcategory' | 'package_size'
          >
        >)
    | null
): boolean {
  if (!profile) return false;
  // Fructele și legumele proaspete nu trebuie să apară NICIODATĂ ca marcă proprie sau înlocuitor de buget
  if (isFreshProduceItemProfile(profile)) {
    return false;
  }
  const flag = profile.attributes?.is_private_label;
  if (flag === true || flag === 'true') return true;
  const bNorm = normalizeCompareText(profile.brand).replace(/\s+/g, ' ');
  if (bNorm && PRIVATE_LABEL_BRANDS_SET.has(bNorm)) return true;
  const nNorm = normalizeCompareText(profile.canonical_name);
  for (const pb of TITLE_SAFE_PRIVATE_BRANDS) {
    if (new RegExp(`\\b${pb.replace(/-/g, '[\\s-]?')}\\b`).test(nNorm)) {
      return true;
    }
  }
  return false;
}

/**
 * Curăță denumirile brute preluate de la retaileri (abrevieri agresive, coduri interne precum STSGR/PLA, majuscule stridente)
 * și le formatează într-un mod elegant, ușor de citit conform Beavy Design System.
 */
export function cleanScraperProductName(rawName?: string | null): string {
  if (!rawName) return '';
  let clean = rawName.trim();
  const rawLetters = rawName.replace(/[^a-zA-Z]/g, '');
  const isAllCaps = rawLetters.length > 5 && rawLetters === rawLetters.toUpperCase();

  // Elimină coduri interne retailer (ex. STSGR, SGR, PET, etc.)
  clean = clean.replace(/STSGR|SGR/gi, ' ').trim();
  // Înlocuiește abrevieri uzuale românești
  clean = clean.replace(/\bMIN\.NAT\.\s*/gi, 'Minerală Naturală ');
  clean = clean.replace(/\bMIN\.NAT\b/gi, 'Minerală Naturală');
  clean = clean.replace(/\bAPA\b/gi, 'Apă');
  clean = clean.replace(/\bPLA(?=\d)/gi, 'Plată ');
  clean = clean.replace(/\bPLA\b/gi, 'Plată');
  clean = clean.replace(/\bCARB(?=\d)/gi, 'Carbogazoasă ');
  clean = clean.replace(/\bCARB\b/gi, 'Carbogazoasă');
  clean = clean.replace(/\bKFJ\b/gi, 'K-Favorites');
  clean = clean.replace(/\bEXTRAVIRGIN\b/gi, 'Extra Virgin');
  clean = clean.replace(/\bEXT\.VIRG\b/gi, 'Extra Virgin');
  clean = clean.replace(/\bMASL\b/gi, 'Măsline');
  clean = clean.replace(/\bMACIN\b/gi, 'Măcinată');
  clean = clean.replace(/\bPRAJE\b/gi, 'Prăjită');
  clean = clean.replace(/\bGRAS\b/gi, 'Grăsime');

  // Dacă numele a fost cu majuscule stridente, îl transformăm în Title Case plăcut
  if (isAllCaps) {
    clean = clean
      .split(' ')
      .map((word) => {
        if (!word) return '';
        if (/^\d+(?:[.,]\d+)?(l)$/i.test(word)) return word.toUpperCase();
        if (/^\d+(?:[.,]\d+)?(ml|g|kg)$/i.test(word)) return word.toLowerCase();
        if (/^(bio|eco|uht|xl|xxl)$/i.test(word)) return word.toUpperCase();
        return word
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('-');
      })
      .join(' ');
  }

  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Extrage un gramaj sau volum curat din text dacă scraperul nu oferă package_size
 * sau oferă un câmp eronat (ex: "7,05 lei/buc")
 */
export function extractPackageSizeFromText(text?: string | null): string | null {
  if (!text) return null;
  // Curățăm mai întâi codurile de scraper (STSGR, PLA, etc.) pentru a desprinde numerele de literele lipite
  const cleanedText = cleanScraperProductName(text);
  const s = `${text} ${cleanedText}`.trim();

  // Multi-pack lichide (ex: 6 x 330ml, 4x0.5L)
  const multiVol = s.match(/(?:^|\D)(\d+)\s*(?:x|\*)\s*(\d+(?:[.,]\d+)?)\s*(l|ml)\b/i);
  if (multiVol) {
    return `${multiVol[1]} × ${multiVol[2]} ${multiVol[3].toUpperCase() === 'L' ? 'L' : 'ml'}`;
  }
  // Multi-pack solide (ex: 2 x 500g)
  const multiWeight = s.match(/(?:^|\D)(\d+)\s*(?:x|\*)\s*(\d+(?:[.,]\d+)?)\s*(g|kg)\b/i);
  if (multiWeight) {
    return `${multiWeight[1]} × ${multiWeight[2]} ${multiWeight[3].toLowerCase()}`;
  }
  // Lichide simple (ex: 500ml, 0.75L, 1L, 2L, sau PLA0.75LSTSGR)
  const singleVol = s.match(/(?:^|\D)(\d+(?:[.,]\d+)?)\s*(ml|l)(?:\b|[^a-z0-9]|$)/i);
  if (singleVol) {
    return `${singleVol[1]} ${singleVol[2].toUpperCase() === 'L' ? 'L' : 'ml'}`;
  }
  // Solide simple (ex: 200g, 250g, 1kg)
  const singleWeight = s.match(/(?:^|\D)(\d+(?:[.,]\d+)?)\s*(g|kg|gr)(?:\b|[^a-z0-9]|$)/i);
  if (singleWeight) {
    return `${singleWeight[1]} ${singleWeight[2].toLowerCase() === 'gr' ? 'g' : singleWeight[2].toLowerCase()}`;
  }
  return null;
}

/**
 * Filtrează artefactele de preț introduse eronat de scrapere în câmpul de gramaj
 * (ex: "7,05 lei/buc", "14,34 lei/buc", "12.49 RON", etc.)
 * Dacă gramajul lipsește sau e invalid, poate căuta în fallbackText (ex. numele produsului).
 */
export function cleanDisplayPackageSize(
  size?: string | null,
  fallbackText?: string | null
): string | null {
  if (size) {
    const s = size.trim().replace(/\u00a0/g, ' ');
    const isJunkPrice =
      /(?:lei|ron)\s*\/\s*(?:buc|kg|l|100g|100ml)/i.test(s) ||
      /^\s*[\d.,]+\s*(?:lei|ron)\b/i.test(s) ||
      /(?:pret|preț|cost)\b/i.test(s) ||
      /^\s*[\d.,]+\s*(?:lei|ron)/i.test(s) ||
      /^\s*(?:1\s*buc|buc|1\s*bucata|bucata)\s*$/i.test(s);
    if (!isJunkPrice && s.length > 0) {
      return s;
    }
  }
  if (fallbackText) {
    return extractPackageSizeFromText(fallbackText);
  }
  return null;
}

/**
 * Calculează un preț unitar standardizat (RON/kg sau RON/L) lizibil și informativ
 * derivat din gramaj și preț, eliminând duplicările inutile de tip "10.39 RON/buc".
 */
export function deriveNormalizedUnitPrice(
  price: number,
  packageSize?: string | null,
  rawUnitPrice?: number | null,
  rawUnitLabel?: string | null,
  fallbackProductName?: string | null
): string | null {
  if (
    rawUnitPrice !== null &&
    rawUnitPrice !== undefined &&
    rawUnitPrice > 0 &&
    rawUnitLabel &&
    /(?:kg|l\b|100g|100ml)/i.test(rawUnitLabel) &&
    !rawUnitLabel.toLowerCase().includes('buc')
  ) {
    return `${rawUnitPrice.toFixed(2)} ${rawUnitLabel}`;
  }

  const cleanSize = cleanDisplayPackageSize(packageSize, fallbackProductName);
  const combinedText = `${cleanSize ?? ''} ${fallbackProductName ?? ''}`.trim();
  if (price <= 0 || !combinedText) return null;

  // 1. Verificare volum lichide (litri / ml)
  const volInfo = parseVolumeLitersFromText(combinedText);
  if (volInfo.liters && volInfo.liters > 0) {
    const perL = price / volInfo.liters;
    return `${perL.toFixed(2)} RON/L`;
  }

  // 2. Verificare greutate solide (kg / grame)
  const weightInfo = parseWeightGramsFromText(combinedText);
  if (weightInfo.grams && weightInfo.grams > 0) {
    const perKg = price / (weightInfo.grams / 1000);
    return `${perKg.toFixed(2)} RON/kg`;
  }

  return null;
}

/**
 * Detectează dacă un produs este carne proaspătă, pește, fructe de mare, mezeluri
 * sau produs vândut la greutate variabilă (vrac, per kg, caserole de gramaj variat).
 * Permite compararea flexibilă între ambalaje (ex: caserolă 200g-250g vs 1kg per kg).
 */
export function isVariableWeightOrProteinProduct(
  profile?:
    | (Pick<CatalogProductProfile, 'canonical_name'> &
        Partial<
          Pick<
            CatalogProductProfile,
            'category' | 'subcategory' | 'package_size'
          >
        > & {
          sell_by_mode?: string | null;
        })
    | null
): boolean {
  if (!profile) return false;
  if (isFreshProduceItemProfile(profile)) return true;
  const cat = normalizeCompareText(profile.category || profile.subcategory);
  if (
    /\b(peste|fructe de mare|carne|pasare|pui|porc|vita|mezeluri|branzeturi)\b/.test(
      cat
    )
  ) {
    return true;
  }
  const name = normalizeCompareText(profile.canonical_name);
  if (
    /\b(somon|pastrav|dorada|caras|crap|salau|file|pui|piept|pulpe|aripi|ceafa|cotlet|muschi|vita|tocata|per kg|kg\b|vrac)\b/.test(
      name
    )
  ) {
    return true;
  }
  if (profile.sell_by_mode === 'kg' || profile.sell_by_mode === 'catch_weight') {
    return true;
  }
  return false;
}

const COMPARE_STOPWORDS = new Set([
  'pentru',
  'clasic',
  'clasica',
  'natur',
  'natural',
  'proaspat',
  'proaspata',
  'bucati',
  'pachet',
  'grasime',
  'extra',
  'super',
  'premium',
  'promo',
  'original',
  'gust',
  'aroma',
  'zero',
  'fara',
]);

const GENERIC_EQUIV_CONTAINER_WORDS = new Set([
  'sos',
  'crema',
  'topping',
  'biscuiti',
  'amestec',
  'mix',
  'pasta',
  'conserva',
  'pate',
  'salata',
  'file',
  'felii',
  'pulpa',
  'cuburi',
  'boabe',
]);

function extractComparableFoodWords(
  name: string,
  brand?: string | null
): Set<string> {
  const bTokens = new Set(
    normalizeCompareText(brand)
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
  const words = normalizeCompareText(name)
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ''))
    .filter(
      (w) =>
        w.length >= 4 &&
        !COMPARE_STOPWORDS.has(w) &&
        !GENERIC_EQUIV_CONTAINER_WORDS.has(w) &&
        !bTokens.has(w)
    );
  return new Set(words);
}

function extractGroupTags(normalizedName: string, config: EquivalentGroupConfig): string[] {
  const matched: string[] = [];
  for (const item of config.matchers) {
    if (item.pattern.test(normalizedName) && !item.exclude?.test(normalizedName)) {
      matched.push(item.tag);
      if (config.mode === 'exclusive') break;
    }
  }
  return matched;
}

/**
 * Verifică strict dacă un produs poate fi folosit ca echivalent
 * (ex. marcă proprie Lidl/Kaufland/Penny/Mega/Auchan/Carrefour/Sezamo vs brand național)
 * fără a amesteca sortimente diferite.
 */
export function isCompatibleEquivalentProduct(
  target: CatalogProductProfile,
  candidate: CatalogProductProfile,
  options: {
    allowSameCategoryWithoutFamily?: boolean;
    skipCategoryCheck?: boolean;
    allowDifferentSize?: boolean;
    allowAsymmetricDomainTags?: boolean;
  } = {}
): boolean {
  if (target.id === candidate.id) return false;

  const targetProduceKey = extractFreshProduceGenericKey(target);
  const candidateProduceKey = extractFreshProduceGenericKey(candidate);
  if (targetProduceKey || candidateProduceKey) {
    return Boolean(
      targetProduceKey &&
        candidateProduceKey &&
        targetProduceKey === candidateProduceKey
    );
  }

  const sharesFamily = target.familyIds.some((fid) => candidate.familyIds.includes(fid));
  let matchedByCategory = false;
  if (!sharesFamily) {
    if (options.skipCategoryCheck) {
      // Căutare externă (ex. Open Food Facts) fără categorie Beavy mapată:
      // păstrăm toate filtrele stricte de cantitate, zahăr, aromă și cuvinte alimentare.
      matchedByCategory = true;
    } else {
      if (!options.allowSameCategoryWithoutFamily) return false;
      const tCat = normalizeCompareText(target.category || target.subcategory);
      const cCat = normalizeCompareText(candidate.category || candidate.subcategory);
      if (!tCat || !cCat || tCat !== cCat) return false;
      matchedByCategory = true;
    }
  }

  if (!options.allowDifferentSize) {
    const targetQty = toBaseQuantity(
      target.quantity_value,
      target.quantity_unit,
      target.package_size || target.canonical_name
    );
    const candQty = toBaseQuantity(
      candidate.quantity_value,
      candidate.quantity_unit,
      candidate.package_size || candidate.canonical_name
    );
    if (targetQty && candQty) {
      if (targetQty.kind !== candQty.kind) return false;
      if (targetQty.packCount !== candQty.packCount) return false;
      const ratio = candQty.baseValue / targetQty.baseValue;
      if (ratio < 0.85 || ratio > 1.15) return false;
    } else if (matchedByCategory && !options.skipCategoryCheck && (targetQty || candQty)) {
      return false;
    }
  }

  const tName = normalizeCompareText(target.canonical_name);
  const cName = normalizeCompareText(candidate.canonical_name);

  for (const rule of STRICT_SYMMETRIC_MODIFIERS) {
    const tHas =
      rule.pattern.test(tName) || (rule.attrKey ? target.attributes?.[rule.attrKey] === true : false);
    const cHas =
      rule.pattern.test(cName) ||
      (rule.attrKey ? candidate.attributes?.[rule.attrKey] === true : false);
    if (tHas !== cHas) return false;
  }

  const tFat = extractFatPercent(target);
  const cFat = extractFatPercent(candidate);
  if (tFat !== null && cFat !== null && Math.abs(tFat - cFat) > 0.6) {
    return false;
  }

  const strictAttrKeys = ['fruit', 'flavour', 'flour_type', 'juice_type', 'rice_type'];
  for (const key of strictAttrKeys) {
    const tv = target.attributes?.[key];
    const cv = candidate.attributes?.[key];
    if (tv && cv && normalizeCompareText(String(tv)) !== normalizeCompareText(String(cv))) {
      return false;
    }
  }

  let hasDomainTagOverlap = false;
  for (const group of EQUIVALENT_DOMAIN_GROUPS) {
    const tTags = extractGroupTags(tName, group);
    const cTags = extractGroupTags(cName, group);
    if (tTags.length === 0 && cTags.length === 0) continue;
    if (
      group.requireSymmetric &&
      (tTags.length === 0 || cTags.length === 0) &&
      !options.allowAsymmetricDomainTags
    ) {
      return false;
    }
    if (tTags.length > 0 && cTags.length > 0) {
      const overlap = tTags.some((tag) => cTags.includes(tag));
      if (!overlap) return false;
      hasDomainTagOverlap = true;
    }
  }

  if (matchedByCategory && !hasDomainTagOverlap) {
    const tWords = extractComparableFoodWords(target.canonical_name, target.brand);
    const cWords = extractComparableFoodWords(candidate.canonical_name, candidate.brand);
    let sharedWord = false;
    for (const w of tWords) {
      if (cWords.has(w)) {
        sharedWord = true;
        break;
      }
    }
    if (!sharedWord && (!options.allowAsymmetricDomainTags || (tWords.size > 0 && cWords.size > 0))) {
      return false;
    }
  }

  return true;
}

/**
 * Verifică dacă două produse sunt aceeași gamă/sortiment de brand în ambalaje/gramaje diferite
 * (ex. Pepsi Max/Zero 2L vs 1.5L / 2.5L sau Biborțeni plată 2L vs 500ml / 5L).
 */
export function areSameLineDifferentSizes(
  target: CatalogProductProfile,
  candidate: CatalogProductProfile
): boolean {
  const tBrand = normalizeCompareText(target.brand);
  const cBrand = normalizeCompareText(candidate.brand);
  if (!tBrand || !cBrand) return false;
  const tCompact = tBrand.replace(/[\s-]+/g, '');
  const cCompact = cBrand.replace(/[\s-]+/g, '');
  if (
    tBrand !== cBrand &&
    !tBrand.includes(cBrand) &&
    !cBrand.includes(tBrand) &&
    tCompact !== cCompact &&
    !tCompact.includes(cCompact) &&
    !cCompact.includes(tCompact) &&
    !(tCompact.length >= 3 && cCompact.length >= 3 && tCompact.replace(/s$/, '') === cCompact.replace(/s$/, ''))
  ) {
    return false;
  }
  return isCompatibleEquivalentProduct(target, candidate, {
    skipCategoryCheck: true,
    allowDifferentSize: true,
  });
}

const PROCESSED_NON_FRESH_PRODUCE_RE =
  /\b(suc\s+(?:de|natural|bio|eco|100|cu|din|presat|pasteurizat)|^suc\b|nectar|bautur\w*|carbogazoas\w*|limonada|smoothie|smootie|ceai|infuzie|cafea|espresso|boabe|macinata|dropshot|sirop|cidru|vin|bere|prosecco|lichior|kombucha|energy\s+shot|fresh\s+de|otet|ulei|esenta|apa\s+minerala|lapte|biscuit\w*|cookie\w*|madlen\w*|brios\w*|baton|batoane|musli|muesli|granola|fulgi|cereale|terci|milupa|aptamil|nestle|ovaz|gris|faina|pudra|trigon|prajitur\w*|placint\w*|strudel|tarta|tort|cozonac|paine|bread|napolitan\w*|ciocolat\w*|jeleu\w*|bombon\w*|bomboane|acadea|inghetat\w*|sorbet|wafa|rondele|pufuleti|chips\w*|gustare|snack\w*|takis|popcorn|nacho\w*|tortilla|drops\w*|guma\s+de\s+mestecat|dropsuri|drajeuri|iaurt|branzica|budinca|kefir|mix\s+pentru|liofilizat\w*|deshidratat\w*|uscat\w*|congelat\w*|murat\w*|conserva|in\s+otet|in\s+saramura|in\s+ulei|cuburi|jumatati|felii|cacao|fermentat|pouch|piure|mousse|compot|gem|dulceata|marmelada|coaja\s+de|extract\s+de|sare\s+de\s+lamaie|sos|pasta\s+de|bulion|passata|ketchup|tzatziki|guacamole|humus|hummus|salata\s+de\s+vinete|zacusca|piept\s+de|pui|porc|vita|somon|ton|odorizant\w*|aromaterapie|parfum\w*|sapun\w*|gel\s+de\s+dus|sampon\w*|crema\s+de\s+maini|crema\s+de\s+fata|detergent\w*|balsam\w*|solutie\s+spray|spray|carnitin\w*|yves\s+rocher|ardo|casa\s+taraneasca|junior|\d+\s*(?:luni|an|ani)|bebe|bebelusi|pepsi|cola|fanta|sprite|mirinda|prigat|tymbark|tedi|san\s+terra|agros|alpro|danonino|actimel|muller|corny|mcvitie|casali|haribo|hipp|babybio|organix|holle|ellas|biskids|born\s+winner|yutto|aroma\s+de|cu\s+aroma\s+de|gust\s+de|cu\s+gust\s+de)\b/;

/**
 * Detectează produsele procesate / gustările / băuturile ambalate greșit în categoria de Fructe și legume
 * (ex. baton cu banane, suc, iaurt, chipsuri, piure bebe, Pepsi Mango), astfel încât raionul Fructe
 * și căutările generice („Banane”) să arate doar fructe proaspete.
 */
export function isProcessedNonFreshProduce(canonicalName: string): boolean {
  const norm = normalizeCompareText(canonicalName);
  if (!norm) return false;
  return PROCESSED_NON_FRESH_PRODUCE_RE.test(norm);
}

const GENERIC_TERM_NOISE_WORDS = new Set([
  'vrac',
  'proaspat',
  'proaspata',
  'proaspete',
  'romania',
  'calitate',
  'calitatea',
  'cal',
  'import',
  'kg',
  'buc',
  'bucata',
  'de',
  'la',
  'cu',
  'si',
  'sau',
  'ori',
  'pt',
  'pentru',
  'din',
  'cca',
]);

const RO_IRREGULAR_STEMS: Record<string, string> = {
  // Cele 11 perechi principale cerute explicit + forme articulate
  mar: 'mar',
  marul: 'mar',
  mere: 'mar',
  merele: 'mar',
  merelor: 'mar',
  banana: 'banan',
  banane: 'banan',
  bananele: 'banan',
  banan: 'banan',
  lamaie: 'lamai',
  lamaia: 'lamai',
  lamai: 'lamai',
  lamaile: 'lamai',
  portocala: 'portocal',
  portocale: 'portocal',
  portocalele: 'portocal',
  portocal: 'portocal',
  rosie: 'rosi',
  rosia: 'rosi',
  rosii: 'rosi',
  rosiile: 'rosi',
  rosi: 'rosi',
  cartof: 'cartof',
  cartoful: 'cartof',
  cartofi: 'cartof',
  cartofii: 'cartof',
  ceapa: 'ceap',
  cepe: 'ceap',
  cepele: 'ceap',
  ceap: 'ceap',
  castravete: 'castravet',
  castravetele: 'castravet',
  castraveti: 'castravet',
  castravetii: 'castravet',
  castravet: 'castravet',
  piersica: 'piersic',
  piersici: 'piersic',
  piersicile: 'piersic',
  piersic: 'piersic',
  capsuna: 'capsun',
  capsuni: 'capsun',
  capsune: 'capsun',
  capsunile: 'capsun',
  capsunele: 'capsun',
  capsun: 'capsun',
  para: 'par',
  pere: 'par',
  perele: 'par',
  par: 'par',
  // Alte fructe și legume uzuale în limba română
  afina: 'afin',
  afine: 'afin',
  afinele: 'afin',
  afin: 'afin',
  avocado: 'avocado',
  pruna: 'prun',
  prune: 'prun',
  prunele: 'prun',
  prun: 'prun',
  caisa: 'cais',
  caise: 'cais',
  caisele: 'cais',
  cais: 'cais',
  ciuperca: 'ciuperc',
  ciuperci: 'ciuperc',
  ciupercile: 'ciuperc',
  ciuperc: 'ciuperc',
  vanata: 'vinat',
  vinete: 'vinat',
  vinetele: 'vinat',
  vinat: 'vinat',
  dovlecel: 'dovlecel',
  dovlecei: 'dovlecel',
  dovleceii: 'dovlecel',
  dovleac: 'dovleac',
  dovleci: 'dovleac',
  ridiche: 'ridich',
  ridichi: 'ridich',
  ridichile: 'ridich',
  ridich: 'ridich',
  strugure: 'strugur',
  struguri: 'strugur',
  strugurii: 'strugur',
  strugur: 'strugur',
  mandarina: 'mandarin',
  mandarine: 'mandarin',
  mandarinele: 'mandarin',
  mandarin: 'mandarin',
  clementina: 'clementin',
  clementine: 'clementin',
  clementinele: 'clementin',
  clementin: 'clementin',
  nectarina: 'nectarin',
  nectarine: 'nectarin',
  nectarinele: 'nectarin',
  nectarin: 'nectarin',
  pepene: 'pepen',
  pepeni: 'pepen',
  pepenii: 'pepen',
  pepen: 'pepen',
  zmeura: 'zmeur',
  zmeur: 'zmeur',
  mura: 'mur',
  mure: 'mur',
  murele: 'mur',
  mur: 'mur',
  visina: 'visin',
  visine: 'visin',
  visinele: 'visin',
  visin: 'visin',
  cireasa: 'cires',
  cirese: 'cires',
  ciresele: 'cires',
  cires: 'cires',
  gutui: 'gutui',
  gutuie: 'gutui',
  gutuia: 'gutui',
  smochina: 'smochin',
  smochine: 'smochin',
  smochin: 'smochin',
  rodie: 'rodi',
  rodii: 'rodi',
  rodi: 'rodi',
  ananas: 'ananas',
  ananasi: 'ananas',
  mango: 'mango',
  kiwi: 'kiwi',
  pomelo: 'pomelo',
  grapefruit: 'grapefruit',
  grepfrut: 'grapefruit',
  lime: 'lime',
  limeta: 'lime',
  limete: 'lime',
  morcov: 'morcov',
  morcovi: 'morcov',
  morcovii: 'morcov',
  ardei: 'ardei',
  ardeiul: 'ardei',
  ardeii: 'ardei',
  usturoi: 'usturoi',
  usturoiul: 'usturoi',
  salata: 'salat',
  salate: 'salat',
  salat: 'salat',
  varza: 'varz',
  verze: 'varz',
  varz: 'varz',
  conopida: 'conopid',
  conopide: 'conopid',
  conopid: 'conopid',
  broccoli: 'broccoli',
  brocoli: 'broccoli',
  gulie: 'guli',
  gulii: 'guli',
  guli: 'guli',
  sfecla: 'sfecl',
  sfecle: 'sfecl',
  sfecl: 'sfecl',
  telina: 'telin',
  teline: 'telin',
  telin: 'telin',
  pastarnac: 'pastarnac',
  pastarnaci: 'pastarnac',
  patrunjel: 'patrunjel',
  marar: 'marar',
  leustean: 'leustean',
  spanac: 'spanac',
  sparanghel: 'sparanghel',
  ghimbir: 'ghimbir',
  praz: 'praz',
  fasole: 'fasol',
  fasol: 'fasol',
  mazare: 'mazar',
  mazar: 'mazar',
  porumb: 'porumb',
  ou: 'ou',
  oua: 'ou',
  ouale: 'ou',
};

/**
 * Normalizează un cuvânt în limba română la rădăcina sa (stem), eliminând diacriticele,
 * mapând formele neregulate singular/plural (ex. mar/mere -> mar, banana/banane -> banan,
 * lamaie/lamai -> lamai, portocala/portocale -> portocal, rosie/rosii -> rosi, para/pere -> par)
 * și tăind sufixele uzuale de singular/plural (`ă`, `a`, `e`, `i`, `ii`, `uri`, `le`, `ul`).
 */
export function normalizeRomanianWordStem(rawWord: string): string {
  const clean = normalizeCompareText(rawWord).replace(/[^a-z0-9]/g, '');
  if (!clean) return '';
  if (RO_IRREGULAR_STEMS[clean]) {
    return RO_IRREGULAR_STEMS[clean];
  }
  if (clean.length <= 3) {
    return clean;
  }
  const suffixes = [
    'urile',
    'elor',
    'ilor',
    'iile',
    'uri',
    'ile',
    'lor',
    'le',
    'ul',
    'ii',
    'ie',
    'ia',
    'ea',
    'a',
    'e',
    'i',
  ];
  for (const suffix of suffixes) {
    if (clean.endsWith(suffix) && clean.length - suffix.length >= 3) {
      const stripped = clean.slice(0, clean.length - suffix.length);
      return RO_IRREGULAR_STEMS[stripped] ?? stripped;
    }
  }
  return clean;
}

/**
 * Normalizează un query sau titlu de produs în limba română prin aplicarea `normalizeRomanianWordStem`
 * pe fiecare token relevant.
 */
export function normalizeRomanianSearchQuery(text: string): string {
  return normalizeCompareText(text)
    .split(/\s+/)
    .map((token) => normalizeRomanianWordStem(token))
    .filter(Boolean)
    .join(' ');
}

export function normalizeRomanianProduceStem(token: string): string {
  return normalizeRomanianWordStem(token);
}

function tokenStemMatches(queryToken: string, candidateToken: string): boolean {
  if (candidateToken === queryToken) return true;
  return normalizeRomanianWordStem(queryToken) === normalizeRomanianWordStem(candidateToken);
}

const FRESH_PRODUCE_CANONICAL_METADATA: Record<
  string,
  { title: string; searchPatterns: string[] }
> = {
  banan: { title: 'Banane', searchPatterns: ['banan'] },
  mar: { title: 'Mere', searchPatterns: ['mere', 'mar '] },
  lamai: { title: 'Lămâi', searchPatterns: ['lamai'] },
  portocal: { title: 'Portocale', searchPatterns: ['portocal'] },
  rosi: { title: 'Roșii', searchPatterns: ['rosii', 'rosie', 'tomate'] },
  cartof: { title: 'Cartofi albi / galbeni', searchPatterns: ['cartofi albi', 'cartofi', 'cartof'] },
  cartofi_rosii: { title: 'Cartofi roșii', searchPatterns: ['cartofi rosii', 'cartof rosu', 'cartofi_rosii'] },
  cartofi_dulci: { title: 'Cartofi dulci', searchPatterns: ['cartofi dulci', 'cartof dulce', 'batata'] },
  ceap: { title: 'Ceapă galbenă', searchPatterns: ['ceapa galbena', 'ceap', 'cepe'] },
  ceapa_rosie: { title: 'Ceapă roșie', searchPatterns: ['ceapa rosie', 'cepe rosii', 'ceapa_rosie'] },
  ceapa_verde: { title: 'Ceapă verde', searchPatterns: ['ceapa verde', 'cepe verzi', 'ceapa_verde'] },
  castravet: { title: 'Castraveți', searchPatterns: ['castravet'] },
  piersic: { title: 'Piersici', searchPatterns: ['piersic'] },
  capsun: { title: 'Căpșuni', searchPatterns: ['capsun'] },
  par: { title: 'Pere', searchPatterns: ['pere', 'para '] },
  afin: { title: 'Afine', searchPatterns: ['afin'] },
  avocado: { title: 'Avocado', searchPatterns: ['avocado'] },
  prun: { title: 'Prune', searchPatterns: ['prun'] },
  cais: { title: 'Caise', searchPatterns: ['cais'] },
  ciuperc: { title: 'Ciuperci', searchPatterns: ['ciuperc', 'champignon'] },
  vinat: { title: 'Vinete', searchPatterns: ['vinet', 'vanata'] },
  dovlecel: { title: 'Dovlecei', searchPatterns: ['dovlece'] },
  ridich: { title: 'Ridichi', searchPatterns: ['ridich'] },
  strugur: { title: 'Struguri', searchPatterns: ['strugur'] },
  mandarin: { title: 'Mandarine', searchPatterns: ['mandarin'] },
  clementin: { title: 'Clementine', searchPatterns: ['clementin'] },
  nectarin: { title: 'Nectarine', searchPatterns: ['nectarin'] },
  pepen: { title: 'Pepene', searchPatterns: ['pepen'] },
  zmeur: { title: 'Zmeură', searchPatterns: ['zmeur'] },
  mur: { title: 'Mure', searchPatterns: ['mure'] },
  visin: { title: 'Vișine', searchPatterns: ['visin'] },
  cires: { title: 'Cireșe', searchPatterns: ['cires'] },
  rodi: { title: 'Rodii', searchPatterns: ['rodii', 'rodie'] },
  ananas: { title: 'Ananas', searchPatterns: ['ananas'] },
  mango: { title: 'Mango', searchPatterns: ['mango'] },
  kiwi: { title: 'Kiwi', searchPatterns: ['kiwi'] },
  pomelo: { title: 'Pomelo', searchPatterns: ['pomelo'] },
  grapefruit: { title: 'Grapefruit', searchPatterns: ['grapefruit', 'grepfrut'] },
  lime: { title: 'Lime', searchPatterns: ['lime', 'limet'] },
  morcov: { title: 'Morcovi', searchPatterns: ['morcov'] },
  ardei: { title: 'Ardei gras', searchPatterns: ['ardei gras', 'ardei'] },
  ardei_capia: { title: 'Ardei kapia', searchPatterns: ['ardei capia', 'ardei kapia', 'capia', 'kapia'] },
  ardei_iute: { title: 'Ardei iute', searchPatterns: ['ardei iute', 'chili', 'jalapeno'] },
  usturoi: { title: 'Usturoi', searchPatterns: ['usturoi'] },
  salat: { title: 'Salată verde', searchPatterns: ['salata'] },
  varz: { title: 'Varză albă', searchPatterns: ['varza alba', 'varza'] },
  varza_rosie: { title: 'Varză roșie', searchPatterns: ['varza rosie', 'varza_rosie'] },
  conopid: { title: 'Conopidă', searchPatterns: ['conopid'] },
  broccoli: { title: 'Broccoli', searchPatterns: ['broccol', 'brocol'] },
  guli: { title: 'Gulii', searchPatterns: ['gulii', 'gulie'] },
  sfecl: { title: 'Sfeclă roșie', searchPatterns: ['sfecl'] },
  telin: { title: 'Țelină', searchPatterns: ['telin'] },
  pastarnac: { title: 'Păstârnac', searchPatterns: ['pastarnac'] },
  patrunjel: { title: 'Pătrunjel', searchPatterns: ['patrunjel'] },
  marar: { title: 'Mărar', searchPatterns: ['marar'] },
  leustean: { title: 'Leuștean', searchPatterns: ['leustean'] },
  spanac: { title: 'Spanac', searchPatterns: ['spanac'] },
  sparanghel: { title: 'Sparanghel', searchPatterns: ['sparanghel'] },
  ghimbir: { title: 'Ghimbir', searchPatterns: ['ghimbir'] },
  praz: { title: 'Praz', searchPatterns: ['praz'] },
};

/**
 * Cuvinte de umplutură, branduri de fructe/legume, țări de origine, ambalaje și soiuri
 * care se ignoră la gruparea generică (Brand-Agnostic) între magazine pentru Fructe și Legume.
 */
const FRESH_PRODUCE_FILLER_WORDS = new Set([
  // Termeni generici de comercializare și calitate ceruți explicit
  'vrac',
  'import',
  'calitatea',
  'calitate',
  'cal',
  'i',
  'ii',
  'extra',
  'premium',
  'standard',
  'select',
  'selectate',
  'proaspat',
  'proaspata',
  'proaspete',
  'proaspeti',
  'romania',
  'romanesc',
  'romaneasca',
  'romanesti',
  'autohton',
  'autohtona',
  'autohtone',
  'local',
  'locala',
  'locale',
  'chiquita',
  'dole',
  'bonanza',
  'derby',
  'eco',
  'bio',
  'organic',
  'organica',
  'organice',
  'ecologic',
  'ecologica',
  'ecologice',
  // Mărci proprii și etichete de supermarket pentru raionul Piață / Fructe & Legume
  'piata',
  'lidl',
  'filiera',
  'auchan',
  'gusturi',
  'mega',
  'image',
  'camara',
  'noastra',
  'kbio',
  'k',
  'natures',
  'nature',
  'promise',
  'gradena',
  'livada',
  'amintiri',
  'voinesti',
  'dambovita',
  'carrefour',
  'drag',
  'simpl',
  '365',
  'delhaize',
  'sezamo',
  'freshful',
  'kaufland',
  'penny',
  'profi',
  'sanaterra',
  'solaris',
  // Origini geografice frecvente pe etichetele de fructe și legume
  'italia',
  'spania',
  'grecia',
  'turcia',
  'polonia',
  'olanda',
  'ecuador',
  'costa',
  'rica',
  'columbia',
  'peru',
  'chile',
  'africa',
  'sud',
  'egipt',
  'maroc',
  'israel',
  'ungaria',
  'franta',
  'germania',
  'austria',
  'moldova',
  ' Cipru',
  'cipru',
  'argentina',
  'brazilia',
  'mexic',
  // Ambalare, unități și prepoziții
  'caserola',
  'punga',
  'plasa',
  'saculet',
  'sac',
  'cutie',
  'tava',
  'tavita',
  'legatura',
  'fir',
  'fire',
  'bucata',
  'bucati',
  'buc',
  'pcs',
  'kg',
  'kilogram',
  'kilograme',
  'g',
  'gr',
  'grame',
  'per',
  'cca',
  'aprox',
  'minim',
  'min',
  'maxim',
  'max',
  'ciorchine',
  'ready',
  'to',
  'eat',
  'rte',
  'coapte',
  'copt',
  'coapta',
  'crud',
  'cruda',
  'crude',
  'spalate',
  'spalat',
  'spalata',
  'nespalate',
  'netratate',
  'netratat',
  'netratata',
  'fara',
  'samburi',
  'seminte',
  'coaja',
  'soi',
  'soiul',
  'calibru',
  'calibrul',
  'marime',
  'marimea',
  'mare',
  'mari',
  'mic',
  'mica',
  'mici',
  'mediu',
  'medie',
  'medii',
  'baby',
  'mini',
  'jumbo',
  'gigant',
  'de',
  'la',
  'cu',
  'si',
  'din',
  'in',
  'pe',
  'pentru',
  'suc', // doar în sintagma „portocale pentru suc”, deoarece „suc de ...” e filtrat de PROCESSED_NON_FRESH_PRODUCE_RE
  'dulce',
  'dulci',
  'acrisor',
  'acrisoare',
  'suculent',
  'suculenta',
  'suculente',
  'zemos',
  'zemoasa',
  'zemoase',
  'crocant',
  'crocanta',
  'crocante',
  'aromate',
  'aromat',
  'aromata',
  'proaspat',
  'gradina',
  'camp',
  'solar',
  'sera',
  // Soiuri și culori uzuale pentru fructe și legume (mere, pere, citrice, roșii, cartofi, ceapă, struguri, ardei)
  'golden',
  'delicious',
  'delicios',
  'red',
  'idared',
  'florina',
  'jonathan',
  'ionatan',
  'gala',
  'royal',
  'granny',
  'smith',
  'pink',
  'lady',
  'braeburn',
  'fuji',
  'starkrimson',
  'crimson',
  'mutsu',
  'pinova',
  'topaz',
  'generos',
  'abate',
  'fetel',
  'conference',
  'williams',
  'packham',
  'santa',
  'maria',
  'lucas',
  'kaiser',
  'rocha',
  'forelle',
  'hass',
  'fuerte',
  'meyer',
  'verna',
  'eureka',
  'navelina',
  'valencia',
  'tarocco',
  'salustiana',
  'lane',
  'late',
  'washington',
  'cherry',
  'cocktail',
  'roma',
  'san',
  'marzano',
  'prunisoare',
  'inimioara',
  'olar',
  'capia',
  'kapia',
  'gras',
  'grasi',
  'california',
  'bianca',
  'iute',
  'iuti',
  'jalapeno',
  'habanero',
  'padron',
  'ramiro',
  'cornishon',
  'cornison',
  'fabio',
  'salat',
  'iceberg',
  'romana',
  'endivia',
  'lollo',
  'rosso',
  'bionda',
  'cristal',
  'champignon',
  'pleurotus',
  'portobello',
  'brune',
  'brun',
  'bruna',
  'alb',
  'alba',
  'albe',
  'albi',
  'galben',
  'galbena',
  'galbene',
  'galbeni',
  'verde',
  'verzi',
  'rosu',
  'rosie',
  'rosii',
  'negru',
  'neagra',
  'negre',
  'negri',
  'mov',
  'roz',
  ' roz ',
  'vinetiu',
  'auriu',
  'aurii',
  'timpuriu',
  'timpurii',
  'noi',
  'noua',
  'nou',
  'vechi',
  'uscata',
  'uscat',
  'legatura',
  'copti',
  'plat',
  'plata',
  'plati',
  'paraguayo',
  'afuz',
  'ali',
  'muscat',
  'hamburg',
  'italia',
  'moldova',
  'cardinal',
  'victoria',
]);

const NON_PRODUCE_CATEGORY_RE =
  /\b(lactat\w*|branz\w*|iaurt\w*|mezel\w*|carn\w*|peste|bautur\w*|suc\w*|alcool\w*|vin\w*|ber\w*|dulciur\w*|ciocolat\w*|biscuit\w*|chips\w*|snack\w*|inghetat\w*|congelat\w*|conserv\w*|bacani\w*|paste|orez|faina|ulei\w*|condiment\w*|sos\w*|cafea|ceai|panificati\w*|pain\w*|brutari\w*|cosmetic\w*|igien\w*|curateni\w*|detergent\w*|animale|pet\w*|bebe\w*|copi\w*|mama)\b/;

const PRODUCE_CATEGORY_RE =
  /\b(fruct\w*|legum\w*|piat\w*|proaspat\w*|proaspet\w*|zarzavat\w*|verdeat\w*|verdet\w*|citric\w*)\b/;

/**
 * Extrage cheia generică (Brand-Agnostic) pentru un fruct sau o legumă proaspătă de bază
 * (ex. `'banan'`, `'mar'`, `'lamai'`, `'portocal'`, `'rosi'`, `'cartof'`, `'ceap'`, `'castravet'`,
 * `'piersic'`, `'capsun'`, `'par'`, `'afin'`, `'avocado'`).
 * Returnează `null` pentru produse ambalate din alte categorii, produse procesate, sucuri,
 * batoane sau mixuri de mai multe fructe/legume diferite.
 */
export function extractFreshProduceGenericKey(
  input:
    | (Pick<CatalogProductProfile, 'canonical_name'> &
        Partial<
          Pick<
            CatalogProductProfile,
            'brand' | 'package_size' | 'category' | 'subcategory'
          >
        >)
    | string
): string | null {
  const canonicalName = typeof input === 'string' ? input : input.canonical_name;
  const brand = typeof input === 'string' ? null : input.brand;
  const packageSize = typeof input === 'string' ? null : input.package_size;
  const category = typeof input === 'string' ? null : input.category;
  const subcategory = typeof input === 'string' ? null : input.subcategory;

  const normName = normalizeCompareText(canonicalName);
  if (!normName) return null;

  // Excludem imediat produsele procesate (sucuri, piureuri, batoane, iaurturi, gemuri, conserve etc.)
  if (isProcessedNonFreshProduce(canonicalName)) {
    return null;
  }

  // Excludem produsele cu volum lichid (ml, cl, l, litri)
  const combinedText = `${normName} ${normalizeCompareText(packageSize)}`;
  if (/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|litri|litru)\b/.test(combinedText)) {
    return null;
  }

  // Dacă produsul are o categorie explicită care NU este Fructe/Legume (ex. Lactate, Dulciuri, Băcănie), îl excludem
  const catText = normalizeCompareText(`${category ?? ''} ${subcategory ?? ''}`);
  if (catText && NON_PRODUCE_CATEGORY_RE.test(catText) && !PRODUCE_CATEGORY_RE.test(catText)) {
    return null;
  }

  // Subtipuri majore de legume cu diferențe critice de preț și utilizare culinară
  // (Ceapă roșie vs Ceapă galbenă vs Ceapă verde, Cartofi roșii vs albi vs dulci, Varză roșie vs albă, Ardei iute vs capia vs gras)
  if (/\b(ceapa|cepe)\b/.test(normName)) {
    if (/\b(rosi|rosie|rosii|rosu)\b/.test(normName)) return 'ceapa_rosie';
    if (/\b(verde|verzi|legatura|legaturi)\b/.test(normName)) return 'ceapa_verde';
    return 'ceap';
  }
  if (/\b(cartof|cartofi)\b/.test(normName)) {
    if (/\b(dulce|dulci|batat\w*)\b/.test(normName)) return 'cartofi_dulci';
    if (/\b(rosi|rosu|rosii|rosie)\b/.test(normName)) return 'cartofi_rosii';
    return 'cartof';
  }
  if (/\b(varza|verze)\b/.test(normName)) {
    if (/\b(rosi|rosie|rosii|rosu)\b/.test(normName)) return 'varza_rosie';
    return 'varz';
  }
  if (/\b(ardei)\b/.test(normName)) {
    if (/\b(iute|iuti|chili|jalapeno)\b/.test(normName)) return 'ardei_iute';
    if (/\b(capia|kapia)\b/.test(normName)) return 'ardei_capia';
    return 'ardei';
  }

  const brandTokens = new Set(
    normalizeCompareText(brand)
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length >= 2)
  );

  // Eliminăm cantitățile numerice (ex. "1 kg", "500 g", "4 buc", "minim 1kg maxim 1.3kg", "cca 200 g")
  const strippedNumbers = normName
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|grame|kilograme|buc|bucati|pcs|x|cal)?\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ');

  const rawTokens = strippedNumbers
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ''))
    .filter((w) => w.length >= 2);

  if (rawTokens.length === 0) return null;

  const detectedProduceStems = new Set<string>();
  const unknownWords: string[] = [];

  for (const token of rawTokens) {
    const stem = normalizeRomanianWordStem(token);

    if (FRESH_PRODUCE_CANONICAL_METADATA[stem]) {
      detectedProduceStems.add(stem);
      continue;
    }

    if (
      FRESH_PRODUCE_FILLER_WORDS.has(token) ||
      FRESH_PRODUCE_FILLER_WORDS.has(stem) ||
      brandTokens.has(token) ||
      brandTokens.has(stem)
    ) {
      continue;
    }

    unknownWords.push(token);
  }

  // Dacă există cuvinte necunoscute care nu sunt nici fructul/leguma, nici filler/brand/soi,
  // nu grupăm generic (ex. „Salată cu ton”, „Tartă cu mere”, „Semințe de dovleac”).
  if (unknownWords.length > 0) {
    return null;
  }

  // Dezambiguizare: „rosii” / „rosie” ca adjectiv de culoare lângă alt fruct/legumă
  // (ex. „Mere roșii”, „Ceapă roșie”, „Cartofi roșii”, „Ardei roșu”, „Varză roșie”, „Struguri roșii”, „Sfeclă roșie”, „Banane roșii”, „Grapefruit roșu”)
  if (detectedProduceStems.size === 2 && detectedProduceStems.has('rosi')) {
    detectedProduceStems.delete('rosi');
  }
  // Dezambiguizare: „Salată de castraveți” sau „Castraveți pentru salată” -> castraveți
  if (detectedProduceStems.size === 2 && detectedProduceStems.has('salat') && detectedProduceStems.has('castravet')) {
    detectedProduceStems.delete('salat');
  }

  // Grupăm doar produsele cu un singur fruct/legumă de bază (nu mixuri de legume/fructe)
  if (detectedProduceStems.size !== 1) {
    return null;
  }

  return Array.from(detectedProduceStems)[0];
}

export function getFreshProduceCanonicalTitle(produceKey: string): string {
  return FRESH_PRODUCE_CANONICAL_METADATA[produceKey]?.title ?? produceKey;
}

export function getFreshProduceSearchPatterns(produceKey: string): string[] {
  return FRESH_PRODUCE_CANONICAL_METADATA[produceKey]?.searchPatterns ?? [produceKey];
}

/**
 * Verifică dacă un profil sau titlu de produs reprezintă un fruct sau o legumă proaspătă
 * (inclusiv cele ambalate sub branduri de supermarket precum „Gusturi Românești”, „Filiera Auchan”, „Piața Lidl”).
 * Fructele și legumele proaspete nu trebuie tratate niciodată ca „mărci proprii de supermarket” (private label swaps).
 */
export function isFreshProduceItemProfile(
  profile?:
    | (Pick<CatalogProductProfile, 'canonical_name'> &
        Partial<
          Pick<
            CatalogProductProfile,
            | 'brand'
            | 'package_size'
            | 'category'
            | 'subcategory'
            | 'attributes'
          >
        >)
    | string
    | null
): boolean {
  if (!profile) return false;
  const canonicalName = typeof profile === 'string' ? profile : profile.canonical_name;
  if (!canonicalName) return false;

  // 1. Verificare prin extractorul generic de fructe/legume proaspete
  if (extractFreshProduceGenericKey(profile)) {
    return true;
  }

  // 2. Verificare prin categoria din catalog (dacă e fructe/legume și nu e procesat)
  if (typeof profile !== 'string') {
    const catCombined = `${profile.category ?? ''} ${profile.subcategory ?? ''}`;
    const normCat = normalizeCompareText(catCombined);
    if (
      normCat &&
      PRODUCE_CATEGORY_RE.test(normCat) &&
      !NON_PRODUCE_CATEGORY_RE.test(normCat) &&
      !isProcessedNonFreshProduce(canonicalName)
    ) {
      return true;
    }
  }

  // 3. Verificare pe cuvinte cheie clare de fructe și legume proaspete în titlu
  const normTitle = normalizeCompareText(canonicalName);
  if (
    !isProcessedNonFreshProduce(canonicalName) &&
    /\b(mere|mar|banane|banana|rosii|rosie|cartofi|cartof|ceapa|castraveti|castravete|morcovi|morcov|ardei|salata|varza|lamai|lamaie|portocale|portocala|mandarine|clementine|avocado|struguri|ciuperci|usturoi|dovlecei|vinete|patrunjel|marar|leustean|spanac|ridichi|capsuni|afine|zmeura|piersici|caise|prune|pere|para|pepene|conopida|broccoli|sfecla|telina|praz)\b/.test(
      normTitle
    )
  ) {
    return true;
  }

  return false;
}

export type ProductSellRuleEstimate = {
  sellMode: 'per_kg' | 'per_liter' | 'per_buc' | 'per_unit';
  sellRuleBadge: string;
  estimatedUnitLine: string | null;
  estimatedPerKg: number | null;
  estimatedPerLiter?: number | null;
  estimatedPerBuc: number | null;
};

function parseVolumeLitersFromText(text: string): {
  liters: number | null;
  isApprox: boolean;
} {
  const clean = normalizeCompareText(text.replace(/(\d),(\d)/g, '$1.$2'));
  if (!clean) return { liters: null, isApprox: false };

  // Multi-pack: 6 x 330ml, 4 x 0.5L, 2 x 1.5L, 6 doze x 0.33l
  const multiMatch = clean.match(
    /(\d+)\s*(?:doze|sticle|buc|pachete|cutii)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(l|litri|litru|ml|cl)\b/
  );
  if (multiMatch) {
    const count = Number(multiMatch[1]);
    const size = Number(multiMatch[2]);
    const unit = multiMatch[3].toLowerCase();
    if (Number.isFinite(count) && Number.isFinite(size) && count > 0 && size > 0) {
      const perUnitLiters = unit.startsWith('l') ? size : unit === 'cl' ? size / 100 : size / 1000;
      return { liters: count * perUnitLiters, isApprox: false };
    }
  }

  // Single bottle/can: 500ml, 1L, 0.75L, 2L, 330ml, 250ml sau coduri interne PLA0.75LSTSGR
  const singleMatch =
    clean.match(/\b(\d+(?:\.\d+)?)\s*(l|litri|litru|ml|cl)\b/) ||
    clean.match(/(?:^|[^0-9.])(\d+(?:\.\d+)?)\s*(l|ml|cl)(?:[^a-z0-9]|$)/i);
  if (singleMatch) {
    const size = Number(singleMatch[1]);
    const unit = singleMatch[2].toLowerCase();
    if (Number.isFinite(size) && size > 0) {
      const liters = unit.startsWith('l') ? size : unit === 'cl' ? size / 100 : size / 1000;
      return {
        liters,
        isApprox: /\b(cca|minim|min)\b|\+/.test(clean),
      };
    }
  }

  return { liters: null, isApprox: false };
}

function parseWeightGramsFromText(text: string): {
  grams: number | null;
  isApprox: boolean;
  isRangeMidpoint: boolean;
} {
  const clean = normalizeCompareText(text.replace(/(\d),(\d)/g, '$1.$2'));
  if (!clean) return { grams: null, isApprox: false, isRangeMidpoint: false };

  const toGrams = (numStr: string, unitStr: string) => {
    const val = Number(numStr);
    if (!Number.isFinite(val) || val <= 0) return null;
    const u = unitStr.toLowerCase();
    return u.startsWith('k') ? val * 1000 : val;
  };

  // Format Freshful: „minim 700g maxim 1kg” -> media intervalului estimează exact prețul/kg real
  const rangeMatch = clean.match(
    /minim\s+(\d+(?:\.\d+)?)\s*(kg|g|gr)\s+maxim\s+(\d+(?:\.\d+)?)\s*(kg|g|gr)\b/
  );
  if (rangeMatch) {
    const gMin = toGrams(rangeMatch[1], rangeMatch[2]);
    const gMax = toGrams(rangeMatch[3], rangeMatch[4]);
    if (gMin && gMax && gMax >= gMin) {
      return { grams: (gMin + gMax) / 2, isApprox: true, isRangeMidpoint: true };
    }
  }

  const singleMatch = clean.match(/\b(\d+(?:\.\d+)?)\s*(kg|g|gr)\b/);
  if (singleMatch) {
    const g = toGrams(singleMatch[1], singleMatch[2]);
    if (g) {
      return {
        grams: g,
        isApprox: /\b(cca|minim|min)\b|\+/.test(clean),
        isRangeMidpoint: false,
      };
    }
  }
  return { grams: null, isApprox: false, isRangeMidpoint: false };
}

/**
 * Anticipează regula de vânzare (per kg vs per bucată vs pachet N buc.) și prețul unitar estimat
 * pentru afișare imediată pe cardurile din Caută și comparația per magazin (Sezamo, Freshful, Lidl, Kaufland etc.).
 */
export function estimateProductUnitPricing(
  price: number | null | undefined,
  packageSize: string | null | undefined,
  canonicalName: string | null | undefined,
  dbUnitPrice?: number | null,
  dbUnitLabel?: string | null
): ProductSellRuleEstimate {
  const pkgClean = normalizeCompareText(String(packageSize ?? '').replace(/(\d),(\d)/g, '$1.$2'));
  const nameClean = normalizeCompareText(String(canonicalName ?? '').replace(/(\d),(\d)/g, '$1.$2'));
  const combined = `${nameClean} ${pkgClean}`.trim();
  const safePrice = price != null && Number.isFinite(price) && price > 0 ? price : null;

  const packMatch =
    nameClean.match(/\bpachet\s*(?:de\s*)?(\d+)\s*buc\w*/) ||
    combined.match(/\b(\d+)\s*(?:bucati|buc|pcs)\b/);
  const explicitCount = packMatch ? Number(packMatch[1]) : 1;
  const isExplicitPiecePkg =
    /\b(buc|bucata|bucati|pcs|per\s*buc|caserola|per\s*caserola|legatura|per\s*legatura)\b/.test(
      pkgClean
    ) ||
    (!pkgClean && /\b(buc|bucata|bucati|pcs)\b/.test(nameClean));
  const pieceNoun = /\bcaserol\w*\b/.test(pkgClean)
    ? 'caserolă'
    : /\blegatur\w*\b/.test(pkgClean)
      ? 'leg.'
      : 'buc';
  const pieceBadgeSingle =
    pieceNoun === 'caserolă'
      ? 'La caserolă'
      : pieceNoun === 'leg.'
        ? 'La legătură'
        : 'La bucată';
  const isExplicitPerKgPkg = /(?:^|\s)(?:per\s*kg|1\s*kg|1000\s*g)(?:\s|$)/.test(pkgClean);

  const weightInfo = parseWeightGramsFromText(`${canonicalName ?? ''} ${packageSize ?? ''}`);

  if (isExplicitPiecePkg || explicitCount > 1) {
    const pieceCount = explicitCount > 1 ? explicitCount : 1;
    const perBuc = safePrice !== null ? Math.round((safePrice / pieceCount) * 100) / 100 : null;
    const perKg =
      safePrice !== null && weightInfo.grams && pieceCount === 1
        ? Math.round((safePrice / (weightInfo.grams / 1000)) * 100) / 100
        : null;

    const badge = pieceCount > 1 ? `Pachet ${pieceCount} buc.` : pieceBadgeSingle;
    let line: string | null = null;
    if (perBuc !== null) {
      line =
        pieceCount > 1
          ? `${pieceCount} buc. · ${perBuc.toFixed(2)} lei/buc`
          : perKg !== null
            ? `${pieceBadgeSingle} · ~${perKg.toFixed(2)} lei/kg`
            : `${pieceBadgeSingle} · ${perBuc.toFixed(2)} lei/${pieceNoun}`;
    }
    return {
      sellMode: 'per_buc',
      sellRuleBadge: badge,
      estimatedUnitLine: line,
      estimatedPerKg: perKg,
      estimatedPerBuc: perBuc,
    };
  }

  const isLiterDbUnit =
    dbUnitPrice != null &&
    Number.isFinite(dbUnitPrice) &&
    dbUnitPrice > 0 &&
    Boolean(
      dbUnitLabel &&
        /(?:ron|lei)\s*\/\s*(?:l\b|litru)/i.test(dbUnitLabel)
    );
  if (isLiterDbUnit) {
    const lRounded = Math.round(dbUnitPrice! * 100) / 100;
    return {
      sellMode: 'per_liter',
      sellRuleBadge: 'La litru',
      estimatedUnitLine: `${lRounded.toFixed(2)} lei/L`,
      estimatedPerKg: null,
      estimatedPerLiter: lRounded,
      estimatedPerBuc: null,
    };
  }

  const isKgDbUnit =
    dbUnitPrice != null &&
    Number.isFinite(dbUnitPrice) &&
    dbUnitPrice > 0 &&
    Boolean(
      dbUnitLabel &&
        /(?:ron|lei)\s*\/\s*kg/i.test(dbUnitLabel)
    );
  if (isKgDbUnit) {
    const kgRounded = Math.round(dbUnitPrice! * 100) / 100;
    const prefix = weightInfo.isApprox ? '~' : '';
    return {
      sellMode: 'per_kg',
      sellRuleBadge: 'La kg',
      estimatedUnitLine: `${prefix}${kgRounded.toFixed(2)} lei/kg`,
      estimatedPerKg: kgRounded,
      estimatedPerLiter: null,
      estimatedPerBuc: null,
    };
  }

  // Detectare volum lichide din text/gramaj (lapte, ulei, apă, bere, suc, vin, oțet)
  const volumeInfo = parseVolumeLitersFromText(`${canonicalName ?? ''} ${packageSize ?? ''}`);
  if (safePrice !== null && volumeInfo.liters && volumeInfo.liters > 0) {
    const perLiter = Math.round((safePrice / volumeInfo.liters) * 100) / 100;
    const prefix = volumeInfo.isApprox || volumeInfo.liters !== 1 ? '~' : '';
    return {
      sellMode: 'per_liter',
      sellRuleBadge: 'La litru',
      estimatedUnitLine: `${prefix}${perLiter.toFixed(2)} lei/L`,
      estimatedPerKg: null,
      estimatedPerLiter: perLiter,
      estimatedPerBuc: null,
    };
  }

  if (isExplicitPerKgPkg && safePrice !== null) {
    return {
      sellMode: 'per_kg',
      sellRuleBadge: 'La kg',
      estimatedUnitLine: `${safePrice.toFixed(2)} lei/kg`,
      estimatedPerKg: safePrice,
      estimatedPerBuc: null,
    };
  }

  if (safePrice !== null && weightInfo.grams && weightInfo.grams >= 80) {
    const perKg = Math.round((safePrice / (weightInfo.grams / 1000)) * 100) / 100;
    const prefix = weightInfo.isApprox || weightInfo.grams !== 1000 ? '~' : '';
    return {
      sellMode: 'per_kg',
      sellRuleBadge: 'La kg',
      estimatedUnitLine: `${prefix}${perKg.toFixed(2)} lei/kg`,
      estimatedPerKg: perKg,
      estimatedPerBuc: null,
    };
  }

  if (safePrice !== null && canonicalName && isFreshProduceItemProfile(canonicalName)) {
    const pKey = extractFreshProduceGenericKey(canonicalName);
    const isPiece =
      pKey === 'ceapa_verde' ||
      pKey === 'salat' ||
      pKey === 'avocado' ||
      pKey === 'ananas' ||
      pKey === 'mango' ||
      /\b(legatura|legaturi|leg|caserola|caserole|buc|bucata|bucati)\b/.test(combined);
    if (!isPiece) {
      return {
        sellMode: 'per_kg',
        sellRuleBadge: 'La kg',
        estimatedUnitLine: `${safePrice.toFixed(2)} lei/kg`,
        estimatedPerKg: safePrice,
        estimatedPerBuc: null,
      };
    }
  }

  return {
    sellMode: 'per_unit',
    sellRuleBadge: 'Per produs',
    estimatedUnitLine: null,
    estimatedPerKg: null,
    estimatedPerBuc: null,
  };
}

/**
 * Verifică dacă un produs din catalog corespunde unui termen generic căutat de utilizator
 * (ex. „Banane”, „Mere”, „Roșii”, „Lapte”), indiferent de brandul/firma care îl vinde,
 * excluzând derivatele procesate dacă utilizatorul nu le-a cerut explicit.
 */
export function matchesGenericTermCandidate(
  rawTerm: string,
  candidateName: string
): { matches: boolean; score: number } {
  // Disjuncție: dacă utilizatorul a căutat alternative ("sau" / "ori", ex: "File de somon sau păstrăv")
  if (/\b(?:sau|ori)\b/i.test(rawTerm)) {
    const parts = rawTerm
      .split(/\b(?:sau|ori)\b/i)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2);
    for (const part of parts) {
      const sub = matchesGenericTermCandidate(part, candidateName);
      if (sub.matches) return sub;
    }
    return { matches: false, score: 0 };
  }

  const qNorm = normalizeCompareText(rawTerm);
  const cNorm = normalizeCompareText(candidateName);
  if (!qNorm || !cNorm) return { matches: false, score: 0 };

  const userAskedProcessed = PROCESSED_NON_FRESH_PRODUCE_RE.test(qNorm);
  const candIsProcessed = PROCESSED_NON_FRESH_PRODUCE_RE.test(cNorm);
  if (!userAskedProcessed && candIsProcessed) {
    return { matches: false, score: 0 };
  }

  // Protecție strictă pentru alimente de bază împotriva snack-urilor și aromelor artificiale
  // Ex: "Unt" nu trebuie să potrivească popcorn cu unt, biscuiți cu unt, croissante, madlene sau cremă cu unt
  if (/\bunt\b/i.test(qNorm) && !/\b(?:unt\s+de\s+arahide|unt\s+de\s+cocos|untura)\b/i.test(qNorm)) {
    const isSnackOrConfectionery =
      /\b(popcorn|floricele|biscuit\w*|fursec\w*|croissant\w*|madlen\w*|foitaj|foietaj\w*|stickere|crema\s+de\s+(?:pastrav|somon|alune|arahide)|untura|unt\s+de\s+(?:arahide|cocos|shea|cacao)|caramele|bomboane|drops\w*|napolitan\w*)\b/i.test(
        cNorm
      );
    const isFlavoredUnt =
      /\b(?:aroma\s+de\s+unt|gust\s+de\s+unt)\b/i.test(cNorm) ||
      (/\bcu\s+unt\b/i.test(cNorm) && !/\bunt\s+(?:de\s+masa|\d+%)\b/i.test(cNorm));
    if (isSnackOrConfectionery || isFlavoredUnt) {
      return { matches: false, score: 0 };
    }
  }

  // Lapte nu trebuie să potrivească ciocolată cu lapte, biscuiți cu lapte etc.
  if (/\blapte\b/i.test(qNorm) && !/\bciocolata\s+cu\s+lapte\b/i.test(qNorm)) {
    if (/\b(ciocolata|biscuit\w*|prajitur\w*|baton|inghetata|gel\s+de\s+dus|sampon|crema\s+de\s+corp|lotiune)\b/i.test(cNorm)) {
      return { matches: false, score: 0 };
    }
  }

  // Ouă nu trebuie să potrivească Kinder cu surprize, paste cu ouă, pișcoturi, gofre, maioneză sau aparate/decorațiuni
  if (/\b(oua|ou)\b/i.test(qNorm) && !/\b(ciocolata|paste|taitei|taietei|fidea|biscuit\w*|piscot\w*|gofr\w*|maionez\w*|fierbator)\b/i.test(qNorm)) {
    if (
      /\b(kinder|ciocolata|jucarie|surpriza|drops\w*|paste|taitei|taietei|fidea|spaghete|macaroane|farfalle|pappardelle|tagliatelle|lasagna|galuste|noodles|biscuit\w*|piscot\w*|gofr\w*|waffl\w*|cozonac|chec|prajitur\w*|maionez\w*|fierbator|aparat|polistiren|vopsea|decor\w*|plastic|suport)\b/i.test(
        cNorm
      )
    ) {
      return { matches: false, score: 0 };
    }
  }

  // Ovăz / Fulgi de ovăz nu trebuie să potrivească biscuiți, batoane, iaurt, chifle, pâinici, piure bebe sau băuturi vegetale (decât dacă sunt cerute)
  if (
    /\bovaz\b/i.test(qNorm) &&
    !/\b(biscuit\w*|fursec\w*|baton|batoane|iaurt\w*|chifl\w*|paine|painic\w*|lipi\w*|piure|bautur\w*|lapte|barista|terci|porridge|gustare)\b/i.test(
      qNorm
    )
  ) {
    if (
      /\b(biscuit\w*|fursec\w*|prajitur\w*|cracker\w*|digestiv\w*|baton|batoane|mini-batoane|flapjack|iaurt\w*|activia|chifl\w*|paine|painic\w*|lipi\w*|felii|piure|hipp|gerber|organix|bautur\w*|lapte|alpro|barista|moma|vemondo|crema\s+tartinabila|desert)\b/i.test(
        cNorm
      )
    ) {
      return { matches: false, score: 0 };
    }
  }

  // Parmezan / Parmigiano / Pecorino nu trebuie să potrivească foietaje, rollitos, snacks sau chipsuri
  if (
    /\b(parmezan|parmigiano|pecorino|grana\s+padano)\b/i.test(qNorm) &&
    !/\b(rollitos|foietaj|placint\w*|chips\w*|snack\w*|biscuit\w*)\b/i.test(qNorm)
  ) {
    if (
      /\b(rollitos|foitaj|foietaj\w*|placint\w*|saratele|biscuit\w*|croissant\w*|pufuleti|chips\w*|snack\w*|pizza|sandwich|sandvis|gujoane)\b/i.test(
        cNorm
      )
    ) {
      return { matches: false, score: 0 };
    }
  }

  // Sare de bucătărie / sare fină / sare de mare nu trebuie să potrivească chipsuri, popcorn, arahide sau sare de lămâie
  if (
    /\bsare\b/i.test(qNorm) &&
    !/\b(?:chips\w*|arahide|alune|popcorn|rondele|seminte|fistic|lamaie)\b/i.test(qNorm)
  ) {
    if (
      /\b(chips\w*|popcorn|floricele|arahide|alune|fistic|seminte|rondele|covrigei|saratele|biscuit\w*|crackers|bastoane|nachos|tortilla|sare\s+de\s+lamaie)\b/i.test(
        cNorm
      )
    ) {
      return { matches: false, score: 0 };
    }
  }

  // Paste / Spaghete nu trebuie să potrivească pastă de dinți, pastă de tomate sau pastă tartinabilă
  if (
    /\b(paste|spaghete|spaghetti|penne|fusilli|macaroane|tagliatelle)\b/i.test(qNorm) &&
    !/\b(?:dinti|dinți|tomate|bulion|tartinabil\w*)\b/i.test(qNorm)
  ) {
    if (
      /\b(pasta\s+de\s+dinti|pasta\s+dinti|pasta\s+de\s+tomate|pasta\s+tomate|pasta\s+tartinabila|pasta\s+de\s+susan|crema\s+dinti)\b/i.test(
        cNorm
      )
    ) {
      return { matches: false, score: 0 };
    }
  }

  // Drojdie nu trebuie să potrivească praf de copt sau bicarbonat
  if (/\bdrojdie\b/i.test(qNorm) && !/\bpraf\s+de\s+copt\b/i.test(qNorm)) {
    if (/\b(?:praf\s+de\s+copt|bicarbonat)\b/i.test(cNorm)) {
      return { matches: false, score: 0 };
    }
  }

  // Dezosat nu trebuie să potrivească carne cu os
  if (/\b(dezosat\w*|fara\s+os)\b/i.test(qNorm) && !/\bcu\s+os\b/i.test(qNorm)) {
    if (/\bcu\s+os\b/i.test(cNorm)) {
      return { matches: false, score: 0 };
    }
  }

  // Bere standard nu trebuie să potrivească bere fără alcool sau radler decât dacă se cere
  if (/\bbere\b/i.test(qNorm) && !/\b(?:fara\s+alcool|radler|shandy|non-?alcoolic\w*|0[.,]0\s*%)\b/i.test(qNorm)) {
    if (/\b(fara\s+alcool|non-?alcoolic\w*|0[.,]0\s*%|radler|shandy)\b/i.test(cNorm)) {
      return { matches: false, score: 0 };
    }
  }

  // Vin alb vs vin roșu vs spumant
  if (/\bvin\s+alb\b/i.test(qNorm)) {
    if (/\b(?:vin\s+)?(?:rosu|roz[ee]|spumant\w*|prosecco)\b/i.test(cNorm)) {
      return { matches: false, score: 0 };
    }
  } else if (/\bvin\s+rosu\b/i.test(qNorm)) {
    if (/\b(?:vin\s+)?(?:alb|roz[ee]|spumant\w*|prosecco)\b/i.test(cNorm)) {
      return { matches: false, score: 0 };
    }
  }

  // Varză murată vs castraveți murați
  if (/\bvarza\s+murata\b/i.test(qNorm)) {
    if (/\b(castravet\w*|gogosar\w*|gogonel\w*)\b/i.test(cNorm)) {
      return { matches: false, score: 0 };
    }
  } else if (/\bcastravet\w*\s+(?:murat\w*|in\s+otet|cornison)\b/i.test(qNorm)) {
    if (/\b(varza|gogosar\w*|gogonel\w*)\b/i.test(cNorm)) {
      return { matches: false, score: 0 };
    }
  }

  // Carne crudă (piept de pui, pulpe, ceafă, cotlet) nu trebuie să potrivească mezeluri, șnițele, chiftele, cârnăciori sau mâncare gătită
  if (
    /\b(piept|pulp[ae]|ceafa|cotlet)\b/i.test(qNorm) &&
    !/\b(sunca|parizer|crenvurst\w*|salam\w*|snitel\w*|pane|crispy|strips|nuggets|gujoane|chiftel\w*|carnat\w*|carnacior\w*|gratar|marinat\w*|salata|supa|ciorba|noodles|curry|snack|felii|feliat)\b/i.test(
      qNorm
    )
  ) {
    if (
      /\b(sunca|parizer|crenvurst\w*|salam\w*|pastrama|afumat\w*|snitel\w*|pane|crispy|strips|nuggets|gujoane|cordon\s+bleu|kentucky|invelis\s+crocant|popcorn|chiftel\w*|carnat\w*|carnacior\w*|gratar|marinat\w*|frigarui|piri|curry|capresse|noodles|salata|asortat|deshidratat\w*|snack|sandvis|sandwich)\b/i.test(
        cNorm
      )
    ) {
      return { matches: false, score: 0 };
    }
    // Mezeluri feliate subțire la 80g-150g (ex: K-Classic Piept de pui 100g feliat sandwich)
    if (
      /\b(80\s*g|90\s*g|100\s*g|120\s*g|150\s*g)\b/i.test(cNorm) &&
      !/\b(dezosat|file|fara\s+piele)\b/i.test(cNorm)
    ) {
      return { matches: false, score: 0 };
    }
  }

  // Dacă utilizatorul caută o legumă/fruct specific (ex: Broccoli), nu potrivim burgeri, crochete, supe sau mixuri compuse
  if (!/\b(amestec|mix)\b/i.test(qNorm) && /\b(amestec|mix\s+de\s+legume)\b/i.test(cNorm)) {
    return { matches: false, score: 0 };
  }
  if (!/\b(burger|crochet\w*|pane|supa|paste)\b/i.test(qNorm) && /\b(burger|crochet\w*|pane|supa\s+crema|paste\s+la\s+cuptor)\b/i.test(cNorm)) {
    return { matches: false, score: 0 };
  }

  // Potrivire directă pe cheia generică de fructe/legume (ex. "banana" -> "banan" === "Ciorchine de banane" -> "banan")
  const queryProduceKey = extractFreshProduceGenericKey(rawTerm);
  if (queryProduceKey) {
    const candProduceKey = extractFreshProduceGenericKey(candidateName);
    if (candProduceKey === queryProduceKey) {
      return { matches: true, score: 1 };
    }
  }

  for (const mod of STRICT_SYMMETRIC_MODIFIERS) {
    if (mod.pattern.test(qNorm) && !mod.pattern.test(cNorm)) {
      return { matches: false, score: 0 };
    }
  }

  const qTokens = qNorm
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ''))
    .filter((w) => w.length >= 2 && !GENERIC_TERM_NOISE_WORDS.has(w));
  const cTokens = cNorm
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ''))
    .filter((w) => w.length >= 2);

  if (qTokens.length === 0 || cTokens.length === 0) return { matches: false, score: 0 };

  for (const qt of qTokens) {
    if (!cTokens.some((ct) => tokenStemMatches(qt, ct))) {
      return { matches: false, score: 0 };
    }
  }

  let score = 0.65;
  if (tokenStemMatches(qTokens[0], cTokens[0])) {
    score += 0.25;
  }
  if (cTokens.length <= qTokens.length + 2) {
    score += 0.1;
  }
  // Boost pentru fulgi de ovăz autentici la căutarea „ovaz”
  if (/\bovaz\b/i.test(qNorm)) {
    if (/\bfulgi\b/i.test(cNorm)) {
      score += 0.2;
    } else if (/\b(gustare|vitalis|terci|porridge)\b/i.test(cNorm) && !/\b(gustare|terci|porridge)\b/i.test(qNorm)) {
      score -= 0.25;
    }
  }
  // La căutarea generică „oua”, preferăm ouăle de găină față de cele de prepeliță (dacă nu s-a cerut prepeliță)
  if (/\b(oua|ou)\b/i.test(qNorm) && !/\bprepelita\b/i.test(qNorm)) {
    if (/\bprepelita\b/i.test(cNorm)) {
      score -= 0.2;
    } else {
      score += 0.15;
    }
  }
  return { matches: true, score: Math.min(1, Math.round(score * 1000) / 1000) };
}

const genericMatchesCache = new Map<
  string,
  { profiles: CatalogProductProfile[]; timestamp: number }
>();
const rawGenericDbRowsCache = new Map<
  string,
  { rows: Record<string, unknown>[]; timestamp: number }
>();
const GENERIC_MATCHES_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Caută în Supabase toate produsele compatibile cu un termen generic (ex. „Banane”),
 * indiferent de brand/firmă, pentru compararea în toate magazinele.
 */
export async function resolveGenericTermCatalogMatches(
  rawTerm: string,
  limit = 60,
  options?: {
    preferenceMemory?: UserPreferenceMemory | null;
    learnPreferencesEnabled?: boolean;
  }
): Promise<CatalogProductProfile[]> {
  const cleanTerm = rawTerm.trim().replace(/\s+/g, ' ');
  if (cleanTerm.length < 2) return [];

  const intent = parseShoppingIntent(cleanTerm);
  const effectiveQuery = intent.coreQuery || cleanTerm;

  const cacheKey = `${cleanTerm.toLowerCase()}|${limit}`;
  const cached = genericMatchesCache.get(cacheKey);
  if (
    cached &&
    Date.now() - cached.timestamp < GENERIC_MATCHES_CACHE_TTL_MS &&
    !options?.preferenceMemory
  ) {
    return cached.profiles;
  }

  const rawCacheKey = cleanTerm.toLowerCase();
  const rawHit = rawGenericDbRowsCache.get(rawCacheKey);

  const byId = new Map<string, { profile: CatalogProductProfile; score: number }>();
  const absorbRows = (rows: unknown[]) => {
    for (const raw of rows) {
      const r = raw as Record<string, unknown>;
      const id = String(r.id ?? '');
      if (!id || byId.has(id)) continue;
      const canonicalName = String(r.canonical_name ?? '');
      const brand = r.brand ? String(r.brand) : null;
      const packageSize = r.package_size ? String(r.package_size) : null;

      const baseMatch = matchesGenericTermCandidate(effectiveQuery, canonicalName);
      if (!baseMatch.matches) continue;

      const intentEval = evaluateCandidateAgainstIntent({
        intent,
        candidate: {
          id,
          canonical_name: canonicalName,
          brand,
          package_size: packageSize,
        },
        preferenceMemory: options?.preferenceMemory,
        learnPreferencesEnabled: options?.learnPreferencesEnabled,
      });
      if (!intentEval.compatible) continue;

      byId.set(id, {
        score: Math.max(0, Math.min(1.5, baseMatch.score + intentEval.scoreBoost)),
        profile: {
          id,
          canonical_name: canonicalName,
          brand,
          package_size: packageSize,
          quantity_value: null,
          quantity_unit: null,
          image_url: r.image_url ? String(r.image_url) : null,
          category: r.category_name
            ? String(r.category_name)
            : r.category
              ? String(r.category)
              : null,
          subcategory: r.subcategory ? String(r.subcategory) : null,
          attributes: {},
          familyIds: [],
        },
      });
    }
  };

  if (rawHit && Date.now() - rawHit.timestamp < GENERIC_MATCHES_CACHE_TTL_MS) {
    absorbRows(rawHit.rows);
  } else {
    const mainToken = normalizeCompareText(effectiveQuery)
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z]/g, ''))
      .find((w) => w.length >= 2 && !GENERIC_TERM_NOISE_WORDS.has(w));
    const stemPattern = mainToken ? normalizeRomanianProduceStem(mainToken) : undefined;
    const produceKey =
      extractFreshProduceGenericKey(effectiveQuery) ??
      extractFreshProduceGenericKey(cleanTerm);

    const searchPatterns = produceKey
      ? getFreshProduceSearchPatterns(produceKey)
      : stemPattern && stemPattern.length >= 3
        ? [stemPattern]
        : mainToken && mainToken.length >= 2
          ? [mainToken]
          : [];

    const fetchedRows: Record<string, unknown>[] = [];
    const collectRows = (rows: unknown[]) => {
      for (const raw of rows) {
        if (raw && typeof raw === 'object') {
          fetchedRows.push(raw as Record<string, unknown>);
        }
      }
    };

    // 0. Dacă termenul este un fruct/legumă proaspătă, căutăm direct după fingerprint-ul canonic dedicat
    if (produceKey) {
      const fingerprintRes = await supabase
        .from('beavy_products')
        .select('id, canonical_name, brand, package_size, image_url, category, subcategory')
        .eq('is_active', true)
        .eq('canonical_fingerprint', `produce:${produceKey}`)
        .limit(Math.min(limit, 40));
      if (fingerprintRes.data) {
        collectRows(fingerprintRes.data);
      }
    }

    // 1. Căutare directă rapidă în beavy_products prin token-ul principal (~100ms, pe normalized_name fără diacritice)
    if (searchPatterns.length > 0) {
      const directBatches = await Promise.all(
        searchPatterns.slice(0, 3).map(async (pat) => {
          let q = supabase
            .from('beavy_products')
            .select('id, canonical_name, brand, package_size, image_url, category, subcategory')
            .eq('is_active', true)
            .ilike('normalized_name', `%${pat.trim()}%`);
          if (produceKey) {
            q = q.eq('category', 'Fructe și legume');
          }
          const directRes = await q.limit(Math.min(limit, 64));
          return directRes.data ?? [];
        })
      );
      for (const batch of directBatches) {
        collectRows(batch);
      }
    }

    // 2. Pentru produse non-produce (sau când avem puține rezultate), completăm cu RPC-ul search_beavy_products_v2
    // care garantează că includem produsele cu oferte active în toate magazinele ordonate după relevanță
    if (!produceKey || fetchedRows.length < 15) {
      const rpcRes = await supabase.rpc('search_beavy_products_v2', {
        p_query: effectiveQuery,
        p_category_slug: null,
        p_brand: null,
        p_retailer_slug: null,
        p_sort: 'relevance',
        p_promo_only: false,
        p_limit: Math.min(Math.max(limit, 24), 45),
        p_offset: 0,
      });
      if (!rpcRes.error && Array.isArray(rpcRes.data)) collectRows(rpcRes.data);
    }

    rawGenericDbRowsCache.set(rawCacheKey, { rows: fetchedRows, timestamp: Date.now() });
    absorbRows(fetchedRows);
  }

  const results = Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.profile);

  if (!options?.preferenceMemory) {
    genericMatchesCache.set(cacheKey, { profiles: results, timestamp: Date.now() });
  }
  return results;
}

const PACKAGING_NOISE_WORDS = new Set([
  'pet',
  'sticla',
  'doza',
  'bax',
  'bautura',
  'racoritoare',
  'carbogazoasa',
  'carbogazoase',
  'aroma',
  'gust',
  'suc',
  'garantie',
  'sgr',
  'pack',
  'si',
  'cu',
  'de',
  'din',
  'la',
  'fara',
  'pentru',
  'lei',
]);

function extractMatchTokens(name: string, brand?: string | null): string[] {
  const bTokens = new Set(
    normalizeCompareText(brand)
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
  const cleaned = normalizeCompareText(name)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|litri|litru|g|gr|kg|buc|pcs|x)?\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ');
  return cleaned
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ''))
    .filter((w) => w.length >= 2 && !PACKAGING_NOISE_WORDS.has(w) && !bTokens.has(w));
}

function buildCharBigrams(text: string): Set<string> {
  const compact = text.replace(/\s+/g, '');
  const set = new Set<string>();
  if (compact.length < 2) {
    if (compact.length === 1) set.add(compact);
    return set;
  }
  for (let i = 0; i < compact.length - 1; i++) {
    set.add(compact.slice(i, i + 2));
  }
  return set;
}

function diceCoefficient<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  return (2 * intersection) / (a.size + b.size);
}

function escapeRegexLiteral(val: string): string {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Funcție matematică de similaritate multi-semnal între două produse canonice [0..1].
 * Combină proximitatea cantității SI, similaritatea Dice pe tokeni + bigrame, identitatea de brand și taxonomia.
 */
export function computeProductMatchScore(
  target: CatalogProductProfile,
  candidate: CatalogProductProfile,
  options: {
    skipCategoryCheck?: boolean;
    allowAsymmetricDomainTags?: boolean;
    allowDifferentSize?: boolean;
  } = {}
): ProductMatchScoreResult {
  // Grupare generică (Brand-Agnostic) pentru Fructe și Legume proaspete de bază între magazine:
  // ignoră brandul ("Chiquita", "Dole", "Filiera Auchan", "Gusturi romanesti", "Piața Lidl", null)
  // și gramajul ("vrac", "1 kg", "500 g", "1 buc", "caserolă", "cca 1,1 kg") și le unește sub același card.
  const targetProduceKey = extractFreshProduceGenericKey(target);
  const candidateProduceKey = extractFreshProduceGenericKey(candidate);
  if (targetProduceKey || candidateProduceKey) {
    if (targetProduceKey && candidateProduceKey && targetProduceKey === candidateProduceKey) {
      return {
        compatible: true,
        score: 0.92,
        qtyRatio: 1,
        brandMatch: true,
        isCrossCanonicalExact: true,
      };
    }
    return {
      compatible: false,
      score: 0,
      qtyRatio: null,
      brandMatch: false,
      isCrossCanonicalExact: false,
    };
  }

  // Identitate canonică deterministă cross-store (canonical_fingerprint)
  if (
    target.canonical_fingerprint &&
    candidate.canonical_fingerprint &&
    target.canonical_fingerprint === candidate.canonical_fingerprint
  ) {
    return {
      compatible: true,
      score: 1.0,
      qtyRatio: 1,
      brandMatch: true,
      isCrossCanonicalExact: true,
    };
  }

  const compatible = isCompatibleEquivalentProduct(target, candidate, {
    allowSameCategoryWithoutFamily: true,
    skipCategoryCheck: options.skipCategoryCheck,
    allowAsymmetricDomainTags: options.allowAsymmetricDomainTags,
    allowDifferentSize: options.allowDifferentSize,
  });
  if (!compatible) {
    return {
      compatible: false,
      score: 0,
      qtyRatio: null,
      brandMatch: false,
      isCrossCanonicalExact: false,
    };
  }

  const targetQty = toBaseQuantity(
    target.quantity_value,
    target.quantity_unit,
    target.package_size || target.canonical_name
  );
  const candQty = toBaseQuantity(
    candidate.quantity_value,
    candidate.quantity_unit,
    candidate.package_size || candidate.canonical_name
  );

  let qtyRatio: number | null = null;
  let qtyScore = 0.65;
  if (targetQty && candQty && targetQty.kind === candQty.kind && targetQty.baseValue > 0) {
    qtyRatio = candQty.baseValue / targetQty.baseValue;
    const maxVal = Math.max(targetQty.baseValue, candQty.baseValue);
    const rawQtyScore =
      maxVal > 0 ? Math.max(0, 1 - Math.abs(targetQty.baseValue - candQty.baseValue) / maxVal) : 1;
    const isVarWeight =
      isVariableWeightOrProteinProduct(target) ||
      isVariableWeightOrProteinProduct(candidate);
    qtyScore =
      options.allowDifferentSize && isVarWeight
        ? Math.max(0.68, rawQtyScore)
        : rawQtyScore;
  }

  const tBrand = normalizeCompareText(target.brand);
  const cBrand = normalizeCompareText(candidate.brand);
  const tNameNorm = normalizeCompareText(target.canonical_name);
  const cNameNorm = normalizeCompareText(candidate.canonical_name);

  const GENERIC_TITLE_BRAND_WORDS = new Set([
    'mega',
    'extra',
    'plus',
    'fresh',
    'simpl',
    'bio',
    'eco',
    'gold',
    'alba',
    'rosu',
    'care',
  ]);
  let brandMatch = false;
  if (tBrand && cBrand) {
    const tCompact = tBrand.replace(/[\s-]+/g, '');
    const cCompact = cBrand.replace(/[\s-]+/g, '');
    brandMatch =
      tBrand === cBrand ||
      tBrand.includes(cBrand) ||
      cBrand.includes(tBrand) ||
      tCompact === cCompact ||
      tCompact.includes(cCompact) ||
      cCompact.includes(tCompact) ||
      (tCompact.length >= 3 &&
        cCompact.length >= 3 &&
        tCompact.replace(/s$/, '') === cCompact.replace(/s$/, ''));
  } else if (
    tBrand.length >= 4 &&
    !cBrand &&
    !GENERIC_TITLE_BRAND_WORDS.has(tBrand) &&
    new RegExp(`\\b${escapeRegexLiteral(tBrand)}\\b`).test(cNameNorm)
  ) {
    brandMatch = true;
  } else if (
    cBrand.length >= 4 &&
    !tBrand &&
    !GENERIC_TITLE_BRAND_WORDS.has(cBrand) &&
    new RegExp(`\\b${escapeRegexLiteral(cBrand)}\\b`).test(tNameNorm)
  ) {
    brandMatch = true;
  }
  const brandScore = brandMatch ? 1.0 : 0.2;

  const tWords = extractMatchTokens(target.canonical_name, target.brand);
  const cWords = extractMatchTokens(candidate.canonical_name, candidate.brand);
  const wordDice = diceCoefficient(new Set(tWords), new Set(cWords));
  const bigramDice = diceCoefficient(
    buildCharBigrams(tWords.join(' ')),
    buildCharBigrams(cWords.join(' '))
  );
  let textScore = 0.65 * wordDice + 0.35 * bigramDice;

  const shorterWords = tWords.length <= cWords.length ? tWords : cWords;
  const longerWords = tWords.length <= cWords.length ? cWords : tWords;
  if (shorterWords.length > 0 && shorterWords.every((w) => longerWords.includes(w))) {
    textScore = Math.max(textScore, 0.85);
  } else if (shorterWords.length > 1) {
    const overlapCount = shorterWords.filter((w) => longerWords.includes(w)).length;
    if (overlapCount / shorterWords.length >= 0.75) {
      textScore = Math.max(textScore, 0.70);
    }
  }

  const sharesFamily = target.familyIds.some((fid) => candidate.familyIds.includes(fid));
  const tSub = normalizeCompareText(target.subcategory);
  const cSub = normalizeCompareText(candidate.subcategory);
  const tCat = normalizeCompareText(target.category);
  const cCat = normalizeCompareText(candidate.category);
  const taxScore = sharesFamily
    ? 1.0
    : tSub && cSub && tSub === cSub
      ? 0.7
      : tCat && cCat && tCat === cCat
        ? 0.35
        : options.skipCategoryCheck
          ? 0.7
          : 0;

  const score =
    Math.round((0.35 * qtyScore + 0.35 * textScore + 0.2 * brandScore + 0.1 * taxScore) * 1000) /
    1000;

  const tPlOwner = resolvePrivateLabelOwnerRetailer(target);
  const cPlOwner = resolvePrivateLabelOwnerRetailer(candidate);
  const privateLabelCompatibleForExact =
    tPlOwner === cPlOwner &&
    (!isPrivateLabelProduct(target) && !isPrivateLabelProduct(candidate)
      ? true
      : brandMatch);

  const isCrossCanonicalExact = Boolean(
    brandMatch &&
      privateLabelCompatibleForExact &&
      textScore >= 0.45 &&
      qtyRatio !== null &&
      qtyRatio >= 0.98 &&
      qtyRatio <= 1.02 &&
      score >= 0.72
  );

  return {
    compatible: true,
    score,
    qtyRatio,
    brandMatch,
    isCrossCanonicalExact,
  };
}

function parseOfferRow(row: Record<string, unknown>): BeavyProductOffer {
  const rawData =
    row.raw_data && typeof row.raw_data === 'object'
      ? (row.raw_data as Record<string, unknown>)
      : {};

  const availabilityRaw = row.availability ? String(row.availability).toLowerCase() : null;
  const stockRaw =
    typeof row.stock_status === 'string'
      ? row.stock_status
      : typeof rawData.stock_status === 'string'
      ? rawData.stock_status
      : null;

  let stockStatus: BeavyProductOffer['stock_status'] = 'in_stock';
  if (
    stockRaw === 'out_of_stock' ||
    availabilityRaw === 'out_of_stock' ||
    availabilityRaw === 'unavailable' ||
    availabilityRaw === 'indisponibil'
  ) {
    stockStatus = 'out_of_stock';
  } else if (stockRaw === 'low_stock') {
    stockStatus = 'low_stock';
  } else if (stockRaw === 'unknown') {
    stockStatus = 'unknown';
  }

  const numOrNull = (val: unknown): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  };

  const sellRaw =
    typeof row.sell_by_mode === 'string'
      ? row.sell_by_mode
      : typeof rawData.sell_by_mode === 'string'
      ? rawData.sell_by_mode
      : 'unit';
  const sellByMode: BeavyProductOffer['sell_by_mode'] =
    sellRaw === 'kg' || sellRaw === 'catch_weight' ? sellRaw : 'unit';

  return {
    id: String(row.id),
    product_id: row.product_id ? String(row.product_id) : null,
    retailer_id: row.retailer_id ? String(row.retailer_id) : null,
    retailer_name: String(row.retailer_name ?? ''),
    fulfillment_node_id: row.fulfillment_node_id ? String(row.fulfillment_node_id) : null,
    price: Number(row.price),
    regular_price: numOrNull(row.regular_price ?? rawData.regular_price),
    promo_price: numOrNull(row.promo_price ?? rawData.promo_price),
    loyalty_price: numOrNull(row.loyalty_price ?? rawData.loyalty_price),
    promo_label:
      typeof (row.promo_label ?? rawData.promo_label) === 'string'
        ? String(row.promo_label ?? rawData.promo_label).trim() || null
        : null,
    promo_requires_card: (() => {
      if (Boolean(row.promo_requires_card ?? rawData.promo_requires_card)) return true;
      const lbl = String(row.promo_label ?? rawData.promo_label ?? '').toLowerCase();
      return /(connect|myclub|lidl\s*plus|penny\s*card|sezamo\s*xtra|act\s*for\s*good|kaufland\s*card|genius)/.test(
        lbl
      );
    })(),
    sgr_fee: numOrNull(rawData.sgr_fee),
    currency: String(row.currency ?? 'RON'),
    unit_price: numOrNull(row.unit_price),
    normalized_unit_price: numOrNull(row.normalized_unit_price ?? rawData.normalized_unit_price),
    normalized_unit_label:
      typeof (row.normalized_unit_label ?? rawData.normalized_unit_label) === 'string'
        ? String(row.normalized_unit_label ?? rawData.normalized_unit_label)
        : null,
    sell_by_mode: sellByMode,
    quantity_value: numOrNull(row.quantity_value),
    quantity_unit: row.quantity_unit ? String(row.quantity_unit) : null,
    package_size: row.package_size ? String(row.package_size) : null,
    product_url: row.product_url ? String(row.product_url) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    fulfillment_channel: row.fulfillment_channel as BeavyProductOffer['fulfillment_channel'],
    city: String(row.city ?? ''),
    availability: availabilityRaw,
    stock_status: stockStatus,
    observed_at: String(row.observed_at),
    valid_until: row.valid_until ? String(row.valid_until) : null,
  };
}

/**
 * Selectează oferta preferată pentru același produs și retailer:
 * 1) potrivire exactă de oraș (dacă este cerută),
 * 2) cea mai recentă observație (`observed_at`, toleranță 12h pentru același val),
 * 3) cel mai mic preț în același val de actualizare.
 */
function pickBetterOffer(
  current: BeavyProductOffer | undefined,
  candidate: BeavyProductOffer,
  preferredCity?: string
): BeavyProductOffer {
  if (!current) return candidate;

  const curOos = current.stock_status === 'out_of_stock';
  const candOos = candidate.stock_status === 'out_of_stock';
  if (curOos !== candOos) {
    return candOos ? current : candidate;
  }

  if (preferredCity) {
    const targetCity = normalizeCompareText(preferredCity);
    const curMatches = normalizeCompareText(current.city) === targetCity;
    const candMatches = normalizeCompareText(candidate.city) === targetCity;
    if (curMatches !== candMatches) {
      return candMatches ? candidate : current;
    }
  }

  const curTime = new Date(current.observed_at).getTime();
  const candTime = new Date(candidate.observed_at).getTime();
  if (Number.isFinite(curTime) && Number.isFinite(candTime)) {
    if (candTime - curTime > FRESHNESS_TIE_WINDOW_MS) return candidate;
    if (curTime - candTime > FRESHNESS_TIE_WINDOW_MS) return current;
  }

  return candidate.price < current.price ? candidate : current;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Determină prețul corect per kg și tipul de ambalare real din magazin
 * pentru un fruct sau legumă proaspătă (ex. sac 2 kg la Kaufland, plasă 500g la Mega Image, vrac la Lidl).
 * Normalizează prețul la 1 kg pentru o comparație matematic corectă între magazine,
 * păstrând în același timp formatul de cumpărare din magazin (pentru casă și checklist fizic).
 */
export function resolveProduceOfferPricing(
  offer: Pick<
    BeavyProductOffer,
    | 'price'
    | 'sell_by_mode'
    | 'normalized_unit_price'
    | 'normalized_unit_label'
    | 'package_size'
    | 'quantity_value'
    | 'quantity_unit'
  > & {
    canonical_name?: string | null;
  },
  profile?:
    | (Pick<CatalogProductProfile, 'canonical_name'> &
        Partial<
          Pick<
            CatalogProductProfile,
            | 'package_size'
            | 'quantity_value'
            | 'quantity_unit'
            | 'category'
            | 'subcategory'
            | 'attributes'
            | 'brand'
          >
        >)
    | null
): ProduceOfferPricing {
  const defaultNonProduce: ProduceOfferPricing = {
    isProduce: false,
    sellMode: 'per_buc',
    pricePerKg: null,
    packPrice: offer.price,
    packWeightGrams: null,
    packWeightKg: null,
    packType: 'vrac',
    packLabel: '',
    packCheckoutSummary: '',
    effectivePricePerUnit: offer.price,
  };

  const canonicalName = profile?.canonical_name ?? offer.canonical_name ?? '';
  const profileOrName = profile ?? canonicalName;
  if (!isFreshProduceItemProfile(profileOrName)) {
    return defaultNonProduce;
  }

  const pkgText = `${offer.package_size ?? ''} ${profile?.package_size ?? ''} ${canonicalName}`;
  const pkgClean = normalizeCompareText(pkgText);

  // Verificare dacă produsul este inerent vândut la legătură sau bucată
  const produceKey = extractFreshProduceGenericKey(profileOrName);
  const isPieceProduce =
    produceKey === 'ceapa_verde' ||
    produceKey === 'salat' ||
    produceKey === 'avocado' ||
    produceKey === 'ananas' ||
    produceKey === 'mango' ||
    /\b(legatura|legaturi|leg|caserola|caserole|buc|bucata|bucati|pcs)\b/.test(pkgClean);

  if (isPieceProduce && !/\b(sac|plasa|kg|kilograme)\b/.test(pkgClean)) {
    const isLeg = /\b(legatura|legaturi|leg)\b/.test(pkgClean) || produceKey === 'ceapa_verde';
    const isCas = /\b(caserola|caserole)\b/.test(pkgClean);
    const label = isLeg ? 'La legătură' : isCas ? 'La caserolă' : 'La bucată';
    const unitNoun = isLeg ? 'leg.' : isCas ? 'caserolă' : 'buc';
    return {
      isProduce: true,
      sellMode: 'per_buc',
      pricePerKg: null,
      packPrice: offer.price,
      packWeightGrams: null,
      packWeightKg: null,
      packType: isLeg ? 'legatura' : isCas ? 'caserola' : 'bucata',
      packLabel: label,
      packCheckoutSummary: `${label} · ${offer.price.toFixed(2)} lei/${unitNoun}`,
      effectivePricePerUnit: offer.price,
    };
  }

  // Extragem greutatea ambalajului (dacă e sac 2kg, plasă 500g etc.)
  let grams: number | null = null;
  const parsedWeight = parseWeightGramsFromText(pkgText);
  if (parsedWeight.grams && parsedWeight.grams >= 100) {
    grams = parsedWeight.grams;
  } else if (
    offer.quantity_value &&
    offer.quantity_value > 0 &&
    (offer.quantity_unit === 'kg' || offer.quantity_unit === 'g' || offer.quantity_unit === 'gr')
  ) {
    grams = offer.quantity_unit === 'kg' ? offer.quantity_value * 1000 : offer.quantity_value;
  } else if (
    profile?.quantity_value &&
    profile?.quantity_value > 0 &&
    (profile?.quantity_unit === 'kg' || profile?.quantity_unit === 'g' || profile?.quantity_unit === 'gr')
  ) {
    grams = profile.quantity_unit === 'kg' ? profile.quantity_value * 1000 : profile.quantity_value;
  } else if (
    offer.normalized_unit_label === 'RON/kg' &&
    offer.normalized_unit_price &&
    offer.normalized_unit_price > 0 &&
    offer.price > 0
  ) {
    const ratio = offer.price / offer.normalized_unit_price;
    if (Math.abs(ratio - 1) > 0.08) {
      grams = Math.round(ratio * 1000);
    }
  }

  // Preț per kg
  let pricePerKg: number;
  if (offer.normalized_unit_label === 'RON/kg' && offer.normalized_unit_price && offer.normalized_unit_price > 0) {
    pricePerKg = offer.normalized_unit_price;
  } else if (grams && grams > 0) {
    pricePerKg = roundMoney(offer.price / (grams / 1000));
  } else {
    // Vrac standard (1 kg)
    pricePerKg = offer.price;
    grams = 1000;
  }

  const weightKg = grams ? grams / 1000 : 1;

  // Format ambalaj
  let packType: ProduceOfferPricing['packType'] = 'vrac';
  let packLabel = 'Vrac';

  if (/\bsac\b/.test(pkgClean)) {
    packType = 'sac';
    packLabel = grams ? `Sac ${grams >= 1000 ? `${+(grams / 1000).toFixed(2)} kg` : `${grams}g`}` : 'Sac';
  } else if (/\b(plasa|plase)\b/.test(pkgClean)) {
    packType = 'plasa';
    packLabel = grams ? `Plasă ${grams >= 1000 ? `${+(grams / 1000).toFixed(2)} kg` : `${grams}g`}` : 'Plasă';
  } else if (/\b(caserola|caserole)\b/.test(pkgClean)) {
    packType = 'caserola';
    packLabel = grams ? `Caserolă ${grams >= 1000 ? `${+(grams / 1000).toFixed(2)} kg` : `${grams}g`}` : 'Caserolă';
  } else if (/\b(punga|pungi)\b/.test(pkgClean)) {
    packType = 'punga';
    packLabel = grams ? `Pungă ${grams >= 1000 ? `${+(grams / 1000).toFixed(2)} kg` : `${grams}g`}` : 'Pungă';
  } else if (grams && Math.abs(grams - 1000) > 80) {
    packType = 'punga';
    packLabel = `Pachet ${grams >= 1000 ? `${+(grams / 1000).toFixed(2)} kg` : `${grams}g`}`;
  } else {
    packType = 'vrac';
    packLabel = 'Vrac';
  }

  let packCheckoutSummary = `${packLabel} · ${pricePerKg.toFixed(2)} lei/kg`;
  if (packType !== 'vrac' && grams && Math.abs(grams - 1000) > 80) {
    packCheckoutSummary = `${packLabel} (${offer.price.toFixed(2)} lei la casă · ${pricePerKg.toFixed(2)} lei/kg)`;
  }

  const isVrac = packType === 'vrac';

  return {
    isProduce: true,
    sellMode: 'per_kg',
    pricePerKg,
    packPrice: offer.price,
    packWeightGrams: grams,
    packWeightKg: weightKg,
    packType,
    packLabel,
    packCheckoutSummary,
    effectivePricePerUnit: isVrac ? pricePerKg : offer.price,
  };
}

export const ALL_LOYALTY_PROGRAMS = [
  'Card CONNECT',
  'Card MyCLUB',
  'Lidl Plus',
  'PENNY Card',
  'Kaufland Card',
  'Sezamo Xtra',
  'Act for Good',
  'Genius',
  'Profi Card',
] as const;

export function resolveLoyaltyProgramName(
  retailerName: string,
  promoLabel?: string | null
): string {
  const combined = `${retailerName} ${promoLabel ?? ''}`.toLowerCase();
  if (combined.includes('myclub')) return 'Card MyCLUB';
  if (combined.includes('connect')) return 'Card CONNECT';
  if (combined.includes('lidl')) return 'Lidl Plus';
  if (combined.includes('xtra') || combined.includes('sezamo')) return 'Sezamo Xtra';
  if (combined.includes('penny')) return 'PENNY Card';
  if (combined.includes('kaufland')) return 'Kaufland Card';
  if (combined.includes('profi')) return 'Profi Card';
  if (combined.includes('genius')) return 'Genius';
  if (combined.includes('act for good')) return 'Act for Good';
  if (combined.includes('auchan')) return 'Card MyCLUB';
  if (combined.includes('mega')) return 'Card CONNECT';
  if (combined.includes('freshful')) return 'Genius';
  if (combined.includes('carrefour')) return 'Act for Good';
  return 'Card fidelitate';
}

function offerRequiresLoyaltyCard(offer: BeavyProductOffer): boolean {
  if (offer.promo_requires_card) return true;
  const label = String(offer.promo_label ?? '').toLowerCase();
  return /(connect|myclub|lidl\s*plus|penny\s*card|sezamo\s*xtra|act\s*for\s*good|kaufland\s*card|genius|profi\s*card)/.test(
    label
  );
}

/**
 * Calculează costul efectiv al liniei de produs cu cardul de fidelitate al magazinului,
 * incluzând atât `loyalty_price` unitar cât și promoțiile multi-buy / procentuale cu card
 * (ex: CONNECT -80% la al 2-lea, comanzi 3 plătești 2, 2+1, CONNECT -20%).
 */
export function computeLoyaltyLineTotal(
  offer: BeavyProductOffer,
  quantity: number,
  allowedPrograms?: string[] | null
): {
  loyaltyLineTotal: number | null;
  loyaltySavings: number;
  hasLoyaltyOffer: boolean;
} {
  const qty = Math.max(1, quantity);
  const standardTotal = roundMoney(offer.price * qty);

  if (allowedPrograms && allowedPrograms.length > 0) {
    const programName = resolveLoyaltyProgramName(offer.retailer_name, offer.promo_label);
    if (!allowedPrograms.includes(programName)) {
      return {
        loyaltyLineTotal: null,
        loyaltySavings: 0,
        hasLoyaltyOffer: false,
      };
    }
  }

  if (offer.loyalty_price !== null && offer.loyalty_price > 0 && offer.loyalty_price < offer.price) {
    const loyaltyLineTotal = roundMoney(offer.loyalty_price * qty);
    return {
      loyaltyLineTotal,
      loyaltySavings: Math.max(0, roundMoney(standardTotal - loyaltyLineTotal)),
      hasLoyaltyOffer: true,
    };
  }

  const labelNorm = String(offer.promo_label ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (offerRequiresLoyaltyCard(offer)) {
    const secondPctMatch = labelNorm.match(/-\s*(\d+)\s*%\s*la\s+al\s+2-lea/);
    if (secondPctMatch && qty >= 2) {
      const pct = Number(secondPctMatch[1]);
      if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
        const pairs = Math.floor(qty / 2);
        const savings = roundMoney(pairs * offer.price * (pct / 100));
        const loyaltyLineTotal = Math.max(0, roundMoney(standardTotal - savings));
        return {
          loyaltyLineTotal,
          loyaltySavings: roundMoney(standardTotal - loyaltyLineTotal),
          hasLoyaltyOffer: true,
        };
      }
    }

    const buyPayMatch = labelNorm.match(/comanzi\s*(\d+)\s*,\s*platesti\s*(\d+)/);
    if (buyPayMatch) {
      const buyN = Number(buyPayMatch[1]);
      const payN = Number(buyPayMatch[2]);
      if (Number.isFinite(buyN) && Number.isFinite(payN) && buyN > payN && payN > 0 && qty >= buyN) {
        const groups = Math.floor(qty / buyN);
        const freeUnits = groups * (buyN - payN);
        const loyaltyLineTotal = Math.max(0, roundMoney(standardTotal - freeUnits * offer.price));
        return {
          loyaltyLineTotal,
          loyaltySavings: roundMoney(standardTotal - loyaltyLineTotal),
          hasLoyaltyOffer: true,
        };
      }
    }

    const plusPromoMatch = labelNorm.match(/(\d+)\s*\+\s*(\d+)/);
    if (plusPromoMatch) {
      const paidN = Number(plusPromoMatch[1]);
      const bonusN = Number(plusPromoMatch[2]);
      const packTotal = paidN + bonusN;
      if (Number.isFinite(paidN) && Number.isFinite(bonusN) && paidN > 0 && bonusN > 0 && qty >= packTotal) {
        const groups = Math.floor(qty / packTotal);
        const freeUnits = groups * bonusN;
        const loyaltyLineTotal = Math.max(0, roundMoney(standardTotal - freeUnits * offer.price));
        return {
          loyaltyLineTotal,
          loyaltySavings: roundMoney(standardTotal - loyaltyLineTotal),
          hasLoyaltyOffer: true,
        };
      }
    }

    // Procent direct pe card (fără condiție multi-buy) când `loyalty_price` nu este populat explicit
    if (!/la\s+al\s+\d+|comanzi|\+/.test(labelNorm)) {
      const flatPctMatch = labelNorm.match(
        /(?:-\s*(\d+)\s*%|(\d+)\s*%\s*reducere|economisesti\s*(\d+)\s*%)/
      );
      const rawPct = flatPctMatch?.[1] ?? flatPctMatch?.[2] ?? flatPctMatch?.[3];
      const pct = rawPct ? Number(rawPct) : NaN;
      if (Number.isFinite(pct) && pct > 0 && pct < 100) {
        const discountedUnit = roundMoney(offer.price * (1 - pct / 100));
        const loyaltyLineTotal = roundMoney(discountedUnit * qty);
        return {
          loyaltyLineTotal,
          loyaltySavings: Math.max(0, roundMoney(standardTotal - loyaltyLineTotal)),
          hasLoyaltyOffer: true,
        };
      }
    }

    return {
      loyaltyLineTotal: null,
      loyaltySavings: 0,
      hasLoyaltyOffer: true,
    };
  }

  return {
    loyaltyLineTotal: null,
    loyaltySavings: 0,
    hasLoyaltyOffer: false,
  };
}

function computeRetailerFees(
  subtotal: number,
  coveredCount: number,
  retailer: BeavyRetailer,
  channelFilter: 'all' | 'physical' | 'online',
  nodes: BeavyFulfillmentNode[],
  rulesByNodeId: Map<string, BeavyFulfillmentRule>
): {
  deliveryFee: number;
  serviceFee: number;
  packagingFee: number;
  smallOrderFee: number;
  estimatedFeesTotal: number;
  freeDeliveryThreshold: number | null;
  minimumOrderValue: number | null;
  belowMinimumOrder: boolean;
  matchedNodeName: string | null;
} {
  if (coveredCount === 0 || channelFilter === 'physical') {
    return {
      deliveryFee: 0,
      serviceFee: 0,
      packagingFee: 0,
      smallOrderFee: 0,
      estimatedFeesTotal: 0,
      freeDeliveryThreshold: null,
      minimumOrderValue: null,
      belowMinimumOrder: false,
      matchedNodeName: null,
    };
  }

  const retailerNodes = nodes.filter((n) => n.retailer_id === retailer.id);
  const deliveryNodes = retailerNodes.filter(
    (n) =>
      n.fulfillment_channel === 'delivery' ||
      n.fulfillment_channel === 'online'
  );
  const targetNodes =
    channelFilter === 'online'
      ? deliveryNodes
      : !retailer.supports_physical && deliveryNodes.length > 0
      ? deliveryNodes
      : [];

  for (const node of targetNodes) {
    const rule = rulesByNodeId.get(node.id);
    if (!rule) continue;

    const freeThresh = rule.free_delivery_threshold;
    const rawDelivery = rule.delivery_fee ?? 0;
    const deliveryFee =
      freeThresh !== null && subtotal >= freeThresh ? 0 : rawDelivery;
    const serviceFee = rule.service_fee ?? 0;
    const packagingFee = rule.packaging_fee ?? 0;
    const smallOrderFee =
      rule.small_order_fee_threshold !== null &&
      subtotal < rule.small_order_fee_threshold
        ? rule.small_order_fee ?? 0
        : 0;
    const estimatedFeesTotal = roundMoney(
      deliveryFee + serviceFee + packagingFee + smallOrderFee
    );
    const minimumOrderValue = rule.minimum_order_value;
    const belowMinimumOrder =
      minimumOrderValue !== null && subtotal < minimumOrderValue;

    return {
      deliveryFee: roundMoney(deliveryFee),
      serviceFee: roundMoney(serviceFee),
      packagingFee: roundMoney(packagingFee),
      smallOrderFee: roundMoney(smallOrderFee),
      estimatedFeesTotal,
      freeDeliveryThreshold: freeThresh,
      minimumOrderValue,
      belowMinimumOrder,
      matchedNodeName: node.name,
    };
  }

  return {
    deliveryFee: 0,
    serviceFee: 0,
    packagingFee: 0,
    smallOrderFee: 0,
    estimatedFeesTotal: 0,
    freeDeliveryThreshold: null,
    minimumOrderValue: null,
    belowMinimumOrder: false,
    matchedNodeName: null,
  };
}

let cachedActiveRetailers: { data: BeavyRetailer[]; timestamp: number } | null = null;
const RETAILERS_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Încarcă magazinele active din `beavy_retailers` cu cache în memorie.
 */
export async function fetchActiveRetailers(): Promise<BeavyRetailer[]> {
  if (
    cachedActiveRetailers &&
    Date.now() - cachedActiveRetailers.timestamp < RETAILERS_CACHE_TTL_MS
  ) {
    return cachedActiveRetailers.data;
  }

  const { data, error } = await supabase
    .from('beavy_retailers')
    .select(
      'id, slug, name, logo_url, website_url, supports_physical, supports_delivery, is_active, updated_at'
    )
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    if (cachedActiveRetailers) return cachedActiveRetailers.data;
    throw new Error(`Nu am putut încărca magazinele: ${error.message}`);
  }

  const result = (data ?? []) as BeavyRetailer[];
  cachedActiveRetailers = { data: result, timestamp: Date.now() };
  return result;
}

const fulfillmentDataCache = new Map<
  string,
  { data: { nodes: BeavyFulfillmentNode[]; rules: BeavyFulfillmentRule[] }; timestamp: number }
>();
const FULFILLMENT_DATA_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Încarcă nodurile active și regulile de livrare asociate cu cache în memorie per oraș.
 */
export async function fetchActiveFulfillmentData(city?: string): Promise<{
  nodes: BeavyFulfillmentNode[];
  rules: BeavyFulfillmentRule[];
}> {
  const cacheKey = (city ?? '__all__').toLowerCase().trim();
  const cached = fulfillmentDataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FULFILLMENT_DATA_CACHE_TTL_MS) {
    return cached.data;
  }

  let nodeQuery = supabase
    .from('beavy_fulfillment_nodes')
    .select('id, retailer_id, node_key, name, node_type, fulfillment_channel, city, is_active')
    .eq('is_active', true);

  if (city) {
    nodeQuery = nodeQuery.eq('city', city);
  }

  const { data: nodeRows, error: nodeErr } = await nodeQuery;
  if (nodeErr || !nodeRows || nodeRows.length === 0) {
    return { nodes: [], rules: [] };
  }

  const nodeIds = nodeRows.map((n) => String(n.id));
  const { data: ruleRows, error: ruleErr } = await supabase
    .from('beavy_fulfillment_rules')
    .select(
      'id, fulfillment_node_id, currency, delivery_fee, service_fee, packaging_fee, small_order_fee, small_order_fee_threshold, minimum_order_value, free_delivery_threshold, effective_from, effective_until, is_active'
    )
    .in('fulfillment_node_id', nodeIds)
    .eq('is_active', true);

  if (ruleErr) {
    const fallbackRes = { nodes: nodeRows as BeavyFulfillmentNode[], rules: [] };
    fulfillmentDataCache.set(cacheKey, { data: fallbackRes, timestamp: Date.now() });
    return fallbackRes;
  }

  const nowMs = Date.now();
  const activeRules = (ruleRows ?? [])
    .filter((r) => {
      const fromMs = new Date(String(r.effective_from)).getTime();
      const untilMs = r.effective_until ? new Date(String(r.effective_until)).getTime() : null;
      return fromMs <= nowMs && (untilMs === null || untilMs > nowMs);
    })
    .map((r) => ({
      id: String(r.id),
      fulfillment_node_id: String(r.fulfillment_node_id),
      currency: String(r.currency ?? 'RON'),
      delivery_fee: r.delivery_fee !== null ? Number(r.delivery_fee) : null,
      service_fee: r.service_fee !== null ? Number(r.service_fee) : null,
      packaging_fee: r.packaging_fee !== null ? Number(r.packaging_fee) : null,
      small_order_fee: r.small_order_fee !== null ? Number(r.small_order_fee) : null,
      small_order_fee_threshold:
        r.small_order_fee_threshold !== null ? Number(r.small_order_fee_threshold) : null,
      minimum_order_value: r.minimum_order_value !== null ? Number(r.minimum_order_value) : null,
      free_delivery_threshold:
        r.free_delivery_threshold !== null ? Number(r.free_delivery_threshold) : null,
      effective_from: String(r.effective_from),
      effective_until: r.effective_until ? String(r.effective_until) : null,
      is_active: true,
    }));

  const result = {
    nodes: nodeRows as BeavyFulfillmentNode[],
    rules: activeRules,
  };
  fulfillmentDataCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

const anchorResultsCache = new Map<
  string,
  { rows: Record<string, unknown>[]; timestamp: number }
>();
const ANCHOR_CACHE_TTL_MS = 15 * 60 * 1000;

const categoryPrivateLabelsCache = new Map<
  string,
  { rows: Record<string, unknown>[]; timestamp: number }
>();
const CATEGORY_PL_CACHE_TTL_MS = 15 * 60 * 1000;

const catalogMapCache = new Map<
  string,
  {
    data: {
      profilesById: Map<string, CatalogProductProfile>;
      equivalentIdsByProductId: Map<string, string[]>;
      privateLabelIdsByProductId: Map<string, string[]>;
    };
    timestamp: number;
  }
>();
const CATALOG_MAP_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Încarcă profilurile canonice ale produselor din coș (inclusiv imaginea canonică)
 * și identifică membrii compatibili din aceeași familie pentru echivalare.
 */
export async function fetchCatalogAndEquivalentProfilesMap(
  productIds: string[],
  includeEquivalents = true,
  includePrivateLabelBudget = false
): Promise<{
  profilesById: Map<string, CatalogProductProfile>;
  equivalentIdsByProductId: Map<string, string[]>;
  privateLabelIdsByProductId: Map<string, string[]>;
}> {
  const uniqueTargetIds = Array.from(new Set(productIds));
  if (uniqueTargetIds.length === 0) {
    return {
      profilesById: new Map(),
      equivalentIdsByProductId: new Map(),
      privateLabelIdsByProductId: new Map(),
    };
  }

  const mapCacheKey = `${uniqueTargetIds.slice().sort().join(',')}|${includeEquivalents}|${includePrivateLabelBudget}`;
  const mapCached = catalogMapCache.get(mapCacheKey);
  if (mapCached && Date.now() - mapCached.timestamp < CATALOG_MAP_CACHE_TTL_MS) {
    return {
      profilesById: new Map(mapCached.data.profilesById),
      equivalentIdsByProductId: new Map(mapCached.data.equivalentIdsByProductId),
      privateLabelIdsByProductId: new Map(mapCached.data.privateLabelIdsByProductId),
    };
  }

  const profilesById = new Map<string, CatalogProductProfile>();
  const equivalentIdsByProductId = new Map<string, string[]>();
  const privateLabelIdsByProductId = new Map<string, string[]>();

  const familyIdsByProduct = new Map<string, string[]>();
  const allProductIds = new Set<string>(uniqueTargetIds);

  if (includeEquivalents || includePrivateLabelBudget) {
    const targetMembers = await fetchPaginatedByChunks(
      uniqueTargetIds,
      UUID_IN_CHUNK_SIZE,
      (chunk, from, to) =>
        supabase
          .from('beavy_product_family_members')
          .select('product_id, family_id')
          .in('product_id', chunk)
          .range(from, to)
    );

    const familyIds = Array.from(
      new Set(targetMembers.map((m) => String(m.family_id)))
    );

    if (familyIds.length > 0) {
      const allMembers = await fetchPaginatedByChunks(
        familyIds,
        FAMILY_IN_CHUNK_SIZE,
        (chunk, from, to) =>
          supabase
            .from('beavy_product_family_members')
            .select('product_id, family_id')
            .in('family_id', chunk)
            .range(from, to)
      );

      const countPerFamily = new Map<string, number>();
      for (const row of allMembers) {
        const pid = String(row.product_id);
        const fid = String(row.family_id);
        const currentCount = countPerFamily.get(fid) ?? 0;
        if (currentCount < 40) {
          allProductIds.add(pid);
          countPerFamily.set(fid, currentCount + 1);
        }
        const list = familyIdsByProduct.get(pid) ?? [];
        list.push(fid);
        familyIdsByProduct.set(pid, list);
      }
    }
  }

  const products = await fetchPaginatedByChunks(
    Array.from(allProductIds),
    UUID_IN_CHUNK_SIZE,
    (chunk, from, to) =>
      supabase
        .from('beavy_products')
        .select(
          'id, canonical_name, brand, package_size, quantity_value, quantity_unit, image_url, category, subcategory, attributes, canonical_fingerprint'
        )
        .in('id', chunk)
        .eq('is_active', true)
        .range(from, to)
  );

  for (const p of products) {
    const id = String(p.id);
    profilesById.set(id, {
      id,
      canonical_name: String(p.canonical_name ?? ''),
      brand: p.brand ? String(p.brand) : null,
      package_size: p.package_size ? String(p.package_size) : null,
      quantity_value: p.quantity_value != null ? Number(p.quantity_value) : null,
      quantity_unit: p.quantity_unit ? String(p.quantity_unit) : null,
      image_url: p.image_url ? String(p.image_url) : null,
      category: p.category ? String(p.category) : null,
      subcategory: p.subcategory ? String(p.subcategory) : null,
      attributes:
        p.attributes && typeof p.attributes === 'object'
          ? (p.attributes as Record<string, unknown>)
          : {},
      familyIds: familyIdsByProduct.get(id) ?? [],
      canonical_fingerprint: (p as { canonical_fingerprint?: string | null }).canonical_fingerprint ?? null,
    });
  }

  if (includeEquivalents) {
    const targetFingerprints = Array.from(
      new Set(
        uniqueTargetIds
          .map((pid) => profilesById.get(pid)?.canonical_fingerprint)
          .filter((fp): fp is string => typeof fp === 'string' && fp.trim().length > 0)
      )
    );
    if (targetFingerprints.length > 0) {
      const twinRows = await fetchPaginatedByChunks(
        targetFingerprints,
        UUID_IN_CHUNK_SIZE,
        (chunk, from, to) =>
          supabase
            .from('beavy_products')
            .select(
              'id, canonical_name, brand, package_size, quantity_value, quantity_unit, image_url, category, subcategory, attributes, canonical_fingerprint'
            )
            .in('canonical_fingerprint', chunk)
            .eq('is_active', true)
            .range(from, to)
      );
      for (const p of twinRows) {
        const id = String(p.id);
        if (profilesById.has(id)) continue;
        profilesById.set(id, {
          id,
          canonical_name: String(p.canonical_name ?? ''),
          brand: p.brand ? String(p.brand) : null,
          package_size: p.package_size ? String(p.package_size) : null,
          quantity_value: p.quantity_value != null ? Number(p.quantity_value) : null,
          quantity_unit: p.quantity_unit ? String(p.quantity_unit) : null,
          image_url: p.image_url ? String(p.image_url) : null,
          category: p.category ? String(p.category) : null,
          subcategory: p.subcategory ? String(p.subcategory) : null,
          attributes:
            p.attributes && typeof p.attributes === 'object'
              ? (p.attributes as Record<string, unknown>)
              : {},
          familyIds: familyIdsByProduct.get(id) ?? [],
          canonical_fingerprint:
            (p as { canonical_fingerprint?: string | null }).canonical_fingerprint ?? null,
        });
      }
    }
  }

  if (includePrivateLabelBudget) {
    const targetCategories = Array.from(
      new Set(
        uniqueTargetIds
          .map((pid) => profilesById.get(pid)?.category)
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      )
    );
    if (targetCategories.length > 0) {
      const perCatRows = await Promise.all(
        targetCategories.map(async (catName) => {
          const cacheKey = catName.toLowerCase().trim();
          const cached = categoryPrivateLabelsCache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < CATEGORY_PL_CACHE_TTL_MS) {
            return cached.rows;
          }
          const { data } = await supabase
            .from('beavy_products')
            .select(
              'id, canonical_name, brand, package_size, quantity_value, quantity_unit, image_url, category, subcategory, attributes, canonical_fingerprint'
            )
            .eq('is_active', true)
            .eq('attributes->>is_private_label', 'true')
            .eq('category', catName)
            .limit(120);
          const rows = (data ?? []) as Record<string, unknown>[];
          categoryPrivateLabelsCache.set(cacheKey, { rows, timestamp: Date.now() });
          return rows;
        })
      );

      for (const p of perCatRows.flat()) {
        const id = String(p.id);
        if (profilesById.has(id)) continue;
        profilesById.set(id, {
          id,
          canonical_name: String(p.canonical_name ?? ''),
          brand: p.brand ? String(p.brand) : null,
          package_size: p.package_size ? String(p.package_size) : null,
          quantity_value: p.quantity_value != null ? Number(p.quantity_value) : null,
          quantity_unit: p.quantity_unit ? String(p.quantity_unit) : null,
          image_url: p.image_url ? String(p.image_url) : null,
          category: p.category ? String(p.category) : null,
          subcategory: p.subcategory ? String(p.subcategory) : null,
          attributes:
            p.attributes && typeof p.attributes === 'object'
              ? (p.attributes as Record<string, unknown>)
              : {},
          familyIds: familyIdsByProduct.get(id) ?? [],
          canonical_fingerprint: (p as { canonical_fingerprint?: string | null }).canonical_fingerprint ?? null,
        });
      }
    }
  }

  if (includeEquivalents) {
    const ANCHOR_IGNORE_ADJECTIVES = new Set([
      'integral',
      'integrala',
      'integrale',
      'integrali',
      'dezosat',
      'dezosata',
      'dezosate',
      'feliat',
      'feliata',
      'feliate',
      'proaspat',
      'proaspata',
      'proaspete',
      'fara',
      'piele',
      'grasime',
      'marime',
      'marimea',
      'bucati',
      'ecologic',
      'ecologica',
      'ecologice',
      'organic',
      'organica',
      'organice',
      'natural',
      'naturala',
      'naturale',
      'romanesc',
      'romaneasca',
      'romanesti',
      'traditional',
      'traditionala',
      'original',
      'clasic',
      'clasica',
      'fini',
      'macinat',
      'macinata',
      'macinati',
      'gaina',
      'gaini',
      'crescute',
      'sol',
    ]);

    const anchorQueries = Array.from(
      new Set(
        uniqueTargetIds
          .flatMap((pid) => {
            const target = profilesById.get(pid);
            if (!target) return [];
            const produceKey = extractFreshProduceGenericKey(target);
            if (produceKey) {
              return getFreshProduceSearchPatterns(produceKey).map((p) => p.trim());
            }
            const anchors: string[] = [];
            const brandClean = normalizeCompareText(target.brand)
              .replace(/[^a-z0-9]/g, '')
              .trim();
            if (brandClean.length >= 3 && !PRIVATE_LABEL_BRANDS_SET.has(brandClean)) {
              anchors.push(brandClean);
            }
            const words = extractMatchTokens(target.canonical_name, target.brand).filter(
              (w) => w.length >= 3 && !ANCHOR_IGNORE_ADJECTIVES.has(w)
            );
            const firstCore = words[0];
            if (firstCore) anchors.push(firstCore);
            const longestCore = [...words].sort((a, b) => b.length - a.length)[0];
            if (longestCore && longestCore !== firstCore) anchors.push(longestCore);
            return anchors;
          })
          .filter((a): a is string => Boolean(a))
      )
    ).slice(0, 8);

    if (anchorQueries.length > 0) {
      const anchorRows = await Promise.all(
        anchorQueries.map(async (anchor) => {
          const cacheKey = anchor.toLowerCase().trim();
          const cached = anchorResultsCache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < ANCHOR_CACHE_TTL_MS) {
            return cached.rows;
          }
          const { data } = await supabase
            .from('beavy_products')
            .select(
              'id, canonical_name, brand, package_size, quantity_value, quantity_unit, image_url, category, subcategory, attributes, canonical_fingerprint'
            )
            .eq('is_active', true)
            .ilike('normalized_name', `%${anchor}%`)
            .limit(90);
          const rows = (data ?? []) as Record<string, unknown>[];
          anchorResultsCache.set(cacheKey, { rows, timestamp: Date.now() });
          return rows;
        })
      );

      for (const p of anchorRows.flat()) {
        const id = String(p.id);
        if (profilesById.has(id)) continue;
        profilesById.set(id, {
          id,
          canonical_name: String(p.canonical_name ?? ''),
          brand: p.brand ? String(p.brand) : null,
          package_size: p.package_size ? String(p.package_size) : null,
          quantity_value: p.quantity_value != null ? Number(p.quantity_value) : null,
          quantity_unit: p.quantity_unit ? String(p.quantity_unit) : null,
          image_url: p.image_url ? String(p.image_url) : null,
          category: p.category ? String(p.category) : null,
          subcategory: p.subcategory ? String(p.subcategory) : null,
          attributes:
            p.attributes && typeof p.attributes === 'object'
              ? (p.attributes as Record<string, unknown>)
              : {},
          familyIds: familyIdsByProduct.get(id) ?? [],
          canonical_fingerprint:
            (p as { canonical_fingerprint?: string | null }).canonical_fingerprint ?? null,
        });
      }
    }
  }

  if (includeEquivalents || includePrivateLabelBudget) {
    const allProfiles = Array.from(profilesById.values());
    const plProfiles = includePrivateLabelBudget
      ? allProfiles.filter((cand) => isPrivateLabelProduct(cand))
      : [];

    // Pre-index profiles by category, family, and fingerprint for lightning-fast O(1) candidate lookup
    const profilesByCategory = new Map<string, CatalogProductProfile[]>();
    const profilesByFamily = new Map<string, CatalogProductProfile[]>();
    const profilesByFingerprint = new Map<string, CatalogProductProfile[]>();
    const plProfilesByCategory = new Map<string, CatalogProductProfile[]>();

    for (const cand of allProfiles) {
      if (cand.category) {
        const cat = cand.category.toLowerCase().trim();
        const list = profilesByCategory.get(cat) ?? [];
        list.push(cand);
        profilesByCategory.set(cat, list);
      }
      if (cand.canonical_fingerprint) {
        const fp = cand.canonical_fingerprint.trim();
        if (fp) {
          const list = profilesByFingerprint.get(fp) ?? [];
          list.push(cand);
          profilesByFingerprint.set(fp, list);
        }
      }
      for (const fid of cand.familyIds) {
        const list = profilesByFamily.get(fid) ?? [];
        list.push(cand);
        profilesByFamily.set(fid, list);
      }
    }

    if (includePrivateLabelBudget) {
      for (const cand of plProfiles) {
        if (cand.category) {
          const cat = cand.category.toLowerCase().trim();
          const list = plProfilesByCategory.get(cat) ?? [];
          list.push(cand);
          plProfilesByCategory.set(cat, list);
        }
      }
    }

    for (const pid of uniqueTargetIds) {
      const target = profilesById.get(pid);
      if (!target) continue;

      const targetProduceKey = extractFreshProduceGenericKey(target);
      const targetTokens = new Set(
        extractMatchTokens(target.canonical_name, target.brand).filter(
          (t) => t.length >= 3 && !GENERIC_TERM_NOISE_WORDS.has(t)
        )
      );

      // Collect relevant candidates only
      const candidateSet = new Set<CatalogProductProfile>();
      if (target.canonical_fingerprint) {
        const fpMembers = profilesByFingerprint.get(target.canonical_fingerprint.trim());
        if (fpMembers) {
          for (const m of fpMembers) {
            if (m.id !== target.id) candidateSet.add(m);
          }
        }
      }

      for (const fid of target.familyIds) {
        const famMembers = profilesByFamily.get(fid);
        if (famMembers) {
          for (const m of famMembers) {
            if (m.id !== target.id) candidateSet.add(m);
          }
        }
      }

      for (const m of allProfiles) {
        if (m.id === target.id || candidateSet.has(m)) continue;
        if (targetProduceKey) {
          const mProduceKey = extractFreshProduceGenericKey(m);
          if (mProduceKey === targetProduceKey) candidateSet.add(m);
        } else {
          const mTokens = extractMatchTokens(m.canonical_name, m.brand);
          if (mTokens.some((t) => targetTokens.has(t))) {
            candidateSet.add(m);
          }
        }
      }

      if (includeEquivalents) {
        const scoredCandidates = Array.from(candidateSet)
          .map((cand) => {
            const skipCat = Boolean(
              !target.category ||
                !cand.category ||
                (target.canonical_fingerprint &&
                  target.canonical_fingerprint === cand.canonical_fingerprint)
            );
            const strictRes = computeProductMatchScore(target, cand, {
              skipCategoryCheck: skipCat,
            });
            if (strictRes.compatible) {
              return { id: cand.id, scoreRes: strictRes };
            }
            const relaxedRes = computeProductMatchScore(target, cand, {
              allowDifferentSize: true,
              skipCategoryCheck: skipCat,
            });
            const isVarWeight =
              isVariableWeightOrProteinProduct(target) ||
              isVariableWeightOrProteinProduct(cand);
            const minRatio = isVarWeight ? 0.18 : 0.45;
            const maxRatio = isVarWeight ? 5.5 : 2.2;
            const minScore = isVarWeight ? 0.45 : 0.52;

            if (
              relaxedRes.compatible &&
              relaxedRes.qtyRatio !== null &&
              relaxedRes.qtyRatio >= minRatio &&
              relaxedRes.qtyRatio <= maxRatio &&
              relaxedRes.score >= minScore
            ) {
              return {
                id: cand.id,
                scoreRes: {
                  ...relaxedRes,
                  score: Math.max(0.52, Math.round((relaxedRes.score - 0.08) * 1000) / 1000),
                  isCrossCanonicalExact: false,
                },
              };
            }
            return { id: cand.id, scoreRes: strictRes };
          })
          .filter(
            (candidate) =>
              candidate.scoreRes.isCrossCanonicalExact ||
              (candidate.scoreRes.compatible && candidate.scoreRes.score >= 0.52)
          )
          .sort((a, b) => {
            if (a.scoreRes.isCrossCanonicalExact !== b.scoreRes.isCrossCanonicalExact) {
              return a.scoreRes.isCrossCanonicalExact ? -1 : 1;
            }
            return b.scoreRes.score - a.scoreRes.score;
          })
          .slice(0, 40)
          .map((x) => x.id);

        if (scoredCandidates.length > 0) {
          equivalentIdsByProductId.set(pid, scoredCandidates);
        }
      }

      if (includePrivateLabelBudget && !isFreshProduceItemProfile(target)) {
        const plCandidateSet = new Set<CatalogProductProfile>();
        for (const fid of target.familyIds) {
          const famMembers = profilesByFamily.get(fid);
          if (famMembers) {
            for (const m of famMembers) {
              if (m.id !== target.id && isPrivateLabelProduct(m)) {
                plCandidateSet.add(m);
              }
            }
          }
        }
        if (target.category) {
          const catPls = plProfilesByCategory.get(target.category.toLowerCase().trim());
          if (catPls) {
            for (const m of catPls) {
              if (m.id === target.id || plCandidateSet.has(m)) continue;
              const mTokens = extractMatchTokens(m.canonical_name, m.brand);
              if (mTokens.some((t) => targetTokens.has(t))) {
                plCandidateSet.add(m);
              }
            }
          }
        }

        const compatiblePlIds = Array.from(plCandidateSet)
          .filter((cand) =>
            !isFreshProduceItemProfile(cand) &&
            isCompatibleEquivalentProduct(target, cand, {
              allowSameCategoryWithoutFamily: true,
            })
          )
          .map((cand) => cand.id);

        if (compatiblePlIds.length > 0) {
          privateLabelIdsByProductId.set(pid, compatiblePlIds);
        }
      }
    }
  }

  catalogMapCache.set(mapCacheKey, {
    data: {
      profilesById: new Map(profilesById),
      equivalentIdsByProductId: new Map(equivalentIdsByProductId),
      privateLabelIdsByProductId: new Map(privateLabelIdsByProductId),
    },
    timestamp: Date.now(),
  });

  return { profilesById, equivalentIdsByProductId, privateLabelIdsByProductId };
}

/**
 * Încarcă ofertele active (inclusiv marcările explicite out_of_stock pentru diferențiere UI).
 * Ofertele expirate (`valid_until < now`) sunt excluse.
 */
const OFFER_SELECT_COLUMNS =
  'id, product_id, retailer_id, retailer_name, fulfillment_node_id, price, regular_price, promo_price, loyalty_price, promo_label, promo_requires_card, currency, unit_price, normalized_unit_price, normalized_unit_label, quantity_value, quantity_unit, package_size, product_url, image_url, fulfillment_channel, city, availability, stock_status, sell_by_mode, observed_at, valid_until, raw_data';

const verifiedOffersCache = new Map<
  string,
  { offers: BeavyProductOffer[]; timestamp: number }
>();
const VERIFIED_OFFERS_CACHE_TTL_MS = 6 * 60 * 1000;

export async function fetchVerifiedOffersForProducts(
  productIds: string[],
  city?: string,
  options: { includeOutOfStock?: boolean } = {}
): Promise<BeavyProductOffer[]> {
  if (productIds.length === 0) return [];
  const includeOutOfStock = options.includeOutOfStock ?? false;
  const nowMs = Date.now();

  const cachedOffers: BeavyProductOffer[] = [];
  const missingProductIds: string[] = [];

  for (const pid of productIds) {
    const key = `${pid}|${city ?? ''}`;
    const hit = verifiedOffersCache.get(key);
    if (hit && nowMs - hit.timestamp < VERIFIED_OFFERS_CACHE_TTL_MS) {
      for (const off of hit.offers) {
        if (includeOutOfStock || off.stock_status !== 'out_of_stock') {
          cachedOffers.push(off);
        }
      }
    } else {
      missingProductIds.push(pid);
    }
  }

  if (missingProductIds.length === 0) {
    return cachedOffers.sort((a, b) => a.price - b.price);
  }

  const observedAfter = new Date(nowMs - MAX_VERIFIED_OFFER_AGE_MS).toISOString();

  let rawRows: Record<string, unknown>[];
  try {
    rawRows = await fetchPaginatedByChunks<Record<string, unknown>>(
      missingProductIds,
      OFFER_CHUNK_SIZE,
      (chunk, from, to) => {
        let query = supabase
          .from('beavy_product_offers')
          .select(OFFER_SELECT_COLUMNS)
          .in('product_id', chunk)
          .eq('is_active', true);

        query = query.gte('observed_at', observedAfter);

        if (typeof (query as { or?: unknown }).or === 'function') {
          if (city && city.toLowerCase() !== 'bucurești') {
            query = query.or(`city.eq.${city},city.eq.București,city.is.null`);
          } else if (city) {
            query = query.or(`city.eq.${city},city.is.null`);
          }
        } else if (city) {
          query = query.eq('city', city);
        }

        return query
          .order('observed_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to);
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'eroare necunoscută';
    throw new Error(`Nu am putut încărca ofertele: ${message}`);
  }

  const newOffersByPid = new Map<string, BeavyProductOffer[]>();
  for (const pid of missingProductIds) {
    newOffersByPid.set(pid, []);
  }

  const freshOffers: BeavyProductOffer[] = [];
  for (const row of rawRows) {
    const parsed = parseOfferRow(row);
    if (!isFreshVerifiedOffer(parsed)) continue;
    if (parsed.product_id) {
      const list = newOffersByPid.get(parsed.product_id);
      if (list) list.push(parsed);
    }

    if (!includeOutOfStock && parsed.stock_status === 'out_of_stock') {
      continue;
    }
    freshOffers.push(parsed);
  }

  for (const [pid, pOffers] of newOffersByPid) {
    verifiedOffersCache.set(`${pid}|${city ?? ''}`, {
      offers: pOffers,
      timestamp: nowMs,
    });
  }

  const combined = [...cachedOffers, ...freshOffers];
  return combined.sort((a, b) => a.price - b.price);
}

/**
 * Încarcă ofertele verificate pentru un produs (sau listă de UUID-uri gemene) inclusiv din eventuale
 * UUID-uri canonice duplicat/sparte între magazine, unite prin motorul matematic `computeProductMatchScore`.
 */
export async function fetchSmartOffersForProduct(
  productIdOrIds: string | string[],
  city?: string,
  options: { includeOutOfStock?: boolean } = {}
): Promise<BeavyProductOffer[]> {
  const seedIds = Array.from(
    new Set(
      (Array.isArray(productIdOrIds) ? productIdOrIds : [productIdOrIds]).filter(
        Boolean
      )
    )
  );
  if (seedIds.length === 0) return [];
  const primaryId = seedIds[0];

  const candidateIds = new Set<string>(seedIds);

  // 1. Resolve canonical twins via deterministic canonical_fingerprint
  try {
    const { data: seedRows } = await supabase
      .from('beavy_products')
      .select('id, canonical_fingerprint')
      .in('id', seedIds);

    const fingerprints = Array.from(
      new Set(
        (seedRows ?? [])
          .map((r: { canonical_fingerprint?: string | null }) => r.canonical_fingerprint)
          .filter((fp): fp is string => typeof fp === 'string' && fp.length > 0)
      )
    );

    if (fingerprints.length > 0) {
      const { data: twinRows } = await supabase
        .from('beavy_products')
        .select('id')
        .in('canonical_fingerprint', fingerprints)
        .eq('is_active', true);
      for (const twin of twinRows ?? []) {
        if (twin && (twin as { id: string }).id) {
          candidateIds.add(String((twin as { id: string }).id));
        }
      }
    }
  } catch {
    // Non-fatal, fallback to seedIds
  }

  const { profilesById, equivalentIdsByProductId } =
    await fetchCatalogAndEquivalentProfilesMap(Array.from(candidateIds), true, false);
  const targetProfile =
    profilesById.get(primaryId) ??
    seedIds.map((id) => profilesById.get(id)).find(Boolean);

  if (targetProfile) {
    for (const cand of profilesById.values()) {
      if (candidateIds.has(cand.id)) continue;
      const match = computeProductMatchScore(targetProfile, cand);
      if (match.isCrossCanonicalExact) {
        candidateIds.add(cand.id);
      }
    }
  } else {
    for (const sid of seedIds) {
      for (const eqId of equivalentIdsByProductId.get(sid) ?? []) {
        candidateIds.add(eqId);
      }
    }
  }

  let offers = await fetchVerifiedOffersForProducts(
    Array.from(candidateIds),
    city,
    options
  );
  if (offers.length === 0 && city) {
    offers = await fetchVerifiedOffersForProducts(
      Array.from(candidateIds),
      undefined,
      options
    );
  }

  const isFreshProduceTarget = Boolean(
    targetProfile && extractFreshProduceGenericKey(targetProfile)
  );

  const enrichProduceOffer = (rawOffer: BeavyProductOffer): BeavyProductOffer => {
    if (!isFreshProduceTarget) return rawOffer;
    const prof = rawOffer.product_id ? profilesById.get(rawOffer.product_id) : undefined;
    const produceInfo = resolveProduceOfferPricing(rawOffer, prof ?? targetProfile);
    if (produceInfo.isProduce && produceInfo.sellMode === 'per_kg' && produceInfo.pricePerKg !== null) {
      return {
        ...rawOffer,
        normalized_unit_price: produceInfo.pricePerKg,
        normalized_unit_label: 'RON/kg',
      };
    }
    return rawOffer;
  };

  const pickBestStoreOffer = (
    cur: BeavyProductOffer | undefined,
    cand: BeavyProductOffer
  ): BeavyProductOffer => {
    if (!cur) return cand;
    if (isFreshProduceTarget) {
      const curProduce = resolveProduceOfferPricing(
        cur,
        cur.product_id ? profilesById.get(cur.product_id) : targetProfile
      );
      const candProduce = resolveProduceOfferPricing(
        cand,
        cand.product_id ? profilesById.get(cand.product_id) : targetProfile
      );
      if (
        curProduce.isProduce &&
        candProduce.isProduce &&
        curProduce.sellMode === 'per_kg' &&
        candProduce.sellMode === 'per_kg'
      ) {
        const curRate = curProduce.pricePerKg;
        const candRate = candProduce.pricePerKg;
        if (curRate !== null && candRate !== null) {
          if (Math.abs(candRate - curRate) > 0.05) {
            return candRate < curRate ? cand : cur;
          }
          const curDist = Math.abs((curProduce.packWeightGrams ?? 1000) - 1000);
          const candDist = Math.abs((candProduce.packWeightGrams ?? 1000) - 1000);
          if (candDist < curDist) return cand;
          if (curDist < candDist) return cur;
        }
      }
    }
    return pickBetterOffer(cur, cand, city);
  };

  const byRetailer = new Map<string, BeavyProductOffer>();
  for (const rawOffer of offers) {
    const o = enrichProduceOffer(rawOffer);
    const rKey = (o.retailer_id ?? o.retailer_name).toLowerCase();
    byRetailer.set(rKey, pickBestStoreOffer(byRetailer.get(rKey), o));
  }
  return Array.from(byRetailer.values()).sort((a, b) => {
    if (isFreshProduceTarget) {
      const aKg = a.normalized_unit_label === 'RON/kg' ? a.normalized_unit_price : null;
      const bKg = b.normalized_unit_label === 'RON/kg' ? b.normalized_unit_price : null;
      if (aKg !== null && bKg !== null && Math.abs(aKg - bKg) > 0.05) {
        return aKg - bKg;
      }
    }
    return a.price - b.price;
  });
}

/**
 * Încarcă oferte recente verificate (dacă există în baza de date) pentru secțiunea Acasă.
 */
export async function fetchRecentVerifiedOffers(limit = 6): Promise<BeavyProductOffer[]> {
  const observedAfter = new Date(Date.now() - MAX_VERIFIED_OFFER_AGE_MS).toISOString();
  const { data, error } = await supabase
    .from('beavy_product_offers')
    .select(OFFER_SELECT_COLUMNS)
    .eq('is_active', true)
    .gte('observed_at', observedAfter)
    .order('observed_at', { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data ?? [])
    .map((row) => parseOfferRow(row as Record<string, unknown>))
    .filter((offer) => offer.stock_status !== 'out_of_stock' && isFreshVerifiedOffer(offer));
}

/**
 * Motor pur și determinist pentru compararea coșului pe datele preîncărcate.
 */
export function computeBasketComparison(params: {
  items: BasketItemInput[];
  retailers: BeavyRetailer[];
  offers: BeavyProductOffer[];
  fulfillmentNodes?: BeavyFulfillmentNode[];
  fulfillmentRules?: BeavyFulfillmentRule[];
  profilesById?: Map<string, CatalogProductProfile>;
  equivalentIdsByProductId?: Map<string, string[]>;
  privateLabelIdsByProductId?: Map<string, string[]>;
  genericProductIdsByItemId?: Map<string, string[]>;
  channelFilter?: 'all' | 'physical' | 'online';
  city?: string;
  preferredRetailerSlugs?: string[];
  includeEquivalents?: boolean;
  strategy?: BasketVariantMode;
  useLoyaltyCards?: boolean;
  allowedLoyaltyPrograms?: string[] | null;
  preferenceMemory?: UserPreferenceMemory | null;
  learnPreferencesEnabled?: boolean;
  minSplitSavingsRon?: number;
}): BasketComparisonResult {
  const {
    items,
    retailers,
    offers,
    fulfillmentNodes = [],
    fulfillmentRules = [],
    profilesById = new Map(),
    equivalentIdsByProductId = new Map(),
    privateLabelIdsByProductId = new Map(),
    genericProductIdsByItemId = new Map(),
    channelFilter = 'all',
    city,
    preferredRetailerSlugs = [],
    includeEquivalents = true,
    strategy = 'standard',
    useLoyaltyCards = false,
    allowedLoyaltyPrograms = null,
    preferenceMemory = null,
    learnPreferencesEnabled = true,
    minSplitSavingsRon,
  } = params;

  const channelMatches = (offer: BeavyProductOffer) => {
    if (channelFilter === 'physical') return offer.fulfillment_channel === 'store';
    if (channelFilter === 'online') {
      return offer.fulfillment_channel === 'delivery' || offer.fulfillment_channel === 'online';
    }
    return true;
  };

  const isSameRetailer = (r: BeavyRetailer, o: BeavyProductOffer) =>
    o.retailer_id === r.id || o.retailer_name.toLowerCase() === r.name.toLowerCase();

  const filteredRetailers = retailers.filter((r) => {
    if (channelFilter === 'physical' && !r.supports_physical) return false;
    if (channelFilter === 'online' && !r.supports_delivery) return false;
    if (channelFilter !== 'all') {
      // Dacă în DB un magazin are oferte DOAR pe canalul opus (ex. Auchan/Mega/Carrefour au doar `store`),
      // îl excludem din clasamentul canalului curent ca să nu afișăm carduri goale cu 0/N.
      const hasInChannel = offers.some(
        (o) => o.stock_status !== 'out_of_stock' && isSameRetailer(r, o) && channelMatches(o)
      );
      const hasOtherChannel = offers.some(
        (o) => o.stock_status !== 'out_of_stock' && isSameRetailer(r, o) && !channelMatches(o)
      );
      if (!hasInChannel && hasOtherChannel) return false;
    }
    return true;
  });

  const activeOffers = offers.filter(
    (offer) => offer.stock_status !== 'out_of_stock' && channelMatches(offer)
  );
  const unavailableOffersAll = offers.filter(
    (offer) => offer.stock_status === 'out_of_stock' && channelMatches(offer)
  );

  const offersByProductId = new Map<string, BeavyProductOffer[]>();
  const oosOffersByProductId = new Map<string, BeavyProductOffer[]>();
  const bestOfferByProductRetailerId = new Map<string, BeavyProductOffer>();
  const bestOfferByProductRetailerName = new Map<string, BeavyProductOffer>();
  const oosOfferByProductRetailerId = new Map<string, BeavyProductOffer>();
  const oosOfferByProductRetailerName = new Map<string, BeavyProductOffer>();

  for (const offer of activeOffers) {
    if (!offer.product_id) continue;
    const list = offersByProductId.get(offer.product_id);
    if (list) {
      list.push(offer);
    } else {
      offersByProductId.set(offer.product_id, [offer]);
    }

    if (offer.retailer_id) {
      const idKey = `${offer.product_id}:${offer.retailer_id}`;
      bestOfferByProductRetailerId.set(
        idKey,
        pickBetterOffer(bestOfferByProductRetailerId.get(idKey), offer, city)
      );
    }
    if (offer.retailer_name) {
      const nameKey = `${offer.product_id}:${offer.retailer_name.toLowerCase()}`;
      bestOfferByProductRetailerName.set(
        nameKey,
        pickBetterOffer(bestOfferByProductRetailerName.get(nameKey), offer, city)
      );
    }
  }

  for (const offer of unavailableOffersAll) {
    if (!offer.product_id) continue;
    const list = oosOffersByProductId.get(offer.product_id);
    if (list) {
      list.push(offer);
    } else {
      oosOffersByProductId.set(offer.product_id, [offer]);
    }

    if (offer.retailer_id) {
      const idKey = `${offer.product_id}:${offer.retailer_id}`;
      oosOfferByProductRetailerId.set(
        idKey,
        pickBetterOffer(oosOfferByProductRetailerId.get(idKey), offer, city)
      );
    }
    if (offer.retailer_name) {
      const nameKey = `${offer.product_id}:${offer.retailer_name.toLowerCase()}`;
      oosOfferByProductRetailerName.set(
        nameKey,
        pickBetterOffer(oosOfferByProductRetailerName.get(nameKey), offer, city)
      );
    }
  }

  const summarizeOfferSignals = (offersList: BeavyProductOffer[], qty: number) => {
    const prices = offersList.map((o) => {
      const prod = resolveProduceOfferPricing(
        o,
        o.product_id ? profilesById.get(o.product_id) : undefined
      );
      if (prod.isProduce && prod.sellMode === 'per_kg' && prod.pricePerKg !== null) {
        return roundMoney(prod.pricePerKg * qty);
      }
      return roundMoney(o.price * qty);
    });
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);

    let hasLoyaltyOffer = false;
    let lowestLoyaltyPrice: number | null = null;
    let bestLoyaltyLabel: string | null = null;
    let bestLoyaltyRetailerName: string | null = null;
    let hasRegularPromo = false;
    let bestRegularPromoLabel: string | null = null;

    for (const offer of offersList) {
      const loy = computeLoyaltyLineTotal(
        offer,
        qty,
        useLoyaltyCards ? allowedLoyaltyPrograms : undefined
      );
      if (loy.hasLoyaltyOffer) {
        hasLoyaltyOffer = true;
        if (loy.loyaltyLineTotal !== null && (lowestLoyaltyPrice === null || loy.loyaltyLineTotal < lowestLoyaltyPrice)) {
          lowestLoyaltyPrice = loy.loyaltyLineTotal;
          bestLoyaltyLabel = offer.promo_label || resolveLoyaltyProgramName(offer.retailer_name);
          bestLoyaltyRetailerName = offer.retailer_name;
        } else if (!bestLoyaltyLabel) {
          bestLoyaltyLabel = offer.promo_label || resolveLoyaltyProgramName(offer.retailer_name);
          bestLoyaltyRetailerName = offer.retailer_name;
        }
      }

      const isRegDisc =
        (offer.promo_price !== null &&
          offer.regular_price !== null &&
          offer.promo_price < offer.regular_price) ||
        (offer.regular_price !== null && offer.price < offer.regular_price);
      const isNonCardPromo =
        !offer.promo_requires_card &&
        Boolean(offer.promo_label) &&
        /(%|\+|al 2-lea|comanzi|buy more|reducere|gratis|promo)/i.test(
          offer.promo_label ?? ''
        );
      if (isRegDisc || isNonCardPromo) {
        hasRegularPromo = true;
        if (!bestRegularPromoLabel && offer.promo_label) {
          bestRegularPromoLabel = offer.promo_label;
        }
      }
    }

    return {
      lowestPrice,
      highestPrice,
      hasLoyaltyOffer,
      lowestLoyaltyPrice,
      bestLoyaltyLabel,
      bestLoyaltyRetailerName,
      hasRegularPromo,
      bestRegularPromoLabel,
    };
  };

  const emptyPromoSignals = {
    hasLoyaltyOffer: false,
    lowestLoyaltyPrice: null as number | null,
    bestLoyaltyLabel: null as string | null,
    bestLoyaltyRetailerName: null as string | null,
    hasRegularPromo: false,
    bestRegularPromoLabel: null as string | null,
  };

  const lowestExactPriceByProductId = new Map<string, number>();
  for (const [pid, list] of offersByProductId.entries()) {
    if (list.length > 0) {
      lowestExactPriceByProductId.set(pid, Math.min(...list.map((o) => o.price)));
    }
  }

  const getPrivateLabelCandidateIds = (pid: string): string[] => {
    const explicit = privateLabelIdsByProductId.get(pid);
    if (explicit && explicit.length > 0) return explicit;
    const eqs: string[] = equivalentIdsByProductId.get(pid) ?? [];
    return eqs.filter((id: string) => isPrivateLabelProduct(profilesById.get(id)));
  };

  const isWorthBudgetSwap = (
    exactOffer: BeavyProductOffer,
    exactProfile: CatalogProductProfile | undefined,
    candOffer: BeavyProductOffer,
    candProfile: CatalogProductProfile | undefined
  ): boolean => {
    // Fructele și legumele proaspete nu fac obiectul înlocuirilor de marcă proprie
    if (isFreshProduceItemProfile(exactProfile) || isFreshProduceItemProfile(candProfile)) {
      return false;
    }
    if (!(candOffer.price < exactOffer.price)) return false;
    const exactQty = exactProfile
      ? toBaseQuantity(
          exactProfile.quantity_value ?? exactOffer.quantity_value,
          exactProfile.quantity_unit ?? exactOffer.quantity_unit,
          exactProfile.package_size ?? exactOffer.package_size
        )
      : null;
    const candQty = candProfile
      ? toBaseQuantity(
          candProfile.quantity_value ?? candOffer.quantity_value,
          candProfile.quantity_unit ?? candOffer.quantity_unit,
          candProfile.package_size ?? candOffer.package_size
        )
      : null;
    if (
      exactQty &&
      candQty &&
      exactQty.kind === candQty.kind &&
      Math.abs(candQty.baseValue - exactQty.baseValue) / exactQty.baseValue > 0.05
    ) {
      const exactUnitCost = exactOffer.price / exactQty.baseValue;
      const candUnitCost = candOffer.price / candQty.baseValue;
      if (candUnitCost > exactUnitCost * 1.03) return false;
    }
    return true;
  };

  const smartMatchCache = new Map<
    string,
    { crossExactIds: string[]; rankedEqIds: { id: string; score: number }[] }
  >();
  const allKnownProfiles = Array.from(profilesById.values());

  const getSmartMatchLists = (pid: string) => {
    const cached = smartMatchCache.get(pid);
    if (cached) return cached;
    const target = profilesById.get(pid);
    const seedIds = new Set<string>(equivalentIdsByProductId.get(pid) ?? []);
    if (target && allKnownProfiles.length > 0) {
      for (const cand of allKnownProfiles) {
        if (cand.id === pid || seedIds.has(cand.id)) continue;
        const res = computeProductMatchScore(target, cand);
        if (res.isCrossCanonicalExact || (res.compatible && res.score >= 0.52)) {
          seedIds.add(cand.id);
        }
      }
    }

    const crossExactIds: string[] = [];
    const rankedEqIds: { id: string; score: number }[] = [];
    for (const candId of seedIds) {
      if (candId === pid) continue;
      const cand = profilesById.get(candId);
      if (!target || !cand) {
        // Dacă profilul nu este încărcat în memorie, nu îl adăugăm orbește în alternative
        continue;
      }
      const res = computeProductMatchScore(target, cand);
      if (res.isCrossCanonicalExact) {
        crossExactIds.push(candId);
      } else if (res.compatible && res.score >= 0.52) {
        rankedEqIds.push({ id: candId, score: res.score });
      } else {
        const relaxedRes = computeProductMatchScore(target, cand, {
          allowDifferentSize: true,
        });
        const isVarWeight =
          isVariableWeightOrProteinProduct(target) ||
          isVariableWeightOrProteinProduct(cand);
        const minRatio = isVarWeight ? 0.18 : 0.45;
        const maxRatio = isVarWeight ? 5.5 : 2.2;
        const minScore = isVarWeight ? 0.45 : 0.52;

        if (
          relaxedRes.compatible &&
          relaxedRes.qtyRatio !== null &&
          relaxedRes.qtyRatio >= minRatio &&
          relaxedRes.qtyRatio <= maxRatio &&
          relaxedRes.score >= minScore
        ) {
          rankedEqIds.push({
            id: candId,
            score: Math.max(0.52, Math.round((relaxedRes.score - 0.08) * 1000) / 1000),
          });
        }
      }
    }
    rankedEqIds.sort((a, b) => b.score - a.score);
    const result = { crossExactIds, rankedEqIds };
    smartMatchCache.set(pid, result);
    return result;
  };

  const pickBetterGenericOffer = (
    current: BeavyProductOffer | undefined,
    candidate: BeavyProductOffer
  ): BeavyProductOffer => {
    if (!current) return candidate;

    const curProduce = resolveProduceOfferPricing(
      current,
      current.product_id ? profilesById.get(current.product_id) : undefined
    );
    const candProduce = resolveProduceOfferPricing(
      candidate,
      candidate.product_id ? profilesById.get(candidate.product_id) : undefined
    );

    if (curProduce.isProduce && candProduce.isProduce) {
      if (curProduce.sellMode === 'per_kg' && candProduce.sellMode === 'per_kg') {
        const curRate = curProduce.pricePerKg;
        const candRate = candProduce.pricePerKg;
        if (curRate !== null && candRate !== null) {
          if (Math.abs(candRate - curRate) > 0.05) {
            return candRate < curRate ? candidate : current;
          }
          const curDist = Math.abs((curProduce.packWeightGrams ?? 1000) - 1000);
          const candDist = Math.abs((candProduce.packWeightGrams ?? 1000) - 1000);
          if (candDist < curDist) return candidate;
          if (curDist < candDist) return current;
        }
      }
    }

    const curKg =
      current.normalized_unit_label === 'RON/kg' && current.normalized_unit_price
        ? current.normalized_unit_price
        : null;
    const candKg =
      candidate.normalized_unit_label === 'RON/kg' && candidate.normalized_unit_price
        ? candidate.normalized_unit_price
        : null;
    if (curKg !== null && candKg !== null && Math.abs(candKg - curKg) > 0.05) {
      return candKg < curKg ? candidate : current;
    }
    if (curKg === null && candKg !== null) return candidate;
    if (curKg !== null && candKg === null) return current;
    return candidate.price < current.price ? candidate : current;
  };

  const itemStatuses: ItemComparisonStatus[] = items.map((item) => {
    const profile = item.productId ? profilesById.get(item.productId) : undefined;
    const canonicalName = profile?.canonical_name ?? null;
    const canonicalBrand = profile?.brand ?? item.brand ?? null;
    const canonicalPackageSize = profile?.package_size ?? item.packageSize ?? null;
    const canonicalImageUrl =
      profile?.image_url !== undefined ? profile.image_url : item.imageUrl ?? null;
    const canonicalCategoryName = profile?.category ?? null;

    if (item.isCustom || !item.productId) {
      const genericIds = [...(genericProductIdsByItemId.get(item.id) ?? [])];
      if (genericIds.length === 0) {
        const itemNorm = normalizeCompareText(item.name);
        for (const [pId, p] of profilesById.entries()) {
          if (p.canonical_name && normalizeCompareText(p.canonical_name).includes(itemNorm)) {
            genericIds.push(pId);
            if (genericIds.length >= 3) break;
          }
        }
      }
      if (genericIds.length === 0) {
        return {
          item,
          status: 'manual_item',
          offers: [],
          equivalentOffersCount: 0,
          unavailableOffers: [],
          lowestPrice: null,
          highestPrice: null,
          ...emptyPromoSignals,
          canonicalName: null,
          canonicalBrand: null,
          canonicalPackageSize: null,
          canonicalImageUrl: null,
          canonicalCategoryName: null,
        };
      }

      const genByRetailer = new Map<string, BeavyProductOffer>();
      for (const gid of genericIds) {
        for (const o of offersByProductId.get(gid) ?? []) {
          const rKey = (o.retailer_id ?? o.retailer_name).toLowerCase();
          genByRetailer.set(rKey, pickBetterGenericOffer(genByRetailer.get(rKey), o));
        }
      }
      const genOffers = Array.from(genByRetailer.values()).sort((a, b) => {
        const aProd = resolveProduceOfferPricing(
          a,
          a.product_id ? profilesById.get(a.product_id) : undefined
        );
        const bProd = resolveProduceOfferPricing(
          b,
          b.product_id ? profilesById.get(b.product_id) : undefined
        );
        if (
          aProd.isProduce &&
          bProd.isProduce &&
          aProd.sellMode === 'per_kg' &&
          bProd.sellMode === 'per_kg' &&
          aProd.pricePerKg !== null &&
          bProd.pricePerKg !== null
        ) {
          return aProd.pricePerKg - bProd.pricePerKg;
        }
        return a.price - b.price;
      });
      const firstImage =
        genOffers.find((o) => o.image_url)?.image_url ??
        genericIds.map((gid: string) => profilesById.get(gid)?.image_url).find(Boolean) ??
        null;

      return {
        item,
        status: genOffers.length > 0 ? 'has_offers' : 'no_offers_yet',
        offers: genOffers,
        equivalentOffersCount: 0,
        unavailableOffers: [],
        ...summarizeOfferSignals(genOffers, item.quantity),
        canonicalName: item.name,
        canonicalBrand: null,
        canonicalPackageSize: null,
        canonicalImageUrl: firstImage,
        canonicalCategoryName: null,
      };
    }

    const directOffers = offersByProductId.get(item.productId) ?? [];
    const smart = includeEquivalents
      ? getSmartMatchLists(item.productId)
      : { crossExactIds: [], rankedEqIds: [] };
    const isFreshProduceItem = isFreshProduceItemProfile(profile);

    const matchingByRetailer = new Map<string, BeavyProductOffer>();
    for (const o of directOffers) {
      const rKey = (o.retailer_id ?? o.retailer_name).toLowerCase();
      matchingByRetailer.set(
        rKey,
        isFreshProduceItem
          ? pickBetterGenericOffer(matchingByRetailer.get(rKey), o)
          : pickBetterOffer(matchingByRetailer.get(rKey), o, city)
      );
    }
    for (const twinId of smart.crossExactIds) {
      for (const o of offersByProductId.get(twinId) ?? []) {
        const rKey = (o.retailer_id ?? o.retailer_name).toLowerCase();
        if (isFreshProduceItem) {
          matchingByRetailer.set(rKey, pickBetterGenericOffer(matchingByRetailer.get(rKey), o));
        } else if (!matchingByRetailer.has(rKey)) {
          matchingByRetailer.set(rKey, o);
        }
      }
    }
    const matchingOffers = Array.from(matchingByRetailer.values()).sort(
      (a, b) => a.price - b.price
    );

    const eqOffers = smart.rankedEqIds.flatMap(
      (entry) => offersByProductId.get(entry.id) ?? []
    );
    const plIds: string[] =
      strategy === 'private_label_budget' && !isFreshProduceItem
        ? getPrivateLabelCandidateIds(item.productId)
        : [];
    const plOffers = plIds.flatMap((id) => offersByProductId.get(id) ?? []);
    const exactOos = oosOffersByProductId.get(item.productId) ?? [];

    if (matchingOffers.length > 0) {
      const summaryPool =
        strategy === 'private_label_budget' && plOffers.length > 0
          ? [...matchingOffers, ...plOffers]
          : matchingOffers;
      return {
        item,
        status: 'has_offers',
        offers: matchingOffers,
        equivalentOffersCount:
          strategy === 'private_label_budget'
            ? Math.max(eqOffers.length, plOffers.length)
            : eqOffers.length,
        unavailableOffers: exactOos,
        ...summarizeOfferSignals(summaryPool, item.quantity),
        canonicalName,
        canonicalBrand,
        canonicalPackageSize,
        canonicalImageUrl,
        canonicalCategoryName,
      };
    }

    if (strategy === 'private_label_budget' && plOffers.length > 0) {
      return {
        item,
        status: 'equivalent_only',
        offers: [],
        equivalentOffersCount: plOffers.length,
        unavailableOffers: exactOos,
        ...summarizeOfferSignals(plOffers, item.quantity),
        canonicalName,
        canonicalBrand,
        canonicalPackageSize,
        canonicalImageUrl,
        canonicalCategoryName,
      };
    }

    if (eqOffers.length > 0) {
      return {
        item,
        status: 'equivalent_only',
        offers: [],
        equivalentOffersCount: eqOffers.length,
        unavailableOffers: exactOos,
        ...summarizeOfferSignals(eqOffers, item.quantity),
        canonicalName,
        canonicalBrand,
        canonicalPackageSize,
        canonicalImageUrl,
        canonicalCategoryName,
      };
    }

    if (exactOos.length > 0) {
      return {
        item,
        status: 'unavailable',
        offers: [],
        equivalentOffersCount: 0,
        unavailableOffers: exactOos,
        lowestPrice: null,
        highestPrice: null,
        ...emptyPromoSignals,
        canonicalName,
        canonicalBrand,
        canonicalPackageSize,
        canonicalImageUrl,
        canonicalCategoryName,
      };
    }

    return {
      item,
      status: 'no_offers_yet',
      offers: [],
      equivalentOffersCount: 0,
      unavailableOffers: [],
      lowestPrice: null,
      highestPrice: null,
      ...emptyPromoSignals,
      canonicalName,
      canonicalBrand,
      canonicalPackageSize,
      canonicalImageUrl,
      canonicalCategoryName,
    };
  });

  const totalItemsCount = items.length;
  const totalUnitsCount = items.reduce((acc, it) => acc + Math.max(1, it.quantity), 0);
  const manualItemsCount = itemStatuses.filter((s) => s.status === 'manual_item').length;
  const catalogItemsCount = totalItemsCount - manualItemsCount;
  const coveredItemsCount = itemStatuses.filter(
    (s) => s.status === 'has_offers' || s.status === 'equivalent_only'
  ).length;
  const unavailableItemsCount = itemStatuses.filter(
    (s) => s.status === 'unavailable'
  ).length;
  const noPriceItemsCount = itemStatuses.filter(
    (s) => s.status === 'no_offers_yet' || s.status === 'manual_item'
  ).length;
  const overallCoveragePercent =
    totalItemsCount > 0 ? Math.round((coveredItemsCount / totalItemsCount) * 100) : 0;

  let latestOfferDate: string | null = null;
  for (const offer of activeOffers) {
    if (!latestOfferDate || new Date(offer.observed_at) > new Date(latestOfferDate)) {
      latestOfferDate = offer.observed_at;
    }
  }

  const rulesByNodeId = new Map<string, BeavyFulfillmentRule>();
  for (const rule of fulfillmentRules) {
    rulesByNodeId.set(rule.fulfillment_node_id, rule);
  }

  const retailerSummaries: RetailerComparisonSummary[] = filteredRetailers.map((retailer) => {
    const matchedItems: MatchedBasketItem[] = [];
    const unavailableItems: UnavailableBasketItem[] = [];
    const missingPriceItems: BasketItemInput[] = [];
    let confirmedSubtotal = 0;
    let exactCoveredCount = 0;
    let equivalentCoveredCount = 0;
    let lastObservedAt: string | null = null;
    const retailerLowerName = retailer.name.toLowerCase();

    const lookupRetailerOffer = (pid: string): BeavyProductOffer | undefined => {
      const candOwner = resolvePrivateLabelOwnerRetailer(profilesById.get(pid));
      if (candOwner && candOwner !== retailer.slug) {
        return undefined;
      }
      return (
        bestOfferByProductRetailerId.get(`${pid}:${retailer.id}`) ??
        bestOfferByProductRetailerName.get(`${pid}:${retailerLowerName}`)
      );
    };

    const lookupRetailerOos = (pid: string): BeavyProductOffer | undefined => {
      const candOwner = resolvePrivateLabelOwnerRetailer(profilesById.get(pid));
      if (candOwner && candOwner !== retailer.slug) {
        return undefined;
      }
      return (
        oosOfferByProductRetailerId.get(`${pid}:${retailer.id}`) ??
        oosOfferByProductRetailerName.get(`${pid}:${retailerLowerName}`)
      );
    };

    let loyaltyOfferCount = 0;
    let loyaltyConditionalCount = 0;
    let potentialLoyaltySavings = 0;
    let detectedLoyaltyLabel: string | null = null;
    let standardSubtotalAccum = 0;
    let budgetSwapCount = 0;
    let budgetSavingsTotal = 0;

    const getEffectiveLineTotal = (
      offer: BeavyProductOffer,
      qty: number,
      profile?: CatalogProductProfile,
      baseItem?: BasketItemInput
    ): number => {
      const targetProf =
        profile ?? (offer.product_id ? profilesById.get(offer.product_id) : undefined);
      const produceInfo = resolveProduceOfferPricing(offer, targetProf);
      let effectivePrice =
        produceInfo.isProduce &&
        produceInfo.sellMode === 'per_kg' &&
        produceInfo.pricePerKg !== null
          ? produceInfo.pricePerKg
          : offer.price;

      if (!produceInfo.isProduce && baseItem) {
        const baseItemProf = baseItem.productId ? profilesById.get(baseItem.productId) : undefined;
        const targetQty = toBaseQuantity(
          baseItemProf?.quantity_value,
          baseItemProf?.quantity_unit,
          baseItem.packageSize ?? baseItemProf?.package_size ?? baseItem.name
        );
        const candQty = toBaseQuantity(
          offer.quantity_value ?? targetProf?.quantity_value,
          offer.quantity_unit ?? targetProf?.quantity_unit,
          offer.package_size ?? targetProf?.package_size ?? targetProf?.canonical_name
        );
        if (
          targetQty &&
          candQty &&
          targetQty.kind === candQty.kind &&
          targetQty.baseValue > 0 &&
          candQty.baseValue > 0 &&
          Math.abs(targetQty.baseValue - candQty.baseValue) > 0.08 * targetQty.baseValue
        ) {
          effectivePrice = roundMoney((offer.price / candQty.baseValue) * targetQty.baseValue);
        }
      }

      const std = roundMoney(effectivePrice * qty);
      if (!useLoyaltyCards) return std;
      const loy = computeLoyaltyLineTotal(offer, qty, allowedLoyaltyPrograms);
      if (loy.loyaltyLineTotal === null) return std;
      return produceInfo.isProduce &&
        produceInfo.sellMode === 'per_kg' &&
        produceInfo.packWeightKg &&
        produceInfo.packWeightKg !== 1
        ? roundMoney((loy.loyaltyLineTotal / produceInfo.packWeightKg) * qty)
        : loy.loyaltyLineTotal;
    };

    const pushMatchedOffer = (
      item: BasketItemInput,
      offer: BeavyProductOffer,
      matchType: 'exact' | 'equivalent',
      eqProfile?: CatalogProductProfile,
      extras?: {
        isPrivateLabel?: boolean;
        isBudgetSwap?: boolean;
        baselineExactPrice?: number | null;
        budgetSavingsLine?: number;
        matchTier?: ProductMatchTier;
        intentMode?: IntentMode;
      }
    ) => {
      const targetProfile =
        eqProfile ?? (item.productId ? profilesById.get(item.productId) : undefined);
      const produceInfo = resolveProduceOfferPricing(offer, targetProfile);
      let effectiveUnitPrice =
        produceInfo.isProduce &&
        produceInfo.sellMode === 'per_kg' &&
        produceInfo.pricePerKg !== null
          ? produceInfo.pricePerKg
          : offer.price;

      if (!produceInfo.isProduce) {
        const baseItemProf = item.productId ? profilesById.get(item.productId) : undefined;
        const targetQty = toBaseQuantity(
          baseItemProf?.quantity_value,
          baseItemProf?.quantity_unit,
          item.packageSize ?? baseItemProf?.package_size ?? item.name
        );
        const candQty = toBaseQuantity(
          offer.quantity_value ?? targetProfile?.quantity_value,
          offer.quantity_unit ?? targetProfile?.quantity_unit,
          offer.package_size ?? targetProfile?.package_size ?? targetProfile?.canonical_name
        );
        if (
          targetQty &&
          candQty &&
          targetQty.kind === candQty.kind &&
          targetQty.baseValue > 0 &&
          candQty.baseValue > 0 &&
          Math.abs(targetQty.baseValue - candQty.baseValue) > 0.08 * targetQty.baseValue
        ) {
          effectiveUnitPrice = roundMoney((offer.price / candQty.baseValue) * targetQty.baseValue);
        }
      }

      const standardLineTotal = roundMoney(effectiveUnitPrice * item.quantity);
      const loy = computeLoyaltyLineTotal(offer, item.quantity, allowedLoyaltyPrograms);
      const effectiveLoyaltyLineTotal =
        loy.loyaltyLineTotal !== null
          ? produceInfo.isProduce &&
            produceInfo.sellMode === 'per_kg' &&
            produceInfo.packWeightKg &&
            produceInfo.packWeightKg !== 1
            ? roundMoney((loy.loyaltyLineTotal / produceInfo.packWeightKg) * item.quantity)
            : loy.loyaltyLineTotal
          : null;

      const lineTotal =
        useLoyaltyCards && effectiveLoyaltyLineTotal !== null
          ? effectiveLoyaltyLineTotal
          : standardLineTotal;
      standardSubtotalAccum += standardLineTotal;
      confirmedSubtotal += lineTotal;
      if (loy.hasLoyaltyOffer) {
        loyaltyOfferCount++;
        const savings = roundMoney(standardLineTotal - lineTotal);
        if (savings > 0) {
          potentialLoyaltySavings += savings;
        } else {
          loyaltyConditionalCount++;
        }
        if (!detectedLoyaltyLabel && offer.promo_label) {
          detectedLoyaltyLabel = offer.promo_label;
        }
      }
      const isTrueExactSku =
        matchType === 'exact' &&
        !extras?.isBudgetSwap &&
        (!extras?.matchTier || extras.matchTier === 'exact_sku');
      if (isTrueExactSku) exactCoveredCount++;
      else equivalentCoveredCount++;
      if (extras?.isBudgetSwap) {
        budgetSwapCount++;
        budgetSavingsTotal += extras.budgetSavingsLine ?? 0;
      }

      const resolvedIsPrivateLabel =
        extras?.isPrivateLabel ?? isPrivateLabelProduct(eqProfile);
      const resolvedMatchTier: ProductMatchTier =
        extras?.matchTier ??
        (matchType === 'exact'
          ? 'exact_sku'
          : resolvedIsPrivateLabel
            ? 'private_label_twin'
            : 'size_variant');

      matchedItems.push({
        item,
        offer,
        lineTotal,
        standardLineTotal,
        loyaltyLineTotal: effectiveLoyaltyLineTotal,
        loyaltySavings: roundMoney(standardLineTotal - lineTotal),
        hasLoyaltyOffer: loy.hasLoyaltyOffer,
        matchType,
        matchTier: resolvedMatchTier,
        intentMode: extras?.intentMode,
        equivalentProductId:
          matchType === 'equivalent' ? (eqProfile?.id ?? offer.product_id ?? null) : null,
        equivalentProductName: eqProfile?.canonical_name ?? null,
        equivalentPackageSize:
          matchType === 'equivalent'
            ? (eqProfile?.package_size ?? offer.package_size ?? null)
            : null,
        equivalentBrand: eqProfile?.brand ?? null,
        equivalentImageUrl: eqProfile?.image_url ?? offer.image_url ?? null,
        isPrivateLabel: resolvedIsPrivateLabel,
        isBudgetSwap: Boolean(extras?.isBudgetSwap),
        baselineExactPrice: extras?.baselineExactPrice ?? null,
        budgetSavingsLine: extras?.budgetSavingsLine ?? 0,
        produceMeta: produceInfo.isProduce ? produceInfo : undefined,
      });
      if (!lastObservedAt || new Date(offer.observed_at) > new Date(lastObservedAt)) {
        lastObservedAt = offer.observed_at;
      }
    };

    for (const item of items) {
      if (item.isCustom || !item.productId) {
        const genericIds = genericProductIdsByItemId.get(item.id) ?? [];
        if (genericIds.length === 0) {
          missingPriceItems.push(item);
          continue;
        }
        const itemIntent = parseShoppingIntent(item.name, item.brand, item.packageSize);
        let bestGenOffer: BeavyProductOffer | undefined;
        let bestGenProfile: CatalogProductProfile | undefined;
        let bestGenBoost = -Infinity;
        let bestGenTier: ProductMatchTier = 'functional_substitute';

        for (const gid of genericIds) {
          const candOffer = lookupRetailerOffer(gid);
          if (!candOffer) continue;
          const candProf = profilesById.get(gid);
          const evalRes = candProf
            ? evaluateCandidateAgainstIntent({
                intent: itemIntent,
                candidate: candProf,
                preferenceMemory,
                learnPreferencesEnabled,
              })
            : {
                compatible: true,
                scoreBoost: 0,
                tier: 'functional_substitute' as ProductMatchTier,
              };
          if (!evalRes.compatible) continue;

          if (!bestGenOffer) {
            bestGenOffer = candOffer;
            bestGenProfile = candProf;
            bestGenBoost = evalRes.scoreBoost;
            bestGenTier = evalRes.tier;
            continue;
          }

          // Dacă utilizatorul are o rezoluție învățată explicit pentru acest termen (scoreBoost >= 0.4), o prioritizăm
          const candHasStrongLearned = evalRes.scoreBoost >= 0.4;
          const currHasStrongLearned = bestGenBoost >= 0.4;
          if (candHasStrongLearned && !currHasStrongLearned) {
            bestGenOffer = candOffer;
            bestGenProfile = candProf;
            bestGenBoost = evalRes.scoreBoost;
            bestGenTier = evalRes.tier;
            continue;
          }
          if (!candHasStrongLearned && currHasStrongLearned) {
            continue;
          }

          const nextPick = pickBetterGenericOffer(bestGenOffer, candOffer);
          if (nextPick === candOffer) {
            bestGenOffer = candOffer;
            bestGenProfile = candProf;
            bestGenBoost = evalRes.scoreBoost;
            bestGenTier = evalRes.tier;
          }
        }
        if (bestGenOffer) {
          pushMatchedOffer(item, bestGenOffer, 'exact', bestGenProfile, {
            isPrivateLabel: false,
            isBudgetSwap: false,
            matchTier: bestGenTier,
            intentMode: itemIntent.intentMode,
          });
          continue;
        }
        missingPriceItems.push(item);
        continue;
      }

      const exactOffer = lookupRetailerOffer(item.productId);
      const exactProfile = profilesById.get(item.productId);
      const exactIsPrivateLabel = isPrivateLabelProduct(exactProfile);
      const isFreshProduceItem = isFreshProduceItemProfile(exactProfile);

      if (strategy === 'private_label_budget' && !isFreshProduceItem) {
        const plCandidateIds = getPrivateLabelCandidateIds(item.productId);
        let bestPlOffer: BeavyProductOffer | undefined;
        let bestPlProfile: CatalogProductProfile | undefined;

        for (const plId of plCandidateIds) {
          const candOffer = lookupRetailerOffer(plId);
          if (!candOffer) continue;
          if (
            !bestPlOffer ||
            getEffectiveLineTotal(candOffer, item.quantity) <
              getEffectiveLineTotal(bestPlOffer, item.quantity)
          ) {
            bestPlOffer = candOffer;
            bestPlProfile = profilesById.get(plId);
          }
        }

        if (exactOffer) {
          if (
            bestPlOffer &&
            isWorthBudgetSwap(exactOffer, exactProfile, bestPlOffer, bestPlProfile)
          ) {
            const lineSavings = roundMoney(
              getEffectiveLineTotal(exactOffer, item.quantity) -
                getEffectiveLineTotal(bestPlOffer, item.quantity)
            );
            pushMatchedOffer(item, bestPlOffer, 'equivalent', bestPlProfile, {
              isPrivateLabel: true,
              isBudgetSwap: true,
              baselineExactPrice: exactOffer.price,
              budgetSavingsLine: Math.max(0, lineSavings),
              matchTier: 'private_label_twin',
              intentMode: 'brand_locked',
            });
            continue;
          }

          pushMatchedOffer(item, exactOffer, 'exact', undefined, {
            isPrivateLabel: exactIsPrivateLabel,
            isBudgetSwap: false,
            matchTier: 'exact_sku',
            intentMode: 'brand_locked',
          });
          continue;
        }

        if (bestPlOffer) {
          const lowestExact = lowestExactPriceByProductId.get(item.productId) ?? null;
          const lineSavings =
            lowestExact !== null &&
            getEffectiveLineTotal(bestPlOffer, item.quantity) < roundMoney(lowestExact * item.quantity)
              ? roundMoney(
                  lowestExact * item.quantity -
                    getEffectiveLineTotal(bestPlOffer, item.quantity)
                )
              : 0;
          pushMatchedOffer(item, bestPlOffer, 'equivalent', bestPlProfile, {
            isPrivateLabel: true,
            isBudgetSwap: true,
            baselineExactPrice: lowestExact,
            budgetSavingsLine: lineSavings,
            matchTier: 'private_label_twin',
            intentMode: 'brand_locked',
          });
          continue;
        }
      }

      if (exactOffer && !isFreshProduceItem) {
        pushMatchedOffer(item, exactOffer, 'exact', undefined, {
          isPrivateLabel: exactIsPrivateLabel,
          isBudgetSwap: false,
          matchTier: 'exact_sku',
          intentMode: 'brand_locked',
        });
        continue;
      }

      const detectBrandCandidate = (name?: string | null): string | null => {
        if (!name) return null;
        const norm = normalizeCompareText(name);
        const KNOWN_NATIONAL_BRANDS = [
          'jacobs', 'monini', 'dorna', 'albalact', 'zuzu', 'covalact', 'napolact',
          'milli', 'hochland', 'president', 'olympus', 'danone', 'activia', 'borsec',
          'perla harghitei', 'aqua carpatica', 'bucovina', 'tusnad', 'san benedetto',
          'evian', 'vittel', 'barilla', 'de cecco', 'baneasa', 'panzani', 'mutti', 'cirio',
          'heinz', 'hellmanns', 'knorr', 'maggi', 'dr oetker', 'droetker', 'nutella', 'fineti',
          'milka', 'poiana', 'kandia', 'heidi', 'lindt', 'ferrero', 'raffaello',
          'lays', 'chio', 'pringles', 'doritos', 'star', 'coca cola', 'cocacola', 'coca-cola',
          'pepsi', 'fanta', 'sprite', 'schweppes', 'kinley', 'prigat', 'tymbark', 'cappy',
          'nescafe', 'lavazza', 'tchibo', 'doncafe', 'davidoff', 'julius meinl', 'costa', 'starbucks',
          'colgate', 'blendamed', 'oral b', 'sensodyne', 'dove', 'nivea', 'garnier', 'loreal',
          'head shoulders', 'pantene', 'palmolive', 'fa', 'rexona', 'axe', 'old spice', 'gillette',
          'ariel', 'tide', 'persil', 'perwoll', 'dero', 'bonux', 'lenor', 'silan', 'fairy', 'pur',
          'finish', 'calgon', 'domestos', 'cif', 'mr proper', 'duck', 'bref', 'clin', 'pronto',
          'ajax', 'zeva', 'pufina', 'regina', 'perfex', 'emeka', 'milde', 'papia', 'foxy', 'pampers',
          'huggies', 'bella', 'always', 'libresse', 'naturella', 'whiskas', 'felix', 'purina',
          'pedigree', 'friskies', 'chappi', 'gourmet', 'sheba'
        ];
        for (const nb of KNOWN_NATIONAL_BRANDS) {
          if (new RegExp(`\\b${nb.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(norm)) {
            return nb;
          }
        }
        return null;
      };

      const resolvedBrand = (
        item.brand ||
        exactProfile?.brand ||
        detectBrandCandidate(item.name) ||
        detectBrandCandidate(exactProfile?.canonical_name) ||
        ''
      ).trim();

      const isExplicitBrandLocked = Boolean(
        !isFreshProduceItem &&
        resolvedBrand.length > 0 &&
        !isPrivateLabelProduct(exactProfile) &&
        !PRIVATE_LABEL_BRANDS_SET.has(normalizeCompareText(resolvedBrand))
      );

      const targetPlOwner = resolvePrivateLabelOwnerRetailer(exactProfile);
      // Pentru mărcile proprii exclusive ale unui magazin (ex. Mega Apetit -> Mega Image),
      // în modul standard nu permitem substituția cu alte branduri la alți retaileri.
      // Pentru brandurile naționale sau generice (targetPlOwner === null), dacă magazinul
      // nu comercializează brandul exact/twin, permitem fallback la echivalentul compatibil.
      const allowForeignBrandEquivalents =
        strategy === 'private_label_budget' ||
        targetPlOwner === null ||
        (isFreshProduceItem && !isExplicitBrandLocked);

      const allowForeignEquivalentsForItem = includeEquivalents;

      if (allowForeignEquivalentsForItem) {
        const smart = getSmartMatchLists(item.productId);
        let twinOffer: BeavyProductOffer | undefined = exactOffer;
        for (const twinId of smart.crossExactIds) {
          const candOffer = lookupRetailerOffer(twinId);
          if (!candOffer) continue;
          const candProfile = profilesById.get(twinId);
          // Dacă produsul din coș este brand-locked, refuzăm twinOffer dacă este dintr-un brand diferit
          if (isExplicitBrandLocked && candProfile) {
            const candBrand = (
              candProfile.brand ||
              detectBrandCandidate(candProfile.canonical_name) ||
              ''
            ).trim();
            if (
              candBrand &&
              normalizeCompareText(candBrand) !== normalizeCompareText(resolvedBrand)
            ) {
              continue;
            }
            if (isPrivateLabelProduct(candProfile)) {
              continue;
            }
          }
          if (isFreshProduceItem) {
            twinOffer = pickBetterGenericOffer(twinOffer, candOffer);
          } else if (
            !twinOffer ||
            getEffectiveLineTotal(candOffer, item.quantity) <
              getEffectiveLineTotal(twinOffer, item.quantity)
          ) {
            twinOffer = candOffer;
          }
        }
        if (twinOffer) {
          pushMatchedOffer(item, twinOffer, 'exact', undefined, {
            isPrivateLabel: exactIsPrivateLabel,
            isBudgetSwap: false,
            matchTier: 'exact_sku',
            intentMode: 'brand_locked',
          });
          continue;
        }

        if (allowForeignBrandEquivalents) {
          let equivalentOffer: BeavyProductOffer | undefined;
          let equivalentProfile: CatalogProductProfile | undefined;
          let bestEqScore = -1;
          for (const entry of smart.rankedEqIds) {
            const candOffer = lookupRetailerOffer(entry.id);
            if (!candOffer) continue;
            const candLine = getEffectiveLineTotal(candOffer, item.quantity);
            const baselinePrice =
              exactOffer?.price ?? lowestExactPriceByProductId.get(item.productId);
            if (baselinePrice && baselinePrice > 0) {
              const baselineLine = roundMoney(baselinePrice * item.quantity);
              // Un substitut nu poate depăși cu peste 15% prețul de referință al pieței!
              if (candLine > roundMoney(baselineLine * 1.15)) {
                continue;
              }
              // În modul de buget, alternativa trebuie să fie strict mai ieftină!
              if (strategy === 'private_label_budget' && candLine >= baselineLine) {
                continue;
              }
            } else if (strategy === 'private_label_budget') {
              // Fără preț de referință exact pe piață, nu putem garanta că este o economie reală de buget
              continue;
            }

            if (
              !equivalentOffer ||
              entry.score > bestEqScore + 0.05 ||
              (Math.abs(entry.score - bestEqScore) <= 0.05 &&
                candLine < getEffectiveLineTotal(equivalentOffer, item.quantity))
            ) {
              equivalentOffer = candOffer;
              equivalentProfile = profilesById.get(entry.id);
              bestEqScore = entry.score;
            }
          }

          if (equivalentOffer) {
            const isEqPl = isPrivateLabelProduct(equivalentProfile);
            pushMatchedOffer(item, equivalentOffer, 'equivalent', equivalentProfile, {
              isPrivateLabel: isEqPl,
              isBudgetSwap: strategy === 'private_label_budget',
              matchTier: isEqPl ? 'private_label_twin' : 'size_variant',
              intentMode: 'brand_locked',
            });
            continue;
          }

          // Layer 2 (Product Intelligence): în modul de buget, dacă magazinul nu comercializează
          // brandul național cerut, folosim marca proprie ca substitut de buget.
          if (strategy === 'private_label_budget' && !isFreshProduceItem) {
            const fallbackPlIds = getPrivateLabelCandidateIds(item.productId);
            let fallbackPlOffer: BeavyProductOffer | undefined;
            let fallbackPlProfile: CatalogProductProfile | undefined;
            for (const plId of fallbackPlIds) {
              const candOffer = lookupRetailerOffer(plId);
              if (!candOffer) continue;
              const candLine = getEffectiveLineTotal(candOffer, item.quantity);
              const baselinePrice =
                exactOffer?.price ?? lowestExactPriceByProductId.get(item.productId);
              if (baselinePrice && baselinePrice > 0) {
                const baselineLine = roundMoney(baselinePrice * item.quantity);
                if (candLine >= baselineLine) {
                  continue; // Doar alternative strict mai economice!
                }
              }

              if (
                !fallbackPlOffer ||
                candLine < getEffectiveLineTotal(fallbackPlOffer, item.quantity)
              ) {
                fallbackPlOffer = candOffer;
                fallbackPlProfile = profilesById.get(plId);
              }
            }
            if (fallbackPlOffer) {
              pushMatchedOffer(item, fallbackPlOffer, 'equivalent', fallbackPlProfile, {
                isPrivateLabel: true,
                isBudgetSwap: true,
                matchTier: 'functional_substitute',
                intentMode: 'brand_locked',
              });
              continue;
            }
          }
        }
      }

      const exactOosOffer = lookupRetailerOos(item.productId);
      if (exactOosOffer) {
        unavailableItems.push({
          item,
          offer: exactOosOffer,
          matchType: 'exact',
          equivalentProductName: null,
        });
        continue;
      }

      missingPriceItems.push(item);
    }

    confirmedSubtotal = roundMoney(confirmedSubtotal);
    const standardSubtotalWithoutLoyalty = roundMoney(standardSubtotalAccum);
    potentialLoyaltySavings = roundMoney(potentialLoyaltySavings);
    budgetSavingsTotal = roundMoney(budgetSavingsTotal);
    const coveredCount = matchedItems.length;
    const coveragePercent =
      totalItemsCount > 0 ? Math.round((coveredCount / totalItemsCount) * 100) : 0;

    const fees = computeRetailerFees(
      confirmedSubtotal,
      coveredCount,
      retailer,
      channelFilter,
      fulfillmentNodes,
      rulesByNodeId
    );

    const estimatedTotalWithFees = roundMoney(confirmedSubtotal + fees.estimatedFeesTotal);
    const estimatedTotalWithLoyalty = useLoyaltyCards
      ? estimatedTotalWithFees
      : Math.max(
          0,
          roundMoney(estimatedTotalWithFees - potentialLoyaltySavings)
        );
    const loyaltyProgramName =
      loyaltyOfferCount > 0
        ? resolveLoyaltyProgramName(retailer.name, detectedLoyaltyLabel)
        : null;

    let channelLabel = 'Magazin fizic & Livrare';
    if (retailer.supports_physical && !retailer.supports_delivery) {
      channelLabel = 'Magazin fizic';
    } else if (!retailer.supports_physical && retailer.supports_delivery) {
      channelLabel = 'Livrare online';
    }

    const missingItems = [...unavailableItems.map((u) => u.item), ...missingPriceItems];

    return {
      retailer,
      channelLabel,
      coveredCount,
      exactCoveredCount,
      equivalentCoveredCount,
      budgetSwapCount,
      budgetSavingsTotal,
      totalItemsCount,
      coveragePercent,
      confirmedSubtotal,
      standardSubtotalWithoutLoyalty,
      loyaltyOfferCount,
      loyaltyConditionalCount,
      potentialLoyaltySavings,
      estimatedTotalWithLoyalty,
      appliedLoyaltyCards: useLoyaltyCards,
      loyaltyProgramName,
      deliveryFee: fees.deliveryFee,
      serviceFee: fees.serviceFee,
      packagingFee: fees.packagingFee,
      smallOrderFee: fees.smallOrderFee,
      estimatedFeesTotal: fees.estimatedFeesTotal,
      estimatedTotalWithFees,
      freeDeliveryThreshold: fees.freeDeliveryThreshold,
      minimumOrderValue: fees.minimumOrderValue,
      belowMinimumOrder: fees.belowMinimumOrder,
      matchedNodeName: fees.matchedNodeName,
      currency: 'RON',
      matchedItems,
      unavailableItems,
      missingPriceItems,
      missingItems,
      lastObservedAt,
      hasFullCatalogCoverage: catalogItemsCount > 0 && coveredCount === catalogItemsCount,
      hasFullBasketCoverage: totalItemsCount > 0 && coveredCount === totalItemsCount,
    };
  });

  retailerSummaries.sort((a, b) => {
    if (strategy === 'standard') {
      const aExactFull = a.exactCoveredCount === a.totalItemsCount && a.totalItemsCount > 0 ? 1 : 0;
      const bExactFull = b.exactCoveredCount === b.totalItemsCount && b.totalItemsCount > 0 ? 1 : 0;
      if (bExactFull !== aExactFull) return bExactFull - aExactFull;
    }
    if (b.coveredCount !== a.coveredCount) return b.coveredCount - a.coveredCount;
    const aPref = preferredRetailerSlugs.includes(a.retailer.slug) ? 1 : 0;
    const bPref = preferredRetailerSlugs.includes(b.retailer.slug) ? 1 : 0;
    if (bPref !== aPref) return bPref - aPref;
    return a.estimatedTotalWithFees - b.estimatedTotalWithFees;
  });

  const fullyCoveredStores = retailerSummaries.filter(
    (s) => s.coveredCount > 0 && s.hasFullCatalogCoverage
  );

  const canCompareFairly = fullyCoveredStores.length >= 2;
  let potentialSavings: number | null = null;
  let cheapestComparableRetailerId: string | null = null;

  if (canCompareFairly) {
    const sortedByTotal = [...fullyCoveredStores].sort(
      (a, b) => a.estimatedTotalWithFees - b.estimatedTotalWithFees
    );
    const cheapest = sortedByTotal[0];
    const highest = sortedByTotal[sortedByTotal.length - 1];
    cheapestComparableRetailerId = cheapest.retailer.id;
    potentialSavings = Math.max(
      0,
      roundMoney(highest.estimatedTotalWithFees - cheapest.estimatedTotalWithFees)
    );
  }

  let transparencyNote = '';
  const hasAnyEquivalents = retailerSummaries.some((s) => s.equivalentCoveredCount > 0);
  const hasAnyFees = retailerSummaries.some((s) => s.estimatedFeesTotal > 0);

  if (totalItemsCount === 0) {
    transparencyNote =
      'Adaugă produse pe listă pentru a verifica acoperirea și prețurile din magazine.';
  } else if (coveredItemsCount === 0 && !hasAnyEquivalents) {
    transparencyNote =
      unavailableItemsCount > 0
        ? 'Unele produse apar indisponibile în ofertele magazinelor, iar pentru restul nu există date active de preț. Nu afișăm estimări neverificate.'
        : 'Produsele din lista ta sunt identificate corect, însă în acest moment nu există oferte de preț active încărcate în baza de date pentru ele. Nu afișăm estimări neverificate.';
  } else if (!canCompareFairly) {
    transparencyNote =
      'Unele produse sau magazine au acoperire parțială. Totalul afișat include strict produsele cu ofertă confirmată și nu desemnează un câștigător incomplet.';
  } else {
    const notes = ['Comparație realizată pe baza celor mai recente oferte verificate'];
    if (hasAnyEquivalents) {
      notes.push('inclusiv alternative echivalente marcate transparent');
    }
    if (hasAnyFees) {
      notes.push('cu taxele de livrare estimate din regulile magazinului');
    }
    transparencyNote = `${notes.join(', ')}.`;
  }

  const bestStoreMix = computeBestMultiStoreMix({
    items,
    retailerSummaries,
    totalItemsCount,
    catalogItemsCount,
    channelFilter,
    fulfillmentNodes,
    rulesByNodeId,
    preferredRetailerSlugs,
    strategy,
    useLoyaltyCards,
    minSplitSavingsRon,
  });

  return {
    retailers,
    retailerSummaries,
    itemStatuses,
    totalItemsCount,
    totalUnitsCount,
    catalogItemsCount,
    manualItemsCount,
    coveredItemsCount,
    unavailableItemsCount,
    noPriceItemsCount,
    overallCoveragePercent,
    latestOfferDate,
    canCompareFairly,
    potentialSavings,
    cheapestComparableRetailerId,
    bestStoreMix,
    transparencyNote,
    strategy,
    appliedLoyaltyCards: useLoyaltyCards,
  };
}

const MAX_MIX_CANDIDATE_STORES = 10;
const MAX_MIX_STOPS = 2;

/**
 * Calculează cel mai ieftin mix optim între maximum două magazine active,
 * luând în calcul taxele reale de livrare, pragurile de comandă minimă online
 * și evitând oprirea într-un magazin suplimentar la prețuri egale.
 */
export function computeBestMultiStoreMix(params: {
  items: BasketItemInput[];
  retailerSummaries: RetailerComparisonSummary[];
  totalItemsCount: number;
  catalogItemsCount: number;
  channelFilter: 'all' | 'physical' | 'online';
  fulfillmentNodes: BeavyFulfillmentNode[];
  rulesByNodeId: Map<string, BeavyFulfillmentRule>;
  preferredRetailerSlugs?: string[];
  strategy?: BasketVariantMode;
  useLoyaltyCards?: boolean;
  minSplitSavingsRon?: number;
}): MultiStoreMixPlan | null {
  const {
    items,
    retailerSummaries,
    totalItemsCount,
    catalogItemsCount,
    channelFilter,
    fulfillmentNodes,
    rulesByNodeId,
    preferredRetailerSlugs = [],
    strategy = 'standard',
    useLoyaltyCards = false,
    minSplitSavingsRon,
  } = params;

  const matchedItemIdsAcrossRetailers = new Set<string>();
  for (const s of retailerSummaries) {
    for (const m of s.matchedItems) {
      matchedItemIdsAcrossRetailers.add(m.item.id);
    }
  }
  const catalogItems = items.filter(
    (it) => (!it.isCustom && Boolean(it.productId)) || matchedItemIdsAcrossRetailers.has(it.id)
  );
  if (catalogItems.length < 2) {
    return null;
  }

  const nonEmptyCandidates = retailerSummaries.filter((s) => s.coveredCount > 0);
  if (nonEmptyCandidates.length < 2) {
    return null;
  }

  const preferredSet = new Set(preferredRetailerSlugs);

  const sortedSingles = [...nonEmptyCandidates].sort((a, b) => {
    if (b.coveredCount !== a.coveredCount) return b.coveredCount - a.coveredCount;
    const aBelow = a.belowMinimumOrder ? 1 : 0;
    const bBelow = b.belowMinimumOrder ? 1 : 0;
    if (aBelow !== bBelow) return aBelow - bBelow;
    if (Math.abs(a.estimatedTotalWithFees - b.estimatedTotalWithFees) > 0.009) {
      return a.estimatedTotalWithFees - b.estimatedTotalWithFees;
    }
    const aPref = preferredSet.has(a.retailer.slug) ? 1 : 0;
    const bPref = preferredSet.has(b.retailer.slug) ? 1 : 0;
    return bPref - aPref;
  });

  const bestSingle = sortedSingles[0];
  if (!bestSingle) return null;

  let candidates = sortedSingles;
  if (sortedSingles.length > MAX_MIX_CANDIDATE_STORES) {
    const selectedIds = new Set<string>();
    const perCandidateMatchMap = sortedSingles.map((s) => {
      const m = new Map<string, MatchedBasketItem>();
      for (const matched of s.matchedItems) {
        m.set(matched.item.id, matched);
      }
      return m;
    });

    for (const s of sortedSingles.slice(0, 6)) {
      selectedIds.add(s.retailer.id);
    }

    for (const item of catalogItems) {
      let minLine = Infinity;
      for (const m of perCandidateMatchMap) {
        const hit = m.get(item.id);
        if (hit && hit.lineTotal < minLine) {
          minLine = hit.lineTotal;
        }
      }
      if (Number.isFinite(minLine)) {
        for (let idx = 0; idx < sortedSingles.length; idx++) {
          const hit = perCandidateMatchMap[idx].get(item.id);
          if (hit && hit.lineTotal <= minLine + 0.009) {
            selectedIds.add(sortedSingles[idx].retailer.id);
            if (selectedIds.size >= MAX_MIX_CANDIDATE_STORES) break;
          }
        }
      }
      if (selectedIds.size >= MAX_MIX_CANDIDATE_STORES) break;
    }

    candidates = sortedSingles
      .filter((s) => selectedIds.has(s.retailer.id))
      .slice(0, MAX_MIX_CANDIDATE_STORES);
  }

  const m = candidates.length;
  if (m < 2) return null;

  const matchMaps: Map<string, MatchedBasketItem>[] = candidates.map((cand) => {
    const map = new Map<string, MatchedBasketItem>();
    for (const matched of cand.matchedItems) {
      map.set(matched.item.id, matched);
    }
    return map;
  });

  const maxStops = Math.min(MAX_MIX_STOPS, m);

  type CandidateMixEval = {
    stops: MultiStoreMixStop[];
    coveredItemsCount: number;
    subtotal: number;
    estimatedFeesTotal: number;
    totalWithFees: number;
    physicalStopsCount: number;
    maxStopItemsCount: number;
    preferredStopsCount: number;
    exactCoveredCount: number;
    equivalentCoveredCount: number;
    budgetSwapCount: number;
    budgetSavingsTotal: number;
    potentialLoyaltySavings: number;
    estimatedTotalWithLoyalty: number;
  };

  let bestEval: CandidateMixEval | null = null;
  const totalMasks = 1 << m;

  for (let mask = 1; mask < totalMasks; mask++) {
    let pop = 0;
    const subsetIndices: number[] = [];
    for (let bit = 0; bit < m; bit++) {
      if ((mask & (1 << bit)) !== 0) {
        pop++;
        subsetIndices.push(bit);
      }
    }
    if (pop < 2 || pop > maxStops) continue;

    const assignedByCand = new Map<number, MatchedBasketItem[]>();
    const lockedCount = new Map<number, number>();
    const eligibilityCount = new Map<number, number>();
    for (const cIdx of subsetIndices) {
      assignedByCand.set(cIdx, []);
      lockedCount.set(cIdx, 0);
      eligibilityCount.set(cIdx, 0);
    }

    type TiedCandidate = { cIdx: number; match: MatchedBasketItem };
    const tiedItems: { item: BasketItemInput; tied: TiedCandidate[] }[] = [];

    for (const item of catalogItems) {
      const available: TiedCandidate[] = [];
      for (const cIdx of subsetIndices) {
        const hit = matchMaps[cIdx].get(item.id);
        if (hit) {
          available.push({ cIdx, match: hit });
          eligibilityCount.set(cIdx, (eligibilityCount.get(cIdx) ?? 0) + 1);
        }
      }
      if (available.length === 0) continue;

      let minPrice = Infinity;
      for (const entry of available) {
        if (entry.match.lineTotal < minPrice) {
          minPrice = entry.match.lineTotal;
        }
      }

      let tied = available.filter((e) => e.match.lineTotal <= minPrice + 0.009);
      if (strategy === 'standard') {
        const exactTied = tied.filter((e) => e.match.matchType === 'exact');
        if (exactTied.length > 0) {
          tied = exactTied;
        }
      }

      if (tied.length === 1) {
        const only = tied[0];
        assignedByCand.get(only.cIdx)!.push(only.match);
        lockedCount.set(only.cIdx, (lockedCount.get(only.cIdx) ?? 0) + 1);
      } else {
        tiedItems.push({ item, tied });
      }
    }

    for (const entry of tiedItems) {
      entry.tied.sort((a, b) => {
        const aAssigned = assignedByCand.get(a.cIdx)!.length > 0 ? 1 : 0;
        const bAssigned = assignedByCand.get(b.cIdx)!.length > 0 ? 1 : 0;
        if (bAssigned !== aAssigned) return bAssigned - aAssigned;

        const aLocked = lockedCount.get(a.cIdx) ?? 0;
        const bLocked = lockedCount.get(b.cIdx) ?? 0;
        if (bLocked !== aLocked) return bLocked - aLocked;

        const aElig = eligibilityCount.get(a.cIdx) ?? 0;
        const bElig = eligibilityCount.get(b.cIdx) ?? 0;
        if (bElig !== aElig) return bElig - aElig;

        const aPhys = candidates[a.cIdx].retailer.supports_physical ? 1 : 0;
        const bPhys = candidates[b.cIdx].retailer.supports_physical ? 1 : 0;
        if (bPhys !== aPhys) return bPhys - aPhys;

        const aPref = preferredSet.has(candidates[a.cIdx].retailer.slug) ? 1 : 0;
        const bPref = preferredSet.has(candidates[b.cIdx].retailer.slug) ? 1 : 0;
        if (bPref !== aPref) return bPref - aPref;

        if (candidates[b.cIdx].coveredCount !== candidates[a.cIdx].coveredCount) {
          return candidates[b.cIdx].coveredCount - candidates[a.cIdx].coveredCount;
        }
        return a.cIdx - b.cIdx;
      });

      const chosen = entry.tied[0];
      assignedByCand.get(chosen.cIdx)!.push(chosen.match);
    }

    const activeIndices = subsetIndices.filter(
      (cIdx) => assignedByCand.get(cIdx)!.length > 0
    );
    // Dacă un magazin din mască nu a primit niciun produs, combinația efectivă este un subset mai mic deja evaluat.
    if (activeIndices.length < 2 || activeIndices.length !== subsetIndices.length) {
      continue;
    }

    let validSubset = true;
    const stops: MultiStoreMixStop[] = [];
    let mixCovered = 0;
    let mixSubtotal = 0;
    let mixFees = 0;
    let mixExact = 0;
    let mixEquiv = 0;
    let mixBudgetSwapCount = 0;
    let mixBudgetSavings = 0;
    let mixLoyaltySavings = 0;
    let physicalStopsCount = 0;
    let preferredStopsCount = 0;
    let maxStopItemsCount = 0;

    for (const cIdx of activeIndices) {
      const cand = candidates[cIdx];
      const stopItems = assignedByCand.get(cIdx)!;
      const subtotal = roundMoney(stopItems.reduce((sum, it) => sum + it.lineTotal, 0));

      const fees = computeRetailerFees(
        subtotal,
        stopItems.length,
        cand.retailer,
        channelFilter,
        fulfillmentNodes,
        rulesByNodeId
      );

      if (fees.belowMinimumOrder) {
        validSubset = false;
        break;
      }

      // În modul „Toate canalele”, nu recomandăm împărțirea doar pentru preț către un magazin exclusiv online
      // dacă acesta nu are reguli de livrare / comandă minimă configurate (ar omite costul real de transport).
      const isOnlineOnlyStore =
        !cand.retailer.supports_physical && cand.retailer.supports_delivery;
      if (isOnlineOnlyStore && !fees.matchedNodeName && channelFilter !== 'online') {
        const subsetTotalCovered = activeIndices.reduce(
          (sum, idx) => sum + assignedByCand.get(idx)!.length,
          0
        );
        if (subsetTotalCovered <= bestSingle.coveredCount) {
          validSubset = false;
          break;
        }
      }

      let exactCount = 0;
      let equivCount = 0;
      let swapCount = 0;
      let swapSavings = 0;
      let loyaltyCount = 0;
      let loyaltySavings = 0;
      let detectedLoyaltyLabel: string | null = null;

      for (const mItem of stopItems) {
        if (mItem.matchType === 'exact') exactCount++;
        else equivCount++;
        if (mItem.isBudgetSwap) {
          swapCount++;
          swapSavings += mItem.budgetSavingsLine ?? 0;
        }
        if (mItem.hasLoyaltyOffer) {
          loyaltyCount++;
          loyaltySavings += mItem.loyaltySavings;
          if (!detectedLoyaltyLabel && mItem.offer.promo_label) {
            detectedLoyaltyLabel = mItem.offer.promo_label;
          }
        }
      }

      swapSavings = roundMoney(swapSavings);
      loyaltySavings = roundMoney(loyaltySavings);
      const totalWithFees = roundMoney(subtotal + fees.estimatedFeesTotal);
      const estimatedTotalWithLoyalty = useLoyaltyCards
        ? totalWithFees
        : Math.max(0, roundMoney(totalWithFees - loyaltySavings));
      const loyaltyProgramName =
        loyaltyCount > 0
          ? resolveLoyaltyProgramName(cand.retailer.name, detectedLoyaltyLabel)
          : null;

      stops.push({
        retailer: cand.retailer,
        channelLabel: cand.channelLabel,
        items: stopItems,
        itemsCount: stopItems.length,
        exactCoveredCount: exactCount,
        equivalentCoveredCount: equivCount,
        budgetSwapCount: swapCount,
        budgetSavingsTotal: swapSavings,
        subtotal,
        deliveryFee: fees.deliveryFee,
        serviceFee: fees.serviceFee,
        packagingFee: fees.packagingFee,
        smallOrderFee: fees.smallOrderFee,
        estimatedFeesTotal: fees.estimatedFeesTotal,
        totalWithFees,
        loyaltyOfferCount: loyaltyCount,
        potentialLoyaltySavings: loyaltySavings,
        estimatedTotalWithLoyalty,
        loyaltyProgramName,
        freeDeliveryThreshold: fees.freeDeliveryThreshold,
        minimumOrderValue: fees.minimumOrderValue,
        belowMinimumOrder: fees.belowMinimumOrder,
      });

      mixCovered += stopItems.length;
      mixSubtotal += subtotal;
      mixFees += fees.estimatedFeesTotal;
      mixExact += exactCount;
      mixEquiv += equivCount;
      mixBudgetSwapCount += swapCount;
      mixBudgetSavings += swapSavings;
      mixLoyaltySavings += loyaltySavings;
      if (cand.retailer.supports_physical) physicalStopsCount++;
      if (preferredSet.has(cand.retailer.slug)) preferredStopsCount++;
      if (stopItems.length > maxStopItemsCount) maxStopItemsCount = stopItems.length;
    }

    if (!validSubset) continue;

    mixSubtotal = roundMoney(mixSubtotal);
    mixFees = roundMoney(mixFees);
    const mixTotalWithFees = roundMoney(mixSubtotal + mixFees);
    mixBudgetSavings = roundMoney(mixBudgetSavings);
    mixLoyaltySavings = roundMoney(mixLoyaltySavings);

    if (mixCovered < bestSingle.coveredCount) {
      continue;
    }

    const improvesCoverage = mixCovered > bestSingle.coveredCount;
    const strictlyCheaper = mixTotalWithFees < bestSingle.estimatedTotalWithFees - 0.009;
    if (!improvesCoverage && !strictlyCheaper) {
      continue;
    }

    const candidatePlan: CandidateMixEval = {
      stops,
      coveredItemsCount: mixCovered,
      subtotal: mixSubtotal,
      estimatedFeesTotal: mixFees,
      totalWithFees: mixTotalWithFees,
      physicalStopsCount,
      maxStopItemsCount,
      preferredStopsCount,
      exactCoveredCount: mixExact,
      equivalentCoveredCount: mixEquiv,
      budgetSwapCount: mixBudgetSwapCount,
      budgetSavingsTotal: mixBudgetSavings,
      potentialLoyaltySavings: mixLoyaltySavings,
      estimatedTotalWithLoyalty: useLoyaltyCards
        ? mixTotalWithFees
        : Math.max(0, roundMoney(mixTotalWithFees - mixLoyaltySavings)),
    };

    const isBetter =
      !bestEval ||
      candidatePlan.coveredItemsCount > bestEval.coveredItemsCount ||
      (candidatePlan.coveredItemsCount === bestEval.coveredItemsCount &&
        (candidatePlan.totalWithFees < bestEval.totalWithFees - 0.009 ||
          (Math.abs(candidatePlan.totalWithFees - bestEval.totalWithFees) <= 0.009 &&
            (candidatePlan.stops.length < bestEval.stops.length ||
              (candidatePlan.stops.length === bestEval.stops.length &&
                (candidatePlan.physicalStopsCount > bestEval.physicalStopsCount ||
                  (candidatePlan.physicalStopsCount === bestEval.physicalStopsCount &&
                    (candidatePlan.maxStopItemsCount > bestEval.maxStopItemsCount ||
                      (candidatePlan.maxStopItemsCount === bestEval.maxStopItemsCount &&
                        candidatePlan.preferredStopsCount > bestEval.preferredStopsCount)))))))));

    if (isBetter) {
      bestEval = candidatePlan;
    }
  }

  if (!bestEval) return null;

  const sortedStops = [...bestEval.stops].sort((a, b) => {
    if (b.itemsCount !== a.itemsCount) return b.itemsCount - a.itemsCount;
    if (Math.abs(b.subtotal - a.subtotal) > 0.009) return b.subtotal - a.subtotal;
    const aPref = preferredSet.has(a.retailer.slug) ? 1 : 0;
    const bPref = preferredSet.has(b.retailer.slug) ? 1 : 0;
    if (bPref !== aPref) return bPref - aPref;
    return a.retailer.name.localeCompare(b.retailer.name, 'ro');
  });

  const improvesCoverage = bestEval.coveredItemsCount > bestSingle.coveredCount;
  const comparableSavings =
    !improvesCoverage &&
    bestEval.coveredItemsCount === bestSingle.coveredCount &&
    bestSingle.estimatedTotalWithFees > bestEval.totalWithFees
      ? roundMoney(bestSingle.estimatedTotalWithFees - bestEval.totalWithFees)
      : 0;
  const savingsPercent =
    comparableSavings > 0 && bestSingle.estimatedTotalWithFees > 0
      ? Math.round((comparableSavings / bestSingle.estimatedTotalWithFees) * 100)
      : 0;

  if (
    !isMultiStoreSplitWorthwhile({
      improvesCoverage,
      savingsRon: comparableSavings,
      bestSingleTotalRon: bestSingle.estimatedTotalWithFees,
      minSplitSavingsRon,
    })
  ) {
    return null;
  }

  return {
    stops: sortedStops,
    coveredItemsCount: bestEval.coveredItemsCount,
    totalItemsCount,
    catalogItemsCount,
    coveragePercent:
      totalItemsCount > 0 ? Math.round((bestEval.coveredItemsCount / totalItemsCount) * 100) : 0,
    hasFullCatalogCoverage: catalogItemsCount > 0 && bestEval.coveredItemsCount === catalogItemsCount,
    hasFullBasketCoverage: totalItemsCount > 0 && bestEval.coveredItemsCount === totalItemsCount,
    exactCoveredCount: bestEval.exactCoveredCount,
    equivalentCoveredCount: bestEval.equivalentCoveredCount,
    budgetSwapCount: bestEval.budgetSwapCount,
    budgetSavingsTotal: bestEval.budgetSavingsTotal,
    subtotal: bestEval.subtotal,
    estimatedFeesTotal: bestEval.estimatedFeesTotal,
    totalWithFees: bestEval.totalWithFees,
    potentialLoyaltySavings: bestEval.potentialLoyaltySavings,
    estimatedTotalWithLoyalty: bestEval.estimatedTotalWithLoyalty,
    bestSingleStoreId: bestSingle.retailer.id,
    bestSingleStoreName: bestSingle.retailer.name,
    bestSingleStoreTotal: bestSingle.estimatedTotalWithFees,
    bestSingleStoreCoveredCount: bestSingle.coveredCount,
    savingsVsBestSingleStore: comparableSavings,
    savingsPercentVsBestSingleStore: savingsPercent,
    improvesCoverage,
    strategy,
    appliedLoyaltyCards: useLoyaltyCards,
  };
}

/**
 * Calculează atât varianta standard (produsele exacte din listă),
 * cât și varianta low-budget cu alternative compatibile de marcă proprie.
 */
export function computeDualBasketComparison(params: {
  items: BasketItemInput[];
  retailers: BeavyRetailer[];
  offers: BeavyProductOffer[];
  fulfillmentNodes?: BeavyFulfillmentNode[];
  fulfillmentRules?: BeavyFulfillmentRule[];
  profilesById?: Map<string, CatalogProductProfile>;
  equivalentIdsByProductId?: Map<string, string[]>;
  privateLabelIdsByProductId?: Map<string, string[]>;
  genericProductIdsByItemId?: Map<string, string[]>;
  channelFilter?: 'all' | 'physical' | 'online';
  city?: string;
  preferredRetailerSlugs?: string[];
  includeEquivalents?: boolean;
  useLoyaltyCards?: boolean;
  allowedLoyaltyPrograms?: string[] | null;
  preferenceMemory?: UserPreferenceMemory | null;
  learnPreferencesEnabled?: boolean;
  minSplitSavingsRon?: number;
}): DualBasketComparisonResult {
  const standard = computeBasketComparison({
    ...params,
    strategy: 'standard',
  });
  const budget = computeBasketComparison({
    ...params,
    strategy: 'private_label_budget',
  });

  const stdInsights = computeBasketInsights(standard);
  const bgtInsights = computeBasketInsights(budget);
  const stdBest = stdInsights.bestStore;
  const bgtBest = bgtInsights.bestStore;

  const canCompareStandardVsBudgetFairly = Boolean(
    stdBest &&
      bgtBest &&
      stdBest.coveredCount > 0 &&
      bgtBest.coveredCount > 0 &&
      (bgtBest.hasFullCatalogCoverage || bgtBest.coveredCount >= stdBest.coveredCount)
  );

  const standardBestTotal = stdBest ? stdBest.estimatedTotalWithFees : null;
  const budgetBestTotal = bgtBest ? bgtBest.estimatedTotalWithFees : null;
  const rawSavings =
    canCompareStandardVsBudgetFairly &&
    standardBestTotal !== null &&
    budgetBestTotal !== null &&
    budgetBestTotal < standardBestTotal
      ? roundMoney(standardBestTotal - budgetBestTotal)
      : null;

  const savingsPercent =
    rawSavings !== null &&
    rawSavings > 0 &&
    standardBestTotal !== null &&
    standardBestTotal > 0
      ? Math.max(1, Math.round((rawSavings / standardBestTotal) * 100))
      : 0;

  const swappedItemsCountAtBest = bgtBest?.budgetSwapCount ?? 0;
  const hasAnyBudgetSwaps = budget.retailerSummaries.some(
    (s) => (s.budgetSwapCount ?? 0) > 0
  );

  return {
    standard,
    budget,
    budgetSummary: {
      standardBestTotal,
      standardBestStoreName: stdBest?.retailer.name ?? null,
      budgetBestTotal,
      budgetBestStoreName: bgtBest?.retailer.name ?? null,
      savingsVsStandardBest: rawSavings,
      savingsPercentVsStandardBest: savingsPercent,
      swappedItemsCountAtBest,
      hasBudgetVariant: swappedItemsCountAtBest > 0 || hasAnyBudgetSwaps,
      canCompareStandardVsBudgetFairly,
    },
  };
}

/**
 * Încarcă o singură dată produsele, ofertele și regulile de livrare din Supabase
 * și returnează simultan comparația exactă și varianta low-budget marcă proprie.
 */
export async function compareShoppingBasketWithVariants(
  items: BasketItemInput[],
  options: {
    channelFilter?: 'all' | 'physical' | 'online';
    city?: string;
    preferredRetailerSlugs?: string[];
    includeEquivalents?: boolean;
    useLoyaltyCards?: boolean;
    allowedLoyaltyPrograms?: string[] | null;
    preferenceMemory?: UserPreferenceMemory | null;
    learnPreferencesEnabled?: boolean;
    minSplitSavingsRon?: number;
  } = {}
): Promise<DualBasketComparisonResult> {
  const channelFilter = options.channelFilter ?? 'all';
  const includeEquivalents = options.includeEquivalents ?? true;
  const useLoyaltyCards = options.useLoyaltyCards ?? false;
  const allowedLoyaltyPrograms = options.allowedLoyaltyPrograms ?? null;
  const preferenceMemory = options.preferenceMemory ?? null;
  const learnPreferencesEnabled = options.learnPreferencesEnabled ?? true;
  const minSplitSavingsRon = options.minSplitSavingsRon;

  const catalogProductIds = Array.from(
    new Set(
      items
        .filter((it) => !it.isCustom && Boolean(it.productId))
        .map((it) => it.productId as string)
    )
  );
  const genericItems = items.filter((it) => (it.isCustom || !it.productId) && it.name.trim().length >= 2);

  const [allRetailers, fulfillmentData, catalogData, genericResolvedPairs] = await Promise.all([
    fetchActiveRetailers(),
    fetchActiveFulfillmentData(options.city),
    fetchCatalogAndEquivalentProfilesMap(catalogProductIds, includeEquivalents, true),
    Promise.all(
      genericItems.map(async (it) => ({
        itemId: it.id,
        profiles: await resolveGenericTermCatalogMatches(it.name, 45, {
          preferenceMemory,
          learnPreferencesEnabled,
        }).catch(
          () => [] as CatalogProductProfile[]
        ),
      }))
    ),
  ]);

  const queryProductIds = new Set<string>(catalogProductIds);
  for (const eqIds of catalogData.equivalentIdsByProductId.values()) {
    for (const eqId of eqIds) queryProductIds.add(eqId);
  }
  for (const plIds of catalogData.privateLabelIdsByProductId.values()) {
    for (const plId of plIds) queryProductIds.add(plId);
  }

  const genericProductIdsByItemId = new Map<string, string[]>();
  for (const { itemId, profiles } of genericResolvedPairs) {
    if (profiles.length === 0) continue;
    const ids: string[] = [];
    for (const prof of profiles) {
      ids.push(prof.id);
      queryProductIds.add(prof.id);
      if (!catalogData.profilesById.has(prof.id)) {
        catalogData.profilesById.set(prof.id, prof);
      }
    }
    genericProductIdsByItemId.set(itemId, ids);
  }

  let rawOffers = await fetchVerifiedOffersForProducts(
    Array.from(queryProductIds),
    options.city,
    { includeOutOfStock: true }
  );
  if (rawOffers.length === 0 && options.city) {
    rawOffers = await fetchVerifiedOffersForProducts(
      Array.from(queryProductIds),
      undefined,
      { includeOutOfStock: true }
    );
  }

  const dual = computeDualBasketComparison({
    items,
    retailers: allRetailers,
    offers: rawOffers,
    fulfillmentNodes: fulfillmentData.nodes,
    fulfillmentRules: fulfillmentData.rules,
    profilesById: catalogData.profilesById,
    equivalentIdsByProductId: catalogData.equivalentIdsByProductId,
    privateLabelIdsByProductId: catalogData.privateLabelIdsByProductId,
    genericProductIdsByItemId,
    channelFilter,
    city: options.city,
    preferredRetailerSlugs: options.preferredRetailerSlugs,
    includeEquivalents,
    useLoyaltyCards,
    allowedLoyaltyPrograms,
    preferenceMemory,
    learnPreferencesEnabled,
    minSplitSavingsRon,
  });

  let hiddenChannelHint: HiddenChannelOffersHint | null = null;
  if (channelFilter !== 'all') {
    const channelMatch = (o: BeavyProductOffer) =>
      channelFilter === 'physical'
        ? o.fulfillment_channel === 'store'
        : o.fulfillment_channel === 'delivery' || o.fulfillment_channel === 'online';
    const activeNonOosOffers = rawOffers.filter((o) => o.stock_status !== 'out_of_stock');
    const excludedWithOffers = allRetailers.filter((r) => {
      const rOffers = activeNonOosOffers.filter(
        (o) =>
          o.retailer_id === r.id ||
          o.retailer_name.toLowerCase() === r.name.toLowerCase()
      );
      if (rOffers.length === 0) return false;
      const supportsChannel = channelFilter === 'physical' ? r.supports_physical : r.supports_delivery;
      const hasInChannel = rOffers.some(channelMatch);
      return !supportsChannel || !hasInChannel;
    });
    if (excludedWithOffers.length > 0) {
      const coveredSet = new Set(
        activeNonOosOffers
          .filter((o) =>
            excludedWithOffers.some(
              (r) =>
                o.retailer_id === r.id ||
                o.retailer_name.toLowerCase() === r.name.toLowerCase()
            )
          )
          .map((o) => o.product_id)
          .filter((id): id is string => Boolean(id))
      );
      hiddenChannelHint = {
        excludedChannel: channelFilter === 'physical' ? 'online' : 'physical',
        retailerNames: excludedWithOffers.map((r) => r.name),
        coveredItemsCount: coveredSet.size,
      };
    }
  }

  return {
    ...dual,
    hiddenChannelHint,
  };
}

/**
 * Calculează comparația transparentă a coșului pe baza produselor asociate în catalog.
 * Nu inventează prețuri și nu desemnează un câștigător dacă acoperirea este insuficientă.
 */
export async function compareShoppingBasket(
  items: BasketItemInput[],
  options: {
    channelFilter?: 'all' | 'physical' | 'online';
    city?: string;
    preferredRetailerSlugs?: string[];
    includeEquivalents?: boolean;
    strategy?: BasketVariantMode;
    useLoyaltyCards?: boolean;
  } = {}
): Promise<BasketComparisonResult> {
  const dual = await compareShoppingBasketWithVariants(items, options);
  return options.strategy === 'private_label_budget' ? dual.budget : dual.standard;
}

export type BasketComparisonInsights = {
  /** Magazine cu acoperire completă pe toate produsele din catalog (ordonate descrescător pentru graficul tip scară). */
  chartSummariesDescending: RetailerComparisonSummary[];
  bestStore: RetailerComparisonSummary | null;
  mostExpensiveComparableStore: RetailerComparisonSummary | null;
  averageBasketTotal: number | null;
  maxSpreadRon: number | null;
  cheapestPercentSavings: number;
  bestLoyaltyStore: RetailerComparisonSummary | null;
};

/**
 * Calculează indicatorii vizuali pentru graficul comparativ și cardurile KPI din Coș.
 */
export function computeBasketInsights(
  comparison: BasketComparisonResult
): BasketComparisonInsights {
  const isStandard = comparison.strategy === 'standard' || !comparison.strategy;
  const exactComparable = comparison.retailerSummaries.filter(
    (s) =>
      s.coveredCount > 0 &&
      s.hasFullCatalogCoverage &&
      s.exactCoveredCount === s.totalItemsCount
  );

  const comparable =
    isStandard && exactComparable.length > 0
      ? exactComparable
      : comparison.retailerSummaries.filter(
          (s) => s.coveredCount > 0 && s.hasFullCatalogCoverage
        );
  const partial = comparison.retailerSummaries.filter(
    (s) => s.coveredCount > 0 && !comparable.some((c) => c.retailer.id === s.retailer.id)
  );
  const uncovered = comparison.retailerSummaries.filter((s) => s.coveredCount === 0);

  const comparableAsc = [...comparable].sort(
    (a, b) => a.estimatedTotalWithFees - b.estimatedTotalWithFees
  );
  const comparableDesc = [...comparableAsc].reverse();

  const partialOrdered = [...partial].sort((a, b) => {
    if (b.coveredCount !== a.coveredCount) return b.coveredCount - a.coveredCount;
    return a.estimatedTotalWithFees - b.estimatedTotalWithFees;
  });

  const chartSummariesDescending = [...comparableDesc, ...partialOrdered, ...uncovered];

  const bestStore =
    comparableAsc[0] ??
    partialOrdered[0] ??
    null;

  const mostExpensiveComparableStore =
    comparableAsc.length >= 2 ? comparableAsc[comparableAsc.length - 1] : null;

  const avgSource = comparableAsc.length > 0 ? comparableAsc : partialOrdered;
  const averageBasketTotal =
    avgSource.length > 0
      ? roundMoney(
          avgSource.reduce((acc, s) => acc + s.estimatedTotalWithFees, 0) /
            avgSource.length
        )
      : null;

  const maxSpreadRon =
    comparableAsc.length >= 2 && bestStore && mostExpensiveComparableStore
      ? Math.max(
          0,
          roundMoney(
            mostExpensiveComparableStore.estimatedTotalWithFees -
              bestStore.estimatedTotalWithFees
          )
        )
      : null;

  const cheapestPercentSavings =
    maxSpreadRon !== null &&
    maxSpreadRon > 0 &&
    mostExpensiveComparableStore &&
    mostExpensiveComparableStore.estimatedTotalWithFees > 0
      ? Math.max(
          1,
          Math.round(
            (maxSpreadRon / mostExpensiveComparableStore.estimatedTotalWithFees) * 100
          )
        )
      : 0;

  let bestLoyaltyStore: RetailerComparisonSummary | null = null;
  for (const summary of comparison.retailerSummaries) {
    if (summary.potentialLoyaltySavings <= 0) continue;
    if (
      !bestLoyaltyStore ||
      summary.potentialLoyaltySavings > bestLoyaltyStore.potentialLoyaltySavings
    ) {
      bestLoyaltyStore = summary;
    }
  }

  return {
    chartSummariesDescending,
    bestStore,
    mostExpensiveComparableStore,
    averageBasketTotal,
    maxSpreadRon,
    cheapestPercentSavings,
    bestLoyaltyStore,
  };
}
