import shelfPricesRaw from '../../public/data/shelf-prices.json';

import {
  type DisplayProduct,
} from '@/services/beavy-catalog-search';
import {
  type BasketItemInput,
  type DualBasketComparisonResult,
  fetchCatalogAndEquivalentProfilesMap,
  fetchSmartOffersForProduct,
  fetchVerifiedOffersForProducts,
  isPrivateLabelProduct,
  resolveLoyaltyProgramName,
} from '@/services/beavy-comparison';
import {
  buildPriceGrid,
  matchShelfCatalogOffers,
  MIN_COMMON_STORES,
  normalizeRetailerStoreKey,
  type PriceGridInput,
  type PriceGridSummary,
  type ShelfCatalogItem,
} from '@/services/product-price-grid';

/** Pragul de acoperire comună (minim 6 magazine) pentru compararea completă a alimentului. */
const SUFFICIENT_STORE_COVERAGE = MIN_COMMON_STORES;

export const SHELF_ITEMS: ShelfCatalogItem[] = Array.isArray(
  (shelfPricesRaw as { items?: unknown }).items
)
  ? ((shelfPricesRaw as { items: ShelfCatalogItem[] }).items ?? [])
  : [];

const gridCache = new Map<string, { at: number; promise: Promise<PriceGridSummary> }>();
const GRID_TTL_MS = 5 * 60 * 1000;

type GridProductRef = Pick<DisplayProduct, 'id'> & Partial<DisplayProduct>;

/**
 * Construiește sincron (0 ms, fără cereri de rețea) grila de prețuri multi-magazin
 * pentru fiecare produs din coșul activ, folosind rezultatul deja calculat
 * în `precomputedComparison` (`DualBasketComparisonResult`) + `shelf-prices.json` (inclusiv Lidl `.xlsb`).
 */
export function buildBasketItemPriceGrids(
  dual: DualBasketComparisonResult | null,
  items: BasketItemInput[]
): Map<string, PriceGridSummary> {
  const result = new Map<string, PriceGridSummary>();
  if (items.length === 0) return result;

  const inputsByItemId = new Map<string, PriceGridInput[]>();
  for (const item of items) {
    inputsByItemId.set(item.id, []);
  }

  if (dual) {
    for (const st of dual.standard.itemStatuses) {
      const list = inputsByItemId.get(st.item.id);
      if (!list) continue;
      for (const offer of st.offers) {
        list.push({ offer, kind: 'exact' });
      }
    }

    for (const summary of dual.standard.retailerSummaries) {
      for (const m of summary.matchedItems) {
        const list = inputsByItemId.get(m.item.id);
        if (!list) continue;
        list.push({
          offer: m.offer,
          kind: m.matchType === 'exact' ? 'exact' : 'alternative',
          altBrand: m.equivalentBrand ?? null,
          altName: m.equivalentProductName ?? null,
          altIsPrivateLabel: Boolean(m.isPrivateLabel),
        });
      }
    }

    for (const summary of dual.budget.retailerSummaries) {
      for (const m of summary.matchedItems) {
        const list = inputsByItemId.get(m.item.id);
        if (!list) continue;
        list.push({
          offer: m.offer,
          kind: m.matchType === 'exact' ? 'exact' : 'alternative',
          altBrand: m.equivalentBrand ?? null,
          altName: m.equivalentProductName ?? null,
          altIsPrivateLabel: Boolean(m.isPrivateLabel),
        });
      }
    }
  }

  for (const item of items) {
    const list = inputsByItemId.get(item.id) ?? [];
    if (item.name && SHELF_ITEMS.length > 0) {
      const shelfMatches = matchShelfCatalogOffers(
        {
          id: item.productId ?? item.id,
          canonical_name: item.name,
          brand: item.brand ?? null,
          package_size: item.packageSize ?? null,
        },
        SHELF_ITEMS
      );
      list.push(...shelfMatches);
    }

    if (list.length > 0) {
      result.set(
        item.id,
        buildPriceGrid(list, resolveLoyaltyProgramName, {
          packageSize: item.packageSize ?? null,
          canonicalName: item.name,
        })
      );
    }
  }

  return result;
}

