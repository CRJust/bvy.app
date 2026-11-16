import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, DEFAULT_BASKET, PRODUCT_MAP } from '../data/catalog.ts';
import type { BasketItem } from '../types.ts';
import {
  calculateStoreBasketSummary,
  computeDeliveryFee,
  computeInStoreProgress,
  computeOptimizationPlan,
  computeSplitTwoStores,
  formatRon,
  getEffectiveOffer,
  getEquivalenceLevelLabel,
  getFidelitySavingsSuggestion,
  getRankedStores,
  getSortedOffersForProduct,
  resolveProductForMode,
} from './pricing.ts';
import {
  matchKeywordsToProductIds,
  matchQueryToCanonicalProduct,
} from './aiMatcher.ts';
import {
  barcodeQueryVariants,
  buildOffersFromRawRows,
  deduplicateAndMergeSupabaseProducts,
  mapSupabaseProduct,
  tokenizeSearchQuery,
} from '../services/supabaseCatalog.ts';
import { sanitizeLegacyProduct } from './productCache.ts';
import type { CanonicalProduct } from '../types.ts';

test('catalog contains at least 30 canonical Romanian products with all 9 stores', () => {
  assert.ok(CATALOG.length >= 30, `Expected >= 30 products, got ${CATALOG.length}`);
  const storeKeys = [
    'lidl',
    'kaufland',
    'carrefour',
    'auchan',
    'mega_image',
    'penny',
    'profi',
    'freshful',
    'sezamo',
  ] as const;

  for (const product of CATALOG) {
    for (const storeId of storeKeys) {
      const offer = product.offers[storeId];
      assert.ok(offer, `Missing offer for ${product.id} in ${storeId}`);
      assert.ok(offer.basePrice > 0, `Invalid price for ${product.id} in ${storeId}`);
    }
  }
});

test('loyalty cards reduce prices immediately across offers and basket totals', () => {
  const withoutCards = calculateStoreBasketSummary(DEFAULT_BASKET, 'lidl', [], false, 'all');
  const withLidlPlus = calculateStoreBasketSummary(
    DEFAULT_BASKET,
    'lidl',
    ['lidl_plus'],
    false,
    'all'
  );
  assert.ok(
    withLidlPlus.subtotal < withoutCards.subtotal,
    `Expected Lidl Plus subtotal (${withLidlPlus.subtotal}) < standard (${withoutCards.subtotal})`
  );
  assert.ok(withLidlPlus.cardSavings > 0);
});

test('Sezamo Xtra waives online delivery fee', () => {
  const standardSezamo = computeDeliveryFee('sezamo', 120, [], 'online');
  const xtraSezamo = computeDeliveryFee('sezamo', 120, ['sezamo_xtra'], 'online');
  assert.equal(standardSezamo.deliveryFee, 14.9);
  assert.equal(xtraSezamo.deliveryFee, 0);
});

test('Mod Fidel suggests private label only when savings exceed 20%', () => {
  const butter = PRODUCT_MAP['napolact_unt_200g'];
  const suggestion = getFidelitySavingsSuggestion(butter, 'lidl', []);
  assert.ok(suggestion, 'Expected Pilos Unt 200g suggestion at Lidl (>20% cheaper)');
  assert.ok(suggestion.savingsPercent > 20);
  assert.equal(suggestion.equivalentProduct.id, 'unt_marca_proprie_200g');
});

test('Mod Economie replaces national brands with private label equivalents and tracks savings', () => {
  const fidelity = calculateStoreBasketSummary(DEFAULT_BASKET, 'lidl', [], false, 'all');
  const economy = calculateStoreBasketSummary(DEFAULT_BASKET, 'lidl', [], true, 'all');
  assert.ok(economy.subtotal < fidelity.subtotal);
  assert.ok(economy.economySavingsVsFidelity > 10);
});

test('ranked stores always sort ascending by totalWithDelivery', () => {
  const ranked = getRankedStores(DEFAULT_BASKET, ['lidl_plus', 'kaufland_card'], false, 'all');
  assert.equal(ranked.length, 9);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i].totalWithDelivery >= ranked[i - 1].totalWithDelivery);
  }
});

