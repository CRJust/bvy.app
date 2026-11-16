#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import ts from 'typescript';

import {
  classifyBarcode,
  computeNormalizedUnitPrice,
  parseQuantity,
  scoreCanonicalCandidate,
} from './lib/catalog-normalization.mjs';
import {
  buildIngestionSql,
  normalizeRetailerRecord,
  parseCsv,
  processRetailerFeed,
} from './retailer-feed-pipeline.mjs';

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
    if (id === "@/services/beavy-intelligence") {
      const intelPath = path.join(process.cwd(), "src/services/beavy-intelligence.ts");
      const intelSrc = require("node:fs").readFileSync(intelPath, "utf8");
      const intelOut = ts.transpileModule(intelSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      const m = { exports: {} };
      vm.runInThisContext("(function (exports, require, module, __filename, __dirname) {\n" + intelOut + "\n})")(m.exports, sandboxRequire, m, intelPath, path.dirname(intelPath));
      return m.exports;
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

async function loadComparisonModule(mockSupabase = {}) {
  return loadTsModule('src/services/beavy-comparison.ts', {
    '@/lib/supabase': { supabase: mockSupabase },
  });
}

test('Catalog normalization: SI quantities, unit price & weigh-scale barcode isolation', () => {
  const multi = parseQuantity('4 x 81 g');
  assert.deepEqual(multi, { kind: 'mass', baseValue: 324, baseUnit: 'g', packCount: 4 });

  const unit = computeNormalizedUnitPrice(12.99, parseQuantity('200 g'));
  assert.deepEqual(unit, { normalizedUnitPrice: 64.95, normalizedUnitLabel: 'RON/kg' });

  const weigh = classifyBarcode('2812345005006');
  assert.equal(weigh.barcodeType, 'weigh_scale');
  assert.equal(weigh.isGlobalGtin, false);

  const gtin = classifyBarcode('5941355011967');
  assert.equal(gtin.barcodeType, 'gtin13');
  assert.equal(gtin.isGlobalGtin, true);

  const shrink = scoreCanonicalCandidate(
    {
      id: 'unt-200',
      canonical_name: 'Albalact Unt 82% 200 g',
      brand: 'Albalact',
      package_size: '200 g',
      quantity_value: 200,
      quantity_unit: 'g',
      attributes: { fat_percentage: 82 },
    },
    {
      code: '5941355099999',
      product_name: 'Albalact Unt 82% 180 g',
      brands: 'Albalact',
      quantity: '180 g',
      requireImage: false,
    }
  );
  assert.equal(shrink.quantityExact, false);
  assert.ok(shrink.confidence < 0.7);
});

test('Retailer feed pipeline: CSV + promo/loyalty + weigh_scale guard + SQL snapshots', () => {
  const csv = [
    'sku,product_name,brand,barcode,regular_price,promo_price,loyalty_price,package_size,category_path,availability',
    'FR-001,"Albalact Unt 82% grăsime",Albalact,5941355011967,15.99,12.49,11.99,200 g,"Lactate > Unt",in_stock',
    'FR-002,"Napolact Lapte semidegresat 1,5% ecologic",Napolact,,11.50,,,1 L,"Lactate > Lapte bio",in_stock',
    'FR-003,"Albalact Unt 82% (editie redusa 180g)",Albalact,,11.00,,,180 g,"Lactate > Unt",in_stock',
    'FR-004,"Cașcaval feliat vitrină asistată",Retailer,2812345004207,49.90,,,"per kg","Brânzeturi > Cântar",in_stock',
  ].join('\n');

  const rows = parseCsv(csv);
  assert.equal(rows.length, 4);

  const canonicalProducts = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      canonical_name: 'Albalact Unt 82% 200 g',
      brand: 'Albalact',
      package_size: '200 g',
      quantity_value: 200,
      quantity_unit: 'g',
      barcode: '5941355011967',
      attributes: { fat_percentage: 82 },
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      canonical_name: 'Napolact Lapte semidegresat BIO 1,5% 1 L',
      brand: 'Napolact',
      package_size: '1 L',
      quantity_value: 1000,
      quantity_unit: 'ml',
      barcode: null,
      attributes: { fat_percentage: 1.5 },
    },
  ];
  const barcodeIndex = new Map([['5941355011967', canonicalProducts[0]]]);

  const processed = processRetailerFeed({
    feedRows: rows,
    retailerSlug: 'freshful',
    retailerName: 'Freshful',
    city: 'București',
    channel: 'delivery',
    fullFeed: true,
    canonicalProducts,
    barcodeIndex,
  });

  assert.equal(processed.summary.matchedExactEan, 1);
  assert.equal(processed.summary.matchedStrictCanonical, 1);
  assert.equal(processed.summary.weighScaleBarcodesIsolated, 1);
  assert.equal(processed.summary.offersReady, 2);

  const first = processed.items[0];
  assert.equal(first.price, 12.49);
  assert.equal(first.regular_price, 15.99);
  assert.equal(first.loyalty_price, 11.99);
  assert.equal(first.normalized_unit_price, 62.45);
  assert.equal(first.normalized_unit_label, 'RON/kg');
  assert.equal(first.match_method, 'ean_exact');

  const shrinkItem = processed.items[2];
  assert.notEqual(shrinkItem.match_status, 'matched');

  const recCheck = normalizeRetailerRecord(rows[3]);
  assert.equal(recCheck.sell_by_mode, 'kg');
  assert.equal(recCheck.normalized_unit_label, 'RON/kg');

  const sql = buildIngestionSql(processed);
  assert.ok(sql.includes('on conflict (retailer_id, coalesce(fulfillment_node_id'));
  assert.ok(sql.includes('insert into public.beavy_product_price_history'));
  assert.ok(sql.includes('if v_full_feed then'));
});

test('beavy-comparison.ts: snapshot freshness wins over stale price, fulfillment fees, & strict private-label equivalents', async () => {
  const { computeBasketComparison, isCompatibleEquivalentProduct } = await loadComparisonModule();

  const pBaneasa = {
    id: 'p-baneasa',
    canonical_name: 'Băneasa Făină albă superioară 000 1 kg',
    brand: 'Băneasa',
    package_size: '1 kg',
    quantity_value: 1000,
    quantity_unit: 'g',
    attributes: { flour_type: 'wheat 000' },
    familyIds: ['fam-faina'],
  };
  const pKClassic = {
    id: 'p-kclassic',
    canonical_name: 'K-Classic Făină albă 000 1 kg',
    brand: 'K-Classic',
    package_size: '1 kg',
    quantity_value: 1000,
    quantity_unit: 'g',
    attributes: { flour_type: 'wheat 000' },
    familyIds: ['fam-faina'],
  };
  const pIntegrala = {
    id: 'p-integrala',
    canonical_name: 'Băneasa Făină integrală 1 kg',
    brand: 'Băneasa',
    package_size: '1 kg',
    quantity_value: 1000,
    quantity_unit: 'g',
    attributes: { flour_type: 'whole wheat' },
    familyIds: ['fam-faina'],
  };
  const pUnt = {
    id: 'p-unt',
    canonical_name: 'Albalact Unt 82% 200 g',
    brand: 'Albalact',
    package_size: '200 g',
    quantity_value: 200,
    quantity_unit: 'g',
    attributes: { fat_percentage: 82 },
    familyIds: ['fam-unt'],
  };

  assert.equal(isCompatibleEquivalentProduct(pBaneasa, pKClassic), true);
  assert.equal(isCompatibleEquivalentProduct(pBaneasa, pIntegrala), false);

  const retailers = [
    {
      id: 'ret-freshful',
      slug: 'freshful',
      name: 'Freshful',
      logo_url: null,
      website_url: null,
      supports_physical: false,
      supports_delivery: true,
      is_active: true,
      updated_at: '2026-11-10T10:00:00Z',
    },
    {
      id: 'ret-kaufland',
      slug: 'kaufland',
      name: 'Kaufland',
      logo_url: null,
      website_url: null,
      supports_physical: true,
      supports_delivery: false,
      is_active: true,
      updated_at: '2026-11-10T10:00:00Z',
    },
  ];

  const nodes = [
    {
      id: 'node-ff-buc',
      retailer_id: 'ret-freshful',
      node_key: 'bucuresti-delivery',
      name: 'Freshful București',
      node_type: 'delivery_area',
      fulfillment_channel: 'delivery',
      city: 'București',
      is_active: true,
    },
  ];

  const rules = [
    {
      id: 'rule-ff-buc',
      fulfillment_node_id: 'node-ff-buc',
      currency: 'RON',
      delivery_fee: 14.99,
      service_fee: 2.0,
      packaging_fee: 0,
      small_order_fee: 5.0,
      small_order_fee_threshold: 50,
      minimum_order_value: 80,
      free_delivery_threshold: 250,
      effective_from: '2026-01-01T00:00:00Z',
      effective_until: null,
      is_active: true,
    },
  ];

  const offers = [
    // Stale cheaper offer (must lose to fresh snapshot!)
    {
      id: 'o-stale',
      product_id: pUnt.id,
      retailer_id: 'ret-freshful',
      retailer_name: 'Freshful',
      fulfillment_node_id: 'node-ff-buc',
      price: 9.0,
      regular_price: 12.0,
      promo_price: 9.0,
      loyalty_price: null,
      promo_label: 'Stale',
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 45,
      normalized_unit_price: 45,
      normalized_unit_label: 'RON/kg',
      sell_by_mode: 'unit',
      quantity_value: 200,
      quantity_unit: 'g',
      package_size: '200 g',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'delivery',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: '2026-11-01T10:00:00Z',
      valid_until: null,
    },
    // Fresh snapshot for Freshful Unt
    {
      id: 'o-fresh',
      product_id: pUnt.id,
      retailer_id: 'ret-freshful',
      retailer_name: 'Freshful',
      fulfillment_node_id: 'node-ff-buc',
      price: 12.5,
      regular_price: 14.5,
      promo_price: 12.5,
      loyalty_price: null,
      promo_label: '-14%',
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 62.5,
      normalized_unit_price: 62.5,
      normalized_unit_label: 'RON/kg',
      sell_by_mode: 'unit',
      quantity_value: 200,
      quantity_unit: 'g',
      package_size: '200 g',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'delivery',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: '2026-11-10T10:00:00Z',
      valid_until: null,
    },
    // Out-of-stock cheaper offer (must be ignored!)
    {
      id: 'o-oos',
      product_id: pUnt.id,
      retailer_id: 'ret-kaufland',
      retailer_name: 'Kaufland',
      fulfillment_node_id: null,
      price: 5.0,
      regular_price: null,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 25,
      normalized_unit_price: 25,
      normalized_unit_label: 'RON/kg',
      sell_by_mode: 'unit',
      quantity_value: 200,
      quantity_unit: 'g',
      package_size: '200 g',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'out_of_stock',
      stock_status: 'out_of_stock',
      observed_at: '2026-11-10T12:00:00Z',
      valid_until: null,
    },
    // Kaufland valid in-stock Unt
    {
      id: 'o-kl-unt',
      product_id: pUnt.id,
      retailer_id: 'ret-kaufland',
      retailer_name: 'Kaufland',
      fulfillment_node_id: null,
      price: 13.0,
      regular_price: null,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 65,
      normalized_unit_price: 65,
      normalized_unit_label: 'RON/kg',
      sell_by_mode: 'unit',
      quantity_value: 200,
      quantity_unit: 'g',
      package_size: '200 g',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: '2026-11-10T10:00:00Z',
      valid_until: null,
    },
    // Freshful has exact Baneasa flour
    {
      id: 'o-ff-faina',
      product_id: pBaneasa.id,
      retailer_id: 'ret-freshful',
      retailer_name: 'Freshful',
      fulfillment_node_id: 'node-ff-buc',
      price: 5.5,
      regular_price: null,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 5.5,
      normalized_unit_price: 5.5,
      normalized_unit_label: 'RON/kg',
      sell_by_mode: 'unit',
      quantity_value: 1000,
      quantity_unit: 'g',
      package_size: '1 kg',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'delivery',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: '2026-11-10T10:00:00Z',
      valid_until: null,
    },
    // Kaufland only has private label K-Classic equivalent flour (cheaper)
    {
      id: 'o-kl-kclassic',
      product_id: pKClassic.id,
      retailer_id: 'ret-kaufland',
      retailer_name: 'Kaufland',
      fulfillment_node_id: null,
      price: 3.49,
      regular_price: null,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 3.49,
      normalized_unit_price: 3.49,
      normalized_unit_label: 'RON/kg',
      sell_by_mode: 'unit',
      quantity_value: 1000,
      quantity_unit: 'g',
      package_size: '1 kg',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: '2026-11-10T10:00:00Z',
      valid_until: null,
    },
  ];

  const profilesById = new Map([
    [pUnt.id, pUnt],
    [pBaneasa.id, pBaneasa],
    [pKClassic.id, pKClassic],
    [pIntegrala.id, pIntegrala],
  ]);
  const equivalentIdsByProductId = new Map([[pBaneasa.id, [pKClassic.id]]]);

  const result = computeBasketComparison({
    items: [
      { id: '1', name: pUnt.canonical_name, quantity: 1, checked: false, productId: pUnt.id },
      { id: '2', name: pBaneasa.canonical_name, quantity: 1, checked: false, productId: pBaneasa.id },
    ],
    retailers,
    offers,
    fulfillmentNodes: nodes,
    fulfillmentRules: rules,
    profilesById,
    equivalentIdsByProductId,
    city: 'București',
  });

  assert.equal(result.canCompareFairly, true);

  const kl = result.retailerSummaries.find((r) => r.retailer.id === 'ret-kaufland');
  const ff = result.retailerSummaries.find((r) => r.retailer.id === 'ret-freshful');

  // Freshful selected fresh 12.50 (NOT stale 9.00!) + 5.50 flour = 18.00 + delivery 14.99 + service 2.00 + smallOrder 5.00 = 39.99
  assert.equal(ff.confirmedSubtotal, 18.0);
  assert.equal(ff.deliveryFee, 14.99);
  assert.equal(ff.smallOrderFee, 5.0);
  assert.equal(ff.estimatedFeesTotal, 21.99);
  assert.equal(ff.estimatedTotalWithFees, 39.99);
  assert.equal(ff.belowMinimumOrder, true);

  // Kaufland ignored OOS 5.00 unt -> 13.00 unt + 3.49 K-Classic equivalent = 16.49, 0 delivery fees
  assert.equal(kl.confirmedSubtotal, 16.49);
  assert.equal(kl.exactCoveredCount, 1);
  assert.equal(kl.equivalentCoveredCount, 1);
  assert.equal(kl.estimatedTotalWithFees, 16.49);
  assert.equal(kl.matchedItems[1].matchType, 'equivalent');
  assert.equal(kl.matchedItems[1].equivalentProductName, pKClassic.canonical_name);

  assert.equal(result.cheapestComparableRetailerId, 'ret-kaufland');
  assert.equal(result.potentialSavings, 23.5);
});

