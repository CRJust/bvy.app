import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BasketLineRow } from '@/components/basket/basket-line-row';
import { BasketSummary } from '@/components/basket/basket-summary';
import { HomeCatalogShowcase } from '@/components/basket/home-catalog-showcase';
import { InStoreBar } from '@/components/basket/in-store-bar';
import {
  ReceiptAuditModal,
  type ReceiptAuditItem,
} from '@/components/basket/receipt-audit-modal';
import { StoreSwitcher } from '@/components/basket/store-switcher';
import { BeavyOnboardingModal } from '@/components/beavy-onboarding-modal';
import { AiListComposerModal } from '@/components/list/ai-list-composer-modal';
import { ListSearchComposer } from '@/components/list/list-search-composer';
import { ListsSheetModal } from '@/components/lists-sheet-modal';
import {
  ProductVariantsModal,
  type VariantsModalTarget,
} from '@/components/product-variants-modal';
import { RecipeImportModal } from '@/components/recipe/recipe-import-modal';
import { ScanListModal } from '@/components/scan-list-modal';
import { BarcodeScannerModal } from '@/components/search/barcode-scanner-modal';
import { BeavyScreenTransition } from '@/components/screen-transition';
import { SezamoCreateListModal } from '@/components/sezamo-create-list-modal';
import { BeavyHeader } from '@/components/ui/beavy-header';
import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { type ShoppingItem, useShopping } from '@/context/shopping-context';
import { useTabBar } from '@/context/tab-bar-context';
import { groupShoppingItemsByAisle } from '@/services/beavy-aisle-classifier';
import {
  type DisplayProduct,
  fetchCanonicalProductImages,
  fetchCatalogProductsPage,
} from '@/services/beavy-catalog-search';
import { type ConfirmedScanBatch } from '@/services/beavy-list-scanner';
import {
  type BasketPricingMode,
  type BrandSwapHint,
  buildBrandSwapHints,
  buildLinesForStore,
  buildStoreOptions,
  economySavingsAtStore,
  pickDefaultStoreId,
  SPLIT_STORE_ID,
  splitInStoreTotals,
  summarizeLines,
} from '@/services/live-basket';
import { buildBasketItemPriceGrids } from '@/services/product-price-grid-api';
import { shareShoppingList } from '@/services/share-shopping-list';

const SUGGESTIONS_LIMIT = 24;

/**
 * Tab 1 — „Coșul meu”: lista și prețurile live pe magazine într-un singur ecran.
 * Starea de comparație vine reactiv din ShoppingContext (`precomputedComparison`),
 * deci schimbarea magazinului sau a modului este o simplă re-proiecție locală, fără rețea.
 */