test('split 2 stores threshold enforces netSavings > 10 RON and > 8%', () => {
  const smallBasket: BasketItem[] = [
    { productId: 'zuzu_lapte_1l', quantity: 1, checkedInStore: false },
    { productId: 'banane_1kg', quantity: 1, checkedInStore: false },
  ];
  const smallSplit = computeSplitTwoStores(smallBasket, [], false, 'physical');
  if (smallSplit) {
    assert.equal(smallSplit.isWorthwhile, false);
  }

  // Construct a basket with steep contrast between Lidl and Kaufland
  const splitBasket: BasketItem[] = [
    { productId: 'unt_marca_proprie_200g', quantity: 3, checkedInStore: false },
    { productId: 'parmezan_150g', quantity: 3, checkedInStore: false },
    { productId: 'somon_file_250g', quantity: 3, checkedInStore: false },
    { productId: 'jacobs_kronung_250g', quantity: 3, checkedInStore: false },
  ];
  const splitResult = computeSplitTwoStores(
    splitBasket,
    ['lidl_plus', 'kaufland_card'],
    false,
    'physical'
  );
  assert.ok(splitResult);
  assert.equal(splitResult.isWorthwhile, splitResult.netSavings > 10 && splitResult.savingsPercent > 8);
});

test('in-store progress accurately splits checked vs remaining totals', () => {
  const basket: BasketItem[] = [
    { productId: 'zuzu_lapte_1l', quantity: 2, checkedInStore: true },
    { productId: 'banane_1kg', quantity: 1, checkedInStore: false },
  ];
  const progress = computeInStoreProgress(basket, 'lidl', [], false);
  assert.equal(progress.checkedCount, 1);
  assert.equal(progress.totalCount, 2);
  assert.equal(progress.checkedTotal, 14.98);
  assert.equal(progress.remainingTotal, 6.49);
});

test('formatRon uses Romanian comma separator and sorted offers mark cheapest', () => {
  assert.equal(formatRon(64.2), '64,20 lei');
  const offers = getSortedOffersForProduct(PRODUCT_MAP['banane_1kg'], []);
  assert.equal(offers[0].isCheapest, true);
  assert.equal(offers[0].storeId, 'penny');
});

test('4-level equivalence exposes Twin Canonic (Pepsi Max/Zero) and store-exclusive private labels', () => {
  const pepsiLidl = getEffectiveOffer(PRODUCT_MAP['pepsi_max_2l'], 'lidl', []);
  assert.equal(pepsiLidl.equivalenceLevel, 2);
  assert.equal(getEquivalenceLevelLabel(pepsiLidl.equivalenceLevel), 'Același produs, altă denumire');

  const privMilk = PRODUCT_MAP['lapte_marca_proprie_1l'];
  assert.match(privMilk.offers.lidl.variantLabel ?? '', /Pilos/);
  assert.match(privMilk.offers.auchan.variantLabel ?? '', /Pouce/);
  assert.match(privMilk.offers.penny.variantLabel ?? '', /Hanul Boieresc/);
  assert.match(privMilk.offers.carrefour.variantLabel ?? '', /Simpl/);
  assert.match(privMilk.offers.mega_image.variantLabel ?? '', /365/);
  assert.match(privMilk.offers.profi.variantLabel ?? '', /Proxi/);
  assert.match(privMilk.offers.sezamo.variantLabel ?? '', /Miil/);
});

test('aiMatcher enforces Twin Canonic, symmetric modifiers, pasta shape, and budget swaps', () => {
  const pepsiTwin = matchQueryToCanonicalProduct('Pepsi Zero Zahăr', 'Pepsi Zero 2 L', '2 L');
  assert.equal(pepsiTwin?.id, 'pepsi_max_2l');

  const lactoseFree = matchQueryToCanonicalProduct('lapte fara lactoza', 'Lapte fără lactoză 1 L', '1 L');
  assert.equal(lactoseFree?.id, 'lapte_fara_lactoza_1l');

  const regularMilk = matchQueryToCanonicalProduct('lapte proaspat 1.5%', 'Zuzu Lapte 1.5% 1 L', '1 L');
  assert.equal(regularMilk?.id, 'zuzu_lapte_1l');

  const penne = matchQueryToCanonicalProduct('paste penne 500g', 'Barilla Penne', '500g');
  assert.equal(penne?.id, 'barilla_penne_500g');

  const budgetButter = matchQueryToCanonicalProduct('unt 82%', 'Unt 82% 200g', '200g', true);
  assert.equal(budgetButter?.id, 'unt_marca_proprie_200g');

  const removed = matchKeywordsToProductIds(['unt', 'spaghetti']);
  assert.ok(removed.includes('napolact_unt_200g'));
  assert.ok(removed.includes('barilla_spaghetti_500g'));
});