test('beavy-comparison.ts: rejects offers outside the verified freshness window', async () => {
  const { isFreshVerifiedOffer, MAX_VERIFIED_OFFER_AGE_MS } = await loadComparisonModule();
  const now = Date.parse('2026-11-13T12:00:00.000Z');
  const offer = (ageMs, valid_until = null) => ({
    observed_at: new Date(now - ageMs).toISOString(),
    valid_until,
  });

  assert.equal(isFreshVerifiedOffer(offer(MAX_VERIFIED_OFFER_AGE_MS), now), true);
  assert.equal(isFreshVerifiedOffer(offer(MAX_VERIFIED_OFFER_AGE_MS + 1), now), false);
  assert.equal(
    isFreshVerifiedOffer(offer(0, '2026-11-13T11:59:59.000Z'), now),
    false
  );
  assert.equal(
    isFreshVerifiedOffer(offer(0, 'not-a-date'), now),
    false
  );
  assert.equal(
    isFreshVerifiedOffer({ observed_at: '2026-11-13T12:06:00.000Z', valid_until: null }, now),
    false
  );
});

test('beavy-comparison.ts: loyalty card pricing and CONNECT multi-buy savings', async () => {
  const { computeLoyaltyLineTotal, resolveLoyaltyProgramName } = await loadComparisonModule();

  const myClubOffer = {
    price: 12.99,
    regular_price: 12.99,
    promo_price: null,
    loyalty_price: 9.09,
    promo_label: '30% REDUCERE cu CARD MyCLUB',
    promo_requires_card: true,
    retailer_name: 'Auchan',
  };
  assert.equal(resolveLoyaltyProgramName('Auchan', myClubOffer.promo_label), 'Card MyCLUB');
  assert.deepEqual(computeLoyaltyLineTotal(myClubOffer, 2), {
    loyaltyLineTotal: 18.18,
    loyaltySavings: 7.8,
    hasLoyaltyOffer: true,
  });

  const connectSecondOffer = {
    price: 11.39,
    regular_price: 11.39,
    promo_price: null,
    loyalty_price: null,
    promo_label: 'CONNECT -80% la al 2-lea',
    promo_requires_card: true,
    retailer_name: 'Mega Image',
  };
  assert.equal(resolveLoyaltyProgramName('Mega Image', connectSecondOffer.promo_label), 'Card CONNECT');
  assert.deepEqual(computeLoyaltyLineTotal(connectSecondOffer, 1), {
    loyaltyLineTotal: null,
    loyaltySavings: 0,
    hasLoyaltyOffer: true,
  });
  assert.deepEqual(computeLoyaltyLineTotal(connectSecondOffer, 2), {
    loyaltyLineTotal: 13.67,
    loyaltySavings: 9.11,
    hasLoyaltyOffer: true,
  });

  const buy2Pay1Offer = {
    price: 55.99,
    regular_price: 55.99,
    promo_price: null,
    loyalty_price: null,
    promo_label: 'CONNECT comanzi 2, platesti 1',
    promo_requires_card: true,
    retailer_name: 'Mega Image',
  };
  assert.deepEqual(computeLoyaltyLineTotal(buy2Pay1Offer, 2), {
    loyaltyLineTotal: 55.99,
    loyaltySavings: 55.99,
    hasLoyaltyOffer: true,
  });
});

test('Catalog normalization audit guards: bonus multipacks, decaf, alcohol-free, nut/rice/meat conflicts', () => {
  const bonusPack = parseQuantity('Birra Moretti Bere blonda 5+1 x 0.33L');
  assert.deepEqual(bonusPack, { kind: 'volume', baseValue: 1980, baseUnit: 'ml', packCount: 6 });

  const singleBottleMatch = scoreCanonicalCandidate(
    {
      id: 'beer-1',
      canonical_name: 'Birra Moretti Bere blondă sticlă 330ml',
      brand: 'Birra Moretti',
      package_size: '330 ml',
      quantity_value: 330,
      quantity_unit: 'ml',
    },
    { product_name: 'Birra Moretti Bere blonda 5+1 x 0.33L', brands: 'Birra Moretti', requireImage: false }
  );
  assert.equal(singleBottleMatch.quantityExact, false);

  const multipack15LMatch = scoreCanonicalCandidate(
    {
      id: 'cola-15',
      canonical_name: 'Coca-Cola Băutură carbogazoasă cola zero zahăr 1.5l',
      brand: 'Coca-Cola',
      package_size: '1.5 L',
      quantity_value: 1500,
      quantity_unit: 'ml',
    },
    {
      product_name: 'Bautura carbogazoasa Coca-Cola Zero Zahar, 6 x 0.25 l',
      brands: 'Coca-Cola',
      quantity: '1500 ml',
      requireImage: false,
    }
  );
  assert.equal(multipack15LMatch.quantityExact, false);

  const decafVsRegular = scoreCanonicalCandidate(
    {
      id: 'coffee-decaf',
      canonical_name: 'Doncafé Decaff 100g, cafea decofeinizată prăjită și măcinată',
      brand: 'Doncafe',
      package_size: '100 g',
      quantity_value: 100,
      quantity_unit: 'g',
    },
    { product_name: 'Doncafe Cafea prajita si macinata 100g', brands: 'Doncafe', requireImage: false }
  );
  assert.ok(decafVsRegular.confidence < 0.2);

  const riceConflict = scoreCanonicalCandidate(
    {
      id: 'rice-basmati',
      canonical_name: 'Riso Scotti Orez ușor de gătit basmati 2x125g',
      brand: 'Riso Scotti',
      package_size: '2x125 g',
      quantity_value: 250,
      quantity_unit: 'g',
    },
    { product_name: 'Orez Basmati si Salbatic Riso Scotti, 250 g', brands: 'Riso Scotti', requireImage: false }
  );
  assert.ok(riceConflict.confidence < 0.2);
});

