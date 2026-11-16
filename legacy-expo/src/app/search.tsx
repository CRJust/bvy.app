import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AislePickerModal } from '@/components/aisle-picker-modal';
import { QuickCartBar } from '@/components/list/quick-cart-bar';
import { ProductComparisonModal } from '@/components/product-comparison-modal';
import { BeavyCatalogProductCard } from '@/components/product/beavy-product-card';
import { RecipeImportModal } from '@/components/recipe/recipe-import-modal';
import { ScanListModal } from '@/components/scan-list-modal';
import { BarcodeScannerModal } from '@/components/search/barcode-scanner-modal';
import { BeavyScreenTransition } from '@/components/screen-transition';
import { BeavyHeader } from '@/components/ui/beavy-header';
import { BeavyCardSkeleton } from '@/components/ui/beavy-skeleton';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
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
  type BeavyFamilySearchResult,
  CATALOG_CATEGORIES,
  type CatalogSortMode,
  type CategoryBrandFacet,
  type CategoryDepartmentGroup,
  type DisplayProduct,
  type DynamicCategoryNode,
  deduplicateCatalogProducts,
  fetchCatalogDepartmentTree,
  fetchCatalogProductFamilies,
  fetchCatalogProductsPage,
  fetchCategoryBrands,
  type GenericTermCrossStoreResult,
  getCachedCatalogPage,
  prefetchCatalogProductsPage,
  searchGenericTermAcrossRetailers,
} from '@/services/beavy-catalog-search';
import {
  type BeavyRetailer,
  estimateProductUnitPricing,
  fetchActiveRetailers,
  fetchSmartOffersForProduct,
  type ItemComparisonStatus,
} from '@/services/beavy-comparison';
import { type ConfirmedScanBatch } from '@/services/beavy-list-scanner';
import { POPULAR_ROMANIAN_RECIPES } from '@/services/beavy-recipe-parser';
import {
  extractGramajFacets,
  normalizeGramajFacet,
} from '@/services/product-price-grid';

