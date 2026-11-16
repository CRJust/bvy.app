import type { CanonicalProduct, StoreId, StoreOffer } from '../types.ts';

/** Products added from the live catalog, kept locally so the basket survives a reload. */
const CACHE_KEY = 'beavy_cached_products_v2';
/** Old shape: estimated prices, raw gram/ml quantities, placeholder brands. */
const LEGACY_CACHE_KEY = 'beavy_cached_products_v1';
const MAX_CACHED_PRODUCTS = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Live-catalog products use database UUIDs; the built-in catalog uses readable slugs. */
export function isRemoteProductId(id: string): boolean {
  return UUID_RE.test(id);
}

type LegacyOffer = StoreOffer & { isEstimated?: boolean };

/**
 * Makes a v1-cached product safe to show until fresh data arrives:
 * estimated prices become "unavailable" and placeholder brands are dropped.
 */
export function sanitizeLegacyProduct(product: CanonicalProduct): CanonicalProduct {
  const offers = {} as Record<StoreId, StoreOffer>;
  let realOfferCount = 0;
  for (const [storeId, raw] of Object.entries(product.offers ?? {}) as Array<
    [StoreId, LegacyOffer]
  >) {
    const { isEstimated, ...offer } = raw;
    if (isEstimated || offer.isUnavailable || !(offer.basePrice > 0)) {
      offers[storeId] = {
        storeId,
        basePrice: 0,
        matchKind: offer.matchKind,
        equivalenceLevel: offer.equivalenceLevel,
        isUnavailable: true,
      };
    } else {
      offers[storeId] = offer;
      realOfferCount += 1;
    }
  }

  const brand = product.brand === 'Brand național' || product.brand === 'Marcă proprie'
    ? ''
    : product.brand ?? '';

  return { ...product, brand, offers, realOfferCount };
}

/** A saved product the catalog no longer lists: keep the line, but with no price anywhere. */
export function markProductUnlisted(product: CanonicalProduct): CanonicalProduct {
  const offers = {} as Record<StoreId, StoreOffer>;
  for (const [storeId, offer] of Object.entries(product.offers ?? {}) as Array<
    [StoreId, StoreOffer]
  >) {
    offers[storeId] = {
      storeId,
      basePrice: 0,
      matchKind: offer.matchKind,
      equivalenceLevel: offer.equivalenceLevel,
      isUnavailable: true,
    };
  }
  return { ...product, offers, realOfferCount: 0 };
}

function readList(key: string): CanonicalProduct[] {
  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as CanonicalProduct[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string' && p.offers) : [];
  } catch {
    return [];
  }
}

/** Current cache plus any not-yet-refreshed legacy entries (sanitized, in memory only). */
export function loadCachedProducts(): CanonicalProduct[] {
  if (typeof window === 'undefined') return [];
  const current = readList(CACHE_KEY);
  const known = new Set(current.map((p) => p.id));
  const legacy = readList(LEGACY_CACHE_KEY)
    .filter((p) => !known.has(p.id))
    .map(sanitizeLegacyProduct);
  return [...legacy, ...current];
}

/** Upsert (fresh prices win) and move to the end so trimming keeps the most recent items. */
export function upsertCachedProducts(products: CanonicalProduct[]): void {
  if (typeof window === 'undefined' || products.length === 0) return;
  try {
    const incoming = new Set(products.map((p) => p.id));
    const next = readList(CACHE_KEY).filter((p) => !incoming.has(p.id));
    next.push(...products);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(next.slice(-MAX_CACHED_PRODUCTS)));
  } catch {
    // Ignore cache storage errors
  }
}

export function dropLegacyCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {
    // Ignore
  }
}

/** Asks the server for the current offers of live-catalog products (by id). */
export async function fetchFreshProducts(ids: string[]): Promise<CanonicalProduct[]> {
  const remoteIds = Array.from(new Set(ids.filter(isRemoteProductId))).slice(0, 60);
  if (remoteIds.length === 0) return [];
  const res = await fetch('/api/catalog/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: remoteIds }),
  });
  if (!res.ok) throw new Error('Refresh failed');
  const data = (await res.json()) as { products?: CanonicalProduct[] };
  return Array.isArray(data.products) ? data.products : [];
}
