import { SymbolView } from 'expo-symbols';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ProductPriceGrid } from '@/components/product/product-price-grid';
import { ProductImageBox } from '@/components/product-image-box';
import { QuantityStepper } from '@/components/quantity-stepper';
import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import {
  type DisplayProduct,
  fetchCatalogProductsPage,
  formatProductTitle,
  getBeavyFamilyProducts,
  getEquivalentProductsForProduct,
  resolveProductImageUrl,
} from '@/services/beavy-catalog-search';
import { fetchVerifiedOffersForProducts } from '@/services/beavy-comparison';
import {
  extractGramajFacets,
  normalizeGramajFacet,
} from '@/services/product-price-grid';

export type VariantsModalTarget =
  | {
      kind: 'product';
      product: DisplayProduct;
    }
  | {
      kind: 'family';
      familyId: string;
      familyName: string;
      categoryName?: string;
    }
  | {
      kind: 'query';
      query: string;
    };

type ProductVariantsModalProps = {
  visible: boolean;
  target: VariantsModalTarget | null;
  getProductQuantity: (productId: string, canonicalName?: string) => number;
  onUpdateQuantity: (product: DisplayProduct, newQty: number) => void;
  onClose: () => void;
};

type VariantPriceSummary = {
  minPrice: number;
  storeCount: number;
  cheapestStore: string;
};

/**
 * Foaie rapidă pentru compararea variantelor echivalente (branduri / gramaje) cu preț minim live.
 */
