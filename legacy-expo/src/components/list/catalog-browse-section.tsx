import { SymbolView } from 'expo-symbols';
import React from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ProductImageBox } from '@/components/product-image-box';
import { QuantityStepper } from '@/components/quantity-stepper';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  BeavyShadows,
  triggerHaptic,
} from '@/constants/theme';
import {
  type BeavyFamilySearchResult,
  type CategoryBrandFacet,
  type DisplayProduct,
  formatProductTitle,
} from '@/services/beavy-catalog-search';

type SimpleCategoryChip = {
  id: string;
  name: string;
  slug: string | null;
};

type CatalogBrowseSectionProps = {
  search: string;
  activeCatObj: { name: string; slug: string | null } | null;
  selectedCategory: string | null;
  selectedBrand: string | null;
  showBrandFilters: boolean;
  searchInSelectedCategory: boolean;
  visibleCategories: SimpleCategoryChip[];
  brandFacets: CategoryBrandFacet[];
  searchFamilies: BeavyFamilySearchResult[];
  products: DisplayProduct[];
  totalCatalogCount: number;
  hasMoreProducts: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  categoryScrollRef: React.RefObject<React.ComponentRef<typeof ScrollView> | null>;
  brandScrollRef: React.RefObject<React.ComponentRef<typeof ScrollView> | null>;
  onCategoryViewportLayout: (e: LayoutChangeEvent) => void;
  onCategoryChipLayout: (key: string, x: number, width: number) => void;
  onBrandViewportLayout: (e: LayoutChangeEvent) => void;
  onBrandChipLayout: (key: string, x: number, width: number) => void;
  onSelectCategory: (slug: string | null) => void;
  onToggleBrandFilters: () => void;
  onSelectBrand: (brand: string | null) => void;
  onOpenAislePicker: () => void;
  onToggleSearchScope: (inCategory: boolean) => void;
  onSelectSearchFamily: (family: BeavyFamilySearchResult) => void;
  onOpenVariants: (product: DisplayProduct) => void;
  onProductStep: (product: DisplayProduct, nextQty: number) => void;
  getProductQuantity: (productId: string) => number;
  onLoadMore: () => void;
};

/**
 * Răsfoirea catalogului canonic pe categorii, raioane și branduri + grilă pe 2 coloane.
 */
