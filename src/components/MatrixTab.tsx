import { Fragment, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  RotateCcw,
  SlidersHorizontal,
  Table2,
  Truck,
  X,
} from 'lucide-react';
import { PRODUCT_MAP } from '../data/catalog.ts';
import { STORE_MAP } from '../data/stores.ts';
import type { MissionConstraints } from '../App.tsx';
import type {
  AppliedPlanItemEstimate,
  AppliedPlanSnapshot,
  BasketItem,
  CanonicalProduct,
  LoyaltyCardId,
  StoreFilterMode,
  StoreId,
} from '../types.ts';
import {
  calculateStoreBasketSummary,
  computeDeliveryFee,
  computeOptimizationPlan,
  computeSplitTwoStores,
  formatRon,
  getEffectiveOffer,
  getEquivalenceLevelLabel,
  getRankedStores,
  resolveProductForMode,
  round2,
  type OptimizationStrategy,
} from '../utils/pricing.ts';
import { formatProductMeta, getBestVerifiedOffer } from '../utils/productDisplay.ts';
import {
  PlanShoppingList,
  type PlanLine,
  type PlanStoreGroup,
} from './PlanShoppingList.tsx';

interface MatrixTabProps {
  basket: BasketItem[];
  activeCards: LoyaltyCardId[];
  economyMode: boolean;
  activeStoreId: StoreId | 'split';
  hasChosenStore: boolean;
  filterMode: StoreFilterMode;
  missionConstraints: MissionConstraints;
  rejectedStoreIds: StoreId[];
  rejectedSwapIds: string[];
  onToggleEconomyMode: (enabled: boolean) => void;
  onChangeFilterMode: (mode: StoreFilterMode) => void;
  onChangeMaxStores: (maxStores: 1 | 2) => void;
  onToggleRejectedSwap: (fromProductId: string) => void;
  onRejectRecommendedStore: (storeId: StoreId | 'split', splitStoreA?: StoreId) => void;
  onResetRejections: () => void;
  onSelectStore: (storeId: StoreId | 'split', nextEconomyMode?: boolean) => void;
  onApplyPlan: (
    storeId: StoreId | 'split',
    swaps: { fromProductId: string; toProductId: string }[],
    enableEconomyMode: boolean,
    snapshot: AppliedPlanSnapshot
  ) => void;
  onToggleCard: (cardId: LoyaltyCardId) => void;
  onNavigateToBasket: () => void;
  onNavigateToAi: () => void;
}

