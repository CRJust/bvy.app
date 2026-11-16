#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCanonicalSignature,
  buildCanonicalSyncSql,
  buildCompactIngestBatches,
  deduplicateFreshfulItems,
  extractFreshfulRecord,
  inferBeavyCategoryAndFamily,
  isCoreSupermarketItem,
  normalizeBrandDisplay,
  reconcileFreshfulWithCatalog,
} from './lib/canonical-catalog.mjs';

test('Freshful extraction: brand normalization, promo/loyalty pricing, fat ranges, SI quantities', () => {
  assert.equal(normalizeBrandDisplay('MĂCELĂRIA GHIȚĂ'), 'Măcelăria Ghiță');
  assert.equal(normalizeBrandDisplay('No Brand'), null);

  const rec = extractFreshfulRecord(
    {
      code: '100003632',
      sku: '100003632',
      name: 'Lapte de la vacă 3.8-4.1% grăsime, 1l',
      slug: '100003632-laptaria-cu-caimac-lapte-de-la-vaca-3-8-4-1-grasime-1l',
      brand: 'Lăptăria cu caimac',
      price: 11.99,
      originalPrice: 13.99,
      geniusPrice: 10.99,
      unitPriceLabel: '11,99 Lei/l',
      isAvailable: true,
      tags: [{ type: 'NoE', text: 'Fara E-uri' }, { type: 'MadeInRomania', text: 'Made In Romania' }],
      image: {
        extralarge: { default: 'https://cdn.freshful.ro/media/cache/sylius_shop_product_original/ab/cd/test.jpg' },
      },
    },
    {
      categoryName: 'Lapte, smântână și brânză proaspătă',
      categorySlug: '401-lapte-smantana-si-branza-proaspata',
      externalCategoryPath: 'Lactate & ouă > Lapte, smântână și brânză proaspătă',
      page: 1,
    }
  );

  assert.equal(rec.source_product_id, '100003632');
  assert.equal(rec.brand, 'Lăptăria cu caimac');
  assert.equal(rec.canonical_candidate_name, 'Lăptăria cu caimac Lapte de la vacă 3.8-4.1% grăsime, 1l');
  assert.equal(rec.package_size, '1 L');
  assert.equal(rec.quantity_value, 1000);
  assert.equal(rec.quantity_unit, 'ml');
  assert.equal(rec.fat_percentage_min, 3.8);
  assert.equal(rec.fat_percentage_max, 4.1);
  // Mod implicit (catalog canonic pur): zero prețuri stocate
  assert.equal(rec.price, null);
  assert.equal(rec.regular_price, null);
  assert.equal(rec.promo_price, null);
  assert.equal(rec.loyalty_price, null);
  assert.equal(rec.normalized_unit_price, null);
  assert.equal(rec.normalized_unit_label, null);
  assert.equal(rec.made_in_romania, true);

  const recWithPrices = extractFreshfulRecord(
    {
      code: '100003632',
      sku: '100003632',
      name: 'Lapte de la vacă 3.8-4.1% grăsime, 1l',
      price: 11.99,
      originalPrice: 13.99,
      geniusPrice: 10.99,
    },
    { includePrices: true }
  );
  assert.equal(recWithPrices.price, 11.99);
  assert.equal(recWithPrices.regular_price, 13.99);
  assert.equal(recWithPrices.promo_price, 11.99);
  assert.equal(recWithPrices.loyalty_price, 10.99);
  assert.equal(recWithPrices.normalized_unit_price, 11.99);
  assert.equal(recWithPrices.normalized_unit_label, 'RON/L');
});