test('Mod Fidel keeps zero private labels across catalog national brands and Balanced swaps', () => {
  for (const product of CATALOG) {
    if (!product.isPrivateLabel) {
      for (const offer of Object.values(product.offers)) {
        assert.notEqual(
          offer.equivalenceLevel,
          4,
          `Unexpected private-label offer (eqLevel 4) on national brand ${product.id}`
        );
      }
    }
  }

  const fidelBalanced = computeOptimizationPlan(
    DEFAULT_BASKET,
    ['lidl_plus', 'kaufland_card'],
    false,
    'all',
    'balanced'
  );
  const fidelCheapest = computeOptimizationPlan(
    DEFAULT_BASKET,
    ['lidl_plus', 'kaufland_card'],
    false,
    'all',
    'cheapest'
  );
  const fidelSingle = computeOptimizationPlan(
    DEFAULT_BASKET,
    ['lidl_plus', 'kaufland_card'],
    false,
    'all',
    'fidelity'
  );

  assert.ok(fidelBalanced && fidelCheapest && fidelSingle);
  assert.equal(fidelBalanced.swapsApplied.length, 0);
  assert.equal(fidelCheapest.swapsApplied.length, 0);
  assert.equal(fidelSingle.swapsApplied.length, 0);
  assert.equal(fidelBalanced.matchSummary.privateLabelCount, 0);
  assert.equal(fidelCheapest.matchSummary.privateLabelCount, 0);
  assert.equal(fidelSingle.matchSummary.privateLabelCount, 0);
  assert.equal(fidelBalanced.applyEconomyMode, false);
});

test('Mod Economie enables Balanced selective swaps (>20%) and Cheapest full private labels', () => {
  const ecoBalanced = computeOptimizationPlan(
    DEFAULT_BASKET,
    ['lidl_plus', 'kaufland_card'],
    true,
    'all',
    'balanced'
  );
  const fidelSingle = computeOptimizationPlan(
    DEFAULT_BASKET,
    ['lidl_plus', 'kaufland_card'],
    false,
    'all',
    'fidelity'
  );
  const ecoCheapest = computeOptimizationPlan(
    DEFAULT_BASKET,
    ['lidl_plus', 'kaufland_card'],
    true,
    'all',
    'cheapest'
  );

  assert.ok(ecoBalanced && fidelSingle && ecoCheapest);
  assert.ok(ecoBalanced.balancedScore >= 50 && ecoBalanced.balancedScore <= 100);
  assert.ok(ecoBalanced.reasons.length >= 2);
  assert.ok(ecoBalanced.swapsApplied.length > 0);
  assert.equal(ecoBalanced.applyEconomyMode, true);
  assert.ok(ecoBalanced.totalWithDelivery < fidelSingle.totalWithDelivery);
  assert.ok(ecoCheapest.totalWithDelivery <= ecoBalanced.totalWithDelivery);
  assert.equal(
    ecoBalanced.matchSummary.exactCount +
      ecoBalanced.matchSummary.twinCount +
      ecoBalanced.matchSummary.functionalCount +
      ecoBalanced.matchSummary.privateLabelCount,
    DEFAULT_BASKET.length
  );
});

test('computeOptimizationPlan surfaces missing loyalty card opportunity when card is inactive', () => {
  const noCardBalanced = computeOptimizationPlan(
    DEFAULT_BASKET,
    [],
    false,
    'all',
    'balanced'
  );
  assert.ok(noCardBalanced);
  assert.ok(
    noCardBalanced.cardOpportunity !== null && noCardBalanced.cardOpportunity.extraSavings > 0,
    'Expected missing loyalty card savings opportunity when no cards are active'
  );
});

test('online 2-store splits reject sub-baskets below store minOrder threshold', () => {
  // Small online basket: ~60 RON total, below 100 RON minOrder at Freshful/Sezamo and <70/75 at Carrefour/Auchan when split
  const smallOnlineBasket: BasketItem[] = [
    { productId: 'zuzu_lapte_1l', quantity: 1, checkedInStore: false },
    { productId: 'somon_file_250g', quantity: 1, checkedInStore: false },
    { productId: 'banane_1kg', quantity: 1, checkedInStore: false },
  ];
  const onlineSplit = computeSplitTwoStores(smallOnlineBasket, [], false, 'online');
  if (onlineSplit) {
    assert.ok(onlineSplit.subtotalA >= 50 && onlineSplit.subtotalB >= 50);
  }
  const smallOnlinePlan = computeOptimizationPlan(
    smallOnlineBasket,
    [],
    false,
    'online',
    'cheapest'
  );
  assert.ok(smallOnlinePlan);
  assert.equal(smallOnlinePlan.isSplit, false);
});