test('beavy-comparison.ts: rejects cross-category family equivalents & chunks 3+ large-family baskets cleanly', async () => {
  const { isCompatibleEquivalentProduct } = await loadComparisonModule();

  const makeProf = (id, canonical_name, package_size, quantity_value, quantity_unit, fam = 'fam-1') => ({
    id,
    canonical_name,
    brand: null,
    package_size,
    quantity_value,
    quantity_unit,
    image_url: null,
    category: null,
    attributes: {},
    familyIds: [fam],
  });

  // Respinge echivalările false din familii largi (aceeași cantitate)
  assert.equal(
    isCompatibleEquivalentProduct(
      makeProf('p-ulei', 'Spornic Ulei de floarea-soarelui 1l', '1 L', 1000, 'ml', 'fam-ulei-otet'),
      makeProf('p-otet', 'Olympia Oțet 9° din alcool etilic rafinat 1l', '1 L', 1000, 'ml', 'fam-ulei-otet')
    ),
    false
  );
  assert.equal(
    isCompatibleEquivalentProduct(
      makeProf('p-fanta', 'Fanta Băutură carbogazoasă portocale 2l', '2 L', 2000, 'ml', 'fam-suc'),
      makeProf('p-sprite', 'Sprite Băutură carbogazoasă Fresh 2l', '2 L', 2000, 'ml', 'fam-suc')
    ),
    false
  );
  assert.equal(
    isCompatibleEquivalentProduct(
      makeProf('p-pepsi-twist', 'Pepsi Băutură carbogazoasă Twist lămâie 1.5l', '1.5 L', 1500, 'ml', 'fam-suc'),
      makeProf('p-fanta-15', 'Fanta Băutură carbogazoasă portocale 1.5l', '1.5 L', 1500, 'ml', 'fam-suc')
    ),
    false
  );
  assert.equal(
    isCompatibleEquivalentProduct(
      makeProf('p-pate-ton', 'Rio Mare Pate de ton picant 100g', '100 g', 100, 'g', 'fam-cons'),
      makeProf('p-pate-porc', 'Scandia Sibiu Pate de porc picant 100g', '100 g', 100, 'g', 'fam-cons')
    ),
    false
  );
  assert.equal(
    isCompatibleEquivalentProduct(
      makeProf('p-cascaval', 'Delaco Cașcaval Sofia 400g', '400 g', 400, 'g', 'fam-branza'),
      makeProf('p-urda', 'Olympus Urdă din lapte de vacă 2% grăsime 400g', '400 g', 400, 'g', 'fam-branza')
    ),
    false
  );
  assert.equal(
    isCompatibleEquivalentProduct(
      makeProf('p-multi', 'Pepsi Băutură carbogazoasă aromă cola 4x500ml', '4x500 ml', 2000, 'ml', 'fam-suc'),
      makeProf('p-single', 'Pepsi Băutură carbogazoasă aromă cola 2l', '2 L', 2000, 'ml', 'fam-suc')
    ),
    false
  );

  // Păstrează echivalările autentice pe același tip de produs
  assert.equal(
    isCompatibleEquivalentProduct(
      makeProf('p-lapte-1', 'Zuzu Lapte 3.5% grăsime 1l', '1 L', 1000, 'ml', 'fam-lapte'),
      makeProf('p-lapte-2', 'LaDORNA Lapte 3.5% grăsime 1l', '1 L', 1000, 'ml', 'fam-lapte')
    ),
    true
  );
  assert.equal(
    isCompatibleEquivalentProduct(
      makeProf('p-batut-1', 'Covalact Lapte bătut 2% grăsime 330g', '330 g', 330, 'g', 'fam-batut'),
      makeProf('p-batut-2', 'Napolact Lapte bătut 2% grăsime 330g', '330 g', 330, 'g', 'fam-batut')
    ),
    true
  );

  // Simulează un coș cu 3 produse ale căror familii depășesc pragul PostgREST (~635 UUID-uri & 1000 rânduri)
  const fams = ['fam-a', 'fam-b', 'fam-c'];
  const familySizePerFam = 420; // 3 * 420 = 1260 membrii (> 635 URI limit și > 1000 row limit!)
  const familyMembersRows = [];
  const productRows = [];
  const basketTargets = [];
  for (let fi = 0; fi < fams.length; fi++) {
    const fid = fams[fi];
    for (let mi = 0; mi < familySizePerFam; mi++) {
      const pid = `prod-${fi}-${mi}`;
      familyMembersRows.push({ product_id: pid, family_id: fid });
      productRows.push({
        id: pid,
        canonical_name: `Lapte produs-${fi}-${mi} 3.5% 1l`,
        brand: mi === 1 ? 'Marca Proprie' : 'Zuzu',
        package_size: '1 L',
        quantity_value: 1000,
        quantity_unit: 'ml',
        image_url: null,
        category: 'Lactate',
        attributes: {},
        is_active: true,
      });
      if (mi === 0) {
        basketTargets.push({ id: pid, productId: pid, name: `Lapte produs-${fi}-0`, quantity: 1 });
      }
    }
  }

  const retailerRows = ['freshful', 'auchan', 'mega-image', 'carrefour'].map((slug, idx) => ({
    id: `ret-${idx}`,
    slug,
    name: slug,
    logo_url: null,
    website_url: null,
    supports_physical: slug !== 'freshful',
    supports_delivery: true,
    is_active: true,
    updated_at: '2026-11-11T10:00:00Z',
  }));

  const offerRows = [];
  for (const target of basketTargets) {
    for (const r of retailerRows) {
      offerRows.push({
        id: `off-${target.productId}-${r.id}`,
        product_id: target.productId,
        retailer_id: r.id,
        retailer_name: r.name,
        fulfillment_node_id: null,
        price: 10.5,
        regular_price: 10.5,
        promo_price: null,
        loyalty_price: null,
        promo_label: null,
        promo_requires_card: false,
        currency: 'RON',
        unit_price: null,
        normalized_unit_price: null,
        normalized_unit_label: null,
        quantity_value: 1000,
        quantity_unit: 'ml',
        package_size: '1 L',
        product_url: null,
        image_url: null,
        fulfillment_channel: r.supports_physical ? 'store' : 'delivery',
        city: 'București',
        availability: 'in_stock',
        stock_status: 'in_stock',
        sell_by_mode: 'unit',
        observed_at: new Date().toISOString(),
        valid_until: null,
        raw_data: {},
        is_active: true,
      });
    }
  }

  const maxObservedInClause = { count: 0 };
  function buildMockTable(tableName) {
    const state = {
      filters: [],
      inFilters: [],
      ilikeFilters: [],
      orders: [],
      rangeFrom: 0,
      rangeTo: 999999,
    };
    const builder = {
      select() { return builder; },
      eq(col, val) { state.filters.push([col, val]); return builder; },
      gte(col, val) { state.filters.push([col, { gte: val }]); return builder; },
      ilike(col, pattern) {
        const needle = String(pattern ?? '').replace(/^%+|%+$/g, '').toLowerCase();
        state.ilikeFilters.push([col, needle]);
        return builder;
      },
      in(col, vals) {
        if (vals.length > maxObservedInClause.count) maxObservedInClause.count = vals.length;
        // Reproduce exact PostgREST failure if any .in() ever sends > 620 UUIDs!
        if (vals.length > 620) {
          state.tooLong = true;
        }
        state.inFilters.push([col, new Set(vals)]);
        return builder;
      },
      order(col, opts) { state.orders.push([col, opts?.ascending !== false]); return builder; },
      limit(n) { state.rangeTo = state.rangeFrom + n - 1; return builder; },
      range(from, to) { state.rangeFrom = from; state.rangeTo = to; return builder; },
      then(resolve) {
        if (state.tooLong) {
          return Promise.resolve({ data: null, error: { message: 'Bad Request' } }).then(resolve);
        }
        let rows = [];
        if (tableName === 'beavy_retailers') rows = retailerRows;
        else if (tableName === 'beavy_fulfillment_nodes') rows = [];
        else if (tableName === 'beavy_product_family_members') rows = familyMembersRows;
        else if (tableName === 'beavy_products') rows = productRows;
        else if (tableName === 'beavy_product_offers') rows = offerRows;

        rows = rows.filter((r) => {
          for (const [c, v] of state.filters) {
            if (c.includes('->>')) {
              const [colName, jsonKey] = c.split('->>');
              const actual = r[colName]?.[jsonKey];
              if (String(actual ?? '') !== String(v)) return false;
            } else if (v && typeof v === 'object' && 'gte' in v) {
              if (String(r[c] ?? '') < String(v.gte)) return false;
            } else if (r[c] !== v) {
              return false;
            }
          }
          for (const [c, set] of state.inFilters) {
            if (!set.has(r[c])) return false;
          }
          for (const [c, needle] of state.ilikeFilters) {
            if (!String(r[c] ?? '').toLowerCase().includes(needle)) return false;
          }
          return true;
        });

        // Simulate PostgREST 1000-row max cap per request
        const effectiveTo = Math.min(state.rangeTo, state.rangeFrom + 999);
        const sliced = rows.slice(state.rangeFrom, effectiveTo + 1);
        return Promise.resolve({ data: sliced, error: null }).then(resolve);
      },
    };
    return builder;
  }

  const { compareShoppingBasket: compareWithLargeFamilies } = await loadComparisonModule({
    from: (tableName) => buildMockTable(tableName),
  });

  const result = await compareWithLargeFamilies(basketTargets, { city: 'București' });
  assert.ok(maxObservedInClause.count <= 60, `Expected chunked .in() <= 60, got ${maxObservedInClause.count}`);
  assert.equal(result.coveredItemsCount, 3);
  for (const s of result.retailerSummaries) {
    assert.equal(s.coveredCount, 3);
    assert.equal(s.hasFullBasketCoverage, true);
  }
  assert.ok(result.itemStatuses.every((st) => st.canonicalName !== null));

  const { computeBasketInsights } = await loadComparisonModule();
  const insights = computeBasketInsights({
    retailers: retailerRows,
    retailerSummaries: [
      { retailer: retailerRows[0], coveredCount: 3, totalItemsCount: 3, hasFullCatalogCoverage: true, estimatedTotalWithFees: 90, potentialLoyaltySavings: 0 },
      { retailer: retailerRows[1], coveredCount: 3, totalItemsCount: 3, hasFullCatalogCoverage: true, estimatedTotalWithFees: 120, potentialLoyaltySavings: 5 },
      { retailer: retailerRows[2], coveredCount: 2, totalItemsCount: 3, hasFullCatalogCoverage: false, estimatedTotalWithFees: 55, potentialLoyaltySavings: 0 },
      { retailer: retailerRows[3], coveredCount: 3, totalItemsCount: 3, hasFullCatalogCoverage: true, estimatedTotalWithFees: 105, potentialLoyaltySavings: 12 },
    ],
    itemStatuses: [],
    totalItemsCount: 3,
    totalUnitsCount: 3,
    catalogItemsCount: 3,
    manualItemsCount: 0,
    coveredItemsCount: 3,
    unavailableItemsCount: 0,
    noPriceItemsCount: 0,
    overallCoveragePercent: 100,
    latestOfferDate: null,
    canCompareFairly: true,
    potentialSavings: 30,
    cheapestComparableRetailerId: 'ret-0',
    transparencyNote: '',
  });
  // Magazinele complete descrescător (120 -> 105 -> 90), urmate de cel parțial (2/3 = 55)
  assert.deepEqual(
    insights.chartSummariesDescending.map((s) => s.retailer.slug),
    ['auchan', 'carrefour', 'freshful', 'mega-image']
  );
  assert.equal(insights.bestStore?.retailer.slug, 'freshful');
  assert.equal(insights.averageBasketTotal, 105);
  assert.equal(insights.maxSpreadRon, 30);
  assert.equal(insights.cheapestPercentSavings, 25);
  assert.equal(insights.bestLoyaltyStore?.retailer.slug, 'carrefour');
});

