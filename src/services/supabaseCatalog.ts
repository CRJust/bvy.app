import { createClient } from '@supabase/supabase-js';
import type {
  CanonicalProduct,
  EquivalenceLevel,
  PackageSizeFilter,
  ProductCategory,
  StoreId,
  StoreOffer,
} from '../types.ts';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

export const supabase =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const STORES: StoreId[] = [
  'lidl',
  'kaufland',
  'carrefour',
  'auchan',
  'mega_image',
  'penny',
  'profi',
  'freshful',
  'sezamo',
];

const CARD_META: Partial<
  Record<StoreId, { cardId: StoreOffer['cardId']; program: string }>
> = {
  lidl: { cardId: 'lidl_plus', program: 'Lidl Plus' },
  kaufland: { cardId: 'kaufland_card', program: 'Kaufland Card' },
  carrefour: { cardId: 'card_connect', program: 'Card CONNECT' },
  mega_image: { cardId: 'card_connect', program: 'Card CONNECT' },
  auchan: { cardId: 'myclub', program: 'MyCLUB' },
  penny: { cardId: 'penny_card', program: 'PENNY Card' },
  sezamo: { cardId: 'sezamo_xtra', program: 'Sezamo Xtra' },
};

function mapCategory(cat: string | null | undefined): ProductCategory {
  if (!cat) return 'Cămară & Paste';
  const c = cat.toLowerCase();
  if (
    c.includes('lactate') ||
    c.includes('oua') ||
    c.includes('ouă') ||
    c.includes('branz') ||
    c.includes('unt')
  ) {
    return 'Lactate & Ouă';
  }
  if (
    c.includes('carne') ||
    c.includes('mezel') ||
    c.includes('peste') ||
    c.includes('pește') ||
    c.includes('congelat')
  ) {
    return 'Carne & Pește';
  }
  if (c.includes('legume') || c.includes('fructe')) {
    return 'Fructe & Legume';
  }
  if (
    c.includes('cafea') ||
    c.includes('ceai') ||
    c.includes('bautur') ||
    c.includes('băutur')
  ) {
    return 'Cafea & Băuturi';
  }
  return 'Cămară & Paste';
}

/* -------------------------------------------------------------------------- */
/* Quantity normalization (single source for unit price, size label, dedup)   */
/* -------------------------------------------------------------------------- */

/** `value` is per pack, in base units: ml (vol), g (weight) or pieces (count). */
export interface NormalizedQuantity {
  packCount: number;
  value: number;
  kind: 'vol' | 'weight' | 'count';
}

const UNIT_PATTERN = 'ml|litri|litru|l|kg|gr|g|buc|bucati|pcs|pc';
const MULTIPACK_RE = new RegExp(
  `(?<![\\d.])(\\d{1,3})\\s*[x×*]\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})(?![a-z0-9])`
);
const SINGLE_RE = new RegExp(`(?<![\\d.])(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})(?![a-z0-9])`);

/** Sanity bounds for a whole package: 5 g/ml … 30 kg/L. Outside => scraper parse error. */
const MIN_SANE_TOTAL = 5;
const MAX_SANE_TOTAL = 30000;

function toBaseUnit(
  num: number,
  unit: string
): { value: number; kind: 'vol' | 'weight' | 'count' } | null {
  if (!Number.isFinite(num) || num <= 0) return null;
  const u = unit.toLowerCase();
  if (u === 'l' || u === 'litru' || u === 'litri') {
    return { value: Math.round(num * 1000), kind: 'vol' };
  }
  if (u === 'ml') {
    return { value: Math.round(num), kind: 'vol' };
  }
  if (u === 'kg') {
    return { value: Math.round(num * 1000), kind: 'weight' };
  }
  if (u === 'g' || u === 'gr') {
    return { value: Math.round(num), kind: 'weight' };
  }
  if (u === 'buc' || u === 'bucati' || u === 'pcs' || u === 'pc') {
    return { value: Math.max(1, Math.round(num)), kind: 'count' };
  }
  return null;
}

