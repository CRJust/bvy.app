export type StoreId =
  | 'lidl'
  | 'kaufland'
  | 'carrefour'
  | 'auchan'
  | 'mega_image'
  | 'penny'
  | 'profi'
  | 'freshful'
  | 'sezamo';

export type LoyaltyCardId =
  | 'lidl_plus'
  | 'kaufland_card'
  | 'card_connect'
  | 'myclub'
  | 'penny_card'
  | 'sezamo_xtra';

export type StoreChannel = 'physical' | 'online' | 'hybrid';

export type StoreFilterMode = 'all' | 'physical' | 'online';

export type ProductCategory =
  | 'Lactate & Ouă'
  | 'Carne & Pește'
  | 'Fructe & Legume'
  | 'Cămară & Paste'
  | 'Cafea & Băuturi';

export type PackageSizeFilter =
  | 'Toate'
  | '200g'
  | '250g'
  | '500g'
  | '1kg'
  | '1L'
  | '2L';

export type MatchKind = 'Exact' | 'Marcă proprie / Alternativă';

export type EquivalenceLevel = 1 | 2 | 3 | 4;

export interface StoreInfo {
  id: StoreId;
  name: string;
  shortName: string;
  channel: StoreChannel;
  accentHex: string;
  badgeTextHex: string;
  cardProgram: string | null;
  cardId: LoyaltyCardId | null;
  deliveryFee: number;
  freeDeliveryThreshold: number | null;
  minOrder: number;
  deliveryNote: string;
}

export interface LoyaltyCardInfo {
  id: LoyaltyCardId;
  name: string;
  storeNames: string;
  storeIds: StoreId[];
  benefitSummary: string;
}

export interface StoreOffer {
  storeId: StoreId;
  basePrice: number;
  cardPrice?: number;
  cardId?: LoyaltyCardId;
  cardProgram?: string;
  promoLabel?: string;
  matchKind: MatchKind;
  equivalenceLevel?: EquivalenceLevel;
  variantLabel?: string;
  ean?: string;
  /** Shelf price before a public (no-card) discount; shown struck-through next to basePrice. */
  regularPrice?: number;
  /** promoLabel describes a multi-buy / conditional deal, not a lower unit price. */
  promoIsInfoOnly?: boolean;
  /** No verified offer at this store: never priced, never counted in totals. */
  isUnavailable?: boolean;
  /** The retailer lists the product but reports it out of stock (implies isUnavailable). */
  isOutOfStock?: boolean;
}

export interface CanonicalProduct {
  id: string;
  ean: string;
  canonicalName: string;
  brand: string;
  packageSize: string;
  sizeFilter: Exclude<PackageSizeFilter, 'Toate'> | 'Altele';
  category: ProductCategory;
  quantityBase: number;
  unitType: 'kg' | 'L' | 'buc';
  isPrivateLabel: boolean;
  economyEquivalentId?: string;
  /** Real product photo (scraped). Falls back to the category image when missing or broken. */
  imageUrl?: string;
  /** True when `ean` was synthesized (no real barcode): never show it or match scans against it. */
  eanIsSynthetic?: boolean;
  /** Stores with a verified, in-stock offer. Undefined for the static catalog (all stores). */
  realOfferCount?: number;
  offers: Record<StoreId, StoreOffer>;
}

export interface BasketItem {
  productId: string;
  quantity: number;
  checkedInStore: boolean;
}

export type AiIntent = 'recipe' | 'list_add' | 'list_refine' | 'price_query';

export interface AiRecipeItem {
  productId: string;
  searchQuery: string;
  canonicalHint: string;
  quantity: number;
  packageSize: string;
  isPantryStaple: boolean;
  budgetAlternativeHint?: string;
  reason?: string;
  /** Found in the stores' live catalog (not in the everyday product list): worth a quick check. */
  fromLiveCatalog?: boolean;
}

export interface AiSwapItem {
  fromProductId: string;
  toProductId: string;
  quantity: number;
}

export interface AiStructuredCard {
  intent: AiIntent;
  cardType: 'recipe' | 'list' | 'edit';
  title: string;
  servings: number;
  budgetRon?: number;
  days?: number;
  maxStores?: 1 | 2;
  items: AiRecipeItem[];
  removedKeywords: string[];
  removeProductIds: string[];
  swapItems: AiSwapItem[];
  replaceExistingQuantities?: boolean;
  /** Full data for `fromLiveCatalog` items; the client registers them and drops this field. */
  liveProducts?: CanonicalProduct[];
}

export interface AppliedPlanItemEstimate {
  productId: string;
  productName: string;
  ean: string;
  storeId: StoreId;
  quantity: number;
  expectedUnitPrice: number;
}

export interface AppliedPlanSnapshot {
  strategy: 'balanced' | 'cheapest' | 'fidelity';
  decision: 'accepted' | 'modified';
  storeId: StoreId | 'split';
  storeLabel: string;
  estimatedTotal: number;
  estimatedDeliveryFee: number;
  budgetRon: number | null;
  appliedAt: string;
  itemEstimates: Record<string, AppliedPlanItemEstimate>;
  actualUnitPrices: Record<string, number>;
  receiptTotalInput: string;
  receiptVerified: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  card?: AiStructuredCard;
  error?: string;
}

export interface UserProfile {
  city: string;
  neighborhood: string;
  householdSize: number;
  dietaryPreferences: string[];
}