test('receipt equation invariant holds in both Mod Fidel and Mod Economie, plus bidirectional resolveProductForMode', () => {
  const privMilk = PRODUCT_MAP['lapte_marca_proprie_1l'];
  const backToNational = resolveProductForMode(privMilk, false, PRODUCT_MAP);
  assert.equal(backToNational.resolvedProduct.id, 'zuzu_lapte_1l');

  const keptNationalInEco = resolveProductForMode(privMilk, true, PRODUCT_MAP, ['zuzu_lapte_1l']);
  assert.equal(keptNationalInEco.resolvedProduct.id, 'zuzu_lapte_1l');

  for (const ecoMode of [false, true] as const) {
    for (const strategy of ['balanced', 'cheapest', 'fidelity'] as const) {
      for (const channel of ['all', 'physical', 'online'] as const) {
        const plan = computeOptimizationPlan(
          DEFAULT_BASKET,
          ['lidl_plus', 'kaufland_card'],
          ecoMode,
          channel,
          strategy
        );
        assert.ok(plan);
        const recomputed = Math.round((plan.shelfSubtotal - plan.cardSavings + plan.deliveryFee) * 100) / 100;
        assert.equal(
          recomputed,
          plan.totalWithDelivery,
          `Equation mismatch for eco=${ecoMode}/${strategy}/${channel}: ${plan.shelfSubtotal} - ${plan.cardSavings} + ${plan.deliveryFee} != ${plan.totalWithDelivery}`
        );
      }
    }
  }
});

test('aiMatcher prevents false-positive removals on lactose-free and handles Romanian articles and oil types', () => {
  const removeLactoseFree = matchKeywordsToProductIds(['lapte fara lactoza']);
  assert.ok(removeLactoseFree.includes('lapte_fara_lactoza_1l'));
  assert.equal(removeLactoseFree.includes('zuzu_lapte_1l'), false);
  assert.equal(removeLactoseFree.includes('pepsi_max_2l'), false);

  const removeDefiniteButter = matchKeywordsToProductIds(['untul']);
  assert.ok(removeDefiniteButter.includes('napolact_unt_200g'));
  assert.equal(removeDefiniteButter.includes('zuzu_lapte_1l'), false);

  const oliveOil = matchQueryToCanonicalProduct('ulei de masline extra virgin', 'Monini 500ml', '500 ml');
  assert.equal(oliveOil?.id, 'monini_ulei_500ml');

  const sunflowerOil = matchQueryToCanonicalProduct('ulei de floarea soarelui', 'Bunica 1L', '1 L');
  assert.equal(sunflowerOil?.id, 'bunica_ulei_1l');
});

test('every catalog product has a valid 13-digit GS1 EAN-13 code', () => {
  for (const prod of CATALOG) {
    assert.match(prod.ean, /^\d{13}$/, `Invalid EAN format for ${prod.id}: ${prod.ean}`);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const d = Number(prod.ean[i]);
      sum += i % 2 === 0 ? d : d * 3;
    }
    const expectedCheck = (10 - (sum % 10)) % 10;
    assert.equal(
      Number(prod.ean[12]),
      expectedCheck,
      `EAN check digit mismatch for ${prod.id}: ${prod.ean}`
    );
  }
});

test('computeOptimizationPlan enforces maxStores: 1, excludedStoreIds, and excludedSwapFromIds', () => {
  const splitBasket: BasketItem[] = [
    { productId: 'unt_marca_proprie_200g', quantity: 3, checkedInStore: false },
    { productId: 'parmezan_150g', quantity: 3, checkedInStore: false },
    { productId: 'somon_file_250g', quantity: 3, checkedInStore: false },
    { productId: 'jacobs_kronung_250g', quantity: 3, checkedInStore: false },
  ];

  const singleCheapest = computeOptimizationPlan(
    splitBasket,
    ['lidl_plus', 'kaufland_card'],
    false,
    'physical',
    'cheapest',
    PRODUCT_MAP,
    { maxStores: 1 }
  );
  assert.ok(singleCheapest);
  assert.equal(singleCheapest.isSplit, false);

  const initialBalanced = computeOptimizationPlan(
    DEFAULT_BASKET,
    ['lidl_plus', 'kaufland_card'],
    true,
    'all',
    'balanced',
    PRODUCT_MAP
  );
  assert.ok(initialBalanced && !initialBalanced.isSplit);
  const firstWinner = initialBalanced.storeId;

  if (firstWinner !== 'split') {
    const pivoted = computeOptimizationPlan(
      DEFAULT_BASKET,
      ['lidl_plus', 'kaufland_card'],
      true,
      'all',
      'balanced',
      PRODUCT_MAP,
      { excludedStoreIds: [firstWinner] }
    );
    assert.ok(pivoted);
    assert.notEqual(pivoted.storeId, firstWinner);
  }

  if (initialBalanced.swapsApplied.length > 0) {
    const firstSwapFrom = initialBalanced.swapsApplied[0].fromProductId;
    const modified = computeOptimizationPlan(
      DEFAULT_BASKET,
      ['lidl_plus', 'kaufland_card'],
      true,
      'all',
      'balanced',
      PRODUCT_MAP,
      { excludedSwapFromIds: [firstSwapFrom] }
    );
    assert.ok(modified);
    assert.equal(
      modified.swapsApplied.some((s) => s.fromProductId === firstSwapFrom),
      false
    );
    const recomputed =
      Math.round((modified.shelfSubtotal - modified.cardSavings + modified.deliveryFee) * 100) / 100;
    assert.equal(recomputed, modified.totalWithDelivery);
  }
});

