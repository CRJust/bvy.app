import type {
  SmartShoppingConfig,
  SmartProductInput,
  SmartShoppingResult,
  ScenarioBasket,
  SmartProductAssignment,
  SmartStoreAssignment,
  UnavailableSmartItem,
  AlternativeOffer,
  ValidatedOffer,
} from './types';
import { DEFAULT_SMART_SHOPPING_CONFIG } from './types';
import { evaluateProductOfferMatch } from './matcher';
import { validateOffer } from './validator';
import type {
  BeavyProductOffer,
  BeavyRetailer,
  BeavyFulfillmentRule,
  CatalogProductProfile,
} from '@/services/beavy-comparison';

export interface OptimizationInput {
  shoppingListId?: string;
  items: SmartProductInput[];
  allOffers: BeavyProductOffer[];
  retailers: BeavyRetailer[];
  catalogProfiles?: Record<string, CatalogProductProfile>;
  fulfillmentRules?: Record<string, BeavyFulfillmentRule>;
  config?: Partial<SmartShoppingConfig>;
}

/**
 * Generates all non-empty subsets of an array up to maxSize
 */
function getCombinations<T>(array: T[], maxSize: number): T[][] {
  const results: T[][] = [];

  function helper(start: number, current: T[]) {
    if (current.length > 0 && current.length <= maxSize) {
      results.push([...current]);
    }
    if (current.length >= maxSize) return;

    for (let i = start; i < array.length; i++) {
      current.push(array[i]);
      helper(i + 1, current);
      current.pop();
    }
  }

  helper(0, []);
  return results;
}

/**
 * Computes delivery/packaging fees and MOV compliance for a retailer stop
 */
function computeStoreFulfillmentCosts(params: {
  retailer: BeavyRetailer;
  channel: 'store' | 'delivery' | 'online';
  productSubtotal: number;
  fulfillmentRules: Record<string, BeavyFulfillmentRule>;
}): {
  deliveryFee: number;
  packagingFee: number;
  minimumOrderValue: number | null;
  meetsMinimumOrderValue: boolean;
  storeTotal: number;
} {
  const { retailer, channel, productSubtotal, fulfillmentRules } = params;
  const isDeliveryChannel =
    channel === 'delivery' ||
    channel === 'online' ||
    (retailer.supports_delivery && !retailer.supports_physical);

  if (!isDeliveryChannel) {
    return {
      deliveryFee: 0,
      packagingFee: 0,
      minimumOrderValue: null,
      meetsMinimumOrderValue: true,
      storeTotal: productSubtotal,
    };
  }

  const rule =
    fulfillmentRules[retailer.id] ||
    fulfillmentRules[retailer.slug.toLowerCase()] ||
    fulfillmentRules[retailer.name.toLowerCase()];

  if (!rule) {
    return {
      deliveryFee: 0,
      packagingFee: 0,
      minimumOrderValue: null,
      meetsMinimumOrderValue: true,
      storeTotal: productSubtotal,
    };
  }

  const mov =
    rule.minimum_order_value != null && Number(rule.minimum_order_value) > 0
      ? Number(rule.minimum_order_value)
      : null;
  const meetsMinimumOrderValue = mov == null || productSubtotal >= mov;

  let deliveryFee = 0;
  const freeThreshold =
    rule.free_delivery_threshold != null && Number(rule.free_delivery_threshold) > 0
      ? Number(rule.free_delivery_threshold)
      : null;

  if (freeThreshold == null || productSubtotal < freeThreshold) {
    deliveryFee += Number(rule.delivery_fee || 0);
  }

  if (
    rule.small_order_fee_threshold != null &&
    productSubtotal < Number(rule.small_order_fee_threshold) &&
    rule.small_order_fee != null
  ) {
    deliveryFee += Number(rule.small_order_fee);
  }

  const packagingFee = Number(rule.packaging_fee || 0) + Number(rule.service_fee || 0);
  const storeTotal = productSubtotal + deliveryFee + packagingFee;

  return {
    deliveryFee,
    packagingFee,
    minimumOrderValue: mov,
    meetsMinimumOrderValue,
    storeTotal,
  };
}

/**
 * Resolves the latest real observed_at timestamp from assigned offers
 */
function resolveScenarioFreshnessTimestamp(
  assignments: SmartProductAssignment[],
  fallbackIso: string
): string {
  let latestMs = 0;
  let latestIso = '';

  for (const a of assignments) {
    const raw = a.selectedOffer?.observed_at;
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (!Number.isNaN(ms) && ms > latestMs) {
      latestMs = ms;
      latestIso = raw;
    }
  }

  return latestIso || fallbackIso;
}