test('beavy-comparison.ts: prepares low-budget private-label variant with strict equivalence & honest savings', async () => {
  const {
    computeDualBasketComparison,
    isCompatibleEquivalentProduct,
    isPrivateLabelProduct,
    resolvePrivateLabelOwnerRetailer,
  } = await loadComparisonModule();

  const zuzuMilk = {
    id: 'p-zuzu',
    canonical_name: 'Zuzu Lapte 1.5% grăsime 1l',
    brand: 'Zuzu',
    package_size: '1 L',
    quantity_value: 1,
    quantity_unit: 'L',
    category: 'Lactate și ouă',
    subcategory: 'Lapte pasteurizat',
    attributes: {},
    familyIds: [],
  };
  const albertMilk = {
    id: 'p-albert',
    canonical_name: 'Albert Lapte UHT 1.5% grăsime 1L',
    brand: 'Albert',
    package_size: '1000 ml',
    quantity_value: 1000,
    quantity_unit: 'ml',
    category: 'Lactate și ouă',
    subcategory: 'Lapte',
    attributes: { is_private_label: true },
    familyIds: [],
  };
  const pouceMilk = {
    id: 'p-pouce',
    canonical_name: 'Lapte semidegresat Pouce, 1.5% grăsime, 1 l',
    brand: 'Pouce',
    package_size: '1000 ml',
    quantity_value: 1000,
    quantity_unit: 'ml',
    category: 'Lactate și ouă',
    subcategory: 'Lapte',
    attributes: { is_private_label: true },
    familyIds: [],
  };
  const goatPlMilk = {
    id: 'p-goat',
    canonical_name: 'Bio Lapte de capră 1.5% grăsime 1L',
    brand: 'K-Bio',
    package_size: '1000 ml',
    quantity_value: 1000,
    quantity_unit: 'ml',
    category: 'Lactate și ouă',
    subcategory: 'Lapte',
    attributes: { is_private_label: true, bio: true },
    familyIds: [],
  };
  const gourmetPlMilk = {
    id: 'p-gourmet',
    canonical_name: 'Mega Apetit Lapte 1.5% grăsime 1l',
    brand: 'Mega Apetit',
    package_size: '1000 ml',
    quantity_value: 1000,
    quantity_unit: 'ml',
    category: 'Lactate și ouă',
    subcategory: 'Lapte',
    attributes: { is_private_label: true },
    familyIds: [],
  };
  const pepsiMegaPack = {
    id: 'p-pepsi-mega',
    canonical_name: 'Pepsi Cola Mega Pack 2l',
    brand: 'Pepsi',
    package_size: '2 l',
    quantity_value: 2000,
    quantity_unit: 'ml',
    category: 'Băuturi',
    subcategory: 'Băuturi răcoritoare',
    attributes: {},
    familyIds: [],
  };

  assert.equal(isPrivateLabelProduct(zuzuMilk), false);
  assert.equal(isPrivateLabelProduct(pepsiMegaPack), false);
  assert.equal(isPrivateLabelProduct(albertMilk), true);
  assert.equal(isPrivateLabelProduct(pouceMilk), true);

  // Fructele și legumele proaspete nu trebuie să fie considerate marcă proprie (chiar dacă au brandul Gusturi Românești)
  const gusturiTomatoes = {
    id: 'prod-gusturi-rosii',
    canonical_name: 'Roșii Gusturi Românești 500g',
    brand: 'Gusturi Românești',
    package_size: '500g',
    quantity_value: 500,
    quantity_unit: 'g',
    category: 'Legume & Fructe',
    subcategory: 'Legume proaspete',
    attributes: { is_private_label: true },
    familyIds: [],
  };
  const standardApples = {
    id: 'prod-mere-golden',
    canonical_name: 'Mere Golden 1kg',
    brand: null,
    package_size: '1kg',
    quantity_value: 1,
    quantity_unit: 'kg',
    category: 'Fructe',
    subcategory: 'Mere',
    attributes: {},
    familyIds: [],
  };
  assert.equal(isPrivateLabelProduct(gusturiTomatoes), false);
  assert.equal(isPrivateLabelProduct(standardApples), false);
  assert.equal(resolvePrivateLabelOwnerRetailer(gusturiTomatoes), null);
  assert.equal(
    isCompatibleEquivalentProduct(zuzuMilk, albertMilk, {
      allowSameCategoryWithoutFamily: true,
    }),
    true
  );
  assert.equal(
    isCompatibleEquivalentProduct(zuzuMilk, goatPlMilk, {
      allowSameCategoryWithoutFamily: true,
    }),
    false
  );

  const retailers = [
    {
      id: 'ret-mega',
      slug: 'mega-image',
      name: 'Mega Image',
      logo_url: null,
      website_url: null,
      supports_physical: true,
      supports_delivery: true,
      is_active: true,
      updated_at: '2026-11-11T10:00:00Z',
    },
    {
      id: 'ret-auchan',
      slug: 'auchan',
      name: 'Auchan',
      logo_url: null,
      website_url: null,
      supports_physical: true,
      supports_delivery: true,
      is_active: true,
      updated_at: '2026-11-11T10:00:00Z',
    },
  ];

  const offers = [
    {
      id: 'o-mega-zuzu',
      product_id: zuzuMilk.id,
      retailer_id: 'ret-mega',
      retailer_name: 'Mega Image',
      fulfillment_node_id: null,
      price: 6.99,
      regular_price: 6.99,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 6.99,
      normalized_unit_price: 6.99,
      normalized_unit_label: 'RON/l',
      sell_by_mode: 'unit',
      quantity_value: 1000,
      quantity_unit: 'ml',
      package_size: '1 l',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: '2026-11-11T12:00:00Z',
      valid_until: null,
    },
    {
      id: 'o-mega-albert',
      product_id: albertMilk.id,
      retailer_id: 'ret-mega',
      retailer_name: 'Mega Image',
      fulfillment_node_id: null,
      price: 4.74,
      regular_price: 4.74,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 4.74,
      normalized_unit_price: 4.74,
      normalized_unit_label: 'RON/l',
      sell_by_mode: 'unit',
      quantity_value: 1000,
      quantity_unit: 'ml',
      package_size: '1000 ml',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: '2026-11-11T12:00:00Z',
      valid_until: null,
    },
    {
      id: 'o-mega-gourmet',
      product_id: gourmetPlMilk.id,
      retailer_id: 'ret-mega',
      retailer_name: 'Mega Image',
      fulfillment_node_id: null,
      price: 9.99,
      regular_price: 9.99,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 9.99,
      normalized_unit_price: 9.99,
      normalized_unit_label: 'RON/l',
      sell_by_mode: 'unit',
      quantity_value: 1000,
      quantity_unit: 'ml',
      package_size: '1000 ml',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: '2026-11-11T12:00:00Z',
      valid_until: null,
    },
    {
      id: 'o-auchan-zuzu',
      product_id: zuzuMilk.id,
      retailer_id: 'ret-auchan',
      retailer_name: 'Auchan',
      fulfillment_node_id: null,
      price: 6.49,
      regular_price: 6.49,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 6.49,
      normalized_unit_price: 6.49,
      normalized_unit_label: 'RON/l',
      sell_by_mode: 'unit',
      quantity_value: 1000,
      quantity_unit: 'ml',
      package_size: '1 l',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: '2026-11-11T12:00:00Z',
      valid_until: null,
    },
    {
      id: 'o-auchan-pouce',
      product_id: pouceMilk.id,
      retailer_id: 'ret-auchan',
      retailer_name: 'Auchan',
      fulfillment_node_id: null,
      price: 4.59,
      regular_price: 4.59,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      currency: 'RON',
      unit_price: 4.59,
      normalized_unit_price: 4.59,
      normalized_unit_label: 'RON/l',
      sell_by_mode: 'unit',
      quantity_value: 1000,
      quantity_unit: 'ml',
      package_size: '1000 ml',
      product_url: null,
      image_url: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: '2026-11-11T12:00:00Z',
      valid_until: null,
    },
  ];

  const profilesById = new Map([
    [zuzuMilk.id, zuzuMilk],
    [albertMilk.id, albertMilk],
    [pouceMilk.id, pouceMilk],
    [goatPlMilk.id, goatPlMilk],
    [gourmetPlMilk.id, gourmetPlMilk],
  ]);
  const privateLabelIdsByProductId = new Map([
    [zuzuMilk.id, [albertMilk.id, pouceMilk.id, gourmetPlMilk.id]],
  ]);

  const dual = computeDualBasketComparison({
    items: [
      {
        id: 'item-1',
        name: zuzuMilk.canonical_name,
        quantity: 2,
        checked: false,
        productId: zuzuMilk.id,
      },
    ],
    retailers,
    offers,
    profilesById,
    privateLabelIdsByProductId,
    city: 'București',
  });

  // Standard mode picks Auchan Zuzu = 2 * 6.49 = 12.98 RON (keeps national brand even though Pouce exists)
  const stdAuchan = dual.standard.retailerSummaries.find((s) => s.retailer.slug === 'auchan');
  assert.equal(stdAuchan.estimatedTotalWithFees, 12.98);
  assert.equal(stdAuchan.matchedItems[0].matchType, 'exact');

  // Budget mode picks Auchan Pouce = 2 * 4.59 = 9.18 RON (saves 3.80 RON!) and Mega picks Albert (NOT expensive gourmet 9.99)
  const bgtAuchan = dual.budget.retailerSummaries.find((s) => s.retailer.slug === 'auchan');
  const bgtMega = dual.budget.retailerSummaries.find((s) => s.retailer.slug === 'mega-image');
  assert.equal(bgtAuchan.estimatedTotalWithFees, 9.18);
  assert.equal(bgtAuchan.budgetSwapCount, 1);
  assert.equal(bgtAuchan.matchedItems[0].isBudgetSwap, true);
  assert.equal(bgtAuchan.matchedItems[0].equivalentProductName, pouceMilk.canonical_name);
  assert.equal(bgtAuchan.matchedItems[0].budgetSavingsLine, 3.8);
  assert.equal(bgtMega.matchedItems[0].equivalentProductName, albertMilk.canonical_name);

  assert.equal(dual.budgetSummary.hasBudgetVariant, true);
  assert.equal(dual.budgetSummary.standardBestTotal, 12.98);
  assert.equal(dual.budgetSummary.budgetBestTotal, 9.18);
  assert.equal(dual.budgetSummary.savingsVsStandardBest, 3.8);
  assert.equal(dual.budgetSummary.savingsPercentVsStandardBest, 29);
});

