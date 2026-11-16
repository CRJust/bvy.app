import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function loadPureService(filename) {
  const filePath = path.join(process.cwd(), 'src', 'services', filename);
  const source = await fs.readFile(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const mod = { exports: {} };
  const wrapper = vm.runInThisContext(
    `(function (exports, require, module) {\n${compiled.outputText}\n})`,
    { filename: filePath }
  );
  wrapper(mod.exports, () => {
    throw new Error(`${filename} must stay dependency-free at runtime`);
  }, mod);
  return mod.exports;
}

const lb = await loadPureService('live-basket.ts');
const ppg = await loadPureService('product-price-grid.ts');

const retailer = (id, name) => ({ id, slug: id, name });
const item = (id, qty = 1) => ({ id, name: id, quantity: qty, checked: false, productId: `p-${id}` });
const offer = (price, regular = null) => ({ price, regular_price: regular, promo_price: null, promo_label: null });
const match = (id, price, extra = {}) => ({
  item: item(id),
  offer: offer(price, extra.regular ?? null),
  lineTotal: price,
  matchType: 'exact',
  equivalentProductName: extra.name ?? null,
  equivalentPackageSize: extra.size ?? null,
  isBudgetSwap: extra.swap ?? false,
});
const summary = (id, total, matched, full = true, covered = matched.length) => ({
  retailer: retailer(id, id.toUpperCase()),
  coveredCount: covered,
  totalItemsCount: 2,
  hasFullBasketCoverage: full,
  estimatedTotalWithFees: total,
  matchedItems: matched,
  unavailableItems: [],
});

const dual = {
  standard: {
    retailerSummaries: [
      summary('carrefour', 89.5, [match('a', 50), match('b', 39.5)]),
      summary('lidl', 78.4, [match('a', 40), match('b', 38.4)]),
      summary('penny', 60, [match('a', 60)], false, 1),
    ],
    bestStoreMix: {
      stops: [
        { retailer: retailer('lidl', 'Lidl'), items: [match('a', 40)] },
        { retailer: retailer('kaufland', 'Kaufland'), items: [match('b', 31.2)] },
      ],
      coveredItemsCount: 2,
      totalItemsCount: 2,
      hasFullBasketCoverage: true,
      totalWithFees: 71.2,
      savingsVsBestSingleStore: 7.2,
    },
  },
  budget: {
    retailerSummaries: [
      summary('lidl', 70, [match('a', 30, { swap: true, name: 'Pilos Unt 82% 200g', size: '200g' }), match('b', 38.4)]),
    ],
    bestStoreMix: null,
  },
};

test('store options: full coverage first, cheapest first, split appended', () => {
  const opts = lb.buildStoreOptions(dual, 'faithful');
  assert.deepEqual(opts.map((o) => o.id), ['lidl', 'carrefour', 'penny', lb.SPLIT_STORE_ID]);
  assert.equal(opts[0].isBest, true);
  assert.equal(opts[1].deltaVsBest, 11.1);
  assert.equal(opts[3].kind, 'split');
  assert.equal(opts[3].total, 71.2);
  assert.equal(lb.pickDefaultStoreId(opts), 'lidl');
});

test('economy mode reads the budget variant', () => {
  const opts = lb.buildStoreOptions(dual, 'economy');
  assert.equal(opts[0].total, 70);
  assert.equal(opts.some((o) => o.kind === 'split'), false);
});

test('empty comparison yields no options', () => {
  assert.deepEqual(lb.buildStoreOptions(null, 'faithful'), []);
});

test('lines follow selected store and flag missing items', () => {
  const lines = lb.buildLinesForStore(dual, 'faithful', 'penny', ['a', 'b']);
  assert.equal(lines.get('a').lineTotal, 60);
  assert.equal(lines.get('b').status, 'missing');
});

test('split lines come from the mix stops', () => {
  const lines = lb.buildLinesForStore(dual, 'faithful', lb.SPLIT_STORE_ID, ['a', 'b']);
  assert.equal(lines.get('a').retailerName, 'Lidl');
  assert.equal(lines.get('b').retailerName, 'Kaufland');
});

test('brand swap hint only above the 20% threshold', () => {
  const hints = lb.buildBrandSwapHints(dual, 'lidl');
  assert.equal(hints.size, 1);
  assert.equal(hints.get('a').savings, 10);
  assert.equal(hints.get('a').alternativeName, 'Pilos Unt 82% 200g');

  const small = structuredClone(dual);
  small.budget.retailerSummaries[0].matchedItems[0].lineTotal = 38;
  assert.equal(lb.buildBrandSwapHints(small, 'lidl').size, 0);
});

test('totals, economy savings and in-store split', () => {
  const lines = lb.buildLinesForStore(dual, 'faithful', 'lidl', ['a', 'b']);
  const totals = lb.summarizeLines(lines, ['a', 'b'], {
    economySavings: lb.economySavingsAtStore(dual, 'lidl'),
  });
  assert.equal(totals.total, 78.4);
  assert.equal(totals.economySavings, 8.4);
  const inStore = lb.splitInStoreTotals(lines, new Set(['a']), ['a', 'b']);
  assert.deepEqual(inStore, { inCart: 40, remaining: 38.4 });
});

test('Romanian money format', () => {
  assert.match(lb.formatLei(78.4), /^78[,.]40 lei$/);
});

test('catalog-only: no manual items are produced by live-basket', async () => {
  const src = await fs.readFile('src/services/live-basket.ts', 'utf8');
  assert.equal(/isCustom\s*:\s*true/.test(src), false);
});

test('product-price-grid: derives standardized unit prices and matches shelf catalog', () => {
  assert.match(ppg.deriveUnitPriceLabel(8.49, null, null, '250g', 'Unt 82%'), /^33[,.]96 lei\/kg$/);
  assert.match(ppg.deriveUnitPriceLabel(9.4, null, null, '1L', 'Lapte'), /^9[,.]40 lei\/L$/);

  const shelfMatched = ppg.matchShelfCatalogOffers(
    { id: 'prod-1', canonical_name: 'Unt 82% grasime', brand: 'Napolact', package_size: '200g' },
    [
      {
        id: 'shelf-pilos-unt',
        canonical_name: 'Pilos Unt 82%',
        brand: 'Pilos',
        package_size: '200g',
        is_private_label: true,
        fat_percentage: 82,
        prices_by_retailer: {
          lidl: {
            price: 6.49,
            name: 'Pilos Unt 82%',
            package_size: '200g',
            normalized_unit_price: 32.45,
            normalized_unit_label: 'RON/kg',
          },
        },
      },
    ]
  );
  assert.equal(shelfMatched.length, 1);
  assert.equal(shelfMatched[0].kind, 'alternative');
  assert.equal(shelfMatched[0].offer.retailer_name, 'Lidl');

  const facets = ppg.extractGramajFacets([
    { package_size: '200g', canonical_name: 'Unt 200g' },
    { package_size: '250g', canonical_name: 'Somon 250g' },
    { package_size: '1kg', canonical_name: 'Faina 1kg' },
  ]);
  assert.deepEqual(facets.map((f) => f.label), ['200g', '250g', '1kg']);

  // Deduplicare strictă între UUID din Supabase și slug din shelf-prices.json pentru același magazin
  const dedupedGrid = ppg.buildPriceGrid(
    [
      {
        offer: {
          ...offer(12.99),
          retailer_id: '2c693622-0000-4000-8000-000000000001',
          retailer_name: 'Kaufland',
        },
        kind: 'exact',
      },
      {
        offer: {
          ...offer(9.99),
          retailer_id: 'kaufland',
          retailer_name: 'Kaufland',
        },
        kind: 'alternative',
        altBrand: 'K-Classic',
      },
    ],
    () => 'Kaufland Card'
  );
  assert.equal(dedupedGrid.storeCount, 1);
  assert.equal(dedupedGrid.cells[0].retailerName, 'Kaufland');
  assert.equal(dedupedGrid.cells[0].kind, 'exact');
  assert.equal(dedupedGrid.cells[0].price, 12.99);
});

test('common 6+ stores & tier variants (Comun, Brand propriu, Mai ieftin, Mai premium)', async () => {
  const scannerCore = await loadPureService('beavy-list-scanner-core.ts');

  const multiStoreGrid = ppg.buildPriceGrid(
    [
      { offer: { ...offer(7.99), retailer_name: 'Lidl' }, kind: 'alternative', altBrand: 'Pilos', altIsPrivateLabel: true },
      { offer: { ...offer(8.29), retailer_name: 'Kaufland' }, kind: 'alternative', altBrand: 'K-Classic', altIsPrivateLabel: true },
      { offer: { ...offer(9.49), retailer_name: 'Penny' }, kind: 'alternative', altBrand: 'Covalact', altIsPrivateLabel: false },
      { offer: { ...offer(10.99), retailer_name: 'Carrefour' }, kind: 'exact' },
      { offer: { ...offer(11.19), retailer_name: 'Auchan' }, kind: 'exact' },
      { offer: { ...offer(14.99), retailer_name: 'Mega Image' }, kind: 'alternative', altBrand: 'Lurpak', altIsPrivateLabel: false },
    ],
    () => 'Card'
  );
  assert.equal(multiStoreGrid.storeCount, 6);
  assert.equal(multiStoreGrid.isCommonAcrossStores, true);
  assert.equal(multiStoreGrid.cheapestPrivateLabel?.retailerName, 'Lidl');
  assert.equal(multiStoreGrid.cheapestPrivateLabel?.variantTier, 'private_label');
  assert.equal(multiStoreGrid.cells[2].variantTier, 'cheaper');
  assert.equal(multiStoreGrid.premiumOption?.retailerName, 'Mega Image');
  assert.equal(multiStoreGrid.premiumOption?.variantTier, 'premium');

  // Scanner core: prioritizează alimentul comun în >= 6 magazine și expune tierVariants (Brand propriu / Mai ieftin / Mai premium)
  const untMatch = scannerCore.matchScannedItemAgainstCatalog(
    { rawLine: 'Unt 82%', name: 'Unt 82%', quantity: 1, unit: 'pachet', packageSizeHint: '200g', brandHint: null, confidence: 0.95 },
    [
      {
        id: 'p-pilos-unt',
        canonical_name: 'Pilos Unt 82% grăsime 200g',
        brand: 'Pilos',
        package_size: '200g',
        quantity_value: 200,
        quantity_unit: 'g',
        image_url: 'https://img/pilos.jpg',
        category: 'Lactate',
        subcategory: 'Unt',
        search_aliases: ['unt'],
        familyNames: ['Unt'],
        familyAliases: [],
        store_count: 1,
        min_price: 7.49,
      },
      {
        id: 'p-covalact-unt',
        canonical_name: 'Covalact Unt de masă 82% grăsime 200g',
        brand: 'Covalact',
        package_size: '200g',
        quantity_value: 200,
        quantity_unit: 'g',
        image_url: 'https://img/covalact.jpg',
        category: 'Lactate',
        subcategory: 'Unt',
        search_aliases: ['unt'],
        familyNames: ['Unt'],
        familyAliases: [],
        store_count: 3,
        min_price: 9.29,
      },
      {
        id: 'p-albalact-unt-6stores',
        canonical_name: 'Albalact Unt 82% grăsime 200g',
        brand: 'Albalact',
        package_size: '200g',
        quantity_value: 200,
        quantity_unit: 'g',
        image_url: 'https://img/albalact.jpg',
        category: 'Lactate',
        subcategory: 'Unt',
        search_aliases: ['unt'],
        familyNames: ['Unt'],
        familyAliases: [],
        store_count: 7,
        min_price: 10.99,
      },
      {
        id: 'p-lurpak-unt-premium',
        canonical_name: 'Lurpak Unt danez 82% grăsime 200g',
        brand: 'Lurpak',
        package_size: '200g',
        quantity_value: 200,
        quantity_unit: 'g',
        image_url: 'https://img/lurpak.jpg',
        category: 'Lactate',
        subcategory: 'Unt',
        search_aliases: ['unt'],
        familyNames: ['Unt'],
        familyAliases: [],
        store_count: 5,
        min_price: 14.99,
      },
    ]
  );

  assert.equal(untMatch.selectedProduct?.id, 'p-albalact-unt-6stores', 'Must pick the 6+ store common product');
  assert.equal(untMatch.tierVariants?.common?.id, 'p-albalact-unt-6stores');
  assert.equal(untMatch.tierVariants?.privateLabel?.id, 'p-pilos-unt');
  assert.equal(untMatch.tierVariants?.cheaper?.id, 'p-pilos-unt');
  assert.equal(untMatch.tierVariants?.premium?.id, 'p-lurpak-unt-premium');
});
