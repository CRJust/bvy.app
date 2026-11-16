import { SymbolView } from 'expo-symbols';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ProductImageBox } from '@/components/product-image-box';
import { BeavySegmentedControl } from '@/components/ui/beavy-segmented-control';
import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import {
  type DisplayProduct,
  formatProductTitle,
  getEquivalentProductsForProduct,
  getSameLineOtherSizes,
  searchFlatCatalogProducts,
} from '@/services/beavy-catalog-search';
import {
  type BeavyProductOffer,
  cleanDisplayPackageSize,
  cleanScraperProductName,
  computeLoyaltyLineTotal,
  deriveNormalizedUnitPrice,
  estimateProductUnitPricing,
  fetchVerifiedOffersForProducts,
  type ItemComparisonStatus,
  resolveLoyaltyProgramName,
} from '@/services/beavy-comparison';

type ProductComparisonModalProps = {
  visible: boolean;
  entry: ItemComparisonStatus | null;
  city: string;
  applyLoyaltyCards?: boolean;
  onClose: () => void;
  onReplaceWithProduct: (targetItemId: string, product: DisplayProduct) => void;
  onInspectOtherProduct?: (product: DisplayProduct) => void;
  onStartStoreMode: (retailerName: string) => void;
  previewAddActionLabel?: string;
  onPreviewAdd?: () => void;
};

type EquivalentWithPrice = {
  product: DisplayProduct;
  lowestUnitPrice: number | null;
  cheapestRetailerName: string | null;
  cheapestRetailerSlug: string | null;
  storeCount: number;
  unitPriceSummary: string | null;
  hasPromoOrLoyalty: boolean;
};

type ModalMinitab = 'prices' | 'equivalents';

function formatChannelName(
  channel: BeavyProductOffer['fulfillment_channel']
): string {
  if (channel === 'store') return 'Magazin fizic';
  if (channel === 'delivery' || channel === 'online') return 'Livrare online';
  return 'Supermarket';
}

/**
 * Foaie comparativă per produs across all active retailers, cu prețuri standard,
 * reduceri cu card de fidelitate, SGR și echivalente canonice.
 */
