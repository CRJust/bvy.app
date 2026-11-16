import type { BeavyFulfillmentRule, BeavyProductOffer, BeavyRetailer } from '@/services/beavy-comparison';

export type OptimizationMode = 'balanced' | 'cheapest' | 'single_store' | 'online';

export type MatchQuality =
  | 'exact_ean'
  | 'exact_id'
  | 'equivalent'
  | 'substitution'
  | 'unmatched';

export interface SmartShoppingConfig {
  maxStores: number; // default: 2, maximum allowed: 3
  additionalStorePenalty: number; // default: 8.0 RON (lambda)
  allowSubstitutions: boolean; // default: false
  optimizationMode: OptimizationMode; // default: 'balanced'
  preferredChannel?: 'all' | 'store' | 'delivery';
  city?: string;
  preferredRetailerSlugs?: string[];
  useLoyaltyCards?: boolean;
  allowedLoyaltyPrograms?: string[] | null;
  estimatedTravelCostPerStore?: number; // C_travel (optional, RON)
}

export const DEFAULT_SMART_SHOPPING_CONFIG: SmartShoppingConfig = {
  maxStores: 2,
  additionalStorePenalty: 8.0,
  allowSubstitutions: false,
  optimizationMode: 'balanced',
  preferredChannel: 'all',
  city: 'Bucuresti',
  useLoyaltyCards: true,
  allowedLoyaltyPrograms: null,
  estimatedTravelCostPerStore: 0,
};

export interface NormalizedQuantity {
  value: number;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'buc';
  standardizedValue: number; // in kg for mass, in L for volume, in buc for piece
  standardizedUnit: 'kg' | 'l' | 'buc';
}

export interface SmartProductInput {
  id: string; // List item ID
  productId?: string | null; // Canonical product ID if linked
  name: string; // Raw or canonical display name
  brand?: string | null;
  barcode?: string | null;
  packageSize?: string | null;
  quantity: number; // User quantity
  unit?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  subcategory?: string | null;
  allowSubstitutionOverride?: boolean;
}

export interface ValidatedOffer extends BeavyProductOffer {
  effectiveUnitPrice: number;
  isLoyaltyApplied: boolean;
  isPromoApplied: boolean;
  isExpired: boolean;
  isFresh: boolean;
  freshnessLabel: string;
}

export interface AlternativeOffer {
  retailerId: string;
  retailerName: string;
  retailerSlug: string;
  price: number;
  lineTotal: number;
  unitPrice?: number | null;
  promoLabel?: string | null;
  matchQuality: MatchQuality;
  isSubstitution: boolean;
  offerId: string;
}

export interface SmartProductAssignment {
  itemId: string;
  requestedName: string;
  canonicalProductId: string | null;
  canonicalName: string;
  brand: string | null;
  packageSize: string | null;
  imageUrl: string | null;
  quantity: number;
  matchQuality: MatchQuality;
  isSubstitution: boolean;
  substitutionReason?: string | null;
  selectedRetailer: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
  };
  selectedOffer: ValidatedOffer;
  lineTotal: number;
  cheapestPossiblePrice: number;
  savingsVsSingleStore: number;
  alternativeOffers: AlternativeOffer[];
}

export interface SmartStoreAssignment {
  retailer: BeavyRetailer;
  channel: 'store' | 'delivery' | 'online';
  productCount: number;
  productSubtotal: number;
  deliveryFee: number;
  packagingFee: number;
  minimumOrderValue: number | null;
  meetsMinimumOrderValue: boolean;
  storeTotal: number; // productSubtotal + deliveryFee + packagingFee
  assignedItems: SmartProductAssignment[];
}

export interface UnavailableSmartItem {
  itemId: string;
  name: string;
  brand?: string | null;
  reason: 'no_offers_found' | 'out_of_stock' | 'expired_offers_only' | 'retailer_filtered' | 'substitution_disallowed';
}

export interface ScenarioBasket {
  scenarioId: 'smart_basket' | 'cheapest_basket' | 'single_store' | 'online_basket';
  title: string;
  description: string;
  isRecommended: boolean;
  productCost: number; // C_products
  storeCount: number; // K
  inconveniencePenalty: number; // lambda * (K - 1)
  travelCost: number; // C_travel
  deliveryCost: number; // C_delivery
  objectiveScore: number; // J = C_products + lambda*(K-1) + C_travel + C_delivery
  totalToPay: number; // C_products + C_delivery (actual out-of-pocket spend)
  totalSavings: number; // Compared to single store or baseline
  storeAssignments: SmartStoreAssignment[];
  productAssignments: SmartProductAssignment[];
  unavailableItems: UnavailableSmartItem[];
  freshnessTimestamp: string;
  explanation: string;
}

export interface SmartShoppingResult {
  shoppingListId?: string;
  calculatedAt: string;
  config: SmartShoppingConfig;
  recommendedScenario: ScenarioBasket;
  scenarios: {
    smartBasket: ScenarioBasket;
    cheapestBasket: ScenarioBasket;
    singleStoreBasket: ScenarioBasket | null;
    onlineBasket: ScenarioBasket | null;
  };
  metrics: {
    identifiedProductsCount: number;
    retailersAnalyzedCount: number;
    validOffersEvaluatedCount: number;
    combinationsEvaluatedCount: number;
  };
  unavailableItems: UnavailableSmartItem[];
  retailers?: BeavyRetailer[];
  fulfillmentRules?: Record<string, BeavyFulfillmentRule>;
}