/** Scrapers sometimes store a shelf price ("6,39 lei/buc") in package_size. */
function isPriceText(text: string): boolean {
  return /\b(lei|ron)\b/i.test(text);
}

function parseQuantityText(src: string | null | undefined): NormalizedQuantity | null {
  if (!src || isPriceText(src)) return null;
  const norm = src
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2');

  // Multipack like 8x125g or 6 x 0.5 l
  const multi = norm.match(MULTIPACK_RE);
  if (multi) {
    const packCount = Number(multi[1]);
    const base = toBaseUnit(Number(multi[2]), multi[3]);
    if (base && packCount > 0) return { packCount, ...base };
  }

  const single = norm.match(SINGLE_RE);
  if (single) {
    const base = toBaseUnit(Number(single[1]), single[2]);
    if (base) return { packCount: 1, ...base };
  }
  return null;
}

function totalOf(q: NormalizedQuantity): number {
  return q.packCount * q.value;
}

function isSaneQuantity(q: NormalizedQuantity | null): q is NormalizedQuantity {
  if (!q) return false;
  if (q.kind === 'count') return totalOf(q) >= 1 && totalOf(q) <= 1000;
  return totalOf(q) >= MIN_SANE_TOTAL && totalOf(q) <= MAX_SANE_TOTAL;
}

/** Quantity signature used by deduplication: text first (keeps multipack structure). */
function extractQuantitySpec(prod: RawSupabaseProduct): NormalizedQuantity | null {
  const fromText = parseQuantityText(prod.package_size) ?? parseQuantityText(prod.canonical_name);
  if (fromText) return fromText;

  if (prod.quantity_value && prod.quantity_unit) {
    const base = toBaseUnit(Number(prod.quantity_value), String(prod.quantity_unit));
    if (base) return { packCount: 1, ...base };
  }
  return null;
}

/**
 * Best quantity for display and unit price.
 * Structured columns (quantity_value is the package TOTAL, e.g. 6x2 L => 12 L) win when sane;
 * "1 pc" / missing units fall back to the size written in package_size or in the name.
 */
export function resolveDisplayQuantity(prod: RawSupabaseProduct): NormalizedQuantity | null {
  const fromPackage = parseQuantityText(prod.package_size);
  const fromName = parseQuantityText(prod.canonical_name);
  const textual = [fromPackage, fromName].filter(isSaneQuantity);

  let structured: NormalizedQuantity | null = null;
  if (prod.quantity_value != null && prod.quantity_unit) {
    const base = toBaseUnit(Number(prod.quantity_value), String(prod.quantity_unit));
    if (base) structured = { packCount: 1, ...base };
  }

  if (isSaneQuantity(structured)) {
    // A bare "1 buc" hides the real size when the name says "200 g"
    if (structured.kind === 'count' && totalOf(structured) === 1) {
      const measured = textual.find((t) => t.kind !== 'count');
      if (measured) return measured;
    }
    // Recover the multipack structure (6 x 2 L) when a text source agrees on the total
    const sameTotal = textual.find(
      (t) => t.packCount > 1 && t.kind === structured!.kind && totalOf(t) === totalOf(structured!)
    );
    return sameTotal ?? structured;
  }

  return textual.find((t) => t.kind !== 'count') ?? textual[0] ?? null;
}

function formatDecimalRo(value: number): string {
  return String(Math.round(value * 1000) / 1000).replace('.', ',');
}

function formatMeasure(value: number, kind: NormalizedQuantity['kind']): string {
  if (kind === 'count') return `${value} buc`;
  const big = kind === 'weight' ? 'kg' : 'L';
  const small = kind === 'weight' ? 'g' : 'ml';
  return value >= 1000 ? `${formatDecimalRo(value / 1000)} ${big}` : `${value} ${small}`;
}

export function formatQuantityLabel(q: NormalizedQuantity): string {
  return q.packCount > 1
    ? `${q.packCount} x ${formatMeasure(q.value, q.kind)}`
    : formatMeasure(q.value, q.kind);
}