test('Multi-store mix optimizer: physical split savings, MOV/fee guards, tie coalescing, coverage & budget mix', async () => {
  const { computeBasketComparison, computeDualBasketComparison } = await loadComparisonModule();

  const makeRetailer = (id, slug, name, supportsPhysical, supportsDelivery) => ({
    id,
    slug,
    name,
    logo_url: null,
    website_url: null,
    supports_physical: supportsPhysical,
    supports_delivery: supportsDelivery,
    is_active: true,
    updated_at: '2026-11-12T10:00:00Z',
  });

  const auchan = makeRetailer('ret-au', 'auchan', 'Auchan', true, true);
  const mega = makeRetailer('ret-mi', 'mega-image', 'Mega Image', true, true);
  const carrefour = makeRetailer('ret-cf', 'carrefour', 'Carrefour', true, true);
  const freshful = makeRetailer('ret-fr', 'freshful', 'Freshful', false, true);

  const mkOffer = (id, productId, retailer, price, channel = 'store', fulfillmentNodeId = null) => ({
    id,
    product_id: productId,
    retailer_id: retailer.id,
    retailer_name: retailer.name,
    fulfillment_node_id: fulfillmentNodeId,
    price,
    regular_price: price,
    promo_price: null,
    loyalty_price: null,
    promo_label: null,
    promo_requires_card: false,
    sgr_fee: null,
    currency: 'RON',
    unit_price: price,
    normalized_unit_price: price,
    normalized_unit_label: 'RON/buc',
    sell_by_mode: 'unit',
    quantity_value: 1,
    quantity_unit: 'buc',
    package_size: '1 buc',
    product_url: null,
    image_url: null,
    fulfillment_channel: channel,
    city: 'București',
    availability: 'in_stock',
    stock_status: 'in_stock',
    observed_at: '2026-11-12T10:00:00Z',
    valid_until: null,
  });

  const mkProfile = (id, canonicalName, brand, isPrivateLabel = false) => ({
    id,
    canonical_name: canonicalName,
    brand,
    package_size: '1 l',
    quantity_value: 1000,
    quantity_unit: 'ml',
    image_url: null,
    category: 'Băcănie',
    subcategory: 'De bază',
    attributes: isPrivateLabel ? { is_private_label: true } : {},
    familyIds: ['fam-test'],
  });

  const prodMilk = mkProfile('p-milk', 'Lapte Zuzu 1L', 'Zuzu', false);
  const prodOil = mkProfile('p-oil', 'Ulei Spornic 1L', 'Spornic', false);
  const prodPasta = mkProfile('p-pasta', 'Paste Barilla 500g', 'Barilla', false);
  const prodPlOilAuchan = mkProfile('p-pl-oil-au', 'Ulei Auchan 1L', 'Auchan', true);
  const prodPlMilkMega = mkProfile('p-pl-milk-mi', 'Lapte Gusturi Românești 1L', 'Gusturi Românești', true);

  // Scenariul 1: Split optim fizic (Auchan + Mega) + Carrefour la egalitate care NU trebuie adăugat
  const items1 = [
    { id: 'i1', name: prodMilk.canonical_name, quantity: 2, checked: false, productId: prodMilk.id },
    { id: 'i2', name: prodOil.canonical_name, quantity: 1, checked: false, productId: prodOil.id },
    { id: 'i3', name: prodPasta.canonical_name, quantity: 1, checked: false, productId: prodPasta.id },
  ];

  // Auchan: Milk=8*2=16, Oil=7, Pasta=6 -> Total=29
  // Mega:   Milk=5*2=10, Oil=11, Pasta=6 (egal pe pasta!) -> Total=27
  // Carrefour: Milk=9*2=18, Oil=12, Pasta=6 (egal pe pasta!) -> Total=36
  // Mix optim: Mega (Milk 10) + Auchan (Oil 7 + Pasta 6 = 13) => 23 RON (economie 4 RON față de Mega 27!), doar 2 opriri (nu 3 cu Carrefour!)
  const offers1 = [
    mkOffer('o1', prodMilk.id, auchan, 8.0),
    mkOffer('o2', prodOil.id, auchan, 7.0),
    mkOffer('o3', prodPasta.id, auchan, 6.0),
    mkOffer('o4', prodMilk.id, mega, 5.0),
    mkOffer('o5', prodOil.id, mega, 11.0),
    mkOffer('o6', prodPasta.id, mega, 6.0),
    mkOffer('o7', prodMilk.id, carrefour, 9.0),
    mkOffer('o8', prodOil.id, carrefour, 12.0),
    mkOffer('o9', prodPasta.id, carrefour, 6.0),
  ];

  const cmp1 = computeBasketComparison({
    items: items1,
    retailers: [auchan, mega, carrefour],
    offers: offers1,
    city: 'București',
  });

  assert.ok(cmp1.bestStoreMix, 'Should find optimal 2-store mix');
  assert.equal(cmp1.bestStoreMix.stops.length, 2, 'Must coalesce tied items without adding 3rd store');
  assert.equal(cmp1.bestStoreMix.totalWithFees, 23);
  assert.equal(cmp1.bestStoreMix.bestSingleStoreName, 'Mega Image');
  assert.equal(cmp1.bestStoreMix.bestSingleStoreTotal, 27);
  assert.equal(cmp1.bestStoreMix.savingsVsBestSingleStore, 4);
  assert.equal(cmp1.bestStoreMix.improvesCoverage, false);

  // Scenariul 2: Online MOV & delivery fee enforcement -> nu sparge spre Freshful sub comanda minimă (80 RON) sau cu taxă livrare mare
  const freshfulNode = {
    id: 'node-fr',
    retailer_id: freshful.id,
    node_key: 'freshful-buc',
    name: 'Freshful București',
    node_type: 'delivery_area',
    fulfillment_channel: 'delivery',
    city: 'București',
    is_active: true,
  };
  const freshfulRule = {
    id: 'rule-fr',
    fulfillment_node_id: freshfulNode.id,
    currency: 'RON',
    delivery_fee: 14.99,
    service_fee: 0,
    packaging_fee: 0,
    small_order_fee: 0,
    small_order_fee_threshold: null,
    minimum_order_value: 80,
    free_delivery_threshold: 250,
    effective_from: '2026-01-01T00:00:00Z',
    effective_until: null,
    is_active: true,
  };

  // Freshful are Milk foarte ieftin (3 RON -> 6 RON < 80 RON MOV!)
  const offersWithFreshful = [
    ...offers1.slice(0, 3), // Auchan: 8*2 + 7 + 6 = 29
    mkOffer('o-fr-1', prodMilk.id, freshful, 3.0, 'delivery', freshfulNode.id),
    mkOffer('o-fr-2', prodOil.id, freshful, 20.0, 'delivery', freshfulNode.id),
    mkOffer('o-fr-3', prodPasta.id, freshful, 20.0, 'delivery', freshfulNode.id),
  ];

  const cmpMovBlocked = computeBasketComparison({
    items: items1,
    retailers: [auchan, freshful],
    offers: offersWithFreshful,
    fulfillmentNodes: [freshfulNode],
    fulfillmentRules: [freshfulRule],
    city: 'București',
  });
  assert.equal(
    cmpMovBlocked.bestStoreMix,
    null,
    'Must reject online split when Freshful stop is below 80 RON minimum_order_value'
  );

  // Scenariul 3: Dual comparison (Low Budget Marcă proprie + Mix între magazine)
  const offersDual = [
    ...offers1.slice(0, 6),
    mkOffer('o-pl-au', prodPlOilAuchan.id, auchan, 4.0),
    mkOffer('o-pl-mi', prodPlMilkMega.id, mega, 3.0),
  ];
  const profilesById = new Map([
    [prodMilk.id, prodMilk],
    [prodOil.id, prodOil],
    [prodPasta.id, prodPasta],
    [prodPlOilAuchan.id, prodPlOilAuchan],
    [prodPlMilkMega.id, prodPlMilkMega],
  ]);
  const privateLabelIdsByProductId = new Map([
    [prodOil.id, [prodPlOilAuchan.id]],
    [prodMilk.id, [prodPlMilkMega.id]],
  ]);

  const dualMix = computeDualBasketComparison({
    items: items1,
    retailers: [auchan, mega],
    offers: offersDual,
    profilesById,
    privateLabelIdsByProductId,
    city: 'București',
  });

  // În Budget Mode: Mega Lapte PL = 3*2=6, Auchan Ulei PL = 4, Auchan Paste = 6 => Total Mix = 16 RON!
  assert.ok(dualMix.budget.bestStoreMix, 'Budget mode should compute multi-store PL mix');
  assert.equal(dualMix.budget.bestStoreMix.totalWithFees, 16);
  assert.equal(dualMix.budget.bestStoreMix.budgetSwapCount, 2);

  // Scenariul 4: Acoperire incompletă per magazin -> Mixul completează 3/3 fără economii inventate
  const partialOffers = [
    mkOffer('p1', prodMilk.id, auchan, 7.0),
    mkOffer('p2', prodOil.id, auchan, 8.0),
    mkOffer('p3', prodPasta.id, mega, 6.0),
  ];
  const cmpCoverage = computeBasketComparison({
    items: items1,
    retailers: [auchan, mega],
    offers: partialOffers,
    city: 'București',
  });
  assert.ok(cmpCoverage.bestStoreMix);
  assert.equal(cmpCoverage.bestStoreMix.improvesCoverage, true);
  assert.equal(cmpCoverage.bestStoreMix.coveredItemsCount, 3);
  assert.equal(cmpCoverage.bestStoreMix.bestSingleStoreCoveredCount, 2);
  assert.equal(cmpCoverage.bestStoreMix.savingsVsBestSingleStore, 0);

  const threeStoreCoverage = computeBasketComparison({
    items: items1,
    retailers: [auchan, mega, carrefour],
    offers: [
      mkOffer('o-cap-1', prodMilk.id, auchan, 8.0),
      mkOffer('o-cap-2', prodOil.id, mega, 7.0),
      mkOffer('o-cap-3', prodPasta.id, carrefour, 6.0),
    ],
    city: 'București',
  });
  assert.ok(threeStoreCoverage.bestStoreMix);
  assert.equal(threeStoreCoverage.bestStoreMix.stops.length, 2);
  assert.equal(threeStoreCoverage.bestStoreMix.coveredItemsCount, 2);

  // Scenariul 5: Magazin exclusiv online fără reguli de livrare NU trebuie inclus în mix doar pentru un produs ieftin (în modul „all”)
  const offersNoRuleOnline = [
    ...offers1.slice(0, 6), // Auchan & Mega acoperă tot
    mkOffer('o-fr-cheap', prodPasta.id, freshful, 1.99, 'delivery'),
  ];
  const cmpNoRuleOnline = computeBasketComparison({
    items: items1,
    retailers: [auchan, mega, freshful],
    offers: offersNoRuleOnline,
    city: 'București',
  });
  assert.ok(cmpNoRuleOnline.bestStoreMix);
  assert.equal(
    cmpNoRuleOnline.bestStoreMix.stops.some((s) => s.retailer.slug === 'freshful'),
    false,
    'Must not split to online-only store without delivery rules just for low item price'
  );
});

test('Mathematical cross-store product matcher & split canonical unification', async () => {
  const { computeProductMatchScore, computeBasketComparison } =
    await loadComparisonModule();

  const makeRetailer = (id, slug, name, supportsPhysical, supportsDelivery) => ({
    id,
    slug,
    name,
    logo_url: null,
    website_url: null,
    supports_physical: supportsPhysical,
    supports_delivery: supportsDelivery,
    is_active: true,
    updated_at: '2026-11-12T10:00:00Z',
  });

  const auchan = makeRetailer('ret-au', 'auchan', 'Auchan', true, true);
  const freshful = makeRetailer('ret-fr', 'freshful', 'Freshful', false, true);
  const sezamo = makeRetailer('ret-sz', 'sezamo', 'Sezamo', false, true);

  const mkOffer = (id, productId, retailer, price, channel = 'store') => ({
    id,
    product_id: productId,
    retailer_id: retailer.id,
    retailer_name: retailer.name,
    fulfillment_node_id: null,
    price,
    regular_price: price,
    promo_price: null,
    loyalty_price: null,
    promo_label: null,
    promo_requires_card: false,
    sgr_fee: null,
    currency: 'RON',
    unit_price: price,
    normalized_unit_price: price,
    normalized_unit_label: 'RON/l',
    sell_by_mode: 'unit',
    quantity_value: 1.5,
    quantity_unit: 'l',
    package_size: '1.5 l',
    product_url: null,
    image_url: null,
    fulfillment_channel: channel,
    city: 'București',
    availability: 'in_stock',
    stock_status: 'in_stock',
    observed_at: '2026-11-12T10:00:00Z',
    valid_until: null,
  });

  const pepsiTwist15Main = {
    id: 'p-twist-main',
    canonical_name: 'Pepsi Băutură carbogazoasă aromă de cola și suc de lămâie Twist 1.5l',
    brand: 'Pepsi',
    package_size: '1.5 L',
    quantity_value: 1500,
    quantity_unit: 'ml',
    image_url: null,
    category: 'Băuturi',
    subcategory: 'Răcoritoare',
    attributes: {},
    familyIds: ['fam-twist-main'],
  };

  const pepsiTwist15Sezamo = {
    id: 'p-twist-sezamo',
    canonical_name: 'Pepsi Twist Bautura racoritoare carbogazoasa pet',
    brand: 'Pepsi',
    package_size: '1,5 l',
    quantity_value: 1.5,
    quantity_unit: 'l',
    image_url: null,
    category: 'Băuturi',
    subcategory: 'Sucuri',
    attributes: {},
    familyIds: [], // Nelegat de nicio familie comună!
  };

  const pepsiTwistZero2L = {
    id: 'p-twist-zero-2l',
    canonical_name: 'Pepsi Băutură carbogazoasă aromă cola Twist Zero Zahăr 2l',
    brand: 'Pepsi',
    package_size: '2 L',
    quantity_value: 2000,
    quantity_unit: 'ml',
    image_url: null,
    category: 'Băuturi',
    subcategory: 'Răcoritoare',
    attributes: {},
    familyIds: ['fam-twist-zero'],
  };

  const pepsiTwistNoSugar2L = {
    id: 'p-twist-nosugar-2l',
    canonical_name: 'Pepsi Twist fără zahăr pet 2L',
    brand: 'Pepsi',
    package_size: '2 l',
    quantity_value: 2,
    quantity_unit: 'l',
    image_url: null,
    category: 'Băuturi',
    subcategory: 'Răcoritoare',
    attributes: {},
    familyIds: [],
  };

  const pepsiTwistRegular2L = {
    id: 'p-twist-reg-2l',
    canonical_name: 'Pepsi Twist 2L',
    brand: 'Pepsi',
    package_size: '2 l',
    quantity_value: 2000,
    quantity_unit: 'ml',
    image_url: null,
    category: 'Băuturi',
    subcategory: 'Răcoritoare',
    attributes: {},
    familyIds: ['fam-twist-main'],
  };

  const pepsiRaspberry2L = {
    id: 'p-raspberry-2l',
    canonical_name: 'Pepsi Băutură carbogazoasă Raspberry 2l',
    brand: 'Pepsi',
    package_size: '2 l',
    quantity_value: 2000,
    quantity_unit: 'ml',
    image_url: null,
    category: 'Băuturi',
    subcategory: 'Răcoritoare',
    attributes: {},
    familyIds: ['fam-rasp'],
  };

  // 1) Split canonical twin 1.5L: trebuie marcat isCrossCanonicalExact = true, score >= 0.72
  const twinScore = computeProductMatchScore(pepsiTwist15Main, pepsiTwist15Sezamo);
  assert.equal(twinScore.compatible, true);
  assert.equal(twinScore.isCrossCanonicalExact, true, `Expected exact twin match, got ${JSON.stringify(twinScore)}`);
  assert.ok(twinScore.score >= 0.72);

  // 2) Unificare Zero Zahăr <-> fără zahăr
  const sugarFreeMatch = computeProductMatchScore(pepsiTwistZero2L, pepsiTwistNoSugar2L);
  assert.equal(sugarFreeMatch.compatible, true);
  assert.equal(sugarFreeMatch.isCrossCanonicalExact, true);

  // 3) Reject: Zero Zahăr vs cu zahăr normal -> incompatible
  const sugarConflict = computeProductMatchScore(pepsiTwistZero2L, pepsiTwistRegular2L);
  assert.equal(sugarConflict.compatible, false);
  assert.equal(sugarConflict.score, 0);

  // 4) Reject: aromă diferită (Twist vs Raspberry) -> nu poate fi exact twin și ar trebui incompatibil
  const flavorConflict = computeProductMatchScore(pepsiTwist15Main, pepsiRaspberry2L);
  assert.equal(flavorConflict.isCrossCanonicalExact, false);
  assert.equal(flavorConflict.compatible, false);

  // 5) computeBasketComparison trebuie să mapeze automat UUID-ul duplicat Sezamo ca 'exact'
  const cmpTwin = computeBasketComparison({
    items: [
      {
        id: 'item-twist-15',
        name: pepsiTwist15Main.canonical_name,
        quantity: 1,
        checked: false,
        productId: pepsiTwist15Main.id,
      },
    ],
    retailers: [auchan, freshful, sezamo],
    offers: [
      mkOffer('o-au', pepsiTwist15Main.id, auchan, 8.59, 'store'),
      mkOffer('o-fr', pepsiTwist15Main.id, freshful, 9.69, 'delivery'),
      mkOffer('o-sz', pepsiTwist15Sezamo.id, sezamo, 9.79, 'online'),
    ],
    city: 'București',
    profilesById: new Map([
      [pepsiTwist15Main.id, pepsiTwist15Main],
      [pepsiTwist15Sezamo.id, pepsiTwist15Sezamo],
    ]),
  });

  const sezamoSummary = cmpTwin.retailerSummaries.find((s) => s.retailer.slug === 'sezamo');
  const freshfulSummary = cmpTwin.retailerSummaries.find((s) => s.retailer.slug === 'freshful');
  assert.ok(sezamoSummary, 'Sezamo summary must exist');
  assert.equal(sezamoSummary.exactCoveredCount, 1, 'Split duplicate UUID at Sezamo must count as EXACT match');
  assert.equal(sezamoSummary.equivalentCoveredCount, 0);
  assert.equal(sezamoSummary.coveredCount, 1);
  assert.equal(sezamoSummary.confirmedSubtotal, 9.79);
  assert.ok(
    freshfulSummary &&
      freshfulSummary.exactCoveredCount === 1 &&
      freshfulSummary.confirmedSubtotal === 9.69
  );
});

