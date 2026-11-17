import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  ChefHat,
  Minus,
  Plus,
  Receipt,
  ScanBarcode,
  Settings,
  Share,
  ShoppingBasket,
  Store,
  Trash2,
} from 'lucide-react';
import { PRODUCT_MAP } from '../data/catalog.ts';
import { STORE_MAP } from '../data/stores.ts';
import type {
  AppliedPlanSnapshot,
  BasketItem,
  CanonicalProduct,
  LoyaltyCardId,
  StoreFilterMode,
  StoreId,
} from '../types.ts';
import {
  buildCoverageWarnings,
  computeInStoreProgress,
  computeSplitTwoStores,
  countVerifiedStores,
  formatRon,
  getEffectiveOffer,
  getRankedStores,
  hasVerifiedPrice,
  resolveProductForMode,
  round2,
} from '../utils/pricing.ts';
import {
  formatProductMeta,
  getBestVerifiedOffer,
  getStruckPrice,
} from '../utils/productDisplay.ts';
import { CrossStorePriceGrid } from './CrossStorePriceGrid.tsx';
import { EanScannerModal } from './EanScannerModal.tsx';
import { BottomSheet } from './ios/BottomSheet.tsx';
import { GroupedSection, LargeTitle } from './ios/Grouped.tsx';
import { ProductSearchPanel } from './ProductSearchPanel.tsx';
import { ProductThumbnail } from './ProductThumbnail.tsx';

interface BasketTabProps {
  basket: BasketItem[];
  activeStoreId: StoreId | 'split';
  hasChosenStore: boolean;
  channelMode: StoreFilterMode;
  economyMode: boolean;
  rejectedSwapIds: string[];
  onToggleRejectedSwap: (fromProductId: string) => void;
  inStoreMode: boolean;
  onToggleInStoreMode: () => void;
  activeCards: LoyaltyCardId[];
  appliedPlanSnapshot: AppliedPlanSnapshot | null;
  missionBudgetRon: number | null;
  onUpdateReceiptVerification: (
    updater: (prev: AppliedPlanSnapshot) => AppliedPlanSnapshot
  ) => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onToggleChecked: (productId: string) => void;
  onAddProduct: (productId: string, product?: CanonicalProduct) => void;
  onNavigateTab: (tab: 'basket' | 'ai' | 'matrix' | 'profile') => void;
  onSelectStore: (storeId: StoreId | 'split', nextEconomyMode?: boolean) => void;
}

const CATEGORY_ORDER = [
  'Fructe & Legume',
  'Lactate & Ouă',
  'Carne & Pește',
  'Cămară & Paste',
  'Cafea & Băuturi',
];

/** Ready-made starter baskets built from the everyday products Beavy always carries. */
const BASKET_TEMPLATES = [
  {
    id: 'breakfast',
    title: 'Mic dejun',
    productIds: ['zuzu_lapte_1l', 'napolact_unt_200g', 'paine_vel_pitar_500g', 'jacobs_kronung_250g'],
  },
  {
    id: 'pasta',
    title: 'Paste rapide',
    productIds: ['barilla_spaghetti_500g', 'rosii_cherry_500g', 'parmezan_150g', 'bunica_ulei_1l'],
  },
  {
    id: 'fresh',
    title: 'Proaspete',
    productIds: ['banane_1kg', 'avocado_2buc', 'rosii_cherry_500g', 'somon_file_250g'],
  },
];

