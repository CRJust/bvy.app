import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BasketItemsSection } from '@/components/cart/basket-items-section';
import { BasketStoreMatrix } from '@/components/cart/basket-store-matrix';
import { BudgetAlternativesSection } from '@/components/cart/budget-alternatives-section';
import { BucharestLocationModal } from '@/components/cart/bucharest-location-modal';
import { DeliveryRulesModal } from '@/components/cart/delivery-rules-modal';
import { MultiStoreMixCard } from '@/components/cart/multi-store-mix-card';
import { OptimalCartHero } from '@/components/cart/optimal-cart-hero';
import { StoreComparisonList } from '@/components/cart/store-comparison-list';
import {
  WhyRecommendationModal,
  type WhyRecommendationData,
} from '@/components/cart/why-recommendation-modal';
import { ProductComparisonModal } from '@/components/product-comparison-modal';
import { RetailerBreakdownModal } from '@/components/retailer-breakdown-modal';
import { BeavyScreenTransition } from '@/components/screen-transition';
import { SmartShoppingModal } from '@/components/smart-shopping/smart-shopping-modal';
import {
  type StoreChannelMode,
  StoreModeModal,
} from '@/components/store-mode-modal';
import { BeavyEmptyState } from '@/components/ui/beavy-empty-state';
import { BeavyHeader } from '@/components/ui/beavy-header';
import { BeavySegmentedControl } from '@/components/ui/beavy-segmented-control';
import { BeavyCardSkeleton } from '@/components/ui/beavy-skeleton';
import { formatBucharestLocation } from '@/constants/bucharest-sectors';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useShopping } from '@/context/shopping-context';
import { useTabBar } from '@/context/tab-bar-context';
import {
  type BasketVariantMode,
  type BasketItemInput,
  computeBasketInsights,
  type ItemComparisonStatus,
  type MatchedBasketItem,
  resolveLoyaltyProgramName,
} from '@/services/beavy-comparison';
import { shareShoppingList } from '@/services/share-shopping-list';

