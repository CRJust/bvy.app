import { supabase } from '@/lib/supabase';
import type {
  SmartProductInput,
  SmartShoppingConfig,
  SmartShoppingResult,
  ScenarioBasket,
} from './types';
import { optimizeSmartShopping } from './engine';
import {
  fetchActiveRetailers,
  fetchActiveFulfillmentData,
  fetchVerifiedOffersForProducts,
  fetchPaginatedByChunks,
  resolveGenericTermCatalogMatches,
  type CatalogProductProfile,
  type BeavyFulfillmentRule,
  type BeavyRetailer,
  UUID_IN_CHUNK_SIZE,
  FAMILY_IN_CHUNK_SIZE,
} from '@/services/beavy-comparison';

export interface OptimizeBasketParams {
  shoppingListId?: string;
  items: SmartProductInput[];
  config?: Partial<SmartShoppingConfig>;
  userId?: string | null;
  onProgress?: (stage: {
    stageIndex: number;
    stageMessage: string;
    identifiedCount?: number;
    retailersCount?: number;
    offersCount?: number;
    combinationsCount?: number;
  }) => void;
}

const inFlightOptimizations = new Map<string, Promise<SmartShoppingResult>>();

function buildRequestDedupKey(params: OptimizeBasketParams): string {
  const itemsSig = params.items
    .map((it) => `${it.id}:${it.productId || it.name}:${it.quantity}`)
    .sort()
    .join('|');
  const cfgSig = JSON.stringify(params.config || {});
  return `${params.shoppingListId || 'default'}::${itemsSig}::${cfgSig}`;
}

/**
 * Executes the complete Smart Shopping optimization pipeline:
 * 1. Resolves generic terms & loads canonical profiles + product families
 * 2. Fetches verified retailer offers (including family equivalents)
 * 3. Fetches active retailers & maps fulfillment rules to retailer IDs/slugs
 * 4. Runs deterministic multi-scenario optimization
 * 5. Persists result to Supabase asynchronously for authenticated users
 * Includes automatic in-flight duplicate request deduplication.
 */
export async function runSmartShoppingOptimization(
  params: OptimizeBasketParams
): Promise<SmartShoppingResult> {
  if (params.items.length === 0) {
    throw new Error('Lista de cumpărături este goală.');
  }

  const dedupKey = buildRequestDedupKey(params);
  const existingPromise = inFlightOptimizations.get(dedupKey);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = executeSmartShoppingOptimization(params).finally(() => {
    inFlightOptimizations.delete(dedupKey);
  });

  inFlightOptimizations.set(dedupKey, promise);
  return promise;
}