test('deduplicateAndMergeSupabaseProducts merges equivalent SKUs, prefers real barcode, and sorts by real offers', () => {
  const prods = [
    {
      id: 'p_zero_offers',
      canonical_name: 'Zuzu Lapte 3.5% 1L fără oferte',
      brand: 'Zuzu',
      package_size: '1L',
      barcode: '5941000000018',
    },
    {
      id: 'p_barista_1',
      canonical_name: 'Zuzu Lapte UHT integral pentru cafea Barista, 3.5% grasime 1L',
      brand: 'Zuzu',
      package_size: '1L',
    },
    {
      id: 'p_barista_2',
      canonical_name: 'Zuzu Barista Lapte Uht Pt Cafea3,5% 1L',
      brand: 'Zuzu',
      package_size: '1L',
      barcode: '5941000000025',
    },
    {
      id: 'p_cacao_1',
      canonical_name: 'Zuzu Lapte cu cacao si gust de ciocolata 1.5% grasime 450ml',
      brand: 'Zuzu',
      package_size: '450ml',
    },
    {
      id: 'p_cacao_2',
      canonical_name: 'Zuzu Lapte Cu Cacao Si Ciocolata 1.5%Gr 450G',
      brand: 'Zuzu',
      package_size: '450g',
    },
    {
      id: 'p_frappe_1',
      canonical_name: 'Zuzu Bautura din lapte cu cafea frappe 1.5% grasime 450ml',
      brand: 'Zuzu',
      package_size: '450ml',
    },
    {
      id: 'p_frappe_2',
      canonical_name: 'Zuzu Bautura Frappe Cu Lapte 450Ml',
      brand: 'Zuzu',
      package_size: '450ml',
    },
  ];

  const offersByProductId = {
    p_zero_offers: [],
    p_barista_1: [
      { product_id: 'p_barista_1', price: 8.5, beavy_retailers: { slug: 'mega-image' } },
    ],
    p_barista_2: [
      { product_id: 'p_barista_2', price: 7.9, beavy_retailers: { slug: 'kaufland' } },
    ],
    p_cacao_1: [
      { product_id: 'p_cacao_1', price: 5.5, beavy_retailers: { slug: 'carrefour' } },
      { product_id: 'p_cacao_1', price: 5.8, beavy_retailers: { slug: 'mega-image' } },
    ],
    p_cacao_2: [
      { product_id: 'p_cacao_2', price: 5.2, beavy_retailers: { slug: 'profi' } },
      { product_id: 'p_cacao_2', price: 5.4, beavy_retailers: { slug: 'profi' } },
    ],
    p_frappe_1: [
      { product_id: 'p_frappe_1', price: 6.1, beavy_retailers: { slug: 'mega-image' } },
    ],
    p_frappe_2: [
      { product_id: 'p_frappe_2', price: 5.9, beavy_retailers: { slug: 'carrefour' } },
    ],
  };

  const merged = deduplicateAndMergeSupabaseProducts(prods, offersByProductId, 10);
  assert.equal(merged.length, 4);

  // Cacao (3 real stores) comes first, zero-offer product comes last
  assert.equal(merged[0].offers.carrefour.isUnavailable, undefined);
  assert.equal(merged[0].offers.mega_image.isUnavailable, undefined);
  assert.equal(merged[0].offers.profi.isUnavailable, undefined);
  assert.equal(merged[0].offers.profi.basePrice, 5.2);

  // Barista keeps p_barista_2 as primary because it has a real barcode, and has both Mega & Kaufland
  const barista = merged.find((p) => p.id === 'p_barista_2');
  assert.ok(barista);
  assert.equal(barista.ean, '5941000000025');
  assert.equal(barista.offers.mega_image.basePrice, 8.5);
  assert.equal(barista.offers.kaufland.basePrice, 7.9);

  // Zero-offer product is preserved at the end
  assert.equal(merged[merged.length - 1].id, 'p_zero_offers');
});