test('Loyalty card calculation mode (CONNECT, MyCLUB, Lidl Plus, PENNY Card, 2+1, mix)', async () => {
  const {
    computeLoyaltyLineTotal,
    resolveLoyaltyProgramName,
    computeBasketComparison,
  } = await loadComparisonModule();

  assert.equal(resolveLoyaltyProgramName('Lidl', 'Lidl Plus · -20%'), 'Lidl Plus');
  assert.equal(resolveLoyaltyProgramName('Sezamo', 'Preț Sezamo Xtra'), 'Sezamo Xtra');
  assert.equal(resolveLoyaltyProgramName('Penny', 'PENNY Card'), 'PENNY Card');
  assert.equal(resolveLoyaltyProgramName('Kaufland', 'Kaufland Card'), 'Kaufland Card');

  // 1) Flat % discount cu CONNECT chiar dacă loyalty_price lipsește din feed
  const connectFlat = {
    price: 10.0,
    regular_price: 10.0,
    promo_price: null,
    loyalty_price: null,
    promo_label: 'CONNECT -20%',
    promo_requires_card: true,
    retailer_name: 'Mega Image',
  };
  assert.deepEqual(computeLoyaltyLineTotal(connectFlat, 2), {
    loyaltyLineTotal: 16.0,
    loyaltySavings: 4.0,
    hasLoyaltyOffer: true,
  });

  // 2) Promo 2+1 pe card fără loyalty_price precalculat
  const lidl2Plus1 = {
    price: 6.0,
    regular_price: 6.0,
    promo_price: null,
    loyalty_price: null,
    promo_label: 'Lidl Plus · 2+1',
    promo_requires_card: true,
    retailer_name: 'Lidl',
  };
  assert.deepEqual(computeLoyaltyLineTotal(lidl2Plus1, 1), {
    loyaltyLineTotal: null,
    loyaltySavings: 0,
    hasLoyaltyOffer: true,
  });
  assert.deepEqual(computeLoyaltyLineTotal(lidl2Plus1, 3), {
    loyaltyLineTotal: 12.0,
    loyaltySavings: 6.0,
    hasLoyaltyOffer: true,
  });

  // 3) computeBasketComparison cu useLoyaltyCards=true recalculează clasamentul + mixul fără dublă scădere
  const makeRetailer = (id, slug, name) => ({
    id,
    slug,
    name,
    logo_url: null,
    website_url: null,
    supports_physical: true,
    supports_delivery: false,
    is_active: true,
    updated_at: '2026-11-12T10:00:00Z',
  });
  const mega = makeRetailer('r-mi', 'mega-image', 'Mega Image');
  const auchan = makeRetailer('r-au', 'auchan', 'Auchan');

  const prodA = {
    id: 'p-lapte',
    canonical_name: 'Napolact Lapte BIO 1.5L',
    brand: 'Napolact',
    package_size: '1.5 L',
    quantity_value: 1500,
    quantity_unit: 'ml',
    attributes: {},
    familyIds: [],
  };
  const prodB = {
    id: 'p-unt',
    canonical_name: 'Unt 82% 200g',
    brand: 'Lurpak',
    package_size: '200 g',
    quantity_value: 200,
    quantity_unit: 'g',
    attributes: {},
    familyIds: [],
  };

  const mkOffer = (id, productId, retailer, price, loyPrice, promoLabel) => ({
    id,
    product_id: productId,
    retailer_id: retailer.id,
    retailer_name: retailer.name,
    fulfillment_node_id: null,
    price,
    regular_price: price,
    promo_price: null,
    loyalty_price: loyPrice,
    promo_label: promoLabel,
    promo_requires_card: Boolean(loyPrice !== null || promoLabel),
    sgr_fee: null,
    currency: 'RON',
    unit_price: price,
    normalized_unit_price: price,
    normalized_unit_label: 'RON/u',
    sell_by_mode: 'unit',
    quantity_value: 1,
    quantity_unit: 'u',
    package_size: '1 buc',
    product_url: null,
    image_url: null,
    fulfillment_channel: 'store',
    city: 'București',
    availability: 'in_stock',
    stock_status: 'in_stock',
    observed_at: '2026-11-12T10:00:00Z',
    valid_until: null,
  });

  // Standard: Auchan e mai ieftin (17 + 14 = 31) vs Mega (19 + 16 = 35).
  // Cu carduri: Mega are CONNECT (19->13, -6 RON) => Mega devine 13 + 16 = 29; Auchan are MyCLUB pe prodB (14->11, -3 RON) => 17 + 11 = 28!
  // Mix cu carduri: Mega prodA (13) + Auchan prodB (11) = 24 RON (vs 28 RON cel mai bun magazin!)
  const offers = [
    mkOffer('o1', prodA.id, mega, 19.0, 13.0, 'CONNECT -31%'),
    mkOffer('o2', prodB.id, mega, 16.0, null, null),
    mkOffer('o3', prodA.id, auchan, 17.0, null, null),
    mkOffer('o4', prodB.id, auchan, 14.0, 11.0, '21% REDUCERE cu CARD MyCLUB'),
  ];

  const items = [
    { id: 'i-a', name: prodA.canonical_name, quantity: 1, checked: false, productId: prodA.id },
    { id: 'i-b', name: prodB.canonical_name, quantity: 1, checked: false, productId: prodB.id },
  ];

  const cmpLoyalty = computeBasketComparison({
    items,
    retailers: [mega, auchan],
    offers,
    city: 'București',
    profilesById: new Map([
      [prodA.id, prodA],
      [prodB.id, prodB],
    ]),
    useLoyaltyCards: true,
  });

  const megaSum = cmpLoyalty.retailerSummaries.find((s) => s.retailer.slug === 'mega-image');
  const auchanSum = cmpLoyalty.retailerSummaries.find((s) => s.retailer.slug === 'auchan');
  assert.equal(megaSum.confirmedSubtotal, 29.0);
  assert.equal(megaSum.standardSubtotalWithoutLoyalty, 35.0);
  assert.equal(megaSum.potentialLoyaltySavings, 6.0);
  assert.equal(megaSum.estimatedTotalWithLoyalty, 29.0, 'Must not double-subtract loyalty savings');
  assert.equal(megaSum.loyaltyProgramName, 'Card CONNECT');

  assert.equal(auchanSum.confirmedSubtotal, 28.0);
  assert.equal(auchanSum.standardSubtotalWithoutLoyalty, 31.0);
  assert.equal(auchanSum.potentialLoyaltySavings, 3.0);
  assert.equal(auchanSum.loyaltyProgramName, 'Card MyCLUB');

  assert.ok(cmpLoyalty.bestStoreMix);
  assert.equal(cmpLoyalty.bestStoreMix.totalWithFees, 24.0);
  assert.equal(cmpLoyalty.bestStoreMix.potentialLoyaltySavings, 9.0);
  assert.equal(cmpLoyalty.bestStoreMix.estimatedTotalWithLoyalty, 24.0);
});

test('External EAN matching (skipCategoryCheck): Pepsi Max 2 L matches ONLY 2L sugar-free Pepsi, never Twist/Mango/500ml/2.5L', async () => {
  const { computeProductMatchScore } = await loadComparisonModule();

  const syntheticTargetWithQty = {
    id: 'ean-pepsi-max-2l',
    canonical_name: 'Pepsi Max 2 L',
    brand: 'Pepsi',
    package_size: '2 L',
    quantity_value: null,
    quantity_unit: null,
    attributes: {},
    familyIds: [],
  };

  const syntheticTargetInlineQty = {
    ...syntheticTargetWithQty,
    canonical_name: 'Pepsi Max 2L',
    package_size: null,
  };

  const exactZero2L = {
    id: 'prod-zero-2l',
    canonical_name: 'Pepsi Zero Zahar Bautura racoritoare carbogazoasa fara zahar pet',
    brand: 'Pepsi',
    package_size: '2 l',
    quantity_value: null,
    quantity_unit: null,
    category: 'Băcănie',
    subcategory: 'Zahăr și îndulcitori',
    attributes: {},
    familyIds: [],
  };

  const wrongVariants = [
    {
      id: 'prod-max-25l',
      canonical_name: 'Pepsi Băutură carbogazoasă Max zero zahăr 2.5l',
      brand: 'Pepsi',
      package_size: '2.5 L',
      category: 'Băuturi',
      subcategory: 'Băuturi carbogazoase',
      attributes: {},
      familyIds: [],
    },
    {
      id: 'prod-twist-zero-2l',
      canonical_name: 'Pepsi Băutură carbogazoasă aromă cola Twist Zero Zahăr 2l',
      brand: 'Pepsi',
      package_size: '2 L',
      category: 'Băuturi',
      subcategory: 'Băuturi carbogazoase',
      attributes: {},
      familyIds: [],
    },
    {
      id: 'prod-raspberry-2l',
      canonical_name: 'Pepsi Raspberry Bautura racoritoare carbogazoasa pet',
      brand: 'Pepsi',
      package_size: '2 l',
      category: 'Băuturi',
      subcategory: 'Băuturi răcoritoare',
      attributes: {},
      familyIds: [],
    },
    {
      id: 'prod-mango-330ml',
      canonical_name: 'Pepsi Max Mango bautura racoritoare carbogazoasa cu gust de mango',
      brand: 'Pepsi',
      package_size: '330 ml',
      category: 'Fructe și legume',
      subcategory: 'Fructe proaspete',
      attributes: {},
      familyIds: [],
    },
    {
      id: 'prod-regular-2l',
      canonical_name: 'Pepsi Băutură carbogazoasă aromă cola 2l',
      brand: 'Pepsi',
      package_size: '2 L',
      category: 'Băuturi',
      subcategory: 'Băuturi carbogazoase',
      attributes: {},
      familyIds: [],
    },
    {
      id: 'prod-max-2x2l',
      canonical_name: 'Pepsi Băutură carbogazoasă Max zero zahăr 2x2l',
      brand: 'Pepsi',
      package_size: '2x2 L',
      category: 'Băuturi',
      subcategory: 'Băuturi carbogazoase',
      attributes: {},
      familyIds: [],
    },
  ];

  for (const target of [syntheticTargetWithQty, syntheticTargetInlineQty]) {
    const matchRes = computeProductMatchScore(target, exactZero2L, { skipCategoryCheck: true });
    assert.equal(matchRes.compatible, true, `Should match Pepsi Zero Zahar 2L for ${target.canonical_name}`);
    assert.ok(matchRes.score > 0.4);

    for (const wrong of wrongVariants) {
      const res = computeProductMatchScore(target, wrong, { skipCategoryCheck: true });
      assert.equal(
        res.compatible,
        false,
        `Should reject incompatible variant ${wrong.canonical_name} (${wrong.package_size})`
      );
    }
  }
});