/**
 * Pure deterministic Smart Shopping Optimization Engine
 */
export function optimizeSmartShopping(input: OptimizationInput): SmartShoppingResult {
  const config: SmartShoppingConfig = {
    ...DEFAULT_SMART_SHOPPING_CONFIG,
    ...input.config,
    maxStores: Math.min(3, Math.max(1, input.config?.maxStores ?? 2)),
    additionalStorePenalty: Math.max(0, input.config?.additionalStorePenalty ?? 8.0),
  };

  const calculatedAt = new Date().toISOString();
  const { items, allOffers, retailers, catalogProfiles = {}, fulfillmentRules = {} } = input;

  // 1. Validate all offers
  const validOffers: ValidatedOffer[] = [];
  for (const raw of allOffers) {
    const valid = validateOffer(raw, config);
    if (valid) {
      validOffers.push(valid);
    }
  }

  // Build retailer map
  const retailerMap = new Map<string, BeavyRetailer>();
  for (const r of retailers) {
    retailerMap.set(r.name.toLowerCase().trim(), r);
    retailerMap.set(r.slug.toLowerCase().trim(), r);
    retailerMap.set(r.id, r);
  }

  // 2. Group valid offers by item and retailer
  type ItemRetailerOffer = {
    offer: ValidatedOffer;
    canonicalProduct?: CatalogProductProfile | null;
    matchQuality: 'exact_ean' | 'exact_id' | 'equivalent' | 'substitution';
    isSubstitution: boolean;
    substitutionReason?: string | null;
  };

  const itemOffersMap = new Map<string, Map<string, ItemRetailerOffer>>();
  const unavailableItems: UnavailableSmartItem[] = [];

  for (const item of items) {
    const retailerCandidates = new Map<string, ItemRetailerOffer>();
    const itemProfile = item.productId ? catalogProfiles[item.productId] : null;

    for (const offer of validOffers) {
      const offerProfile = offer.product_id ? catalogProfiles[offer.product_id] : null;
      const match = evaluateProductOfferMatch({
        item,
        offer,
        itemCanonical: itemProfile,
        offerCanonical: offerProfile,
        allowSubstitutions: config.allowSubstitutions,
      });

      if (match && match.matchQuality !== 'unmatched') {
        const retName = (offer.retailer_name || '').toLowerCase().trim();
        const existing = retailerCandidates.get(retName);
        const linePrice = match.offer.effectiveUnitPrice;

        if (!existing || linePrice < existing.offer.effectiveUnitPrice) {
          retailerCandidates.set(retName, {
            offer: match.offer,
            canonicalProduct: match.canonicalProduct || offerProfile || itemProfile,
            matchQuality: match.matchQuality,
            isSubstitution: match.isSubstitution,
            substitutionReason: match.substitutionReason,
          });
        }
      }
    }

    if (retailerCandidates.size === 0) {
      unavailableItems.push({
        itemId: item.id,
        name: item.name,
        brand: item.brand,
        reason: 'no_offers_found',
      });
    } else {
      itemOffersMap.set(item.id, retailerCandidates);
    }
  }

  // Unique active retailers with at least one candidate offer
  const activeRetailerNames = new Set<string>();
  for (const rMap of itemOffersMap.values()) {
    for (const rName of rMap.keys()) {
      activeRetailerNames.add(rName);
    }
  }
  const candidateRetailers = Array.from(activeRetailerNames).sort();

  // Helper to resolve BeavyRetailer object
  function getRetailerObj(nameOrSlug: string): BeavyRetailer {
    const norm = nameOrSlug.toLowerCase().trim();
    return (
      retailerMap.get(norm) || {
        id: norm,
        slug: norm,
        name: nameOrSlug,
        logo_url: null,
        website_url: null,
        supports_physical: true,
        supports_delivery: true,
        is_active: true,
        updated_at: calculatedAt,
      }
    );
  }

  // Precompute alternatives and cheapest possible line total per item across all retailers
  const alternativesByItem = new Map<string, AlternativeOffer[]>();
  const cheapestLineTotalByItem = new Map<string, number>();

  for (const item of items) {
    const rOffers = itemOffersMap.get(item.id);
    if (!rOffers || rOffers.size === 0) continue;

    const alts: AlternativeOffer[] = [];
    let minLine = Infinity;

    for (const [rName, opt] of rOffers.entries()) {
      const rObj = getRetailerObj(rName);
      const lineTotal = opt.offer.effectiveUnitPrice * item.quantity;
      if (lineTotal < minLine) minLine = lineTotal;

      alts.push({
        retailerId: rObj.id,
        retailerName: rObj.name,
        retailerSlug: rObj.slug,
        price: opt.offer.effectiveUnitPrice,
        lineTotal,
        unitPrice: opt.offer.unit_price,
        promoLabel: opt.offer.promo_label,
        matchQuality: opt.matchQuality,
        isSubstitution: opt.isSubstitution,
        offerId: opt.offer.id,
      });
    }

    alts.sort((a, b) => a.lineTotal - b.lineTotal);
    alternativesByItem.set(item.id, alts);
    if (Number.isFinite(minLine)) {
      cheapestLineTotalByItem.set(item.id, minLine);
    }
  }

  // Helper to build a SmartProductAssignment cleanly without duplicating URL bugs
  function buildProductAssignment(
    item: SmartProductInput,
    matched: ItemRetailerOffer,
    retailerName: string,
    singleStoreBenchmarkLineTotal?: number
  ): SmartProductAssignment {
    const rObj = getRetailerObj(retailerName);
    const lineTotal = matched.offer.effectiveUnitPrice * item.quantity;
    const profile =
      matched.canonicalProduct ||
      (matched.offer.product_id ? catalogProfiles[matched.offer.product_id] : null) ||
      (item.productId ? catalogProfiles[item.productId] : null);

    const canonicalName = profile?.canonical_name || item.name;
    const brand = profile?.brand || item.brand || null;
    const packageSize = matched.offer.package_size || profile?.package_size || item.packageSize || null;
    const imageUrl = matched.offer.image_url || profile?.image_url || item.imageUrl || null;
    const cheapestPossiblePrice = cheapestLineTotalByItem.get(item.id) ?? lineTotal;
    const benchmarkLine = singleStoreBenchmarkLineTotal ?? lineTotal;

    return {
      itemId: item.id,
      requestedName: item.name,
      canonicalProductId: matched.offer.product_id || profile?.id || item.productId || null,
      canonicalName,
      brand,
      packageSize,
      imageUrl,
      quantity: item.quantity,
      matchQuality: matched.matchQuality,
      isSubstitution: matched.isSubstitution,
      substitutionReason: matched.substitutionReason,
      selectedRetailer: {
        id: rObj.id,
        name: rObj.name,
        slug: rObj.slug,
        logoUrl: rObj.logo_url,
      },
      selectedOffer: matched.offer,
      lineTotal,
      cheapestPossiblePrice,
      savingsVsSingleStore: Math.max(0, benchmarkLine - lineTotal),
      alternativeOffers: alternativesByItem.get(item.id) || [],
    };
  }

  // -------------------------------------------------------------
  // SCENARIO 1: SINGLE STORE BASKET
  // -------------------------------------------------------------
  let singleStoreBasket: ScenarioBasket | null = null;
  const singleStoreLineTotalByItem = new Map<string, number>();
  {
    let bestSingleStore: {
      retailerName: string;
      coveredCount: number;
      productCost: number;
      assignments: SmartProductAssignment[];
    } | null = null;

    for (const rName of candidateRetailers) {
      let covered = 0;
      let cost = 0;
      const assignments: SmartProductAssignment[] = [];

      for (const item of items) {
        const rOffers = itemOffersMap.get(item.id);
        const matched = rOffers?.get(rName);
        if (matched) {
          covered++;
          const lineTotal = matched.offer.effectiveUnitPrice * item.quantity;
          cost += lineTotal;
          assignments.push(buildProductAssignment(item, matched, rName, lineTotal));
        }
      }

      if (
        covered > 0 &&
        (!bestSingleStore ||
          covered > bestSingleStore.coveredCount ||
          (covered === bestSingleStore.coveredCount && cost < bestSingleStore.productCost))
      ) {
        bestSingleStore = {
          retailerName: rName,
          coveredCount: covered,
          productCost: cost,
          assignments,
        };
      }
    }

    if (bestSingleStore) {
      for (const a of bestSingleStore.assignments) {
        singleStoreLineTotalByItem.set(a.itemId, a.lineTotal);
      }

      const retObj = getRetailerObj(bestSingleStore.retailerName);
      const channel = retObj.supports_physical ? 'store' : 'delivery';
      const fulfillment = computeStoreFulfillmentCosts({
        retailer: retObj,
        channel,
        productSubtotal: bestSingleStore.productCost,
        fulfillmentRules,
      });

      const storeAssignment: SmartStoreAssignment = {
        retailer: retObj,
        channel,
        productCount: bestSingleStore.assignments.length,
        productSubtotal: bestSingleStore.productCost,
        deliveryFee: fulfillment.deliveryFee,
        packagingFee: fulfillment.packagingFee,
        minimumOrderValue: fulfillment.minimumOrderValue,
        meetsMinimumOrderValue: fulfillment.meetsMinimumOrderValue,
        storeTotal: fulfillment.storeTotal,
        assignedItems: bestSingleStore.assignments,
      };

      singleStoreBasket = {
        scenarioId: 'single_store',
        title: 'Un singur magazin',
        description: `Toate produsele disponibile cumpărate dintr-un singur magazin (${retObj.name})`,
        isRecommended: false,
        productCost: bestSingleStore.productCost,
        storeCount: 1,
        inconveniencePenalty: 0,
        travelCost: 0,
        deliveryCost: fulfillment.deliveryFee + fulfillment.packagingFee,
        objectiveScore: fulfillment.storeTotal,
        totalToPay: fulfillment.storeTotal,
        totalSavings: 0,
        storeAssignments: [storeAssignment],
        productAssignments: bestSingleStore.assignments,
        unavailableItems: unavailableItems.concat(
          items
            .filter((it) => !bestSingleStore!.assignments.some((a) => a.itemId === it.id))
            .filter((it) => !unavailableItems.some((u) => u.itemId === it.id))
            .map((it) => ({
              itemId: it.id,
              name: it.name,
              brand: it.brand,
              reason: 'retailer_filtered' as const,
            }))
        ),
        freshnessTimestamp: resolveScenarioFreshnessTimestamp(bestSingleStore.assignments, calculatedAt),
        explanation: `${retObj.name} oferă cel mai bun preț dintr-o singură oprire (${fulfillment.storeTotal.toFixed(2)} RON).`,
      };
    }
  }

  // Benchmark cost for savings calculations
  const benchmarkCost = singleStoreBasket ? singleStoreBasket.totalToPay : 0;

  // -------------------------------------------------------------
  // SCENARIO 2: CHEAPEST BASKET (Unconstrained, λ = 0)
  // -------------------------------------------------------------
  let cheapestBasket: ScenarioBasket;
  {
    const assignments: SmartProductAssignment[] = [];
    const storeMap = new Map<string, SmartProductAssignment[]>();
    let totalCost = 0;

    for (const item of items) {
      const rOffers = itemOffersMap.get(item.id);
      if (!rOffers || rOffers.size === 0) continue;

      let bestOffer: ItemRetailerOffer | null = null;
      let bestRetailer = '';

      for (const [rName, opt] of rOffers.entries()) {
        if (!bestOffer || opt.offer.effectiveUnitPrice < bestOffer.offer.effectiveUnitPrice) {
          bestOffer = opt;
          bestRetailer = rName;
        }
      }

      if (bestOffer && bestRetailer) {
        const assignment = buildProductAssignment(
          item,
          bestOffer,
          bestRetailer,
          singleStoreLineTotalByItem.get(item.id)
        );
        totalCost += assignment.lineTotal;
        assignments.push(assignment);

        const list = storeMap.get(bestRetailer) || [];
        list.push(assignment);
        storeMap.set(bestRetailer, list);
      }
    }

    const storeAssignments: SmartStoreAssignment[] = [];
    let totalDelivery = 0;

    for (const [rName, list] of storeMap.entries()) {
      const retObj = getRetailerObj(rName);
      const subtotal = list.reduce((s, it) => s + it.lineTotal, 0);
      const channel = retObj.supports_physical ? 'store' : 'delivery';
      const fulfillment = computeStoreFulfillmentCosts({
        retailer: retObj,
        channel,
        productSubtotal: subtotal,
        fulfillmentRules,
      });
      totalDelivery += fulfillment.deliveryFee + fulfillment.packagingFee;

      storeAssignments.push({
        retailer: retObj,
        channel,
        productCount: list.length,
        productSubtotal: subtotal,
        deliveryFee: fulfillment.deliveryFee,
        packagingFee: fulfillment.packagingFee,
        minimumOrderValue: fulfillment.minimumOrderValue,
        meetsMinimumOrderValue: fulfillment.meetsMinimumOrderValue,
        storeTotal: fulfillment.storeTotal,
        assignedItems: list,
      });
    }

    const storeCount = storeAssignments.length;
    const totalToPay = totalCost + totalDelivery;
    const totalSavings = Math.max(0, benchmarkCost - totalToPay);

    cheapestBasket = {
      scenarioId: 'cheapest_basket',
      title: 'Cel mai ieftin coș absolut',
      description: `Fiecare produs la prețul minim absolut, indiferent de numărul de magazine (${storeCount} ${storeCount === 1 ? 'magazin' : 'magazine'})`,
      isRecommended: false,
      productCost: totalCost,
      storeCount,
      inconveniencePenalty: 0,
      travelCost: 0,
      deliveryCost: totalDelivery,
      objectiveScore: totalToPay,
      totalToPay,
      totalSavings,
      storeAssignments,
      productAssignments: assignments,
      unavailableItems,
      freshnessTimestamp: resolveScenarioFreshnessTimestamp(assignments, calculatedAt),
      explanation: `Prețul minim absolut (${totalCost.toFixed(2)} RON produse), împărțit în ${storeCount} ${storeCount === 1 ? 'magazin' : 'magazine'}.`,
    };
  }

  // -------------------------------------------------------------
  // SCENARIO 3: SMART BASKET (Balanced Optimization, Objective J)
  // J = C_products + lambda * (K - 1) + C_travel + C_delivery
  // -------------------------------------------------------------
  let combinationsEvaluated = 0;
  let smartBasket: ScenarioBasket;
  {
    const maxK = Math.min(config.maxStores, candidateRetailers.length);
    const retailerSubsets = getCombinations(candidateRetailers, maxK);
    combinationsEvaluated = retailerSubsets.length;

    let bestSubsetResult: {
      subset: string[];
      usedRetailers: string[];
      productCost: number;
      penalty: number;
      travelCost: number;
      deliveryCost: number;
      objectiveScore: number;
      assignments: SmartProductAssignment[];
      storeAssignments: SmartStoreAssignment[];
    } | null = null;

    for (const subset of retailerSubsets) {
      let subsetCost = 0;
      const assignments: SmartProductAssignment[] = [];
      const storeItemMap = new Map<string, SmartProductAssignment[]>();

      for (const item of items) {
        const rOffers = itemOffersMap.get(item.id);
        if (!rOffers) continue;

        let bestOfferInSubset: ItemRetailerOffer | null = null;
        let chosenRetailer = '';

        for (const rName of subset) {
          const opt = rOffers.get(rName);
          if (!opt) continue;
          if (!bestOfferInSubset || opt.offer.effectiveUnitPrice < bestOfferInSubset.offer.effectiveUnitPrice) {
            bestOfferInSubset = opt;
            chosenRetailer = rName;
          }
        }

        if (bestOfferInSubset && chosenRetailer) {
          const assignment = buildProductAssignment(
            item,
            bestOfferInSubset,
            chosenRetailer,
            singleStoreLineTotalByItem.get(item.id)
          );
          subsetCost += assignment.lineTotal;
          assignments.push(assignment);

          const list = storeItemMap.get(chosenRetailer) || [];
          list.push(assignment);
          storeItemMap.set(chosenRetailer, list);
        }
      }

      // Stores actually used (must have > 0 products assigned)
      const usedRetailers = Array.from(storeItemMap.keys());
      if (usedRetailers.length === 0) continue;

      const K_used = usedRetailers.length;
      const penalty = config.additionalStorePenalty * (K_used - 1);
      const travelCost = (config.estimatedTravelCostPerStore || 0) * (K_used - 1);

      let deliveryCost = 0;
      const storeAssignments: SmartStoreAssignment[] = [];

      for (const rName of usedRetailers) {
        const retObj = getRetailerObj(rName);
        const assigned = storeItemMap.get(rName) || [];
        const subtotal = assigned.reduce((s, a) => s + a.lineTotal, 0);
        const channel = retObj.supports_physical ? 'store' : 'delivery';

        const fulfillment = computeStoreFulfillmentCosts({
          retailer: retObj,
          channel,
          productSubtotal: subtotal,
          fulfillmentRules,
        });

        deliveryCost += fulfillment.deliveryFee + fulfillment.packagingFee;

        storeAssignments.push({
          retailer: retObj,
          channel,
          productCount: assigned.length,
          productSubtotal: subtotal,
          deliveryFee: fulfillment.deliveryFee,
          packagingFee: fulfillment.packagingFee,
          minimumOrderValue: fulfillment.minimumOrderValue,
          meetsMinimumOrderValue: fulfillment.meetsMinimumOrderValue,
          storeTotal: fulfillment.storeTotal,
          assignedItems: assigned,
        });
      }

      const objectiveScore = subsetCost + penalty + travelCost + deliveryCost;

      // Selection: maximize product coverage, minimize objective score J, prefer fewer stores on ties
      if (
        !bestSubsetResult ||
        assignments.length > bestSubsetResult.assignments.length ||
        (assignments.length === bestSubsetResult.assignments.length &&
          (objectiveScore < bestSubsetResult.objectiveScore ||
            (objectiveScore === bestSubsetResult.objectiveScore &&
              usedRetailers.length < bestSubsetResult.usedRetailers.length)))
      ) {
        bestSubsetResult = {
          subset,
          usedRetailers,
          productCost: subsetCost,
          penalty,
          travelCost,
          deliveryCost,
          objectiveScore,
          assignments,
          storeAssignments,
        };
      }
    }

    if (bestSubsetResult) {
      const totalToPay = bestSubsetResult.productCost + bestSubsetResult.deliveryCost;
      const totalSavings = Math.max(0, benchmarkCost - totalToPay);
      const kCount = bestSubsetResult.usedRetailers.length;

      let explanation = '';
      if (kCount === 1) {
        explanation = `Recomandăm un singur magazin (${bestSubsetResult.storeAssignments[0].retailer.name}), deoarece diferența de preț din alte magazine nu justifică deplasarea suplimentară.`;
      } else {
        const storeNames = bestSubsetResult.storeAssignments.map((s) => s.retailer.name).join(' și ');
        explanation = `Economisești ${totalSavings.toFixed(2)} RON împărțind cumpărăturile între ${storeNames}, compensând cu mult penalizarea de ${bestSubsetResult.penalty.toFixed(0)} RON pentru oprirea suplimentară.`;
      }

      smartBasket = {
        scenarioId: 'smart_basket',
        title: 'Coșul inteligent Beavy',
        description: `Echilibru optim între economie și comoditate (${kCount} ${kCount === 1 ? 'magazin' : 'magazine'})`,
        isRecommended: true,
        productCost: bestSubsetResult.productCost,
        storeCount: kCount,
        inconveniencePenalty: bestSubsetResult.penalty,
        travelCost: bestSubsetResult.travelCost,
        deliveryCost: bestSubsetResult.deliveryCost,
        objectiveScore: bestSubsetResult.objectiveScore,
        totalToPay,
        totalSavings,
        storeAssignments: bestSubsetResult.storeAssignments,
        productAssignments: bestSubsetResult.assignments,
        unavailableItems,
        freshnessTimestamp: resolveScenarioFreshnessTimestamp(bestSubsetResult.assignments, calculatedAt),
        explanation,
      };
    } else {
      smartBasket = cheapestBasket;
    }
  }

  // -------------------------------------------------------------
  // SCENARIO 4: ONLINE BASKET (Delivery fees + MOV)
  // -------------------------------------------------------------
  let onlineBasket: ScenarioBasket | null = null;
  {
    const onlineRetailerNames = candidateRetailers.filter((rName) => {
      const rObj = getRetailerObj(rName);
      return rObj.supports_delivery;
    });

    if (onlineRetailerNames.length > 0) {
      let bestOnline: {
        retailerName: string;
        coveredCount: number;
        productCost: number;
        deliveryFee: number;
        packagingFee: number;
        minimumOrderValue: number | null;
        meetsMOV: boolean;
        storeTotal: number;
        assignments: SmartProductAssignment[];
      } | null = null;

      for (const rName of onlineRetailerNames) {
        let covered = 0;
        let cost = 0;
        const assignments: SmartProductAssignment[] = [];

        for (const item of items) {
          const rOffers = itemOffersMap.get(item.id);
          const matched = rOffers?.get(rName);
          if (matched) {
            covered++;
            const assignment = buildProductAssignment(
              item,
              matched,
              rName,
              singleStoreLineTotalByItem.get(item.id)
            );
            cost += assignment.lineTotal;
            assignments.push(assignment);
          }
        }

        if (covered === 0) continue;

        const retObj = getRetailerObj(rName);
        const fulfillment = computeStoreFulfillmentCosts({
          retailer: retObj,
          channel: 'delivery',
          productSubtotal: cost,
          fulfillmentRules,
        });

        if (
          !bestOnline ||
          covered > bestOnline.coveredCount ||
          (covered === bestOnline.coveredCount && fulfillment.storeTotal < bestOnline.storeTotal)
        ) {
          bestOnline = {
            retailerName: rName,
            coveredCount: covered,
            productCost: cost,
            deliveryFee: fulfillment.deliveryFee,
            packagingFee: fulfillment.packagingFee,
            minimumOrderValue: fulfillment.minimumOrderValue,
            meetsMOV: fulfillment.meetsMinimumOrderValue,
            storeTotal: fulfillment.storeTotal,
            assignments,
          };
        }
      }

      if (bestOnline) {
        const retObj = getRetailerObj(bestOnline.retailerName);
        const totalDelivery = bestOnline.deliveryFee + bestOnline.packagingFee;
        const totalToPay = bestOnline.storeTotal;
        const storeAssignment: SmartStoreAssignment = {
          retailer: retObj,
          channel: 'delivery',
          productCount: bestOnline.assignments.length,
          productSubtotal: bestOnline.productCost,
          deliveryFee: bestOnline.deliveryFee,
          packagingFee: bestOnline.packagingFee,
          minimumOrderValue: bestOnline.minimumOrderValue,
          meetsMinimumOrderValue: bestOnline.meetsMOV,
          storeTotal: totalToPay,
          assignedItems: bestOnline.assignments,
        };

        const movNote =
          !bestOnline.meetsMOV && bestOnline.minimumOrderValue
            ? ` (Comandă minimă: ${bestOnline.minimumOrderValue.toFixed(0)} RON)`
            : '';

        onlineBasket = {
          scenarioId: 'online_basket',
          title: 'Comandă online cu livrare',
          description: `Livrare acasă prin ${retObj.name}${movNote}`,
          isRecommended: false,
          productCost: bestOnline.productCost,
          storeCount: 1,
          inconveniencePenalty: 0,
          travelCost: 0,
          deliveryCost: totalDelivery,
          objectiveScore: totalToPay,
          totalToPay,
          totalSavings: Math.max(0, benchmarkCost - totalToPay),
          storeAssignments: [storeAssignment],
          productAssignments: bestOnline.assignments,
          unavailableItems,
          freshnessTimestamp: resolveScenarioFreshnessTimestamp(bestOnline.assignments, calculatedAt),
          explanation: `Comandă online prin ${retObj.name}. Taxă de livrare: ${totalDelivery > 0 ? `${totalDelivery.toFixed(2)} RON` : 'Gratuită'}${movNote}.`,
        };
      }
    }
  }

  // Pick recommendedScenario based on config.optimizationMode
  let recommendedScenario = smartBasket;
  if (config.optimizationMode === 'cheapest') {
    recommendedScenario = cheapestBasket;
  } else if (config.optimizationMode === 'single_store' && singleStoreBasket) {
    recommendedScenario = singleStoreBasket;
  } else if (config.optimizationMode === 'online' && onlineBasket) {
    recommendedScenario = onlineBasket;
  }

  return {
    shoppingListId: input.shoppingListId,
    calculatedAt,
    config,
    recommendedScenario,
    scenarios: {
      smartBasket,
      cheapestBasket,
      singleStoreBasket,
      onlineBasket,
    },
    metrics: {
      identifiedProductsCount: items.length - unavailableItems.length,
      retailersAnalyzedCount: candidateRetailers.length,
      validOffersEvaluatedCount: validOffers.length,
      combinationsEvaluatedCount: combinationsEvaluated,
    },
    unavailableItems,
  };
}