test('deduplicateAndMergeSupabaseProducts prevents false-positive merges on fat %, quantity, and multipack', () => {
  const prods = [
    { id: '1', canonical_name: 'Zuzu Lapte 1.5% 1L', brand: 'Zuzu', package_size: '1L' },
    { id: '2', canonical_name: 'Zuzu Lapte 3.5% 1L', brand: 'Zuzu', package_size: '1L' },
    { id: '3', canonical_name: 'Zuzu Lapte 1.5% 450ml', brand: 'Zuzu', package_size: '450ml' },
    { id: '4', canonical_name: 'Danone Activia 125g', brand: 'Danone', package_size: '125g' },
    { id: '5', canonical_name: 'Danone Activia 8x125g', brand: 'Danone', package_size: '8x125g' },
  ];

  const merged = deduplicateAndMergeSupabaseProducts(prods, {}, 10);
  assert.equal(merged.length, 5);
});

/* ------------------------- Supabase alignment (real data shapes) ------------------------- */

function liveProduct(
  id: string,
  name: string,
  offers: Array<{ slug: string; price: number; [key: string]: unknown }>,
  extra: Record<string, unknown> = {}
): CanonicalProduct {
  const rows = offers.map(({ slug, ...row }) => ({
    product_id: id,
    beavy_retailers: { slug },
    ...row,
  }));
  return mapSupabaseProduct(
    { id, canonical_name: name, ...extra },
    buildOffersFromRawRows(rows, false, name)
  );
}

test('Supabase quantities are normalized to kg / L / buc with a clean size label', () => {
  const grams = liveProduct('g1', 'Unt 82%', [], { quantity_value: 200, quantity_unit: 'g', package_size: '200 g' });
  assert.equal(grams.unitType, 'kg');
  assert.equal(grams.quantityBase, 0.2);
  assert.equal(grams.packageSize, '200 g');
  assert.equal(grams.sizeFilter, '200g');

  const ml = liveProduct('m1', 'Vin rosu', [], { quantity_value: '750', quantity_unit: 'ml', package_size: '750 ml' });
  assert.equal(ml.unitType, 'L');
  assert.equal(ml.quantityBase, 0.75);

  const litre = liveProduct('l1', 'Lapte', [], { quantity_value: 1000, quantity_unit: 'ml', package_size: '1000 ml' });
  assert.equal(litre.packageSize, '1 L');
  assert.equal(litre.sizeFilter, '1L');

  const pieces = liveProduct('p1', 'Oua XL 4 Bucati', [], { quantity_value: 4, quantity_unit: 'pcs', package_size: '4 pcs' });
  assert.equal(pieces.unitType, 'buc');
  assert.equal(pieces.quantityBase, 4);
  assert.equal(pieces.packageSize, '4 buc');

  // quantity_value is the multipack TOTAL; the label keeps the pack structure
  const multipack = liveProduct('x1', 'Apa minerala 6x2l', [], { quantity_value: 12, quantity_unit: 'L', package_size: '6x2 L' });
  assert.equal(multipack.quantityBase, 12);
  assert.equal(multipack.packageSize, '6 x 2 L');
  assert.equal(multipack.sizeFilter, 'Altele');
});

test('Supabase products with a price or "1 pc" in package_size take the size from the name', () => {
  const priceText = liveProduct('c1', 'CHEETOS PUFULETI CASCAVAL SI SUNCA60G', [], { package_size: '6,39 lei/buc' });
  assert.equal(priceText.packageSize, '60 g');
  assert.equal(priceText.unitType, 'kg');
  assert.equal(priceText.quantityBase, 0.06);

  const onePiece = liveProduct('c2', 'Tchibo Exclusive cafea boabe 1 kg', [], { package_size: '1 pc', quantity_value: 1, quantity_unit: 'pcs' });
  assert.equal(onePiece.packageSize, '1 kg');
  assert.equal(onePiece.quantityBase, 1);
  assert.equal(onePiece.unitType, 'kg');

  // Scraper parse error (0,33 L read as 33000 ml): no absurd size, no fake unit price
  const outlier = liveProduct('c3', 'Grivita Clasic 0 33L', [], { package_size: '33000 ml', quantity_value: 33000, quantity_unit: 'ml' });
  assert.equal(outlier.packageSize, '');
  assert.equal(outlier.unitType, 'buc');
  assert.equal(outlier.quantityBase, 1);
});