export function ProductVariantsModal({
  visible,
  target,
  getProductQuantity,
  onUpdateQuantity,
  onClose,
}: ProductVariantsModalProps) {
  const [familyTitle, setFamilyTitle] = useState<string | null>(null);
  const [variants, setVariants] = useState<DisplayProduct[]>([]);
  const [pricesById, setPricesById] = useState<Record<string, VariantPriceSummary>>({});
  const [loading, setLoading] = useState(false);
  const [selectedGramaj, setSelectedGramaj] = useState<string | null>(null);

  const gramajFacets = useMemo(() => extractGramajFacets(variants), [variants]);
  const activeGramaj =
    selectedGramaj && gramajFacets.some((g) => g.label === selectedGramaj)
      ? selectedGramaj
      : null;

  const filteredVariants = useMemo(() => {
    if (!activeGramaj) return variants;
    return variants.filter(
      (v) => normalizeGramajFacet(v.package_size, v.canonical_name) === activeGramaj
    );
  }, [variants, activeGramaj]);

  const targetKey = target
    ? target.kind === 'product'
      ? `prod:${target.product.id}`
      : target.kind === 'family'
        ? `fam:${target.familyId}`
        : `q:${target.query.trim().toLowerCase()}`
    : '';

  useEffect(() => {
    if (!visible || !target) return;

    let canceled = false;
    const rafId = requestAnimationFrame(() => {
      if (!canceled) {
        setLoading(true);
      }
    });

    const load = async () => {
      try {
        let nextTitle: string | null = null;
        let nextVariants: DisplayProduct[] = [];

        if (target.kind === 'product') {
          const res = await getEquivalentProductsForProduct(target.product.id, 30);
          nextTitle = res.familyName || target.product.family_name || null;
          nextVariants = res.variants;
        } else if (target.kind === 'family') {
          const rows = await getBeavyFamilyProducts(target.familyId, { limit: 40 });
          nextTitle = target.familyName;
          nextVariants = rows.map((v) => ({
            id: v.product_id,
            canonical_name: v.canonical_name,
            brand: v.brand,
            package_size: v.package_size,
            image_url: resolveProductImageUrl(
              v.image_url,
              v.canonical_name,
              target.categoryName,
              target.familyName
            ),
            family_name: target.familyName,
            category_name: target.categoryName,
            subcategory: v.subcategory,
          }));
        } else {
          const page = await fetchCatalogProductsPage({
            query: target.query,
            limit: 40,
            offset: 0,
            sort: 'relevance',
          });
          nextTitle = `Toate variantele pentru „${target.query}”`;
          nextVariants = page.products;
        }

        if (canceled) return;
        setFamilyTitle(nextTitle);
        setVariants(nextVariants);

        const idsToFetch = Array.from(
          new Set([
            ...(target.kind === 'product' ? [target.product.id] : []),
            ...nextVariants.map((v) => v.id),
          ])
        );

        if (idsToFetch.length > 0) {
          const offers = await fetchVerifiedOffersForProducts(idsToFetch);
          if (canceled) return;
          const agg = new Map<
            string,
            { minPrice: number; stores: Set<string>; cheapestStore: string }
          >();
          for (const o of offers) {
            if (!o.product_id || o.stock_status === 'out_of_stock') continue;
            const effPrice = o.promo_price ?? o.price;
            const cur = agg.get(o.product_id);
            if (!cur) {
              agg.set(o.product_id, {
                minPrice: effPrice,
                stores: new Set([o.retailer_name]),
                cheapestStore: o.retailer_name,
              });
            } else {
              cur.stores.add(o.retailer_name);
              if (effPrice < cur.minPrice) {
                cur.minPrice = effPrice;
                cur.cheapestStore = o.retailer_name;
              }
            }
          }
          const summaryMap: Record<string, VariantPriceSummary> = {};
          for (const [pid, val] of agg.entries()) {
            summaryMap[pid] = {
              minPrice: val.minPrice,
              storeCount: val.stores.size,
              cheapestStore: val.cheapestStore,
            };
          }
          setPricesById(summaryMap);
        }
      } catch {
        if (!canceled) {
          setVariants([]);
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      canceled = true;
      cancelAnimationFrame(rafId);
    };
  }, [visible, targetKey, target]);

  if (!target) return null;

  const isProductTarget = target.kind === 'product';
  const anchorProduct = isProductTarget ? target.product : null;
  const anchorQty = anchorProduct
    ? getProductQuantity(anchorProduct.id, anchorProduct.canonical_name)
    : 0;
  const anchorSummary = anchorProduct ? pricesById[anchorProduct.id] : undefined;

  return (
    <BeavySheetModal visible={visible} onClose={onClose} maxHeightRatio="86%">
      <View style={styles.sheetInner}>
        <View style={styles.header}>
          <View style={styles.headerTextCol}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {isProductTarget
                  ? 'DETALII ȘI ECHIVALENTE'
                  : target.kind === 'query'
                    ? 'TOATE VARIANTELE DISPONIBILE'
                    : 'FAMILIE DE PRODUSE'}
              </Text>
            </View>
            <Text numberOfLines={2} style={styles.title}>
              {anchorProduct
                ? formatProductTitle(
                    anchorProduct.canonical_name,
                    anchorProduct.brand
                  )
                : target.kind === 'family'
                  ? target.familyName
                  : target.kind === 'query'
                    ? `Variante pentru „${target.query}”`
                    : ''}
            </Text>
            {familyTitle && isProductTarget && (
              <Text style={styles.subtitle}>
                {`Familie compatibilă: ${familyTitle}`}
              </Text>
            )}
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

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {anchorProduct && (
            <BeavySurface variant="elevated" style={styles.anchorCard}>
              <ProductImageBox
                imageUrl={anchorProduct.image_url}
                productName={anchorProduct.canonical_name}
                brand={anchorProduct.brand}
                categoryName={anchorProduct.category_name}
                familyName={anchorProduct.family_name}
                variant="thumb"
              />

              <View style={styles.anchorInfo}>
                <Text numberOfLines={2} style={styles.variantTitle}>
                  {formatProductTitle(
                    anchorProduct.canonical_name,
                    anchorProduct.brand
                  )}
                </Text>
                <Text numberOfLines={1} style={styles.variantMeta}>
                  {[anchorProduct.brand, anchorProduct.package_size]
                    .filter(Boolean)
                    .join(' · ') || 'Produs selectat'}
                </Text>
                {anchorSummary && (
                  <Text style={styles.priceMeta}>
                    {`de la ${anchorSummary.minPrice.toFixed(2)} RON · ${anchorSummary.cheapestStore} (${anchorSummary.storeCount} mag.)`}
                  </Text>
                )}
              </View>

              {anchorQty === 0 ? (
                <Pressable
                  onPress={() => {
                    triggerHaptic('medium');
                    onUpdateQuantity(anchorProduct, 1);
                  }}
                  style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.addBtnText}>+ Adaugă</Text>
                </Pressable>
              ) : (
                <QuantityStepper
                  quantity={anchorQty}
                  variant="card"
                  onDecrement={() => {
                    triggerHaptic('selection');
                    onUpdateQuantity(anchorProduct, anchorQty - 1);
                  }}
                  onIncrement={() => {
                    triggerHaptic('light');
                    onUpdateQuantity(anchorProduct, anchorQty + 1);
                  }}
                />
              )}
            </BeavySurface>
          )}

          {anchorProduct && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Grilă prețuri pe magazine</Text>
              <ProductPriceGrid product={anchorProduct} showHeader={false} />
            </View>
          )}

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>
              {isProductTarget
                ? `Alternative compatibile (${filteredVariants.length})`
                : `Produse din familie (${filteredVariants.length})`}
            </Text>

            {gramajFacets.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.gramajRow}
              >
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedGramaj(null);
                  }}
                  style={[styles.gramajChip, !activeGramaj && styles.gramajChipActive]}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.gramajChipText,
                      !activeGramaj && styles.gramajChipTextActive,
                    ]}
                  >
                    {`Toate (${variants.length})`}
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
                      style={[styles.gramajChip, active && styles.gramajChipActive]}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.gramajChipText,
                          active && styles.gramajChipTextActive,
                        ]}
                      >
                        {`${f.label} (${f.count})`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {loading ? (
              <BeavySurface variant="elevated" style={styles.loadingCard}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={styles.loadingText}>
                  Încărcăm variantele și prețurile...
                </Text>
              </BeavySurface>
            ) : filteredVariants.length === 0 ? (
              <BeavySurface variant="elevated" style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  Nu există alte variante compatibile în această familie.
                </Text>
              </BeavySurface>
            ) : (
              <BeavySurface variant="elevated" style={styles.listSheet}>
                {filteredVariants.map((variant, idx) => {
                  const isLast = idx === filteredVariants.length - 1;
                  const qty = getProductQuantity(
                    variant.id,
                    variant.canonical_name
                  );
                  const cleanTitle = formatProductTitle(
                    variant.canonical_name,
                    variant.brand
                  );
                  const meta = [variant.brand, variant.package_size]
                    .filter(Boolean)
                    .join(' · ');
                  const priceSummary = pricesById[variant.id];

                  return (
                    <View
                      key={variant.id}
                      style={[
                        styles.variantRow,
                        !isLast && styles.variantRowBorder,
                      ]}
                    >
                      <ProductImageBox
                        imageUrl={variant.image_url}
                        productName={variant.canonical_name}
                        brand={variant.brand}
                        familyName={variant.family_name}
                        variant="thumb"
                      />

                      <View style={styles.variantInfo}>
                        <Text numberOfLines={2} style={styles.variantTitle}>
                          {cleanTitle}
                        </Text>
                        {!!meta && (
                          <Text numberOfLines={1} style={styles.variantMeta}>
                            {meta}
                          </Text>
                        )}
                        {priceSummary && (
                          <Text numberOfLines={1} style={styles.priceMeta}>
                            {`de la ${priceSummary.minPrice.toFixed(2)} RON · ${priceSummary.storeCount} mag.`}
                          </Text>
                        )}
                      </View>

                      {qty === 0 ? (
                        <Pressable
                          onPress={() => {
                            triggerHaptic('medium');
                            onUpdateQuantity(variant, 1);
                          }}
                          hitSlop={6}
                          style={({ pressed }) => [
                            styles.circleAddBtn,
                            pressed && styles.pressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Adaugă ${cleanTitle}`}
                        >
                          <Text style={styles.circleAddBtnText}>+</Text>
                        </Pressable>
                      ) : (
                        <QuantityStepper
                          quantity={qty}
                          variant="card"
                          onDecrement={() => {
                            triggerHaptic('selection');
                            onUpdateQuantity(variant, qty - 1);
                          }}
                          onIncrement={() => {
                            triggerHaptic('light');
                            onUpdateQuantity(variant, qty + 1);
                          }}
                        />
                      )}
                    </View>
                  );
                })}
              </BeavySurface>
            )}
          </View>
        </ScrollView>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextCol: {
    flex: 1,
    gap: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10,
    color: C.primary,
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 19,
    color: C.primary,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: C.muted,
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
    maxHeight: 460,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 14,
  },
  anchorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  anchorInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  addBtn: {
    minHeight: 40,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 12.5,
    color: C.surface,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 12,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingHorizontal: 4,
  },
  loadingCard: {
    padding: 20,
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
  emptyCard: {
    padding: 18,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: BeavyFonts.regular,
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
  },
  listSheet: {
    paddingVertical: 2,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  variantRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  variantInfo: {
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
    fontSize: 12,
    color: C.muted,
  },
  priceMeta: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.leekDark,
    fontVariant: ['tabular-nums'],
  },
  circleAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleAddBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 18,
    color: C.surface,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.75,
  },
  gramajRow: {
    gap: 6,
    paddingVertical: 2,
  },
  gramajChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gramajChipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  gramajChipText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  gramajChipTextActive: {
    color: C.surface,
  },
});