function toSizeFilter(
  q: NormalizedQuantity | null
): Exclude<PackageSizeFilter, 'Toate'> | 'Altele' {
  if (!q || q.packCount !== 1) return 'Altele';
  if (q.kind === 'weight') {
    if (q.value === 200) return '200g';
    if (q.value === 250) return '250g';
    if (q.value === 500) return '500g';
    if (q.value === 1000) return '1kg';
  }
  if (q.kind === 'vol') {
    if (q.value === 1000) return '1L';
    if (q.value === 2000) return '2L';
  }
  return 'Altele';
}

/** Raw package_size is only shown when no quantity could be normalized and it is not junk. */
function cleanRawPackageSize(raw: string | null | undefined): string {
  const text = (raw || '').trim();
  if (!text || isPriceText(text) || !/\d/.test(text)) return '';
  if (/^1\s*(pc|pcs|buc)\.?$/i.test(text)) return '';
  // A parsable but absurd size ("33000 ml") is a scraper error, not something to display
  const parsed = parseQuantityText(text);
  if (parsed && !isSaneQuantity(parsed)) return '';
  return text.replace(/\bpcs?\b/gi, 'buc');
}

/* -------------------------------------------------------------------------- */
/* Barcodes                                                                   */
/* -------------------------------------------------------------------------- */

/** Keeps real GTINs intact (EAN-13, UPC-A -> EAN-13, EAN-8); only synthesizes when invalid. */
function normalizeBarcode(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 13 || d.length === 8) return d;
  if (d.length === 12) return `0${d}`;
  return null;
}