const PAGE_SIZE = 28;
const QUICK_STARTERS = [
  'Lapte',
  'Cafea',
  'Banane',
  'Ouă',
];

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; cat?: string }>();
  const initialParamQ = typeof params.q === 'string' ? params.q : '';
  const initialParamCat = typeof params.cat === 'string' ? params.cat : null;

  const {
    basketItems,
    preferences,
    activeList,
    addCatalogProduct,
    addGenericItem,
    updateCatalogProductQuantity,
    addScannedItemsBatch,
    getProductQuantity,
  } = useShopping();
  const { user } = useAuth();
  const { triggerTabTransition } = useTabBar();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const resolvedUserName = useMemo(() => {
    const authName =
      typeof user?.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name.trim()
        : '';
    return authName || user?.email?.split('@')[0]?.trim() || preferences.userName?.trim() || '';
  }, [user, preferences.userName]);

  const userInitials = useMemo(() => {
    const parts = resolvedUserName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return resolvedUserName.slice(0, 2).toUpperCase() || 'B';
  }, [resolvedUserName]);

  const [query, setQuery] = useState(initialParamQ);
  const [lastParamQ, setLastParamQ] = useState(initialParamQ);
  if (initialParamQ && initialParamQ !== lastParamQ) {
    setLastParamQ(initialParamQ);
    setQuery(initialParamQ);
  }

  const [selectedRetailerSlug, setSelectedRetailerSlug] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialParamCat);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<CatalogSortMode>('relevance');
  const [promoOnly, setPromoOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const [retailers, setRetailers] = useState<BeavyRetailer[]>([]);
  const [departments, setDepartments] = useState<CategoryDepartmentGroup[]>([]);
  const [dynamicCategories, setDynamicCategories] = useState<DynamicCategoryNode[]>([]);
  const [brandFacets, setBrandFacets] = useState<CategoryBrandFacet[]>([]);

  const [products, setProducts] = useState<DisplayProduct[]>([]);
  const [families, setFamilies] = useState<BeavyFamilySearchResult[]>([]);
  const [selectedGramaj, setSelectedGramaj] = useState<string | null>(null);

  const gramajFacets = useMemo(() => extractGramajFacets(products), [products]);
  const activeGramaj =
    selectedGramaj && gramajFacets.some((g) => g.label === selectedGramaj)
      ? selectedGramaj
      : null;

  const displayedProducts = useMemo(() => {
    if (!activeGramaj) return products;
    return products.filter(
      (p) => normalizeGramajFacet(p.package_size, p.canonical_name) === activeGramaj
    );
  }, [products, activeGramaj]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [aislePickerOpen, setAislePickerOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [barcodeHint, setBarcodeHint] = useState<string | null>(null);
  const [barcodeSuggestedQuery, setBarcodeSuggestedQuery] = useState<string | null>(null);
  const [genericCrossStore, setGenericCrossStore] =
    useState<GenericTermCrossStoreResult | null>(null);
  const [showScrolledRule, setShowScrolledRule] = useState(false);

  // Preview comparație per produs direct din Caută
  const [previewProduct, setPreviewProduct] = useState<DisplayProduct | null>(null);
  const [previewEntry, setPreviewEntry] = useState<ItemComparisonStatus | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeModalInitialText, setRecipeModalInitialText] = useState<string | null>(null);
  const [recipeFeedback, setRecipeFeedback] = useState<string | null>(null);

  const handleOpenPresetRecipe = useCallback((text: string) => {
    triggerHaptic('selection');
    setRecipeModalInitialText(text);
    setRecipeModalOpen(true);
  }, []);

  const handleConfirmRecipeBatch = useCallback(
    (batch: ConfirmedScanBatch, recipeTitle: string) => {
      const { addedDistinct, addedUnits } = addScannedItemsBatch(batch);
      setRecipeModalOpen(false);
      setRecipeModalInitialText(null);
      if (addedDistinct > 0) {
        triggerHaptic('success');
        const prodLabel = addedDistinct === 1 ? '1 produs' : `${addedDistinct} produse`;
        const bucLabel = addedUnits === 1 ? '1 buc.' : `${addedUnits} buc.`;
        setRecipeFeedback(
          `Adăugat ${prodLabel} (${bucLabel}) pentru „${recipeTitle}” în lista ta`
        );
        setTimeout(() => setRecipeFeedback(null), 3500);
      }
    },
    [addScannedItemsBatch]
  );

  const totalUnits = basketItems.reduce((acc, it) => acc + (it.quantity || 1), 0);
  const activeFilterCount =
    Number(Boolean(selectedRetailerSlug)) +
    Number(Boolean(selectedCategory)) +
    Number(Boolean(selectedBrand)) +
    Number(promoOnly) +
    Number(sortMode !== 'relevance');
  const prevActivityRef = useRef({ distinct: basketItems.length, units: totalUnits });
  const countCircleScale = useSharedValue(1);

  useEffect(() => {
    const grew =
      basketItems.length > prevActivityRef.current.distinct ||
      totalUnits > prevActivityRef.current.units;
    if (grew && !reducedMotion) {
      countCircleScale.set(
        withSequence(
          withTiming(1.26, { duration: 95, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) })
        )
      );
    }
    prevActivityRef.current = { distinct: basketItems.length, units: totalUnits };
  }, [basketItems.length, totalUnits, countCircleScale, reducedMotion]);

  const countCircleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countCircleScale.get() }],
  }));

  useEffect(() => {
    let canceled = false;
    fetchActiveRetailers()
      .then((list) => {
        if (!canceled) setRetailers(list);
      })
      .catch(() => {
        if (!canceled) setRetailers([]);
      });
    fetchCatalogDepartmentTree()
      .then((tree) => {
        if (!canceled) {
          setDepartments(tree.departments);
          setDynamicCategories(tree.flatLeaves);
        }
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    fetchCategoryBrands(selectedCategory, 18)
      .then((facets) => {
        if (!canceled) setBrandFacets(facets);
      })
      .catch(() => {
        if (!canceled) setBrandFacets([]);
      });
    return () => {
      canceled = true;
    };
  }, [selectedCategory]);

  // Pre-încărcare silențioasă în fundal a catalogului implicit după stabilizarea UI-ului
  useEffect(() => {
    let canceled = false;
    const idleTimer = setTimeout(() => {
      if (canceled) return;
      void prefetchCatalogProductsPage({
        query: '',
        categorySlug: null,
        brand: null,
        retailerSlug: null,
        sort: 'stores_desc',
        promoOnly: false,
        limit: PAGE_SIZE,
        offset: 0,
      });
    }, 1200);

    return () => {
      canceled = true;
      clearTimeout(idleTimer);
    };
  }, []);

  // Execută căutarea v2 prin Supabase RPC cu debounce scurt și cache instant (0 ms)
  useEffect(() => {
    let canceled = false;
    const cleanQ = query.trim();
    const targetQuery = cleanQ.length >= 2 || /^[0-9]{8,14}$/.test(cleanQ) ? cleanQ : '';
    const targetSort: CatalogSortMode =
      cleanQ.length >= 2 ? sortMode : sortMode === 'relevance' ? 'stores_desc' : sortMode;

    const cacheOptions = {
      query: targetQuery,
      categorySlug: selectedCategory,
      brand: selectedBrand,
      retailerSlug: selectedRetailerSlug,
      sort: targetSort,
      promoOnly,
      limit: PAGE_SIZE,
      offset: 0,
    };

    // Verificare cache în microtask pentru a evita cascading renders sincrone
    const cachedHit = getCachedCatalogPage(cacheOptions);
    if (cachedHit) {
      queueMicrotask(() => {
        if (!canceled) {
          setProducts(cachedHit.products);
          setTotalCount(cachedHit.totalCount);
          setHasMore(cachedHit.hasMore);
          setBarcodeHint(cachedHit.barcodeHint ?? null);
          setBarcodeSuggestedQuery(cachedHit.barcodeSuggestedQuery ?? null);
          setLoading(false);
          setError('');
        }
      });
    }

    const timer = setTimeout(async () => {
      if (!canceled && !cachedHit) {
        setLoading(true);
        setError('');
        setFamilies([]);
      }
      try {
        const isTextCrossQuery =
          cleanQ.length >= 2 &&
          !/^[0-9]{8,14}$/.test(cleanQ) &&
          !selectedRetailerSlug &&
          !selectedBrand;

        // Rezultatele principale apar imediat, fără a bloca interfața pe agregarea cross-retailer
        const res = await fetchCatalogProductsPage(cacheOptions);
        if (!canceled) {
          setProducts(res.products);
          setTotalCount(res.totalCount);
          setHasMore(res.hasMore);
          setBarcodeHint(res.barcodeHint ?? null);
          setBarcodeSuggestedQuery(res.barcodeSuggestedQuery ?? null);
          setLoading(false);

          // Pre-încărcare în cache hardware pe disc și în memorie a primelor 8 imagini
          const topImages = res.products
            .slice(0, 8)
            .map((p) => p.image_url)
            .filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
          if (topImages.length > 0) {
            void ExpoImage.prefetch(topImages, 'memory-disk').catch(() => {});
          }
        }

        const shouldLoadFamilies =
          cleanQ.length >= 2 &&
          !selectedRetailerSlug &&
          !selectedBrand &&
          !promoOnly &&
          !/^[0-9]{8,14}$/.test(cleanQ);
        if (shouldLoadFamilies && !canceled) {
          void fetchCatalogProductFamilies(cleanQ, selectedCategory)
            .then((familyResults) => {
              if (!canceled) setFamilies(familyResults);
            })
            .catch(() => {
              if (!canceled) setFamilies([]);
            });
        }

        if (isTextCrossQuery && !canceled) {
          setGenericCrossStore(null);
          searchGenericTermAcrossRetailers(cleanQ, preferences.city)
            .then((crossRes) => {
              if (!canceled) {
                setGenericCrossStore(
                  crossRes && crossRes.retailerOffers.length > 0 ? crossRes : null
                );
              }
            })
            .catch(() => {});
        } else if (!canceled) {
          setGenericCrossStore(null);
        }
      } catch (err) {
        if (!canceled) {
          setError(
            err instanceof Error ? err.message : 'Nu am putut încărca produsele.'
          );
          setGenericCrossStore(null);
          setLoading(false);
        }
      }
    }, cleanQ.length > 0 ? 180 : 20);

    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [
    query,
    selectedCategory,
    selectedBrand,
    selectedRetailerSlug,
    sortMode,
    promoOnly,
    preferences.city,
  ]);

  const handleLoadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const cleanQ = query.trim();
    try {
      const res = await fetchCatalogProductsPage({
        query: cleanQ.length >= 2 || /^[0-9]{8,14}$/.test(cleanQ) ? cleanQ : '',
        categorySlug: selectedCategory,
        brand: selectedBrand,
        retailerSlug: selectedRetailerSlug,
        sort: cleanQ.length >= 2 ? sortMode : sortMode === 'relevance' ? 'stores_desc' : sortMode,
        promoOnly,
        limit: PAGE_SIZE,
        offset: products.length,
      });
      setProducts((prev) => deduplicateCatalogProducts([...prev, ...res.products]));
      setHasMore(res.hasMore);
      if (res.totalCount > 0) setTotalCount(res.totalCount);
    } catch {
      // ignora eroare paginare temporară
    } finally {
      setLoadingMore(false);
    }
  }, [
    hasMore,
    loading,
    loadingMore,
    products.length,
    promoOnly,
    query,
    selectedBrand,
    selectedCategory,
    selectedRetailerSlug,
    sortMode,
  ]);

  const handleInspectProduct = useCallback(
    async (product: DisplayProduct) => {
      setPreviewProduct(product);
      setPreviewLoading(true);
      const baseEntry: ItemComparisonStatus = {
        item: {
          id: product.id,
          productId: product.id,
          name: product.canonical_name,
          quantity: Math.max(1, getProductQuantity(product.id, product.canonical_name) || 1),
          brand: product.brand,
          packageSize: product.package_size,
          imageUrl: product.image_url,
          checked: false,
          isCustom: false,
        },
        status: 'no_offers_yet',
        offers: [],
        equivalentOffersCount: 0,
        unavailableOffers: [],
        lowestPrice: product.min_price ?? null,
        highestPrice: product.max_price ?? null,
        hasLoyaltyOffer: Boolean(product.has_loyalty),
        lowestLoyaltyPrice: null,
        bestLoyaltyLabel: null,
        bestLoyaltyRetailerName: null,
        hasRegularPromo: Boolean(product.has_promo),
        bestRegularPromoLabel: null,
        canonicalName: product.canonical_name,
        canonicalBrand: product.brand,
        canonicalPackageSize: product.package_size,
        canonicalImageUrl: product.image_url,
        canonicalCategoryName: product.category_name ?? null,
      };
      setPreviewEntry(baseEntry);

      try {
        const targetIds =
          product.mergedProductIds && product.mergedProductIds.length > 0
            ? product.mergedProductIds
            : [product.id];
        const offers = await fetchSmartOffersForProduct(
          targetIds,
          preferences.city,
          { includeOutOfStock: true }
        );
        const inStock = offers
          .filter((o) => o.stock_status !== 'out_of_stock')
          .sort((a, b) => (a.promo_price ?? a.price) - (b.promo_price ?? b.price));
        const outOfStock = offers.filter((o) => o.stock_status === 'out_of_stock');
        setPreviewEntry({
          ...baseEntry,
          status: inStock.length > 0 ? 'has_offers' : outOfStock.length > 0 ? 'unavailable' : 'no_offers_yet',
          offers: inStock,
          unavailableOffers: outOfStock,
        });
      } catch {
        // păstrăm entry-ul de bază
      } finally {
        setPreviewLoading(false);
      }
    },
    [getProductQuantity, preferences.city]
  );

  const handleConfirmScan = useCallback(
    (batch: ConfirmedScanBatch) => {
      addScannedItemsBatch(batch);
      setScanModalOpen(false);
    },
    [addScannedItemsBatch]
  );


  const activeCategoryName = useMemo(() => {
    if (!selectedCategory) return 'Toate raioanele';
    return (
      dynamicCategories.find((c) => c.slug === selectedCategory)?.name ??
      CATALOG_CATEGORIES.find((c) => c.slug === selectedCategory)?.name ??
      selectedCategory
    );
  }, [dynamicCategories, selectedCategory]);

  const cleanQuery = query.trim();

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextRule = e.nativeEvent.contentOffset.y > 6;
    if (nextRule !== showScrolledRule) {
      setShowScrolledRule(nextRule);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <BeavyScreenTransition style={styles.container}>
        <BeavyHeader
          userInitials={userInitials}
          onPressProfile={() =>
            triggerTabTransition(3, () => router.push('/profile'))
          }
          showBottomRule={showScrolledRule}
          rightAction={{
            symbol: 'camera.viewfinder',
            fallbackText: 'OCR',
            accessibilityLabel: 'Scanează o listă de produse',
            onPress: () => setScanModalOpen(true),
          }}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom:
                basketItems.length > 0
                  ? Math.max(150, insets.bottom + 128)
                  : Math.max(120, insets.bottom + 100),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={32}
          onScroll={handleScroll}
        >
          {/* Titlu + Subtitlu + Search bar principal */}
          <View style={styles.heroBlock}>
            <View>
              <Text style={styles.pageTitle}>Descoperă</Text>
              <Text style={styles.pageSub}>
                Inspirație culinară, oferte reale și catalog complet
              </Text>
            </View>

            {recipeFeedback && (
              <View style={styles.recipeFeedbackBanner}>
                <SymbolView
                  name="checkmark.circle.fill"
                  tintColor={C.leekDark}
                  size={15}
                  fallback={<Text style={styles.feedbackFallbackIcon}>✓</Text>}
                />
                <Text style={styles.recipeFeedbackText}>{recipeFeedback}</Text>
              </View>
            )}

            <View style={styles.searchBar}>
              <SymbolView
                name="magnifyingglass"
                tintColor={C.primary}
                size={17}
                fallback={<Text style={styles.searchFallback}>⌕</Text>}
              />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Caută produs, brand sau cod EAN..."
                placeholderTextColor={C.muted}
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {!!query && (
                <Pressable
                  onPress={() => setQuery('')}
                  hitSlop={10}
                  style={styles.clearBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Șterge căutarea"
                >
                  <Text style={styles.clearBtnText}>×</Text>
                </Pressable>
              )}
              <View style={styles.barDivider} />
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setBarcodeScannerOpen(true);
                }}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.aisleQuickBtn,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Scanează cod de bare EAN"
              >
                <SymbolView
                  name="barcode.viewfinder"
                  tintColor={C.primary}
                  size={18}
                  fallback={<Text style={styles.fallbackGlyph}>▦</Text>}
                />
              </Pressable>
              <View style={styles.barDivider} />
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setAislePickerOpen(true);
                }}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.aisleQuickBtn,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Alege raionul"
              >
                <SymbolView
                  name="square.grid.2x2"
                  tintColor={C.primary}
                  size={16}
                  fallback={<Text style={styles.fallbackGlyph}>⊞</Text>}
                />
              </Pressable>
            </View>

            {/* STAREA DE DESCOPERIRE: REȚETE & INSPIRAȚIE CULINARĂ */}
            {cleanQuery.length === 0 && !selectedCategory && !selectedRetailerSlug && (
              <View style={styles.discoveryBlock}>
                {/* 1. Secțiunea Rețete & Meniuri Săptămânale */}
                <View style={styles.discoverySection}>
                  <View style={styles.discoveryHeaderRow}>
                    <View style={styles.discoveryTitleWrap}>
                      <SymbolView
                        name="fork.knife"
                        tintColor={C.cherry}
                        size={15}
                        fallback={<Text style={styles.fallbackGlyph}>✦</Text>}
                      />
                      <Text style={styles.discoverySectionTitle}>
                        Ce gătești săptămâna asta?
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        setRecipeModalInitialText(null);
                        setRecipeModalOpen(true);
                      }}
                      hitSlop={8}
                      style={styles.discoveryLinkBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.discoveryLinkText}>
                        Importă link ↗
                      </Text>
                    </Pressable>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recipeCardsScroll}
                  >
                    {POPULAR_ROMANIAN_RECIPES.map((recipe) => (
                      <Pressable
                        key={recipe.id}
                        onPress={() => handleOpenPresetRecipe(recipe.text)}
                        style={({ pressed }) => [
                          styles.recipeCard,
                          pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Rețetă ${recipe.title}`}
                      >
                        <View style={styles.recipeCardTop}>
                          <View style={styles.recipeCardIconBox}>
                            <SymbolView
                              name={(recipe.symbol || 'fork.knife') as never}
                              tintColor={C.cherry}
                              size={16}
                              fallback={<Text style={styles.fallbackGlyph}>✦</Text>}
                            />
                          </View>
                          <View style={styles.recipeServingsPill}>
                            <Text style={styles.recipeServingsText}>
                              {recipe.servings} porții
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.recipeCardTitle} numberOfLines={2}>
                          {recipe.title}
                        </Text>
                        <Text style={styles.recipeCardActionText}>
                          Vezi ingrediente ›
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {/* 2. Căutări rapide sugerate */}
                <View style={styles.starterSection}>
                  <Text style={styles.starterSectionLabel}>
                    Căutări frecvente în supermarketuri:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipsScroll}
                  >
                    {QUICK_STARTERS.map((term) => (
                      <Pressable
                        key={term}
                        onPress={() => {
                          triggerHaptic('selection');
                          setQuery(term);
                        }}
                        style={({ pressed }) => [
                          styles.starterChip,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.starterChipText}>{term}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}
          </View>

          <View style={styles.resultsToolbar}>
            <Text style={styles.resultCount}>
              {`${totalCount.toLocaleString('ro-RO')} produse`}
            </Text>
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setFiltersExpanded((expanded) => !expanded);
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={filtersExpanded ? 'Ascunde filtrele' : 'Arată filtrele'}
              accessibilityState={{ expanded: filtersExpanded }}
            >
              <SymbolView
                name="slider.horizontal.3"
                tintColor={C.primary}
                size={15}
                fallback={<Text style={styles.filterToggleFallback}>≡</Text>}
              />
              <Text style={styles.filterToggleText}>Filtrează</Text>
              {activeFilterCount > 0 && (
                <Text style={styles.filterCount}>{activeFilterCount}</Text>
              )}
            </Pressable>
          </View>

          {filtersExpanded && (
            <View style={styles.filterPanel}>
          {/* Strip magazine (filtrare per magazin din cele 8 active) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setSelectedRetailerSlug(null);
              }}
              style={[
                styles.storeFilterPill,
                selectedRetailerSlug === null && styles.storeFilterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.storeFilterText,
                  selectedRetailerSlug === null && styles.storeFilterTextActive,
                ]}
              >
                {`Toate (${retailers.length || 8})`}
              </Text>
            </Pressable>

            {retailers.map((r) => {
              const active = selectedRetailerSlug === r.slug;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedRetailerSlug((prev) =>
                      prev === r.slug ? null : r.slug
                    );
                  }}
                  style={[
                    styles.storeFilterPill,
                    active && styles.storeFilterPillActive,
                  ]}
                >
                  <RetailerLogo
                    retailerName={r.name}
                    slug={r.slug}
                    logoUrl={r.logo_url}
                    size={22}
                    shape="circle"
                  />
                  <Text
                    style={[
                      styles.storeFilterText,
                      active && styles.storeFilterTextActive,
                    ]}
                  >
                    {r.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Controale sortare + Promoții + Raion */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setViewMode((prev) => (prev === 'grid' ? 'list' : 'grid'));
              }}
              style={[
                styles.controlChip,
                styles.viewToggleChip,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                viewMode === 'grid' ? 'Comută la listă' : 'Comută la grilă pe 2 coloane'
              }
            >
              <SymbolView
                name={viewMode === 'grid' ? 'list.bullet' : 'square.grid.2x2'}
                tintColor={C.primary}
                size={13}
                fallback={
                  <Text style={styles.controlChipText}>
                    {viewMode === 'grid' ? '☰' : '⊞'}
                  </Text>
                }
              />
              <Text style={styles.controlChipText}>
                {viewMode === 'grid' ? 'Listă' : 'Grilă'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setAislePickerOpen(true);
              }}
              style={[
                styles.controlChip,
                selectedCategory !== null && styles.controlChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.controlChipText,
                  selectedCategory !== null && styles.controlChipTextSelected,
                ]}
              >
                {`Raion: ${activeCategoryName} ▾`}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setPromoOnly((v) => !v);
              }}
              style={[styles.controlChip, promoOnly && styles.promoToggleActive]}
            >
              <Text
                style={[
                  styles.controlChipText,
                  promoOnly && styles.promoToggleTextActive,
                ]}
              >
                Doar Promoții / Card
              </Text>
            </Pressable>

            {(
              [
                { id: 'relevance', label: 'Relevanță' },
                { id: 'price_asc', label: 'Preț minim ↑' },
                { id: 'stores_desc', label: 'Nr. magazine' },
              ] as const
            ).map((opt) => {
              const active = sortMode === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    triggerHaptic('selection');
                    setSortMode(opt.id);
                  }}
                  style={[styles.controlChip, active && styles.controlChipSelected]}
                >
                  <Text
                    style={[
                      styles.controlChipText,
                      active && styles.controlChipTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Branduri populare din categoria curentă */}
          {brandFacets.length > 0 && (selectedCategory || cleanQuery.length >= 2) && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
            >
              {selectedBrand && (
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedBrand(null);
                  }}
                  style={styles.brandResetChip}
                >
                  <Text style={styles.brandResetText}>{`${selectedBrand} ×`}</Text>
                </Pressable>
              )}
              {brandFacets
                .filter((f) => f.brand !== selectedBrand)
                .slice(0, 12)
                .map((facet) => (
                  <Pressable
                    key={facet.brand}
                    onPress={() => {
                      triggerHaptic('selection');
                      setSelectedBrand(facet.brand);
                    }}
                    style={styles.brandChip}
                  >
                    <Text style={styles.brandChipText}>
                      {`${facet.brand} (${facet.product_count})`}
                    </Text>
                  </Pressable>
                ))}
            </ScrollView>
          )}
            </View>
          )}

          {!!barcodeHint && /^[0-9]{6,14}$/.test(cleanQuery) && (
            <View
              style={[
                styles.barcodeBanner,
                products.length > 0 && styles.barcodeBannerSuccess,
              ]}
            >
              <Text style={styles.barcodeBannerText}>{barcodeHint}</Text>
              {barcodeSuggestedQuery && (
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    setQuery(barcodeSuggestedQuery);
                  }}
                  style={({ pressed }) => [
                    styles.barcodeSuggestBtn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={styles.barcodeSuggestBtnText}>
                    {`Caută „${barcodeSuggestedQuery}” ›`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {genericCrossStore &&
            genericCrossStore.retailerOffers.length > 0 &&
            cleanQuery.length >= 2 &&
            !/^[0-9]{6,14}$/.test(cleanQuery) && (
              <BeavySurface variant="elevated" style={styles.genericCrossCard}>
                <View style={styles.genericCrossHeader}>
                  <View style={styles.genericCrossCopy}>
                    <Text style={styles.genericCrossOverline}>
                      TERMEN GENERIC · ORICE FIRMĂ
                    </Text>
                    <Text style={styles.genericCrossTitle} numberOfLines={1}>
                      {`„${genericCrossStore.term}” în ${genericCrossStore.retailerOffers.length} ${
                        genericCrossStore.retailerOffers.length === 1
                          ? 'magazin'
                          : 'magazine'
                      }`}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('medium');
                      addGenericItem(genericCrossStore.term, 1);
                    }}
                    style={({ pressed }) => [
                      styles.genericAddBtn,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.genericAddBtnText}>+ Coș generic</Text>
                  </Pressable>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.genericRetailersRow}
                >
                  {genericCrossStore.retailerOffers.map((offer) => {
                    const est = estimateProductUnitPricing(
                      offer.price,
                      offer.package_size,
                      genericCrossStore.matchedProducts.find(
                        (m) => m.id === offer.product_id
                      )?.canonical_name,
                      offer.normalized_unit_price,
                      offer.normalized_unit_label
                    );
                    const chipPrice =
                      est.sellMode === 'per_buc' && est.estimatedPerBuc !== null
                        ? `${est.estimatedPerBuc.toFixed(2)}/buc`
                        : est.estimatedPerKg !== null
                          ? `~${est.estimatedPerKg.toFixed(2)}/kg`
                          : `${offer.price.toFixed(2)} RON`;
                    return (
                      <View key={offer.id} style={styles.genericOfferChip}>
                        <RetailerLogo
                          retailerName={offer.retailer_name}
                          size={18}
                          shape="circle"
                        />
                        <Text style={styles.genericOfferStore}>
                          {offer.retailer_name}
                        </Text>
                        <Text style={styles.genericOfferPrice}>
                          {chipPrice}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>

                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    const rep: DisplayProduct = {
                      ...(genericCrossStore.matchedProducts[0] ?? {
                        id: `generic-preview-${genericCrossStore.term.toLowerCase()}`,
                        canonical_name: genericCrossStore.term,
                        brand: null,
                        package_size: null,
                        image_url: null,
                      }),
                      id: `generic-preview-${genericCrossStore.term.toLowerCase()}`,
                      canonical_name: genericCrossStore.term,
                      brand: null,
                      package_size: null,
                    };
                    setPreviewProduct(rep);
                    setPreviewLoading(false);
                    setPreviewEntry({
                      item: {
                        id: rep.id,
                        productId: rep.id,
                        name: rep.canonical_name || genericCrossStore.term,
                        quantity: 1,
                        brand: rep.brand || null,
                        packageSize: rep.package_size || null,
                        imageUrl: rep.image_url,
                        checked: false,
                        isCustom: false,
                      },
                      status: 'has_offers',
                      offers: genericCrossStore.retailerOffers,
                      equivalentOffersCount: 0,
                      unavailableOffers: [],
                      lowestPrice: genericCrossStore.retailerOffers[0]?.price ?? null,
                      highestPrice:
                        genericCrossStore.retailerOffers[
                          genericCrossStore.retailerOffers.length - 1
                        ]?.price ?? null,
                      hasLoyaltyOffer: genericCrossStore.retailerOffers.some(
                        (o) => o.loyalty_price !== null || o.promo_requires_card
                      ),
                      lowestLoyaltyPrice: null,
                      bestLoyaltyLabel: null,
                      bestLoyaltyRetailerName: null,
                      hasRegularPromo: genericCrossStore.retailerOffers.some(
                        (o) => Boolean(o.promo_label)
                      ),
                      bestRegularPromoLabel: null,
                      canonicalName: genericCrossStore.term,
                      canonicalBrand: null,
                      canonicalPackageSize: null,
                      canonicalImageUrl: rep.image_url,
                      canonicalCategoryName: null,
                    });
                  }}
                  style={({ pressed }) => [
                    styles.genericInspectBtn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={styles.genericInspectText}>
                    Vezi toate magazinele & preț/kg →
                  </Text>
                </Pressable>
              </BeavySurface>
            )}

          {/* Familii semantice detectate la căutare */}
          {families.length > 0 && cleanQuery.length >= 2 && (
            <View style={styles.familiesRow}>
              {families.slice(0, 4).map((fam) => (
                <Pressable
                  key={fam.family_id}
                  onPress={() => {
                    triggerHaptic('selection');
                    setQuery(fam.family_name);
                  }}
                  style={styles.familyPill}
                >
                  <Text style={styles.familyPillText}>
                    {`${fam.family_name} · ${fam.product_count}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Filtru rapid de gramaj (200g, 250g, 500g, 1kg, 1L etc.) */}
          {gramajFacets.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
            >
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setSelectedGramaj(null);
                }}
                style={[
                  styles.controlChip,
                  !activeGramaj && styles.controlChipSelected,
                ]}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.controlChipText,
                    !activeGramaj && styles.controlChipTextSelected,
                  ]}
                >
                  {`Toate gramajele (${products.length})`}
                </Text>
              </Pressable>
              {gramajFacets.map((f) => {
                const active = activeGramaj === f.label;
                return (
                  <Pressable
                    key={f.label}
                    onPress={() => {
                      triggerHaptic('selection');
                      setSelectedGramaj(active ? null : f.label);
                    }}
                    style={[styles.controlChip, active && styles.controlChipSelected]}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.controlChipText,
                        active && styles.controlChipTextSelected,
                      ]}
                    >
                      {`${f.label} (${f.count})`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Bento grid pe 2 coloane cu raioane principale (Spree taxonomy discovery) */}
          {cleanQuery.length === 0 &&
            !selectedCategory &&
            !selectedRetailerSlug &&
            dynamicCategories.length > 0 && (
              <View style={styles.bentoDeptSection}>
                <View style={styles.bentoSectionHeader}>
                  <Text style={styles.bentoSectionTitle}>Explorează pe raioane</Text>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      setAislePickerOpen(true);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={styles.bentoSectionLink}>Toate ›</Text>
                  </Pressable>
                </View>

                <View style={styles.bentoDeptGrid}>
                  {dynamicCategories.slice(0, 4).map((cat) => (
                      <Pressable
                        key={cat.slug}
                        onPress={() => {
                          triggerHaptic('selection');
                          setSelectedCategory(cat.slug);
                          setSelectedBrand(null);
                        }}
                        style={({ pressed }) => [
                          styles.bentoDeptCard,
                          pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Raion ${cat.name}`}
                      >
                        <Text numberOfLines={1} style={styles.bentoDeptName}>
                          {cat.name}
                        </Text>
                        <Text style={styles.bentoDeptCount}>
                          {`${cat.product_count} prod. ›`}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              </View>
            )}

          {/* Lista de rezultate */}
          {loading ? (
            <BeavyCardSkeleton count={4} />
          ) : error ? (
            <BeavySurface variant="elevated" style={styles.stateCard}>
              <Text style={styles.stateTitle}>{error}</Text>
            </BeavySurface>
          ) : products.length === 0 ? (
            <BeavySurface variant="elevated" style={styles.stateCard}>
              <Text style={styles.stateTitle}>
                Niciun produs găsit pentru filtrele curente
              </Text>
              <Text style={styles.stateSub}>
                Încearcă un termen mai scurt, alt magazin sau resetează filtrele.
              </Text>
              {(selectedCategory || selectedRetailerSlug || selectedBrand || promoOnly) && (
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedCategory(null);
                    setSelectedRetailerSlug(null);
                    setSelectedBrand(null);
                    setPromoOnly(false);
                  }}
                  style={styles.resetFiltersBtn}
                >
                  <Text style={styles.resetFiltersText}>Resetează filtrele</Text>
                </Pressable>
              )}
            </BeavySurface>
          ) : viewMode === 'grid' ? (
            <View style={[styles.resultsStack, styles.gridResultsStack]}>
              {Array.from({ length: Math.ceil(displayedProducts.length / 2) }).map((_, rowIdx) => {
                const left = displayedProducts[rowIdx * 2];
                const right = displayedProducts[rowIdx * 2 + 1];
                return (
                  <View key={left.id} style={styles.gridRow}>
                    <BeavyCatalogProductCard
                      product={left}
                      variant="grid"
                      quantity={getProductQuantity(left.id, left.canonical_name)}
                      onPressInspect={(p) => {
                        void handleInspectProduct(p);
                      }}
                      onStepQuantity={updateCatalogProductQuantity}
                    />
                    {right ? (
                      <BeavyCatalogProductCard
                        product={right}
                        variant="grid"
                        quantity={getProductQuantity(right.id, right.canonical_name)}
                        onPressInspect={(p) => {
                          void handleInspectProduct(p);
                        }}
                        onStepQuantity={updateCatalogProductQuantity}
                      />
                    ) : (
                      <View style={styles.gridSpacer} />
                    )}
                  </View>
                );
              })}

              {hasMore && (
                <Pressable
                  onPress={() => {
                    void handleLoadMore();
                  }}
                  disabled={loadingMore}
                  style={({ pressed }) => [
                    styles.loadMoreBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Text style={styles.loadMoreText}>
                      {`Încarcă mai multe produse (${products.length}/${totalCount})`}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.resultsStack}>
              {displayedProducts.map((prod) => (
                <BeavyCatalogProductCard
                  key={prod.id}
                  product={prod}
                  variant="catalog"
                  isLast={prod.id === displayedProducts.at(-1)?.id}
                  quantity={getProductQuantity(prod.id, prod.canonical_name)}
                  onPressInspect={(p) => {
                    void handleInspectProduct(p);
                  }}
                  onStepQuantity={updateCatalogProductQuantity}
                />
              ))}

              {hasMore && (
                <Pressable
                  onPress={() => {
                    void handleLoadMore();
                  }}
                  disabled={loadingMore}
                  style={({ pressed }) => [
                    styles.loadMoreBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Text style={styles.loadMoreText}>
                      {`Încarcă mai multe produse (${products.length}/${totalCount})`}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          )}

        </ScrollView>

        {basketItems.length > 0 && (
          <View
            style={[
              styles.floatingCartWrap,
              { paddingBottom: Math.max(78, insets.bottom + 66) },
            ]}
            pointerEvents="box-none"
          >
            <QuickCartBar
              totalUnits={totalUnits}
              distinctItemsCount={basketItems.length}
              countCircleAnimatedStyle={countCircleAnimatedStyle}
              onPressCart={() =>
                triggerTabTransition(2, () => router.push('/compare'))
              }
            />
          </View>
        )}

        <AislePickerModal
          visible={aislePickerOpen}
          activeSlug={selectedCategory}
          departments={departments}
          onSelectCategory={(slug) => {
            setSelectedCategory(slug);
            setSelectedBrand(null);
          }}
          onClose={() => setAislePickerOpen(false)}
        />

        <ProductComparisonModal
          visible={Boolean(previewProduct)}
          entry={previewEntry}
          city={preferences.city}
          applyLoyaltyCards={preferences.applyLoyaltyCards ?? true}
          onClose={() => {
            setPreviewProduct(null);
            setPreviewEntry(null);
          }}
          onReplaceWithProduct={(_, replacement) => {
            updateCatalogProductQuantity(replacement, 1);
          }}
          onInspectOtherProduct={(nextProduct) => {
            void handleInspectProduct(nextProduct);
          }}
          onStartStoreMode={() => {
            setPreviewProduct(null);
            triggerTabTransition(2, () => router.push('/compare'));
          }}
          previewAddActionLabel={
            previewProduct && !previewLoading
              ? getProductQuantity(previewProduct.id, previewProduct.canonical_name) > 0
                ? 'Deja în listă · Mergi la Coș →'
                : '+ Adaugă în lista activă'
              : undefined
          }
          onPreviewAdd={() => {
            if (!previewProduct) return;
            if (previewEntry?.item.isCustom) {
              addGenericItem(previewEntry.item.name, 1);
              return;
            }
            const currentQty = getProductQuantity(
              previewProduct.id,
              previewProduct.canonical_name
            );
            if (currentQty === 0) {
              updateCatalogProductQuantity(previewProduct, 1);
            } else {
              triggerTabTransition(2, () => router.push('/compare'));
            }
          }}
        />

        <ScanListModal
          visible={scanModalOpen}
          activeListName="Lista activă"
          onClose={() => setScanModalOpen(false)}
          onConfirmAddItems={handleConfirmScan}
          onGoToProfile={() => {
            setScanModalOpen(false);
            triggerTabTransition(3, () => router.push('/profile'));
          }}
        />

        <BarcodeScannerModal
          visible={barcodeScannerOpen}
          onClose={() => setBarcodeScannerOpen(false)}
          onBarcodeDetected={(code) => {
            setQuery(code);
          }}
          onAddProductToList={(prod, qty) => {
            addCatalogProduct(prod, qty);
          }}
          onInspectProduct={(prod) => {
            setBarcodeScannerOpen(false);
            void handleInspectProduct(prod);
          }}
          userCity={preferences.city}
        />

        <RecipeImportModal
          visible={recipeModalOpen}
          activeListName={activeList?.name ?? 'Lista de cumpărături'}
          initialText={recipeModalInitialText}
          onClose={() => {
            setRecipeModalOpen(false);
            setRecipeModalInitialText(null);
          }}
          onConfirmAddBatch={handleConfirmRecipeBatch}
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
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 8,
  },
  heroBlock: {
    gap: 10,
  },
  pageTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 23,
    lineHeight: 29,
    color: C.primary,
    letterSpacing: -0.45,
  },
  pageSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: C.muted,
    lineHeight: 16,
    marginTop: 2,
  },
  recipeFeedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.leek,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: BeavyRadius.md,
  },
  recipeFeedbackText: {
    flex: 1,
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12,
    color: C.leekDark,
  },
  feedbackFallbackIcon: {
    fontSize: 13,
    color: C.leekDark,
  },
  discoveryBlock: {
    gap: 14,
    paddingTop: 4,
  },
  discoverySection: {
    gap: 10,
  },
  discoveryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  discoveryTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  discoverySectionTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13.5,
    color: C.primary,
  },
  discoveryLinkBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  discoveryLinkText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.cherry,
  },
  recipeCardsScroll: {
    gap: 10,
    paddingRight: 6,
  },
  recipeCard: {
    width: 200,
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
    padding: 12,
    gap: 8,
    justifyContent: 'space-between',
  },
  recipeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recipeCardIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeServingsPill: {
    backgroundColor: C.secondary,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: BeavyRadius.pill,
  },
  recipeServingsText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.primary,
  },
  recipeCardTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12.5,
    color: C.primary,
    lineHeight: 16,
    minHeight: 32,
  },
  recipeCardActionText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11.5,
    color: C.cherry,
  },
  starterSection: {
    gap: 6,
  },
  starterSectionLabel: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 11.5,
    color: C.muted,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.md,
    paddingHorizontal: 12,
    minHeight: 48,
    gap: 9,
    borderWidth: 1,
    borderColor: C.rule,
  },
  searchFallback: {
    fontSize: 18,
    color: C.primary,
  },
  searchInput: {
    flex: 1,
    fontFamily: BeavyFonts.semiBold,
    fontSize: 14.5,
    color: C.primary,
  },
  clearBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.primary,
  },
  barDivider: {
    width: 1,
    height: 20,
    backgroundColor: C.rule,
  },
  aisleQuickBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackGlyph: {
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.primary,
  },
  chipsScroll: {
    flexDirection: 'row',
    gap: 7,
    paddingRight: 8,
  },
  starterChip: {
    minHeight: 32,
    backgroundColor: 'transparent',
    borderRadius: BeavyRadius.sm,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.rule,
  },
  starterChipText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.muted,
  },
  resultsToolbar: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  resultCount: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 12,
    color: C.muted,
  },
  filterToggle: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 8,
  },
  filterToggleFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 16,
    color: C.primary,
  },
  filterToggleText: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 12.5,
    color: C.primary,
  },
  filterCount: {
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: C.leek,
    color: C.leekDark,
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    lineHeight: 19,
  },
  filterPanel: {
    gap: 8,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
  },
  storeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    paddingHorizontal: 13,
  },
  storeFilterPillActive: {
    backgroundColor: C.primary,
  },
  storeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  storeFilterText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12.5,
    color: C.primary,
  },
  storeFilterTextActive: {
    color: C.surface,
  },
  controlChip: {
    minHeight: 38,
    borderRadius: BeavyRadius.pill,
    backgroundColor: 'rgba(232, 220, 207, 0.55)',
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  controlChipSelected: {
    backgroundColor: C.primary,
  },
  controlChipText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  controlChipTextSelected: {
    color: C.surface,
  },
  promoToggleActive: {
    backgroundColor: C.accent,
  },
  promoToggleTextActive: {
    color: C.primary,
    fontFamily: BeavyFonts.extraBold,
  },
  brandResetChip: {
    minHeight: 34,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  brandResetText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.surface,
  },
  brandChip: {
    minHeight: 34,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  brandChipText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12,
    color: C.primary,
  },
  familiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  familyPill: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  familyPillText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11.5,
    color: C.leekDark,
  },
  stateCard: {
    padding: 26,
    alignItems: 'center',
    gap: 8,
  },
  stateTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14.5,
    color: C.primary,
    textAlign: 'center',
  },
  stateSub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12.5,
    color: C.muted,
    textAlign: 'center',
  },
  resetFiltersBtn: {
    marginTop: 4,
    minHeight: 42,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  resetFiltersText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.surface,
  },
  resultsStack: {
    gap: 0,
  },
  gridResultsStack: {
    gap: 10,
  },
  viewToggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.surface,
  },
  bentoDeptSection: {
    gap: 6,
  },
  bentoSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  bentoSectionTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 15,
    color: C.primary,
    letterSpacing: -0.3,
  },
  bentoSectionLink: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12.5,
    color: C.muted,
  },
  bentoDeptGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bentoDeptCard: {
    width: '48.8%',
    minHeight: 48,
    borderRadius: BeavyRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'space-between',
    gap: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
  },
  bentoDeptName: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 12.5,
    color: C.primary,
  },
  bentoDeptCount: {
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
    fontSize: 10.5,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  gridSpacer: {
    flex: 1,
  },
  loadMoreBtn: {
    minHeight: 48,
    borderRadius: BeavyRadius.sm,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
  },
  loadMoreText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.primary,
  },
  floatingCartWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  barcodeBanner: {
    backgroundColor: 'rgba(247, 141, 121, 0.2)',
    borderRadius: BeavyRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  barcodeBannerSuccess: {
    backgroundColor: C.leek,
  },
  barcodeBannerText: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 12.5,
    lineHeight: 18,
    color: C.primary,
  },
  barcodeSuggestBtn: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    justifyContent: 'center',
  },
  barcodeSuggestBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 12.5,
    color: C.primary,
  },
  pressed: {
    opacity: 0.78,
  },
  genericCrossCard: {
    padding: 13,
    gap: 10,
    backgroundColor: 'rgba(219, 227, 198, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(92, 117, 52, 0.28)',
  },
  genericCrossHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  genericCrossCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  genericCrossOverline: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
    color: C.muted,
  },
  genericCrossTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 14.5,
    color: C.primary,
  },
  genericAddBtn: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  genericAddBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 12,
    color: C.surface,
  },
  genericRetailersRow: {
    gap: 6,
  },
  genericOfferChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: C.rule,
  },
  genericOfferStore: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 11.5,
    color: C.primary,
  },
  genericOfferPrice: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 11.5,
    color: C.accent,
    fontVariant: ['tabular-nums'],
  },
  genericInspectBtn: {
    minHeight: 38,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.rule,
  },
  genericInspectText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12.5,
    color: C.primary,
  },
});