/**
 * Grila unui produs canonic din Supabase + Catalogul de Raft (`shelf-prices.json` cu Lidl `.xlsb`):
 *  1. Oferte directe + frați cu același `canonical_fingerprint` (`fetchSmartOffersForProduct`) -> „Exact”;
 *  2. Oferte de raft din `shelf-prices.json` (inclusiv Lidl zilnic `.xlsb`) -> „Exact” sau „Alternativă”;
 *  3. Dacă acoperirea este sub `SUFFICIENT_STORE_COVERAGE`, unește și echivalentele din aceeași familie/categorie/gramaj
 *     și mărcile proprii compatibile (`fetchCatalogAndEquivalentProfilesMap`).
 */
export function fetchProductPriceGrid(
  product: GridProductRef,
  city?: string
): Promise<PriceGridSummary> {
  const ids = Array.from(new Set([product.id, ...(product.mergedProductIds ?? [])]));
  const key = `${ids.join(',')}|${product.canonical_name ?? ''}|${city ?? ''}`;
  const hit = gridCache.get(key);
  if (hit && Date.now() - hit.at < GRID_TTL_MS) return hit.promise;

  const promise = loadGrid(product, ids, city).catch((err) => {
    gridCache.delete(key);
    throw err;
  });
  gridCache.set(key, { at: Date.now(), promise });
  return promise;
}

async function loadGrid(
  product: GridProductRef,
  ids: string[],
  city?: string
): Promise<PriceGridSummary> {
  const exactOffers = await fetchSmartOffersForProduct(ids, city);
  const inputs: PriceGridInput[] = exactOffers.map((offer) => ({ offer, kind: 'exact' }));

  const covered = new Set(
    exactOffers.map((o) => normalizeRetailerStoreKey(o.retailer_name, o.retailer_id))
  );

  // 2. Unire cu catalogul de raft `shelf-prices.json` (include pipeline-ul zilnic Lidl .xlsb)
  if (product.canonical_name && SHELF_ITEMS.length > 0) {
    const shelfMatches = matchShelfCatalogOffers(
      {
        id: ids[0],
        canonical_name: product.canonical_name,
        brand: product.brand ?? null,
        package_size: product.package_size ?? null,
      },
      SHELF_ITEMS
    );
    for (const sm of shelfMatches) {
      const storeKey = normalizeRetailerStoreKey(sm.offer.retailer_name, sm.offer.retailer_id);
      if (covered.has(storeKey) && sm.kind !== 'exact') continue;
      inputs.push(sm);
      covered.add(storeKey);
    }
  }

  // 3. Echivalente de familie, categorie/gramaj și mărci proprii când produsul are < 5 magazine
  if (covered.size < SUFFICIENT_STORE_COVERAGE) {
    try {
      const mapRes = await fetchCatalogAndEquivalentProfilesMap(ids, true, true);

      const metaById = new Map<
        string,
        { canonical_name: string; brand: string | null; isPl: boolean }
      >();

      for (const sid of ids) {
        const eqIds = mapRes.equivalentIdsByProductId.get(sid) ?? [];
        const plIds = mapRes.privateLabelIdsByProductId.get(sid) ?? [];
        for (const cid of [...eqIds, ...plIds]) {
          if (ids.includes(cid) || metaById.has(cid)) continue;
          const prof = mapRes.profilesById.get(cid);
          if (!prof) continue;
          metaById.set(cid, {
            canonical_name: prof.canonical_name,
            brand: prof.brand,
            isPl: isPrivateLabelProduct(prof),
          });
        }
      }

      const candidateIds = Array.from(metaById.keys()).slice(0, 36);
      if (candidateIds.length > 0) {
        const altOffers = await fetchVerifiedOffersForProducts(candidateIds, city);
        for (const offer of altOffers) {
          const storeKey = normalizeRetailerStoreKey(offer.retailer_name, offer.retailer_id);
          if (covered.has(storeKey)) continue;
          const meta = offer.product_id ? metaById.get(offer.product_id) : undefined;
          inputs.push({
            offer,
            kind: 'alternative',
            altBrand: meta?.brand ?? null,
            altName: meta?.canonical_name ?? null,
            altIsPrivateLabel: Boolean(meta?.isPl),
          });
        }
      }
    } catch {
      // Echivalentele extinse sunt non-blocante; grila exactă rămâne validă.
    }
  }

  return buildPriceGrid(inputs, resolveLoyaltyProgramName, {
    packageSize: product.package_size ?? null,
    canonicalName: product.canonical_name ?? null,
  });
}