function buildEan13(prefix12: string): string {
  const digits = prefix12.replace(/\D/g, '').slice(0, 12).padStart(12, '5');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${digits}${check}`;
}

function buildEan13FromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const prefix = '594' + String(hash).padStart(9, '0').slice(-9);
  return buildEan13(prefix);
}

/* -------------------------------------------------------------------------- */
/* Raw rows                                                                   */
/* -------------------------------------------------------------------------- */

type Numeric = number | string | null | undefined;

export interface RawOfferRow {
  product_id: string;
  /** Price a shopper without any card pays today (already includes public promos). */
  price: Numeric;
  /** Shelf price before a public promo (>= price). */
  regular_price?: Numeric;
  /** Legacy column: equals `price` in current data. */
  promo_price?: Numeric;
  /** Price with the retailer's loyalty card. */
  loyalty_price?: Numeric;
  promo_requires_card?: boolean | null;
  promo_label?: string | null;
  package_size?: string | null;
  stock_status?: string | null;
  beavy_retailers?: { slug?: string } | null;
  /** Filled during deduplication: canonical name of the row's own product. */
  source_name?: string | null;
}

export interface RawSupabaseProduct {
  id: string;
  canonical_name: string;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  package_size?: string | null;
  quantity_value?: number | string | null;
  quantity_unit?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  attributes?: { is_private_label?: boolean } | null;
  canonical_fingerprint?: string | null;
}

function toNumber(value: Numeric): number {
  // PostgREST may serialize numeric as string -> coerce
  return value == null || value === '' ? NaN : Number(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function rowStoreId(row: RawOfferRow): StoreId | null {
  const slug = row.beavy_retailers?.slug;
  if (!slug) return null;
  const storeId = (slug === 'mega-image' ? 'mega_image' : slug) as StoreId;
  return STORES.includes(storeId) ? storeId : null;
}

function isOutOfStockRow(row: RawOfferRow): boolean {
  return String(row.stock_status || '').toLowerCase() === 'out_of_stock';
}

/* -------------------------------------------------------------------------- */
/* Offers                                                                     */
/* -------------------------------------------------------------------------- */

interface OfferCandidate {
  offer: StoreOffer;
  effective: number;
  outOfStock: boolean;
}

/**
 * Builds the 9-store offer record. Stores without a verified in-stock offer are marked
 * `isUnavailable` (no price) — prices are never estimated or invented.
 */
export function buildOffersFromRawRows(
  rawOffers: RawOfferRow[],
  isPrivateLabel: boolean,
  canonicalName: string
): Record<StoreId, StoreOffer> {
  const best: Partial<Record<StoreId, OfferCandidate>> = {};
  const matchKind: StoreOffer['matchKind'] = isPrivateLabel
    ? 'Marcă proprie / Alternativă'
    : 'Exact';
  const canonicalNorm = normalizeTextForDedup(canonicalName);

  for (const row of rawOffers) {
    const storeId = rowStoreId(row);
    if (!storeId) continue;

    const listed = toNumber(row.price);
    if (!Number.isFinite(listed) || listed <= 0) continue;

    const cardMeta = CARD_META[storeId];
    const requiresCard = row.promo_requires_card === true;
    let base = listed;
    let regular = toNumber(row.regular_price);
    let cardPrice: number | undefined;

    const loyalty = toNumber(row.loyalty_price);
    if (cardMeta && Number.isFinite(loyalty) && loyalty > 0 && loyalty < base) {
      cardPrice = loyalty;
    }

    // Legacy rows: promo_price below price. Card-gated => card price; otherwise open to everyone.
    const promo = toNumber(row.promo_price);
    if (Number.isFinite(promo) && promo > 0 && promo < listed) {
      if (requiresCard && cardMeta) {
        cardPrice = cardPrice === undefined ? promo : Math.min(cardPrice, promo);
      } else if (!requiresCard) {
        base = promo;
        regular = Number.isFinite(regular) ? Math.max(regular, listed) : listed;
      }
    }

    const regularPrice =
      Number.isFinite(regular) && regular > base + 0.004 ? round2(regular) : undefined;
    const outOfStock = isOutOfStockRow(row);
    const effective = cardPrice ?? base;

    // Duplicate rows for one store: in-stock beats out-of-stock, then cheapest effective price
    const prev = best[storeId];
    if (prev) {
      if (prev.outOfStock !== outOfStock) {
        if (outOfStock) continue;
      } else if (prev.effective <= effective) {
        continue;
      }
    }

    const label = (row.promo_label || '').trim();
    const sourceName = (row.source_name || '').trim();
    const isRenamedTwin =
      Boolean(sourceName) && normalizeTextForDedup(sourceName) !== canonicalNorm;
    const equivalenceLevel: EquivalenceLevel = isPrivateLabel ? 4 : isRenamedTwin ? 2 : 1;

    best[storeId] = {
      effective,
      outOfStock,
      offer: {
        storeId,
        basePrice: round2(base),
        regularPrice,
        cardPrice: cardPrice !== undefined ? round2(cardPrice) : undefined,
        cardId: cardPrice !== undefined && cardMeta ? cardMeta.cardId : undefined,
        cardProgram: cardPrice !== undefined && cardMeta ? cardMeta.program : undefined,
        promoLabel: label || (cardPrice !== undefined && cardMeta ? cardMeta.program : undefined),
        // "Buy more, save more", "-70% la al 2-lea": a deal, but not a lower unit price
        promoIsInfoOnly:
          Boolean(label) && cardPrice === undefined && regularPrice === undefined
            ? true
            : undefined,
        matchKind,
        equivalenceLevel,
        variantLabel: isRenamedTwin ? sourceName : undefined,
      },
    };
  }

  const result = {} as Record<StoreId, StoreOffer>;
  for (const storeId of STORES) {
    const candidate = best[storeId];
    if (candidate && !candidate.outOfStock) {
      result[storeId] = candidate.offer;
      continue;
    }
    result[storeId] = {
      storeId,
      basePrice: 0,
      matchKind,
      equivalenceLevel: isPrivateLabel ? 4 : 1,
      isUnavailable: true,
      isOutOfStock: candidate?.outOfStock ? true : undefined,
    };
  }
  return result;
}

export function countRealOffers(offers: Record<StoreId, StoreOffer>): number {
  return STORES.filter((s) => offers[s] && !offers[s].isUnavailable).length;
}

function safeImageUrl(raw: string | null | undefined): string | undefined {
  const url = (raw || '').trim();
  if (!/^https?:\/\//i.test(url)) return undefined;
  return url.replace(/^http:\/\//i, 'https://');
}

export function mapSupabaseProduct(
  prod: RawSupabaseProduct,
  offers: Record<StoreId, StoreOffer>
): CanonicalProduct {
  const isPrivateLabel = Boolean(prod.attributes?.is_private_label);
  const realEan = prod.barcode ? normalizeBarcode(String(prod.barcode)) : null;
  const quantity = resolveDisplayQuantity(prod);

  let quantityBase = 1;
  let unitType: CanonicalProduct['unitType'] = 'buc';
  if (quantity) {
    const total = totalOf(quantity);
    if (quantity.kind === 'count') {
      quantityBase = total;
    } else {
      // The app convention: quantityBase is expressed in kg / L (200 g => 0.2)
      quantityBase = total / 1000;
      unitType = quantity.kind === 'weight' ? 'kg' : 'L';
    }
  }

  return {
    id: prod.id,
    ean: realEan ?? buildEan13FromId(prod.id),
    eanIsSynthetic: realEan ? undefined : true,
    canonicalName: prod.canonical_name,
    // No placeholder brand: an empty string is hidden by the UI
    brand: prod.brand?.trim() || '',
    packageSize: quantity ? formatQuantityLabel(quantity) : cleanRawPackageSize(prod.package_size),
    sizeFilter: toSizeFilter(quantity),
    category: mapCategory(prod.category || prod.subcategory),
    quantityBase,
    unitType,
    isPrivateLabel,
    imageUrl: safeImageUrl(prod.image_url),
    realOfferCount: countRealOffers(offers),
    offers,
  };
}

/* -------------------------------------------------------------------------- */
/* Deduplication across retailers                                             */
/* -------------------------------------------------------------------------- */

const DEDUP_STOPWORDS = new Set([
  'cu',
  'si',
  'de',
  'din',
  'la',
  'pentru',
  'pt',
  'gust',
  'grasime',
  'gr',
  'tip',
  'in',
  'pe',
]);

const DEDUP_CRITICAL_MODIFIERS = [
  'fara lactoza',
  'fara zahar',
  'zero',
  'max',
  'bio',
  'decofeinizata',
  'degresat',
  'semidegresat',
  'light',
  'picant',
  'afumat',
];

function normalizeTextForDedup(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d%?)([a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function quantitiesCompatible(a: NormalizedQuantity | null, b: NormalizedQuantity | null): boolean {
  if (!a || !b) return a === b;
  if (a.packCount !== b.packCount || a.value !== b.value) return false;
  if (a.kind === b.kind) return true;
  // Allow 450g ≈ 450ml for dairy/liquids when numeric value & packCount match
  return a.kind !== 'count' && b.kind !== 'count';
}

function extractFatPercent(text: string): number | null {
  const norm = text.replace(/(\d),(\d)/g, '$1.$2');
  const m = norm.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

function extractSignatureTokens(prod: RawSupabaseProduct): Set<string> {
  const norm = normalizeTextForDedup(`${prod.brand || ''} ${prod.canonical_name || ''}`);
  // Remove fat percentages and standalone quantity expressions
  const cleaned = norm
    .replace(/\d+(?:\.\d+)?\s*%/g, ' ')
    .replace(/\b\d+\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:ml|l|litri|litru|kg|gr|g|buc)\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:ml|l|litri|litru|kg|gr|g|buc)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ');

  const tokens = cleaned
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !DEDUP_STOPWORDS.has(t));
  return new Set(tokens);
}

interface PreparedProduct {
  prod: RawSupabaseProduct;
  qty: NormalizedQuantity | null;
  fat: number | null;
  tokens: Set<string>;
  normText: string;
  offers: RawOfferRow[];
}

function areSamePhysicalProduct(a: PreparedProduct, b: PreparedProduct): boolean {
  if (!quantitiesCompatible(a.qty, b.qty)) return false;

  if (a.fat !== null && b.fat !== null && a.fat !== b.fat) return false;

  for (const mod of DEDUP_CRITICAL_MODIFIERS) {
    const aHas = a.normText.includes(mod);
    const bHas = b.normText.includes(mod);
    if (aHas !== bHas) return false;
  }

  if (a.tokens.size === 0 || b.tokens.size === 0) return false;

  let intersection = 0;
  for (const t of a.tokens) {
    if (b.tokens.has(t)) intersection++;
  }
  const union = a.tokens.size + b.tokens.size - intersection;
  const minSize = Math.min(a.tokens.size, b.tokens.size);

  if (minSize <= 2) {
    return intersection === a.tokens.size && intersection === b.tokens.size;
  }
  return union > 0 && intersection / union >= 0.75;
}

/** Stores with a priced, in-stock row. */
function countValidOffers(offers: RawOfferRow[]): number {
  const stores = new Set<StoreId>();
  for (const row of offers) {
    const storeId = rowStoreId(row);
    if (!storeId || isOutOfStockRow(row)) continue;
    const price = toNumber(row.price);
    if (Number.isFinite(price) && price > 0) {
      stores.add(storeId);
    }
  }
  return stores.size;
}

export interface DeduplicateOptions {
  /** Keep only merged groups that contain at least one of these product ids (search seeds). */
  requiredIds?: Set<string>;
  /** Normalized query: products whose name starts with it rank first among equal coverage. */
  rankQuery?: string;
  /** Ids that must stay the identity of their merged group (basket lines being refreshed). */
  pinnedIds?: Set<string>;
}

export function deduplicateAndMergeSupabaseProducts(
  prods: RawSupabaseProduct[],
  offersByProductId: Record<string, RawOfferRow[]>,
  limit = 20,
  options: DeduplicateOptions = {}
): CanonicalProduct[] {
  const prepared: PreparedProduct[] = prods.map((prod) => ({
    prod,
    qty: extractQuantitySpec(prod),
    fat: extractFatPercent(prod.canonical_name || ''),
    tokens: extractSignatureTokens(prod),
    normText: normalizeTextForDedup(prod.canonical_name || ''),
    offers: offersByProductId[prod.id] || [],
  }));

  const groups: PreparedProduct[][] = [];
  for (const item of prepared) {
    const match = groups.find((g) => areSamePhysicalProduct(g[0], item));
    if (match) {
      match.push(item);
    } else {
      groups.push([item]);
    }
  }

  const { requiredIds, rankQuery, pinnedIds } = options;
  const relevantGroups = requiredIds
    ? groups.filter((g) => g.some((m) => requiredIds.has(m.prod.id)))
    : groups;

  const merged = relevantGroups.map((group) => {
    // Each offer remembers how its own retailer names the product (shown as the store variant)
    const combinedOffers = group.flatMap((g) =>
      g.offers.map((row) => ({ ...row, source_name: g.prod.canonical_name }))
    );
    const realOfferCount = countValidOffers(combinedOffers);

    // Pick primary product: real barcode > most own real offers > longest canonical name > id
    const sortedMembers = [...group].sort((a, b) => {
      if (pinnedIds) {
        const pinDiff = Number(pinnedIds.has(b.prod.id)) - Number(pinnedIds.has(a.prod.id));
        if (pinDiff !== 0) return pinDiff;
      }
      const aHasBarcode = a.prod.barcode && normalizeBarcode(String(a.prod.barcode)) ? 1 : 0;
      const bHasBarcode = b.prod.barcode && normalizeBarcode(String(b.prod.barcode)) ? 1 : 0;
      if (bHasBarcode !== aHasBarcode) return bHasBarcode - aHasBarcode;

      const aOffers = countValidOffers(a.offers);
      const bOffers = countValidOffers(b.offers);
      if (bOffers !== aOffers) return bOffers - aOffers;

      const lengthDiff = (b.prod.canonical_name || '').length - (a.prod.canonical_name || '').length;
      if (lengthDiff !== 0) return lengthDiff;
      return String(a.prod.id).localeCompare(String(b.prod.id));
    });

    // Primary keeps identity; missing brand / image are borrowed from the merged twins
    const primary: RawSupabaseProduct = {
      ...sortedMembers[0].prod,
      brand:
        sortedMembers.map((m) => m.prod.brand?.trim()).find((b) => Boolean(b)) ?? null,
      image_url:
        sortedMembers.map((m) => safeImageUrl(m.prod.image_url)).find((u) => Boolean(u)) ?? null,
    };
    const isPrivate = group.some((g) => Boolean(g.prod.attributes?.is_private_label));
    const offersMap = buildOffersFromRawRows(combinedOffers, isPrivate, primary.canonical_name);
    const canonical = mapSupabaseProduct(
      { ...primary, attributes: { ...primary.attributes, is_private_label: isPrivate } },
      offersMap
    );
    const startsWithQuery =
      rankQuery && normalizeSearchText(primary.canonical_name).startsWith(rankQuery) ? 1 : 0;

    return { canonical, realOfferCount, startsWithQuery };
  });

  // Most verified stores first (0-offer products last), then query prefix, then shorter names
  merged.sort(
    (a, b) =>
      b.realOfferCount - a.realOfferCount ||
      b.startsWithQuery - a.startsWithQuery ||
      (requiredIds ? a.canonical.canonicalName.length - b.canonical.canonicalName.length : 0)
  );

  return merged.slice(0, limit).map((m) => m.canonical);
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

const PRODUCT_COLUMNS =
  'id, canonical_name, brand, category, subcategory, package_size, quantity_value, quantity_unit, barcode, image_url, attributes, canonical_fingerprint';
const OFFER_COLUMNS =
  'product_id, price, regular_price, promo_price, loyalty_price, promo_requires_card, promo_label, package_size, stock_status, beavy_retailers(slug)';

/** Candidate window: text matches + cross-retailer siblings that feed the dedup batch. */
const SEED_LIMIT = 150;
const PREFIX_SEED_LIMIT = 50;
const SIBLING_LIMIT = 300;
const FINGERPRINT_CHUNK = 40;
const OFFER_ID_CHUNK = 80;

/** Mirrors `beavy_products.search_text`: lowercase, no diacritics, alphanumeric words. */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenizeSearchQuery(query: string): string[] {
  const tokens = normalizeSearchText(query)
    .split(' ')
    .filter((t) => t.length >= 2);
  return Array.from(new Set(tokens)).slice(0, 6);
}

/** 8–14 digits => treat the query as a GTIN and match the barcode column exactly. */
export function barcodeQueryVariants(query: string): string[] | null {
  const digits = query.replace(/[\s-]/g, '');
  if (!/^\d{8,14}$/.test(digits)) return null;
  const stripped = digits.replace(/^0+/, '');
  const variants = new Set<string>([digits, stripped]);
  for (const len of [12, 13, 14]) {
    if (stripped.length <= len) variants.add(stripped.padStart(len, '0'));
  }
  variants.delete('');
  return Array.from(variants);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchSeedProducts(query: string): Promise<RawSupabaseProduct[]> {
  if (!supabase) return [];

  const barcodes = barcodeQueryVariants(query);
  if (barcodes) {
    // Exact GTIN lookup: no is_active filter, so a scanned product is found whenever readable
    const { data } = await supabase
      .from('beavy_products')
      .select(PRODUCT_COLUMNS)
      .in('barcode', barcodes)
      .limit(10);
    return (data as RawSupabaseProduct[] | null) ?? [];
  }

  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];

  // Every word must appear (any order), so "lapte zuzu" also finds "Zuzu Lapte ..."
  let containsAll = supabase
    .from('beavy_products')
    .select(PRODUCT_COLUMNS)
    .eq('is_active', true);
  for (const token of tokens) {
    containsAll = containsAll.ilike('search_text', `%${token}%`);
  }

  const [prefixRes, containsRes] = await Promise.all([
    supabase
      .from('beavy_products')
      .select(PRODUCT_COLUMNS)
      .eq('is_active', true)
      .ilike('search_text', `${tokens.join(' ')}%`)
      .order('normalized_name', { ascending: true })
      .limit(PREFIX_SEED_LIMIT),
    // Alphabetical order keeps same-named rows from different retailers in the same window
    containsAll.order('normalized_name', { ascending: true }).limit(SEED_LIMIT),
  ]);

  const seen = new Set<string>();
  const seeds: RawSupabaseProduct[] = [];
  for (const row of [
    ...((prefixRes.data as RawSupabaseProduct[] | null) ?? []),
    ...((containsRes.data as RawSupabaseProduct[] | null) ?? []),
  ]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    seeds.push(row);
    if (seeds.length >= SEED_LIMIT) break;
  }
  return seeds;
}

/** Rows sharing a coarse fingerprint with the seeds: the same product listed by other retailers. */
async function fetchSiblingProducts(seeds: RawSupabaseProduct[]): Promise<RawSupabaseProduct[]> {
  if (!supabase) return [];
  const seedIds = new Set(seeds.map((s) => s.id));
  const fingerprints = Array.from(
    new Set(
      seeds
        .map((s) => s.canonical_fingerprint || '')
        .filter((fp) => fp.length > 0 && !/["\\]/.test(fp))
    )
  );
  if (fingerprints.length === 0) return [];

  const responses = await Promise.all(
    chunk(fingerprints, FINGERPRINT_CHUNK).map((part) =>
      supabase!
        .from('beavy_products')
        .select(PRODUCT_COLUMNS)
        .eq('is_active', true)
        .in('canonical_fingerprint', part)
        .limit(SIBLING_LIMIT)
    )
  );

  const siblings: RawSupabaseProduct[] = [];
  for (const res of responses) {
    for (const row of (res.data as RawSupabaseProduct[] | null) ?? []) {
      if (seedIds.has(row.id)) continue;
      seedIds.add(row.id);
      siblings.push(row);
      if (siblings.length >= SIBLING_LIMIT) return siblings;
    }
  }
  return siblings;
}

async function fetchOffersByProductId(ids: string[]): Promise<Record<string, RawOfferRow[]>> {
  const byProduct: Record<string, RawOfferRow[]> = {};
  if (!supabase || ids.length === 0) return byProduct;

  const responses = await Promise.all(
    chunk(ids, OFFER_ID_CHUNK).map((part) =>
      supabase!
        .from('beavy_product_offers')
        .select(OFFER_COLUMNS)
        .eq('is_active', true)
        .in('product_id', part)
    )
  );

  for (const res of responses) {
    for (const row of (res.data as unknown as RawOfferRow[] | null) ?? []) {
      (byProduct[row.product_id] ??= []).push(row);
    }
  }
  return byProduct;
}

export async function searchSupabaseCatalog(
  query: string,
  limit = 20
): Promise<CanonicalProduct[]> {
  if (!supabase) return [];
  const clean = query.trim();
  if (!clean) return [];

  const seeds = await fetchSeedProducts(clean);
  if (seeds.length === 0) return [];

  const siblings = await fetchSiblingProducts(seeds);
  const all = [...seeds, ...siblings];
  const offersByProductId = await fetchOffersByProductId(all.map((p) => p.id));

  return deduplicateAndMergeSupabaseProducts(all, offersByProductId, limit, {
    requiredIds: new Set(seeds.map((s) => s.id)),
    rankQuery: barcodeQueryVariants(clean) ? undefined : normalizeSearchText(clean),
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Current offers for products already in a basket. Each requested id stays the identity of
 * its merged product, so saved baskets keep pointing at the same line with fresh prices.
 */
export async function refreshSupabaseProducts(ids: string[]): Promise<CanonicalProduct[]> {
  if (!supabase) return [];
  const wanted = Array.from(new Set(ids.filter((id) => UUID_RE.test(id)))).slice(0, 60);
  if (wanted.length === 0) return [];

  const { data } = await supabase.from('beavy_products').select(PRODUCT_COLUMNS).in('id', wanted);
  const seeds = (data as RawSupabaseProduct[] | null) ?? [];
  if (seeds.length === 0) return [];

  const siblings = await fetchSiblingProducts(seeds);
  const all = [...seeds, ...siblings];
  const offersByProductId = await fetchOffersByProductId(all.map((p) => p.id));
  const pinned = new Set(seeds.map((s) => s.id));

  return deduplicateAndMergeSupabaseProducts(all, offersByProductId, all.length, {
    requiredIds: pinned,
    pinnedIds: pinned,
  });
}