async function executeSmartShoppingOptimization(
  params: OptimizeBasketParams
): Promise<SmartShoppingResult> {
  const { shoppingListId, items, config = {}, userId, onProgress } = params;

  // Stage 1: Analizăm lista ta…
  onProgress?.({
    stageIndex: 0,
    stageMessage: 'Analizăm lista ta…',
    identifiedCount: items.length,
  });

  // Resolve generic items (items without productId) in parallel
  const enrichedItems: SmartProductInput[] = await Promise.all(
    items.map(async (item) => {
      if (item.productId) return item;
      try {
        const matches = await resolveGenericTermCatalogMatches(item.name, 5);
        if (matches.length > 0) {
          return {
            ...item,
            productId: matches[0].id,
            brand: item.brand ?? matches[0].brand,
            packageSize: item.packageSize ?? matches[0].package_size,
            imageUrl: item.imageUrl ?? matches[0].image_url,
            category: item.category ?? matches[0].category,
            subcategory: item.subcategory ?? matches[0].subcategory,
          };
        }
      } catch {
        // Keep generic item as-is if search RPC is unavailable
      }
      return item;
    })
  );

  const seedProductIds = Array.from(
    new Set(enrichedItems.map((i) => i.productId).filter((id): id is string => Boolean(id)))
  );

  // Stage 2: Identificăm produsele…
  onProgress?.({
    stageIndex: 1,
    stageMessage: 'Identificăm produsele…',
    identifiedCount: seedProductIds.length,
  });

  const catalogProfiles: Record<string, CatalogProductProfile> = {};

  if (seedProductIds.length > 0) {
    try {
      type RawProductRow = {
        id: string;
        canonical_name: string;
        brand: string | null;
        package_size: string | null;
        quantity_value: number | null;
        quantity_unit: string | null;
        image_url: string | null;
        category: string | null;
        subcategory: string | null;
        attributes: Record<string, unknown> | null;
      };

      const prods = await fetchPaginatedByChunks<RawProductRow>(
        seedProductIds,
        UUID_IN_CHUNK_SIZE,
        (chunk, from, to) =>
          supabase
            .from('beavy_products')
            .select(
              'id, canonical_name, brand, package_size, quantity_value, quantity_unit, image_url, category, subcategory, attributes'
            )
            .in('id', chunk)
            .range(from, to)
      );

      for (const p of prods) {
        catalogProfiles[p.id] = {
          id: p.id,
          canonical_name: p.canonical_name,
          brand: p.brand,
          package_size: p.package_size,
          quantity_value: p.quantity_value,
          quantity_unit: p.quantity_unit,
          image_url: p.image_url,
          category: p.category,
          subcategory: p.subcategory,
          attributes: p.attributes || {},
          familyIds: [],
        };
      }

      // Fetch family memberships for seed products so Tier 3 (equivalent) & Tier 4 (substitution) work
      type FamilyMemberRow = { family_id: string; product_id: string };
      const seedMembers = await fetchPaginatedByChunks<FamilyMemberRow>(
        seedProductIds,
        UUID_IN_CHUNK_SIZE,
        (chunk, from, to) =>
          supabase
            .from('beavy_product_family_members')
            .select('family_id, product_id')
            .in('product_id', chunk)
            .range(from, to)
      );

      const familyIdSet = new Set<string>();
      for (const m of seedMembers) {
        familyIdSet.add(m.family_id);
        if (catalogProfiles[m.product_id]) {
          catalogProfiles[m.product_id].familyIds.push(m.family_id);
        }
      }

      if (familyIdSet.size > 0) {
        const allFamilyMembers = await fetchPaginatedByChunks<FamilyMemberRow>(
          Array.from(familyIdSet),
          FAMILY_IN_CHUNK_SIZE,
          (chunk, from, to) =>
            supabase
              .from('beavy_product_family_members')
              .select('family_id, product_id')
              .in('family_id', chunk)
              .range(from, to)
        );

        const siblingProductIds = Array.from(
          new Set(
            allFamilyMembers
              .map((m) => m.product_id)
              .filter((pid) => !catalogProfiles[pid])
          )
        );

        if (siblingProductIds.length > 0) {
          const siblingProds = await fetchPaginatedByChunks<RawProductRow>(
            siblingProductIds,
            UUID_IN_CHUNK_SIZE,
            (chunk, from, to) =>
              supabase
                .from('beavy_products')
                .select(
                  'id, canonical_name, brand, package_size, quantity_value, quantity_unit, image_url, category, subcategory, attributes'
                )
                .in('id', chunk)
                .eq('is_active', true)
                .range(from, to)
          );

          for (const p of siblingProds) {
            catalogProfiles[p.id] = {
              id: p.id,
              canonical_name: p.canonical_name,
              brand: p.brand,
              package_size: p.package_size,
              quantity_value: p.quantity_value,
              quantity_unit: p.quantity_unit,
              image_url: p.image_url,
              category: p.category,
              subcategory: p.subcategory,
              attributes: p.attributes || {},
              familyIds: [],
            };
          }
        }

        for (const m of allFamilyMembers) {
          const prof = catalogProfiles[m.product_id];
          if (prof && !prof.familyIds.includes(m.family_id)) {
            prof.familyIds.push(m.family_id);
          }
        }
      }
    } catch {
      // Continue with available profiles
    }
  }

  const allCandidateProductIds = Array.from(
    new Set([...seedProductIds, ...Object.keys(catalogProfiles)])
  );

  // Stage 3: Comparăm prețurile…
  onProgress?.({
    stageIndex: 2,
    stageMessage: 'Comparăm prețurile…',
    identifiedCount: seedProductIds.length,
  });

  // Parallel fetch: retailers, fulfillment rules, verified offers
  const [retailersRes, fulfillmentRes, offersRes] = await Promise.all([
    fetchActiveRetailers().catch(() => [] as BeavyRetailer[]),
    fetchActiveFulfillmentData(config.city).catch(() => ({ nodes: [], rules: [] })),
    allCandidateProductIds.length > 0
      ? fetchVerifiedOffersForProducts(allCandidateProductIds, config.city).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Stage 4: Verificăm ofertele disponibile…
  onProgress?.({
    stageIndex: 3,
    stageMessage: 'Verificăm ofertele disponibile…',
    identifiedCount: seedProductIds.length,
    retailersCount: retailersRes.length,
    offersCount: offersRes.length,
  });

  // Map fulfillment rules by node ID, retailer ID, and retailer slug
  const fulfillmentRulesMap: Record<string, BeavyFulfillmentRule> = {};
  const nodeById = new Map(fulfillmentRes.nodes.map((n) => [n.id, n]));
  const retailerById = new Map(retailersRes.map((r) => [r.id, r]));

  for (const r of fulfillmentRes.rules) {
    fulfillmentRulesMap[r.fulfillment_node_id] = r;
    const node = nodeById.get(r.fulfillment_node_id);
    if (node) {
      fulfillmentRulesMap[node.retailer_id] = r;
      const ret = retailerById.get(node.retailer_id);
      if (ret) {
        fulfillmentRulesMap[ret.slug.toLowerCase()] = r;
        fulfillmentRulesMap[ret.name.toLowerCase()] = r;
      }
    }
  }

  // Stage 5: Calculăm combinația optimă…
  onProgress?.({
    stageIndex: 4,
    stageMessage: 'Calculăm combinația optimă…',
    identifiedCount: seedProductIds.length,
    retailersCount: retailersRes.length,
    offersCount: offersRes.length,
  });

  // Run pure deterministic optimization
  const result = optimizeSmartShopping({
    shoppingListId,
    items: enrichedItems,
    allOffers: offersRes,
    retailers: retailersRes,
    catalogProfiles,
    fulfillmentRules: fulfillmentRulesMap,
    config,
  });

  result.retailers = retailersRes;
  result.fulfillmentRules = fulfillmentRulesMap;

  // Stage 6: Pregătim coșul recomandat…
  onProgress?.({
    stageIndex: 5,
    stageMessage: 'Pregătim coșul recomandat…',
    identifiedCount: result.metrics.identifiedProductsCount,
    retailersCount: result.metrics.retailersAnalyzedCount,
    offersCount: result.metrics.validOffersEvaluatedCount,
    combinationsCount: result.metrics.combinationsEvaluatedCount,
  });

  // Async persistence to Supabase for authenticated users (non-blocking)
  if (userId) {
    persistSmartShoppingResult(result, userId).catch(() => {
      // Non-blocking persistence failure
    });
  }

  return result;
}

/**
 * Persists Smart Shopping optimization result to Supabase for authenticated users
 */
async function persistSmartShoppingResult(
  result: SmartShoppingResult,
  userId?: string | null
): Promise<void> {
  if (!userId) return;
  const rec = result.recommendedScenario;

  const { data: insertedResult, error: resultError } = await supabase
    .from('smart_basket_results')
    .insert({
      user_id: userId,
      shopping_list_id: result.shoppingListId || null,
      optimization_mode: result.config.optimizationMode,
      recommended_scenario: rec.scenarioId,
      total_product_cost: rec.productCost,
      store_count: rec.storeCount,
      inconvenience_penalty: rec.inconveniencePenalty,
      travel_cost: rec.travelCost,
      delivery_cost: rec.deliveryCost,
      objective_score: rec.objectiveScore,
      total_to_pay: rec.totalToPay,
      total_savings: rec.totalSavings,
      config: result.config,
      scenarios_payload: {
        smartBasket: sanitizeScenarioForPayload(result.scenarios.smartBasket),
        cheapestBasket: sanitizeScenarioForPayload(result.scenarios.cheapestBasket),
        singleStoreBasket: result.scenarios.singleStoreBasket
          ? sanitizeScenarioForPayload(result.scenarios.singleStoreBasket)
          : null,
        onlineBasket: result.scenarios.onlineBasket
          ? sanitizeScenarioForPayload(result.scenarios.onlineBasket)
          : null,
      },
      metrics: result.metrics,
    })
    .select('id')
    .single();

  if (resultError || !insertedResult) return;

  if (rec.productAssignments.length > 0) {
    const assignmentsRows = rec.productAssignments.map((p) => ({
      result_id: insertedResult.id,
      scenario_id: rec.scenarioId,
      item_id: p.itemId,
      canonical_product_id: p.canonicalProductId || null,
      retailer_id: p.selectedRetailer.id.length === 36 ? p.selectedRetailer.id : null,
      retailer_name: p.selectedRetailer.name,
      offer_id: p.selectedOffer.id || null,
      quantity: p.quantity,
      unit_price: p.selectedOffer.effectiveUnitPrice,
      line_total: p.lineTotal,
      match_quality: p.matchQuality,
      is_substitution: p.isSubstitution,
      substitution_reason: p.substitutionReason || null,
    }));

    await supabase.from('smart_basket_assignments').insert(assignmentsRows);
  }
}

function sanitizeScenarioForPayload(scenario: ScenarioBasket) {
  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    productCost: scenario.productCost,
    storeCount: scenario.storeCount,
    inconveniencePenalty: scenario.inconveniencePenalty,
    deliveryCost: scenario.deliveryCost,
    objectiveScore: scenario.objectiveScore,
    totalToPay: scenario.totalToPay,
    totalSavings: scenario.totalSavings,
    explanation: scenario.explanation,
    stores: scenario.storeAssignments.map((s) => ({
      retailerName: s.retailer.name,
      retailerSlug: s.retailer.slug,
      productCount: s.productCount,
      subtotal: s.productSubtotal,
      deliveryFee: s.deliveryFee,
    })),
  };
}