export function BasketTab({
  basket,
  activeStoreId,
  hasChosenStore,
  channelMode,
  economyMode,
  rejectedSwapIds,
  onToggleRejectedSwap,
  inStoreMode,
  onToggleInStoreMode,
  activeCards,
  appliedPlanSnapshot,
  missionBudgetRon,
  onUpdateReceiptVerification,
  onUpdateQty,
  onRemoveItem,
  onToggleChecked,
  onAddProduct,
  onNavigateTab,
  onSelectStore,
}: BasketTabProps) {
  const [receiptAuditOpen, setReceiptAuditOpen] = useState(false);
  const [shelfDetailsOpen, setShelfDetailsOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);

  const activeRejectedSwaps = economyMode ? rejectedSwapIds : [];
  const rankedStores = getRankedStores(
    basket,
    activeCards,
    economyMode,
    channelMode,
    PRODUCT_MAP,
    [],
    activeRejectedSwaps
  );
  const splitResult = computeSplitTwoStores(
    basket,
    activeCards,
    economyMode,
    channelMode,
    PRODUCT_MAP,
    [],
    activeRejectedSwaps
  );

  const cheapestSingle = rankedStores[0];
  const isSplitActive = hasChosenStore && activeStoreId === 'split' && splitResult !== null;
  const resolvedActiveStoreId: StoreId = !hasChosenStore
    ? (cheapestSingle?.storeId ?? 'lidl')
    : activeStoreId === 'split'
      ? (cheapestSingle?.storeId ?? 'lidl')
      : activeStoreId;

  const activeSummary =
    rankedStores.find((r) => r.storeId === resolvedActiveStoreId) ?? cheapestSingle;

  const activeTotal =
    isSplitActive && splitResult
      ? splitResult.totalWithDelivery
      : (activeSummary?.totalWithDelivery ?? 0);

  const totalUnits = basket.reduce((sum, i) => sum + i.quantity, 0);

  const inStoreProgress = computeInStoreProgress(
    basket,
    resolvedActiveStoreId,
    activeCards,
    economyMode,
    isSplitActive ? splitResult?.assignments : null,
    PRODUCT_MAP,
    activeRejectedSwaps
  );

  const progressPct =
    inStoreProgress.totalCount > 0
      ? Math.round((inStoreProgress.checkedCount / inStoreProgress.totalCount) * 100)
      : 0;

  // Lines with no verified price at any store: shown separately, never part of a total
  const unpricedLines = basket.flatMap((item) => {
    const baseProduct = PRODUCT_MAP[item.productId];
    if (!baseProduct) return [];
    const { resolvedProduct } = resolveProductForMode(
      baseProduct,
      economyMode,
      PRODUCT_MAP,
      activeRejectedSwaps
    );
    return hasVerifiedPrice(resolvedProduct) ? [] : [{ item, product: resolvedProduct }];
  });
  const pricedLineCount = basket.length - unpricedLines.length;
  const coverageNotes = buildCoverageWarnings(
    isSplitActive && splitResult
      ? `${STORE_MAP[splitResult.storeA].shortName} + ${STORE_MAP[splitResult.storeB].shortName}`
      : STORE_MAP[resolvedActiveStoreId].name,
    isSplitActive && splitResult ? splitResult.missingCount : (activeSummary?.missingCount ?? 0),
    0
  );

  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [checkedOpen, setCheckedOpen] = useState(true);
  const [sortMode, setSortMode] = useState<'aisle' | 'recent'>('aisle');
  const [shared, setShared] = useState(false);
  const [undo, setUndo] = useState<{ productId: string; quantity: number }[] | null>(null);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 4000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const removeWithUndo = (productId: string, quantity: number) => {
    onRemoveItem(productId);
    setUndo([{ productId, quantity }]);
  };
  const restoreRemoved = () => {
    if (!undo) return;
    for (const removed of undo) {
      onAddProduct(removed.productId, PRODUCT_MAP[removed.productId]);
      if (removed.quantity > 1) onUpdateQty(removed.productId, removed.quantity - 1);
    }
    setUndo(null);
  };


  const pricedLines = basket.flatMap((item) => {
    const baseProduct = PRODUCT_MAP[item.productId];
    if (!baseProduct) return [];
    const { resolvedProduct, swappedFrom } = resolveProductForMode(
      baseProduct,
      economyMode,
      PRODUCT_MAP,
      activeRejectedSwaps
    );
    if (!hasVerifiedPrice(resolvedProduct)) return [];
    const normalizedNational = resolveProductForMode(baseProduct, false, PRODUCT_MAP).resolvedProduct;
    const isIndividuallyKeptBrand =
      economyMode &&
      Boolean(normalizedNational.economyEquivalentId) &&
      rejectedSwapIds.includes(normalizedNational.id);
    const targetStoreId: StoreId =
      isSplitActive && splitResult?.assignments[item.productId]
        ? splitResult.assignments[item.productId]
        : resolvedActiveStoreId;
    const offer = getEffectiveOffer(resolvedProduct, targetStoreId, activeCards);
    return [
      {
        item,
        resolvedProduct,
        swappedFrom,
        normalizedNational,
        isIndividuallyKeptBrand,
        targetStoreId,
        offer,
        lineTotal: offer.price * item.quantity,
        struckPrice: getStruckPrice(offer),
        altOffer: offer.isUnavailable ? getBestVerifiedOffer(resolvedProduct, activeCards) : null,
        otherStoreCount: offer.isUnavailable ? countVerifiedStores(resolvedProduct) : 0,
        infoDealLabel: !offer.isUnavailable && offer.promoIsInfoOnly ? offer.promoLabel : null,
      },
    ];
  });
  type BasketLine = (typeof pricedLines)[number];

  const openLines = inStoreMode ? pricedLines.filter((l) => !l.item.checkedInStore) : pricedLines;
  const checkedLines = inStoreMode ? pricedLines.filter((l) => l.item.checkedInStore) : [];

  const removeChecked = () => {
    const removed = checkedLines.map((l) => ({
      productId: l.item.productId,
      quantity: l.item.quantity,
    }));
    removed.forEach((r) => onRemoveItem(r.productId));
    setUndo(removed);
  };

  const handleShareList = async () => {
    const text = [
      'Lista mea de cumpărături (Beavy)',
      ...basket.flatMap((i) => {
        const product = PRODUCT_MAP[i.productId];
        if (!product) return [];
        return [
          `- ${i.quantity}× ${product.canonicalName}${product.packageSize ? ` (${product.packageSize})` : ''}`,
        ];
      }),
    ].join('\n');
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setShared(true);
        window.setTimeout(() => setShared(false), 2500);
      }
    } catch {
      // Sharing was cancelled or is unavailable; nothing to do
    }
  };

  const groupByCategory = (lines: BasketLine[]) => {
    const map = new Map<string, BasketLine[]>();
    for (const line of lines) {
      const category = line.resolvedProduct.category || 'Altele';
      map.set(category, [...(map.get(category) ?? []), line]);
    }
    const order = (c: string) => {
      const i = CATEGORY_ORDER.indexOf(c);
      return i === -1 ? 99 : i;
    };
    return [...map.entries()].sort(([a], [b]) => order(a) - order(b));
  };

  const renderRow = (line: BasketLine) => {
    const {
      item,
      resolvedProduct,
      swappedFrom,
      normalizedNational,
      isIndividuallyKeptBrand,
      targetStoreId,
      offer,
      lineTotal,
      struckPrice,
      altOffer,
      otherStoreCount,
      infoDealLabel,
    } = line;
    const expanded = expandedProductId === item.productId;
    const checked = inStoreMode && item.checkedInStore;
    return (
      <div
        key={item.productId}
        className="relative after:content-[''] after:absolute after:bottom-0 after:left-[84px] after:right-0 after:h-px after:bg-[#EFE2D8] last:after:hidden"
      >
        <article className={`px-4 py-3 transition-colors ${checked ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setExpandedProductId(expanded ? null : item.productId)}
              aria-expanded={expanded}
              aria-label={`Prețuri la toate magazinele pentru ${resolvedProduct.canonicalName}`}
              className="flex-1 min-w-0 flex items-center gap-3 text-left"
            >
              <ProductThumbnail
                category={resolvedProduct.category}
                name={resolvedProduct.canonicalName}
                imageUrl={resolvedProduct.imageUrl}
              />
              <span className="flex-1 min-w-0">
                <span
                  className={`block text-sm font-bold text-[#421726] leading-snug line-clamp-2 ${
                    checked ? 'line-through' : ''
                  }`}
                >
                  {hasChosenStore
                    ? (offer.variantLabel ?? resolvedProduct.canonicalName)
                    : resolvedProduct.canonicalName}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-[#765B60] tabular-nums">
                  <span className="truncate">
                    {inStoreMode ? `${item.quantity} × ` : ''}
                    {formatProductMeta(resolvedProduct)}
                    {isSplitActive && ` · ${STORE_MAP[targetStoreId].shortName}`}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </span>
              </span>
            </button>

            <div className="shrink-0 flex flex-col items-end gap-1.5">
              {offer.isUnavailable ? (
                <p className="text-sm font-bold text-[#765B60]">—</p>
              ) : (
                <div className="text-right">
                  <p className="text-base font-extrabold text-[#421726] tabular-nums">
                    {formatRon(lineTotal)}
                  </p>
                  {struckPrice !== null && (
                    <p className="text-[11px] text-[#765B60] line-through tabular-nums">
                      {formatRon(struckPrice * item.quantity)}
                    </p>
                  )}
                  {offer.usedCardProgram && (
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-[#DBE3C6] text-[#263B1D] text-[11px] font-bold">
                      Card
                    </span>
                  )}
                </div>
              )}
              {!inStoreMode && (
              <div className="inline-flex items-center rounded-full border border-[#EFE2D8] bg-white">
                <button
                  type="button"
                  onClick={() =>
                    item.quantity <= 1
                      ? removeWithUndo(item.productId, item.quantity)
                      : onUpdateQty(item.productId, -1)
                  }
                  aria-label={
                    item.quantity <= 1
                      ? `Șterge ${resolvedProduct.canonicalName} din coș`
                      : `Scade cantitatea pentru ${resolvedProduct.canonicalName}`
                  }
                  className="w-11 h-11 flex items-center justify-center text-[#421726] hover:bg-[#FCE2DB]/60 rounded-l-full transition-colors"
                >
                  {item.quantity <= 1 ? (
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Minus className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
                <span className="text-sm font-bold text-[#421726] tabular-nums min-w-[24px] text-center">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateQty(item.productId, 1)}
                  aria-label={`Crește cantitatea pentru ${resolvedProduct.canonicalName}`}
                  className="w-11 h-11 flex items-center justify-center text-[#421726] hover:bg-[#FCE2DB]/60 rounded-r-full transition-colors"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              )}
            </div>
            {inStoreMode && (
              <button
                type="button"
                onClick={() => onToggleChecked(item.productId)}
                aria-label={
                  item.checkedInStore
                    ? `Debifează ${resolvedProduct.canonicalName}`
                    : `Bifează ${resolvedProduct.canonicalName} în coșul fizic`
                }
                aria-pressed={item.checkedInStore}
                className="w-11 h-11 shrink-0 flex items-center justify-center"
              >
                <span
                  className={`w-7 h-7 rounded-[9px] border-2 flex items-center justify-center transition-colors ${
                    item.checkedInStore
                      ? 'bg-[#F78D79] border-[#F78D79] text-[#421726]'
                      : 'bg-white border-[#EFE2D8] text-transparent'
                  }`}
                >
                  <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
                </span>
              </button>
            )}
          </div>

          {(offer.isUnavailable || infoDealLabel || (economyMode && swappedFrom && !swappedFrom.isPrivateLabel) || isIndividuallyKeptBrand) && (
            <div className="mt-1.5 space-y-1 text-xs">
              {offer.isUnavailable && (
                <p className="font-semibold text-[#421726] tabular-nums">
                  {offer.isOutOfStock ? 'Stoc epuizat' : 'Nu se găsește'} la{' '}
                  {STORE_MAP[targetStoreId].shortName}
                  {altOffer
                    ? ` · îl găsești la ${STORE_MAP[altOffer.storeId].shortName}, ${formatRon(altOffer.price)}${
                        otherStoreCount > 1 ? ` (+${otherStoreCount - 1})` : ''
                      }`
                    : ''}
                </p>
              )}
              {infoDealLabel && <p className="text-[#765B60]">Ofertă: {infoDealLabel}</p>}
              {economyMode && swappedFrom && !swappedFrom.isPrivateLabel && (
                <button
                  type="button"
                  onClick={() => onToggleRejectedSwap(normalizedNational.id)}
                  className="min-h-[44px] font-semibold text-[#263B1D] underline underline-offset-4 text-left"
                >
                  Înlocuit din {swappedFrom.brand} · păstrează marca
                </button>
              )}
              {isIndividuallyKeptBrand && (
                <button
                  type="button"
                  onClick={() => onToggleRejectedSwap(normalizedNational.id)}
                  className="min-h-[44px] font-semibold text-[#263B1D] underline underline-offset-4 text-left"
                >
                  Folosește marcă proprie
                </button>
              )}
            </div>
          )}
        </article>

        {expanded && (
          <div className="px-4 pb-3">
            <CrossStorePriceGrid
              product={resolvedProduct}
              activeCards={activeCards}
              activeStoreId={hasChosenStore ? resolvedActiveStoreId : undefined}
              onSelectStore={(storeId) => onSelectStore(storeId, economyMode)}
              defaultExpanded
            />
          </div>
        )}
      </div>
    );
  };

  const searchRow = (
    <ProductSearchPanel
      inline
      basket={basket}
      economyMode={economyMode}
      activeCards={activeCards}
      storeId={resolvedActiveStoreId}
      hasChosenStore={hasChosenStore}
      onAddProduct={onAddProduct}
      onUpdateQty={onUpdateQty}
      trailing={
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          aria-label="Scanează un cod de bare"
          className="w-11 h-11 flex items-center justify-center text-[#421726]"
        >
          <ScanBarcode className="w-5 h-5" aria-hidden="true" />
        </button>
      }
      rowEnd={
        <button
          type="button"
          role="switch"
          aria-checked={inStoreMode}
          onClick={onToggleInStoreMode}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-[12px] text-sm font-bold transition-colors whitespace-nowrap ${
            inStoreMode ? 'bg-[#421726] text-white' : 'bg-[#EFE2D8]/70 text-[#421726]'
          }`}
        >
          <Store className="w-4 h-4" aria-hidden="true" />
          <span>În magazin</span>
        </button>
      }
    />
  );

  const storeCount = Object.keys(STORE_MAP).length;
  if (basket.length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 pb-28">
        <LargeTitle title="Coș" subtitle="Încă nu ai niciun produs" />
        {searchRow}

        <section className="text-center py-6 space-y-3" aria-label="Coș gol">
          <div className="w-14 h-14 rounded-full bg-[#FCE2DB] text-[#421726] mx-auto flex items-center justify-center">
            <ShoppingBasket className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-extrabold text-[#421726]">Coșul tău e gol</h2>
          <p className="text-sm text-[#765B60] max-w-xs mx-auto">
            Caută un produs mai sus sau cere o listă gata făcută. Îți arătăm apoi unde ieși cel mai ieftin.
          </p>
          <button
            type="button"
            onClick={() => onNavigateTab('ai')}
            className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-[14px] bg-[#421726] text-white text-[15px] font-bold hover:bg-[#5A2236] transition-colors"
          >
            <ChefHat className="w-4 h-4" aria-hidden="true" />
            <span>Mergi la Listă</span>
          </button>
        </section>

        <section className="space-y-1.5" aria-label="Sugestii rapide">
          <h2 className="px-1 text-lg font-extrabold text-[#421726]">
            Sugestii rapide
          </h2>
          <div className="bg-white rounded-[12px] overflow-hidden divide-y divide-[#EFE2D8]">
            {BASKET_TEMPLATES.map((template) => {
              const products = template.productIds
                .map((id) => PRODUCT_MAP[id])
                .filter((product): product is CanonicalProduct => Boolean(product));
              if (products.length === 0) return null;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => products.forEach((product) => onAddProduct(product.id))}
                  className="w-full min-h-[60px] px-4 py-2.5 flex items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-[#421726]">{template.title}</span>
                    <span className="block text-xs text-[#765B60] truncate">
                      {products.length} produse ·{' '}
                      {products
                        .map((product) => product.canonicalName.split(' ').slice(0, 2).join(' '))
                        .join(', ')}
                    </span>
                  </span>
                  <Plus className="w-5 h-5 text-[#765B60] shrink-0" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>

        <EanScannerModal
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          basket={basket}
          resolvedStoreId={resolvedActiveStoreId}
          hasChosenStore={hasChosenStore}
          economyMode={economyMode}
          activeCards={activeCards}
          onAddProduct={onAddProduct}
          onUpdateQty={onUpdateQty}
        />
      </div>
    );
  }

  const budgetPct = missionBudgetRon ? Math.min(100, Math.round((activeTotal / missionBudgetRon) * 100)) : 0;
  const overBudget = Boolean(missionBudgetRon && activeTotal > missionBudgetRon);

  return (
    <>
    <div className="max-w-3xl mx-auto space-y-5 pb-28">
      <LargeTitle
        eyebrow="Lista ta de cumpărături"
        title="Coș"
        trailing={
          <button
            type="button"
            onClick={() => onNavigateTab('profile')}
            aria-label="Setări și carduri"
            className="w-11 h-11 -mr-2 shrink-0 rounded-full flex items-center justify-center text-[#421726]"
          >
            <Settings className="w-6 h-6" aria-hidden="true" />
          </button>
        }
      />

      <section className="rounded-[20px] bg-[#421726] p-5 space-y-3" aria-label="Totalul coșului">
        <div>
          <p className="text-4xl font-extrabold tracking-tight text-white tabular-nums">
            {hasChosenStore ? formatRon(activeTotal) : `~${formatRon(activeTotal)}`}
          </p>
          <p className="mt-1 text-sm text-[#FCE2DB] tabular-nums">
            {basket.length} {basket.length === 1 ? 'produs' : 'produse'} · {totalUnits}{' '}
            {totalUnits === 1 ? 'bucată' : 'bucăți'}
          </p>
        </div>

        {missionBudgetRon ? (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  overBudget ? 'bg-[#F78D79]' : 'bg-[#DBE3C6]'
                }`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <p className="text-xs text-[#FCE2DB] tabular-nums">
              {overBudget
                ? `Cu ${formatRon(activeTotal - missionBudgetRon)} peste bugetul de ${formatRon(missionBudgetRon)}`
                : `${formatRon(activeTotal)} din ${formatRon(missionBudgetRon)} buget`}
            </p>
          </div>
        ) : null}

        {hasChosenStore ? (
          <button
            type="button"
            onClick={() => setStoreSheetOpen(true)}
            className="inline-flex items-center gap-1.5 min-h-[44px] pl-3.5 pr-3 rounded-full bg-[#DBE3C6] text-[#263B1D] text-sm font-bold"
          >
            <Store className="w-4 h-4" aria-hidden="true" />
            <span>
              {isSplitActive && splitResult
                ? `${STORE_MAP[splitResult.storeA].shortName} + ${STORE_MAP[splitResult.storeB].shortName}`
                : STORE_MAP[resolvedActiveStoreId].name}
            </span>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigateTab('matrix')}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-[#F78D79] text-[#421726] text-sm font-extrabold hover:bg-[#FCE2DB] transition-colors"
          >
            <span>Compară {storeCount} magazine</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </section>

      {searchRow}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setSortMode((prev) => (prev === 'aisle' ? 'recent' : 'aisle'))}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-white text-sm font-bold text-[#421726]"
        >
          <ArrowUpDown className="w-4 h-4 text-[#765B60]" aria-hidden="true" />
          <span>{sortMode === 'aisle' ? 'Pe raioane' : 'Adăugate recent'}</span>
        </button>
        <button
          type="button"
          onClick={handleShareList}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-white text-sm font-bold text-[#421726]"
        >
          {shared ? (
            <Check className="w-4 h-4 text-[#263B1D]" aria-hidden="true" />
          ) : (
            <Share className="w-4 h-4 text-[#765B60]" aria-hidden="true" />
          )}
          <span>{shared ? 'Copiată' : 'Trimite lista'}</span>
        </button>
      </div>

      {coverageNotes.length > 0 && (
        <p className="text-sm text-[#421726]" role="status">
          {coverageNotes.join(' ')}
        </p>
      )}

        {rankedStores.length > 0 && (
          <section className="space-y-1.5" aria-label="Unde merită să cumperi">
            <div className="px-4 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#765B60]">
                Unde merită
              </h2>
              <button
                type="button"
                onClick={() => setStoreSheetOpen(true)}
                className="min-h-[44px] -my-3 text-[15px] font-semibold text-[#421726]"
              >
                Toate
              </button>
            </div>
            <div className="bg-white rounded-[12px] overflow-hidden">
              {rankedStores.slice(0, 3).map((summary, idx) => {
                const isSelected =
                  hasChosenStore && !isSplitActive && resolvedActiveStoreId === summary.storeId;
                const sameCoverage = summary.missingCount === rankedStores[0].missingCount;
                const diff = round2(summary.totalWithDelivery - rankedStores[0].totalWithDelivery);
                const priced = summary.availableCount + summary.missingCount;
                return (
                  <button
                    key={summary.storeId}
                    type="button"
                    onClick={() => onSelectStore(summary.storeId, economyMode)}
                    aria-pressed={isSelected}
                    className="relative w-full min-h-[60px] pl-4 pr-4 py-2.5 flex items-center gap-3 text-left active:bg-[#EFE2D8]/50 after:content-[''] after:absolute after:bottom-0 after:left-[52px] after:right-0 after:h-px after:bg-[#EFE2D8] last:after:hidden"
                  >
                    <span
                      className={`w-7 shrink-0 text-center text-[17px] font-extrabold tabular-nums ${
                        idx === 0 ? 'text-[#263B1D]' : 'text-[#765B60]'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[17px] font-semibold text-[#421726] truncate">
                        {STORE_MAP[summary.storeId].name}
                      </span>
                      <span className="block text-[13px] text-[#765B60] tabular-nums">
                        {summary.availableCount} din {priced} produse
                        {idx > 0 && sameCoverage && diff > 0 ? ` · +${formatRon(diff)}` : ''}
                      </span>
                    </span>
                    <span className="text-[17px] font-semibold text-[#421726] tabular-nums shrink-0">
                      {formatRon(summary.totalWithDelivery)}
                    </span>
                    <span className="w-5 shrink-0 flex justify-center" aria-hidden="true">
                      {isSelected && <Check className="w-5 h-5 text-[#F78D79]" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {isSplitActive && splitResult && (
          <div className="bg-[#FCE2DB]/55 border border-[#F78D79]/60 rounded-[16px] p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-[#421726]">
                Split optim: {STORE_MAP[splitResult.storeA].name} +{' '}
                {STORE_MAP[splitResult.storeB].name}
              </p>
              <p className="text-xs text-[#765B60] mt-0.5 tabular-nums">
                {splitResult.coverageGain > 0
                  ? `Găsești cu ${splitResult.coverageGain} ${splitResult.coverageGain === 1 ? 'produs' : 'produse'} mai mult decât doar la ${STORE_MAP[splitResult.bestSingleStoreId].name}`
                  : `Economisești ${formatRon(splitResult.netSavings)} (${splitResult.savingsPercent}%) față de ${STORE_MAP[splitResult.bestSingleStoreId].name}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('matrix')}
              className="px-3.5 py-1.5 min-h-[44px] rounded-full bg-white border border-[#EFE2D8] text-xs font-bold text-[#421726] hover:bg-[#FFF6EE] transition-colors whitespace-nowrap"
            >
              Alege 1 magazin
            </button>
          </div>
        )}

      {inStoreMode && (
        <section className="bg-white rounded-[16px] p-4 space-y-3" aria-label="Progres în magazin">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-[#421726]">
            <span className="tabular-nums">
              În coșul fizic: {formatRon(inStoreProgress.checkedTotal)}
              <span className="mx-1.5 text-[#765B60]" aria-hidden="true">·</span>
              <span className="text-[#765B60] font-semibold">
                Rămas: {formatRon(inStoreProgress.remainingTotal)}
              </span>
            </span>
            <span className="text-xs font-semibold text-[#765B60] tabular-nums">
              {inStoreProgress.checkedCount} / {inStoreProgress.totalCount} bifate
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#EFE2D8] overflow-hidden">
            <div
              className="h-full bg-[#421726] rounded-full transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </section>
      )}

      {appliedPlanSnapshot && (
        <button
          type="button"
          onClick={() => setReceiptAuditOpen((prev) => !prev)}
          aria-expanded={receiptAuditOpen}
          className="w-full min-h-[52px] px-4 rounded-[14px] bg-white flex items-center justify-between gap-3 text-left"
        >
          <span className="inline-flex items-center gap-2 text-[15px] font-bold text-[#421726]">
            <Receipt className="w-4 h-4" aria-hidden="true" />
            Am ajuns la casă · Verifică bon
          </span>
          <ChevronDown
            className={`w-4 h-4 text-[#765B60] transition-transform ${receiptAuditOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}

        {/* Pasul 6: Verificăm rezultatul (Estimat vs. Prețuri efective & Bon de cumpărături) */}
        {appliedPlanSnapshot && receiptAuditOpen && (() => {
          const itemRows = basket.map((item) => {
            const baseProd = PRODUCT_MAP[item.productId];
            if (!baseProd) return null;
            const { resolvedProduct } = resolveProductForMode(
              baseProd,
              economyMode,
              PRODUCT_MAP
            );
            const targetStoreId =
              isSplitActive && splitResult?.assignments[item.productId]
                ? splitResult.assignments[item.productId]
                : resolvedActiveStoreId;
            const snapEst =
              appliedPlanSnapshot.itemEstimates[resolvedProduct.id] ??
              appliedPlanSnapshot.itemEstimates[baseProd.id];
            const expectedUnit =
              snapEst?.expectedUnitPrice ??
              getEffectiveOffer(resolvedProduct, targetStoreId, activeCards).price;
            const actualUnit =
              appliedPlanSnapshot.actualUnitPrices[resolvedProduct.id] ?? expectedUnit;
            return {
              productId: resolvedProduct.id,
              name: snapEst?.productName ?? resolvedProduct.canonicalName,
              ean: resolvedProduct.ean,
              qty: item.quantity,
              expectedUnit,
              actualUnit,
            };
          }).filter((row): row is NonNullable<typeof row> => row !== null);

          const computedActualSubtotal = round2(
            itemRows.reduce((sum, r) => sum + r.actualUnit * r.qty, 0)
          );
          const computedActualTotal = round2(
            computedActualSubtotal + appliedPlanSnapshot.estimatedDeliveryFee
          );
          const parsedReceiptInput = Number(
            appliedPlanSnapshot.receiptTotalInput.replace(',', '.').trim()
          );
          const hasManualReceipt =
            appliedPlanSnapshot.receiptTotalInput.trim() !== '' &&
            Number.isFinite(parsedReceiptInput) &&
            parsedReceiptInput > 0;
          const finalActualTotal = hasManualReceipt ? round2(parsedReceiptInput) : computedActualTotal;
          const deltaRon = round2(finalActualTotal - appliedPlanSnapshot.estimatedTotal);
          const accuracyPct =
            finalActualTotal > 0
              ? Math.max(
                  0,
                  round2(
                    (1 - Math.abs(deltaRon) / Math.max(appliedPlanSnapshot.estimatedTotal, 1)) * 100
                  )
                )
              : 100;
          const activeBudget = missionBudgetRon ?? appliedPlanSnapshot.budgetRon;
          const withinBudget = activeBudget ? finalActualTotal <= activeBudget : null;

          return (
            <section
              className="bg-white border border-[#EFE2D8] rounded-[16px] p-5 space-y-4"
              aria-label="Verificare rezultat și bon de cumpărături"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-[#765B60]">
                    Verificare rezultat · Estimat vs. Raft & Bon
                  </p>
                  <h2 className="mt-0.5 text-base font-extrabold text-[#421726]">
                    Compară planul {appliedPlanSnapshot.storeLabel} cu bonul final
                  </h2>
                </div>
                {withinBudget !== null && activeBudget && (
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold tabular-nums ${
                      withinBudget
                        ? 'bg-[#DBE3C6] text-[#263B1D]'
                        : 'bg-[#FCE2DB] text-[#421726]'
                    }`}
                  >
                    {withinBudget
                      ? `În bugetul de ${formatRon(activeBudget)}`
                      : `Depășește bugetul (${formatRon(activeBudget)})`}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="rounded-[12px] bg-[#FFF6EE] border border-[#EFE2D8] p-3">
                  <p className="text-[#765B60]">Estimat Beavy</p>
                  <p className="mt-0.5 text-sm font-extrabold text-[#421726] tabular-nums">
                    {formatRon(appliedPlanSnapshot.estimatedTotal)}
                  </p>
                </div>
                <div className="rounded-[12px] bg-[#FFF6EE] border border-[#EFE2D8] p-3">
                  <p className="text-[#765B60]">Real / Bon</p>
                  <p className="mt-0.5 text-sm font-extrabold text-[#421726] tabular-nums">
                    {formatRon(finalActualTotal)}
                  </p>
                </div>
                <div className="rounded-[12px] bg-[#FFF6EE] border border-[#EFE2D8] p-3">
                  <p className="text-[#765B60]">Diferență (Δ)</p>
                  <p
                    className={`mt-0.5 text-sm font-extrabold tabular-nums ${
                      deltaRon <= 0 ? 'text-[#263B1D]' : 'text-[#421726]'
                    }`}
                  >
                    {deltaRon === 0
                      ? '0,00 lei'
                      : deltaRon > 0
                        ? `+${formatRon(deltaRon)}`
                        : `-${formatRon(Math.abs(deltaRon))}`}
                  </p>
                </div>
                <div className="rounded-[12px] bg-[#DBE3C6]/50 border border-[#C5D3A3] p-3">
                  <p className="text-[#263B1D]">Acuratețe</p>
                  <p className="mt-0.5 text-sm font-extrabold text-[#263B1D] tabular-nums">
                    {accuracyPct.toFixed(1).replace('.', ',')}%
                  </p>
                </div>
              </div>

              {/* Collapsible Per-item shelf verification */}
              <div>
                <button
                  type="button"
                  onClick={() => setShelfDetailsOpen((prev) => !prev)}
                  aria-expanded={shelfDetailsOpen}
                  className="text-xs font-bold text-[#421726] underline underline-offset-4"
                >
                  {shelfDetailsOpen
                    ? `Ascunde prețurile pe produs (${itemRows.length})`
                    : `Verifică sau ajustează prețul la raft pe produs (${itemRows.length})`}
                </button>

                {shelfDetailsOpen && (
                  <div className="mt-2.5 max-h-64 overflow-y-auto divide-y divide-[#EFE2D8] border-t border-b border-[#EFE2D8]">
                    {itemRows.map((row) => (
                      <div
                        key={row.productId}
                        className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-[#421726] truncate">
                            {row.qty}× {row.name}
                          </p>
                          <p className="text-[11px] text-[#765B60] tabular-nums">
                            EAN {row.ean} · Estimat {formatRon(row.expectedUnit)} / buc
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <label
                            htmlFor={`actual-price-${row.productId}`}
                            className="text-[11px] font-semibold text-[#765B60]"
                          >
                            Preț raft:
                          </label>
                          <input
                            id={`actual-price-${row.productId}`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.actualUnit}
                            onChange={(e) => {
                              const parsed = Number(e.target.value);
                              onUpdateReceiptVerification((prev) => ({
                                ...prev,
                                receiptVerified: false,
                                actualUnitPrices: {
                                  ...prev.actualUnitPrices,
                                  [row.productId]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
                                },
                              }));
                            }}
                            className="w-20 px-2.5 py-1 rounded-[10px] border border-[#EFE2D8] bg-[#FFF6EE] text-right font-bold text-[#421726] tabular-nums"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Direct Receipt Total Input + Confirm CTA */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="receipt-total-input"
                    className="text-xs font-bold text-[#421726] whitespace-nowrap"
                  >
                    Total de pe bon (RON):
                  </label>
                  <input
                    id="receipt-total-input"
                    type="text"
                    inputMode="decimal"
                    placeholder={computedActualTotal.toFixed(2).replace('.', ',')}
                    value={appliedPlanSnapshot.receiptTotalInput}
                    onChange={(e) =>
                      onUpdateReceiptVerification((prev) => ({
                        ...prev,
                        receiptVerified: false,
                        receiptTotalInput: e.target.value,
                      }))
                    }
                    className="w-28 min-h-[44px] px-3 py-1.5 rounded-full border border-[#EFE2D8] bg-[#FFF6EE] text-xs font-bold text-[#421726] tabular-nums focus:outline-none focus:border-[#421726]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateReceiptVerification((prev) => ({
                      ...prev,
                      receiptVerified: true,
                    }))
                  }
                  className={`inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-full text-xs font-bold transition-colors ${
                    appliedPlanSnapshot.receiptVerified
                      ? 'bg-[#DBE3C6] text-[#263B1D]'
                      : 'bg-[#421726] text-white hover:bg-[#5A2236]'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  {appliedPlanSnapshot.receiptVerified
                    ? 'Rezultat verificat cu bonul'
                    : 'Confirmă verificarea bonului'}
                </button>
              </div>
            </section>
          );
        })()}

      {pricedLines.length > 0 && (
        <div className="space-y-5" data-testid="basket-items-list">
          {(sortMode === 'aisle'
            ? groupByCategory(openLines)
            : openLines.length > 0
              ? [['', [...openLines].reverse()] as [string, BasketLine[]]]
              : []
          ).map(([category, lines]) => (
            <section
              key={category || 'recent'}
              className="space-y-1.5"
              aria-label={category || 'Produse, cele mai recente primele'}
            >
              {category && (
                <h2 className="px-1 text-[15px] font-extrabold text-[#421726]">{category}</h2>
              )}
              <div className="bg-white rounded-[12px] overflow-hidden">{lines.map(renderRow)}</div>
            </section>
          ))}

          {inStoreMode && openLines.length === 0 && (
            <p className="text-center text-sm text-[#765B60] py-2">
              Ai bifat tot. Poți verifica bonul la casă.
            </p>
          )}

          {checkedLines.length > 0 && (
            <section className="space-y-1.5" aria-label="Bifate în coș">
              <button
                type="button"
                onClick={() => setCheckedOpen((prev) => !prev)}
                aria-expanded={checkedOpen}
                className="w-full min-h-[44px] px-4 flex items-center justify-between gap-2 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-[#765B60]">
                  Bifate în coș ({checkedLines.length})
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[#765B60] transition-transform ${checkedOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {checkedOpen && (
                <div className="bg-white rounded-[12px] overflow-hidden">
                  {checkedLines.map(renderRow)}
                </div>
              )}
              <button
                type="button"
                onClick={removeChecked}
                className="w-full min-h-[48px] rounded-full bg-white inline-flex items-center justify-center gap-2 text-[15px] font-bold text-[#421726]"
              >
                <Trash2 className="w-4 h-4 text-[#F78D79]" aria-hidden="true" />
                <span className="tabular-nums">
                  Scoate din coș {checkedLines.length === 1 ? 'produsul bifat' : `cele ${checkedLines.length} bifate`}
                </span>
              </button>
            </section>
          )}
        </div>
      )}

        {/* Lines with no verified price anywhere: kept on the list, never in the total */}
        {unpricedLines.length > 0 && (
          <section className="space-y-2" aria-label="Produse fără preț verificat">
            <div>
              <h2 className="text-sm font-extrabold text-[#421726]">
                Fără preț verificat ({unpricedLines.length})
              </h2>
              <p className="mt-0.5 text-xs text-[#765B60]">
                Nu am găsit o ofertă actuală la niciun magazin. Rămân pe listă, dar nu intră în
                total.
              </p>
            </div>
            <div className="bg-[#FFF6EE] border border-dashed border-[#E8C5BA] rounded-[16px] divide-y divide-[#EFE2D8]">
              {unpricedLines.map(({ item, product }) => (
                <div key={item.productId} className="p-3.5 flex items-center gap-3">
                  <ProductThumbnail
                    category={product.category}
                    name={product.canonicalName}
                    imageUrl={product.imageUrl}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#421726] leading-snug line-clamp-2">
                      {product.canonicalName}
                    </p>
                    <p className="mt-0.5 text-xs text-[#765B60] tabular-nums truncate">
                      {[`${item.quantity} buc`, formatProductMeta(product)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeWithUndo(item.productId, item.quantity)}
                    aria-label={`Șterge ${product.canonicalName} din coș`}
                    className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[#765B60] hover:text-[#421726] hover:bg-[#FCE2DB]/60 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

    </div>

      {undo && (
        <div
          className="fixed left-4 right-4 bottom-[9.5rem] md:bottom-24 z-40 max-w-md mx-auto rounded-[14px] bg-[#421726] text-white px-4 min-h-[48px] flex items-center justify-between gap-3 shadow-[0_8px_24px_rgba(66,23,38,0.25)]"
          role="status"
        >
          <span className="text-sm font-semibold truncate">
            {undo.length === 1
              ? `${PRODUCT_MAP[undo[0].productId]?.canonicalName ?? 'Produs'} a fost șters`
              : `${undo.length} produse șterse`}
          </span>
          <button
            type="button"
            onClick={restoreRemoved}
            className="min-h-[44px] px-2 text-sm font-extrabold text-[#FCE2DB] underline underline-offset-4"
          >
            Anulează
          </button>
        </div>
      )}

      <div
        className="fixed bottom-16 md:bottom-0 left-0 right-0 z-30 bg-[#FFF6EE]/80 backdrop-blur-xl border-t border-[#EFE2D8]/70 px-4 py-3"
        data-testid="mobile-basket-compare-dock"
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#765B60] tabular-nums">
              {hasChosenStore ? 'Total' : 'Total orientativ'}
            </p>
            <p className="text-xl font-extrabold text-[#421726] tabular-nums">
              {hasChosenStore ? formatRon(activeTotal) : `~${formatRon(activeTotal)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => (hasChosenStore ? onNavigateTab('matrix') : setStoreSheetOpen(true))}
            className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-[14px] bg-[#421726] text-white text-[15px] font-bold hover:bg-[#5A2236] transition-colors whitespace-nowrap shrink-0"
          >
            <span>{hasChosenStore ? 'Vezi planul' : 'Alege magazinul'}</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <BottomSheet open={storeSheetOpen} onClose={() => setStoreSheetOpen(false)} title="Alege magazinul">
        <GroupedSection footer="Totalul include livrarea, unde există. Ordinea ține cont întâi de câte produse găsești.">
          {rankedStores.map((summary, idx) => {
            const total = pricedLineCount + 0;
            return (
              <div key={summary.storeId} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-[#421726]">
                    {STORE_MAP[summary.storeId].name}
                  </p>
                  <p className="text-xs text-[#765B60] tabular-nums">
                    {summary.availableCount} din {summary.availableCount + summary.missingCount || total} produse
                    {idx === 0 ? ' · cel mai bun' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-base font-extrabold text-[#421726] tabular-nums">
                    {formatRon(summary.totalWithDelivery)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectStore(summary.storeId, economyMode);
                      setStoreSheetOpen(false);
                    }}
                    className={`min-h-[44px] px-4 rounded-full text-sm font-bold ${
                      hasChosenStore && !isSplitActive && resolvedActiveStoreId === summary.storeId
                        ? 'bg-[#DBE3C6] text-[#263B1D]'
                        : 'bg-[#421726] text-white'
                    }`}
                  >
                    {hasChosenStore && !isSplitActive && resolvedActiveStoreId === summary.storeId
                      ? 'Ales'
                      : 'Alege'}
                  </button>
                </div>
              </div>
            );
          })}
        </GroupedSection>
        <button
          type="button"
          onClick={() => {
            setStoreSheetOpen(false);
            onNavigateTab('matrix');
          }}
          className="w-full min-h-[48px] inline-flex items-center justify-center gap-1.5 text-[15px] font-bold text-[#421726]"
        >
          Vezi tot planul
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </BottomSheet>

      <EanScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        basket={basket}
        resolvedStoreId={resolvedActiveStoreId}
        hasChosenStore={hasChosenStore}
        economyMode={economyMode}
        activeCards={activeCards}
        onAddProduct={onAddProduct}
        onUpdateQty={onUpdateQty}
      />
    </>
  );
}