test('Freshful deduplication: merges SKU & sponsored overlap while preserving distinct fat% and sizes', () => {
  const sponsoredDup = extractFreshfulRecord({
    sku: '100030286',
    name: 'Lapte din inima Ardealului 1.5% grăsime 1l',
    brand: 'Napolact',
    price: 8.99,
    sponsored: true,
    isAvailable: true,
  }, { page: 1 });
  const organicDup = extractFreshfulRecord({
    sku: '100030286',
    name: 'Lapte din inima Ardealului 1.5% grăsime 1l',
    brand: 'Napolact',
    price: 8.99,
    sponsored: false,
    isAvailable: true,
  }, { page: 2 });
  const intraCanonicalDup = extractFreshfulRecord({
    sku: '100030286-ALT',
    name: 'Napolact Lapte din inima Ardealului 1,5% grăsime 1 L',
    brand: 'Napolact',
    price: 9.29,
    sponsored: false,
    isAvailable: true,
  }, { page: 2 });
  const distinctFat = extractFreshfulRecord({
    sku: '100030287',
    name: 'Lapte din inima Ardealului 3.5% grăsime 1l',
    brand: 'Napolact',
    price: 10.99,
    isAvailable: true,
  }, { page: 1 });

  assert.equal(buildCanonicalSignature(organicDup), buildCanonicalSignature(intraCanonicalDup));
  assert.notEqual(buildCanonicalSignature(organicDup), buildCanonicalSignature(distinctFat));

  const res = deduplicateFreshfulItems([sponsoredDup, organicDup, intraCanonicalDup, distinctFat]);
  assert.equal(res.stats.rawInputCount, 4);
  assert.equal(res.stats.tier1DuplicatesRemoved, 1);
  assert.equal(res.stats.tier2CanonicalMerges, 1);
  assert.equal(res.items.length, 2);
  const sku30286 = res.items.find((x) => x.source_product_id === '100030286');
  assert.equal(sku30286.sponsored, false);
  assert.deepEqual(sku30286.observed_pages, [1, 2]);
});

