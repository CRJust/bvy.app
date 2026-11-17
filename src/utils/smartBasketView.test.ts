import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BASKET, PRODUCT_MAP } from '../data/catalog.ts';
import { buildOffersFromRawRows, mapSupabaseProduct } from '../services/supabaseCatalog.ts';
import type { BasketItem, CanonicalProduct } from '../types.ts';
import { computeOptimizationPlan, computeSplitTwoStores } from './pricing.ts';
import {
  buildStrategyOptions,
  getRecommendedStrategy,
  strategyEngineSettings,
} from './smartBasketView.ts';

function liveProduct(
  id: string,
  name: string,
  offers: Array<{ slug: string; price: number }>
): CanonicalProduct {
  const rows = offers.map(({ slug, ...row }) => ({
    product_id: id,
    beavy_retailers: { slug },
    ...row,
  }));
  return mapSupabaseProduct({ id, canonical_name: name }, buildOffersFromRawRows(rows, false, name));
}

function optionsFor(
  basket: BasketItem[],
  map: Record<string, CanonicalProduct>,
  economyMode = false
) {
  const singlePlan = computeOptimizationPlan(
    basket,
    [],
    economyMode,
    'physical',
    economyMode ? 'cheapest' : 'fidelity',
    map,
    { maxStores: 1 }
  );
  const lowestPlan = computeOptimizationPlan(basket, [], economyMode, 'physical', 'cheapest', map, {
    maxStores: 2,
  });
  const split = computeSplitTwoStores(basket, [], economyMode, 'physical', map);
  const balancedPlan = computeOptimizationPlan(basket, [], economyMode, 'physical', 'balanced', map, {
    maxStores: 2,
  });
  return { singlePlan, lowestPlan, split, balancedPlan, options: buildStrategyOptions({ singlePlan, lowestPlan, split }) };
}

test('smart basket options mirror engine totals exactly for the default basket', () => {
  const { singlePlan, lowestPlan, options } = optionsFor(DEFAULT_BASKET, PRODUCT_MAP);
  assert.ok(singlePlan && lowestPlan);
  assert.equal(options.single.total, singlePlan.totalWithDelivery);
  assert.equal(options.lowest.total, lowestPlan.totalWithDelivery);
  assert.equal(options.single.storeIds.length, 1);
  assert.equal(options.single.selectable, true);
  // Same coverage as the market baseline: the saving is the engine's own figure, never invented
  if (options.single.savingsVsAverage !== null) {
    assert.equal(options.single.savingsVsAverage, singlePlan.savingsVsAverage);
  }
});

test('two-store option is selectable only when the engine itself chooses the split', () => {
  const lidlOnly = liveProduct('sb-a', 'Iaurt grecesc 400g', [{ slug: 'lidl', price: 7 }]);
  const kauflandOnly = liveProduct('sb-b', 'Ulei masline 1 L', [{ slug: 'kaufland', price: 40 }]);
  const map = { [lidlOnly.id]: lidlOnly, [kauflandOnly.id]: kauflandOnly };
  const basket: BasketItem[] = [
    { productId: 'sb-a', quantity: 2, checkedInStore: false },
    { productId: 'sb-b', quantity: 1, checkedInStore: false },
  ];

  const { options, lowestPlan, balancedPlan } = optionsFor(basket, map);
  assert.ok(lowestPlan?.isSplit);
  assert.equal(options.two.selectable, true);
  assert.equal(options.two.total, 54);
  assert.deepEqual([...options.two.storeIds].sort(), ['kaufland', 'lidl']);
  assert.equal(options.two.availableCount, 2);
  // The split covers more lines than the single store: totals are not comparable, no savings shown
  assert.equal(options.two.savingsVsAverage, null);
  assert.equal(options.single.availableCount, 1);
  assert.equal(getRecommendedStrategy(balancedPlan, options), 'two');
});

test('a split that is not worthwhile is shown with its real total but cannot be applied', () => {
  const a = liveProduct('nw-a', 'Paine alba 500g', [
    { slug: 'lidl', price: 5 },
    { slug: 'kaufland', price: 5.5 },
  ]);
  const b = liveProduct('nw-b', 'Lapte 1 L', [
    { slug: 'lidl', price: 8 },
    { slug: 'kaufland', price: 7.5 },
  ]);
  const map = { [a.id]: a, [b.id]: b };
  const basket: BasketItem[] = [
    { productId: 'nw-a', quantity: 1, checkedInStore: false },
    { productId: 'nw-b', quantity: 1, checkedInStore: false },
  ];

  const { options, split, balancedPlan } = optionsFor(basket, map);
  assert.ok(split);
  assert.equal(split.isWorthwhile, false);
  assert.equal(options.two.selectable, false);
  assert.equal(options.two.plan, null);
  assert.equal(options.two.unavailableReason, 'split_not_worthwhile');
  assert.equal(options.two.total, split.totalWithDelivery);
  assert.notEqual(getRecommendedStrategy(balancedPlan, options), 'two');
});

test('a one-line basket has no two-store option', () => {
  const basket: BasketItem[] = [{ productId: 'zuzu_lapte_1l', quantity: 1, checkedInStore: false }];
  const { options } = optionsFor(basket, PRODUCT_MAP);
  assert.equal(options.two.selectable, false);
  assert.equal(options.two.unavailableReason, 'no_split');
  assert.equal(options.two.total, null);
});

test('an empty basket yields no selectable options', () => {
  const { options, balancedPlan } = optionsFor([], PRODUCT_MAP);
  assert.equal(options.single.selectable, false);
  assert.equal(options.lowest.selectable, false);
  assert.equal(getRecommendedStrategy(balancedPlan, options), 'single');
});

test('strategy settings map to existing engine strategies and store limits', () => {
  assert.deepEqual(strategyEngineSettings('single', false), { strategy: 'fidelity', maxStores: 1 });
  assert.deepEqual(strategyEngineSettings('single', true), { strategy: 'cheapest', maxStores: 1 });
  assert.deepEqual(strategyEngineSettings('two', false), { strategy: 'cheapest', maxStores: 2 });
  assert.deepEqual(strategyEngineSettings('lowest', true), { strategy: 'cheapest', maxStores: 2 });
});
