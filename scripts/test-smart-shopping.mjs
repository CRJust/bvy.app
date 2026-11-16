import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

async function loadTsModule(relPath, extraMocks = {}) {
  const filePath = path.join(process.cwd(), ...relPath.split('/'));
  const source = await fs.readFile(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });

  const mod = { exports: {} };
  const sandboxRequire = (id) => {
    if (id in extraMocks) return extraMocks[id];
    const basename = path.basename(id, path.extname(id));
    for (const [key, val] of Object.entries(extraMocks)) {
      if (path.basename(key, path.extname(key)) === basename) {
        return val;
      }
    }
    return require(id);
  };

  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {\n${compiled.outputText}\n})`,
    { filename: filePath }
  );
  wrapper(mod.exports, sandboxRequire, mod, filePath, path.dirname(filePath));
  return mod.exports;
}

test('Smart Shopping: Full End-to-End Test Suite', async (t) => {
  const mockIntelligence = await loadTsModule('src/services/beavy-intelligence.ts');
  const mockBeavyComparison = await loadTsModule('src/services/beavy-comparison.ts', {
    '@/lib/supabase': { supabase: {} },
    '@/services/beavy-intelligence': mockIntelligence,
  });

  const types = await loadTsModule('src/services/smart-shopping/types.ts', {
    '@/services/beavy-comparison': mockBeavyComparison,
  });

  const matcher = await loadTsModule('src/services/smart-shopping/matcher.ts', {
    '@/services/beavy-comparison': mockBeavyComparison,
  });

  const validator = await loadTsModule('src/services/smart-shopping/validator.ts', {
    '@/services/beavy-comparison': mockBeavyComparison,
  });

  const engine = await loadTsModule('src/services/smart-shopping/engine.ts', {
    '@/services/beavy-comparison': mockBeavyComparison,
    './matcher': matcher,
    './validator': validator,
    './types': types,
  });

  await t.test('1. Quantity normalization: SI units for mass, volume, and count', () => {
    const gNorm = matcher.normalizeQuantity(500, 'g');
    assert.equal(gNorm?.standardizedValue, 0.5);
    assert.equal(gNorm?.standardizedUnit, 'kg');

    const kgNorm = matcher.normalizeQuantity(1.5, 'kg');
    assert.equal(kgNorm?.standardizedValue, 1.5);
    assert.equal(kgNorm?.standardizedUnit, 'kg');

    const mlNorm = matcher.normalizeQuantity(750, 'ml');
    assert.equal(mlNorm?.standardizedValue, 0.75);
    assert.equal(mlNorm?.standardizedUnit, 'l');

    const lNorm = matcher.normalizeQuantity(2, 'l');
    assert.equal(lNorm?.standardizedValue, 2);
    assert.equal(lNorm?.standardizedUnit, 'l');

    const bucNorm = matcher.normalizeQuantity(6, 'buc');
    assert.equal(bucNorm?.standardizedValue, 6);
    assert.equal(bucNorm?.standardizedUnit, 'buc');
  });

  await t.test('2. Product matcher: 4-tier hierarchy (EAN > ID > Equivalent > Substitution) & private-label isolation', () => {
    const item = {
      id: 'item-1',
      productId: 'prod-milk-1',
      name: 'Lapte Zuzu 3.5% 1L',
      barcode: '5941012345678',
      quantity: 1,
    };

    // Tier 1: EAN match
    const eanOffer = {
      id: 'off-1',
      product_id: 'prod-other',
      retailer_name: 'Kaufland',
      price: 8.5,
      currency: 'RON',
      raw_data: { barcode: '5941012345678' },
      stock_status: 'in_stock',
      fulfillment_channel: 'store',
    };
    const eanMatch = matcher.evaluateProductOfferMatch({
      item,
      offer: eanOffer,
      allowSubstitutions: false,
    });
    assert.ok(eanMatch);
    assert.equal(eanMatch.matchQuality, 'exact_ean');

    // Tier 2: Exact canonical ID match
    const idOffer = {
      id: 'off-2',
      product_id: 'prod-milk-1',
      retailer_name: 'Lidl',
      price: 8.4,
      currency: 'RON',
      raw_data: {},
      stock_status: 'in_stock',
      fulfillment_channel: 'store',
    };
    const idMatch = matcher.evaluateProductOfferMatch({
      item,
      offer: idOffer,
      allowSubstitutions: false,
    });
    assert.ok(idMatch);
    assert.equal(idMatch.matchQuality, 'exact_id');

    // Tier 3: Equivalent product (same family & compatible size/fat)
    const itemProfile = {
      id: 'prod-milk-1',
      canonical_name: 'Lapte Zuzu 3.5% 1L',
      brand: 'Zuzu',
      package_size: '1 l',
      quantity_value: 1,
      quantity_unit: 'l',
      category: 'Lactate',
      attributes: { fat_percentage: 3.5 },
      familyIds: ['fam-milk-35'],
    };
    const equivProfile = {
      id: 'prod-milk-2',
      canonical_name: 'Lapte Napolact 3.5% 1L',
      brand: 'Napolact',
      package_size: '1 l',
      quantity_value: 1,
      quantity_unit: 'l',
      category: 'Lactate',
      attributes: { fat_percentage: 3.5 },
      familyIds: ['fam-milk-35'],
    };
    const equivOffer = {
      id: 'off-equiv',
      product_id: 'prod-milk-2',
      retailer_name: 'Auchan',
      price: 7.9,
      currency: 'RON',
      stock_status: 'in_stock',
      fulfillment_channel: 'store',
    };
    const equivMatch = matcher.evaluateProductOfferMatch({
      item,
      offer: equivOffer,
      itemCanonical: itemProfile,
      offerCanonical: equivProfile,
      allowSubstitutions: false,
    });
    assert.ok(equivMatch);
    assert.equal(equivMatch.matchQuality, 'equivalent');
    assert.equal(equivMatch.isSubstitution, false);

    // Private-label isolation: Mega Image 365 brand must NEVER match at Sezamo
    const plMegaOffer = {
      id: 'off-3',
      product_id: 'prod-pl',
      retailer_name: 'Sezamo',
      price: 5.0,
      currency: 'RON',
      raw_data: {},
      stock_status: 'in_stock',
      fulfillment_channel: 'delivery',
    };
    const plMegaProfile = {
      id: 'prod-pl',
      canonical_name: 'Lapte 365 Mega Image 1L',
      brand: '365',
      category: 'Lactate',
      familyIds: [],
      attributes: {},
    };
    const plLeakMatch = matcher.evaluateProductOfferMatch({
      item,
      offer: plMegaOffer,
      offerCanonical: plMegaProfile,
      allowSubstitutions: true,
    });
    assert.equal(plLeakMatch, null, 'Mega Image private label should not be matched at Sezamo');
  });

  await t.test('3. Offer validation: Excludes expired offers, invalid currency, and out-of-stock', () => {
    const expiredOffer = {
      id: 'off-exp',
      price: 10,
      currency: 'RON',
      retailer_name: 'Carrefour',
      stock_status: 'in_stock',
      valid_until: '2020-01-01T00:00:00Z',
      observed_at: '2020-01-01T00:00:00Z',
    };
    assert.equal(validator.validateOffer(expiredOffer), null, 'Expired offer must be rejected');

    const oosOffer = {
      id: 'off-oos',
      price: 10,
      currency: 'RON',
      retailer_name: 'Carrefour',
      stock_status: 'out_of_stock',
    };
    assert.equal(validator.validateOffer(oosOffer), null, 'Out of stock offer must be rejected');

    const euroOffer = {
      id: 'off-eur',
      price: 10,
      currency: 'EUR',
      retailer_name: 'Carrefour',
      stock_status: 'in_stock',
    };
    assert.equal(validator.validateOffer(euroOffer), null, 'Non-RON currency offer must be rejected');

    const validOffer = {
      id: 'off-valid',
      price: 12.5,
      promo_price: 10.5,
      currency: 'RON',
      retailer_name: 'Carrefour',
      stock_status: 'in_stock',
      valid_until: '2028-12-31T00:00:00Z',
      observed_at: new Date().toISOString(),
    };
    const validated = validator.validateOffer(validOffer);
    assert.ok(validated);
    assert.equal(validated.effectiveUnitPrice, 10.5);
    assert.equal(validated.isPromoApplied, true);
  });

  await t.test('4. Optimization engine: Objective function J = C_prod + lambda*(K-1) + C_travel + C_delivery', () => {
    const retailers = [
      { id: 'ret-kaufland', slug: 'kaufland', name: 'Kaufland', supports_physical: true, supports_delivery: false },
      { id: 'ret-lidl', slug: 'lidl', name: 'Lidl', supports_physical: true, supports_delivery: false },
      { id: 'ret-sezamo', slug: 'sezamo', name: 'Sezamo', supports_physical: false, supports_delivery: true },
    ];

    const items = [
      { id: 'it-1', productId: 'p-bread', name: 'Paine', quantity: 2 },
      { id: 'it-2', productId: 'p-butter', name: 'Unt', quantity: 1 },
      { id: 'it-3', productId: 'p-coffee', name: 'Cafea', quantity: 1 },
    ];

    const catalogProfiles = {
      'p-bread': { id: 'p-bread', canonical_name: 'Pâine Albă 500g', brand: 'Vel Pitar', familyIds: [], attributes: {} },
      'p-butter': { id: 'p-butter', canonical_name: 'Unt 82% 200g', brand: 'Albalact', familyIds: [], attributes: {} },
      'p-coffee': { id: 'p-coffee', canonical_name: 'Cafea Măcinată 500g', brand: 'Jacobs', familyIds: [], attributes: {} },
    };

    const allOffers = [
      // Kaufland: bread @ 4, unt @ 15, cafea @ 30 -> Single-store: 2*4 + 15 + 30 = 53 RON
      { id: 'o-k1', product_id: 'p-bread', retailer_name: 'Kaufland', price: 4, currency: 'RON', stock_status: 'in_stock', product_url: 'https://kaufland.ro/paine', observed_at: '2026-11-12T10:00:00Z' },
      { id: 'o-k2', product_id: 'p-butter', retailer_name: 'Kaufland', price: 15, currency: 'RON', stock_status: 'in_stock', product_url: 'https://kaufland.ro/unt', observed_at: '2026-11-12T11:00:00Z' },
      { id: 'o-k3', product_id: 'p-coffee', retailer_name: 'Kaufland', price: 30, currency: 'RON', stock_status: 'in_stock', product_url: 'https://kaufland.ro/cafea', observed_at: '2026-11-12T12:00:00Z' },

      // Lidl: bread @ 5, unt @ 10 (5 RON savings), cafea @ 35
      { id: 'o-l1', product_id: 'p-bread', retailer_name: 'Lidl', price: 5, currency: 'RON', stock_status: 'in_stock', product_url: 'https://lidl.ro/paine', observed_at: '2026-11-12T09:00:00Z' },
      { id: 'o-l2', product_id: 'p-butter', retailer_name: 'Lidl', price: 10, currency: 'RON', stock_status: 'in_stock', product_url: 'https://lidl.ro/unt', observed_at: '2026-11-12T14:00:00Z' },
      { id: 'o-l3', product_id: 'p-coffee', retailer_name: 'Lidl', price: 35, currency: 'RON', stock_status: 'in_stock', product_url: 'https://lidl.ro/cafea', observed_at: '2026-11-12T09:00:00Z' },
    ];

    // Case A: lambda = 8 RON.
    const resA = engine.optimizeSmartShopping({
      items,
      allOffers,
      retailers,
      catalogProfiles,
      config: { additionalStorePenalty: 8.0, maxStores: 2 },
    });

    assert.equal(resA.recommendedScenario.storeCount, 1);
    assert.equal(resA.recommendedScenario.storeAssignments[0].retailer.name, 'Kaufland');
    assert.equal(resA.recommendedScenario.totalToPay, 53);
    assert.equal(resA.recommendedScenario.freshnessTimestamp, '2026-11-12T12:00:00Z');

    // Verify canonicalName is the actual product name, NOT product_url!
    const breadAssignment = resA.recommendedScenario.productAssignments.find((a) => a.itemId === 'it-1');
    assert.equal(breadAssignment.canonicalName, 'Pâine Albă 500g');

    // Verify cheapestPossiblePrice & savingsVsSingleStore in Cheapest Basket
    const butterCheapest = resA.scenarios.cheapestBasket.productAssignments.find((a) => a.itemId === 'it-2');
    assert.equal(butterCheapest.lineTotal, 10);
    assert.equal(butterCheapest.cheapestPossiblePrice, 10);
    assert.equal(butterCheapest.savingsVsSingleStore, 5, 'Butter saves 5 RON vs Kaufland single store (15 - 10)');

    // Case B: lambda = 3 RON.
    const resB = engine.optimizeSmartShopping({
      items,
      allOffers,
      retailers,
      catalogProfiles,
      config: { additionalStorePenalty: 3.0, maxStores: 2 },
    });

    assert.equal(resB.recommendedScenario.storeCount, 2);
    assert.equal(resB.recommendedScenario.productCost, 48);
    assert.equal(resB.recommendedScenario.inconveniencePenalty, 3);
    assert.equal(resB.recommendedScenario.objectiveScore, 51);
  });

  await t.test('5. Online Basket & Manual Reassignment: Delivery fees, MOV & live recalculation', () => {
    const retailers = [
      { id: 'ret-kaufland', slug: 'kaufland', name: 'Kaufland', supports_physical: true, supports_delivery: false },
      { id: 'ret-sezamo', slug: 'sezamo', name: 'Sezamo', supports_physical: false, supports_delivery: true },
    ];

    const fulfillmentRules = {
      sezamo: {
        id: 'rule-sezamo',
        fulfillment_node_id: 'node-sezamo',
        currency: 'RON',
        delivery_fee: 12.9,
        packaging_fee: 2.0,
        minimum_order_value: 150,
        free_delivery_threshold: 250,
      },
    };

    const items = [
      { id: 'it-1', productId: 'p-bread', name: 'Paine', quantity: 2 },
      { id: 'it-2', productId: 'p-butter', name: 'Unt', quantity: 1 },
    ];

    const allOffers = [
      { id: 'o-k1', product_id: 'p-bread', retailer_name: 'Kaufland', price: 5, currency: 'RON', stock_status: 'in_stock' },
      { id: 'o-k2', product_id: 'p-butter', retailer_name: 'Kaufland', price: 15, currency: 'RON', stock_status: 'in_stock' },
      { id: 'o-s1', product_id: 'p-bread', retailer_name: 'Sezamo', price: 4.5, currency: 'RON', stock_status: 'in_stock', fulfillment_channel: 'delivery' },
      { id: 'o-s2', product_id: 'p-butter', retailer_name: 'Sezamo', price: 14, currency: 'RON', stock_status: 'in_stock', fulfillment_channel: 'delivery' },
    ];

    const res = engine.optimizeSmartShopping({
      items,
      allOffers,
      retailers,
      fulfillmentRules,
      config: { additionalStorePenalty: 8.0, maxStores: 2 },
    });

    // Online basket: products = 2*4.5 + 14 = 23 RON, delivery = 12.90 + 2.00 = 14.90 RON -> totalToPay = 37.90 RON, meetsMOV = false
    assert.ok(res.scenarios.onlineBasket);
    assert.equal(res.scenarios.onlineBasket.productCost, 23);
    assert.equal(Number(res.scenarios.onlineBasket.deliveryCost.toFixed(2)), 14.9);
    assert.equal(Number(res.scenarios.onlineBasket.totalToPay.toFixed(2)), 37.9);
    assert.equal(res.scenarios.onlineBasket.storeAssignments[0].meetsMinimumOrderValue, false);

    // Reassign both items in Online Basket to Kaufland (physical store -> 0 delivery fee)
    const reassigned = engine.recalculateBasketWithReassignments({
      basket: res.scenarios.onlineBasket,
      reassignments: { 'it-1': 'kaufland', 'it-2': 'kaufland' },
      retailers,
      fulfillmentRules,
      config: { additionalStorePenalty: 8.0 },
    });

    assert.equal(reassigned.storeCount, 1);
    assert.equal(reassigned.productCost, 25);
    assert.equal(reassigned.deliveryCost, 0);
    assert.equal(reassigned.totalToPay, 25);
  });

  await t.test('6. Determinism: Identical inputs produce identical outputs', () => {
    const retailers = [
      { id: 'ret-kaufland', slug: 'kaufland', name: 'Kaufland', supports_physical: true, supports_delivery: false },
      { id: 'ret-lidl', slug: 'lidl', name: 'Lidl', supports_physical: true, supports_delivery: false },
    ];
    const items = [{ id: 'it-1', productId: 'p-bread', name: 'Paine', quantity: 1 }];
    const allOffers = [
      { id: 'o-1', product_id: 'p-bread', retailer_name: 'Kaufland', price: 4.5, currency: 'RON', stock_status: 'in_stock' },
    ];

    const run1 = engine.optimizeSmartShopping({ items, allOffers, retailers });
    const run2 = engine.optimizeSmartShopping({ items, allOffers, retailers });

    assert.equal(run1.recommendedScenario.totalToPay, run2.recommendedScenario.totalToPay);
    assert.equal(run1.recommendedScenario.objectiveScore, run2.recommendedScenario.objectiveScore);
    assert.equal(run1.recommendedScenario.storeCount, run2.recommendedScenario.storeCount);
  });

  await t.test('7. Fresh Produce Romanian Stemming & Brand-Agnostic Cross-Store Grouping', async () => {
    const catalogSearch = await loadTsModule('src/services/beavy-catalog-search.ts', {
      '@/lib/supabase': { supabase: {} },
      '@/services/beavy-comparison': mockBeavyComparison,
    });

    // 7A. Verify all 11 irregular/regular Romanian singular/plural stem mappings
    const stemPairs = [
      ['mar', 'mere', 'mar'],
      ['măr', 'mere', 'mar'],
      ['banana', 'banane', 'banan'],
      ['banană', 'banane', 'banan'],
      ['lamaie', 'lamai', 'lamai'],
      ['lămâie', 'lămâi', 'lamai'],
      ['portocala', 'portocale', 'portocal'],
      ['portocală', 'portocale', 'portocal'],
      ['rosie', 'rosii', 'rosi'],
      ['roșie', 'roșii', 'rosi'],
      ['cartof', 'cartofi', 'cartof'],
      ['ceapa', 'cepe', 'ceap'],
      ['ceapă', 'cepe', 'ceap'],
      ['castravete', 'castraveti', 'castravet'],
      ['castravete', 'castraveți', 'castravet'],
      ['piersica', 'piersici', 'piersic'],
      ['piersică', 'piersici', 'piersic'],
      ['capsuna', 'capsuni', 'capsun'],
      ['capsuna', 'capsune', 'capsun'],
      ['căpșună', 'căpșuni', 'capsun'],
      ['para', 'pere', 'par'],
      ['pară', 'pere', 'par'],
      ['afina', 'afine', 'afin'],
      ['avocado', 'avocado', 'avocado'],
    ];

    for (const [singular, plural, expectedStem] of stemPairs) {
      assert.equal(
        mockBeavyComparison.normalizeRomanianWordStem(singular),
        expectedStem,
        `Singular "${singular}" should stem to "${expectedStem}"`
      );
      assert.equal(
        mockBeavyComparison.normalizeRomanianWordStem(plural),
        expectedStem,
        `Plural "${plural}" should stem to "${expectedStem}"`
      );
      assert.equal(
        mockBeavyComparison.matchesGenericTermCandidate(singular, plural).matches,
        true,
        `Query "${singular}" should match title "${plural}"`
      );
      assert.equal(
        mockBeavyComparison.matchesGenericTermCandidate(plural, singular).matches,
        true,
        `Query "${plural}" should match title "${singular}"`
      );
    }

    // 7B. Brand-agnostic generic key extraction for real multi-store produce titles
    const realBananaProducts = [
      {
        id: 'sez-ban-1',
        canonical_name: 'Ciorchine de banane',
        brand: null,
        package_size: 'cca 1,1 kg',
        category_name: 'Fructe și legume',
        min_price: 7.69,
        max_price: 7.69,
        store_count: 1,
        cheapest_retailer_slug: 'sezamo',
        cheapest_retailer_name: 'Sezamo',
        retailer_slugs: ['sezamo'],
      },
      {
        id: 'sez-ban-2',
        canonical_name: 'Banane Dole (bucata)',
        brand: 'Dole',
        package_size: 'cca 200 g',
        category_name: 'Fructe și legume',
        min_price: 1.92,
        max_price: 1.92,
        store_count: 1,
        cheapest_retailer_slug: 'sezamo',
        cheapest_retailer_name: 'Sezamo',
        retailer_slugs: ['sezamo'],
      },
      {
        id: 'fre-ban-1',
        canonical_name: 'Banane minim 1kg maxim 1.3kg',
        brand: null,
        package_size: '1 kg',
        category_name: 'Fructe și legume',
        min_price: 10.91,
        max_price: 10.91,
        store_count: 1,
        cheapest_retailer_slug: 'freshful',
        cheapest_retailer_name: 'Freshful',
        retailer_slugs: ['freshful'],
      },
      {
        id: 'mega-ban-1',
        canonical_name: "Nature's Promise Bio Banane bio",
        brand: "Nature's Promise Bio",
        package_size: '1000 g',
        category_name: 'Fructe și legume',
        min_price: 9.49,
        max_price: 9.49,
        store_count: 1,
        cheapest_retailer_slug: 'mega-image',
        cheapest_retailer_name: 'Mega Image',
        retailer_slugs: ['mega-image'],
      },
    ];

    const dedupedBananas = catalogSearch.deduplicateCatalogProducts(realBananaProducts);
    assert.equal(dedupedBananas.length, 1, 'All banana variants across stores must merge into 1 generic card');
    assert.equal(dedupedBananas[0].canonical_name, 'Banane');
    assert.equal(dedupedBananas[0].brand, null);
    assert.equal(dedupedBananas[0].store_count, 3);
    assert.deepEqual(
      new Set(dedupedBananas[0].retailer_slugs),
      new Set(['sezamo', 'freshful', 'mega-image'])
    );

    const realAppleProducts = [
      {
        id: 'auc-mar-1',
        canonical_name: 'Mere golden filiera Auchan, 4 bucati',
        brand: 'Filiera Auchan',
        package_size: '4 pcs',
        category_name: 'Fructe și legume',
        min_price: 5.49,
        max_price: 5.49,
        store_count: 1,
        retailer_slugs: ['auchan'],
      },
      {
        id: 'mega-mar-1',
        canonical_name: 'Gusturi romanesti Mere rosii',
        brand: 'Gusturi romanesti',
        package_size: '1000 g',
        category_name: 'Fructe și legume',
        min_price: 5.19,
        max_price: 5.19,
        store_count: 1,
        retailer_slugs: ['mega-image'],
      },
      {
        id: 'lidl-mar-1',
        canonical_name: 'Mere roșii',
        brand: null,
        package_size: 'per kg',
        category_name: 'Fructe și legume',
        min_price: 2.99,
        max_price: 2.99,
        store_count: 1,
        retailer_slugs: ['lidl'],
      },
      {
        id: 'kauf-mar-1',
        canonical_name: 'Mere roşii',
        brand: null,
        package_size: 'kg',
        category_name: 'Fructe și legume',
        min_price: 3.39,
        max_price: 3.39,
        store_count: 1,
        retailer_slugs: ['kaufland'],
      },
      {
        id: 'penny-mar-1',
        canonical_name: 'Mere Rosii 1 kg',
        brand: null,
        package_size: '1 kg',
        category_name: 'Fructe și legume',
        min_price: 4.99,
        max_price: 4.99,
        store_count: 1,
        retailer_slugs: ['penny'],
      },
      {
        id: 'fre-mar-1',
        canonical_name: 'Măr Golden Delicious 1 buc, minim 175g',
        brand: null,
        package_size: '1 buc',
        category_name: 'Fructe și legume',
        min_price: 1.79,
        max_price: 1.79,
        store_count: 1,
        retailer_slugs: ['freshful'],
      },
      {
        id: 'sez-mar-1',
        canonical_name: 'Mere Gala Premium Romania',
        brand: null,
        package_size: 'cca 200 g',
        category_name: 'Fructe și legume',
        min_price: 2.11,
        max_price: 2.11,
        store_count: 1,
        retailer_slugs: ['sezamo'],
      },
    ];

    const dedupedApples = catalogSearch.deduplicateCatalogProducts(realAppleProducts);
    assert.equal(dedupedApples.length, 1, 'All 7 stores apple items must merge into 1 generic card');
    assert.equal(dedupedApples[0].canonical_name, 'Mere');
    assert.equal(dedupedApples[0].brand, null);
    assert.equal(dedupedApples[0].store_count, 7);

    // 7C. Processed items must NEVER get a freshProduceGenericKey
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Suc de mere 1L'), null);
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Batoane de cereale cu banane'), null);
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Salată de vinete cu maioneză'), null);
  });

  await t.test('8. Canonical Fingerprint (`canonical_fingerprint`): Deterministic Cross-Store Product Consolidation', async () => {
    const catalogSearch = await loadTsModule('src/services/beavy-catalog-search.ts', {
      '@/lib/supabase': { supabase: {} },
      '@/services/beavy-comparison': mockBeavyComparison,
      './smart-shopping/types': types,
    });

    // 8A. Twin products from different stores sharing the same canonical_fingerprint merge perfectly
    const storeTwins = [
      {
        id: 'freshful-zuzu-1',
        canonical_name: 'Zuzu Barista Lapte Barista UHT pentru cafea 3.5% grăsime, 1l',
        brand: 'Zuzu Barista',
        package_size: '1 L',
        canonical_fingerprint: 'pkg:zuzu:lapte:3.5%:barista:uht:1000ml',
        min_price: 11.99,
        max_price: 11.99,
        store_count: 1,
        retailer_slugs: ['freshful'],
      },
      {
        id: 'sezamo-zuzu-1',
        canonical_name: 'ZUZU Barista Late Uht pentru cafea 3.5%',
        brand: 'ZUZU',
        package_size: '1 l',
        canonical_fingerprint: 'pkg:zuzu:lapte:3.5%:barista:uht:1000ml',
        min_price: 12.49,
        max_price: 12.49,
        store_count: 1,
        retailer_slugs: ['sezamo'],
      },
      {
        id: 'carrefour-zuzu-1',
        canonical_name: 'Lapte UHT 3.5% Zuzu Barista 1L',
        brand: 'Zuzu',
        package_size: '1l',
        canonical_fingerprint: 'pkg:zuzu:lapte:3.5%:barista:uht:1000ml',
        min_price: 11.49,
        max_price: 11.49,
        store_count: 1,
        retailer_slugs: ['carrefour'],
      },
      // Different size (450ml) has a different fingerprint
      {
        id: 'freshful-zuzu-450',
        canonical_name: 'Zuzu Barista Lapte pentru cafea Barista 3.5% grăsime, 450ml',
        brand: 'Zuzu Barista',
        package_size: '450 ml',
        canonical_fingerprint: 'pkg:zuzu:lapte:3.5%:barista:450ml',
        min_price: 7.49,
        max_price: 7.49,
        store_count: 1,
        retailer_slugs: ['freshful'],
      },
    ];

    const dedupedZuzu = catalogSearch.deduplicateCatalogProducts(storeTwins);
    assert.equal(dedupedZuzu.length, 2, 'Must produce exactly 2 distinct cards (1L and 450ml)');

    const zuzu1L = dedupedZuzu.find((p) => p.canonical_fingerprint === 'pkg:zuzu:lapte:3.5%:barista:uht:1000ml');
    assert.ok(zuzu1L, '1L card must exist');
    assert.equal(zuzu1L.store_count, 3, '1L card must combine all 3 retailers');
    assert.equal(zuzu1L.min_price, 11.49, 'Cheapest price (Carrefour 11.49) must be preserved');
    assert.equal(zuzu1L.max_price, 12.49, 'Highest price (Sezamo 12.49) must be preserved');
    assert.deepEqual(zuzu1L.retailer_slugs.sort(), ['carrefour', 'freshful', 'sezamo']);

    const zuzu450 = dedupedZuzu.find((p) => p.canonical_fingerprint === 'pkg:zuzu:lapte:3.5%:barista:450ml');
    assert.ok(zuzu450, '450ml card must exist separately');
    assert.equal(zuzu450.min_price, 7.49);

    // 8B. Matcher Tier 2: Matcher yields exact 1.0 match for items sharing canonical_fingerprint
    const match = mockBeavyComparison.computeProductMatchScore(
      {
        id: 'freshful-zuzu-1',
        canonical_name: 'Zuzu Barista Lapte Barista UHT pentru cafea 3.5% grăsime, 1l',
        brand: 'Zuzu Barista',
        package_size: '1 L',
        canonical_fingerprint: 'pkg:zuzu:lapte:3.5%:barista:uht:1000ml',
        quantity_value: 1,
        quantity_unit: 'l',
        attributes: {},
        familyIds: [],
      },
      {
        id: 'sezamo-zuzu-1',
        canonical_name: 'ZUZU Barista Late Uht pentru cafea 3.5%',
        brand: 'ZUZU',
        package_size: '1 l',
        canonical_fingerprint: 'pkg:zuzu:lapte:3.5%:barista:uht:1000ml',
        quantity_value: 1,
        quantity_unit: 'l',
        attributes: {},
        familyIds: [],
      }
    );
    assert.equal(match.isCrossCanonicalExact, true, 'Twin items with matching fingerprint must match exactly');
    assert.equal(match.score, 1.0, 'Score must be 1.0');
  });

  await t.test('9. Open Food Facts Live EAN Resolution & Auto-Learning Persistence', async () => {
    let boundProductId = null;
    let boundBarcode = null;

    const mockSupabase = {
      rpc: async (name, params) => {
        if (name === 'beavy_bind_product_barcode') {
          boundProductId = params.p_product_id;
          boundBarcode = params.p_barcode;
          return { data: true, error: null };
        }
        return { data: null, error: null };
      },
    };

    const catalogSearch = await loadTsModule('src/services/beavy-catalog-search.ts', {
      '@/lib/supabase': { supabase: mockSupabase },
      '@/services/beavy-comparison': mockBeavyComparison,
      './smart-shopping/types': types,
    });

    // Verify lookupAndBindEanFromOpenFoodFacts exists
    assert.equal(typeof catalogSearch.lookupAndBindEanFromOpenFoodFacts, 'function');

    // Produce without brand is ignored
    const produceRes = await catalogSearch.lookupAndBindEanFromOpenFoodFacts({
      id: 'mar-1',
      canonical_name: 'Mere rosii',
      brand: null,
      package_size: '1 kg',
    });
    assert.equal(produceRes, null, 'Unbranded fresh produce must not query OFF for EAN');
  });

  await t.test('10. Community OFF Barcode Resolution: Lay\'s 105g (EAN 5941000032217) & Flavor Symmetry', async () => {
    // 10A. Test computeProductMatchScore with allowAsymmetricDomainTags
    const syntheticTarget = {
      id: 'ean-5941000032217',
      canonical_name: "Lay's Chipsuri 105g",
      brand: "Lay's",
      package_size: '105g',
      quantity_value: 105,
      quantity_unit: 'g',
      attributes: {},
      familyIds: [],
    };

    const storeCandidate = {
      id: 'freshful-lays-paprika',
      canonical_name: 'Lays Chipsuri rumenite în cuptor cu paprika, 105g (Oven Baked)',
      brand: 'Lays',
      package_size: '105 g',
      quantity_value: 105,
      quantity_unit: 'g',
      attributes: {},
      familyIds: [],
    };

    const matchRes = mockBeavyComparison.computeProductMatchScore(syntheticTarget, storeCandidate, {
      skipCategoryCheck: true,
      allowAsymmetricDomainTags: true,
    });

    assert.equal(matchRes.compatible, true, 'Synthetic barcode target must match flavor variant when allowAsymmetricDomainTags is true');
    assert.ok(matchRes.score >= 0.80, `Match score must be >= 0.80, got ${matchRes.score}`);

    // 10B. Cross-store twin products with ean fingerprint match exactly 1.0
    const twinFreshful = {
      id: 'freshful-lays-paprika',
      canonical_name: 'Lays Chipsuri rumenite în cuptor cu paprika, 105g (Oven Baked)',
      brand: 'Lays',
      package_size: '105 g',
      canonical_fingerprint: 'ean:5941000032217',
      quantity_value: 105,
      quantity_unit: 'g',
      attributes: {},
      familyIds: [],
    };

    const twinSezamo = {
      id: 'sezamo-lays-paprika',
      canonical_name: "Lay's Baked Chips cu paprika",
      brand: "Lay's",
      package_size: '105 g',
      canonical_fingerprint: 'ean:5941000032217',
      quantity_value: 105,
      quantity_unit: 'g',
      attributes: {},
      familyIds: [],
    };

    const twinMatch = mockBeavyComparison.computeProductMatchScore(twinFreshful, twinSezamo);
    assert.equal(twinMatch.compatible, true);
    assert.equal(twinMatch.score, 1.0, 'Twins sharing ean fingerprint must have score 1.0');
    assert.equal(twinMatch.isCrossCanonicalExact, true);
  });

  await t.test('11. Fresh Produce Subtype Disambiguation & Per-Kg Packaging Normalization (Sac 2 kg vs Plasă 500g vs Vrac)', async () => {
    // 11A. Strict Subtype Isolation
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Ceapă roșie'), 'ceapa_rosie');
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Ceapa rosie 500g'), 'ceapa_rosie');
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Ceapă galbenă'), 'ceap');
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Ceapă'), 'ceap');
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Ceapă verde legătură'), 'ceapa_verde');

    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Cartofi roșii'), 'cartofi_rosii');
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Cartofi dulci'), 'cartofi_dulci');
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Cartofi albi'), 'cartof');

    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Varză roșie'), 'varza_rosie');
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Varză albă'), 'varz');

    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Ardei capia'), 'ardei_capia');
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Ardei iute'), 'ardei_iute');
    assert.equal(mockBeavyComparison.extractFreshProduceGenericKey('Ardei gras'), 'ardei');

    // 11B. Cross-Match Rejection between Subtypes
    const redOnion = {
      id: 'p-onion-red',
      canonical_name: 'Ceapă roșie',
      brand: null,
      package_size: '1 kg',
      quantity_value: 1,
      quantity_unit: 'kg',
      attributes: {},
      familyIds: [],
    };
    const yellowOnion = {
      id: 'p-onion-yellow',
      canonical_name: 'Ceapă galbenă',
      brand: null,
      package_size: '1 kg',
      quantity_value: 1,
      quantity_unit: 'kg',
      attributes: {},
      familyIds: [],
    };
    const greenOnion = {
      id: 'p-onion-green',
      canonical_name: 'Ceapă verde',
      brand: null,
      package_size: 'legătură',
      quantity_value: 1,
      quantity_unit: 'buc',
      attributes: {},
      familyIds: [],
    };

    const redVsYellow = mockBeavyComparison.computeProductMatchScore(redOnion, yellowOnion);
    assert.equal(redVsYellow.compatible, false, 'Red onion must never match yellow onion');

    const redVsGreen = mockBeavyComparison.computeProductMatchScore(redOnion, greenOnion);
    assert.equal(redVsGreen.compatible, false, 'Red onion must never match green onion');

    // 11C. Produce Pricing Normalization: Per-Kg calculation on variable packs
    const kaufland2kgSac = mockBeavyComparison.resolveProduceOfferPricing(
      {
        price: 7.99,
        package_size: 'sac 2 kg',
        sell_by_mode: 'kg',
        normalized_unit_price: null,
        normalized_unit_label: null,
        quantity_value: null,
        quantity_unit: null,
      },
      { canonical_name: 'Ceapă roșie sac 2kg' }
    );
    assert.equal(kaufland2kgSac.isProduce, true);
    assert.equal(kaufland2kgSac.sellMode, 'per_kg');
    assert.equal(kaufland2kgSac.pricePerKg, 4.00, '2kg sack at 7.99 lei must normalize to 4.00 lei/kg');
    assert.equal(kaufland2kgSac.packType, 'sac');
    assert.equal(kaufland2kgSac.packLabel, 'Sac 2 kg');
    assert.ok(kaufland2kgSac.packCheckoutSummary.includes('7.99 lei la casă'));

    const megaImage500gPlasa = mockBeavyComparison.resolveProduceOfferPricing(
      {
        price: 3.29,
        package_size: '500g',
        sell_by_mode: 'unit',
        normalized_unit_price: null,
        normalized_unit_label: null,
        quantity_value: 500,
        quantity_unit: 'g',
      },
      { canonical_name: 'Ceapă roșie plasă 500g' }
    );
    assert.equal(megaImage500gPlasa.isProduce, true);
    assert.equal(megaImage500gPlasa.sellMode, 'per_kg');
    assert.equal(megaImage500gPlasa.pricePerKg, 6.58, '500g net at 3.29 lei must normalize to 6.58 lei/kg');
    assert.equal(megaImage500gPlasa.packType, 'plasa');
    assert.equal(megaImage500gPlasa.packLabel, 'Plasă 500g');

    const lidl1kgVrac = mockBeavyComparison.resolveProduceOfferPricing(
      {
        price: 4.99,
        package_size: 'vrac',
        sell_by_mode: 'kg',
        normalized_unit_price: 4.99,
        normalized_unit_label: 'RON/kg',
        quantity_value: 1,
        quantity_unit: 'kg',
      },
      { canonical_name: 'Ceapă roșie vrac' }
    );
    assert.equal(lidl1kgVrac.isProduce, true);
    assert.equal(lidl1kgVrac.sellMode, 'per_kg');
    assert.equal(lidl1kgVrac.pricePerKg, 4.99);
    assert.equal(lidl1kgVrac.packType, 'vrac');
    assert.equal(lidl1kgVrac.packLabel, 'Vrac');

    const kaufProfile = {
      id: 'prod-kauf-onion',
      canonical_name: 'Ceapă roșie sac 2kg',
      brand: null,
      package_size: 'sac 2 kg',
      category: 'Fructe si Legume',
      subcategory: 'Legume proaspete',
      familyIds: [],
      attributes: {},
    };
    const lidlProfile = {
      id: 'prod-lidl-onion',
      canonical_name: 'Ceapă roșie vrac',
      brand: null,
      package_size: 'vrac',
      category: 'Fructe si Legume',
      subcategory: 'Legume proaspete',
      familyIds: [],
      attributes: {},
    };
    const megaProfile = {
      id: 'prod-mega-onion',
      canonical_name: 'Ceapă roșie plasă 500g',
      brand: null,
      package_size: 'plasă 500g',
      category: 'Fructe si Legume',
      subcategory: 'Legume proaspete',
      familyIds: [],
      attributes: {},
    };

    const profilesById = new Map([
      ['prod-kauf-onion', kaufProfile],
      ['prod-lidl-onion', lidlProfile],
      ['prod-mega-onion', megaProfile],
    ]);

    const genericProductIdsByItemId = new Map([
      ['b-item-1', ['prod-kauf-onion', 'prod-lidl-onion', 'prod-mega-onion']],
    ]);

    const basketResult = mockBeavyComparison.computeBasketComparison({
      items: [{ id: 'b-item-1', name: 'Ceapă roșie', quantity: 1, isCustom: true }],
      retailers: [
        { id: 'ret-kaufland', name: 'Kaufland', slug: 'kaufland' },
        { id: 'ret-lidl', name: 'Lidl', slug: 'lidl' },
        { id: 'ret-mega', name: 'Mega Image', slug: 'mega-image' },
      ],
      offers: [
        {
          id: 'off-kaufland-2kg',
          product_id: 'prod-kauf-onion',
          retailer_id: 'ret-kaufland',
          retailer_name: 'Kaufland',
          price: 7.99,
          package_size: 'sac 2 kg',
          sell_by_mode: 'kg',
          normalized_unit_price: null,
          normalized_unit_label: null,
          quantity_value: null,
          quantity_unit: null,
          currency: 'RON',
          stock_status: 'in_stock',
          fulfillment_channel: 'store',
          city: 'Bucuresti',
          observed_at: new Date().toISOString(),
        },
        {
          id: 'off-lidl-vrac',
          product_id: 'prod-lidl-onion',
          retailer_id: 'ret-lidl',
          retailer_name: 'Lidl',
          price: 4.99,
          package_size: 'vrac',
          sell_by_mode: 'kg',
          normalized_unit_price: 4.99,
          normalized_unit_label: 'RON/kg',
          quantity_value: 1,
          quantity_unit: 'kg',
          currency: 'RON',
          stock_status: 'in_stock',
          fulfillment_channel: 'store',
          city: 'Bucuresti',
          observed_at: new Date().toISOString(),
        },
        {
          id: 'off-mega-500g',
          product_id: 'prod-mega-onion',
          retailer_id: 'ret-mega',
          retailer_name: 'Mega Image',
          price: 3.29,
          package_size: 'plasă 500g',
          sell_by_mode: 'unit',
          normalized_unit_price: null,
          normalized_unit_label: null,
          quantity_value: 500,
          quantity_unit: 'g',
          currency: 'RON',
          stock_status: 'in_stock',
          fulfillment_channel: 'store',
          city: 'Bucuresti',
          observed_at: new Date().toISOString(),
        },
      ],
      profilesById,
      genericProductIdsByItemId,
      equivalentRelations: [],
      fulfillmentRules: [],
    });

    const kaufSummary = basketResult.retailerSummaries.find((s) => s.retailer.slug === 'kaufland');
    const lidlSummary = basketResult.retailerSummaries.find((s) => s.retailer.slug === 'lidl');
    const megaSummary = basketResult.retailerSummaries.find((s) => s.retailer.slug === 'mega-image');

    assert.ok(kaufSummary, 'Kaufland summary must exist');
    assert.ok(lidlSummary, 'Lidl summary must exist');
    assert.ok(megaSummary, 'Mega Image summary must exist');

    assert.equal(kaufSummary.matchedItems.length, 1);
    assert.equal(kaufSummary.matchedItems[0].lineTotal, 4.00, 'Kaufland line total for 1kg onion must be 4.00 RON');
    assert.equal(kaufSummary.matchedItems[0].produceMeta?.packPrice, 7.99);
    assert.equal(kaufSummary.matchedItems[0].produceMeta?.packLabel, 'Sac 2 kg');

    assert.equal(lidlSummary.matchedItems.length, 1);
    assert.equal(lidlSummary.matchedItems[0].lineTotal, 4.99, 'Lidl line total for 1kg onion must be 4.99 RON');

    assert.equal(megaSummary.matchedItems.length, 1);
    assert.equal(megaSummary.matchedItems[0].lineTotal, 6.58, 'Mega line total for 1kg onion must be 6.58 RON');
    assert.equal(megaSummary.matchedItems[0].produceMeta?.packPrice, 3.29);
    assert.equal(megaSummary.matchedItems[0].produceMeta?.packLabel, 'Plasă 500g');

    // Kaufland (4.00) < Lidl (4.99) < Mega (6.58)
    assert.ok(kaufSummary.confirmedSubtotal < lidlSummary.confirmedSubtotal);
    assert.ok(lidlSummary.confirmedSubtotal < megaSummary.confirmedSubtotal);
  });

  await t.test('12. Anti-Flavored-Snack Protection & Multi-Alternative Disjunction ("Unt" vs Popcorn, "Lămâie" vs Takis, "Somon sau păstrăv")', async () => {
    // 1. Unt 82% must NEVER match flavored popcorn, cookies, or pastries
    const untMatchesPopcorn = mockBeavyComparison.matchesGenericTermCandidate(
      'Unt 82%',
      'Chio Popcorn microunde cu gust de unt 80g'
    );
    assert.equal(untMatchesPopcorn.matches, false, 'Unt 82% must strictly reject flavored popcorn');

    const untMatchesBiscuiti = mockBeavyComparison.matchesGenericTermCandidate(
      'Unt 82%',
      'MEGA Biscuiti cu unt 2x200g'
    );
    assert.equal(untMatchesBiscuiti.matches, false, 'Unt 82% must strictly reject biscuits with butter');

    const untMatchesMadlene = mockBeavyComparison.matchesGenericTermCandidate(
      'Unt 82%',
      "World's Market Madlene cu unt 10x25g"
    );
    assert.equal(untMatchesMadlene.matches, false, 'Unt 82% must strictly reject madlene');

    const untMatchesAlbalact = mockBeavyComparison.matchesGenericTermCandidate(
      'Unt 82%',
      'Albalact Unt 82% grăsime 200g'
    );
    assert.equal(untMatchesAlbalact.matches, true, 'Unt 82% must match real butter');
    assert.ok(untMatchesAlbalact.score >= 0.7);

    // 2. Lămâie must NEVER match spicy Takis chips with lime flavor
    const lamaieMatchesTakis = mockBeavyComparison.matchesGenericTermCandidate(
      'Lămâie',
      'TAKIS Snacks Fuego cu aroma de ardei iute si lamaie verde 55g'
    );
    assert.equal(lamaieMatchesTakis.matches, false, 'Lămâie must strictly reject Takis snacks');

    const lamaieMatchesGum = mockBeavyComparison.matchesGenericTermCandidate(
      'Lămâie',
      'Orbit Guma de mestecat fara zahar cu arome de capsuni si lamaie 17.9g'
    );
    assert.equal(lamaieMatchesGum.matches, false, 'Lămâie must strictly reject chewing gum');

    const lamaieMatchesRealLemons = mockBeavyComparison.matchesGenericTermCandidate(
      'Lămâie',
      'MEGA Lamai 500g'
    );
    assert.equal(lamaieMatchesRealLemons.matches, true, 'Lămâie must match real fresh lemons');

    // 3. Broccoli proaspăt must NEVER match veggie mixes, burgers or croquettes
    const broccoliMatchesMix = mockBeavyComparison.matchesGenericTermCandidate(
      'Broccoli proaspăt',
      'Gustona Amestec de legume cu morcovi, broccoli si conopida 450g'
    );
    assert.equal(broccoliMatchesMix.matches, false, 'Broccoli proaspăt must reject frozen veggie mix');

    const broccoliMatchesBurger = mockBeavyComparison.matchesGenericTermCandidate(
      'Broccoli proaspăt',
      'Tasty Veggie Burger cu broccoli si tofu'
    );
    assert.equal(broccoliMatchesBurger.matches, false, 'Broccoli proaspăt must reject veggie burger');

    const broccoliMatchesReal = mockBeavyComparison.matchesGenericTermCandidate(
      'Broccoli proaspăt',
      'Broccoli, import'
    );
    assert.equal(broccoliMatchesReal.matches, true, 'Broccoli proaspăt must match pure broccoli');

    // 4. "sau" / "ori" disjunction: "File de somon sau păstrăv" matches either salmon or trout
    const disjunctionMatchSalmon = mockBeavyComparison.matchesGenericTermCandidate(
      'File de somon sau păstrăv',
      'Mowi File de somon norvegian proaspat 4x100g'
    );
    assert.equal(disjunctionMatchSalmon.matches, true, 'Disjunction query must match salmon');

    const disjunctionMatchTrout = mockBeavyComparison.matchesGenericTermCandidate(
      'File de somon sau păstrăv',
      'Doripesco File de pastrav afumat'
    );
    assert.equal(disjunctionMatchTrout.matches, true, 'Disjunction query must match trout');

    // 5. Scanner core: "Parmezan" must reject frozen pastry rollitos and match Parmigiano cheese
    const scannerCore = await loadTsModule('src/services/beavy-list-scanner-core.ts');
    const parmezanRes = scannerCore.matchScannedItemAgainstCatalog(
      { rawLine: 'Parmezan', name: 'Parmezan', quantity: 1, unit: 'buc', packageSizeHint: '100g', brandHint: null, confidence: 0.95 },
      [
        {
          id: 'p-rollitos',
          canonical_name: 'Alfa Mini Rollitos cu branza feta si parmezan',
          brand: 'Alfa',
          category: 'Patiserie și congelate',
          subcategory: 'Semipreparate',
          search_aliases: [],
          familyNames: [],
          familyAliases: [],
          store_count: 2,
        },
        {
          id: 'p-parmigiano',
          canonical_name: 'Hochland Brânză rasă Parmigiano Reggiano DOP 60g',
          brand: 'Hochland',
          category: 'Brânzeturi',
          subcategory: 'Brânză maturată',
          search_aliases: ['parmezan'],
          familyNames: ['Parmigiano Reggiano'],
          familyAliases: ['parmezan'],
          store_count: 3,
        },
      ]
    );
    assert.equal(parmezanRes.selectedProduct?.id, 'p-parmigiano', 'Parmezan must match real Parmigiano Reggiano cheese, NOT pastry rollitos');

    // 6. Scanner core: "Sare de mare" must reject potato chips and match sea salt
    const sareRes = scannerCore.matchScannedItemAgainstCatalog(
      { rawLine: 'Sare de mare', name: 'Sare de mare', quantity: 1, unit: 'cutie', packageSizeHint: '500g', brandHint: null, confidence: 0.95 },
      [
        {
          id: 'p-chips',
          canonical_name: 'Chio Chipsuri Intense cu sare de mare 120g',
          brand: 'Chio',
          category: 'Chipsuri și snacks',
          subcategory: 'Chipsuri',
          search_aliases: [],
          familyNames: [],
          familyAliases: [],
          store_count: 5,
        },
        {
          id: 'p-salt',
          canonical_name: 'Kotányi Râșniță sare de mare iodată 92g',
          brand: 'Kotányi',
          category: 'Sosuri și condimente',
          subcategory: 'Condimente și sosuri',
          search_aliases: ['sare'],
          familyNames: ['Sare'],
          familyAliases: ['sare de mare'],
          store_count: 3,
        },
      ]
    );
    assert.equal(sareRes.selectedProduct?.id, 'p-salt', 'Sare de mare must match real salt, NOT potato chips');

    // 7. Scanner core: "Bacon sau Pancetta" disjunction must match Bacon with high score
    const baconRes = scannerCore.matchScannedItemAgainstCatalog(
      { rawLine: 'Bacon sau Pancetta', name: 'Bacon sau Pancetta', quantity: 2, unit: 'pachet', packageSizeHint: '100g', brandHint: null, confidence: 0.95 },
      [
        {
          id: 'p-bacon',
          canonical_name: 'Cris-Tim Bacon 100g',
          brand: 'Cris-Tim',
          category: 'Șuncă și specialități',
          subcategory: 'Specialități porc',
          search_aliases: ['bacon'],
          familyNames: ['Bacon'],
          familyAliases: [],
          store_count: 4,
          package_size: '100g',
        },
      ]
    );
    assert.equal(baconRes.selectedProduct?.id, 'p-bacon', 'Bacon sau Pancetta must match Cris-Tim Bacon 100g');
    assert.ok(baconRes.candidates[0].score >= 0.85);

    // 8. Scanner core: "Lapte 1.5%" must prioritize multi-store national brand (Zuzu) over store-exclusive private label (MEGA Lapte)
    const milkRes = scannerCore.matchScannedItemAgainstCatalog(
      { rawLine: 'Lapte 1.5%', name: 'Lapte 1.5%', quantity: 1, unit: 'sticlă', packageSizeHint: '1L', brandHint: null, confidence: 0.95 },
      [
        {
          id: 'p-mega-milk',
          canonical_name: 'MEGA Lapte de consum 1.5% grasime 1L',
          brand: 'MEGA',
          category: 'Lactate și ouă',
          subcategory: 'Lapte de consum',
          search_aliases: ['lapte'],
          familyNames: ['Lapte de consum'],
          familyAliases: [],
          store_count: 1,
          min_price: 5.19,
          package_size: '1L',
        },
        {
          id: 'p-zuzu-milk',
          canonical_name: 'Zuzu Lapte de consum 1.5% grăsime 1L',
          brand: 'Zuzu',
          category: 'Lactate și ouă',
          subcategory: 'Lapte de consum',
          search_aliases: ['lapte'],
          familyNames: ['Lapte de consum'],
          familyAliases: [],
          store_count: 5,
          min_price: 8.49,
          package_size: '1L',
        },
      ]
    );
    assert.equal(
      milkRes.selectedProduct?.id,
      'p-zuzu-milk',
      'Generic milk query must match national multi-retailer brand Zuzu, NEVER MEGA store-exclusive private label'
    );
  });

  await t.test('13. Meat Cut & Animal Species Isolation: Chicken Breast NEVER matches Liver, Wings, or Turkey', () => {
    const pieptPuiAgricola = {
      id: 'prod-agricola-piept',
      canonical_name: 'Agricola Piept de pui dezosat 650g',
      brand: 'Agricola',
      familyIds: ['fam-carne-pasare'],
      attributes: {},
      package_size: '650g',
    };

    const ficatPuiMega = {
      id: 'prod-mega-ficat',
      canonical_name: 'MEGA Ficat de pui 600g',
      brand: 'Mega Image',
      familyIds: ['fam-carne-pasare'],
      attributes: {},
      package_size: '600g',
    };

    const aripiPuiFragedo = {
      id: 'prod-fragedo-aripi',
      canonical_name: 'Fragedo Aripi de pui 700g',
      brand: 'Fragedo',
      familyIds: ['fam-carne-pasare'],
      attributes: {},
      package_size: '700g',
    };

    const pieptCurcan = {
      id: 'prod-curcan-piept',
      canonical_name: 'Piept de curcan dezosat 500g',
      brand: 'Penes Curcanul',
      familyIds: ['fam-carne-pasare'],
      attributes: {},
      package_size: '500g',
    };

    const pieptPuiMega = {
      id: 'prod-mega-piept',
      canonical_name: 'MEGA Piept de pui dezosat 650g',
      brand: 'Mega Image',
      familyIds: ['fam-carne-pasare'],
      attributes: {},
      package_size: '650g',
    };

    // Assert: Piept de pui vs Ficat de pui must be false (different cuts)
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(pieptPuiAgricola, ficatPuiMega),
      false,
      'Chicken breast must NEVER match chicken liver'
    );

    // Assert: Piept de pui vs Aripi de pui must be false
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(pieptPuiAgricola, aripiPuiFragedo),
      false,
      'Chicken breast must NEVER match chicken wings'
    );

    // Assert: Piept de pui vs Piept de curcan must be false (different species)
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(pieptPuiAgricola, pieptCurcan),
      false,
      'Chicken breast must NEVER match turkey breast'
    );

    // Assert: Piept de pui Agricola vs Piept de pui Mega must be true (valid private label swap)
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(pieptPuiAgricola, pieptPuiMega),
      true,
      'Chicken breast Agricola should match store brand chicken breast'
    );

    // Assert: Pork cuts
    const ceafaPorc = {
      id: 'prod-ceafa',
      canonical_name: 'Ceafă de porc fără os 650g',
      brand: 'Comtim',
      familyIds: ['fam-carne-porc'],
      attributes: {},
    };
    const cotletPorc = {
      id: 'prod-cotlet',
      canonical_name: 'Cotlet de porc fără os 650g',
      brand: 'Comtim',
      familyIds: ['fam-carne-porc'],
      attributes: {},
    };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(ceafaPorc, cotletPorc),
      false,
      'Ceafă de porc must NEVER match Cotlet de porc'
    );

    // Charcuterie cuts: Bacon must NEVER match Șuncă de Praga as an equivalent / budget swap!
    const baconCrisTim = {
      id: 'prod-bacon-cristim',
      canonical_name: 'Cris-Tim Bacon 100g',
      brand: 'Cris-Tim',
      category: 'Mezeluri',
      subcategory: 'Specialități porc',
      familyIds: [],
      attributes: {},
      package_size: '100g',
    };
    const suncaPragaAuchan = {
      id: 'prod-sunca-auchan',
      canonical_name: 'Sunca Praga feliata Auchan, 100 g',
      brand: 'Auchan',
      category: 'Mezeluri',
      subcategory: 'Șuncă',
      familyIds: [],
      attributes: { is_private_label: true },
      package_size: '100g',
    };
    const baconAuchan = {
      id: 'prod-bacon-auchan',
      canonical_name: 'Auchan Bacon feliat 100g',
      brand: 'Auchan',
      category: 'Mezeluri',
      subcategory: 'Specialități porc',
      familyIds: [],
      attributes: { is_private_label: true },
      package_size: '100g',
    };

    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(baconCrisTim, suncaPragaAuchan, {
        allowSameCategoryWithoutFamily: true,
      }),
      false,
      'Bacon must NEVER match Șuncă de Praga as budget equivalent'
    );

    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(baconCrisTim, baconAuchan, {
        allowSameCategoryWithoutFamily: true,
      }),
      true,
      'Bacon Cris-Tim CAN match store brand Bacon Auchan'
    );
  });

  await t.test('14. Cross-Store Product Type Matching & Generic Filtering ("ovaz", "oua", "piept de pui")', () => {
    // 1. Generic term filtering for "ovaz"
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('ovaz', 'Sanovita Fulgi de ovăz 500g').matches,
      true,
      '"ovaz" must match Sanovita Fulgi de ovăz 500g'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('ovaz', 'Emma Fulgi de ovaz integral 500g').matches,
      true,
      '"ovaz" must match Emma Fulgi de ovaz integral 500g'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('ovaz', 'MEGA Biscuiti digestivi cu fulgi de ovaz 62g').matches,
      false,
      '"ovaz" must NOT match biscuits with oats'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('ovaz', 'Activia Iaurt cu ovaz si nuci 125g').matches,
      false,
      '"ovaz" must NOT match yogurt with oats'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('ovaz', 'Alpro Băutură din ovăz original 1l').matches,
      false,
      '"ovaz" must NOT match oat milk drink unless requested'
    );

    // 2. Generic term filtering for "oua"
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('oua', 'Agricola Ouă Chef de la găini crescute la sol, mărime M, 10 buc').matches,
      true,
      '"oua" must match hen eggs'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('oua', 'Băneasa Tăieței cu ouă 200g').matches,
      false,
      '"oua" must NOT match egg pasta'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('oua', 'Silvercrest Fierbător de ouă').matches,
      false,
      '"oua" must NOT match egg boiler appliance'
    );

    // 3. Cross-store equivalence for Fulgi de ovăz (without shared familyId, via category & domain tags)
    const emmaOvaz = {
      id: 'prod-emma-ovaz',
      canonical_name: 'Emma Fulgi de ovaz integral 500g',
      brand: 'Emma',
      category: 'Băcănie',
      subcategory: 'Produse pentru mic dejun',
      package_size: '500 g',
      quantity_value: 500,
      quantity_unit: 'g',
      familyIds: [],
      attributes: {},
    };
    const sanovitaOvaz = {
      id: 'prod-sanovita-ovaz',
      canonical_name: 'Sanovita Fulgi de ovăz 500g',
      brand: 'Sanovita',
      category: 'Băcănie',
      subcategory: 'Cereale și mic dejun',
      package_size: '500 g',
      quantity_value: 500,
      quantity_unit: 'g',
      familyIds: [],
      attributes: {},
    };
    const batonOvaz = {
      id: 'prod-baton-ovaz',
      canonical_name: 'Nature Promise Mini-batoane cu fulgi de ovaz 500g',
      brand: 'Nature Promise',
      category: 'Băcănie',
      subcategory: 'Produse pentru mic dejun',
      package_size: '500 g',
      quantity_value: 500,
      quantity_unit: 'g',
      familyIds: [],
      attributes: {},
    };

    const ovazMatch = mockBeavyComparison.computeProductMatchScore(emmaOvaz, sanovitaOvaz);
    assert.equal(ovazMatch.compatible, true, 'Emma Fulgi de ovaz 500g must be compatible with Sanovita Fulgi de ovăz 500g');
    assert.ok(ovazMatch.score >= 0.52, `Expected score >= 0.52, got ${ovazMatch.score}`);

    const batonMatch = mockBeavyComparison.computeProductMatchScore(emmaOvaz, batonOvaz);
    assert.equal(batonMatch.compatible, false, 'Fulgi de ovăz must NEVER match oat snack bars');
  });

  await t.test('15. Claude 3.5 Haiku: Recipe Ingredient Parser & Missing Item Architecture', async () => {
    const haikuMod = await loadTsModule('src/services/beavy-claude-haiku.ts', {
      '@react-native-async-storage/async-storage': {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      },
      '@/lib/supabase': {
        supabase: {
          functions: {
            invoke: async () => ({ data: { ok: true, provider: 'claude-3-5-haiku-20241022' }, error: null }),
          },
        },
      },
    });

    assert.equal(haikuMod.CLAUDE_HAIKU_MODEL, 'claude-3-5-haiku-20241022');
    const isAvail = await haikuMod.isHaikuAvailable();
    assert.equal(typeof isAvail, 'boolean');

    const recipeMod = await loadTsModule('src/services/beavy-recipe-parser.ts', {
      '@/services/beavy-claude-haiku': haikuMod,
      '@/services/beavy-list-scanner-core': {},
    });

    const carbonaraText = `