test('Canonical category inference & reconciliation guards false merges (Barista, Vitamin D3, Goat milk, Category path leakage)', () => {
  const cottageWithCream = extractFreshfulRecord({
    sku: '100031718',
    name: 'Mărgele de brânză cu smântână 180g',
    brand: 'Hochland',
    price: 7.39,
    isAvailable: true,
  }, { externalCategoryPath: 'Lactate & ouă > Lapte, smântână și brânză proaspătă' });
  const zuzuMilkWithPath = extractFreshfulRecord({
    sku: '100004014',
    name: 'Lapte 1.5% grăsime 1l',
    brand: 'Zuzu',
    price: 6.99,
    isAvailable: true,
  }, { externalCategoryPath: 'Lactate & ouă > Lapte, smântână și brânză proaspătă' });
  const nucetCreamWithPath = extractFreshfulRecord({
    sku: '100134490',
    name: 'Smântână 12% grăsime, 375g',
    brand: 'Nucet',
    price: 11.99,
    isAvailable: true,
  }, { externalCategoryPath: 'Lactate & ouă > Lapte, smântână și brânză proaspătă' });

  assert.equal(inferBeavyCategoryAndFamily(cottageWithCream).categorySlug, 'branzeturi');
  assert.equal(inferBeavyCategoryAndFamily(zuzuMilkWithPath).categorySlug, 'lapte');
  assert.equal(inferBeavyCategoryAndFamily(nucetCreamWithPath).categorySlug, 'unt-smantana');

  const existingCatalog = [
    {
      id: 'prod-napolact-semideg',
      canonical_name: 'Napolact Lapte semidegresat 1,5% 1 L (pasteurizat)',
      brand: 'Napolact',
      package_size: '1 L',
      quantity_value: 1000,
      quantity_unit: 'ml',
      image_url: null,
      attributes: { fat_percentage: 1.5 },
    },
    {
      id: 'prod-olympus-37',
      canonical_name: 'Olympus Lapte de consum integral 3,7% 1 L (pasteurizat)',
      brand: 'Olympus',
      package_size: '1 L',
      quantity_value: 1000,
      quantity_unit: 'ml',
      image_url: 'https://existing.jpg',
      attributes: { fat_percentage: 3.7 },
    },
  ];

  const categoriesBySlug = new Map([
    ['lapte', { id: 'cat-lapte', slug: 'lapte', name: 'Lapte' }],
    ['branzeturi', { id: 'cat-branzeturi', slug: 'branzeturi', name: 'Brânzeturi' }],
    ['unt-smantana', { id: 'cat-unt-smantana', slug: 'unt-smantana', name: 'Unt și smântână' }],
  ]);
  const familiesByKey = new Map([
    ['lapte-lapte', { id: 'fam-lapte', family_key: 'lapte-lapte', canonical_name: 'Lapte' }],
    ['unt-smantana-smantana', { id: 'fam-smantana', family_key: 'unt-smantana-smantana', canonical_name: 'Smântână' }],
    ['branzeturi-branza cottage', { id: 'fam-cottage', family_key: 'branzeturi-branza cottage', canonical_name: 'Brânză cottage' }],
  ]);

  const matchNapolact = extractFreshfulRecord({
    sku: '100030286',
    name: 'Lapte din inima Ardealului 1.5% grăsime 1l',
    brand: 'Napolact',
    price: 8.99,
    image: { extralarge: { default: 'https://cdn.freshful.ro/test-napolact.jpg' } },
  });
  const olympusPlain = extractFreshfulRecord({
    sku: '100032078',
    name: 'Lapte de consum 3.7% grăsime 1l',
    brand: 'Olympus',
    price: 9.99,
  });
  const olympusVitD3 = extractFreshfulRecord({
    sku: '100032079',
    name: 'Lapte 3.7% grăsime cu vitamina D3, 1l',
    brand: 'Olympus',
    price: 11.99,
  });
  const olympusBarista = extractFreshfulRecord({
    sku: '100178258',
    name: 'Lapte Barista 3.7% grăsime, 1l',
    brand: 'Olympus',
    price: 11.49,
  });
  const olympusGoat = extractFreshfulRecord({
    sku: '100032082',
    name: 'Lapte de capră 3.7% grăsime 1l',
    brand: 'Olympus',
    price: 11.99,
  });

  const rec = reconcileFreshfulWithCatalog({
    dedupedItems: [matchNapolact, olympusPlain, olympusVitD3, olympusBarista, olympusGoat, zuzuMilkWithPath, nucetCreamWithPath, cottageWithCream],
    canonicalProducts: existingCatalog,
    existingCategoriesBySlug: categoriesBySlug,
    existingFamiliesByKey: familiesByKey,
  });

  assert.equal(rec.matchedExisting.length, 2);
  assert.equal(rec.matchedExisting.some((m) => m.canonicalProduct.id === 'prod-napolact-semideg' && m.shouldBackfillImage), true);
  assert.equal(rec.matchedExisting.some((m) => m.canonicalProduct.id === 'prod-olympus-37' && m.item.source_product_id === '100032078'), true);
  // Vitamin D3, Barista and Goat milk must NOT overwrite standard Olympus cow milk
  assert.equal(rec.newCanonical.some((n) => n.item.source_product_id === '100032079'), true);
  assert.equal(rec.newCanonical.some((n) => n.item.source_product_id === '100178258'), true);
  assert.equal(rec.newCanonical.some((n) => n.item.source_product_id === '100032082'), true);

  const sql = buildCanonicalSyncSql({
    reconciliation: rec,
    dedupeStats: { afterCanonicalDedupeCount: 8 },
    collectorMeta: { categorySlug: '401-lapte-smantana-si-branza-proaspata' },
  });
  assert.match(sql, /beavy_source_catalog/);
  assert.doesNotMatch(sql, /beavy_product_offers/);
  assert.doesNotMatch(sql, /beavy_product_price_history/);
  assert.match(sql, /on conflict \(family_id, normalized_alias, alias_type\) do nothing/);
});