test('Supabase products never get placeholder brands, invented barcodes shown as real, or http images', () => {
  const bare = liveProduct('b1', 'Sola Espetec Fuet', [], { image_url: 'http://cdn.example.ro/a.jpg' });
  assert.equal(bare.brand, '');
  assert.equal(bare.eanIsSynthetic, true);
  assert.equal(bare.imageUrl, 'https://cdn.example.ro/a.jpg');

  const coded = liveProduct('b2', 'Zuzu Lapte 1L', [], { brand: ' Zuzu ', barcode: '5941000000018', image_url: 'javascript:alert(1)' });
  assert.equal(coded.brand, 'Zuzu');
  assert.equal(coded.ean, '5941000000018');
  assert.equal(coded.eanIsSynthetic, undefined);
  assert.equal(coded.imageUrl, undefined);
});

test('Supabase offers map shelf, promo and loyalty prices without inventing discounts', () => {
  const offers = buildOffersFromRawRows(
    [
      // Loyalty price: only with the card
      { product_id: 'o', price: '4.99', regular_price: '4.99', loyalty_price: '3.49', promo_requires_card: true, promo_label: 'PENNY Card', beavy_retailers: { slug: 'penny' } },
      // Public promo: price already reduced, regular_price is the struck-through shelf price
      { product_id: 'o', price: 8.99, regular_price: 11.99, promo_price: 8.99, promo_requires_card: false, promo_label: 'Reducere', beavy_retailers: { slug: 'kaufland' } },
      // Multi-buy label without a lower unit price
      { product_id: 'o', price: 6.5, regular_price: 6.5, promo_label: 'Buy more, save more', beavy_retailers: { slug: 'freshful' } },
      // Out of stock: listed, but not buyable
      { product_id: 'o', price: 5.1, stock_status: 'out_of_stock', beavy_retailers: { slug: 'sezamo' } },
    ],
    false,
    'Produs test'
  );

  assert.equal(offers.penny.basePrice, 4.99);
  assert.equal(offers.penny.cardPrice, 3.49);
  assert.equal(offers.penny.cardId, 'penny_card');
  assert.equal(offers.penny.regularPrice, undefined);

  assert.equal(offers.kaufland.basePrice, 8.99);
  assert.equal(offers.kaufland.regularPrice, 11.99);
  assert.equal(offers.kaufland.cardPrice, undefined);
  assert.equal(offers.kaufland.promoIsInfoOnly, undefined);

  assert.equal(offers.freshful.basePrice, 6.5);
  assert.equal(offers.freshful.promoIsInfoOnly, true);

  assert.equal(offers.sezamo.isUnavailable, true);
  assert.equal(offers.sezamo.isOutOfStock, true);

  // No row => unavailable, with no price at all (no 10 lei fallback, no average estimate)
  assert.equal(offers.lidl.isUnavailable, true);
  assert.equal(offers.lidl.basePrice, 0);
  assert.equal(offers.lidl.isOutOfStock, undefined);

  const product = mapSupabaseProduct({ id: 'o', canonical_name: 'Produs test' }, offers);
  assert.equal(product.realOfferCount, 3);

  const withoutCard = getEffectiveOffer(product, 'penny', []);
  assert.equal(withoutCard.price, 4.99);
  const withCard = getEffectiveOffer(product, 'penny', ['penny_card']);
  assert.equal(withCard.price, 3.49);
  assert.equal(withCard.usedCardProgram, 'PENNY Card');
  assert.equal(getEffectiveOffer(product, 'kaufland', []).regularPrice, 11.99);

  const missing = getEffectiveOffer(product, 'lidl', []);
  assert.equal(missing.isUnavailable, true);
  assert.equal(missing.price, 0);

  const sorted = getSortedOffersForProduct(product, ['penny_card']);
  assert.equal(sorted[0].storeId, 'penny');
  assert.equal(sorted[0].isCheapest, true);
  assert.equal(sorted.slice(0, 3).every((o) => !o.isUnavailable), true);
  assert.equal(sorted.slice(3).every((o) => o.isUnavailable && !o.isCheapest), true);
});