Paste Carbonara autentice
Ingrediente pentru 4 persoane:
400g spaghete
200g guanciale sau pancetta
4 oua proaspete
100g pecorino romano
un praf de sare
piper negru proaspat macinat
    `;

    const res = await recipeMod.parseRecipeSmart(carbonaraText, 4);
    assert.ok(res);
    assert.ok(res.ingredients.length >= 4);

    const names = res.ingredients.map(i => i.cleanName.toLowerCase());
    assert.ok(names.some(n => n.includes('paste') || n.includes('spaghete')));
    assert.ok(names.some(n => n.includes('guanciale') || n.includes('pancetta')));
    assert.ok(names.some(n => n.includes('ou')));
    assert.ok(names.some(n => n.includes('pecorino') || n.includes('parmezan')));

    // Pantry staples correctly identified
    const sare = res.ingredients.find(i => i.cleanName.toLowerCase().includes('sare'));
    if (sare) assert.equal(sare.isPantryStaple, true);
    const piper = res.ingredients.find(i => i.cleanName.toLowerCase().includes('piper'));
    if (piper) assert.equal(piper.isPantryStaple, true);
  });

  await t.test('16. Culinary & Grocery Domain Isolation: Dairy, Oils, Grains, Baking, & Salt Equivalence', () => {
    // 1. Dairy Isolation
    const untMasa = { id: 'p1', canonical_name: 'Albalact Unt 82% 200g', brand: 'Albalact', familyIds: [], attributes: {} };
    const untArahide = { id: 'p2', canonical_name: 'Unt de arahide cremos 350g', brand: 'SanoVita', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(untMasa, untArahide, { allowSameCategoryWithoutFamily: true }),
      false,
      'Unt 82% must NEVER match Unt de arahide'
    );

    const lapteVaca = { id: 'p3', canonical_name: 'Zuzu Lapte de consum 1.5% 1L', brand: 'Zuzu', familyIds: [], attributes: {} };
    const lapteSoia = { id: 'p4', canonical_name: 'Alpro Băutură de soia original 1L', brand: 'Alpro', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(lapteVaca, lapteSoia, { allowSameCategoryWithoutFamily: true }),
      false,
      'Cow milk must NEVER match plant milk / Alpro'
    );

    const smantanaAcra = { id: 'p5', canonical_name: 'Napolact Smântână 20% 300g', brand: 'Napolact', familyIds: [], attributes: {} };
    const smantanaGatit = { id: 'p6', canonical_name: 'Gran Cucina Crema vegetala pentru gatit 200ml', brand: 'Gran Cucina', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(smantanaAcra, smantanaGatit, { allowSameCategoryWithoutFamily: true }),
      false,
      'Smântână fermentată must NEVER match cooking cream'
    );

    const iaurtSpoon = { id: 'p7', canonical_name: 'Danone Activia Iaurt natur 140g', brand: 'Danone', familyIds: [], attributes: {} };
    const iaurtDrink = { id: 'p8', canonical_name: 'Danone Activia Iaurt de băut 320g', brand: 'Danone', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(iaurtSpoon, iaurtDrink, { allowSameCategoryWithoutFamily: true }),
      false,
      'Spoon yogurt must NEVER match drinking yogurt'
    );

    // 2. Oil & Vinegar Isolation
    const uleiExtra = { id: 'p9', canonical_name: 'Monini Ulei de măsline extra virgin 1L', brand: 'Monini', familyIds: [], attributes: {} };
    const uleiPomace = { id: 'p10', canonical_name: 'Costa d Oro Ulei din turte de măsline 1L', brand: 'Costa d Oro', familyIds: [], attributes: {} };
    const uleiFloare = { id: 'p11', canonical_name: 'Floriol Ulei de floarea-soarelui 1L', brand: 'Floriol', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(uleiExtra, uleiPomace, { allowSameCategoryWithoutFamily: true }),
      false,
      'Extra virgin olive oil must NEVER match pomace/turte olive oil'
    );
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(uleiExtra, uleiFloare, { allowSameCategoryWithoutFamily: true }),
      false,
      'Olive oil must NEVER match sunflower oil'
    );

    const otetBalsamic = { id: 'p12', canonical_name: 'Monari Federzoni Oțet balsamic de Modena 500ml', brand: 'Monari', familyIds: [], attributes: {} };
    const otetMere = { id: 'p13', canonical_name: 'Bunica Oțet de mere 500ml', brand: 'Bunica', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(otetBalsamic, otetMere, { allowSameCategoryWithoutFamily: true }),
      false,
      'Balsamic vinegar must NEVER match apple vinegar'
    );

    // 3. Rice & Grains Isolation
    const orezRotund = { id: 'p14', canonical_name: 'Riso Scotti Orez bob rotund 1kg', brand: 'Riso Scotti', familyIds: [], attributes: {} };
    const orezBasmati = { id: 'p15', canonical_name: 'Deroni Orez Basmati 1kg', brand: 'Deroni', familyIds: [], attributes: {} };
    const orezBobLung = { id: 'p16', canonical_name: 'Atifco Orez bob lung 1kg', brand: 'Atifco', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(orezRotund, orezBasmati, { allowSameCategoryWithoutFamily: true }),
      false,
      'Round grain rice must NEVER match Basmati rice'
    );
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(orezRotund, orezBobLung, { allowSameCategoryWithoutFamily: true }),
      false,
      'Round grain rice must NEVER match Long grain rice'
    );

    const fainaAlba = { id: 'p17', canonical_name: 'Băneasa Făină albă superioară 000 1kg', brand: 'Băneasa', familyIds: [], attributes: {} };
    const amidonPorumb = { id: 'p18', canonical_name: 'Gustin Amidon de porumb 200g', brand: 'Dr. Oetker', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(fainaAlba, amidonPorumb, { allowSameCategoryWithoutFamily: true }),
      false,
      'Wheat flour must NEVER match cornstarch'
    );

    // 4. Baking, Raising Agents & Salt Isolation
    const drojdie = { id: 'p19', canonical_name: 'Dr. Oetker Drojdie uscată 7g', brand: 'Dr. Oetker', familyIds: [], attributes: {} };
    const prafDeCopt = { id: 'p20', canonical_name: 'Dr. Oetker Praf de copt 10g', brand: 'Dr. Oetker', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(drojdie, prafDeCopt, { allowSameCategoryWithoutFamily: true }),
      false,
      'Yeast must NEVER match Baking powder'
    );

    const sareMasa = { id: 'p21', canonical_name: 'Salrom Sare fină iodată 1kg', brand: 'Salrom', familyIds: [], attributes: {} };
    const sareLamaie = { id: 'p22', canonical_name: 'Dr. Oetker Sare de lămâie 10g', brand: 'Dr. Oetker', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(sareMasa, sareLamaie, { allowSameCategoryWithoutFamily: true }),
      false,
      'Table salt must NEVER match citric acid / sare de lămâie'
    );

    const zaharVanilat = { id: 'p23', canonical_name: 'Dr. Oetker Zahăr vanilat 8g', brand: 'Dr. Oetker', familyIds: [], attributes: {} };
    const zaharPudra = { id: 'p24', canonical_name: 'Dr. Oetker Zahăr pudră 250g', brand: 'Dr. Oetker', familyIds: [], attributes: {} };
    const zaharCristal = { id: 'p25', canonical_name: 'Mărgăritar Zahăr cristal 1kg', brand: 'Mărgăritar', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(zaharVanilat, zaharCristal, { allowSameCategoryWithoutFamily: true }),
      false,
      'Vanilla sugar must NEVER match crystal sugar'
    );
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(zaharPudra, zaharCristal, { allowSameCategoryWithoutFamily: true }),
      false,
      'Powdered sugar must NEVER match crystal sugar'
    );

    // 5. Pasta Isolation
    const spaghete = { id: 'p26', canonical_name: 'Barilla Spaghetti n.5 500g', brand: 'Barilla', familyIds: [], attributes: {} };
    const lasagna = { id: 'p27', canonical_name: 'Barilla Foi de lasagna 500g', brand: 'Barilla', familyIds: [], attributes: {} };
    const taitei = { id: 'p28', canonical_name: 'Băneasa Tăieței cu ou pentru supă 200g', brand: 'Băneasa', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(spaghete, lasagna, { allowSameCategoryWithoutFamily: true }),
      false,
      'Spaghetti must NEVER match Lasagna sheets'
    );
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(spaghete, taitei, { allowSameCategoryWithoutFamily: true }),
      false,
      'Spaghetti must NEVER match soup noodles'
    );

    // 6. Generic Term Candidate protections
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('parmezan', 'Alfa Mini Rollitos cu branza feta si parmezan').matches,
      false,
      '"parmezan" must reject frozen pastry rollitos'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('sare', 'Chio Chipsuri Intense cu sare de mare 120g').matches,
      false,
      '"sare" must reject sea salt chips'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('sare', 'Nutline Arahide coapte cu sare 150g').matches,
      false,
      '"sare" must reject salted peanuts'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('sare', 'Dr. Oetker Sare de lamaie 20g').matches,
      false,
      '"sare" must reject citric acid (sare de lamaie)'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('paste', 'Colgate Pasta de dinti 100ml').matches,
      false,
      '"paste" must reject toothpaste'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('paste', 'Olympus Pasta de tomate 24% 400g').matches,
      false,
      '"paste" must reject tomato paste'
    );
    assert.equal(
      mockBeavyComparison.matchesGenericTermCandidate('drojdie', 'Dr. Oetker Praf de copt 10g').matches,
      false,
      '"drojdie" must reject baking powder'
    );
  });

  await t.test('17. Extended Grocery Domain: Alcohol, Pickles, Fresh vs Frozen, Meat Cuts & Tier 4 Protection', () => {
    // 1. Beer & Wine Isolation
    const bereBlonda = { id: 'b1', canonical_name: 'Ursus Premium Bere blondă 500ml', brand: 'Ursus', familyIds: [], attributes: {} };
    const bereFaraAlcool = { id: 'b2', canonical_name: 'Ursus Bere fără alcool 500ml', brand: 'Ursus', familyIds: [], attributes: {} };
    const radler = { id: 'b3', canonical_name: 'Ciuc Radler Lămâie 500ml', brand: 'Ciuc', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(bereBlonda, bereFaraAlcool, { allowSameCategoryWithoutFamily: true }),
      false,
      'Standard beer must NEVER match non-alcoholic beer'
    );
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(bereBlonda, radler, { allowSameCategoryWithoutFamily: true }),
      false,
      'Standard beer must NEVER match Radler / flavored beer'
    );

    const vinAlb = { id: 'v1', canonical_name: 'Purcari Nocturne Vin alb sec Sauvignon Blanc 750ml', brand: 'Purcari', familyIds: [], attributes: {} };
    const vinRosu = { id: 'v2', canonical_name: 'Purcari Vin roșu Rară Neagră 750ml', brand: 'Purcari', familyIds: [], attributes: {} };
    const prosecco = { id: 'v3', canonical_name: 'Mionetto Prosecco DOC Treviso Brut 750ml', brand: 'Mionetto', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(vinAlb, vinRosu, { allowSameCategoryWithoutFamily: true }),
      false,
      'White wine must NEVER match Red wine'
    );
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(vinAlb, prosecco, { allowSameCategoryWithoutFamily: true }),
      false,
      'Still wine must NEVER match Prosecco / sparkling wine'
    );

    // 2. Pickles & Preserved Vegetables
    const varzaMurata = { id: 'm1', canonical_name: 'Foi de varză murată pentru sarmale 1.5kg', brand: 'Tradițional', familyIds: [], attributes: {} };
    const castravetiMurati = { id: 'm2', canonical_name: 'Castraveți murați în oțet cornișon 680g', brand: 'Olympia', familyIds: [], attributes: {} };
    const gogosariOtet = { id: 'm3', canonical_name: 'Gogoșari feliați în oțet 680g', brand: 'Olympia', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(varzaMurata, castravetiMurati, { allowSameCategoryWithoutFamily: true }),
      false,
      'Varză murată must NEVER match Castraveți murați'
    );
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(castravetiMurati, gogosariOtet, { allowSameCategoryWithoutFamily: true }),
      false,
      'Castraveți murați must NEVER match Gogoșari în oțet'
    );

    // 3. Meat Cuts: Boneless vs Bone-in
    const pulpeDezosate = { id: 'c1', canonical_name: 'Fragedo Pulpe de pui dezosate fără piele 650g', brand: 'Fragedo', familyIds: [], attributes: {} };
    const pulpeCuOs = { id: 'c2', canonical_name: 'Fragedo Pulpe de pui cu os și piele 700g', brand: 'Fragedo', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(pulpeDezosate, pulpeCuOs, { allowSameCategoryWithoutFamily: true }),
      false,
      'Boneless chicken thighs must NEVER match chicken thighs with bone'
    );

    // 4. Fresh vs Frozen Isolation
    const somonProaspat = { id: 's1', canonical_name: 'Mowi File de somon proaspăt 400g', brand: 'Mowi', familyIds: [], attributes: {} };
    const somonCongelat = { id: 's2', canonical_name: 'Frosta File de somon congelat 400g', brand: 'Frosta', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(somonProaspat, somonCongelat, { allowSameCategoryWithoutFamily: true }),
      false,
      'Fresh salmon file must NEVER match frozen salmon'
    );

    // 5. Honey & Sweet Spreads Isolation
    const miereSalcam = { id: 'h1', canonical_name: 'Apicola Miere de salcâm 400g', brand: 'Apicola', familyIds: [], attributes: {} };
    const mierePoliflora = { id: 'h2', canonical_name: 'Apicola Miere polifloră 400g', brand: 'Apicola', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(miereSalcam, mierePoliflora, { allowSameCategoryWithoutFamily: true }),
      false,
      'Acacia honey must NEVER match polyfloral honey'
    );

    const nutella = { id: 'n1', canonical_name: 'Nutella Cremă de alune cu cacao 400g', brand: 'Ferrero', familyIds: [], attributes: {} };
    const untArahide = { id: 'n2', canonical_name: 'Unt de arahide cremos 350g', brand: 'SanoVita', familyIds: [], attributes: {} };
    const magiun = { id: 'n3', canonical_name: 'Magiun de prune Topoloveni 350g', brand: 'Sonimpex', familyIds: [], attributes: {} };
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(nutella, untArahide, { allowSameCategoryWithoutFamily: true }),
      false,
      'Nutella must NEVER match Peanut butter'
    );
    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(nutella, magiun, { allowSameCategoryWithoutFamily: true }),
      false,
      'Nutella must NEVER match Magiun'
    );

    // 6. Tier 4 Matcher Isolation Check
    const baconItem = {
      id: 'i-bacon',
      name: 'Cris-Tim Bacon 100g',
      quantity: 1,
      category: 'Mezeluri',
      subcategory: 'Specialități porc',
    };
    const baconCanonical = {
      id: 'prod-bacon',
      canonical_name: 'Cris-Tim Bacon 100g',
      category: 'Mezeluri',
      subcategory: 'Specialități porc',
      familyIds: [],
      attributes: {},
      package_size: '100g',
      quantity_value: 100,
      quantity_unit: 'g',
    };
    const suncaOffer = {
      id: 'off-sunca',
      product_id: 'prod-sunca',
      price: 5.99,
      retailer_id: 'r-auchan',
      currency: 'RON',
      availability: 'in_stock',
    };
    const suncaCanonical = {
      id: 'prod-sunca',
      canonical_name: 'Sunca Praga feliata Auchan 100g',
      category: 'Mezeluri',
      subcategory: 'Specialități porc',
      familyIds: [],
      attributes: {},
      package_size: '100g',
      quantity_value: 100,
      quantity_unit: 'g',
    };

    const tier4Match = matcher.evaluateProductOfferMatch({
      item: baconItem,
      offer: suncaOffer,
      itemCanonical: baconCanonical,
      offerCanonical: suncaCanonical,
      allowSubstitutions: true,
    });
    assert.equal(
      tier4Match,
      null,
      'Tier 4 substitution must REJECT incompatible charcuterie subtypes (Bacon vs Șuncă de Praga)'
    );
  });

  await t.test('18. Water Symmetry (Plată vs Carbogazoasă), Standardized Unit Pricing (RON/kg & RON/L) & Scraper Cleaning', () => {
    // 1. Water Symmetry: Dorna Apă minerală carbogazoasă MUST NEVER match Apă plată
    const dornaCarbo = {
      id: 'w-dorna-carb',
      canonical_name: 'Dorna Apă minerală carbogazoasă, 500ml',
      category: 'Băuturi',
      subcategory: 'Apă',
      familyIds: ['fam-water'],
      attributes: {},
      package_size: '500ml',
      quantity_value: 500,
      quantity_unit: 'ml',
    };
    const aquaPlataScraper = {
      id: 'w-aqua-pla',
      canonical_name: 'AQUA CARPATICA APA MIN.NAT.PLA0.75LSTSGR',
      category: 'Băuturi',
      subcategory: 'Apă',
      familyIds: ['fam-water'],
      attributes: {},
      package_size: '7,05 lei/buc',
      quantity_value: 0.75,
      quantity_unit: 'l',
    };
    const aquaCarbo = {
      id: 'w-aqua-carb',
      canonical_name: 'Aqua Carpatica apă minerală naturală carbogazoasă 500ml',
      category: 'Băuturi',
      subcategory: 'Apă',
      familyIds: ['fam-water'],
      attributes: {},
      package_size: '500ml',
      quantity_value: 500,
      quantity_unit: 'ml',
    };

    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(dornaCarbo, aquaPlataScraper, {
        allowSameCategoryWithoutFamily: true,
        allowDifferentSize: true,
      }),
      false,
      'Sparkling water must NEVER match Still water even if relaxed size is enabled'
    );

    assert.equal(
      mockBeavyComparison.isCompatibleEquivalentProduct(dornaCarbo, aquaCarbo, {
        allowSameCategoryWithoutFamily: true,
      }),
      true,
      'Sparkling water MUST match another sparkling water brand of identical size'
    );

    // 2. Standardized Unit Pricing: RON/kg and RON/L derivation
    // Unt 200g at 10.39 RON -> 51.95 RON/kg
    const untUnitPrice = mockBeavyComparison.deriveNormalizedUnitPrice(
      10.39,
      '200 g',
      null,
      null,
      'Albalact Unt 82% grăsime 200g'
    );
    assert.equal(untUnitPrice, '51.95 RON/kg', 'Butter 200g must be normalized to ~51.95 RON/kg');

    // Unt where package_size is missing but title has 200g
    const untMissingSizePrice = mockBeavyComparison.deriveNormalizedUnitPrice(
      10.39,
      null,
      null,
      null,
      'Albalact Unt 82% grăsime 200g'
    );
    assert.equal(untMissingSizePrice, '51.95 RON/kg', 'Must extract weight from product title if packageSize is missing');

    // Lapte 1L at 6.49 RON -> 6.49 RON/L
    const lapteUnitPrice = mockBeavyComparison.deriveNormalizedUnitPrice(
      6.49,
      '1 L',
      null,
      null,
      'Zuzu Lapte 1.5% grăsime 1l'
    );
    assert.equal(lapteUnitPrice, '6.49 RON/L', 'Milk 1L must be normalized to 6.49 RON/L');

    // Ulei 500ml at 39.59 RON -> 79.18 RON/L
    const uleiUnitPrice = mockBeavyComparison.deriveNormalizedUnitPrice(
      39.59,
      '500 ml',
      null,
      null,
      'Monini Ulei de măsline extra virgin Classico 500ml'
    );
    assert.equal(uleiUnitPrice, '79.18 RON/L', 'Olive oil 500ml must be normalized to 79.18 RON/L');

    // 3. Scraper artifacts cleaning
    assert.equal(
      mockBeavyComparison.cleanDisplayPackageSize('7,05 lei/buc', 'AQUA CARPATICA APA MIN.NAT.PLA0.75LSTSGR'),
      '0.75 L',
      'Should reject 7,05 lei/buc and extract 0.75 L from title'
    );

    const cleanTitle = mockBeavyComparison.cleanScraperProductName('AQUA CARPATICA APA MIN.NAT.PLA0.75LSTSGR');
    assert.ok(
      cleanTitle.includes('Minerală Naturală') && !cleanTitle.includes('STSGR'),
      `Title must be expanded and stripped of STSGR: got "${cleanTitle}"`
    );
  });

  await t.test('19. Chat RAG Guard & Basket Intent Isolation ("Vezi cel mai ieftin coș" NEVER matches "Ceai prostată și vezică")', async () => {
    const haikuMod = await loadTsModule('src/services/beavy-claude-haiku.ts', {
      '@react-native-async-storage/async-storage': {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      },
      '@/lib/supabase': {
        supabase: {
          functions: {
            invoke: async () => ({ data: { ok: true, provider: 'claude-3-5-haiku-20241022' }, error: null }),
          },
          from: () => ({
            select: () => ({
              eq: () => ({ limit: async () => ({ data: [], error: null }) }),
              ilike: () => ({ limit: async () => ({ data: [], error: null }) }),
              or: () => ({ limit: async () => ({ data: [], error: null }) }),
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        },
      },
    });

    // 1. Basket inquiry detection
    assert.equal(haikuMod.isBasketComparisonInquiry('Vezi cel mai ieftin coș'), true);
    assert.equal(haikuMod.isBasketComparisonInquiry('care este cel mai ieftin coș?'), true);
    assert.equal(haikuMod.isBasketComparisonInquiry('cât costă coșul meu'), true);
    assert.equal(haikuMod.isBasketComparisonInquiry('unde e cel mai ieftin pui?'), false);

    // 2. Price or store inquiry: should be false for basket inquiries!
    assert.equal(haikuMod.isPriceOrStoreInquiry('Vezi cel mai ieftin coș'), false);
    assert.equal(haikuMod.isPriceOrStoreInquiry('Unde e cel mai ieftin pui?'), true);
    assert.equal(haikuMod.isPriceOrStoreInquiry('Care e cel mai ieftin unt 82%?'), true);

    // 3. Target term extraction: noise tokens and basket inquiries must produce empty string
    assert.equal(haikuMod.extractTargetTermFromInquiry('Vezi cel mai ieftin coș'), '');
    assert.equal(haikuMod.extractTargetTermFromInquiry('Arată coșul'), '');
    assert.equal(haikuMod.extractTargetTermFromInquiry('Unde e cel mai ieftin pui?'), 'pui');
    assert.equal(haikuMod.extractTargetTermFromInquiry('Care e cel mai ieftin unt 82%?'), 'unt 82%');
    assert.equal(haikuMod.extractTargetTermFromInquiry('La ce magazin găsesc cafea Jacobs?'), 'cafea jacobs');

    // 4. Noise tokens protection: 'vezi' and 'cos' must be in noise tokens
    assert.ok(haikuMod.GENERAL_NOISE_TOKENS.has('vezi'));
    assert.ok(haikuMod.GENERAL_NOISE_TOKENS.has('cos'));
    assert.ok(haikuMod.GENERAL_NOISE_TOKENS.has('coș'));

    // 5. Basket comparison directly in Haiku service returns no items
    const basketRes = await haikuMod.composeShoppingListWithHaiku({
      prompt: 'Vezi cel mai ieftin coș',
      existingItems: [{ name: 'Lapte', quantity: 1 }],
    });
    assert.ok(basketRes);
    assert.equal(basketRes.action, 'info');
    assert.equal(basketRes.items.length, 0, 'Basket comparison must NOT generate proposed items');
    assert.ok(basketRes.reply.includes('tab-ul Coș') || basketRes.reply.includes('Coș'));
  });

  await t.test('20. Fresh Ingredient Protection in Scanner Core (Lemons, Potatoes, Salmon, Garlic NEVER match snacks)', async () => {
    const scannerCore = await loadTsModule('src/services/beavy-list-scanner-core.ts');

    const sampleCatalog = [
      {
        id: 'snack-lemon-1',
        canonical_name: 'Alfers Napolitane cu cremă de lămâie 170g',
        category: 'Dulciuri și snacks',
        subcategory: 'Napolitane',
        brand: 'Alfers',
      },
      {
        id: 'fresh-lemon-1',
        canonical_name: 'Lămâi plasă 500g',
        category: 'Fructe și legume',
        subcategory: 'Fructe proaspete',
        brand: null,
      },
      {
        id: 'snack-potato-1',
        canonical_name: 'Rondele din orez brun cu cartofi și rozmarin',
        category: 'Dulciuri și snacks',
        subcategory: 'Rondele',
        brand: 'Rondele',
      },
      {
        id: 'fresh-potato-1',
        canonical_name: 'Cartofi albi vrac / kg',
        category: 'Fructe și legume',
        subcategory: 'Cartofi și rădăcinoase',
        brand: null,
      },
    ];

    const matchLamai = scannerCore.matchScannedItemAgainstCatalog(
      { rawLine: 'lamai', name: 'lamai', brandHint: null, quantity: 1, unit: 'buc' },
      sampleCatalog,
      ['Alfers'],
      0
    );
    assert.equal(matchLamai.selectedProduct?.id, 'fresh-lemon-1', 'Must match fresh lemons over lemon wafers');

    const matchCartofi = scannerCore.matchScannedItemAgainstCatalog(
      { rawLine: 'cartofi', name: 'cartofi', brandHint: null, quantity: 1, unit: 'kg' },
      sampleCatalog,
      [],
      1
    );
    assert.equal(matchCartofi.selectedProduct?.id, 'fresh-potato-1', 'Must match fresh potatoes over potato rice cakes');
  });

  await t.test('21. Zero Manual Products, Scraper SKU Volume Extraction & Unit Pricing Hygiene', async () => {
    // 1. Scraper SKU Volume & Package Size Extraction (e.g. Kaufland internal string PLA0.75LSTSGR)
    const cleanedSize = mockBeavyComparison.cleanDisplayPackageSize(
      '7,05 lei/buc',
      'AQUA CARPATICA APA MIN.NAT.PLA0.75LSTSGR'
    );
    assert.equal(cleanedSize, '0.75 L', 'Must extract 0.75 L from internal string PLA0.75LSTSGR instead of junk 7,05 lei/buc');

    // 2. Normalized Unit Price computation from extracted volume
    const normPrice = mockBeavyComparison.deriveNormalizedUnitPrice(
      7.05,
      cleanedSize,
      null,
      null,
      'AQUA CARPATICA APA MIN.NAT.PLA0.75LSTSGR'
    );
    assert.equal(normPrice, '9.40 RON/L', '7.05 RON for 0.75 L must normalize to 9.40 RON/L');

    // 3. Junk scraper prices are thoroughly rejected
    assert.equal(mockBeavyComparison.cleanDisplayPackageSize('7,05 lei/buc'), null);
    assert.equal(mockBeavyComparison.cleanDisplayPackageSize('10.39 RON/buc'), null);
    assert.equal(mockBeavyComparison.cleanDisplayPackageSize('1 buc'), null);
    assert.equal(mockBeavyComparison.cleanDisplayPackageSize('buc'), null);

    // 4. Verification that comparison auto-resolves items without manual_item fallout
    const autoResolvedStatus = mockBeavyComparison.computeBasketComparison({
      items: [{ id: 'test-item-1', name: 'Zuzu Lapte 1.5%', quantity: 1, isCustom: false, productId: null }],
      retailers: [{ id: 'ret-1', name: 'Mega Image', slug: 'mega-image', supports_physical: true, supports_delivery: true }],
      offers: [{ id: 'off-1', product_id: 'prod-zuzu-1', retailer_id: 'ret-1', retailer_name: 'Mega Image', price: 6.69, observed_at: new Date().toISOString(), stock_status: 'in_stock' }],
      profilesById: new Map([['prod-zuzu-1', { id: 'prod-zuzu-1', canonical_name: 'Zuzu Lapte 1.5% grăsime 1l', brand: 'Zuzu' }]]),
    });
    assert.ok(autoResolvedStatus.itemStatuses.length > 0);
    assert.notEqual(autoResolvedStatus.itemStatuses[0].status, 'manual_item', 'Should never fall back to manual_item when matching profiles exist');
  });
});