test('Full-catalog dedupe guards: preserves model/SPF/diaper integers, isolates noqty SKUs & prefers primary aisle', () => {
  const spf30 = extractFreshfulRecord({
    sku: '100900001',
    name: 'Loțiune protecție solară SPF 30 200ml',
    brand: 'Nivea',
    price: 49.99,
  }, { categorySlug: '1104-produse-cu-protectie-solara' });
  const spf50 = extractFreshfulRecord({
    sku: '100900002',
    name: 'Loțiune protecție solară SPF 50 200ml',
    brand: 'Nivea',
    price: 54.99,
  }, { categorySlug: '1104-produse-cu-protectie-solara' });

  const diaper3 = extractFreshfulRecord({
    sku: '100900003',
    name: 'Scutece Nr. 3, 50 buc',
    brand: 'Pampers',
    price: 79.99,
  }, { categorySlug: '1202-igiena-bebe' });
  const diaper4 = extractFreshfulRecord({
    sku: '100900004',
    name: 'Scutece Nr. 4, 50 buc',
    brand: 'Pampers',
    price: 79.99,
  }, { categorySlug: '1202-igiena-bebe' });

  const lego1 = extractFreshfulRecord({
    sku: '100900005',
    name: 'LEGO Star Wars 75399',
    brand: 'LEGO',
    price: 299.99,
  }, { categorySlug: '1801-lego-r' });
  const lego2 = extractFreshfulRecord({
    sku: '100900006',
    name: 'LEGO Star Wars 75400',
    brand: 'LEGO',
    price: 349.99,
  }, { categorySlug: '1801-lego-r' });

  // No-quantity items with identical display title must NOT merge across distinct SKUs
  const wineNoQty1 = extractFreshfulRecord({
    sku: '100900007',
    name: 'Vin roșu Fetească Neagră rezervă',
    brand: 'Purcari',
    price: 65,
  }, { categorySlug: '705-vinuri' });
  const wineNoQty2 = extractFreshfulRecord({
    sku: '100900008',
    name: 'Vin roșu Fetească Neagră rezervă',
    brand: 'Purcari',
    price: 75,
  }, { categorySlug: '705-vinuri' });

  // Cross-listed SKU should prefer primary aisle over eco/dietetic secondary listing
  const ecoFirst = extractFreshfulRecord({
    sku: '100032078',
    name: 'Lapte bio 3.7% grăsime 1l',
    brand: 'Olympus',
    price: 9.99,
  }, { categorySlug: 'lapte-si-lactate-eco', page: 1 });
  const primarySecond = extractFreshfulRecord({
    sku: '100032078',
    name: 'Lapte bio 3.7% grăsime 1l',
    brand: 'Olympus',
    price: 9.99,
  }, { categorySlug: '401-lapte-smantana-si-branza-proaspata', page: 1 });

  const res = deduplicateFreshfulItems([
    spf30, spf50, diaper3, diaper4, lego1, lego2, wineNoQty1, wineNoQty2, ecoFirst, primarySecond,
  ]);
  assert.equal(res.items.length, 9);
  const olympus = res.items.find((x) => x.source_product_id === '100032078');
  assert.equal(olympus.category_slug_freshful, '401-lapte-smantana-si-branza-proaspata');
  assert.deepEqual(olympus.observed_categories, ['lapte-si-lactate-eco', '401-lapte-smantana-si-branza-proaspata']);
});

