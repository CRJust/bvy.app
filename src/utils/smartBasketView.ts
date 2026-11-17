import type { StoreId } from '../types.ts';
import type { OptimizationPlan, SplitTwoStoreResult } from './pricing.ts';

/**
 * Presentation adapter for the Smart Basket strategy selector.
 *
 * It does no pricing of its own: every total, store and savings figure comes straight from
 * results already produced by `pricing.ts` (computeOptimizationPlan / computeSplitTwoStores).
 */

export type BasketStrategyId = 'single' | 'two' | 'lowest';

export type StrategyUnavailableReason = 'no_split' | 'split_not_worthwhile';

export interface StrategyOption {
  id: BasketStrategyId;
  /** Plan applied when the option is chosen; null when the option cannot be applied. */
  plan: OptimizationPlan | null;
  /** Total to pay as reported by the engine, or null when the engine has no result. */
  total: number | null;
  storeIds: StoreId[];
  /** Savings against the market average, only when > 0 and the coverage is comparable. */
  savingsVsAverage: number | null;
  /** Basket lines covered by this option / lines that have a verified price somewhere. */
  availableCount: number;
  pricedCount: number;
  selectable: boolean;
  unavailableReason: StrategyUnavailableReason | null;
  /** Best two-store split from the engine, kept for the explanation when it is not worthwhile. */
  split: SplitTwoStoreResult | null;
}

export interface StrategyInputs {
  /** computeOptimizationPlan(..., maxStores: 1) */
  singlePlan: OptimizationPlan | null;
  /** computeOptimizationPlan(..., 'cheapest', maxStores: 2) */
  lowestPlan: OptimizationPlan | null;
  /** computeSplitTwoStores(...) with the same mode and exclusions */
  split: SplitTwoStoreResult | null;
}

function planStoreIds(plan: OptimizationPlan): StoreId[] {
  if (plan.isSplit && plan.splitResult) return [plan.splitResult.storeA, plan.splitResult.storeB];
  return plan.storeId === 'split' ? [] : [plan.storeId];
}

/** Lines with a verified price somewhere (covered + sold elsewhere). */
function pricedCount(plan: OptimizationPlan): number {
  return plan.availableCount + plan.missingCount;
}

/**
 * The market average only includes stores that cover as many lines as the best single store,
 * so a saving is only meaningful for an option that covers that same number of lines.
 */
function comparableSavings(plan: OptimizationPlan, reference: OptimizationPlan | null): number | null {
  if (reference && plan.availableCount !== reference.availableCount) return null;
  return plan.savingsVsAverage > 0.004 ? plan.savingsVsAverage : null;
}

function fromPlan(
  id: BasketStrategyId,
  plan: OptimizationPlan | null,
  reference: OptimizationPlan | null,
  split: SplitTwoStoreResult | null
): StrategyOption {
  if (!plan) {
    return {
      id,
      plan: null,
      total: null,
      storeIds: [],
      savingsVsAverage: null,
      availableCount: 0,
      pricedCount: 0,
      selectable: false,
      unavailableReason: null,
      split,
    };
  }
  return {
    id,
    plan,
    total: plan.totalWithDelivery,
    storeIds: planStoreIds(plan),
    savingsVsAverage: comparableSavings(plan, reference),
    availableCount: plan.availableCount,
    pricedCount: pricedCount(plan),
    selectable: true,
    unavailableReason: null,
    split,
  };
}

export function buildStrategyOptions({
  singlePlan,
  lowestPlan,
  split,
}: StrategyInputs): Record<BasketStrategyId, StrategyOption> {
  const single = fromPlan('single', singlePlan, singlePlan, null);
  const lowest = fromPlan('lowest', lowestPlan, singlePlan, split);

  // Two stores is applicable only when the engine itself chose the split (isWorthwhile);
  // otherwise the app falls back to a single store, so the option is shown but not selectable.
  let two: StrategyOption;
  if (lowestPlan && lowestPlan.isSplit && split?.isWorthwhile) {
    two = fromPlan('two', lowestPlan, singlePlan, split);
  } else if (split) {
    two = {
      id: 'two',
      plan: null,
      total: split.totalWithDelivery,
      storeIds: [split.storeA, split.storeB],
      savingsVsAverage: null,
      availableCount: 0,
      pricedCount: 0,
      selectable: false,
      unavailableReason: 'split_not_worthwhile',
      split,
    };
  } else {
    two = { ...fromPlan('two', null, null, null), unavailableReason: 'no_split' };
  }

  return { single, two, lowest };
}

/** The option matching the engine's own balanced recommendation. */
export function getRecommendedStrategy(
  balancedPlan: OptimizationPlan | null,
  options: Record<BasketStrategyId, StrategyOption>
): BasketStrategyId {
  if (!balancedPlan) return 'single';
  if (balancedPlan.isSplit) return options.two.selectable ? 'two' : 'lowest';
  const storeId = balancedPlan.storeId;
  if (options.single.storeIds.length === 1 && options.single.storeIds[0] === storeId) return 'single';
  if (options.lowest.storeIds.length === 1 && options.lowest.storeIds[0] === storeId) return 'lowest';
  return 'single';
}

/** Which engine strategy and store limit each option corresponds to. */
export function strategyEngineSettings(
  id: BasketStrategyId,
  economyMode: boolean
): { strategy: 'cheapest' | 'fidelity'; maxStores: 1 | 2 } {
  if (id === 'single') return { strategy: economyMode ? 'cheapest' : 'fidelity', maxStores: 1 };
  return { strategy: 'cheapest', maxStores: 2 };
}