function formatTimestampRo(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const datePart = parsed.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: 'short',
  });
  const timePart = parsed.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart}, ${timePart}`;
}

export default function CompareScreen() {
  const {
    activeList,
    shoppingItems,
    basketItems,
    activeStoreCheckedIds,
    preferences,
    updatePreferences,
    changeItemQuantity,
    removeItem,
    toggleItemChecked,
    setItemsChecked,
    toggleStoreCheckedItem,
    clearStoreCheckedItems,
    restoreStoreCheckedItems,
    commitStoreCheckedItems,
    recordShoppingSession,
    recordOutboundClick,
    replaceItemWithProduct,
    precomputedComparison,
    isComparing,
    refreshComparison,
  } = useShopping();
  const { user } = useAuth();
  const { triggerTabTransition } = useTabBar();

  const dualComparison = precomputedComparison;
  const [comparisonMode, setComparisonMode] = useState<BasketVariantMode>('standard');
  const [optimizationStrategy, setOptimizationStrategy] = useState<
    'balanced' | 'cheapest' | 'convenience'
  >('balanced');
  const [error, setError] = useState('');
  const [storeModeOpen, setStoreModeOpen] = useState(false);
  const [smartShoppingOpen, setSmartShoppingOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'comparison' | 'matrix' | 'products'>('comparison');
  const [storeModeRetailerName, setStoreModeRetailerName] = useState('');
  const [storeModeFilterIds, setStoreModeFilterIds] = useState<string[] | null>(null);
  const [selectedRetailerId, setSelectedRetailerId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [whyModalOpen, setWhyModalOpen] = useState(false);
  const [deliveryRulesOpen, setDeliveryRulesOpen] = useState(false);
  const [rejectedStoreIds, setRejectedStoreIds] = useState<string[]>([]);
  const [lastCommittedPurchase, setLastCommittedPurchase] = useState<{
    ids: string[];
    count: number;
  } | null>(null);

  const loading = isComparing && dualComparison === null;

  const handleSwitchComparisonMode = useCallback((mode: BasketVariantMode) => {
    setComparisonMode(mode);
    if (mode === 'private_label_budget') {
      setActiveBottomTab('products');
    }
  }, []);

  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const scheduleHandoff = useCallback((action: () => void) => {
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    handoffTimerRef.current = setTimeout(action, 230);
  }, []);

  const handleOpenStoreMode = useCallback(
    (retailerName?: string, itemIds?: string[] | null) => {
      triggerHaptic('medium');
      setStoreModeRetailerName(retailerName ?? '');
      setStoreModeFilterIds(itemIds ?? null);
      setStoreModeOpen(true);
    },
    []
  );

  const applyLoyaltyCards = preferences.applyLoyaltyCards ?? true;
  const ownedLoyaltyPrograms = preferences.ownedLoyaltyPrograms ?? null;

  const runComparison = useCallback(
    async (force = false) => {
      setError('');
      try {
        await refreshComparison(force);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Nu am putut evalua coșul momentan.'
        );
      }
    },
    [refreshComparison]
  );

  const effectiveComparisonMode: BasketVariantMode =
    comparisonMode === 'private_label_budget' &&
    dualComparison?.budgetSummary.hasBudgetVariant
      ? 'private_label_budget'
      : 'standard';

  const comparison = useMemo(() => {
    if (!dualComparison) return null;
    const base =
      effectiveComparisonMode === 'private_label_budget'
        ? dualComparison.budget
        : dualComparison.standard;
    if (rejectedStoreIds.length === 0) return base;
    const filteredSummaries = base.retailerSummaries.filter(
      (s) => !rejectedStoreIds.includes(s.retailer.id)
    );
    if (filteredSummaries.length === 0) return base;
    return {
      ...base,
      retailerSummaries: filteredSummaries,
      cheapestComparableRetailerId:
        filteredSummaries.find((s) => s.hasFullCatalogCoverage)?.retailer.id ??
        filteredSummaries[0]?.retailer.id ??
        null,
    };
  }, [dualComparison, effectiveComparisonMode, rejectedStoreIds]);

  const insights = useMemo(
    () => (comparison ? computeBasketInsights(comparison) : null),
    [comparison]
  );

  const whyData = useMemo<WhyRecommendationData | null>(() => {
    const bestStore = insights?.bestStore;
    if (!bestStore) return null;

    let exactCount = 0;
    let twinCount = 0;
    let functionalCount = 0;
    let privateLabelCount = 0;

    for (const m of bestStore.matchedItems) {
      if (m.isBudgetSwap || m.isPrivateLabel || m.matchTier === 'private_label_twin') {
        privateLabelCount++;
      } else if (m.matchType === 'exact' || m.matchTier === 'exact_sku') {
        exactCount++;
      } else if (m.matchTier === 'size_variant') {
        twinCount++;
      } else {
        functionalCount++;
      }
    }

    const totalCount = bestStore.matchedItems.length;
    const coverageRatio = totalCount > 0 ? bestStore.coveredCount / totalCount : 1;
    const matchPts = Math.min(40, Math.round(coverageRatio * 40));
    const pricePts = 38;
    const conveniencePts = 20;
    const totalPts = pricePts + matchPts + conveniencePts;

    const reasons: string[] = [
      `Preț total estimat: ${bestStore.estimatedTotalWithFees.toFixed(2)} RON pentru ${bestStore.coveredCount} produse verificate.`,
      `Acoperire coș: ${bestStore.coveredCount} din ${bestStore.totalItemsCount} articole disponibile (${Math.round(coverageRatio * 100)}%).`,
      bestStore.retailer.supports_physical
        ? 'Magazin fizic în proximitate — fără costuri de livrare sau comenzi minime.'
        : 'Livrare online directă la adresă.',
    ];

    if (bestStore.loyaltyOfferCount > 0 && bestStore.loyaltyProgramName) {
      reasons.push(
        `Oferte active prin ${bestStore.loyaltyProgramName} ce reduc totalul cu până la ${bestStore.potentialLoyaltySavings.toFixed(2)} RON.`
      );
    }

    const savingsVsAvg =
      insights?.averageBasketTotal && bestStore
        ? Math.max(0, insights.averageBasketTotal - bestStore.estimatedTotalWithFees)
        : (insights?.maxSpreadRon ?? 0);

    return {
      storeName: bestStore.retailer.name,
      totalWithDelivery: bestStore.estimatedTotalWithFees,
      savingsVsAverage: savingsVsAvg,
      isSplit: false,
      scoreBreakdown: {
        pricePts,
        matchPts,
        conveniencePts,
        totalPts,
      },
      matchSummary: {
        exactCount,
        twinCount,
        functionalCount,
        privateLabelCount,
        totalCount: bestStore.totalItemsCount,
      },
      reasons,
    };
  }, [insights]);

  const budgetAlternatives = useMemo<MatchedBasketItem[]>(() => {
    if (effectiveComparisonMode !== 'private_label_budget' || !comparison) {
      return [];
    }

    const byItemId = new Map<string, MatchedBasketItem>();
    for (const summary of comparison.retailerSummaries) {
      for (const matched of summary.matchedItems) {
        if (
          !matched.isBudgetSwap ||
          !matched.equivalentProductId ||
          !matched.equivalentProductName
        ) {
          continue;
        }
        const current = byItemId.get(matched.item.id);
        if (!current || matched.lineTotal < current.lineTotal) {
          byItemId.set(matched.item.id, matched);
        }
      }
    }

    return Array.from(byItemId.values()).sort(
      (a, b) => (b.budgetSavingsLine ?? 0) - (a.budgetSavingsLine ?? 0)
    );
  }, [comparison, effectiveComparisonMode]);

  const handleApplyBudgetSwaps = useCallback(() => {
    const bestStore = insights?.bestStore;
    if (!bestStore) return;
    const swaps = bestStore.matchedItems.filter(
      (m) => m.isBudgetSwap && m.equivalentProductId && m.equivalentProductName
    );
    if (swaps.length === 0) return;

    triggerHaptic('success');
    for (const m of swaps) {
      if (!m.equivalentProductId || !m.equivalentProductName) continue;
      replaceItemWithProduct(m.item.id, {
        id: m.equivalentProductId,
        canonical_name: m.equivalentProductName,
        brand: m.equivalentBrand ?? bestStore.retailer.name,
        package_size: m.equivalentPackageSize ?? m.offer.package_size ?? null,
        image_url: m.equivalentImageUrl ?? m.offer.image_url ?? null,
      });
    }
    setComparisonMode('standard');
  }, [insights, replaceItemWithProduct]);

  const handleApplyAllBudgetAlternatives = useCallback(() => {
    if (budgetAlternatives.length === 0) return;

    triggerHaptic('success');
    for (const matched of budgetAlternatives) {
      if (!matched.equivalentProductId || !matched.equivalentProductName) continue;
      replaceItemWithProduct(matched.item.id, {
        id: matched.equivalentProductId,
        canonical_name: matched.equivalentProductName,
        brand: matched.equivalentBrand ?? matched.offer.retailer_name,
        package_size:
          matched.equivalentPackageSize ?? matched.offer.package_size ?? null,
        image_url: matched.equivalentImageUrl ?? matched.offer.image_url ?? null,
      });
    }
    handleSwitchComparisonMode('standard');
  }, [budgetAlternatives, handleSwitchComparisonMode, replaceItemWithProduct]);

  const handleApplyMixBudgetSwaps = useCallback(() => {
    const mix = comparison?.bestStoreMix;
    if (!mix) return;
    let applied = 0;
    for (const stop of mix.stops) {
      for (const m of stop.items) {
        if (!m.isBudgetSwap || !m.equivalentProductId || !m.equivalentProductName) {
          continue;
        }
        replaceItemWithProduct(m.item.id, {
          id: m.equivalentProductId,
          canonical_name: m.equivalentProductName,
          brand: m.equivalentBrand ?? stop.retailer.name,
          package_size: m.equivalentPackageSize ?? m.offer.package_size ?? null,
          image_url: m.equivalentImageUrl ?? m.offer.image_url ?? null,
        });
        applied++;
      }
    }
    if (applied > 0) {
      triggerHaptic('success');
      setComparisonMode('standard');
    }
  }, [comparison, replaceItemWithProduct]);

  const handleCommitStoreSession = useCallback(
    (itemIds: string[]) => {
      const committedIds = commitStoreCheckedItems(itemIds);
      if (committedIds.length === 0) return;

      const matchedRetailer = storeModeRetailerName
        ? comparison?.retailerSummaries.find(
            (s) => s.retailer.name.toLowerCase() === storeModeRetailerName.toLowerCase()
          )
        : insights?.bestStore ?? null;

      const committedSet = new Set(committedIds);
      let verifiedSessionTotal: number | null = null;
      if (matchedRetailer) {
        const coveredCommitted = matchedRetailer.matchedItems.filter((m) =>
          committedSet.has(m.item.id)
        );
        if (coveredCommitted.length > 0) {
          verifiedSessionTotal = Math.round(
            coveredCommitted.reduce((sum, m) => sum + m.lineTotal, 0) * 100
          ) / 100;
        }
      }

      const verifiedSavings =
        comparison?.canCompareFairly &&
        matchedRetailer &&
        matchedRetailer.retailer.id === comparison.cheapestComparableRetailerId &&
        comparison.potentialSavings &&
        committedIds.length === basketItems.length
          ? comparison.potentialSavings
          : 0;

      const isOnlineOnly =
        matchedRetailer &&
        !matchedRetailer.retailer.supports_physical &&
        matchedRetailer.retailer.supports_delivery;

      recordShoppingSession({
        listName: activeList?.name ?? 'Lista de cumpărături',
        retailerName:
          matchedRetailer?.retailer.name || storeModeRetailerName || 'Magazin selectat',
        retailerSlug: matchedRetailer?.retailer.slug ?? null,
        channelMode: isOnlineOnly ? 'online' : 'physical',
        itemsCount: committedIds.length,
        verifiedTotal: verifiedSessionTotal,
        verifiedSavings,
      });

      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setLastCommittedPurchase({
        ids: committedIds,
        count: committedIds.length,
      });
      undoTimerRef.current = setTimeout(() => {
        setLastCommittedPurchase(null);
      }, 9000);
    },
    [
      commitStoreCheckedItems,
      storeModeRetailerName,
      comparison,
      insights,
      basketItems.length,
      recordShoppingSession,
      activeList?.name,
    ]
  );

  const handleUndoCommittedPurchase = useCallback(() => {
    if (!lastCommittedPurchase) return;
    triggerHaptic('selection');
    setItemsChecked(lastCommittedPurchase.ids, false);

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setLastCommittedPurchase(null);
  }, [lastCommittedPurchase, setItemsChecked]);

  const handleTransitionToStoreMode = useCallback(
    (retailerName: string) => {
      setSelectedRetailerId(null);
      setSelectedProductId(null);
      scheduleHandoff(() => handleOpenStoreMode(retailerName));
    },
    [scheduleHandoff, handleOpenStoreMode]
  );

  const handleInspectItemFromRetailer = useCallback(
    (item: BasketItemInput) => {
      setSelectedRetailerId(null);
      scheduleHandoff(() => {
        triggerHaptic('selection');
        setSelectedProductId(item.id);
      });
    },
    [scheduleHandoff]
  );

  const handleShareList = async (checkedIdsInStore: string[] = []) => {
    triggerHaptic('medium');
    if (checkedIdsInStore.length === 0) {
      await shareShoppingList(activeList, shoppingItems);
      return;
    }
    const checkedSet = new Set(checkedIdsInStore);
    const snapshot = shoppingItems.map((it) =>
      checkedSet.has(it.id) ? { ...it, checked: true } : it
    );
    await shareShoppingList(activeList, snapshot);
  };

  const handleLongPressStoreItem = useCallback(
    (item: BasketItemInput) => {
      triggerHaptic('medium');
      if (Platform.OS === 'web') {
        if (
          typeof window !== 'undefined' &&
          window.confirm(`Elimini „${item.name}” din listă?`)
        ) {
          triggerHaptic('medium');
          removeItem(item.id);
        }
        return;
      }

      Alert.alert(
        'Elimină produsul',
        `Dorești să elimini „${item.name}” din listă și din coș?`,
        [
          { text: 'Anulează', style: 'cancel' },
          {
            text: 'Elimină',
            style: 'destructive',
            onPress: () => {
              triggerHaptic('medium');
              removeItem(item.id);
            },
          },
        ]
      );
    },
    [removeItem]
  );

  const basketProductGroups = useMemo(() => {
    if (!comparison) {
      return {
        attentionItems: [] as ItemComparisonStatus[],
        comparedItems: [] as ItemComparisonStatus[],
        attentionCount: 0,
      };
    }
    const attentionItems: ItemComparisonStatus[] = [];
    const comparedItems: ItemComparisonStatus[] = [];
    for (const entry of comparison.itemStatuses) {
      if (
        entry.status === 'unavailable' ||
        entry.status === 'no_offers_yet' ||
        entry.status === 'manual_item'
      ) {
        attentionItems.push(entry);
      } else {
        comparedItems.push(entry);
      }
    }
    return {
      attentionItems,
      comparedItems,
      attentionCount: attentionItems.length,
    };
  }, [comparison]);

  const itemStatusesById = useMemo(() => {
    const map = new Map<string, ItemComparisonStatus>();
    if (comparison) {
      for (const entry of comparison.itemStatuses) {
        map.set(entry.item.id, entry);
      }
    }
    return map;
  }, [comparison]);

  const selectedRetailerSummary = useMemo(() => {
    if (!comparison || !selectedRetailerId) return null;
    return (
      comparison.retailerSummaries.find(
        (s) => s.retailer.id === selectedRetailerId
      ) ?? null
    );
  }, [comparison, selectedRetailerId]);

  const selectedProductEntry = useMemo(() => {
    if (!comparison || !selectedProductId) return null;
    return (
      comparison.itemStatuses.find((s) => s.item.id === selectedProductId) ?? null
    );
  }, [comparison, selectedProductId]);

  const resolvedImageUrlsByItemId = useMemo(() => {
    if (!comparison) return undefined;
    const summary = storeModeRetailerName
      ? comparison.retailerSummaries.find(
          (s) => s.retailer.name.toLowerCase() === storeModeRetailerName.toLowerCase()
        )
      : null;
    const swappedImgByItemId = new Map<string, string | null>();
    if (effectiveComparisonMode === 'private_label_budget' && summary) {
      for (const m of summary.matchedItems) {
        if (m.isBudgetSwap) {
          swappedImgByItemId.set(
            m.item.id,
            m.equivalentImageUrl ?? m.offer.image_url ?? null
          );
        }
      }
    }
    const map: Record<string, string | null> = {};
    for (const entry of comparison.itemStatuses) {
      if (swappedImgByItemId.has(entry.item.id)) {
        map[entry.item.id] = swappedImgByItemId.get(entry.item.id) ?? null;
      } else {
        map[entry.item.id] = entry.canonicalImageUrl ?? entry.item.imageUrl ?? null;
      }
    }
    return map;
  }, [comparison, effectiveComparisonMode, storeModeRetailerName]);

  const effectiveStoreList = useMemo(() => {
    if (!activeList) return activeList;
    let items = activeList.items;

    if (storeModeFilterIds && storeModeFilterIds.length > 0) {
      const allowedSet = new Set(storeModeFilterIds);
      const filtered = items.filter((it) => allowedSet.has(it.id));
      if (filtered.length > 0) {
        items = filtered;
      }
    }

    if (comparison && storeModeRetailerName) {
      const summary = comparison.retailerSummaries.find(
        (s) => s.retailer.name.toLowerCase() === storeModeRetailerName.toLowerCase()
      );
      if (summary) {
        // Dacă magazinul curent (ex: Kaufland) vinde un produs echivalent sau o alternativă de buget
        // în locul unui brand exclusiv de la alt magazin sau al unui SKU necomercializat local,
        // Checklist-ul magazinului afișează denumirea și poza produsului REAL disponibil pe raftul acelui magazin!
        const matchByItemId = new Map(
          summary.matchedItems
            .filter((m) => Boolean(m.equivalentProductName))
            .map((m) => [m.item.id, m])
        );

        if (matchByItemId.size > 0) {
          items = items.map((it) => {
            const m = matchByItemId.get(it.id);
            if (!m || !m.equivalentProductName) return it;
            return {
              ...it,
              name: m.equivalentProductName,
              brand: m.equivalentBrand ?? summary.retailer.name,
              packageSize: m.equivalentPackageSize ?? it.packageSize,
              imageUrl: m.equivalentImageUrl ?? m.offer.image_url ?? it.imageUrl,
            };
          });
        }
      }
    }

    return items === activeList.items ? activeList : { ...activeList, items };
  }, [
    activeList,
    comparison,
    storeModeRetailerName,
    storeModeFilterIds,
  ]);

  const storeUnitPricesByItemId = useMemo(() => {
    if (!comparison || !storeModeRetailerName) return undefined;
    const summary = comparison.retailerSummaries.find(
      (s) => s.retailer.name.toLowerCase() === storeModeRetailerName.toLowerCase()
    );
    if (!summary || summary.matchedItems.length === 0) return undefined;
    const map: Record<string, number> = {};
    for (const m of summary.matchedItems) {
      const qty = Math.max(1, m.item.quantity);
      const isProducePerKg =
        m.produceMeta?.sellMode === 'per_kg' &&
        m.produceMeta.packType === 'vrac' &&
        m.produceMeta.pricePerKg !== null;
      const baseUnitPrice = isProducePerKg ? m.produceMeta!.pricePerKg! : m.offer.price;
      map[m.item.id] =
        applyLoyaltyCards && m.loyaltyLineTotal !== null
          ? Math.round((m.loyaltyLineTotal / qty) * 100) / 100
          : baseUnitPrice;
    }
    return map;
  }, [comparison, storeModeRetailerName, applyLoyaltyCards]);

  const storePackagingNotesByItemId = useMemo(() => {
    if (!comparison || !storeModeRetailerName) return undefined;
    const summary = comparison.retailerSummaries.find(
      (s) => s.retailer.name.toLowerCase() === storeModeRetailerName.toLowerCase()
    );
    if (!summary || summary.matchedItems.length === 0) return undefined;
    const map: Record<string, string> = {};
    for (const m of summary.matchedItems) {
      if (m.produceMeta?.sellMode === 'per_kg' && m.produceMeta.packLabel) {
        if (m.produceMeta.packType !== 'vrac') {
          map[m.item.id] = `${m.produceMeta.packLabel} · ${m.produceMeta.packPrice.toFixed(2)} RON (${m.produceMeta.pricePerKg?.toFixed(2)}/kg)`;
        } else {
          map[m.item.id] = `Vrac · ${m.produceMeta.pricePerKg?.toFixed(2)} RON/kg`;
        }
      } else if (m.equivalentProductName && m.equivalentProductName !== m.item.name) {
        map[m.item.id] = `Alternativă ${summary.retailer.name}`;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [comparison, storeModeRetailerName]);

  const storeLoyaltyLabelsByItemId = useMemo(() => {
    if (!comparison || !storeModeRetailerName) return undefined;
    const summary = comparison.retailerSummaries.find(
      (s) => s.retailer.name.toLowerCase() === storeModeRetailerName.toLowerCase()
    );
    if (!summary || summary.matchedItems.length === 0) return undefined;
    const map: Record<string, string> = {};
    for (const m of summary.matchedItems) {
      if (!m.hasLoyaltyOffer) continue;
      const program = resolveLoyaltyProgramName(summary.retailer.name, m.offer.promo_label);
      if (m.loyaltyLineTotal !== null) {
        map[m.item.id] = `${program}: ${m.loyaltyLineTotal.toFixed(2)} RON`;
      } else if (m.offer.promo_label) {
        map[m.item.id] = `${program} · ${m.offer.promo_label}`;
      } else {
        map[m.item.id] = program;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [comparison, storeModeRetailerName]);

  const storeModeRetailerMeta = useMemo((): {
    channelMode: StoreChannelMode;
    websiteUrl: string | null;
    slug: string | null;
    estimatedTotalWithFees: number | null;
  } => {
    if (!comparison || !storeModeRetailerName) {
      return {
        channelMode: 'physical',
        websiteUrl: null,
        slug: null,
        estimatedTotalWithFees: null,
      };
    }
    const summary = comparison.retailerSummaries.find(
      (s) => s.retailer.name.toLowerCase() === storeModeRetailerName.toLowerCase()
    );
    if (!summary) {
      return {
        channelMode: 'physical',
        websiteUrl: null,
        slug: null,
        estimatedTotalWithFees: null,
      };
    }
    const { supports_physical, supports_delivery, slug, website_url } = summary.retailer;
    const isFreshful = slug === 'freshful';
    let channelMode: StoreChannelMode = 'physical';
    if (isFreshful || (!supports_physical && supports_delivery)) {
      channelMode = 'online';
    }
    return {
      channelMode,
      websiteUrl: website_url ?? (isFreshful ? 'https://www.freshful.ro' : null),
      slug,
      estimatedTotalWithFees:
        summary.coveredCount > 0 ? summary.estimatedTotalWithFees : null,
    };
  }, [comparison, storeModeRetailerName]);

  const userInitials = useMemo(() => {
    const authName =
      typeof user?.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name.trim()
        : '';
    const raw =
      authName ||
      user?.email?.split('@')[0]?.trim() ||
      preferences.userName?.trim() ||
      '';
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase() || 'B';
  }, [user, preferences.userName]);

  const lastUpdatedLabel = useMemo(
    () => formatTimestampRo(comparison?.latestOfferDate),
    [comparison?.latestOfferDate]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <BeavyScreenTransition style={styles.container}>
        <BeavyHeader
          userInitials={userInitials}
          onPressProfile={() =>
            triggerTabTransition(3, () => router.push('/profile'))
          }
          rightAction={
            basketItems.length > 0
              ? {
                  symbol: 'square.and.arrow.up',
                  fallbackText: '↗',
                  accessibilityLabel: 'Trimite lista de cumpărături',
                  onPress: () => {
                    void handleShareList();
                  },
                }
              : undefined
          }
        />

        {lastCommittedPurchase && !storeModeOpen && (
          <View style={styles.undoBanner}>
            <Text style={styles.undoBannerText}>
              {lastCommittedPurchase.count === 1
                ? '1 produs marcat ca achiziționat'
                : `${lastCommittedPurchase.count} produse marcate ca achiziționate`}
            </Text>
            <Pressable
              onPress={handleUndoCommittedPurchase}
              hitSlop={8}
              style={({ pressed }) => [
                styles.undoBannerBtn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Anulează marcarea produselor"
            >
              <Text style={styles.undoBannerBtnText}>Anulează</Text>
            </Pressable>
          </View>
        )}

        {basketItems.length === 0 && !storeModeOpen ? (
          <BeavyEmptyState
            symbol="basket"
            fallbackGlyph="○"
            title="Coșul tău este gol"
            actionLabel="Mergi la listă →"
            onPressAction={() => triggerTabTransition(0, () => router.push('/'))}
          />
        ) : (
          <ScrollView
            testID="compare-scroll-view"
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Antet de ecran Google Studio Standard */}
            <View style={styles.screenHeaderRow}>
              <View style={styles.screenTitleCol}>
                <Text style={styles.stepKicker}>Pasul 3 din 3 · Compară 9 magazine</Text>
                <Text style={styles.pageTitle}>Comparație & Optimizare</Text>
                <View style={styles.subtitleWithLocationRow}>
                  <Text style={styles.pageSubtitle}>
                    {`${basketItems.length} ${basketItems.length === 1 ? 'produs' : 'produse'}`}
                  </Text>
                  <Text style={styles.subtitleDot}>·</Text>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      setLocationModalOpen(true);
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.locationSelectorBtn,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Schimbă sectorul sau locația din București"
                  >
                    <SymbolView
                      name="mappin.and.ellipse"
                      tintColor={C.strawberry}
                      size={12}
                      fallback={<Text style={styles.locationFallbackGlyph}>📍</Text>}
                    />
                    <Text style={styles.locationSelectorText}>
                      {formatBucharestLocation('București', preferences.sector)}
                    </Text>
                    <SymbolView
                      name="chevron.down"
                      tintColor={C.muted}
                      size={9}
                      fallback={<Text style={styles.chevronFallbackGlyph}>▾</Text>}
                    />
                  </Pressable>
                </View>
              </View>

              <View style={styles.headerActionsRow}>
                <Pressable
                  onPress={() => {
                    triggerHaptic('medium');
                    setSmartShoppingOpen(true);
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.smartOptimizeBtn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Optimizează coșul cu Beavy Smart Shopping"
                >
                  <SymbolView
                    name="sparkles"
                    tintColor={C.primary}
                    size={13}
                    fallback={<Text style={styles.fallbackGlyph}>✦</Text>}
                  />
                  <Text style={styles.smartOptimizeBtnText}>Optimizează coșul</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerHaptic('light');
                    void runComparison(true);
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.refreshBtn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Actualizează comparația de prețuri"
                >
                  <SymbolView
                    name="arrow.clockwise"
                    tintColor={C.primary}
                    size={13}
                    fallback={<Text style={styles.fallbackGlyph}>↻</Text>}
                  />
                  <Text style={styles.refreshBtnText}>
                    {isComparing ? 'Se actualizează...' : 'Actualizează'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <BeavySegmentedControl
              options={[
                { id: 'all', label: 'Fizic + Online' },
                { id: 'physical', label: 'Doar fizic' },
                { id: 'online', label: 'Doar online' },
              ]}
              value={preferences.preferredChannel}
              onChange={(next) => {
                triggerHaptic('selection');
                void updatePreferences({ preferredChannel: next });
              }}
            />

            <View style={styles.strategySection}>
              <Text style={styles.strategySectionTitle}>STRATEGIE DE OPTIMIZARE</Text>
              <BeavySegmentedControl
                options={[
                  { id: 'balanced', label: 'Echilibrat' },
                  { id: 'cheapest', label: 'Preț minim' },
                  { id: 'convenience', label: 'Un magazin' },
                ]}
                value={optimizationStrategy}
                onChange={(next) => {
                  triggerHaptic('selection');
                  const s = next as 'balanced' | 'cheapest' | 'convenience';
                  setOptimizationStrategy(s);
                  if (s === 'cheapest' && dualComparison?.budgetSummary.hasBudgetVariant) {
                    handleSwitchComparisonMode('private_label_budget');
                  } else if (s !== 'cheapest') {
                    handleSwitchComparisonMode('standard');
                  }
                }}
              />
            </View>

            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                updatePreferences({ applyLoyaltyCards: !applyLoyaltyCards });
              }}
              style={({ pressed }) => [
                styles.loyaltyToggleRow,
                applyLoyaltyCards && styles.loyaltyToggleRowActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked: applyLoyaltyCards }}
              accessibilityLabel="Calculează cu carduri de fidelitate (CONNECT, MyCLUB, Lidl Plus)"
            >
              <View style={styles.loyaltyToggleLeft}>
                <SymbolView
                  name="creditcard.fill"
                  tintColor={applyLoyaltyCards ? C.leekDark : C.muted}
                  size={15}
                  fallback={
                    <Text
                      style={[
                        styles.fallbackGlyph,
                        applyLoyaltyCards && { color: C.leekDark },
                      ]}
                    >
                      ◈
                    </Text>
                  }
                />
                <View style={styles.loyaltyToggleCopy}>
                  <Text style={styles.loyaltyToggleTitle} numberOfLines={1}>
                    Carduri de fidelitate
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.loyaltyStatePill,
                  applyLoyaltyCards && styles.loyaltyStatePillActive,
                ]}
              >
                <Text
                  style={[
                    styles.loyaltyStateText,
                    applyLoyaltyCards && styles.loyaltyStateTextActive,
                  ]}
                >
                  {applyLoyaltyCards ? 'Active' : 'Oprite'}
                </Text>
              </View>
            </Pressable>

            {loading && !comparison ? (
              <BeavyCardSkeleton count={3} />
            ) : error && !comparison ? (
              <View style={styles.errorBlock}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable
                  onPress={() => void runComparison()}
                  hitSlop={8}
                  style={styles.retryBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryBtnText}>Reîncearcă</Text>
                </Pressable>
              </View>
            ) : comparison && insights ? (
              <>
                {dualComparison?.budgetSummary.hasBudgetVariant && (
                  <BeavySegmentedControl
                    options={[
                      { id: 'standard', label: 'Produse selectate' },
                      {
                        id: 'private_label_budget',
                        label: 'Alternativa Economică',
                      },
                    ]}
                    value={effectiveComparisonMode}
                    onChange={handleSwitchComparisonMode}
                  />
                )}

                <OptimalCartHero
                  comparison={comparison}
                  insights={insights}
                  lastUpdatedLabel={lastUpdatedLabel}
                  variantMode={effectiveComparisonMode}
                  budgetSummary={dualComparison?.budgetSummary}
                  onApplyBudgetSwaps={handleApplyBudgetSwaps}
                  onSwitchToBudget={() => handleSwitchComparisonMode('private_label_budget')}
                  onSwitchToStandard={() => handleSwitchComparisonMode('standard')}
                  onStartPrimaryAction={(retailerName) =>
                    handleOpenStoreMode(retailerName, null)
                  }
                  onInspectBreakdown={(retailerId) => setSelectedRetailerId(retailerId)}
                />

                <View style={styles.heroAuxActionsRow}>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('light');
                      setWhyModalOpen(true);
                    }}
                    style={({ pressed }) => [styles.heroAuxBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="De ce această recomandare?"
                  >
                    <SymbolView
                      name="questionmark.circle"
                      tintColor={C.primary}
                      size={14}
                      fallback={<Text style={styles.heroAuxGlyph}>?</Text>}
                    />
                    <Text style={styles.heroAuxBtnText}>De ce acest magazin?</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      triggerHaptic('light');
                      setDeliveryRulesOpen(true);
                    }}
                    style={({ pressed }) => [styles.heroAuxBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Reguli de livrare și comenzi minime"
                  >
                    <SymbolView
                      name="shippingbox"
                      tintColor={C.primary}
                      size={14}
                      fallback={<Text style={styles.heroAuxGlyph}>📦</Text>}
                    />
                    <Text style={styles.heroAuxBtnText}>Reguli livrare</Text>
                  </Pressable>

                  {insights.bestStore && (
                    <Pressable
                      onPress={() => {
                        triggerHaptic('medium');
                        const retId = insights.bestStore?.retailer.id;
                        if (!retId) return;
                        setRejectedStoreIds((prev) => [...prev, retId]);
                      }}
                      style={({ pressed }) => [
                        styles.heroAuxRejectBtn,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Respinge ${insights.bestStore.retailer.name}`}
                    >
                      <SymbolView
                        name="xmark.circle"
                        tintColor={C.muted}
                        size={14}
                        fallback={<Text style={styles.heroAuxGlyph}>✕</Text>}
                      />
                      <Text style={styles.heroAuxRejectText}>Respinge</Text>
                    </Pressable>
                  )}
                </View>

                {rejectedStoreIds.length > 0 && (
                  <View style={styles.rejectedBanner}>
                    <View style={styles.rejectedBannerLeft}>
                      <SymbolView
                        name="arrow.triangle.2.circlepath"
                        tintColor={C.strawberry}
                        size={14}
                        fallback={<Text style={styles.rejectedBannerGlyph}>↺</Text>}
                      />
                      <Text style={styles.rejectedBannerText}>
                        {`Ai respins ${rejectedStoreIds.length} ${rejectedStoreIds.length === 1 ? 'magazin' : 'magazine'}. Recomandarea s-a actualizat.`}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        setRejectedStoreIds([]);
                      }}
                      hitSlop={8}
                      style={styles.rejectedBannerResetBtn}
                    >
                      <Text style={styles.rejectedBannerResetText}>Resetează</Text>
                    </Pressable>
                  </View>
                )}

                {comparison.bestStoreMix && optimizationStrategy !== 'convenience' && (
                  <MultiStoreMixCard
                    mix={comparison.bestStoreMix}
                    variantMode={effectiveComparisonMode}
                    onOpenStopChecklist={(retailerName, itemIds) =>
                      handleOpenStoreMode(retailerName, itemIds)
                    }
                    onInspectItem={(item) => {
                      triggerHaptic('selection');
                      setSelectedProductId(item.id);
                    }}
                    onApplyMixBudgetSwaps={handleApplyMixBudgetSwaps}
                  />
                )}

                {basketProductGroups.attentionCount > 0 && (
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      setActiveBottomTab('products');
                    }}
                    style={({ pressed }) => [
                      styles.attentionBanner,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Vezi cele ${basketProductGroups.attentionCount} produse fără preț sau indisponibile`}
                  >
                    <View style={styles.attentionLeft}>
                      <SymbolView
                        name="exclamationmark.triangle.fill"
                        tintColor={C.primary}
                        size={14}
                        fallback={<Text style={styles.fallbackGlyph}>!</Text>}
                      />
                      <Text style={styles.attentionText}>
                        {basketProductGroups.attentionCount === 1
                          ? '1 produs indisponibil sau fără preț verificat'
                          : `${basketProductGroups.attentionCount} produse indisponibile sau fără preț`}
                      </Text>
                    </View>
                    <Text style={styles.attentionCta}>Verifică ›</Text>
                  </Pressable>
                )}

                <View style={styles.bottomSection}>
                  <BeavySegmentedControl
                    options={[
                      { id: 'comparison', label: 'Magazine' },
                      { id: 'matrix', label: 'Matrice' },
                      {
                        id: 'products',
                        label:
                          effectiveComparisonMode === 'private_label_budget'
                            ? `Sugestii (${budgetAlternatives.length})`
                            : `Produse (${basketItems.length})`,
                      },
                    ]}
                    value={activeBottomTab}
                    onChange={setActiveBottomTab}
                  />

                  {activeBottomTab === 'comparison' ? (
                    <>
                      <StoreComparisonList
                        comparison={comparison}
                        insights={insights}
                        listName={activeList?.name}
                        channelMode={preferences.preferredChannel}
                        onPressBreakdown={(retailerId) => setSelectedRetailerId(retailerId)}
                        onOpenStoreMode={handleOpenStoreMode}
                        onTrackOutboundClick={recordOutboundClick}
                      />
                      <BasketStoreMatrix
                        comparison={comparison}
                        onPressStore={(retailerId) => setSelectedRetailerId(retailerId)}
                        onPressItem={(itemId) => setSelectedProductId(itemId)}
                      />
                    </>
                  ) : activeBottomTab === 'matrix' ? (
                    <BasketStoreMatrix
                      comparison={comparison}
                      onPressStore={(retailerId) => setSelectedRetailerId(retailerId)}
                      onPressItem={(itemId) => setSelectedProductId(itemId)}
                    />
                  ) : effectiveComparisonMode === 'private_label_budget' ? (
                    <BudgetAlternativesSection
                      alternatives={budgetAlternatives}
                      totalItemsCount={basketItems.length}
                      onPressItem={(itemId) => setSelectedProductId(itemId)}
                      onApplyAll={handleApplyAllBudgetAlternatives}
                      onModifyList={() =>
                        triggerTabTransition(0, () => router.push('/'))
                      }
                    />
                  ) : (
                    <BasketItemsSection
                      attentionItems={basketProductGroups.attentionItems}
                      comparedItems={basketProductGroups.comparedItems}
                      onPressItem={(itemId) => setSelectedProductId(itemId)}
                      onChangeQuantity={changeItemQuantity}
                      onRemoveItem={removeItem}
                      onModifyList={() =>
                        triggerTabTransition(0, () => router.push('/'))
                      }
                    />
                  )}
                </View>
              </>
            ) : null}
          </ScrollView>
        )}

        <StoreModeModal
          visible={storeModeOpen}
          list={effectiveStoreList}
          storeName={storeModeRetailerName}
          storeSlug={storeModeRetailerMeta.slug}
          storeChannelMode={storeModeRetailerMeta.channelMode}
          storeWebsiteUrl={storeModeRetailerMeta.websiteUrl}
          estimatedBasketTotal={storeModeRetailerMeta.estimatedTotalWithFees}
          storeUnitPricesByItemId={storeUnitPricesByItemId}
          storeLoyaltyLabelsByItemId={storeLoyaltyLabelsByItemId}
          storePackagingNotesByItemId={storePackagingNotesByItemId}
          resolvedImageUrlsByItemId={resolvedImageUrlsByItemId}
          checkedItemIds={activeStoreCheckedIds}
          onClose={() => {
            setStoreModeOpen(false);
            setStoreModeFilterIds(null);
          }}
          onToggleItem={(id) => {
            triggerHaptic('selection');
            toggleItemChecked(id);
          }}
          onToggleSessionItem={toggleStoreCheckedItem}
          onClearSessionChecked={clearStoreCheckedItems}
          onRestoreSessionChecked={restoreStoreCheckedItems}
          onCommitCheckedItems={handleCommitStoreSession}
          onQuantityChange={changeItemQuantity}
          onRemoveItem={removeItem}
          onLongPressItem={handleLongPressStoreItem}
          onShareList={handleShareList}
          onGoToPantry={() => {
            scheduleHandoff(() => {
              triggerTabTransition(0, () => router.push('/'));
            });
          }}
          onTrackOutboundClick={recordOutboundClick}
        />

        <RetailerBreakdownModal
          visible={Boolean(selectedRetailerSummary)}
          summary={selectedRetailerSummary}
          allSummaries={comparison?.retailerSummaries}
          cheapestRetailerId={comparison?.cheapestComparableRetailerId}
          onSelectRetailer={(retId) => setSelectedRetailerId(retId)}
          isBest={Boolean(
            comparison?.canCompareFairly &&
              selectedRetailerSummary &&
              comparison.cheapestComparableRetailerId ===
                selectedRetailerSummary.retailer.id
          )}
          isPreferred={Boolean(
            selectedRetailerSummary &&
              preferences.preferredRetailerSlugs.includes(
                selectedRetailerSummary.retailer.slug
              )
          )}
          isBudgetVariant={comparisonMode === 'private_label_budget'}
          listName={activeList?.name}
          channelMode={preferences.preferredChannel}
          itemStatusesById={itemStatusesById}
          onClose={() => setSelectedRetailerId(null)}
          onStartStoreMode={handleTransitionToStoreMode}
          onInspectItem={handleInspectItemFromRetailer}
          onTrackOutboundClick={recordOutboundClick}
        />

        <ProductComparisonModal
          visible={Boolean(selectedProductEntry)}
          entry={selectedProductEntry}
          city={preferences.city}
          applyLoyaltyCards={applyLoyaltyCards}
          onClose={() => setSelectedProductId(null)}
          onReplaceWithProduct={replaceItemWithProduct}
          onStartStoreMode={handleTransitionToStoreMode}
        />

        <SmartShoppingModal
          visible={smartShoppingOpen}
          onClose={() => setSmartShoppingOpen(false)}
          shoppingListId={activeList?.id}
          items={basketItems}
          config={{
            city: preferences.city,
            preferredChannel:
              preferences.preferredChannel === 'physical'
                ? 'store'
                : preferences.preferredChannel === 'online'
                ? 'delivery'
                : 'all',
            preferredRetailerSlugs: preferences.preferredRetailerSlugs,
            useLoyaltyCards: applyLoyaltyCards,
            allowedLoyaltyPrograms: ownedLoyaltyPrograms,
          }}
          userId={user?.id}
          checkedItemIds={activeStoreCheckedIds}
          onToggleItemChecked={toggleItemChecked}
          onStartShopping={(retailerName, itemIds) => {
            scheduleHandoff(() => {
              handleOpenStoreMode(retailerName, itemIds);
            });
          }}
        />

        <BucharestLocationModal
          visible={locationModalOpen}
          onClose={() => setLocationModalOpen(false)}
          selectedSector={preferences.sector}
          onSelectSector={(sector) => {
            updatePreferences({ city: 'București', sector });
            void runComparison(true);
          }}
        />

        <WhyRecommendationModal
          visible={whyModalOpen}
          onClose={() => setWhyModalOpen(false)}
          data={whyData}
        />

        <DeliveryRulesModal
          visible={deliveryRulesOpen}
          onClose={() => setDeliveryRulesOpen(false)}
        />
      </BeavyScreenTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  container: {
    flex: 1,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: C.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 34,
    gap: 14,
  },
  screenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  screenTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stepKicker: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  strategySection: {
    gap: 6,
    marginTop: 2,
  },
  strategySectionTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pageTitle: {
    fontSize: 26,
    lineHeight: 30,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.7,
  },
  pageSubtitle: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
  },
  subtitleWithLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  subtitleDot: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12.5,
    color: C.muted,
  },
  locationSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.grapefruit,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BeavyRadius.pill,
    minHeight: 26,
  },
  locationSelectorText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12,
    color: C.cherry,
  },
  locationFallbackGlyph: {
    fontSize: 10,
  },
  chevronFallbackGlyph: {
    fontSize: 8,
    color: C.muted,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smartOptimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.accent,
  },
  smartOptimizeBtnText: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.secondary,
  },
  refreshBtnText: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  fallbackGlyph: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  errorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: BeavyRadius.lg,
    backgroundColor: 'rgba(247, 141, 121, 0.22)',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: BeavyFonts.semiBold,
    color: C.primary,
  },
  retryBtn: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    color: C.surface,
  },
  attentionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 46,
    backgroundColor: 'rgba(247, 141, 121, 0.24)',
    borderRadius: BeavyRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  priceAlertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(219, 227, 198, 0.36)',
    borderWidth: 1,
    borderColor: 'rgba(92, 117, 52, 0.25)',
    borderRadius: BeavyRadius.lg,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  priceAlertPillText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  channelHintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 48,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: 'rgba(247, 141, 121, 0.45)',
    borderRadius: BeavyRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  channelHintText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.primary,
  },
  channelHintCta: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  loyaltyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 48,
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.rule,
  },
  loyaltyToggleRowActive: {
    backgroundColor: 'rgba(219, 227, 198, 0.42)',
    borderColor: 'rgba(92, 117, 52, 0.28)',
  },
  loyaltyToggleLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  loyaltyToggleCopy: {
    flex: 1,
    minWidth: 0,
  },
  loyaltyToggleTitle: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  loyaltyToggleSub: {
    fontSize: 11,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
  },
  loyaltyStatePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.secondary,
    flexShrink: 0,
  },
  loyaltyStatePillActive: {
    backgroundColor: C.leekDark,
  },
  loyaltyStateText: {
    fontSize: 11,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  loyaltyStateTextActive: {
    color: C.surface,
  },
  attentionLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attentionText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  attentionCta: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  bottomSection: {
    gap: 11,
  },
  undoBanner: {
    marginHorizontal: 18,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  undoBannerText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.primary,
  },
  undoBannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.secondary,
  },
  undoBannerBtnText: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  heroAuxActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroAuxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
  },
  heroAuxBtnText: {
    fontSize: 12,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.primary,
  },
  heroAuxRejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BeavyRadius.pill,
    backgroundColor: 'transparent',
  },
  heroAuxRejectText: {
    fontSize: 12,
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
    color: C.muted,
  },
  heroAuxGlyph: {
    fontSize: 12,
    color: C.primary,
  },
  rejectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.grapefruit,
    gap: 10,
  },
  rejectedBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rejectedBannerGlyph: {
    fontSize: 14,
    color: C.strawberry,
  },
  rejectedBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
    color: C.primary,
  },
  rejectedBannerResetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.white,
  },
  rejectedBannerResetText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  pressed: {
    opacity: 0.72,
  },
});