test('Fresh produce filter & brand-agnostic generic matching (e.g. Banane across all retailers)', async () => {
  const {
    isProcessedNonFreshProduce,
    matchesGenericTermCandidate,
    computeBasketComparison,
  } = await loadComparisonModule();

  // 1. Raionul Fructe proaspete respinge produsele procesate amestecate în DB
  const processedJunk = [
    'Casali Cioco Banana XL Baton din ciocolata cu interior spumos de banane',
    'Biskids ECO Biscuiti cu banane (de la 6 luni) fara zahar',
    'Pepsi Max Mango bautura racoritoare carbogazoasa cu gust de mango',
    'Yutto Chipsuri de banane',
    'Trigon cu mere',
    'Agros suc ananas',
    'Babybio ECO Pouch mere, caise si banane',
  ];
  for (const name of processedJunk) {
    assert.equal(isProcessedNonFreshProduce(name), true, `Should reject processed item: ${name}`);
  }

  const realProduce = [
    'Banane (bucata)',
    'Ciorchine de banane Dole',
    "Nature's Promise Bio Banane bio",
    'Banane minim 1kg maxim 1.3kg',
    'Mere Golden premium (bucata)',
    'Portocale 1kg',
    'Ciorchine de baby banane',
  ];
  for (const name of realProduce) {
    assert.equal(isProcessedNonFreshProduce(name), false, `Should keep fresh produce: ${name}`);
    assert.equal(
      matchesGenericTermCandidate('Banane', name).matches,
      name.toLowerCase().includes('banan'),
      `Generic Banane check for ${name}`
    );
  }

  // 2. Termenul generic „Banane” compară automat toate magazinele indiferent de firmă
  const sezamo = { id: 'ret-sez', name: 'Sezamo', slug: 'sezamo', supports_delivery: true, supports_physical: false };
  const freshful = { id: 'ret-fr', name: 'Freshful', slug: 'freshful', supports_delivery: true, supports_physical: false };
  const mega = { id: 'ret-mi', name: 'Mega Image', slug: 'mega-image', supports_delivery: true, supports_physical: true };

  const genericIds = ['prod-ban-sez', 'prod-ban-fr', 'prod-ban-mi'];
  const offers = [
    {
      id: 'off-ban-sez',
      product_id: 'prod-ban-sez',
      retailer_id: 'ret-sez',
      retailer_name: 'Sezamo',
      price: 7.69,
      regular_price: 7.69,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      package_size: 'cca 1,1 kg',
      normalized_unit_price: 6.99,
      normalized_unit_label: 'RON/kg',
      sgr_fee: null,
      fulfillment_channel: 'online',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: new Date().toISOString(),
      valid_until: null,
      product_url: null,
      image_url: null,
    },
    {
      id: 'off-ban-fr',
      product_id: 'prod-ban-fr',
      retailer_id: 'ret-fr',
      retailer_name: 'Freshful',
      price: 10.91,
      regular_price: 10.91,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      package_size: '1 kg',
      normalized_unit_price: 10.91,
      normalized_unit_label: 'RON/kg',
      sgr_fee: null,
      fulfillment_channel: 'delivery',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: new Date().toISOString(),
      valid_until: null,
      product_url: null,
      image_url: null,
    },
    {
      id: 'off-ban-mi',
      product_id: 'prod-ban-mi',
      retailer_id: 'ret-mi',
      retailer_name: 'Mega Image',
      price: 9.49,
      regular_price: 9.49,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      package_size: '1000 g',
      normalized_unit_price: 9.49,
      normalized_unit_label: 'RON/kg',
      sgr_fee: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: new Date().toISOString(),
      valid_until: null,
      product_url: null,
      image_url: null,
    },
  ];

  const cmp = computeBasketComparison({
    items: [{ id: 'generic-banane', name: 'Banane', quantity: 1, isCustom: true, productId: null }],
    retailers: [sezamo, freshful, mega],
    offers,
    genericProductIdsByItemId: new Map([['generic-banane', genericIds]]),
  });

  assert.equal(cmp.coveredItemsCount, 1);
  assert.equal(cmp.manualItemsCount, 0);
  assert.equal(cmp.itemStatuses[0].status, 'has_offers');
  assert.equal(cmp.itemStatuses[0].offers.length, 3);
  for (const s of cmp.retailerSummaries) {
    assert.equal(s.coveredCount, 1, `Retailer ${s.retailer.name} should match generic Banane regardless of brand`);
  }
});

test('Produce sell rules (per_kg vs per_buc) & unit price anticipation (Avocado, Banane Freshful/Sezamo, Mango != Mangold)', async () => {
  const { estimateProductUnitPricing, matchesGenericTermCandidate } = await loadComparisonModule();

  // Mango vs Mangold nu se amestecă
  assert.equal(matchesGenericTermCandidate('Mango', 'Nasul Rosu ECO Mangold').matches, false);
  assert.equal(matchesGenericTermCandidate('Mango', 'ECO Mango Osteen').matches, true);

  // Freshful interval minim/maxim -> anticipează exact 9.49 lei/kg
  const frBan = estimateProductUnitPricing(8.07, '700 g', 'Banane minim 700g maxim 1kg');
  assert.equal(frBan.sellMode, 'per_kg');
  assert.equal(frBan.estimatedPerKg, 9.49);
  assert.equal(frBan.estimatedUnitLine, '~9.49 lei/kg');

  // Sezamo cca 1,1 kg -> ~6.99 lei/kg
  const sezBan = estimateProductUnitPricing(7.69, 'cca 1,1 kg', 'Ciorchine de banane');
  assert.equal(sezBan.sellMode, 'per_kg');
  assert.equal(sezBan.estimatedPerKg, 6.99);

  // Avocado la bucată vs la caserolă/pachet vs la kg
  const lidlAvo = estimateProductUnitPricing(3.49, 'per buc.', 'Avocado');
  assert.equal(lidlAvo.sellMode, 'per_buc');
  assert.equal(lidlAvo.estimatedPerBuc, 3.49);
  assert.equal(lidlAvo.estimatedUnitLine, 'La bucată · 3.49 lei/buc');

  const sez4Pack = estimateProductUnitPricing(19.99, '1 buc', 'Avocado ready to eat pachet 4 bucati');
  assert.equal(sez4Pack.sellMode, 'per_buc');
  assert.equal(sez4Pack.estimatedPerBuc, 5.0);
  assert.equal(sez4Pack.estimatedUnitLine, '4 buc. · 5.00 lei/buc');

  const sezBag = estimateProductUnitPricing(15.99, '0,7 kg', 'Avocado plasa');
  assert.equal(sezBag.sellMode, 'per_kg');
  assert.equal(sezBag.estimatedPerKg, 22.84);
});

test('Audit fixes: Online channel skips store-only retailers, selective loyalty wallet & caserolă pricing', async () => {
  const { computeBasketComparison, estimateProductUnitPricing } = await loadComparisonModule();

  // 1. Caserolă sell rule (Lidl Afine per caserolă)
  const casEst = estimateProductUnitPricing(8.99, 'per caserolă', 'Afine');
  assert.equal(casEst.sellMode, 'per_buc');
  assert.equal(casEst.sellRuleBadge, 'La caserolă');
  assert.equal(casEst.estimatedUnitLine, 'La caserolă · 8.99 lei/caserolă');

  // 2. Online channel excludes retailers whose DB offers exist ONLY on `store` channel
  const freshful = { id: 'ret-fr', name: 'Freshful', slug: 'freshful', supports_delivery: true, supports_physical: false };
  const mega = { id: 'ret-mi', name: 'Mega Image', slug: 'mega-image', supports_delivery: true, supports_physical: true };
  const lidl = { id: 'ret-ld', name: 'Lidl', slug: 'lidl', supports_delivery: false, supports_physical: true };

  const itemA = { id: 'item-a', name: 'Cafea', quantity: 1, productId: 'prod-a' };
  const offers = [
    {
      id: 'off-fr',
      product_id: 'prod-a',
      retailer_id: 'ret-fr',
      retailer_name: 'Freshful',
      price: 25,
      regular_price: 25,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      package_size: '500 g',
      normalized_unit_price: 50,
      normalized_unit_label: 'RON/kg',
      sgr_fee: null,
      fulfillment_channel: 'delivery',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: new Date().toISOString(),
      valid_until: null,
      product_url: null,
      image_url: null,
    },
    {
      id: 'off-mi',
      product_id: 'prod-a',
      retailer_id: 'ret-mi',
      retailer_name: 'Mega Image',
      price: 24,
      regular_price: 24,
      promo_price: null,
      loyalty_price: 19,
      promo_label: '-20% cu card CONNECT',
      promo_requires_card: true,
      package_size: '500 g',
      normalized_unit_price: 48,
      normalized_unit_label: 'RON/kg',
      sgr_fee: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: new Date().toISOString(),
      valid_until: null,
      product_url: null,
      image_url: null,
    },
    {
      id: 'off-ld',
      product_id: 'prod-a',
      retailer_id: 'ret-ld',
      retailer_name: 'Lidl',
      price: 20,
      regular_price: 20,
      promo_price: null,
      loyalty_price: 17,
      promo_label: 'Lidl Plus',
      promo_requires_card: true,
      package_size: '500 g',
      normalized_unit_price: 40,
      normalized_unit_label: 'RON/kg',
      sgr_fee: null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      stock_status: 'in_stock',
      observed_at: new Date().toISOString(),
      valid_until: null,
      product_url: null,
      image_url: null,
    },
  ];

  const onlineCmp = computeBasketComparison({
    items: [itemA],
    retailers: [freshful, mega, lidl],
    offers,
    channelFilter: 'online',
  });
  assert.deepEqual(
    onlineCmp.retailerSummaries.map((s) => s.retailer.slug),
    ['freshful'],
    'Online mode must exclude store-only Mega Image even when supports_delivery=true'
  );

  // 3. Selective loyalty card wallet: only Lidl Plus active, Card CONNECT NOT owned
  const selectiveCmp = computeBasketComparison({
    items: [itemA],
    retailers: [mega, lidl],
    offers,
    channelFilter: 'all',
    useLoyaltyCards: true,
    allowedLoyaltyPrograms: ['Lidl Plus'],
  });
  const megaSum = selectiveCmp.retailerSummaries.find((s) => s.retailer.slug === 'mega-image');
  const lidlSum = selectiveCmp.retailerSummaries.find((s) => s.retailer.slug === 'lidl');
  assert.equal(megaSum.confirmedSubtotal, 24, 'Unowned CONNECT card must not discount Mega Image');
  assert.equal(lidlSum.confirmedSubtotal, 17, 'Owned Lidl Plus card must discount Lidl');
});