/**
 * Recalculates basket totals, delivery fees, and store assignments when the user manually changes a product's store.
 */
export function recalculateBasketWithReassignments(params: {
  basket: ScenarioBasket;
  reassignments: Record<string, string>; // itemId -> selectedRetailerSlugOrId
  retailers: BeavyRetailer[];
  fulfillmentRules?: Record<string, BeavyFulfillmentRule>;
  benchmarkCost?: number;
  config?: Partial<SmartShoppingConfig>;
}): ScenarioBasket {
  const { basket, reassignments, retailers, fulfillmentRules = {}, benchmarkCost, config = {} } = params;
  const penaltyPerStore = config.additionalStorePenalty ?? DEFAULT_SMART_SHOPPING_CONFIG.additionalStorePenalty;

  const retailerMap = new Map<string, BeavyRetailer>();
  for (const r of retailers) {
    retailerMap.set(r.slug.toLowerCase(), r);
    retailerMap.set(r.id, r);
    retailerMap.set(r.name.toLowerCase(), r);
  }

  const updatedProductAssignments: SmartProductAssignment[] = basket.productAssignments.map((p) => {
    const reassignedTarget = reassignments[p.itemId];
    if (!reassignedTarget) return p;

    const alt = p.alternativeOffers.find(
      (a) =>
        a.retailerId === reassignedTarget ||
        a.retailerSlug.toLowerCase() === reassignedTarget.toLowerCase() ||
        a.retailerName.toLowerCase() === reassignedTarget.toLowerCase()
    );

    if (!alt) return p;

    const rObj = retailerMap.get(alt.retailerSlug.toLowerCase()) || {
      id: alt.retailerId,
      slug: alt.retailerSlug,
      name: alt.retailerName,
      logo_url: null,
      website_url: null,
      supports_physical: true,
      supports_delivery: false,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const baselineDiff = p.lineTotal - alt.lineTotal;
    const updatedSavings = Math.max(0, p.savingsVsSingleStore + baselineDiff);

    return {
      ...p,
      selectedRetailer: {
        id: rObj.id,
        name: rObj.name,
        slug: rObj.slug,
        logoUrl: rObj.logo_url,
      },
      lineTotal: alt.lineTotal,
      savingsVsSingleStore: updatedSavings,
      selectedOffer: {
        ...p.selectedOffer,
        id: alt.offerId,
        price: alt.price,
        effectiveUnitPrice: alt.price,
        retailer_name: alt.retailerName,
        retailer_id: alt.retailerId,
      },
      matchQuality: alt.matchQuality,
      isSubstitution: alt.isSubstitution,
    };
  });

  // Group by newly selected retailer
  const storeItemMap = new Map<string, SmartProductAssignment[]>();
  for (const p of updatedProductAssignments) {
    const key = p.selectedRetailer.slug.toLowerCase();
    const list = storeItemMap.get(key) || [];
    list.push(p);
    storeItemMap.set(key, list);
  }

  const updatedStoreAssignments: SmartStoreAssignment[] = [];
  let productCost = 0;
  let deliveryCost = 0;

  for (const [slug, itemsList] of storeItemMap.entries()) {
    const rObj = retailerMap.get(slug) || {
      id: itemsList[0].selectedRetailer.id,
      slug: itemsList[0].selectedRetailer.slug,
      name: itemsList[0].selectedRetailer.name,
      logo_url: itemsList[0].selectedRetailer.logoUrl || null,
      website_url: null,
      supports_physical: true,
      supports_delivery: false,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const subtotal = itemsList.reduce((acc, it) => acc + it.lineTotal, 0);
    productCost += subtotal;

    const channel =
      basket.scenarioId === 'online_basket' || (!rObj.supports_physical && rObj.supports_delivery)
        ? 'delivery'
        : 'store';

    const fulfillment = computeStoreFulfillmentCosts({
      retailer: rObj,
      channel,
      productSubtotal: subtotal,
      fulfillmentRules,
    });

    deliveryCost += fulfillment.deliveryFee + fulfillment.packagingFee;

    updatedStoreAssignments.push({
      retailer: rObj,
      channel,
      productCount: itemsList.length,
      productSubtotal: subtotal,
      deliveryFee: fulfillment.deliveryFee,
      packagingFee: fulfillment.packagingFee,
      minimumOrderValue: fulfillment.minimumOrderValue,
      meetsMinimumOrderValue: fulfillment.meetsMinimumOrderValue,
      storeTotal: fulfillment.storeTotal,
      assignedItems: itemsList,
    });
  }

  const storeCount = updatedStoreAssignments.length;
  const penalty = penaltyPerStore * Math.max(0, storeCount - 1);
  const objectiveScore = productCost + penalty + basket.travelCost + deliveryCost;
  const totalToPay = productCost + deliveryCost;
  const effectiveBenchmark = benchmarkCost ?? basket.totalToPay + basket.totalSavings;
  const totalSavings = Math.max(0, effectiveBenchmark - totalToPay);

  return {
    ...basket,
    productCost,
    storeCount,
    inconveniencePenalty: penalty,
    deliveryCost,
    objectiveScore,
    totalToPay,
    totalSavings,
    storeAssignments: updatedStoreAssignments,
    productAssignments: updatedProductAssignments,
    explanation: `Coș actualizat manual (${storeCount} ${storeCount === 1 ? 'magazin' : 'magazine'}).`,
  };
}