test('store ranking puts basket coverage before price and keeps unpriced lines out of totals', () => {
  const everywhere = liveProduct('cov-a', 'Paine alba 500g', [
    { slug: 'lidl', price: 5 },
    { slug: 'kaufland', price: 6 },
  ]);
  const kauflandOnly = liveProduct('cov-b', 'Cafea boabe 1 kg', [{ slug: 'kaufland', price: 50 }]);
  const unpriced = liveProduct('cov-c', 'Produs fara oferte', []);
  const map = { [everywhere.id]: everywhere, [kauflandOnly.id]: kauflandOnly, [unpriced.id]: unpriced };
  const basket: BasketItem[] = [
    { productId: 'cov-a', quantity: 1, checkedInStore: false },
    { productId: 'cov-b', quantity: 1, checkedInStore: false },
    { productId: 'cov-c', quantity: 3, checkedInStore: false },
  ];

  const ranked = getRankedStores(basket, [], false, 'physical', map);
  // Lidl is "cheaper" (5 lei) only because it lacks the coffee: Kaufland must win
  assert.equal(ranked[0].storeId, 'kaufland');
  assert.equal(ranked[0].totalWithDelivery, 56);
  assert.equal(ranked[0].availableCount, 2);
  assert.equal(ranked[0].missingCount, 0);
  assert.equal(ranked[0].unpricedCount, 1);

  const lidl = ranked.find((r) => r.storeId === 'lidl');
  assert.ok(lidl);
  assert.equal(lidl.totalWithDelivery, 5);
  assert.equal(lidl.missingCount, 1);
  assert.deepEqual(lidl.missingProductIds, ['cov-b']);
  assert.ok(ranked.indexOf(lidl) > 0);

  const single = computeOptimizationPlan(basket, [], false, 'physical', 'balanced', map, { maxStores: 1 });
  assert.ok(single);
  assert.equal(single.storeId, 'kaufland');
  assert.equal(single.unpricedCount, 1);
  assert.ok(single.warnings.some((w) => w.includes('fără preț verificat')));
});

test('a 2-store split is recommended when it covers more of the basket, without fake savings', () => {
  const lidlOnly = liveProduct('sp-a', 'Iaurt grecesc 400g', [{ slug: 'lidl', price: 7 }]);
  const kauflandOnly = liveProduct('sp-b', 'Ulei masline 1 L', [{ slug: 'kaufland', price: 40 }]);
  const map = { [lidlOnly.id]: lidlOnly, [kauflandOnly.id]: kauflandOnly };
  const basket: BasketItem[] = [
    { productId: 'sp-a', quantity: 2, checkedInStore: false },
    { productId: 'sp-b', quantity: 1, checkedInStore: false },
  ];

  const split = computeSplitTwoStores(basket, [], false, 'physical', map);
  assert.ok(split);
  assert.deepEqual([split.storeA, split.storeB].sort(), ['kaufland', 'lidl']);
  assert.equal(split.totalWithDelivery, 54);
  assert.equal(split.missingCount, 0);
  assert.equal(split.coverageGain, 1);
  assert.equal(split.netSavings, 0);
  assert.equal(split.isWorthwhile, true);

  for (const strategy of ['balanced', 'cheapest'] as const) {
    const plan = computeOptimizationPlan(basket, [], false, 'physical', strategy, map);
    assert.ok(plan);
    assert.equal(plan.isSplit, true);
    assert.equal(plan.availableCount, 2);
    assert.equal(plan.missingCount, 0);
    assert.equal(plan.totalWithDelivery, 54);
  }

  const oneStore = computeOptimizationPlan(basket, [], false, 'physical', 'balanced', map, { maxStores: 1 });
  assert.ok(oneStore);
  assert.equal(oneStore.isSplit, false);
  assert.equal(oneStore.missingCount, 1);
  assert.ok(oneStore.warnings.some((w) => w.includes('ofertă verificată')));
});

test('search query helpers: accent-free word tokens and exact barcode variants', () => {
  assert.deepEqual(tokenizeSearchQuery('  Lapte Zuzu 3,5% '), ['lapte', 'zuzu']);
  assert.deepEqual(tokenizeSearchQuery('brânză'), ['branza']);
  assert.deepEqual(tokenizeSearchQuery('a'), []);
  assert.equal(barcodeQueryVariants('lapte 1l'), null);
  assert.equal(barcodeQueryVariants('1234567'), null);
  const variants = barcodeQueryVariants('0594 1000000018');
  assert.ok(variants);
  assert.ok(variants.includes('05941000000018'));
  assert.ok(variants.includes('5941000000018'));
});

test('legacy cached products lose estimated prices and placeholder brands', () => {
  const legacy = {
    ...liveProduct('lg-1', 'Produs vechi', [{ slug: 'lidl', price: 9 }]),
    brand: 'Brand național',
  } as CanonicalProduct;
  (legacy.offers.kaufland as unknown as Record<string, unknown>) = {
    storeId: 'kaufland',
    basePrice: 9.45,
    matchKind: 'Exact',
    isEstimated: true,
  };
  const clean = sanitizeLegacyProduct(legacy);
  assert.equal(clean.brand, '');
  assert.equal(clean.offers.lidl.basePrice, 9);
  assert.equal(clean.offers.kaufland.isUnavailable, true);
  assert.equal(clean.offers.kaufland.basePrice, 0);
  assert.equal(clean.realOfferCount, 1);
});