export function ProductComparisonModal({
  visible,
  entry,
  city,
  applyLoyaltyCards = true,
  onClose,
  onReplaceWithProduct,
  onInspectOtherProduct,
  onStartStoreMode,
  previewAddActionLabel,
  onPreviewAdd,
}: ProductComparisonModalProps) {
  const [prevEntry, setPrevEntry] = useState<ItemComparisonStatus | null>(entry);
  if (entry && entry !== prevEntry) {
    setPrevEntry(entry);
  }
  const activeEntry = entry ?? prevEntry;

  const [familyName, setFamilyName] = useState<string | null>(null);
  const [equivalents, setEquivalents] = useState<EquivalentWithPrice[]>([]);
  const [otherSizes, setOtherSizes] = useState<DisplayProduct[]>([]);
  const [loadingEquivalents, setLoadingEquivalents] = useState(false);
  const [activeMinitab, setActiveMinitab] = useState<ModalMinitab>('prices');

  const [catalogQuery, setCatalogQuery] = useState('');
  const [lastSyncedItemId, setLastSyncedItemId] = useState<string | null>(null);
  const [catalogMatches, setCatalogMatches] = useState<DisplayProduct[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const isManual =
    !activeEntry ||
    (activeEntry.offers.length === 0 &&
      (activeEntry.item.isCustom || !activeEntry.item.productId));
  const itemProductId = activeEntry?.item.productId ?? null;
  const itemName = activeEntry?.item.name ?? '';
  const itemBrand = activeEntry?.canonicalBrand ?? activeEntry?.item.brand ?? null;
  const itemPkgSize =
    activeEntry?.canonicalPackageSize ?? activeEntry?.item.packageSize ?? null;
  const itemCatName = activeEntry?.canonicalCategoryName ?? null;
  const entryItemId = activeEntry?.item.id ?? null;

  if (visible && entryItemId && entryItemId !== lastSyncedItemId) {
    setLastSyncedItemId(entryItemId);
    setActiveMinitab('prices');
    setCatalogQuery(isManual ? itemName : '');
    if (!isManual) {
      setCatalogMatches([]);
    }
  }

  // Încarcă echivalentele din familie + alte gramaje ale aceleiași game pentru produsele din catalog
  useEffect(() => {
    if (!visible || isManual || !itemProductId) return;

    let canceled = false;
    const rafId = requestAnimationFrame(() => {
      if (!canceled) {
        setLoadingEquivalents(true);
      }
    });

    const loadEquivalents = async () => {
      try {
        const [res, siblingSizes] = await Promise.all([
          getEquivalentProductsForProduct(itemProductId, 16),
          getSameLineOtherSizes(
            {
              id: itemProductId,
              canonical_name: itemName,
              brand: itemBrand,
              package_size: itemPkgSize,
              category_name: itemCatName,
            },
            6
          ).catch(() => [] as DisplayProduct[]),
        ]);
        if (canceled) return;

        setFamilyName(res.familyName);
        setOtherSizes(siblingSizes);
        if (res.variants.length === 0) {
          setEquivalents([]);
          return;
        }

        const variantIds = res.variants.map((v) => v.id);
        let offers = await fetchVerifiedOffersForProducts(variantIds, city).catch(
          () => [] as BeavyProductOffer[]
        );
        if (offers.length === 0 && city) {
          offers = await fetchVerifiedOffersForProducts(variantIds).catch(
            () => [] as BeavyProductOffer[]
          );
        }
        if (canceled) return;

        const bestOfferByProduct = new Map<string, BeavyProductOffer>();
        const storesByProduct = new Map<string, Set<string>>();
        const promoOrLoyaltyByProduct = new Map<string, boolean>();
        for (const offer of offers) {
          if (!offer.product_id) continue;
          const prev = bestOfferByProduct.get(offer.product_id);
          if (!prev || offer.price < prev.price) {
            bestOfferByProduct.set(offer.product_id, offer);
          }
          const storeSet = storesByProduct.get(offer.product_id) ?? new Set<string>();
          if (offer.retailer_name) storeSet.add(offer.retailer_name);
          storesByProduct.set(offer.product_id, storeSet);
          if (
            offer.promo_label ||
            offer.loyalty_price !== null ||
            offer.promo_requires_card
          ) {
            promoOrLoyaltyByProduct.set(offer.product_id, true);
          }
        }

        const combined: EquivalentWithPrice[] = res.variants.map((product) => {
          const best = bestOfferByProduct.get(product.id);
          const slug = best
            ? best.retailer_name.toLowerCase().replace(/\s+/g, '-')
            : null;
          const unitPriceSummary =
            best?.normalized_unit_price && best.normalized_unit_label
              ? `${best.normalized_unit_price.toFixed(2)} ${best.normalized_unit_label}`
              : null;
          return {
            product,
            lowestUnitPrice: best ? best.price : null,
            cheapestRetailerName: best ? best.retailer_name : null,
            cheapestRetailerSlug: slug,
            storeCount: storesByProduct.get(product.id)?.size ?? 0,
            unitPriceSummary,
            hasPromoOrLoyalty: Boolean(promoOrLoyaltyByProduct.get(product.id)),
          };
        });

        combined.sort((a, b) => {
          if (a.lowestUnitPrice !== null && b.lowestUnitPrice !== null) {
            return a.lowestUnitPrice - b.lowestUnitPrice;
          }
          if (a.lowestUnitPrice !== null) return -1;
          if (b.lowestUnitPrice !== null) return 1;
          return 0;
        });

        setEquivalents(combined);
      } catch {
        if (!canceled) {
          setEquivalents([]);
        }
      } finally {
        if (!canceled) {
          setLoadingEquivalents(false);
        }
      }
    };

    void loadEquivalents();

    return () => {
      canceled = true;
      cancelAnimationFrame(rafId);
    };
  }, [visible, isManual, itemProductId, itemName, itemBrand, itemPkgSize, itemCatName, city, entryItemId]);

  // Căutare catalog cu debounce pentru produse manuale
  useEffect(() => {
    if (!visible || !isManual) return;
    const clean = catalogQuery.trim();
    if (clean.length < 2) {
      return;
    }

    let canceled = false;
    const rafId = requestAnimationFrame(() => {
      if (!canceled) {
        setLoadingSearch(true);
      }
    });

    const timer = setTimeout(async () => {
      try {
        const results = await searchFlatCatalogProducts(clean, null);
        if (!canceled) {
          setCatalogMatches(results.slice(0, 12));
        }
      } catch {
        if (!canceled) {
          setCatalogMatches([]);
        }
      } finally {
        if (!canceled) {
          setLoadingSearch(false);
        }
      }
    }, 240);

    return () => {
      canceled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  }, [visible, isManual, catalogQuery]);

  const activeQty = Math.max(1, activeEntry?.item.quantity ?? 1);

  const sortedOffers = useMemo(() => {
    if (!activeEntry) return [];
    const effUnit = (o: BeavyProductOffer) => {
      if (!applyLoyaltyCards) return o.price;
      const loy = computeLoyaltyLineTotal(o, activeQty);
      return loy.loyaltyLineTotal !== null ? loy.loyaltyLineTotal / activeQty : o.price;
    };
    return [...activeEntry.offers].sort((a, b) => effUnit(a) - effUnit(b));
  }, [activeEntry, applyLoyaltyCards, activeQty]);

  if (!activeEntry) return null;

  const { item } = activeEntry;
  const minOfferUnitPrice =
    sortedOffers.length > 0
      ? (() => {
          const first = sortedOffers[0];
          if (!applyLoyaltyCards) return first.price;
          const loy = computeLoyaltyLineTotal(first, activeQty);
          return loy.loyaltyLineTotal !== null ? loy.loyaltyLineTotal / activeQty : first.price;
        })()
      : null;
  const cleanItemSize = cleanDisplayPackageSize(item.packageSize, item.name);
  const itemMeta = [item.brand, cleanItemSize].filter(Boolean).join(' · ');
  const cleanHeaderTitle = cleanScraperProductName(activeEntry.canonicalName ?? item.name);

  return (
    <BeavySheetModal visible={visible} onClose={onClose} maxHeightRatio="90%">
      <View style={styles.sheetInner}>
        {/* Antet produs */}
        <View style={styles.header}>
          <ProductImageBox
            imageUrl={activeEntry.canonicalImageUrl ?? item.imageUrl}
            productName={cleanHeaderTitle}
            brand={activeEntry.canonicalBrand ?? item.brand}
            categoryName={activeEntry.canonicalCategoryName}
            variant="thumb"
          />

          <View style={styles.headerInfoCol}>
            <Text numberOfLines={2} style={styles.productTitle}>
              {cleanHeaderTitle}
            </Text>
            <View style={styles.headerMetaRow}>
              {item.quantity > 1 && (
                <View style={styles.qtyBadge}>
                  <Text style={styles.qtyBadgeText}>{`${item.quantity}×`}</Text>
                </View>
              )}
              {isManual ? (
                <View style={styles.manualPill}>
                  <Text style={styles.manualPillText}>Produs manual</Text>
                </View>
              ) : itemMeta ? (
                <Text numberOfLines={1} style={styles.headerMetaText}>
                  {itemMeta}
                </Text>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              onClose();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Închide"
          >
            <SymbolView
              name="xmark"
              tintColor={C.primary}
              size={14}
              fallback={<Text style={styles.closeFallback}>✕</Text>}
            />
          </Pressable>
        </View>

        {!isManual && (
          <BeavySegmentedControl
            options={[
              { id: 'prices', label: `Prețuri (${sortedOffers.length})` },
              {
                id: 'equivalents',
                label: loadingEquivalents
                  ? 'Același tip (…)'
                  : `Același tip (${equivalents.length})`,
              },
            ]}
            value={activeMinitab}
            onChange={(next) => {
              triggerHaptic('selection');
              setActiveMinitab(next);
            }}
          />
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isManual ? (
            <View style={styles.sectionBlock}>
              <BeavySurface variant="tonal" style={styles.explainCard}>
                <Text style={styles.explainTitle}>
                  Asociază cu un produs din catalog
                </Text>
                <Text style={styles.explainText}>
                  Produsele manuale nu au prețuri comparabile direct. Alege echivalentul exact de mai jos:
                </Text>
              </BeavySurface>

              <View style={styles.searchBar}>
                <SymbolView
                  name="magnifyingglass"
                  tintColor={C.muted}
                  size={15}
                  fallback={<Text style={styles.searchFallback}>⌕</Text>}
                />
                <TextInput
                  value={catalogQuery}
                  onChangeText={setCatalogQuery}
                  placeholder="Caută produsul în catalog..."
                  placeholderTextColor={C.muted}
                  style={styles.searchInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {catalogQuery.length > 0 && (
                  <Pressable
                    onPress={() => {
                      setCatalogQuery('');
                      setCatalogMatches([]);
                    }}
                    hitSlop={8}
                    style={styles.clearBtn}
                  >
                    <Text style={styles.clearBtnText}>×</Text>
                  </Pressable>
                )}
              </View>

              {loadingSearch ? (
                <BeavySurface variant="elevated" style={styles.loadingCard}>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={styles.loadingText}>Căutăm în catalog...</Text>
                </BeavySurface>
              ) : catalogQuery.trim().length < 2 ? (
                <BeavySurface variant="elevated" style={styles.emptyNoticeCard}>
                  <Text style={styles.emptyNoticeText}>
                    Scrie cel puțin 2 caractere pentru a căuta potriviri.
                  </Text>
                </BeavySurface>
              ) : catalogMatches.length === 0 ? (
                <BeavySurface variant="elevated" style={styles.emptyNoticeCard}>
                  <Text style={styles.emptyNoticeText}>
                    {`Nu am găsit potriviri exacte pentru „${catalogQuery.trim()}”.`}
                  </Text>
                </BeavySurface>
              ) : (
                <BeavySurface variant="elevated" style={styles.listSheet}>
                  {catalogMatches.map((prod, idx) => {
                    const isLast = idx === catalogMatches.length - 1;
                    const cleanName = cleanScraperProductName(
                      formatProductTitle(prod.canonical_name, prod.brand)
                    );
                    const cleanProdSize = cleanDisplayPackageSize(
                      prod.package_size,
                      prod.canonical_name
                    );
                    const meta = [
                      prod.brand,
                      cleanProdSize,
                      prod.min_price != null
                        ? `de la ${prod.min_price.toFixed(2)} RON`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');

                    return (
                      <View
                        key={prod.id}
                        style={[styles.variantRow, !isLast && styles.rowBorder]}
                      >
                        <ProductImageBox
                          imageUrl={prod.image_url}
                          productName={prod.canonical_name}
                          brand={prod.brand}
                          categoryName={prod.category_name}
                          familyName={prod.family_name}
                          variant="thumb"
                        />
                        <View style={styles.variantInfoCol}>
                          <Text numberOfLines={2} style={styles.variantTitle}>
                            {cleanName}
                          </Text>
                          {!!meta && (
                            <Text numberOfLines={1} style={styles.variantMeta}>
                              {meta}
                            </Text>
                          )}
                        </View>
                        <Pressable
                          onPress={() => {
                            triggerHaptic('medium');
                            onReplaceWithProduct(item.id, prod);
                            onClose();
                          }}
                          style={({ pressed }) => [
                            styles.swapBtn,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.swapBtnText}>Asociază</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </BeavySurface>
              )}
            </View>
          ) : activeMinitab === 'prices' ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>
                {`Prețuri în magazine (${sortedOffers.length})`}
              </Text>

              {sortedOffers.length === 0 ? (
                <BeavySurface variant="elevated" style={styles.emptyNoticeCard}>
                  <Text style={styles.emptyNoticeText}>
                    {activeEntry.status === 'unavailable'
                      ? `Momentan indisponibil în ofertele verificate pentru ${city}.`
                      : `Fără ofertă activă încărcată momentan pentru această variantă exactă.`}
                  </Text>
                </BeavySurface>
              ) : (
                <BeavySurface variant="elevated" style={styles.listSheet}>
                  {sortedOffers.map((offer, idx) => {
                    const isLast = idx === sortedOffers.length - 1;
                    const isLowest = idx === 0 && sortedOffers.length > 1;
                    const lineTotal = offer.price * item.quantity;
                    const loyaltyInfo = computeLoyaltyLineTotal(
                      offer,
                      item.quantity
                    );
                    const effectiveLineTotal =
                      applyLoyaltyCards && loyaltyInfo.loyaltyLineTotal !== null
                        ? loyaltyInfo.loyaltyLineTotal
                        : lineTotal;
                    const regularLineTotal =
                      applyLoyaltyCards &&
                      loyaltyInfo.loyaltyLineTotal !== null &&
                      loyaltyInfo.loyaltyLineTotal < lineTotal
                        ? lineTotal
                        : offer.regular_price !== null &&
                            offer.regular_price > offer.price
                          ? offer.regular_price * item.quantity
                          : null;
                    const loyaltyProgram = resolveLoyaltyProgramName(
                      offer.retailer_name,
                      offer.promo_label
                    );
                    const rawOfferData = (offer as { raw_data?: { catalog_name?: string } }).raw_data;
                    const rawOfferNameLower = (
                      rawOfferData?.catalog_name
                        ? String(rawOfferData.catalog_name)
                        : item.name
                    ).toLowerCase();
                    const isBeverage =
                      /\b(apa|apă|bere|suc|cola|pepsi|fanta|nectar|bautura|băutură|vin|cidru)\b/.test(rawOfferNameLower) &&
                      !/\b(ceai|sirop|cafea|lapte)\b/.test(rawOfferNameLower);
                    const sgrLineFee =
                      offer.sgr_fee !== null && offer.sgr_fee > 0
                        ? offer.sgr_fee * item.quantity
                        : isBeverage
                          ? 0.5 * item.quantity
                          : 0;
                    const diffTotal =
                      minOfferUnitPrice !== null
                        ? effectiveLineTotal - minOfferUnitPrice * item.quantity
                        : 0;
                    const observedLabel = new Date(
                      offer.observed_at
                    ).toLocaleDateString('ro-RO', {
                      day: '2-digit',
                      month: 'short',
                    });
                    const cleanOfferSize = cleanDisplayPackageSize(
                      offer.package_size || item.packageSize,
                      item.name
                    );
                    const normalizedUnitStr = deriveNormalizedUnitPrice(
                      offer.price,
                      cleanOfferSize,
                      offer.normalized_unit_price,
                      offer.normalized_unit_label,
                      item.name
                    );
                    const unitEstimate = estimateProductUnitPricing(
                      offer.price,
                      cleanOfferSize,
                      item.name,
                      offer.normalized_unit_price,
                      offer.normalized_unit_label
                    );

                    return (
                      <Pressable
                        key={offer.id}
                        onPress={() => {
                          triggerHaptic('selection');
                          onStartStoreMode(offer.retailer_name);
                        }}
                        style={({ pressed }) => [
                          styles.offerRow,
                          !isLast && styles.rowBorder,
                          pressed && styles.rowPressed,
                        ]}
                      >
                        <RetailerLogo
                          retailerName={offer.retailer_name}
                          size={36}
                          shape="rounded"
                        />

                        <View style={styles.variantInfoCol}>
                          <View style={styles.offerTitleRow}>
                            <Text style={styles.offerStoreName}>
                              {offer.retailer_name}
                            </Text>
                            {isLowest && (
                              <View style={styles.bestPill}>
                                <Text style={styles.bestPillText}>
                                  Cel mai ieftin
                                </Text>
                              </View>
                            )}
                          </View>

                          <Text numberOfLines={1} style={styles.variantMeta}>
                            {`${formatChannelName(offer.fulfillment_channel)} · ${
                              cleanOfferSize || 'standard'
                            }${
                              normalizedUnitStr
                                ? ` · ${normalizedUnitStr}`
                                : unitEstimate.estimatedUnitLine
                                  ? ` · ${unitEstimate.estimatedUnitLine}`
                                  : ''
                            } · ${observedLabel}`}
                          </Text>

                          <View style={styles.offerBadgesRow}>
                            {loyaltyInfo.hasLoyaltyOffer && (
                              <View style={styles.loyaltyPill}>
                                <Text numberOfLines={2} style={styles.loyaltyText}>
                                  {loyaltyInfo.loyaltyLineTotal !== null
                                    ? `${loyaltyProgram}: ${loyaltyInfo.loyaltyLineTotal.toFixed(2)} RON (-${loyaltyInfo.loyaltySavings.toFixed(2)})`
                                    : offer.promo_label
                                      ? `${loyaltyProgram}: ${offer.promo_label}`
                                      : loyaltyProgram}
                                </Text>
                              </View>
                            )}

                            {!loyaltyInfo.hasLoyaltyOffer &&
                              offer.promo_label && (
                                <View style={styles.promoPill}>
                                  <Text style={styles.promoPillText}>
                                    {offer.promo_label}
                                  </Text>
                                </View>
                              )}

                            {sgrLineFee > 0 && (
                              <View style={styles.sgrPill}>
                                <Text style={styles.sgrPillText}>
                                  {`+SGR ${sgrLineFee.toFixed(2)} RON`}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        <View style={styles.offerPriceCol}>
                          {regularLineTotal !== null && (
                            <Text style={styles.regularStrike}>
                              {`${regularLineTotal.toFixed(2)} RON`}
                            </Text>
                          )}
                          <Text style={styles.offerPriceValue}>
                            {`${effectiveLineTotal.toFixed(2)} RON`}
                          </Text>
                          {item.quantity > 1 ? (
                            <Text style={styles.offerUnitSub}>
                              {`${(effectiveLineTotal / item.quantity).toFixed(2)}/buc`}
                            </Text>
                          ) : diffTotal > 0.01 ? (
                            <Text style={styles.offerDiffSub}>
                              {`+${diffTotal.toFixed(2)}`}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </BeavySurface>
              )}

              {sortedOffers.length <= 1 &&
                (otherSizes.length > 0 || equivalents.length > 0) && (
                  <View style={styles.otherSizesWrap}>
                    {sortedOffers.length === 1 && (
                      <Text style={styles.singleStoreExplainText}>
                        {`Acest ambalaj exact are ofertă importată momentan doar la ${sortedOffers[0].retailer_name}. Celelalte magazine au alte gramaje ale aceluiași produs sau alternative echivalente:`}
                      </Text>
                    )}

                    {otherSizes.length > 0 && (
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionTitle}>
                          {`Alte gramaje disponibile (${otherSizes.length})`}
                        </Text>
                        <BeavySurface variant="elevated" style={styles.listSheet}>
                          {otherSizes.map((alt, idx) => {
                            const altTitle = formatProductTitle(
                              alt.canonical_name,
                              alt.brand
                            );
                            const altIsLast = idx === otherSizes.length - 1;
                            return (
                              <Pressable
                                key={alt.id}
                                onPress={() => {
                                  triggerHaptic('selection');
                                  if (onInspectOtherProduct) {
                                    onInspectOtherProduct(alt);
                                  } else {
                                    onReplaceWithProduct(item.id, alt);
                                    onClose();
                                  }
                                }}
                                style={({ pressed }) => [
                                  styles.offerRow,
                                  !altIsLast && styles.rowBorder,
                                  pressed && styles.rowPressed,
                                ]}
                              >
                                <ProductImageBox
                                  imageUrl={alt.image_url}
                                  productName={alt.canonical_name}
                                  brand={alt.brand}
                                  familyName={alt.family_name}
                                  variant="thumb"
                                />
                                <View style={styles.variantInfoCol}>
                                  <Text numberOfLines={2} style={styles.variantTitle}>
                                    {altTitle}
                                  </Text>
                                  <Text numberOfLines={1} style={styles.variantMeta}>
                                    {`${alt.package_size || 'format standard'} · ${
                                      alt.store_count ?? 1
                                    } ${(alt.store_count ?? 1) === 1 ? 'magazin' : 'magazine'}`}
                                  </Text>
                                </View>
                                <View style={styles.offerPriceCol}>
                                  {alt.min_price != null && (
                                    <Text style={styles.offerPriceValue}>
                                      {`de la ${alt.min_price.toFixed(2)}`}
                                    </Text>
                                  )}
                                  <Text style={styles.otherSizeActionText}>
                                    Vezi prețuri
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </BeavySurface>
                      </View>
                    )}

                    {equivalents.length > 0 && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          setActiveMinitab('equivalents');
                        }}
                        style={({ pressed }) => [
                          styles.switchEqCtaBtn,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.switchEqCtaText}>
                          {`Vezi ${equivalents.length} alternative în „Același tip” →`}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
            </View>
          ) : (
            <View style={styles.sectionBlock}>
              <View style={styles.eqHeaderBanner}>
                <View style={styles.eqHeaderCopy}>
                  <Text style={styles.eqHeaderTitle}>
                    {familyName || 'Alternative de același tip'}
                  </Text>
                  <Text style={styles.eqHeaderSub}>
                    Produse compatibile ca tip și gramaj, ordonate după prețul minim
                  </Text>
                </View>
                {equivalents.length > 0 && (
                  <View style={styles.eqCountBadge}>
                    <Text style={styles.eqCountBadgeText}>{equivalents.length}</Text>
                  </View>
                )}
              </View>

              {loadingEquivalents ? (
                <BeavySurface variant="elevated" style={styles.loadingCard}>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={styles.loadingText}>
                    Căutăm alternative compatibile…
                  </Text>
                </BeavySurface>
              ) : equivalents.length === 0 ? (
                <BeavySurface variant="elevated" style={styles.emptyNoticeCard}>
                  <Text style={styles.emptyNoticeText}>
                    Nu există alte variante compatibile în această categorie momentan.
                  </Text>
                </BeavySurface>
              ) : (
                <View style={styles.eqCardsStack}>
                  {equivalents.map((eq, idx) => {
                    const cleanTitle = formatProductTitle(
                      eq.product.canonical_name,
                      eq.product.brand
                    );
                    const isCheapestEq = idx === 0 && eq.lowestUnitPrice !== null;

                    return (
                      <Pressable
                        key={eq.product.id}
                        onPress={() => {
                          triggerHaptic('medium');
                          onReplaceWithProduct(item.id, eq.product);
                          onClose();
                        }}
                        style={({ pressed }) => [
                          styles.eqCard,
                          isCheapestEq && styles.eqCardBest,
                          pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Alege ${cleanTitle}`}
                      >
                        <ProductImageBox
                          imageUrl={eq.product.image_url}
                          productName={eq.product.canonical_name}
                          brand={eq.product.brand}
                          familyName={eq.product.family_name}
                          variant="thumb"
                        />

                        <View style={styles.eqCardBody}>
                          <Text numberOfLines={2} style={styles.variantTitle}>
                            {cleanTitle}
                          </Text>

                          <View style={styles.eqPillsRow}>
                            {eq.product.brand && (
                              <View style={styles.eqMetaPill}>
                                <Text numberOfLines={1} style={styles.eqMetaPillText}>
                                  {eq.product.brand}
                                </Text>
                              </View>
                            )}
                            {eq.product.package_size && (
                              <View style={styles.eqMetaPill}>
                                <Text numberOfLines={1} style={styles.eqMetaPillText}>
                                  {eq.product.package_size}
                                </Text>
                              </View>
                            )}
                            {eq.unitPriceSummary && (
                              <View style={styles.eqMetaPill}>
                                <Text numberOfLines={1} style={styles.eqMetaPillText}>
                                  {eq.unitPriceSummary}
                                </Text>
                              </View>
                            )}
                            {eq.hasPromoOrLoyalty && (
                              <View style={styles.eqPromoMiniPill}>
                                <Text style={styles.eqPromoMiniText}>Promo/Card</Text>
                              </View>
                            )}
                          </View>

                          {eq.lowestUnitPrice !== null && (
                            <View style={styles.eqStoreRow}>
                              {eq.cheapestRetailerName && (
                                <RetailerLogo
                                  retailerName={eq.cheapestRetailerName}
                                  slug={eq.cheapestRetailerSlug}
                                  size={16}
                                  shape="circle"
                                />
                              )}
                              <Text numberOfLines={1} style={styles.eqPriceText}>
                                {`${eq.lowestUnitPrice.toFixed(2)} RON`}
                              </Text>
                              <Text numberOfLines={1} style={styles.eqStoreCaption}>
                                {[
                                  eq.cheapestRetailerName,
                                  eq.storeCount > 0
                                    ? `${eq.storeCount} ${eq.storeCount === 1 ? 'mag.' : 'mag.'}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.swapBtn}>
                          <Text style={styles.swapBtnText}>Alege</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {onPreviewAdd && previewAddActionLabel && (
          <Pressable
            onPress={() => {
              triggerHaptic('medium');
              onPreviewAdd();
              onClose();
            }}
            style={({ pressed }) => [
              styles.previewAddBtn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.previewAddText}>{previewAddActionLabel}</Text>
          </Pressable>
        )}
      </View>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  sheetInner: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  headerInfoCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  productTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 17,
    color: C.primary,
    lineHeight: 22,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qtyBadge: {
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },
  qtyBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 11,
    color: C.primary,
  },
  manualPill: {
    backgroundColor: C.accent,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  manualPillText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.primary,
  },
  headerMetaText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.muted,
    flexShrink: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 6,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 11.5,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingHorizontal: 4,
  },
  sectionCount: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11.5,
    color: C.muted,
  },
  explainCard: {
    padding: 14,
    gap: 4,
  },
  explainTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 14,
    color: C.primary,
  },
  explainText: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: C.muted,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 14,
    minHeight: 44,
    gap: 8,
  },
  searchFallback: {
    fontSize: 16,
    color: C.muted,
  },
  searchInput: {
    flex: 1,
    fontFamily: BeavyFonts.semiBold,
    fontSize: 14,
    color: C.primary,
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  loadingCard: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 13,
    color: C.muted,
  },
  emptyNoticeCard: {
    padding: 18,
    alignItems: 'center',
  },
  emptyNoticeText: {
    fontFamily: BeavyFonts.regular,
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  listSheet: {
    paddingVertical: 2,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 11,
  },
  storeAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  storeAvatarText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 11.5,
  },
  offerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offerStoreName: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  bestPill: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bestPillText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.leekDark,
  },
  offerBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  loyaltyPill: {
    backgroundColor: 'rgba(247, 141, 121, 0.2)',
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  loyaltyText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.primary,
  },
  promoPill: {
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  promoPillText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.primary,
  },
  sgrPill: {
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sgrPillText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 10.5,
    color: C.muted,
  },
  offerPriceCol: {
    alignItems: 'flex-end',
    gap: 1,
  },
  regularStrike: {
    fontFamily: BeavyFonts.regular,
    fontSize: 10.5,
    color: C.muted,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  offerPriceValue: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 14.5,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  offerUnitSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 10.5,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  offerDiffSub: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 11,
  },
  variantInfoCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  variantTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13.5,
    color: C.primary,
    lineHeight: 18,
  },
  variantMeta: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11.5,
    color: C.muted,
  },
  eqPriceText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13.5,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  eqHeaderBanner: {
    backgroundColor: 'rgba(232, 220, 207, 0.45)',
    borderRadius: BeavyRadius.lg,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  eqHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  eqHeaderTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13.5,
    color: C.primary,
  },
  eqHeaderSub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11.5,
    color: C.muted,
  },
  eqCountBadge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eqCountBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 12,
    color: C.primary,
  },
  otherSizesWrap: {
    marginTop: 8,
    gap: 10,
  },
  singleStoreExplainText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: C.muted,
    paddingHorizontal: 2,
  },
  otherSizeActionText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: C.accent,
  },
  switchEqCtaBtn: {
    minHeight: 44,
    borderRadius: BeavyRadius.lg,
    backgroundColor: 'rgba(219, 227, 198, 0.36)',
    borderWidth: 1,
    borderColor: 'rgba(92, 117, 52, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  switchEqCtaText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13,
    color: C.primary,
  },
  eqCardsStack: {
    gap: 8,
  },
  eqCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
    borderWidth: 1,
    borderColor: C.rule,
  },
  eqCardBest: {
    backgroundColor: 'rgba(219, 227, 198, 0.32)',
    borderColor: 'rgba(92, 117, 52, 0.35)',
  },
  eqCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  eqPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  eqMetaPill: {
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  eqMetaPillText: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 10.5,
    color: C.muted,
  },
  eqPromoMiniPill: {
    backgroundColor: 'rgba(247, 141, 121, 0.22)',
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  eqPromoMiniText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 10.5,
    color: C.primary,
  },
  eqStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  eqStoreCaption: {
    flex: 1,
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
  },
  swapBtn: {
    minHeight: 40,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swapBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 12,
    color: C.surface,
  },
  previewAddBtn: {
    minHeight: 48,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  previewAddText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 14,
    color: C.surface,
  },
  rowPressed: {
    backgroundColor: 'rgba(232, 220, 207, 0.35)',
  },
  pressed: {
    opacity: 0.78,
  },
});