test('Full 92-category Beavy mapping prevents non-food collisions & builds compact tuple batches', () => {
  const cases = [
    [{ sku: '1', name: 'Vin alb Sauvignon Blanc 0.75l', brand: 'Cricova' }, '705-vinuri', 'vinuri'],
    [{ sku: '2', name: 'Detergent lichid rufe colorate 2L', brand: 'Ariel' }, '1301-spalare-si-intretinere-rufe', 'detergenti-rufe'],
    [{ sku: '3', name: 'Antricot de vită maturat 300g', brand: 'Angus' }, '201-carne-de-vita-si-oaie', 'carne-vita'],
    [{ sku: '4', name: 'Pastă de dinți albire 75ml', brand: 'Sensodyne' }, '1109-igiena-dentara', 'igiena-dentara'],
    // Cat food with "pate" MUST map to hrana-pisici, NOT pate-tartinabile
    [{ sku: '5', name: 'Gourmet Gold pate cu carne 85g', brand: 'Purina' }, '1501-pisici', 'hrana-pisici'],
    // LEGO with "Cafe" MUST map to lego, NOT cafea
    [{ sku: '6', name: 'LEGO Creator Cozy Cafe House 31131', brand: 'LEGO' }, '1801-lego-r', 'lego'],
    // Soap with "Lapte" MUST map to igiena-personala, NOT lapte
    [{ sku: '7', name: 'Săpun cremă cu lapte și miere 90g', brand: 'Dove' }, '1110-sapunuri-si-geluri-de-dus', 'igiena-personala'],
  ];

  const items = cases.map(([raw, slug]) => extractFreshfulRecord({ ...raw, price: 12.5 }, { categorySlug: slug }));
  for (let i = 0; i < cases.length; i++) {
    assert.equal(inferBeavyCategoryAndFamily(items[i]).categorySlug, cases[i][2]);
  }

  const batchPlan = buildCompactIngestBatches({
    dedupedItems: items,
    catalogBatch: 'freshful_full_test',
    batchSize: 4,
  });
  assert.equal(batchPlan.totalProducts, 7);
  assert.equal(batchPlan.chunks.length, 3); // 00_setup_runs + 2 batches (4 + 3)
  assert.equal(batchPlan.chunks[0].name, '00_setup_runs.sql');
  assert.match(batchPlan.chunks[1].sql, /select public\.beavy_ingest_freshful_tuples\(/);
  assert.match(batchPlan.chunks[0].sql, /products_found, offers_saved, metadata[\s\S]*7, 0,/);
});

test('Core supermarket curation keeps ubiquitous staples & filters boutique/bax/exotic items', () => {
  const stapleDairy = extractFreshfulRecord(
    { sku: 'c1', name: 'Lapte proaspăt 1.5% 1L', brand: 'Zuzu' },
    { categorySlug: '401-lapte-smantana-si-branza-proaspata' }
  );
  const stapleCocaCola = extractFreshfulRecord(
    { sku: 'c2', name: 'Băutură carbogazoasă Zero 2L', brand: 'Coca-Cola' },
    { categorySlug: '703-bauturi-carbogazoase' }
  );
  const stapleProduce = extractFreshfulRecord(
    { sku: 'c3', name: 'Roșii românești 1kg', brand: null },
    { categorySlug: '302-legume-proaspete' }
  );
  const bulkBax = extractFreshfulRecord(
    { sku: 'c4', name: 'Apă minerală plată 6x1.5L', brand: 'Borsec' },
    { categorySlug: '702-apa' }
  );
  const boutiqueWine = extractFreshfulRecord(
    { sku: 'c5', name: 'Vin roșu Barrique Reserve 0.75l', brand: 'Crama Girboiu' },
    { categorySlug: '705-vinuri' }
  );
  const exoticProduce = extractFreshfulRecord(
    { sku: 'c6', name: 'Mango Honey Ataulfo ECO, by air 150g', brand: null },
    { categorySlug: '301-fructe-proaspete' }
  );

  assert.equal(isCoreSupermarketItem(stapleDairy), true);
  assert.equal(isCoreSupermarketItem(stapleCocaCola), true);
  assert.equal(isCoreSupermarketItem(stapleProduce), true);
  assert.equal(isCoreSupermarketItem(bulkBax), false);
  assert.equal(isCoreSupermarketItem(boutiqueWine), false);
  assert.equal(isCoreSupermarketItem(exoticProduce), false);
});