export function MatrixTab({
  basket,
  activeCards,
  economyMode,
  activeStoreId,
  hasChosenStore,
  filterMode,
  missionConstraints,
  rejectedStoreIds,
  rejectedSwapIds,
  onToggleEconomyMode,
  onChangeFilterMode,
  onChangeMaxStores,
  onToggleRejectedSwap,
  onRejectRecommendedStore,
  onResetRejections,
  onSelectStore,
  onApplyPlan,
  onToggleCard,
  onNavigateToBasket,
  onNavigateToAi,
}: MatrixTabProps) {
  const [strategy, setStrategy] = useState<OptimizationStrategy>('balanced');
  const [showFilters, setShowFilters] = useState(false);
  const [showWhyDetails, setShowWhyDetails] = useState(false);
  const [showAllRankedStores, setShowAllRankedStores] = useState(false);
  const [showProductMatrix, setShowProductMatrix] = useState(false);
  const [showDeliveryRules, setShowDeliveryRules] = useState(false);
  const [matrixShowAllStores, setMatrixShowAllStores] = useState(false);
  const [matrixSortBySpread, setMatrixSortBySpread] = useState(true);
  const [matrixOnlySpreadOver1, setMatrixOnlySpreadOver1] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [copiedPlan, setCopiedPlan] = useState(false);

  const optOptions = {
    maxStores: missionConstraints.maxStores,
    excludedStoreIds: rejectedStoreIds,
    excludedSwapFromIds: economyMode ? rejectedSwapIds : [],
  };

  const rankedStores = getRankedStores(
    basket,
    activeCards,
    economyMode,
    filterMode,
    PRODUCT_MAP,
    rejectedStoreIds,
    economyMode ? rejectedSwapIds : []
  );

  const balancedPlan = computeOptimizationPlan(
    basket,
    activeCards,
    economyMode,
    filterMode,
    'balanced',
    PRODUCT_MAP,
    optOptions
  );
  const cheapestPlan = computeOptimizationPlan(
    basket,
    activeCards,
    economyMode,
    filterMode,
    'cheapest',
    PRODUCT_MAP,
    optOptions
  );
  const singleStorePlan = computeOptimizationPlan(
    basket,
    activeCards,
    economyMode,
    filterMode,
    economyMode ? 'cheapest' : 'fidelity',
    PRODUCT_MAP,
    {
      ...optOptions,
      maxStores: 1,
    }
  );
  const fidelityPlan = computeOptimizationPlan(
    basket,
    activeCards,
    false,
    filterMode,
    'fidelity',
    PRODUCT_MAP,
    optOptions
  );
  const economyPreviewPlan = !economyMode
    ? computeOptimizationPlan(
        basket,
        activeCards,
        true,
        filterMode,
        'cheapest',
        PRODUCT_MAP,
        optOptions
      )
    : null;

  const plan =
    strategy === 'balanced'
      ? balancedPlan
      : strategy === 'cheapest'
        ? cheapestPlan
        : economyMode
          ? singleStorePlan
          : fidelityPlan;

  const potentialEconomySavings =
    !economyMode && balancedPlan && economyPreviewPlan
      ? Math.max(0, round2(balancedPlan.totalWithDelivery - economyPreviewPlan.totalWithDelivery))
      : 0;

  const currentBasketSummary =
    hasChosenStore && activeStoreId !== 'split'
      ? calculateStoreBasketSummary(
          basket,
          activeStoreId,
          activeCards,
          economyMode,
          filterMode,
          PRODUCT_MAP,
          economyMode ? rejectedSwapIds : []
        )
      : null;
  const savingsVsCurrentBasket =
    currentBasketSummary && plan
      ? Math.round((currentBasketSummary.totalWithDelivery - plan.totalWithDelivery) * 100) / 100
      : 0;

  const twoStoreCandidate = computeSplitTwoStores(
    basket,
    activeCards,
    strategy === 'fidelity' ? false : economyMode,
    filterMode,
    PRODUCT_MAP,
    rejectedStoreIds,
    economyMode ? rejectedSwapIds : []
  );

  const runnerUpSingleStore =
    plan && !plan.isSplit
      ? rankedStores.find(
          (r) => r.storeId !== plan.storeId && r.missingCount === plan.missingCount
        ) ?? null
      : null;
  const runnerUpSavings =
    runnerUpSingleStore && plan && !plan.isSplit
      ? round2(runnerUpSingleStore.totalWithDelivery - plan.totalWithDelivery)
      : 0;

  const deliveryStores = rankedStores.filter((r) => {
    const ch = STORE_MAP[r.storeId].channel;
    return ch === 'online' || (filterMode === 'online' && ch === 'hybrid');
  });

  const fullBalancedPlan = computeOptimizationPlan(
    basket,
    activeCards,
    economyMode,
    filterMode,
    'balanced',
    PRODUCT_MAP,
    {
      maxStores: missionConstraints.maxStores,
      excludedStoreIds: rejectedStoreIds,
      excludedSwapFromIds: [],
    }
  );

  // The recommended plan as a shopping list: which product comes from which store
  const planSwapMap = new Map(
    plan && strategy === 'balanced' && economyMode
      ? plan.swapsApplied.map((s) => [s.fromProductId, s.toProductId] as const)
      : []
  );
  const resolvePlanProduct = (item: BasketItem): CanonicalProduct | null => {
    const baseProd = PRODUCT_MAP[item.productId];
    if (!baseProd) return null;
    const { resolvedProduct: normalizedBase } = resolveProductForMode(baseProd, false, PRODUCT_MAP);
    if (!economyMode) return normalizedBase;
    const swappedTo = planSwapMap.get(normalizedBase.id);
    if (swappedTo && PRODUCT_MAP[swappedTo]) return PRODUCT_MAP[swappedTo];
    return strategy === 'balanced'
      ? normalizedBase
      : resolveProductForMode(normalizedBase, true, PRODUCT_MAP, rejectedSwapIds).resolvedProduct;
  };
  const planLines: (PlanLine & { storeId: StoreId | null })[] = plan
    ? basket.flatMap((item) => {
        const product = resolvePlanProduct(item);
        if (!product) return [];
        const storeId: StoreId | null = plan.isSplit
          ? (plan.splitResult?.assignments[item.productId] ?? null)
          : plan.storeId !== 'split'
            ? plan.storeId
            : null;
        const storeOffer = storeId ? getEffectiveOffer(product, storeId, activeCards) : null;
        const offer = storeOffer && !storeOffer.isUnavailable ? storeOffer : null;
        return [
          {
            productId: item.productId,
            quantity: item.quantity,
            product,
            offer,
            alternative: offer ? null : getBestVerifiedOffer(product, activeCards),
            storeId: offer ? storeId : null,
          },
        ];
      })
    : [];
  const planStoreIds: StoreId[] = !plan
    ? []
    : plan.isSplit && plan.splitResult
      ? [plan.splitResult.storeA, plan.splitResult.storeB]
      : plan.storeId !== 'split'
        ? [plan.storeId]
        : [];
  const planGroups: PlanStoreGroup[] = planStoreIds.map((storeId) => {
    const lines = planLines.filter((line) => line.storeId === storeId);
    const deliveryFee =
      plan?.isSplit && plan.splitResult
        ? storeId === plan.splitResult.storeA
          ? plan.splitResult.deliveryA
          : plan.splitResult.deliveryB
        : (plan?.deliveryFee ?? 0);
    return {
      storeId,
      lines,
      subtotal: round2(
        lines.reduce((sum, line) => sum + (line.offer?.price ?? 0) * line.quantity, 0)
      ),
      deliveryFee,
    };
  });
  const planMissingLines = planLines.filter((line) => !line.offer && line.alternative);
  const planUnpricedLines = planLines.filter((line) => !line.offer && !line.alternative);
  const planPricedCount = plan ? plan.availableCount + plan.missingCount : 0;

  const buildSnapshotAndApply = () => {
    if (!plan) return;
    const swapMap = new Map(
      plan.swapsApplied.map((s) => [s.fromProductId, s.toProductId])
    );

    const itemEstimates: Record<string, AppliedPlanItemEstimate> = {};
    for (const item of basket) {
      const baseProd = PRODUCT_MAP[item.productId];
      if (!baseProd) continue;
      const { resolvedProduct: normalizedBase } = resolveProductForMode(
        baseProd,
        false,
        PRODUCT_MAP
      );
      const swappedTo =
        strategy === 'balanced' && economyMode ? swapMap.get(normalizedBase.id) : undefined;
      const resolvedProd = !economyMode
        ? normalizedBase
        : swappedTo && PRODUCT_MAP[swappedTo]
          ? PRODUCT_MAP[swappedTo]
          : strategy === 'balanced'
            ? normalizedBase
            : resolveProductForMode(normalizedBase, true, PRODUCT_MAP, rejectedSwapIds)
                .resolvedProduct;

      const storeForLine: StoreId =
        plan.isSplit && plan.splitResult?.assignments[item.productId]
          ? plan.splitResult.assignments[item.productId]
          : plan.storeId === 'split'
            ? (rankedStores[0]?.storeId ?? 'lidl')
            : plan.storeId;

      const offer = getEffectiveOffer(resolvedProd, storeForLine, activeCards);
      // Lines the plan does not cover have no expected price to verify against the receipt
      if (offer.isUnavailable) continue;
      itemEstimates[resolvedProd.id] = {
        productId: resolvedProd.id,
        productName: offer.variantLabel ?? resolvedProd.canonicalName,
        ean: resolvedProd.ean,
        storeId: storeForLine,
        quantity: item.quantity,
        expectedUnitPrice: offer.price,
      };
    }

    const isModified = rejectedSwapIds.length > 0 || rejectedStoreIds.length > 0;
    const snapshot: AppliedPlanSnapshot = {
      strategy: plan.strategy,
      decision: isModified ? 'modified' : 'accepted',
      storeId: plan.storeId,
      storeLabel: plan.storeLabel,
      estimatedTotal: plan.totalWithDelivery,
      estimatedDeliveryFee: plan.deliveryFee,
      budgetRon: missionConstraints.budgetRon,
      appliedAt: new Date().toISOString(),
      itemEstimates,
      actualUnitPrices: {},
      receiptTotalInput: '',
      receiptVerified: false,
    };

    onApplyPlan(
      plan.storeId,
      strategy === 'balanced'
        ? plan.swapsApplied.map((s) => ({
            fromProductId: s.fromProductId,
            toProductId: s.toProductId,
          }))
        : [],
      economyMode,
      snapshot
    );
  };

  const handleCopyShoppingPlan = async () => {
    if (!plan || basket.length === 0) return;

    const swapMap = new Map(
      plan.swapsApplied.map((sw) => [sw.fromProductId, sw.toProductId])
    );

    const lines: string[] = [
      `Plan Beavy (${strategy === 'balanced' ? 'Optimizare Balanced' : strategy === 'cheapest' ? 'Preț minim' : 'Fidel & 1 drum'})`,
      `Magazin: ${plan.storeLabel} · Total: ${formatRon(plan.totalWithDelivery)} (${plan.availableCount} din ${planPricedCount} produse)`,
      '',
    ];

    for (const item of basket) {
      const baseProd = PRODUCT_MAP[item.productId];
      if (!baseProd) continue;
      const { resolvedProduct: normalizedBase } = resolveProductForMode(
        baseProd,
        false,
        PRODUCT_MAP
      );
      const swappedId =
        strategy === 'balanced' && economyMode ? swapMap.get(normalizedBase.id) : undefined;
      const targetProd = !economyMode
        ? normalizedBase
        : swappedId && PRODUCT_MAP[swappedId]
          ? PRODUCT_MAP[swappedId]
          : strategy === 'balanced'
            ? normalizedBase
            : resolveProductForMode(normalizedBase, true, PRODUCT_MAP, rejectedSwapIds)
                .resolvedProduct;

      const storeForLine: StoreId =
        plan.isSplit && plan.splitResult?.assignments[item.productId]
          ? plan.splitResult.assignments[item.productId]
          : plan.storeId === 'split'
            ? (rankedStores[0]?.storeId ?? 'lidl')
            : plan.storeId;

      const offer = getEffectiveOffer(targetProd, storeForLine, activeCards);
      const displayName = offer.variantLabel ?? targetProd.canonicalName;
      const sizeLabel = targetProd.packageSize ? ` (${targetProd.packageSize})` : '';
      if (offer.isUnavailable) {
        const elsewhere = getBestVerifiedOffer(targetProd, activeCards);
        lines.push(
          `- ${item.quantity}× ${displayName}${sizeLabel} — ${
            elsewhere
              ? `nu e în plan; îl găsești la ${STORE_MAP[elsewhere.storeId].shortName} (${formatRon(elsewhere.price * item.quantity)})`
              : 'fără preț verificat'
          }`
        );
        continue;
      }
      lines.push(
        `- ${item.quantity}× ${displayName}${sizeLabel} — ${formatRon(offer.price * item.quantity)}${plan.isSplit ? ` [${STORE_MAP[storeForLine].shortName}]` : ''}`
      );
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedPlan(true);
      window.setTimeout(() => setCopiedPlan(false), 2500);
    } catch {
      // Clipboard might be restricted in headless contexts; ignore silently
    }
  };

  if (basket.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-white border border-[#EFE2D8] rounded-[20px] p-8 text-center space-y-4">
          <p className="text-xs font-bold text-[#765B60]">Comparație & Optimizare</p>
          <h1 className="text-xl font-extrabold text-[#421726]">
            Adaugă produse înainte să compari cele 9 magazine
          </h1>
          <p className="text-sm text-[#765B60] max-w-md mx-auto">
            Generează o rețetă sau o listă și revino aici ca să vezi unde merită să mergi.
          </p>
          <button
            type="button"
            onClick={onNavigateToAi}
            className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-full bg-[#421726] text-white text-sm font-bold hover:bg-[#5A2236] transition-colors"
          >
            <span>Mergi la Rețetă & Listă</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const hasNonDefaultFilters = filterMode !== 'all' || missionConstraints.maxStores === 1;
  const activeFilterSummary = [
    missionConstraints.maxStores === 1 ? '1 mag.' : 'Max 2 mag.',
    filterMode === 'physical' ? 'Fizic' : filterMode === 'online' ? 'Online' : 'Toate (9)',
  ].join(' · ');

  return (
    <div
      className={`${showProductMatrix ? 'max-w-5xl' : 'max-w-3xl'} mx-auto space-y-5 transition-[max-width] duration-200`}
    >
      {/* Calm Mobile-First Header */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onNavigateToBasket}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#765B60] hover:text-[#421726] py-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Înapoi la coș ({basket.length} produse)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            aria-expanded={showFilters}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-full border text-xs font-bold transition-colors ${
              showFilters || hasNonDefaultFilters
                ? 'bg-[#FCE2DB]/70 border-[#F78D79] text-[#421726]'
                : 'bg-white border-[#EFE2D8] text-[#765B60] hover:text-[#421726]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{hasNonDefaultFilters ? activeFilterSummary : 'Opțiuni'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#421726] tracking-tight">
            Unde merită să mergi
          </h1>

          {/* Single clean Mode Switcher (Fidel vs Economie) */}
          <div
            className="inline-flex items-center gap-1 p-1 bg-white border border-[#EFE2D8] rounded-full"
            role="group"
            aria-label="Mod de comparare produse"
          >
            <button
              type="button"
              onClick={() => onToggleEconomyMode(false)}
              aria-pressed={!economyMode}
              className={`px-3.5 py-1.5 min-h-[44px] rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                !economyMode
                  ? 'bg-[#421726] text-white'
                  : 'text-[#765B60] hover:text-[#421726]'
              }`}
            >
              Mod Fidel
            </button>
            <button
              type="button"
              onClick={() => onToggleEconomyMode(true)}
              aria-pressed={economyMode}
              className={`px-3.5 py-1.5 min-h-[44px] rounded-full text-xs font-bold transition-colors whitespace-nowrap tabular-nums ${
                economyMode
                  ? 'bg-[#421726] text-white'
                  : 'text-[#765B60] hover:text-[#421726]'
              }`}
            >
              Mod Economie
              {!economyMode && potentialEconomySavings > 0
                ? ` (-${formatRon(potentialEconomySavings)})`
                : ''}
            </button>
          </div>
        </div>

        {/* Collapsible Filter Sheet (hidden by default — zero dashboard clutter) */}
        {showFilters && (
          <div className="bg-white border border-[#EFE2D8] rounded-[16px] p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center gap-1 p-1 bg-[#FFF6EE] border border-[#EFE2D8] rounded-full"
                role="group"
                aria-label="Număr maxim de magazine"
              >
                {([1, 2] as const).map((limit) => (
                  <button
                    key={limit}
                    type="button"
                    onClick={() => onChangeMaxStores(limit)}
                    aria-pressed={missionConstraints.maxStores === limit}
                    className={`px-3 py-1 min-h-[44px] rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                      missionConstraints.maxStores === limit
                        ? 'bg-[#421726] text-white'
                        : 'text-[#765B60] hover:text-[#421726]'
                    }`}
                  >
                    {limit === 1 ? '1 magazin' : 'Max 2 mag.'}
                  </button>
                ))}
              </div>

              <div
                className="inline-flex items-center gap-1 p-1 bg-[#FFF6EE] border border-[#EFE2D8] rounded-full"
                role="group"
                aria-label="Filtrează după canalul magazinului"
              >
                {(
                  [
                    { id: 'all', label: 'Toate (9)' },
                    { id: 'physical', label: 'Magazin fizic' },
                    { id: 'online', label: 'Livrare online' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeFilterMode(opt.id)}
                    aria-pressed={filterMode === opt.id}
                    className={`px-3 py-1 min-h-[44px] rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                      filterMode === opt.id
                        ? 'bg-[#421726] text-white'
                        : 'text-[#765B60] hover:text-[#421726]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-[#765B60]">
              {!economyMode
                ? 'Mod Fidel · doar branduri consacrate'
                : 'Mod Economie · include mărci proprii echivalente'}
            </p>
          </div>
        )}

        {/* Rejected store banner (only when user actively rejected a store or swap) */}
        {(rejectedStoreIds.length > 0 || rejectedSwapIds.length > 0) && (
          <div className="rounded-[14px] bg-[#FCE2DB]/55 border border-[#F78D79]/60 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#421726]">
            <span>
              {rejectedStoreIds.length > 0 &&
                `Ai respins ${rejectedStoreIds.map((id) => STORE_MAP[id].shortName).join(', ')} — afișăm următoarea recomandare. `}
              {rejectedSwapIds.length > 0 &&
                `${rejectedSwapIds.length} înlocuiri modificate manual.`}
            </span>
            <button
              type="button"
              onClick={onResetRejections}
              className="inline-flex items-center gap-1 font-bold underline underline-offset-4 hover:opacity-80"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Resetează
            </button>
          </div>
        )}
      </header>

      {/* Hero Recommendation Card (Calm, Direct Decision — NOT a KPI dashboard) */}
      {plan && (() => {
        const displaySwaps =
          strategy === 'balanced' && fullBalancedPlan
            ? fullBalancedPlan.swapsApplied
            : plan.swapsApplied;

        const splitBreakdown =
          plan.isSplit && plan.splitResult
            ? (() => {
                const itemsA: string[] = [];
                const itemsB: string[] = [];
                for (const item of basket) {
                  const baseProd = PRODUCT_MAP[item.productId];
                  if (!baseProd) continue;
                  const assigned = plan.splitResult!.assignments[item.productId];
                  const { resolvedProduct } = resolveProductForMode(
                    baseProd,
                    strategy === 'fidelity' ? false : economyMode,
                    PRODUCT_MAP,
                    rejectedSwapIds
                  );
                  const shortLabel = `${item.quantity}× ${resolvedProduct.canonicalName.split(' ').slice(0, 2).join(' ')}`;
                  if (assigned === plan.splitResult!.storeA) itemsA.push(shortLabel);
                  else itemsB.push(shortLabel);
                }
                return { itemsA, itemsB };
              })()
            : null;

        return (
          <section
            className="bg-white border border-[#EFE2D8] rounded-[20px] p-5 sm:p-6 space-y-5"
            aria-label="Verdict unde merită să mergi"
          >
            {/* Subtle 3-Strategy Segmented Switcher inside the card */}
            {balancedPlan && cheapestPlan && singleStorePlan && fidelityPlan && (
              <div
                className="grid grid-cols-3 w-full items-center gap-1 p-1 bg-[#FFF6EE] border border-[#EFE2D8] rounded-[18px]"
                role="tablist"
                aria-label="Compară și alege varianta de optimizare"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={strategy === 'balanced'}
                  onClick={() => setStrategy('balanced')}
                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-[14px] transition-colors ${
                    strategy === 'balanced'
                      ? 'bg-[#421726] text-white'
                      : 'text-[#765B60] hover:text-[#421726]'
                  }`}
                >
                  <span className="text-[11px] font-bold leading-tight opacity-85">
                    Balanced
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold leading-tight tabular-nums whitespace-nowrap mt-0.5">
                    {formatRon(balancedPlan.totalWithDelivery)}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={strategy === 'cheapest'}
                  onClick={() => setStrategy('cheapest')}
                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-[14px] transition-colors ${
                    strategy === 'cheapest'
                      ? 'bg-[#421726] text-white'
                      : 'text-[#765B60] hover:text-[#421726]'
                  }`}
                >
                  <span className="text-[11px] font-bold leading-tight opacity-85">
                    Cel mai ieftin
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold leading-tight tabular-nums whitespace-nowrap mt-0.5">
                    {formatRon(cheapestPlan.totalWithDelivery)}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={
                    missionConstraints.maxStores === 1 &&
                    strategy === (economyMode ? 'cheapest' : 'fidelity')
                  }
                  onClick={() => {
                    onChangeMaxStores(1);
                    setStrategy(economyMode ? 'cheapest' : 'fidelity');
                  }}
                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-[14px] transition-colors ${
                    missionConstraints.maxStores === 1 &&
                    strategy === (economyMode ? 'cheapest' : 'fidelity')
                      ? 'bg-[#421726] text-white'
                      : 'text-[#765B60] hover:text-[#421726]'
                  }`}
                >
                  <span className="text-[11px] font-bold leading-tight opacity-85">
                    1 magazin
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold leading-tight tabular-nums whitespace-nowrap mt-0.5">
                    {formatRon(
                      economyMode
                        ? singleStorePlan.totalWithDelivery
                        : fidelityPlan.totalWithDelivery
                    )}
                  </span>
                </button>
              </div>
            )}

            {/* Main Answer: Store + Total + Plain-language reason */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-bold text-[#263B1D]">
                  {plan.isSplit
                    ? 'Merită să mergi la 2 magazine'
                    : 'Cel mai avantajos · 1 singur drum'}
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#421726] tracking-tight">
                  Mergi la {plan.storeLabel}
                </h2>
                {planPricedCount > 0 && (
                  <p
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums ${
                      plan.missingCount === 0
                        ? 'bg-[#DBE3C6]/70 text-[#263B1D]'
                        : 'bg-[#FCE2DB]/80 text-[#421726]'
                    }`}
                  >
                    {plan.missingCount === 0 && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                    <span>
                      {plan.availableCount} din {planPricedCount} produse disponibile
                    </span>
                  </p>
                )}
                <p className="text-xs sm:text-sm text-[#765B60] tabular-nums leading-relaxed">
                  {runnerUpSingleStore && runnerUpSavings > 0 ? (
                    <>
                      <strong className="text-[#263B1D]">
                        Economisești {formatRon(runnerUpSavings)} față de{' '}
                        {STORE_MAP[runnerUpSingleStore.storeId].shortName}
                      </strong>
                      {plan.savingsVsAverage > 0 &&
                        ` · ${formatRon(plan.savingsVsAverage)} sub media pieței`}
                    </>
                  ) : plan.savingsVsAverage > 0 ? (
                    <strong className="text-[#263B1D]">
                      Economisești {formatRon(plan.savingsVsAverage)} față de media pieței
                    </strong>
                  ) : (
                    <span>
                      {plan.missingCount === 0
                        ? 'Cel mai mic total real pentru coșul tău'
                        : 'Magazinul care acoperă cele mai multe produse din coș'}
                    </span>
                  )}
                  {currentBasketSummary && savingsVsCurrentBasket > 0 && (
                    <span>
                      {` · -${formatRon(savingsVsCurrentBasket)} vs ${STORE_MAP[currentBasketSummary.storeId].shortName}`}
                    </span>
                  )}
                </p>
              </div>

              <div className="sm:text-right shrink-0 pt-1 sm:pt-0">
                <p className="text-3xl sm:text-4xl font-extrabold text-[#421726] tabular-nums">
                  {formatRon(plan.totalWithDelivery)}
                </p>
                <p className="text-xs text-[#765B60] tabular-nums mt-0.5">
                  {plan.deliveryFee === 0
                    ? 'Fără taxă livrare'
                    : `Include livrare +${formatRon(plan.deliveryFee)}`}
                  {plan.cardSavings > 0 && ` · Carduri -${formatRon(plan.cardSavings)}`}
                </p>
              </div>
            </div>

            {/* Budget status line (only if user set a budget) */}
            {missionConstraints.budgetRon && (
              <p
                className={`text-xs font-bold tabular-nums ${
                  plan.totalWithDelivery <= missionConstraints.budgetRon
                    ? 'text-[#263B1D]'
                    : 'text-[#421726]'
                }`}
              >
                {plan.totalWithDelivery <= missionConstraints.budgetRon
                  ? `În bugetul setat (${formatRon(missionConstraints.budgetRon)}).`
                  : `Depășește bugetul (${formatRon(missionConstraints.budgetRon)}) cu +${formatRon(
                      plan.totalWithDelivery - missionConstraints.budgetRon
                    )}.`}
              </p>
            )}

            {/* 1 drum vs 2 magazine explanation */}
            {plan.isSplit && plan.splitResult && splitBreakdown ? (
              <div className="rounded-[14px] bg-[#DBE3C6]/45 border border-[#C5D3A3] p-4 space-y-2.5 text-xs">
                <p className="font-extrabold text-[#263B1D] tabular-nums">
                  {plan.splitResult.coverageGain > 0
                    ? `Cu 2 magazine găsești cu ${plan.splitResult.coverageGain} ${
                        plan.splitResult.coverageGain === 1 ? 'produs' : 'produse'
                      } mai mult decât doar la ${STORE_MAP[plan.splitResult.bestSingleStoreId].shortName}:`
                    : `Economisești ${formatRon(plan.splitResult.netSavings)} (${plan.splitResult.savingsPercent}%) împărțind coșul față de ${STORE_MAP[plan.splitResult.bestSingleStoreId].shortName}:`}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[#421726]">
                  <div>
                    <p className="font-bold tabular-nums">
                      1. {STORE_MAP[plan.splitResult.storeA].name} ({splitBreakdown.itemsA.length}{' '}
                      prod.) · {formatRon(plan.splitResult.subtotalA + plan.splitResult.deliveryA)}
                    </p>
                    <p className="text-[11px] text-[#765B60] mt-0.5">
                      {splitBreakdown.itemsA.join(', ')}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold tabular-nums">
                      2. {STORE_MAP[plan.splitResult.storeB].name} ({splitBreakdown.itemsB.length}{' '}
                      prod.) · {formatRon(plan.splitResult.subtotalB + plan.splitResult.deliveryB)}
                    </p>
                    <p className="text-[11px] text-[#765B60] mt-0.5">
                      {splitBreakdown.itemsB.join(', ')}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              !plan.isSplit &&
              missionConstraints.maxStores === 2 &&
              twoStoreCandidate && (
                <p className="text-xs text-[#765B60] tabular-nums bg-[#FFF6EE] rounded-[12px] px-3.5 py-2.5">
                  <strong className="text-[#421726]">1 drum merită mai mult:</strong>{' '}
                  {twoStoreCandidate.coverageGain > 0
                    ? `cu ${STORE_MAP[twoStoreCandidate.storeA].shortName} și ${STORE_MAP[twoStoreCandidate.storeB].shortName} ai găsi cu ${twoStoreCandidate.coverageGain} ${twoStoreCandidate.coverageGain === 1 ? 'produs' : 'produse'} mai mult, dar în 2 opriri.`
                    : twoStoreCandidate.netSavings > 0
                    ? `împărțirea între ${STORE_MAP[twoStoreCandidate.storeA].shortName} și ${STORE_MAP[twoStoreCandidate.storeB].shortName} ar economisi doar ${formatRon(twoStoreCandidate.netSavings)} (${twoStoreCandidate.savingsPercent}%).`
                    : `niciun coș combinat pe 2 magazine nu este mai ieftin decât ${plan.storeLabel}.`}
                </p>
              )
            )}

            {plan.warnings.length > 0 && (
              <div className="p-3 rounded-[12px] bg-[#FCE2DB]/60 border border-[#F78D79]/60 text-xs font-semibold text-[#421726]">
                {plan.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}

            {plan.cardOpportunity && (
              <div className="p-3 rounded-[12px] bg-[#DBE3C6]/45 border border-[#C5D3A3] flex flex-wrap items-center justify-between gap-2 text-xs text-[#263B1D]">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <CreditCard className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    Mai economisești{' '}
                    <strong className="tabular-nums">
                      {formatRon(plan.cardOpportunity.extraSavings)}
                    </strong>{' '}
                    cu <strong>{plan.cardOpportunity.cardProgram}</strong>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onToggleCard(plan.cardOpportunity!.cardId)}
                  className="min-h-[44px] px-1 font-bold underline underline-offset-4 hover:opacity-80 whitespace-nowrap"
                >
                  Am cardul
                </button>
              </div>
            )}

            {/* Selective Swaps when Mod Economie proposes swaps */}
            {displaySwaps.length > 0 && (
              <div className="border-t border-[#EFE2D8] pt-3.5 space-y-2">
                <p className="text-xs font-bold text-[#765B60]">
                  {strategy === 'balanced'
                    ? 'Înlocuiri propuse (debifează dacă preferi brandul inițial):'
                    : 'Înlocuiri incluse:'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  {displaySwaps.map((sw) => {
                    const isKept = !rejectedSwapIds.includes(sw.fromProductId);
                    if (strategy !== 'balanced') {
                      return (
                        <div
                          key={`${sw.fromProductId}-${sw.toProductId}`}
                          className="flex items-start justify-between gap-2 text-[#421726] leading-snug"
                        >
                          <span>
                            <span className="text-[#765B60]">{sw.fromName}</span> →{' '}
                            <strong>{sw.toName}</strong>
                          </span>
                          <span className="font-bold text-[#263B1D] tabular-nums shrink-0">
                            -{formatRon(sw.savings)}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={`${sw.fromProductId}-${sw.toProductId}`}
                        type="button"
                        onClick={() => onToggleRejectedSwap(sw.fromProductId)}
                        aria-pressed={isKept}
                        className={`w-full text-left flex items-start justify-between gap-2 leading-snug transition-opacity ${
                          isKept ? 'text-[#421726]' : 'text-[#765B60] opacity-65'
                        }`}
                      >
                        <span className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 w-4 h-4 rounded-[4px] border shrink-0 flex items-center justify-center ${
                              isKept
                                ? 'bg-[#421726] border-[#421726] text-white'
                                : 'bg-[#FFF6EE] border-[#EFE2D8] text-transparent'
                            }`}
                            aria-hidden="true"
                          >
                            <Check className="w-3 h-3" />
                          </span>
                          <span>
                            <span className="text-[#765B60]">{sw.fromName}</span> →{' '}
                            <strong className={isKept ? '' : 'line-through'}>{sw.toName}</strong>
                          </span>
                        </span>
                        <span className="font-bold text-[#263B1D] tabular-nums shrink-0">
                          {isKept ? `-${formatRon(sw.savings)}` : 'Păstrat'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Calm Action Bar */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={buildSnapshotAndApply}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[46px] rounded-full bg-[#421726] text-white text-sm font-bold hover:bg-[#5A2236] transition-colors whitespace-nowrap"
                >
                  <span>Acceptă și mergi în magazin</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  disabled={rankedStores.length <= 1}
                  onClick={() =>
                    onRejectRecommendedStore(plan.storeId, plan.splitResult?.storeA)
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-full bg-[#FFF6EE] border border-[#EFE2D8] text-xs font-bold text-[#421726] hover:bg-[#FCE2DB] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Respinge</span>
                </button>
              </div>

              <div className="flex items-center gap-4 text-xs font-bold text-[#765B60]">
                <button
                  type="button"
                  onClick={handleCopyShoppingPlan}
                  className="inline-flex items-center gap-1.5 hover:text-[#421726] py-1"
                >
                  {copiedPlan ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#263B1D]" aria-hidden="true" />
                      <span className="text-[#263B1D]">Copiat</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copiază</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowWhyDetails((prev) => !prev)}
                  aria-expanded={showWhyDetails}
                  className="inline-flex items-center gap-1 hover:text-[#421726] py-1"
                >
                  <span>De ce?</span>
                  {showWhyDetails ? (
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {showWhyDetails && (
              <div className="pt-3 border-t border-[#EFE2D8] space-y-2 text-xs text-[#421726]">
                <ul className="space-y-1.5">
                  {plan.reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2">
                      <Check
                        className="w-3.5 h-3.5 text-[#263B1D] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-[#765B60] tabular-nums">
                  Potrivire: <strong className="text-[#421726]">{plan.matchSummary.exactCount} produs identic</strong>
                  {plan.matchSummary.twinCount > 0 &&
                    ` · ${plan.matchSummary.twinCount} același produs, altă denumire`}
                  {plan.matchSummary.functionalCount > 0 &&
                    ` · ${plan.matchSummary.functionalCount} echivalent`}
                  {plan.matchSummary.privateLabelCount > 0 &&
                    ` · ${plan.matchSummary.privateLabelCount} Marcă proprie`}
                </p>
              </div>
            )}
          </section>
        );
      })()}

      {plan && (
        <PlanShoppingList
          groups={planGroups}
          missingLines={planMissingLines}
          unpricedLines={planUnpricedLines}
        />
      )}

      {/* Clean iOS/Android Style Store Ranking List */}
      {rankedStores.length > 0 && (() => {
        const bestTotal = rankedStores[0]?.totalWithDelivery ?? 0;
        const bestMissing = rankedStores[0]?.missingCount ?? 0;
        const displayedStores = showAllRankedStores
          ? rankedStores
          : rankedStores.slice(0, 3);

        return (
          <section
            className="bg-white border border-[#EFE2D8] rounded-[20px] overflow-hidden"
            aria-label="Clasamentul magazinelor pentru coșul tău"
          >
            <div className="px-5 py-3.5 border-b border-[#EFE2D8] flex items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-[#421726]">
                Clasament · acoperire, apoi total cu livrare
              </h2>
              {rankedStores.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllRankedStores((prev) => !prev)}
                  className="text-xs font-bold text-[#421726] underline underline-offset-4 whitespace-nowrap"
                >
                  {showAllRankedStores
                    ? 'Top 3'
                    : `Vezi toate (${rankedStores.length})`}
                </button>
              )}
            </div>

            <div className="divide-y divide-[#EFE2D8]">
              {displayedStores.map((summary, idx) => {
                const store = STORE_MAP[summary.storeId];
                const diffFromBest = round2(summary.totalWithDelivery - bestTotal);
                const isBest = idx === 0;
                // Totals are only comparable between stores that cover the same basket lines
                const sameCoverage = summary.missingCount === bestMissing;
                const pricedLines = summary.availableCount + summary.missingCount;
                const isSelectedInBasket =
                  hasChosenStore && activeStoreId === summary.storeId;

                return (
                  <div
                    key={summary.storeId}
                    className={`px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 ${
                      isBest ? 'bg-[#DBE3C6]/25' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 tabular-nums ${
                          isBest
                            ? 'bg-[#263B1D] text-white'
                            : 'bg-[#FFF6EE] border border-[#EFE2D8] text-[#421726]'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#421726]">
                          {store.name}
                          {isSelectedInBasket && (
                            <span className="ml-2 text-[11px] font-bold text-[#263B1D]">
                              · În coș
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[#765B60] tabular-nums leading-snug">
                          {store.channel === 'physical'
                            ? 'Fizic'
                            : store.channel === 'hybrid'
                              ? 'Fizic & Online'
                              : 'Online'}
                          {summary.deliveryFee > 0
                            ? ` · livrare +${formatRon(summary.deliveryFee)}`
                            : ' · 0 lei livrare'}
                          {summary.cardSavings > 0
                            ? ` · card -${formatRon(summary.cardSavings)}`
                            : ''}
                          {!summary.meetsMinOrder
                            ? ` · min. ${store.minOrder} lei`
                            : ''}
                        </p>
                        {pricedLines > 0 && (
                          <p
                            className={`text-[11px] font-bold tabular-nums ${
                              summary.missingCount === 0 ? 'text-[#263B1D]' : 'text-[#765B60]'
                            }`}
                          >
                            {summary.availableCount} din {pricedLines} produse
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p
                          className={`text-sm sm:text-base font-extrabold tabular-nums ${
                            isBest ? 'text-[#263B1D]' : 'text-[#421726]'
                          }`}
                        >
                          {summary.availableCount === 0 ? '—' : formatRon(summary.totalWithDelivery)}
                        </p>
                        <p
                          className={`text-[11px] font-bold tabular-nums ${
                            isBest ? 'text-[#263B1D]' : 'text-[#765B60]'
                          }`}
                        >
                          {isBest
                            ? bestMissing === 0
                              ? 'Cel mai ieftin'
                              : 'Cea mai bună acoperire'
                            : sameCoverage
                              ? `+${formatRon(diffFromBest)}`
                              : summary.missingCount - bestMissing === 1
                                ? 'lipsește 1 în plus'
                                : `lipsesc ${summary.missingCount - bestMissing} în plus`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectStore(summary.storeId, economyMode);
                          onNavigateToBasket();
                        }}
                        className={`px-3.5 py-2 min-h-[44px] rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                          isBest
                            ? 'bg-[#421726] text-white hover:bg-[#5A2236]'
                            : 'bg-[#FFF6EE] border border-[#EFE2D8] text-[#421726] hover:bg-[#FCE2DB]/60'
                        }`}
                      >
                        Alege
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Progressive Disclosure Rows (Collapsed by default — no spreadsheet clutter) */}
      <div className="bg-white border border-[#EFE2D8] rounded-[20px] divide-y divide-[#EFE2D8] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowProductMatrix((prev) => !prev)}
          aria-expanded={showProductMatrix}
          className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#FFF6EE]/60 transition-colors"
        >
          <span className="inline-flex items-center gap-2.5 text-sm font-bold text-[#421726]">
            <Table2 className="w-4 h-4 text-[#765B60] shrink-0" aria-hidden="true" />
            <span>Compară prețurile pe produs ({basket.length} produse)</span>
          </span>
          {showProductMatrix ? (
            <ChevronUp className="w-4 h-4 text-[#765B60] shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#765B60] shrink-0" aria-hidden="true" />
          )}
        </button>

        {filterMode !== 'physical' && deliveryStores.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDeliveryRules((prev) => !prev)}
            aria-expanded={showDeliveryRules}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#FFF6EE]/60 transition-colors"
          >
            <span className="inline-flex items-center gap-2.5 text-sm font-bold text-[#421726]">
              <Truck className="w-4 h-4 text-[#765B60] shrink-0" aria-hidden="true" />
              <span>Taxe de livrare & comandă minimă ({deliveryStores.length} online)</span>
            </span>
            {showDeliveryRules ? (
              <ChevronUp className="w-4 h-4 text-[#765B60] shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#765B60] shrink-0" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {/* Expanded Delivery Rules */}
      {showDeliveryRules && filterMode !== 'physical' && deliveryStores.length > 0 && (
        <div className="bg-white border border-[#EFE2D8] rounded-[16px] divide-y divide-[#EFE2D8]">
          {deliveryStores.map((summary) => {
            const store = STORE_MAP[summary.storeId];
            return (
              <div
                key={summary.storeId}
                className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <span className="font-bold text-[#421726]">{store.name}</span>
                <span className="text-[#765B60] tabular-nums">
                  {!summary.meetsMinOrder
                    ? `Mai adaugă ${formatRon(summary.amountToMinOrder)} până la min. ${store.minOrder} lei`
                    : summary.amountToFreeDelivery !== null &&
                        summary.amountToFreeDelivery > 0
                      ? `Livrare gratuită la încă ${formatRon(summary.amountToFreeDelivery)}`
                      : summary.storeId === 'sezamo' &&
                          activeCards.includes('sezamo_xtra')
                        ? 'Livrare gratuită cu Sezamo Xtra'
                        : 'Prag atins'}
                </span>
                <span className="font-bold tabular-nums text-[#421726]">
                  {summary.deliveryFee === 0 ? (
                    <span className="text-[#263B1D]">Gratuit</span>
                  ) : (
                    `+${formatRon(summary.deliveryFee)}`
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded Product x Store Price Comparison (only when explicitly opened) */}
      {showProductMatrix && (() => {
        // Only stores that sell at least one basket product are worth a column
        const matrixStores = rankedStores.filter((r) => r.availableCount > 0);
        if (matrixStores.length === 0) {
          return (
            <p className="bg-white border border-[#EFE2D8] rounded-[16px] px-4 py-3.5 text-xs text-[#765B60]">
              Niciun magazin nu are încă un preț verificat pentru produsele din coș.
            </p>
          );
        }
        const priorityIds = new Set<StoreId>();
        matrixStores.slice(0, 4).forEach((r) => priorityIds.add(r.storeId));
        if (plan) {
          if (plan.isSplit && plan.splitResult) {
            priorityIds.add(plan.splitResult.storeA);
            priorityIds.add(plan.splitResult.storeB);
          } else if (plan.storeId !== 'split') {
            priorityIds.add(plan.storeId);
          }
        }
        if (hasChosenStore && activeStoreId !== 'split') {
          priorityIds.add(activeStoreId);
        }

        const visibleStores = matrixShowAllStores
          ? matrixStores
          : matrixStores.filter((r) => priorityIds.has(r.storeId)).slice(0, 4);

        const swapMap = new Map(
          strategy === 'balanced' && economyMode && plan
            ? plan.swapsApplied.map((s) => [s.fromProductId, s.toProductId])
            : []
        );

        const computedRows = basket
          .map((item) => {
            const baseProd = PRODUCT_MAP[item.productId];
            if (!baseProd) return null;

            const { resolvedProduct: normalizedBase } = resolveProductForMode(
              baseProd,
              false,
              PRODUCT_MAP
            );
            const swappedTo = swapMap.get(normalizedBase.id);
            const resolvedProduct = !economyMode
              ? normalizedBase
              : swappedTo && PRODUCT_MAP[swappedTo]
                ? PRODUCT_MAP[swappedTo]
                : strategy === 'balanced'
                  ? normalizedBase
                  : resolveProductForMode(normalizedBase, true, PRODUCT_MAP, rejectedSwapIds)
                      .resolvedProduct;

            const allOffers = matrixStores.map((summary) => ({
              storeId: summary.storeId,
              offer: getEffectiveOffer(resolvedProduct, summary.storeId, activeCards),
            }));
            const visibleOffers = visibleStores.map((summary) => ({
              storeId: summary.storeId,
              offer: getEffectiveOffer(resolvedProduct, summary.storeId, activeCards),
            }));

            // Min/spread only compare stores that actually sell the product
            const realAll = allOffers.filter((rp) => !rp.offer.isUnavailable);
            const realVisible = visibleOffers.filter((rp) => !rp.offer.isUnavailable);
            const minBaseAll = realAll.length > 0 ? realAll : allOffers;
            const minBaseVisible = realVisible.length > 0 ? realVisible : visibleOffers;
            const minUnitPrice = Math.min(...minBaseAll.map((rp) => rp.offer.price));
            const maxVisibleUnit = Math.max(...minBaseVisible.map((rp) => rp.offer.price));
            const minVisibleUnit = Math.min(...minBaseVisible.map((rp) => rp.offer.price));
            const spreadLine =
              Math.round((maxVisibleUnit - minVisibleUnit) * item.quantity * 100) / 100;

            const assignedPlanStore: StoreId | null =
              plan?.isSplit && plan.splitResult?.assignments[item.productId]
                ? plan.splitResult.assignments[item.productId]
                : plan && !plan.isSplit && plan.storeId !== 'split'
                  ? plan.storeId
                  : null;

            return {
              item,
              baseProd,
              resolvedProduct,
              wasSwappedInPlan: Boolean(swappedTo),
              allOffers,
              visibleOffers,
              minUnitPrice,
              minVisibleUnit,
              spreadLine,
              assignedPlanStore,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        const significantCount = computedRows.filter((r) => r.spreadLine >= 1).length;
        const filteredRows = matrixOnlySpreadOver1
          ? computedRows.filter((r) => r.spreadLine >= 1)
          : computedRows;

        const sortedRows = matrixSortBySpread
          ? [...filteredRows].sort((a, b) => b.spreadLine - a.spreadLine)
          : filteredRows;

        const columnTotalsMap = new Map<
          StoreId,
          {
            subtotal: number;
            cardSavings: number;
            deliveryFee: number;
            totalWithDelivery: number;
            availableCount: number;
          }
        >();
        for (const summary of matrixStores) {
          let subtotal = 0;
          let cardSavings = 0;
          let availableCount = 0;
          for (const row of computedRows) {
            const match = row.allOffers.find((o) => o.storeId === summary.storeId);
            if (!match || match.offer.isUnavailable) continue;
            availableCount += 1;
            subtotal += match.offer.price * row.item.quantity;
            cardSavings += (match.offer.basePrice - match.offer.price) * row.item.quantity;
          }
          subtotal = round2(subtotal);
          cardSavings = round2(cardSavings);
          const delivery = computeDeliveryFee(summary.storeId, subtotal, activeCards, filterMode);
          columnTotalsMap.set(summary.storeId, {
            subtotal,
            cardSavings,
            deliveryFee: delivery.deliveryFee,
            totalWithDelivery: round2(subtotal + delivery.deliveryFee),
            availableCount,
          });
        }

        // "#1" goes to the cheapest column among those that cover the most products
        const maxColumnCoverage = Math.max(
          0,
          ...visibleStores.map((s) => columnTotalsMap.get(s.storeId)?.availableCount ?? 0)
        );
        const minMatrixTotal = Math.min(
          ...visibleStores
            .filter((s) => columnTotalsMap.get(s.storeId)?.availableCount === maxColumnCoverage)
            .map((s) => columnTotalsMap.get(s.storeId)?.totalWithDelivery ?? s.totalWithDelivery)
        );
        const isBestColumn = (storeId: StoreId): boolean => {
          const col = columnTotalsMap.get(storeId);
          return (
            col !== undefined &&
            maxColumnCoverage > 0 &&
            col.availableCount === maxColumnCoverage &&
            col.totalWithDelivery === minMatrixTotal
          );
        };

        return (
          <div className="bg-white border border-[#EFE2D8] rounded-[20px] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFE2D8] space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-[#421726]">
                    Prețuri pe produs ({visibleStores.length} din {matrixStores.length} magazine)
                  </h3>
                  <p className="text-xs text-[#765B60] mt-0.5">
                    Apasă pe un magazin din capul listei ca să îl alegi în coș.
                  </p>
                </div>

                <div
                  className="inline-flex items-center gap-1 p-1 bg-[#FFF6EE] border border-[#EFE2D8] rounded-full"
                  role="group"
                  aria-label="Număr de magazine în matrice"
                >
                  <button
                    type="button"
                    onClick={() => setMatrixShowAllStores(false)}
                    aria-pressed={!matrixShowAllStores}
                    className={`px-3 py-1 min-h-[44px] rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                      !matrixShowAllStores
                        ? 'bg-[#421726] text-white'
                        : 'text-[#765B60] hover:text-[#421726]'
                    }`}
                  >
                    Top {Math.min(4, matrixStores.length)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixShowAllStores(true)}
                    aria-pressed={matrixShowAllStores}
                    className={`px-3 py-1 min-h-[44px] rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                      matrixShowAllStores
                        ? 'bg-[#421726] text-white'
                        : 'text-[#765B60] hover:text-[#421726]'
                    }`}
                  >
                    Toate ({matrixStores.length})
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMatrixSortBySpread((prev) => !prev)}
                  aria-pressed={matrixSortBySpread}
                  className={`px-3 py-1.5 min-h-[44px] rounded-full font-bold border transition-colors ${
                    matrixSortBySpread
                      ? 'bg-[#FCE2DB]/70 border-[#F78D79] text-[#421726]'
                      : 'bg-[#FFF6EE] border-[#EFE2D8] text-[#765B60] hover:text-[#421726]'
                  }`}
                >
                  {matrixSortBySpread ? 'Diferență mare prima' : 'Sortare: diferență preț'}
                </button>

                {significantCount > 0 && significantCount < computedRows.length && (
                  <button
                    type="button"
                    onClick={() => setMatrixOnlySpreadOver1((prev) => !prev)}
                    aria-pressed={matrixOnlySpreadOver1}
                    className={`px-3 py-1.5 min-h-[44px] rounded-full font-bold border transition-colors ${
                      matrixOnlySpreadOver1
                        ? 'bg-[#421726] border-[#421726] text-white'
                        : 'bg-[#FFF6EE] border-[#EFE2D8] text-[#765B60] hover:text-[#421726]'
                    }`}
                  >
                    Diferențe &gt; 1 leu ({significantCount})
                  </button>
                )}
              </div>
            </div>

            {/* Mobile Stacked Product Comparison (Top 4) */}
            {!matrixShowAllStores && (
              <div className="sm:hidden divide-y divide-[#EFE2D8]">
                {sortedRows.map((row) => {
                  const isExpanded = expandedProductId === row.item.productId;
                  return (
                    <div key={row.item.productId} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-[#421726] leading-snug">
                            {row.item.quantity}× {row.resolvedProduct.canonicalName}
                          </p>
                          <p className="text-[11px] text-[#765B60] tabular-nums">
                            {formatProductMeta(row.resolvedProduct, { showEan: true })}
                            {row.wasSwappedInPlan && (
                              <span className="ml-1.5 font-bold text-[#263B1D]">· Înlocuit</span>
                            )}
                          </p>
                        </div>
                        {row.spreadLine >= 0.5 && (
                          <span className="text-[11px] font-extrabold text-[#421726] tabular-nums shrink-0">
                            ±{formatRon(row.spreadLine)}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        {row.visibleOffers.map(({ storeId, offer }) => {
                          const isMin = !offer.isUnavailable && offer.price === row.minVisibleUnit;
                          const linePrice = offer.price * row.item.quantity;
                          const extraCost =
                            Math.round((offer.price - row.minVisibleUnit) * row.item.quantity * 100) /
                            100;
                          const isPlanTarget = row.assignedPlanStore === storeId;

                          return (
                            <button
                              key={storeId}
                              type="button"
                              onClick={() => {
                                onSelectStore(storeId, economyMode);
                                onNavigateToBasket();
                              }}
                              className={`text-left rounded-[12px] p-2.5 border transition-colors ${
                                offer.isUnavailable
                                  ? 'bg-white border-dashed border-[#EFE2D8] text-[#765B60]'
                                  : isMin
                                  ? 'bg-[#DBE3C6]/65 border-[#C5D3A3] text-[#263B1D]'
                                  : isPlanTarget
                                    ? 'bg-[#FFF6EE] border-[#421726]/40 text-[#421726]'
                                    : 'bg-[#FFF6EE]/50 border-[#EFE2D8] text-[#421726]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 text-[11px]">
                                <span className="font-bold truncate">
                                  {STORE_MAP[storeId].shortName}
                                </span>
                                {isPlanTarget && (
                                  <span className="font-extrabold text-[10px] text-[#421726]">
                                    Plan
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-sm font-extrabold tabular-nums">
                                {offer.isUnavailable ? '—' : formatRon(linePrice)}
                              </p>
                              <p className="text-[10px] font-semibold tabular-nums opacity-85">
                                {isMin ? 'Cel mai ieftin' : offer.isUnavailable ? (offer.isOutOfStock ? 'Stoc epuizat' : '') : `+${formatRon(extraCost)}`}
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedProductId((prev) =>
                            prev === row.item.productId ? null : row.item.productId
                          )
                        }
                        aria-expanded={isExpanded}
                        className="text-[11px] font-bold text-[#421726] underline underline-offset-4"
                      >
                        {isExpanded
                          ? 'Ascunde detaliile'
                          : 'Vezi unde se găsește'}
                      </button>

                      {isExpanded && (
                        <div className="grid grid-cols-1 gap-1.5 pt-1 text-[11px] text-[#765B60]">
                          {row.allOffers
                            .filter(({ offer }) => !offer.isUnavailable)
                            .map(({ storeId, offer }) => (
                            <div
                              key={storeId}
                              className="rounded-[10px] bg-[#FFF6EE]/60 border border-[#EFE2D8] px-3 py-2 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-[#421726] truncate">
                                  {STORE_MAP[storeId].name} ·{' '}
                                  {offer.variantLabel ?? row.resolvedProduct.canonicalName}
                                </p>
                                <p className="tabular-nums">
                                  {getEquivalenceLevelLabel(offer.equivalenceLevel)}
                                  {offer.usedCardProgram ? ` · ${offer.usedCardProgram}` : ''}
                                  {offer.isUnavailable ? '' : offer.promoLabel && !offer.usedCardProgram ? ` · ${offer.promoLabel}` : ''}
                                </p>
                              </div>
                              <span className="font-extrabold text-[#421726] tabular-nums shrink-0">
                                {formatRon(offer.price * row.item.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Desktop & Expanded All-9 Table */}
            <div className={`${!matrixShowAllStores ? 'hidden sm:block' : 'block'} overflow-x-auto`}>
              <table
                className={`w-full text-left border-collapse ${
                  matrixShowAllStores ? 'min-w-[820px] lg:min-w-0' : 'min-w-0'
                }`}
              >
                <thead>
                  <tr className="border-b border-[#EFE2D8] bg-[#FFF6EE]/70">
                    <th
                      className={`py-3 text-xs font-extrabold text-[#421726] sticky left-0 bg-[#FFF6EE] z-10 ${
                        matrixShowAllStores
                          ? 'px-3 w-[178px] min-w-[170px]'
                          : 'px-4 min-w-[205px]'
                      }`}
                    >
                      Produs din coș
                    </th>
                    {visibleStores.map((summary) => {
                      const store = STORE_MAP[summary.storeId];
                      const colTotal = columnTotalsMap.get(summary.storeId);
                      const totalVal = colTotal?.totalWithDelivery ?? summary.totalWithDelivery;
                      const isBestCol = isBestColumn(summary.storeId);
                      const isWinner =
                        plan &&
                        (plan.isSplit
                          ? plan.splitResult?.storeA === summary.storeId ||
                            plan.splitResult?.storeB === summary.storeId
                          : plan.storeId === summary.storeId);

                      return (
                        <th
                          key={summary.storeId}
                          className={`py-2.5 text-center text-xs font-extrabold text-[#421726] ${
                            matrixShowAllStores ? 'px-1 min-w-[76px]' : 'px-2 min-w-[110px]'
                          } ${isWinner ? 'bg-[#DBE3C6]/25' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectStore(summary.storeId, economyMode);
                              onNavigateToBasket();
                            }}
                            title={`Alege ${store.name}`}
                            className="inline-flex flex-col items-center gap-0.5 hover:underline"
                          >
                            <span className="whitespace-nowrap">
                              {isBestCol ? '#1 ' : ''}
                              {store.shortName}
                            </span>
                            <span className="text-[11px] font-bold text-[#765B60] tabular-nums whitespace-nowrap">
                              {formatRon(totalVal)}
                            </span>
                            {colTotal && colTotal.availableCount < computedRows.length && (
                              <span className="text-[10px] font-semibold text-[#765B60] tabular-nums whitespace-nowrap">
                                {colTotal.availableCount}/{computedRows.length} prod.
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-[#263B1D] whitespace-nowrap">
                              Alege →
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const isExpanded = expandedProductId === row.item.productId;
                    return (
                      <Fragment key={row.item.productId}>
                        <tr className="border-b border-[#EFE2D8] last:border-b-0 align-top">
                          <td
                            className={`py-3 sticky left-0 bg-white z-10 border-r border-[#EFE2D8]/60 ${
                              matrixShowAllStores ? 'px-3' : 'px-4'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-bold text-[#421726] leading-snug">
                                {row.item.quantity}× {row.resolvedProduct.canonicalName}
                              </p>
                              {row.spreadLine >= 1 && (
                                <span className="text-[10px] font-extrabold text-[#421726] tabular-nums shrink-0">
                                  ±{formatRon(row.spreadLine)}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#765B60] tabular-nums mt-0.5">
                              {formatProductMeta(row.resolvedProduct, { showEan: true })}
                              {row.wasSwappedInPlan && (
                                <span className="ml-1.5 font-bold text-[#263B1D]">
                                  · Înlocuit
                                </span>
                              )}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedProductId((prev) =>
                                  prev === row.item.productId ? null : row.item.productId
                                )
                              }
                              aria-expanded={isExpanded}
                              className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#421726] underline underline-offset-4"
                            >
                              <span>{isExpanded ? 'Ascunde detaliile' : 'Vezi detalii'}</span>
                            </button>
                          </td>
                          {row.visibleOffers.map(({ storeId, offer }) => {
                            const isMin =
                              !offer.isUnavailable &&
                              (matrixShowAllStores
                                ? offer.price === row.minUnitPrice
                                : offer.price === row.minVisibleUnit);
                            const rowBaseline = matrixShowAllStores
                              ? row.minUnitPrice
                              : row.minVisibleUnit;
                            const linePrice = offer.price * row.item.quantity;
                            const diffFromMin =
                              Math.round((offer.price - rowBaseline) * row.item.quantity * 100) /
                              100;
                            const isPlanTarget = row.assignedPlanStore === storeId;
                            const shortLevel =
                              offer.equivalenceLevel === 1
                                ? 'Identic'
                                : offer.equivalenceLevel === 2
                                  ? 'Identic'
                                  : offer.equivalenceLevel === 3
                                    ? 'Echiv.'
                                    : offer.variantLabel
                                      ? offer.variantLabel.split(' ')[0]
                                      : 'Marcă pr.';

                            return (
                              <td
                                key={storeId}
                                className={`${matrixShowAllStores ? 'p-1' : 'p-1.5'} text-center ${
                                  isPlanTarget ? 'bg-[#FFF6EE]/45' : ''
                                }`}
                              >
                                <div
                                  className={`py-2 px-1 rounded-[12px] ${
                                    offer.isUnavailable
                                      ? 'text-[#765B60]'
                                      : isMin
                                      ? 'bg-[#DBE3C6] text-[#263B1D]'
                                      : isPlanTarget
                                        ? 'bg-[#FFF6EE] border border-[#421726]/25 text-[#421726]'
                                        : 'bg-[#FFF6EE]/45 text-[#421726]'
                                  }`}
                                >
                                  <p className="text-xs font-extrabold tabular-nums whitespace-nowrap">
                                    {offer.isUnavailable ? '—' : formatRon(linePrice)}
                                  </p>
                                  <p className="text-[10px] font-bold tabular-nums whitespace-nowrap mt-0.5">
                                    {isMin ? 'Minim' : offer.isUnavailable ? (offer.isOutOfStock ? 'Stoc epuizat' : '') : `+${formatRon(diffFromMin)}`}
                                  </p>
                                  {!offer.isUnavailable && (
                                    <p className="mt-0.5 text-[10px] opacity-75 truncate">
                                      {shortLevel}
                                      {offer.usedCardProgram ? ' · Card' : ''}
                                    </p>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-[#EFE2D8] bg-[#FFF6EE]/65">
                            <td colSpan={visibleStores.length + 1} className="px-4 py-3">
                              <p className="text-[11px] font-extrabold text-[#421726] mb-2">
                                Unde se găsește {row.resolvedProduct.canonicalName}:
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-[#765B60]">
                                {row.allOffers
                            .filter(({ offer }) => !offer.isUnavailable)
                            .map(({ storeId, offer }) => (
                                  <div
                                    key={storeId}
                                    className="rounded-[10px] bg-white border border-[#EFE2D8] px-3 py-2"
                                  >
                                    <p className="font-bold text-[#421726]">
                                      {STORE_MAP[storeId].name} · {formatRon(offer.price)}
                                    </p>
                                    <p className="text-[#421726] mt-0.5">
                                      {offer.variantLabel ?? row.resolvedProduct.canonicalName}
                                    </p>
                                    <p className="mt-0.5 tabular-nums">
                                      {getEquivalenceLevelLabel(offer.equivalenceLevel)}
                                      {offer.usedCardProgram ? ` · ${offer.usedCardProgram}` : ''}
                                  {offer.isUnavailable ? '' : offer.promoLabel && !offer.usedCardProgram ? ` · ${offer.promoLabel}` : ''}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#FFF6EE] border-t-2 border-[#EFE2D8]">
                    <td
                      className={`py-3 text-xs font-extrabold text-[#421726] sticky left-0 bg-[#FFF6EE] z-10 ${
                        matrixShowAllStores ? 'px-3' : 'px-4'
                      }`}
                    >
                      Total produse găsite (+ livrare)
                    </td>
                    {visibleStores.map((summary) => {
                      const colTotal = columnTotalsMap.get(summary.storeId);
                      const totalVal = colTotal?.totalWithDelivery ?? summary.totalWithDelivery;
                      const cardSav = colTotal?.cardSavings ?? summary.cardSavings;
                      const delFee = colTotal?.deliveryFee ?? summary.deliveryFee;
                      const isBestCol = isBestColumn(summary.storeId);

                      return (
                        <td key={summary.storeId} className="py-3 px-1.5 text-center">
                          <p
                            className={`text-xs font-extrabold tabular-nums whitespace-nowrap ${
                              isBestCol ? 'text-[#263B1D]' : 'text-[#421726]'
                            }`}
                          >
                            {formatRon(totalVal)}
                          </p>
                          {cardSav > 0 && (
                            <p className="text-[10px] text-[#263B1D] font-semibold tabular-nums whitespace-nowrap">
                              card -{formatRon(cardSav)}
                            </p>
                          )}
                          {delFee > 0 && (
                            <p className="text-[10px] text-[#765B60] tabular-nums whitespace-nowrap">
                              livr. +{formatRon(delFee)}
                            </p>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