export function CatalogBrowseSection({
  search,
  activeCatObj,
  selectedCategory,
  selectedBrand,
  showBrandFilters,
  searchInSelectedCategory,
  visibleCategories,
  brandFacets,
  searchFamilies,
  products,
  totalCatalogCount,
  hasMoreProducts,
  loading,
  loadingMore,
  error,
  categoryScrollRef,
  brandScrollRef,
  onCategoryViewportLayout,
  onCategoryChipLayout,
  onBrandViewportLayout,
  onBrandChipLayout,
  onSelectCategory,
  onToggleBrandFilters,
  onSelectBrand,
  onOpenAislePicker,
  onToggleSearchScope,
  onSelectSearchFamily,
  onOpenVariants,
  onProductStep,
  getProductQuantity,
  onLoadMore,
}: CatalogBrowseSectionProps) {
  const cleanSearch = search.trim();
  const productRows: DisplayProduct[][] = [];
  for (let i = 0; i < products.length; i += 2) {
    productRows.push(products.slice(i, i + 2));
  }

  const renderProductCard = (product: DisplayProduct) => {
    const qty = getProductQuantity(product.id);
    const cleanTitle = formatProductTitle(product.canonical_name, product.brand);

    return (
      <Pressable
        key={product.id}
        onPress={() => {
          if (qty === 0) {
            onProductStep(product, 1);
          } else {
            triggerHaptic('selection');
            onOpenVariants(product);
          }
        }}
        style={({ pressed }) => [
          styles.productCard,
          qty > 0 && styles.productCardInList,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.cardTopRow}>
          {product.brand ? (
            <View style={styles.brandTag}>
              <Text numberOfLines={1} style={styles.brandTagText}>
                {product.brand}
              </Text>
            </View>
          ) : (
            <View style={styles.brandTagSpacer} />
          )}

          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              triggerHaptic('selection');
              onOpenVariants(product);
            }}
            hitSlop={9}
            style={({ pressed }) => [
              styles.variantsPill,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Vezi variante echivalente pentru ${cleanTitle}`}
          >
            <SymbolView
              name="square.stack"
              tintColor={C.primary}
              size={11}
              fallback={<Text style={styles.fallbackGlyph}>≡</Text>}
            />
          </Pressable>
        </View>

        <ProductImageBox
          imageUrl={product.image_url}
          productName={product.canonical_name}
          brand={product.brand}
          categoryName={product.category_name}
          familyName={product.family_name}
          variant="card"
        />

        <Text numberOfLines={3} ellipsizeMode="tail" style={styles.productTitle}>
          {cleanTitle}
        </Text>

        <View style={styles.cardFooterRow}>
          <Text numberOfLines={1} style={styles.productSize}>
            {product.package_size || product.category_name || ''}
          </Text>

          {qty === 0 ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onProductStep(product, 1);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Adaugă ${cleanTitle}`}
              style={({ pressed }) => [
                styles.addCircleBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.addCircleBtnText}>+</Text>
            </Pressable>
          ) : (
            <QuantityStepper
              quantity={qty}
              variant="card"
              onDecrement={() => onProductStep(product, qty - 1)}
              onIncrement={() => onProductStep(product, qty + 1)}
            />
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.titleCol}>
          <Text style={styles.overline}>Categorii și raioane</Text>
          <Text numberOfLines={1} style={styles.heading}>
            {cleanSearch
              ? `Rezultate „${cleanSearch}” (${totalCatalogCount || products.length})`
              : activeCatObj
                ? `${activeCatObj.name} (${totalCatalogCount || products.length})`
                : `Toată cămara (${totalCatalogCount || products.length})`}
          </Text>
        </View>

        {!cleanSearch && (
          <View style={styles.headerActions}>
            {selectedCategory !== null && brandFacets.length >= 2 && (
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  onToggleBrandFilters();
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.filterBtn,
                  (showBrandFilters || selectedBrand !== null) && styles.filterBtnActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ expanded: showBrandFilters || selectedBrand !== null }}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.filterBtnText,
                    (showBrandFilters || selectedBrand !== null) &&
                      styles.filterBtnTextActive,
                  ]}
                >
                  {selectedBrand ?? 'Branduri'}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onOpenAislePicker();
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.aisleBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Toate raioanele"
            >
              <SymbolView
                name="square.grid.2x2"
                tintColor={C.primary}
                size={12}
                fallback={<Text style={styles.fallbackGlyph}>⊞</Text>}
              />
              <Text style={styles.aisleBtnText}>Raioane</Text>
            </Pressable>
          </View>
        )}
      </View>

      {cleanSearch.length >= 2 && (
        <View style={styles.searchContextWrap}>
          {activeCatObj && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScrollRow}
            >
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  onToggleSearchScope(false);
                }}
                style={[
                  styles.chip,
                  !searchInSelectedCategory && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    !searchInSelectedCategory && styles.chipTextActive,
                  ]}
                >
                  Toată cămara
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  onToggleSearchScope(true);
                }}
                style={[
                  styles.chip,
                  searchInSelectedCategory && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    searchInSelectedCategory && styles.chipTextActive,
                  ]}
                >
                  {`Doar în ${activeCatObj.name}`}
                </Text>
              </Pressable>
            </ScrollView>
          )}

          {searchFamilies.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScrollRow}
            >
              {searchFamilies.slice(0, 8).map((fam) => (
                <Pressable
                  key={fam.family_id}
                  onPress={() => {
                    triggerHaptic('selection');
                    onSelectSearchFamily(fam);
                  }}
                  style={({ pressed }) => [styles.familyChip, pressed && styles.pressed]}
                >
                  <Text style={styles.familyChipName}>{fam.family_name}</Text>
                  <View style={styles.familyCountBadge}>
                    <Text style={styles.familyCountText}>{fam.product_count}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {!cleanSearch && (
        <View style={styles.filtersStack}>
          <ScrollView
            ref={categoryScrollRef}
            horizontal
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onLayout={onCategoryViewportLayout}
            contentContainerStyle={styles.hScrollRow}
          >
            <Pressable
              onLayout={(e) =>
                onCategoryChipLayout('__all__', e.nativeEvent.layout.x, e.nativeEvent.layout.width)
              }
              onPress={() => {
                triggerHaptic('selection');
                onSelectCategory(null);
              }}
              style={[styles.chip, selectedCategory === null && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedCategory === null && styles.chipTextActive,
                ]}
              >
                Toate
              </Text>
            </Pressable>

            {visibleCategories.map((cat) => {
              const active = selectedCategory === cat.slug;
              return (
                <Pressable
                  key={cat.id}
                  onLayout={(e) => {
                    if (cat.slug) {
                      onCategoryChipLayout(
                        cat.slug,
                        e.nativeEvent.layout.x,
                        e.nativeEvent.layout.width
                      );
                    }
                  }}
                  onPress={() => {
                    triggerHaptic('selection');
                    if (cat.slug) onSelectCategory(cat.slug);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onOpenAislePicker();
              }}
              style={styles.moreAislesChip}
            >
              <SymbolView
                name="ellipsis"
                tintColor={C.primary}
                size={13}
                fallback={<Text style={styles.fallbackGlyph}>•••</Text>}
              />
              <Text style={styles.chipText}>Alte raioane</Text>
            </Pressable>
          </ScrollView>

          {selectedCategory !== null &&
            brandFacets.length >= 2 &&
            (showBrandFilters || selectedBrand !== null) && (
              <ScrollView
                ref={brandScrollRef}
                horizontal
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                onLayout={onBrandViewportLayout}
                contentContainerStyle={styles.hScrollRow}
              >
                <Pressable
                  onLayout={(e) =>
                    onBrandChipLayout('__all__', e.nativeEvent.layout.x, e.nativeEvent.layout.width)
                  }
                  onPress={() => {
                    triggerHaptic('selection');
                    onSelectBrand(null);
                  }}
                  style={[
                    styles.brandChip,
                    selectedBrand === null && styles.brandChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.brandChipText,
                      selectedBrand === null && styles.brandChipTextActive,
                    ]}
                  >
                    Toate brandurile
                  </Text>
                </Pressable>

                {brandFacets.map((facet) => {
                  const active = selectedBrand === facet.brand;
                  return (
                    <Pressable
                      key={facet.brand}
                      onLayout={(e) =>
                        onBrandChipLayout(
                          facet.brand,
                          e.nativeEvent.layout.x,
                          e.nativeEvent.layout.width
                        )
                      }
                      onPress={() => {
                        triggerHaptic('selection');
                        onSelectBrand(active ? null : facet.brand);
                      }}
                      style={[styles.brandChip, active && styles.brandChipActive]}
                    >
                      <Text
                        style={[
                          styles.brandChipText,
                          active && styles.brandChipTextActive,
                        ]}
                      >
                        {`${facet.brand} (${facet.product_count})`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
        </View>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={C.accent} size="small" />
          <Text style={styles.loadingText}>Încărcăm produsele...</Text>
        </View>
      ) : error ? (
        <BeavySurface variant="tonal" style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </BeavySurface>
      ) : products.length === 0 ? (
        <BeavySurface variant="elevated" style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Niciun produs găsit în catalog</Text>
          <Text style={styles.emptySub}>
            {cleanSearch && searchInSelectedCategory
              ? 'Încearcă să cauți în tot catalogul fără filtru pe raion.'
              : 'Nu am găsit produse pentru această căutare.'}
          </Text>
          {cleanSearch && searchInSelectedCategory ? (
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onToggleSearchScope(false);
              }}
              style={styles.resetBtn}
            >
              <Text style={styles.resetBtnText}>Caută în toată cămara</Text>
            </Pressable>
          ) : selectedBrand ? (
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onSelectBrand(null);
              }}
              style={styles.resetBtn}
            >
              <Text style={styles.resetBtnText}>Arată toate brandurile</Text>
            </Pressable>
          ) : null}
        </BeavySurface>
      ) : (
        <View style={styles.resultsWrap}>
          <View style={styles.grid}>
            {productRows.map((row) => (
              <View key={row[0].id} style={styles.gridRow}>
                {row.map(renderProductCard)}
                {row.length === 1 && <View style={styles.gridSpacer} />}
              </View>
            ))}
          </View>

          {hasMoreProducts && (
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onLoadMore();
              }}
              disabled={loadingMore}
              style={({ pressed }) => [styles.loadMoreBtn, pressed && styles.pressed]}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Text style={styles.loadMoreText}>
                  {`Încarcă mai multe (${products.length} din ${totalCatalogCount})`}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 4,
  },
  titleCol: {
    flex: 1,
    minWidth: 140,
    gap: 2,
  },
  overline: {
    fontSize: 10,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heading: {
    fontSize: 16,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterBtn: {
    maxWidth: 120,
    minHeight: 34,
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 11,
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: C.primary,
  },
  filterBtnText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  filterBtnTextActive: {
    color: C.surface,
  },
  aisleBtn: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 11,
    ...BeavyShadows.card,
  },
  aisleBtnText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  fallbackGlyph: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  searchContextWrap: {
    marginHorizontal: -16,
    gap: 7,
  },
  filtersStack: {
    marginHorizontal: -16,
    gap: 7,
  },
  hScrollRow: {
    paddingHorizontal: 16,
    paddingRight: 28,
    gap: 7,
    alignItems: 'center',
  },
  chip: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: C.primary,
  },
  chipText: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  chipTextActive: {
    color: C.surface,
  },
  moreAislesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  familyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    paddingLeft: 12,
    paddingRight: 7,
  },
  familyChipName: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  familyCountBadge: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  familyCountText: {
    fontSize: 10,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  brandChip: {
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    borderWidth: 1,
    borderColor: C.secondary,
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  brandChipActive: {
    backgroundColor: 'rgba(247, 141, 121, 0.25)',
    borderColor: C.accent,
  },
  brandChipText: {
    fontSize: 11,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.muted,
  },
  brandChipTextActive: {
    color: C.primary,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: BeavyFonts.semiBold,
    color: C.muted,
  },
  errorCard: {
    padding: 13,
    backgroundColor: 'rgba(247, 141, 121, 0.22)',
  },
  errorText: {
    color: C.primary,
    fontSize: 12.5,
    fontFamily: BeavyFonts.semiBold,
  },
  emptyBox: {
    padding: 22,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  emptySub: {
    fontSize: 12,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 17,
  },
  resetBtn: {
    marginTop: 6,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 15,
    minHeight: 36,
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.surface,
  },
  resultsWrap: {
    gap: 10,
  },
  grid: {
    gap: 9,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'stretch',
  },
  gridSpacer: {
    flex: 1,
  },
  productCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    padding: 11,
    gap: 6,
    justifyContent: 'space-between',
    ...BeavyShadows.card,
  },
  productCardInList: {
    backgroundColor: C.buttermilk,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    minHeight: 26,
  },
  brandTag: {
    flexShrink: 1,
    minWidth: 0,
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    maxWidth: '72%',
  },
  brandTagSpacer: {
    flex: 1,
  },
  brandTagText: {
    fontSize: 9.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  variantsPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    flexShrink: 0,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productTitle: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
    lineHeight: 17.5,
    minHeight: 36,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    minHeight: 34,
  },
  productSize: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontFamily: BeavyFonts.semiBold,
    color: C.muted,
  },
  addCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    flexShrink: 0,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircleBtnText: {
    color: C.primary,
    fontSize: 18,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    lineHeight: 20,
  },
  loadMoreBtn: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    ...BeavyShadows.card,
  },
  loadMoreText: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  pressed: {
    opacity: 0.74,
  },
});