export default function BasketScreen() {
  const {
    ready,
    lists,
    activeList,
    shoppingItems,
    basketItems,
    purchasedItems,
    preferences,
    precomputedComparison,
    isComparing,
    activeStoreCheckedIds,
    updatePreferences,
    createList,
    selectList,
    renameList,
    deleteList,
    loadDemoBaskets,
    addGenericItem,
    addCatalogProduct,
    updateCatalogProductQuantity,
    changeItemQuantity,
    removeItem,
    clearCheckedItems,
    addScannedItemsBatch,
    replaceItemWithProduct,
    getProductQuantity,
    toggleStoreCheckedItem,
    commitStoreCheckedItems,
    recordShoppingSession,
  } = useShopping();
  const { user } = useAuth();
  const { triggerTabTransition } = useTabBar();
  const insets = useSafeAreaInsets();

  const resolvedUserName = useMemo(() => {
    const authName =
      typeof user?.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name.trim()
        : '';
    if (authName) return authName;
    if (user?.email) {
      const emailPrefix = user.email.split('@')[0]?.trim();
      if (emailPrefix) return emailPrefix;
    }
    return preferences.userName?.trim() || '';
  }, [user, preferences.userName]);

  const userInitials = useMemo(() => {
    const parts = resolvedUserName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return resolvedUserName.slice(0, 2).toUpperCase() || 'B';
  }, [resolvedUserName]);

  // ── Omnibar (căutare + rețetă + listă) ───────────────────────────────────
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<DisplayProduct[]>([]);
  const [suggestionsQuery, setSuggestionsQuery] = useState('');
  const requestIdRef = useRef(0);

  const handleChangeSearch = useCallback((nextText: string) => {
    setSearch(nextText);
    if (!nextText.trim()) {
      requestIdRef.current += 1;
      setSuggestions([]);
      setSuggestionsQuery('');
    }
  }, []);

  useEffect(() => {
    const clean = search.trim();
    if (!clean) return;
    const currentReq = ++requestIdRef.current;
    let canceled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetchCatalogProductsPage({
          query: clean,
          categorySlug: null,
          brand: null,
          limit: SUGGESTIONS_LIMIT,
          offset: 0,
          sort: 'relevance',
          includeFamilies: false,
        });
        if (!canceled && currentReq === requestIdRef.current) {
          setSuggestions(res.products);
          setSuggestionsQuery(clean);
        }
      } catch {
        if (!canceled && currentReq === requestIdRef.current) {
          setSuggestions([]);
          setSuggestionsQuery(clean);
        }
      }
    }, 180);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [search]);

  // ── Modale ───────────────────────────────────────────────────────────────
  const [listsSheetOpen, setListsSheetOpen] = useState(false);
  const [createListModalOpen, setCreateListModalOpen] = useState(false);
  const [variantsTarget, setVariantsTarget] = useState<VariantsModalTarget | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [shelfScannerOpen, setShelfScannerOpen] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [aiComposerModalOpen, setAiComposerModalOpen] = useState(false);
  const [aiComposerInitialPrompt, setAiComposerInitialPrompt] = useState<string | null>(null);
  const [receiptAuditOpen, setReceiptAuditOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ id: number; message: string } | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [purchasedOpen, setPurchasedOpen] = useState(false);

  const isOnboardingVisible = ready && preferences.hasCompletedOnboarding === false;

  const showFeedback = useCallback((message: string) => {
    const id = Date.now();
    setFeedback({ id, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.id === id ? null : prev));
    }, 3500);
  }, []);

  const addBatchWithToast = useCallback(
    (batch: ConfirmedScanBatch, suffix = 'adăugate în listă') => {
      const { addedDistinct, addedUnits } = addScannedItemsBatch(batch);
      if (addedDistinct > 0) {
        triggerHaptic('success');
        const prod = addedDistinct === 1 ? '1 produs' : `${addedDistinct} produse`;
        const buc = addedUnits === 1 ? '1 buc.' : `${addedUnits} buc.`;
        showFeedback(`${prod} (${buc}) ${suffix}`);
      }
    },
    [addScannedItemsBatch, showFeedback]
  );

  // ── Imagini canonice ─────────────────────────────────────────────────────
  const [remoteImages, setRemoteImages] = useState<Record<string, string | null>>({});
  const fetchedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const missing = Array.from(
      new Set(
        lists.flatMap((l) =>
          l.items
            .map((it) => it.productId)
            .filter((pid): pid is string => typeof pid === 'string' && pid.length > 0)
            .filter((pid) => !fetchedIdsRef.current.has(pid))
        )
      )
    );
    if (missing.length === 0) return;
    for (const id of missing) fetchedIdsRef.current.add(id);
    let cancelled = false;
    fetchCanonicalProductImages(missing)
      .then((resolved) => {
        if (cancelled || Object.keys(resolved).length === 0) return;
        setRemoteImages((prev) => ({ ...prev, ...resolved }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lists]);

  const getImageUrl = useCallback(
    (it: ShoppingItem): string | null | undefined => {
      if (it.productId && Object.prototype.hasOwnProperty.call(remoteImages, it.productId)) {
        return remoteImages[it.productId] ?? it.imageUrl;
      }
      return it.imageUrl;
    },
    [remoteImages]
  );

  // ── Live Smart Basket: proiecții pure peste `precomputedComparison` ───────
  const [requestedMode, setMode] = useState<BasketPricingMode>('faithful');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [inStoreMode, setInStoreMode] = useState(false);

  // Fără variantă de buget disponibilă, revenim implicit la Mod Fidel.
  const canEconomy = Boolean(precomputedComparison?.budgetSummary.hasBudgetVariant);
  const mode: BasketPricingMode = requestedMode === 'economy' && canEconomy ? 'economy' : 'faithful';

  const storeOptions = useMemo(
    () => buildStoreOptions(precomputedComparison, mode),
    [precomputedComparison, mode]
  );

  const activeStoreId = useMemo(() => {
    if (selectedStoreId && storeOptions.some((o) => o.id === selectedStoreId)) {
      return selectedStoreId;
    }
    return pickDefaultStoreId(storeOptions);
  }, [selectedStoreId, storeOptions]);

  const activeStore = storeOptions.find((o) => o.id === activeStoreId) ?? null;
  const itemIds = useMemo(() => basketItems.map((it) => it.id), [basketItems]);

  const lines = useMemo(
    () => buildLinesForStore(precomputedComparison, mode, activeStoreId, itemIds),
    [precomputedComparison, mode, activeStoreId, itemIds]
  );

  const hints = useMemo(
    () => (mode === 'faithful' ? buildBrandSwapHints(precomputedComparison, activeStoreId) : new Map()),
    [precomputedComparison, mode, activeStoreId]
  );

  const economySavings = useMemo(
    () => economySavingsAtStore(precomputedComparison, activeStoreId),
    [precomputedComparison, activeStoreId]
  );

  const totals = useMemo(
    () => summarizeLines(lines, itemIds, { economySavings }),
    [lines, itemIds, economySavings]
  );

  const inStoreStoreName =
    activeStoreId && activeStoreId !== SPLIT_STORE_ID ? (activeStore?.name ?? null) : null;
  const inStoreActive = inStoreMode && Boolean(inStoreStoreName) && basketItems.length > 0;

  const checkedSet = useMemo(() => new Set(activeStoreCheckedIds), [activeStoreCheckedIds]);
  const inStoreTotals = useMemo(
    () => splitInStoreTotals(lines, checkedSet, itemIds),
    [lines, checkedSet, itemIds]
  );

  const aisleGroups = useMemo(() => groupShoppingItemsByAisle(basketItems), [basketItems]);

  const itemPriceGrids = useMemo(
    () => buildBasketItemPriceGrids(precomputedComparison, basketItems),
    [precomputedComparison, basketItems]
  );

  const handleSelectStore = useCallback((id: string) => {
    setSelectedStoreId(id);
  }, []);

  const handleApplyHint = useCallback(
    (itemId: string, hint: BrandSwapHint) => {
      if (!hint.replacement) return;
      replaceItemWithProduct(itemId, hint.replacement);
      showFeedback(`Înlocuit cu ${hint.alternativeName} (−${hint.savings.toFixed(2).replace('.', ',')} lei)`);
    },
    [replaceItemWithProduct, showFeedback]
  );

  const handleLongPressItem = useCallback(
    (item: ShoppingItem) => {
      triggerHaptic('medium');
      if (Platform.OS === 'web') {
        if (window.confirm(`Elimini „${item.name}” din listă?`)) removeItem(item.id);
        return;
      }
      Alert.alert('Opțiuni produs', `Dorești să elimini „${item.name}” din această listă?`, [
        { text: 'Anulează', style: 'cancel' },
        { text: 'Elimină din listă', style: 'destructive', onPress: () => removeItem(item.id) },
      ]);
    },
    [removeItem]
  );

  const handleFinishInStore = useCallback(() => {
    const ids = activeStoreCheckedIds;
    if (ids.length === 0) return;
    const verifiedTotal = inStoreTotals.inCart;
    const committed = commitStoreCheckedItems(ids);
    if (committed.length === 0) return;
    recordShoppingSession({
      listName: activeList?.name ?? 'Lista de cumpărături',
      retailerName: inStoreStoreName ?? 'Magazin',
      retailerSlug: activeStore?.slug ?? null,
      channelMode: 'physical',
      itemsCount: committed.length,
      verifiedTotal,
      verifiedSavings: 0,
    });
    showFeedback(`${committed.length} produse bifate · ${verifiedTotal.toFixed(2).replace('.', ',')} lei`);
  }, [
    activeStoreCheckedIds,
    inStoreTotals.inCart,
    commitStoreCheckedItems,
    recordShoppingSession,
    activeList?.name,
    inStoreStoreName,
    activeStore?.slug,
    showFeedback,
  ]);

  const receiptAuditItems = useMemo<ReceiptAuditItem[]>(() => {
    return basketItems
      .filter((it) => checkedSet.has(it.id))
      .map((it) => {
        const line = lines.get(it.id);
        const unitPrice =
          line?.lineTotal != null && it.quantity > 0
            ? Math.round((line.lineTotal / it.quantity) * 100) / 100
            : (line?.match?.offer.price ?? 0);
        return {
          id: it.id,
          name: it.name,
          quantity: it.quantity,
          expectedUnitPrice: unitPrice,
        };
      });
  }, [basketItems, lines, checkedSet]);

  const handleInStoreFinish = useCallback(() => {
    if (activeStoreCheckedIds.length > 0) {
      setReceiptAuditOpen(true);
    } else {
      handleFinishInStore();
    }
  }, [activeStoreCheckedIds.length, handleFinishInStore]);

  const handleSaveAudit = useCallback(
    (receiptTotal: number, accuracyPct: number) => {
      handleFinishInStore();
      setInStoreMode(false);
      showFeedback(
        `Audit bon salvat! Acuratețe: ${accuracyPct.toFixed(1)}% · ${receiptTotal.toFixed(2).replace('.', ',')} lei`
      );
    },
    [handleFinishInStore, showFeedback]
  );

  const handleProductStep = useCallback(
    (product: DisplayProduct, nextQty: number) => {
      triggerHaptic(nextQty > 0 ? 'light' : 'selection');
      updateCatalogProductQuantity(product, nextQty);
    },
    [updateCatalogProductQuantity]
  );

  const handleMainScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = e.nativeEvent.contentOffset.y > 4;
    setIsScrolled((prev) => (prev === next ? prev : next));
  }, []);

  const handleClearPurchased = useCallback(() => {
    if (purchasedItems.length === 0) return;
    const run = () => {
      triggerHaptic('medium');
      clearCheckedItems();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Elimini cele ${purchasedItems.length} produse achiziționate?`)) run();
      return;
    }
    Alert.alert(
      'Curăță produsele achiziționate',
      `Sigur dorești să elimini cele ${purchasedItems.length} produse achiziționate din listă?`,
      [
        { text: 'Anulează', style: 'cancel' },
        { text: 'Curăță', style: 'destructive', onPress: run },
      ]
    );
  }, [purchasedItems.length, clearCheckedItems]);

  const renderRow = (item: ShoppingItem) => (
    <BasketLineRow
      key={item.id}
      item={item}
      line={lines.get(item.id)}
      hint={hints.get(item.id) ?? null}
      priceGridSummary={itemPriceGrids.get(item.id) ?? null}
      imageUrl={getImageUrl(item)}
      showStoreName={activeStoreId === SPLIT_STORE_ID}
      city={preferences.city}
      inStore={inStoreActive}
      inCart={checkedSet.has(item.id)}
      onToggleInCart={(id) => {
        triggerHaptic('selection');
        toggleStoreCheckedItem(id);
      }}
      onInspect={(it) => {
        if (!it.productId) return;
        setVariantsTarget({
          kind: 'product',
          product: {
            id: it.productId,
            canonical_name: it.name,
            brand: it.brand ?? null,
            package_size: it.packageSize ?? null,
            image_url: getImageUrl(it) ?? null,
          },
        });
      }}
      onChangeQuantity={changeItemQuantity}
      onLongPress={handleLongPressItem}
      onApplyHint={handleApplyHint}
    />
  );

  const hasItems = basketItems.length > 0;
  const showSearchResults = search.trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <BeavyScreenTransition style={styles.container}>
        <BeavyHeader
          userInitials={userInitials}
          showBottomRule={isScrolled && !hasItems}
          onPressProfile={() => triggerTabTransition(3, () => router.push('/profile'))}
          rightAction={{
            symbol: 'ellipsis',
            fallbackText: '•••',
            accessibilityLabel: 'Gestionează listele',
            onPress: () => setListsSheetOpen(true),
          }}
        />

        {inStoreActive && inStoreStoreName ? (
          <InStoreBar
            storeName={inStoreStoreName}
            inCart={inStoreTotals.inCart}
            remaining={inStoreTotals.remaining}
            checkedCount={activeStoreCheckedIds.length}
            onScan={() => setShelfScannerOpen(true)}
            onFinish={handleInStoreFinish}
            onExit={() => setInStoreMode(false)}
          />
        ) : (
          hasItems && (
            <StoreSwitcher
              options={storeOptions}
              selectedId={activeStoreId}
              loading={isComparing}
              onSelect={handleSelectStore}
              onOpenCompareMatrix={() => triggerTabTransition(2, () => router.push('/compare'))}
            />
          )
        )}

        {!inStoreActive && (
          <View style={styles.listToolbarRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Lista activă: ${activeList?.name ?? 'Lista mea'}. Schimbă lista`}
              onPress={() => {
                triggerHaptic('selection');
                setListsSheetOpen(true);
              }}
              style={({ pressed }) => [styles.listSelectorPill, pressed && styles.pressed]}
            >
              <SymbolView
                name="list.bullet.rectangle.portrait"
                size={14}
                tintColor={C.primary}
                fallback={<Text style={styles.toolbarGlyph}>≡</Text>}
              />
              <Text numberOfLines={1} style={styles.listSelectorTitle}>
                {activeList?.name ?? 'Lista mea'}
              </Text>
              <View style={styles.listCountBadge}>
                <Text style={styles.listCountBadgeText}>{basketItems.length}</Text>
              </View>
              <SymbolView
                name="chevron.down"
                size={10}
                tintColor={C.muted}
                fallback={<Text style={styles.toolbarGlyph}>▾</Text>}
              />
            </Pressable>

            <View style={styles.toolbarRightActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Creează listă nouă"
                onPress={() => {
                  triggerHaptic('selection');
                  setCreateListModalOpen(true);
                }}
                style={({ pressed }) => [styles.toolbarBtn, pressed && styles.pressed]}
              >
                <Text style={styles.toolbarBtnText}>+ Listă</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Deschide catalogul cu toate raioanele"
                onPress={() => {
                  triggerHaptic('selection');
                  router.push('/search');
                }}
                style={({ pressed }) => [styles.toolbarBtn, pressed && styles.pressed]}
              >
                <SymbolView
                  name="square.grid.2x2"
                  size={13}
                  tintColor={C.primary}
                  fallback={<Text style={styles.toolbarGlyph}>⊞</Text>}
                />
                <Text style={styles.toolbarBtnText}>Catalog</Text>
              </Pressable>

              {hasItems && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Partajează lista"
                  onPress={() => {
                    triggerHaptic('medium');
                    void shareShoppingList(activeList, shoppingItems);
                  }}
                  style={({ pressed }) => [styles.toolbarIconBtn, pressed && styles.pressed]}
                >
                  <SymbolView
                    name="square.and.arrow.up"
                    size={14}
                    tintColor={C.primary}
                    fallback={<Text style={styles.toolbarGlyph}>↗</Text>}
                  />
                </Pressable>
              )}
            </View>
          </View>
        )}

        <View style={styles.scrollStage}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(38, 26 + Math.round(insets.bottom * 0.35)) },
            ]}
            onScroll={handleMainScroll}
            scrollEventThrottle={16}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
          >
            {!inStoreActive && (
              <ListSearchComposer
                search={search}
                onChangeSearch={handleChangeSearch}
                onOpenScanModal={() => setScanModalOpen(true)}
                onOpenRecipeModal={() => setRecipeModalOpen(true)}
                onOpenAiComposerModal={(prompt) => {
                  if (prompt) {
                    setAiComposerInitialPrompt(prompt);
                    setAiComposerModalOpen(true);
                  } else {
                    triggerTabTransition(1, () => router.push('/chat'));
                  }
                }}
                onOpenFullCatalogSearch={(q) =>
                  router.push({ pathname: '/search', params: { q } })
                }
                onAddCanonicalBatch={(batch, label) => {
                  addBatchWithToast(batch, `din ${label} adăugate în coș`);
                }}
                scanImportFeedback={feedback}
                onDismissScanFeedback={() => setFeedback(null)}
                suggestions={suggestionsQuery === search.trim() ? suggestions : []}
                getProductQuantity={getProductQuantity}
                onProductStep={handleProductStep}
                onOpenVariants={(product) => setVariantsTarget({ kind: 'product', product })}
                onOpenQueryVariants={(query) => setVariantsTarget({ kind: 'query', query })}
                onAddGenericTerm={(term) => {
                  addGenericItem(term, 1);
                  handleChangeSearch('');
                  showFeedback(`„${term}” adăugat`);
                }}
              />
            )}

            {!showSearchResults && (
              <>
                {hasItems && !inStoreActive && (
                  <BasketSummary
                    storeName={activeStore?.name ?? null}
                    totals={totals}
                    mode={mode}
                    canEconomy={canEconomy}
                    onChangeMode={setMode}
                    onOpenCompare={() => triggerTabTransition(2, () => router.push('/compare'))}
                    onEnterStoreMode={() => {
                      if (activeStoreId === SPLIT_STORE_ID) {
                        const first = storeOptions.find((o) => o.kind === 'store');
                        if (first) setSelectedStoreId(first.id);
                      }
                      setInStoreMode(true);
                    }}
                    loading={isComparing}
                  />
                )}

                {!hasItems ? (
                  <View style={styles.empty}>
                    <View style={styles.emptyIconCircle}>
                      <SymbolView
                        name="basket.fill"
                        size={28}
                        tintColor={C.cherry}
                        fallback={<Text style={styles.emptyIconGlyph}>▣</Text>}
                      />
                    </View>
                    <Text style={styles.emptyTitle}>
                      Coșul tău Beavy este gol
                    </Text>
                    <Text style={styles.emptyBody}>
                      Începe cu o rețetă sau o listă în Pasul 1, scanează codul de bare sau adaugă produse canonice direct din catalog.
                    </Text>
                    <View style={styles.emptyActionsRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => triggerTabTransition(1, () => router.push('/chat'))}
                        style={({ pressed }) => [styles.emptyPrimaryBtn, pressed && styles.pressed]}
                      >
                        <SymbolView
                          name="sparkles"
                          size={15}
                          tintColor={C.white}
                          fallback={<Text style={styles.emptyBtnGlyph}>✦</Text>}
                        />
                        <Text style={styles.emptyPrimaryBtnText}>Începe cu Rețetă & AI</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push('/search')}
                        style={({ pressed }) => [styles.emptySecondaryBtn, pressed && styles.pressed]}
                      >
                        <SymbolView
                          name="magnifyingglass"
                          size={14}
                          tintColor={C.cherry}
                          fallback={<Text style={styles.emptyBtnGlyph}>⌕</Text>}
                        />
                        <Text style={styles.emptySecondaryBtnText}>Adaugă produse</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setShelfScannerOpen(true)}
                        style={({ pressed }) => [styles.emptySecondaryBtn, pressed && styles.pressed]}
                      >
                        <SymbolView
                          name="barcode.viewfinder"
                          size={14}
                          tintColor={C.cherry}
                          fallback={<Text style={styles.emptyBtnGlyph}>▯</Text>}
                        />
                        <Text style={styles.emptySecondaryBtnText}>Scanează EAN</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  aisleGroups.map((group) => (
                    <View key={group.id} style={styles.group}>
                      <Text style={styles.groupTitle}>
                        {inStoreActive ? `${group.step}. ` : ''}
                        {group.name}
                        <Text style={styles.groupCount}>{`  ${group.items.length}`}</Text>
                      </Text>
                      {group.items.map(renderRow)}
                    </View>
                  ))
                )}

                {!inStoreActive && (
                  <HomeCatalogShowcase
                    hasBasketItems={hasItems}
                    getProductQuantity={getProductQuantity}
                    onProductStep={handleProductStep}
                    onInspectProduct={(product) =>
                      setVariantsTarget({ kind: 'product', product })
                    }
                    onSelectSmartPrompt={(prompt) => handleChangeSearch(prompt)}
                    onLoadDemoBaskets={loadDemoBaskets}
                    onOpenFullCatalog={() => router.push('/search')}
                  />
                )}

                {purchasedItems.length > 0 && (
                  <View style={styles.group}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: purchasedOpen }}
                      onPress={() => {
                        triggerHaptic('selection');
                        setPurchasedOpen((v) => !v);
                      }}
                      style={styles.purchasedHead}
                    >
                      <Text style={styles.groupTitle}>
                        Achiziționate
                        <Text style={styles.groupCount}>{`  ${purchasedItems.length}`}</Text>
                      </Text>
                      <Text style={styles.purchasedToggle}>{purchasedOpen ? 'Ascunde' : 'Arată'}</Text>
                    </Pressable>
                    {purchasedOpen && (
                      <>
                        {purchasedItems.map((it) => (
                          <View key={it.id} style={styles.purchasedRow}>
                            <Text style={styles.purchasedName} numberOfLines={1}>
                              {it.quantity}× {it.name}
                            </Text>
                          </View>
                        ))}
                        <Pressable
                          accessibilityRole="button"
                          onPress={handleClearPurchased}
                          style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.clearBtnText}>Curăță achiziționatele</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>

        <ListsSheetModal
          visible={listsSheetOpen}
          lists={lists}
          activeListId={activeList?.id ?? ''}
          onSelectList={(id) => selectList(id)}
          onCreateList={(name) => createList(name, true)}
          onRenameList={(id, name) => renameList(id, name)}
          onDeleteList={(id) => deleteList(id)}
          onLoadDemoBaskets={loadDemoBaskets}
          onClose={() => setListsSheetOpen(false)}
        />

        <ProductVariantsModal
          visible={Boolean(variantsTarget)}
          target={variantsTarget}
          getProductQuantity={getProductQuantity}
          onUpdateQuantity={handleProductStep}
          onClose={() => setVariantsTarget(null)}
        />

        <ScanListModal
          visible={scanModalOpen}
          activeListName={activeList?.name ?? 'Lista de cumpărături'}
          onClose={() => setScanModalOpen(false)}
          onOpenRecipeModal={() => setRecipeModalOpen(true)}
          onConfirmAddItems={(batch: ConfirmedScanBatch) => {
            setScanModalOpen(false);
            addBatchWithToast(batch);
          }}
          onGoToProfile={() => triggerTabTransition(3, () => router.push('/profile'))}
        />

        <RecipeImportModal
          visible={recipeModalOpen}
          activeListName={activeList?.name ?? 'Lista de cumpărături'}
          onClose={() => setRecipeModalOpen(false)}
          onConfirmAddBatch={(batch: ConfirmedScanBatch, recipeTitle: string) => {
            setRecipeModalOpen(false);
            addBatchWithToast(batch, `pentru „${recipeTitle}” adăugate în listă`);
          }}
        />

        <AiListComposerModal
          visible={aiComposerModalOpen}
          activeListName={activeList?.name ?? 'Lista de cumpărături'}
          initialPrompt={aiComposerInitialPrompt}
          onClose={() => {
            setAiComposerModalOpen(false);
            setAiComposerInitialPrompt(null);
          }}
          onConfirmAddBatch={(batch: ConfirmedScanBatch) => {
            setAiComposerModalOpen(false);
            setAiComposerInitialPrompt(null);
            addBatchWithToast(batch);
          }}
        />

        <BarcodeScannerModal
          visible={shelfScannerOpen}
          userCity={preferences.city}
          onClose={() => setShelfScannerOpen(false)}
          onAddProductToList={(product, quantity) => addCatalogProduct(product, quantity ?? 1)}
        />

        <SezamoCreateListModal
          visible={createListModalOpen}
          onCreateList={(name) => createList(name, true)}
          onClose={() => setCreateListModalOpen(false)}
        />

        <BeavyOnboardingModal
          visible={isOnboardingVisible}
          initialCity={preferences.city}
          initialChannel={preferences.preferredChannel}
          initialRetailers={preferences.preferredRetailerSlugs}
          onComplete={(results) => {
            updatePreferences({
              city: results.city,
              preferredChannel: results.preferredChannel,
              preferredRetailerSlugs: results.preferredRetailerSlugs,
              hasCompletedOnboarding: true,
            });
          }}
          onDismiss={() => updatePreferences({ hasCompletedOnboarding: true })}
        />

        <ReceiptAuditModal
          visible={receiptAuditOpen}
          onClose={() => setReceiptAuditOpen(false)}
          storeName={inStoreStoreName ?? 'Magazin'}
          estimatedTotal={inStoreTotals.inCart}
          items={receiptAuditItems}
          onSaveAudit={handleSaveAudit}
        />
      </BeavyScreenTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  container: { flex: 1, minHeight: 0, maxWidth: 680, width: '100%', alignSelf: 'center' },
  scrollStage: { flex: 1, minHeight: 0, overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  pressed: { opacity: 0.78 },
  group: { marginTop: 8 },
  groupTitle: {
    fontSize: 13,
    color: C.muted,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    paddingVertical: 6,
  },
  groupCount: { color: C.strawberry, fontVariant: ['tabular-nums'] },
  empty: { paddingVertical: 32, gap: 12, alignItems: 'center', textAlign: 'center' },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.grapefruit,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyIconGlyph: { fontSize: 24, color: C.cherry },
  emptyTitle: {
    fontSize: 21,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    color: C.muted,
    fontFamily: BeavyFonts.medium,
    textAlign: 'center',
    maxWidth: 380,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  emptyPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.cherry,
  },
  emptyPrimaryBtnText: {
    color: C.white,
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
  },
  emptySecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
  },
  emptySecondaryBtnText: {
    color: C.cherry,
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
  },
  emptyBtnGlyph: {
    fontSize: 13,
    color: C.cherry,
  },
  emptyBtn: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: C.grapefruit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { color: C.cherry, fontFamily: BeavyFonts.bold, fontWeight: '700', fontSize: 14 },
  purchasedHead: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  purchasedToggle: { fontSize: 13, color: C.cherry, fontFamily: BeavyFonts.bold, fontWeight: '700' },
  purchasedRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  purchasedName: { fontSize: 14, color: C.muted, fontFamily: BeavyFonts.medium },
  clearBtn: { minHeight: 44, justifyContent: 'center' },
  clearBtnText: { color: C.cherry, fontFamily: BeavyFonts.bold, fontWeight: '700', fontSize: 13.5 },
  listToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
    gap: 8,
  },
  listSelectorPill: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
  },
  listSelectorTitle: {
    flexShrink: 1,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13,
    color: C.primary,
  },
  listCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: C.leek,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCountBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 11,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  toolbarRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolbarBtn: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
  },
  toolbarBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  toolbarIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarGlyph: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  emptyBadgeRow: {
    flexDirection: 'row',
  },
  emptyBadge: {
    backgroundColor: C.leek,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
  },
  emptyBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.primary,
    letterSpacing: 0.6,
  },
});