test('Demo baskets & partner outbound click UTM/summary measurement', async () => {
  const demoMod = await loadTsModule('src/constants/demo-baskets.ts');
  const storeMod = await loadTsModule('src/lib/open-external-store.ts', {
    'expo-web-browser': {},
    'react-native': { Linking: {}, Platform: { OS: 'web' } },
  });

  // 1. Validate the 2 curated Demo Baskets
  const demoLists = demoMod.buildDemoShoppingLists('2026-11-12T10:00:00Z');
  assert.equal(demoLists.length, 2);
  assert.equal(demoLists[0].name, 'Coș Săptămânal · Demo');
  assert.equal(demoLists[1].name, 'Mic Dejun & Fidelitate · Demo');
  assert.equal(demoLists[0].items.length, 6);
  assert.equal(demoLists[1].items.length, 5);
  assert.equal(
    demoLists[0].items.some((it) => it.name === 'Banane' && Boolean(it.productId)),
    true,
    'Weekly demo basket includes canonical Banane produce'
  );

  // 1b. Existing sample lists are not added to real user storage by default
  const existingCustomList = {
    id: 'user-list-1',
    name: 'Lista mea',
    createdAt: '2026-11-10T10:00:00Z',
    updatedAt: '2026-11-10T10:00:00Z',
    items: [{ id: 'x1', name: 'Apa', quantity: 1, checked: false }],
  };
  const mergedFirstOpen = demoMod.mergeDemoListsIntoSavedLists(
    [existingCustomList],
    undefined,
    '2026-11-12T10:00:00Z'
  );
  assert.equal(mergedFirstOpen.seededNow, false);
  assert.equal(mergedFirstOpen.lists.length, 1);
  assert.equal(mergedFirstOpen.lists[0].id, 'user-list-1');

  // Remove only untouched sample baskets during migration; preserve edited lists.
  const migratedSamples = demoMod.mergeDemoListsIntoSavedLists(
    [existingCustomList, ...demoLists],
    1,
    '2026-11-12T10:00:00Z'
  );
  assert.deepEqual(migratedSamples.lists.map((list) => list.id), ['user-list-1']);
  const editedDemo = {
    ...demoLists[0],
    items: demoLists[0].items.map((item, index) =>
      index === 0 ? { ...item, quantity: item.quantity + 1 } : item
    ),
  };
  const preservedEditedDemo = demoMod.mergeDemoListsIntoSavedLists([editedDemo], 1);
  assert.equal(preservedEditedDemo.lists.length, 1);
  assert.equal(preservedEditedDemo.lists[0].items[0].quantity, editedDemo.items[0].quantity);

  // A user who has completed the migration is not modified on later loads.
  const mergedAfterSeed = demoMod.mergeDemoListsIntoSavedLists(
    [existingCustomList, ...demoLists],
    demoMod.CURRENT_DEMO_SEED_VERSION
  );
  assert.equal(mergedAfterSeed.seededNow, false);
  assert.equal(mergedAfterSeed.lists.length, 3);

  // 2. Validate UTM attribution appending & preservation of existing params
  const urlFreshful = storeMod.appendBeavyAttributionParams(
    'https://www.freshful.ro/produse?ref=home#top',
    {
      retailerName: 'Freshful',
      retailerSlug: 'freshful',
      source: 'comparison_list',
    }
  );
  assert.ok(urlFreshful.includes('ref=home'), 'Preserves original query param');
  assert.ok(urlFreshful.includes('utm_source=beavy'));
  assert.ok(urlFreshful.includes('utm_medium=partner_demo'));
  assert.ok(urlFreshful.includes('utm_campaign=comparison_list'));
  assert.ok(urlFreshful.includes('utm_content=freshful'));
  assert.ok(urlFreshful.endsWith('#top'), 'Preserves URL hash');

  // 3. Validate partner click aggregation summary
  const summary = storeMod.summarizeOutboundClicks([
    {
      id: 'c1',
      clickedAt: '2026-11-12T09:00:00Z',
      retailerName: 'Freshful',
      retailerSlug: 'freshful',
      source: 'comparison_list',
      itemsCount: 6,
      estimatedValueRon: 102.5,
      targetUrl: urlFreshful,
    },
    {
      id: 'c2',
      clickedAt: '2026-11-12T10:15:00Z',
      retailerName: 'Freshful',
      retailerSlug: 'freshful',
      source: 'store_mode',
      itemsCount: 6,
      estimatedValueRon: 98.25,
      targetUrl: urlFreshful,
    },
    {
      id: 'c3',
      clickedAt: '2026-11-12T09:30:00Z',
      retailerName: 'Sezamo',
      retailerSlug: 'sezamo',
      source: 'store_breakdown',
      itemsCount: 5,
      estimatedValueRon: 54.1,
      targetUrl: 'https://www.sezamo.ro/?utm_source=beavy',
    },
  ]);

  assert.equal(summary.totalClicks, 3);
  assert.equal(summary.uniqueRetailersCount, 2);
  assert.equal(summary.totalReferredRon, 254.85);
  assert.equal(summary.byRetailer[0].retailerName, 'Freshful');
  assert.equal(summary.byRetailer[0].clicks, 2);
  assert.equal(summary.byRetailer[0].referredRon, 200.75);
  assert.equal(summary.byRetailer[0].lastClickedAt, '2026-11-12T10:15:00Z');
  assert.equal(summary.byRetailer[1].retailerName, 'Sezamo');
  assert.equal(summary.byRetailer[1].clicks, 1);
});

test('Private-label ownership isolation: Mega Image store brands never leak into Sezamo or match Mega Duo', async () => {
  const {
    computeBasketComparison,
    computeProductMatchScore,
    isCompatibleEquivalentProduct,
    resolvePrivateLabelOwnerRetailer,
  } = await loadComparisonModule();

  const mkRetailer = (id, slug, name) => ({
    id,
    slug,
    name,
    logo_url: null,
    website_url: null,
    supports_physical: slug !== 'sezamo',
    supports_delivery: true,
    is_active: true,
    updated_at: '2026-11-12T10:00:00Z',
  });

  const mega = mkRetailer('ret-mi', 'mega-image', 'Mega Image');
  const sezamo = mkRetailer('ret-sz', 'sezamo', 'Sezamo');

  const megaSpeculoos = {
    id: 'pl-mega-speculoos',
    canonical_name: 'MEGA Biscuiti Speculoos 500g',
    brand: 'MEGA',
    package_size: '500 g',
    quantity_value: 500,
    quantity_unit: 'g',
    category: 'Dulciuri și gustări',
    subcategory: 'Biscuiți, napolitane și prăjituri',
    attributes: { is_private_label: true },
    familyIds: [],
  };

  const gullonMegaDuo = {
    id: 'nat-gullon-megaduo',
    canonical_name: 'Gullon Biscuiți sandwich cu cremă de ciocolată Mega Duo 500g',
    brand: 'Gullon',
    package_size: '500 g',
    quantity_value: 500,
    quantity_unit: 'g',
    category: 'Dulciuri și gustări',
    subcategory: 'Biscuiți, napolitane și prăjituri',
    attributes: {},
    familyIds: [],
  };

  const megaHumus = {
    id: 'pl-mega-humus',
    canonical_name: 'Mega Apetit Humus cu topping ciuperci 200g',
    brand: 'Mega Apetit',
    package_size: '200 g',
    quantity_value: 200,
    quantity_unit: 'g',
    category: 'Mezeluri, brânzeturi și aperitive',
    subcategory: 'Aperitive',
    attributes: { is_private_label: true },
    familyIds: [],
  };

  const rawMushrooms = {
    id: 'nat-ciuperci',
    canonical_name: 'Ciuperci Portobello 200g',
    brand: null,
    package_size: '200 g',
    quantity_value: 200,
    quantity_unit: 'g',
    category: 'Mezeluri, brânzeturi și aperitive',
    subcategory: 'Aperitive',
    attributes: {},
    familyIds: [],
  };

  const tasteCoolHumus = {
    id: 'sz-humus',
    canonical_name: 'Taste Cool Humus cu ciuperci 200g',
    brand: 'Taste Cool',
    package_size: '200 g',
    quantity_value: 200,
    quantity_unit: 'g',
    category: 'Mezeluri, brânzeturi și aperitive',
    subcategory: 'Aperitive',
    attributes: {},
    familyIds: [],
  };

  // 1. Ownership detection
  assert.equal(resolvePrivateLabelOwnerRetailer(megaSpeculoos), 'mega-image');
  assert.equal(resolvePrivateLabelOwnerRetailer(megaHumus), 'mega-image');
  assert.equal(resolvePrivateLabelOwnerRetailer(gullonMegaDuo), null);

  // 2. Brand fallback never matches "MEGA" to "Gullon ... Mega Duo"
  const scoreMegaVsGullon = computeProductMatchScore(megaSpeculoos, gullonMegaDuo);
  assert.equal(scoreMegaVsGullon.brandMatch, false);
  assert.equal(scoreMegaVsGullon.isCrossCanonicalExact, false);

  // 3. Dish-type food guard blocks "Humus cu ciuperci" -> "Ciuperci Portobello"
  assert.equal(
    isCompatibleEquivalentProduct(megaHumus, rawMushrooms, {
      allowSameCategoryWithoutFamily: true,
    }),
    false
  );

  // 4. Basket comparison in standard mode does NOT put Mega private-label items into Sezamo cart
  const mkOffer = (id, productId, retailer, price) => ({
    id,
    product_id: productId,
    retailer_id: retailer.id,
    retailer_name: retailer.name,
    price,
    regular_price: price,
    promo_price: null,
    loyalty_price: null,
    promo_label: null,
    promo_requires_card: false,
    package_size: '500 g',
    normalized_unit_price: price,
    normalized_unit_label: 'RON/buc',
    sgr_fee: null,
    fulfillment_channel: retailer.slug === 'sezamo' ? 'delivery' : 'store',
    city: 'București',
    availability: 'in_stock',
    stock_status: 'in_stock',
    observed_at: '2026-11-12T10:00:00Z',
    valid_until: null,
    product_url: null,
    image_url: null,
  });

  const cmp = computeBasketComparison({
    items: [
      { id: 'i1', productId: megaSpeculoos.id, name: megaSpeculoos.canonical_name, quantity: 1, checked: false },
      { id: 'i2', productId: megaHumus.id, name: megaHumus.canonical_name, quantity: 1, checked: false },
    ],
    retailers: [mega, sezamo],
    offers: [
      mkOffer('o1', megaSpeculoos.id, mega, 12.29),
      mkOffer('o2', megaHumus.id, mega, 12.21),
      mkOffer('o3', gullonMegaDuo.id, sezamo, 24.99),
      mkOffer('o4', tasteCoolHumus.id, sezamo, 6.89),
      // Even if a rogue/mismatched Mega PL offer were linked to Sezamo, lookup blocks it
      mkOffer('o5', megaSpeculoos.id, sezamo, 12.29),
    ],
    profilesById: new Map([
      [megaSpeculoos.id, megaSpeculoos],
      [gullonMegaDuo.id, gullonMegaDuo],
      [megaHumus.id, megaHumus],
      [rawMushrooms.id, rawMushrooms],
      [tasteCoolHumus.id, tasteCoolHumus],
    ]),
    equivalentIdsByProductId: new Map([[megaHumus.id, [tasteCoolHumus.id]]]),
    strategy: 'standard',
    includeEquivalents: true,
    city: 'București',
  });

  const megaSummary = cmp.retailerSummaries.find((s) => s.retailer.slug === 'mega-image');
  const sezamoSummary = cmp.retailerSummaries.find((s) => s.retailer.slug === 'sezamo');
  assert.equal(megaSummary.coveredCount, 2);
  assert.equal(sezamoSummary.coveredCount, 0, 'Sezamo must NOT absorb Mega Image private labels');
  assert.equal(cmp.bestStoreMix, null, 'Multi-Store Mix must NOT route Mega PL into Sezamo');
});
