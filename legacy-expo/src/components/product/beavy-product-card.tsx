import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MiniPriceStrip } from '@/components/product/product-price-grid';
import { ProductImageBox } from '@/components/product-image-box';
import { QuantityStepper } from '@/components/quantity-stepper';
import { BeavyBadge } from '@/components/ui/beavy-badge';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  triggerHaptic,
} from '@/constants/theme';
import {
  type DisplayProduct,
  formatProductTitle,
} from '@/services/beavy-catalog-search';
import {
  cleanDisplayPackageSize,
  cleanScraperProductName,
  estimateProductUnitPricing,
  type ItemComparisonStatus,
} from '@/services/beavy-comparison';

function roundDiff(value: number): number {
  return Math.round(value * 100) / 100;
}

type BeavyCatalogProductCardProps = {
  product: DisplayProduct;
  quantity: number;
  variant?: 'catalog' | 'grid' | 'compact';
  isLast?: boolean;
  onPressInspect: (product: DisplayProduct) => void;
  onStepQuantity: (product: DisplayProduct, nextQty: number) => void;
};

/**
 * Card canonic unificat pentru produse (Caută grilă/listă + sugestii instant din Listă):
 * combină anatomia modulară Epic-Design-Labs/Spree cu ierarhia de preț Fintech Beavy.
 */
export const BeavyCatalogProductCard = React.memo(function BeavyCatalogProductCard({
  product,
  quantity,
  variant = 'catalog',
  isLast = false,
  onPressInspect,
  onStepQuantity,
}: BeavyCatalogProductCardProps) {
  const title = cleanScraperProductName(
    formatProductTitle(product.canonical_name, product.brand)
  );
  const cleanSize = cleanDisplayPackageSize(
    product.package_size,
    product.canonical_name
  );
  const metaParts = [product.brand, cleanSize].filter(Boolean);
  const hasPrice = product.min_price != null && (product.store_count ?? 0) > 0;
  const hasRegularStrike =
    hasPrice &&
    product.regular_min_price != null &&
    product.regular_min_price > (product.min_price ?? 0);
  const storeCount = product.store_count ?? 0;
  const retailerSlugs = product.retailer_slugs ?? [];
  const unitEstimate = hasPrice
    ? estimateProductUnitPricing(
        product.min_price,
        cleanSize,
        product.canonical_name
      )
    : null;

  if (variant === 'compact') {
    const compactMeta = [
      cleanSize,
      hasPrice
        ? unitEstimate?.estimatedUnitLine
          ? `${product.min_price!.toFixed(2)} RON (${unitEstimate.estimatedUnitLine})`
          : `de la ${product.min_price!.toFixed(2)} RON · ${storeCount} mag.`
        : product.brand,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <View style={!isLast ? styles.compactDivider : undefined}>
        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            onPressInspect(product);
          }}
          style={({ pressed }) => [
            styles.compactRow,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Sugestie canonică ${title}`}
        >
          <ProductImageBox
            imageUrl={product.image_url}
            productName={product.canonical_name}
            brand={product.brand}
            categoryName={product.category_name}
            familyName={product.family_name}
            variant="thumb"
          />

          <View style={styles.compactInfo}>
            <Text numberOfLines={1} style={styles.compactTitle}>
              {title}
            </Text>
            <View style={styles.compactMetaRow}>
              <Text numberOfLines={1} style={styles.compactMeta}>
                {compactMeta || product.category_name || 'Catalog canonic'}
              </Text>
            </View>

            {storeCount > 1 && retailerSlugs.length > 1 && (
              <View
                style={styles.compactRetailers}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {retailerSlugs.slice(0, 5).map((slug) => (
                  <RetailerLogo
                    key={slug}
                    retailerName={slug}
                    slug={slug}
                    size={14}
                    shape="circle"
                  />
                ))}
                {retailerSlugs.length > 5 && (
                  <Text style={styles.compactRetailersMore}>
                    {`+${retailerSlugs.length - 5}`}
                  </Text>
                )}
              </View>
            )}
          </View>

          {quantity === 0 ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                triggerHaptic('medium');
                onStepQuantity(product, 1);
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.compactAddBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Adaugă ${title}`}
            >
              <Text style={styles.compactAddText}>+</Text>
            </Pressable>
          ) : (
            <QuantityStepper
              quantity={quantity}
              variant="card"
              onDecrement={() => {
                triggerHaptic('selection');
                onStepQuantity(product, quantity - 1);
              }}
              onIncrement={() => {
                triggerHaptic('light');
                onStepQuantity(product, quantity + 1);
              }}
            />
          )}
        </Pressable>
        <MiniPriceStrip product={product} lazy />
      </View>
    );
  }

  if (variant === 'grid') {
    const cheapestSlug = product.cheapest_retailer_slug ?? retailerSlugs[0] ?? null;

    return (
      <BeavySurface
        variant="elevated"
        style={[styles.gridCard, quantity > 0 && styles.gridCardActive]}
      >
        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            onPressInspect(product);
          }}
          style={({ pressed }) => [styles.gridPressTop, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Compară prețuri pentru ${title}`}
        >
          <View style={styles.gridImageStage}>
            <ProductImageBox
              imageUrl={product.image_url}
              productName={product.canonical_name}
              brand={product.brand}
              categoryName={product.category_name}
              familyName={product.family_name}
              variant="card"
            />
            {(product.has_promo || product.has_loyalty) && (
              <View style={styles.gridOverlayBadges}>
                {product.has_promo && <BeavyBadge label="Promo" tone="accent" size="sm" />}
                {product.has_loyalty && <BeavyBadge label="Card" tone="primary" size="sm" />}
              </View>
            )}
          </View>

          <View style={styles.gridBody}>
            {metaParts.length > 0 && (
              <Text numberOfLines={1} style={styles.metaEyebrow}>
                {metaParts.join(' · ')}
              </Text>
            )}

            <Text numberOfLines={2} style={styles.gridTitleText}>
              {title}
            </Text>

            {hasPrice ? (
              <View style={styles.gridPriceStack}>
                <View style={styles.gridPriceRow}>
                  <Text style={styles.gridPriceText}>
                    {`${product.min_price!.toFixed(2)} RON`}
                  </Text>
                  {hasRegularStrike && (
                    <Text style={styles.strikeText}>
                      {`${product.regular_min_price!.toFixed(2)}`}
                    </Text>
                  )}
                </View>

                {unitEstimate?.estimatedUnitLine && (
                  <Text numberOfLines={1} style={styles.unitEstimateLabel}>
                    {unitEstimate.estimatedUnitLine}
                  </Text>
                )}

                <View style={styles.gridStoreRow}>
                  {(cheapestSlug || product.cheapest_retailer_name) && (
                    <RetailerLogo
                      retailerName={product.cheapest_retailer_name || cheapestSlug || 'Supermarket'}
                      slug={cheapestSlug}
                      size={18}
                      shape="circle"
                    />
                  )}
                  <Text numberOfLines={1} style={styles.storesLabel}>
                    {`${product.cheapest_retailer_name || 'Supermarket'} · ${storeCount} mag.`}
                  </Text>
                </View>
              </View>
            ) : (
              <Text numberOfLines={1} style={styles.gridNoPrice}>
                Fără ofertă activă
              </Text>
            )}
          </View>
        </Pressable>

        <View style={styles.gridActionFooter}>
          {quantity === 0 ? (
            <Pressable
              onPress={() => {
                triggerHaptic('medium');
                onStepQuantity(product, 1);
              }}
              hitSlop={4}
              style={({ pressed }) => [styles.gridAddBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Adaugă ${title} în listă`}
            >
              <SymbolView
                name="plus"
                tintColor={C.surface}
                size={13}
                fallback={<Text style={styles.gridAddBtnFallback}>+</Text>}
              />
              <Text style={styles.gridAddBtnText}>Adaugă</Text>
            </Pressable>
          ) : (
            <View style={styles.gridStepperWrap}>
              <QuantityStepper
                quantity={quantity}
                variant="card"
                onDecrement={() => {
                  triggerHaptic('selection');
                  onStepQuantity(product, quantity - 1);
                }}
                onIncrement={() => {
                  triggerHaptic('light');
                  onStepQuantity(product, quantity + 1);
                }}
              />
            </View>
          )}
        </View>
      </BeavySurface>
    );
  }

  if (variant === 'catalog') {
    const storeLabel = product.cheapest_retailer_name
      ? `${product.cheapest_retailer_name} · ${storeCount} ${storeCount === 1 ? 'magazin' : 'magazine'}`
      : `${storeCount} ${storeCount === 1 ? 'magazin' : 'magazine'}`;

    return (
      <View style={[styles.catalogRow, isLast && styles.catalogRowLast]}>
        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            onPressInspect(product);
          }}
          style={({ pressed }) => [styles.catalogMainPress, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Compară prețurile pentru ${title}`}
        >
          <ProductImageBox
            imageUrl={product.image_url}
            productName={product.canonical_name}
            brand={product.brand}
            categoryName={product.category_name}
            familyName={product.family_name}
            variant="thumb"
          />
          <View style={styles.catalogInfo}>
            <Text numberOfLines={2} style={styles.catalogTitle}>
              {title}
            </Text>
            <Text numberOfLines={1} style={styles.catalogMeta}>
              {hasPrice
                ? `${product.min_price!.toFixed(2)} RON · ${storeLabel}`
                : product.package_size || 'Preț indisponibil'}
            </Text>
            <MiniPriceStrip product={product} lazy />
          </View>
        </Pressable>

        {quantity === 0 ? (
          <Pressable
            onPress={() => {
              triggerHaptic('medium');
              onStepQuantity(product, 1);
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.catalogAddBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Adaugă ${title} în listă`}
          >
            <SymbolView
              name="plus"
              tintColor={C.primary}
              size={17}
              fallback={<Text style={styles.catalogAddFallback}>+</Text>}
            />
          </Pressable>
        ) : (
          <QuantityStepper
            quantity={quantity}
            variant="card"
            onDecrement={() => {
              triggerHaptic('selection');
              onStepQuantity(product, quantity - 1);
            }}
            onIncrement={() => {
              triggerHaptic('light');
              onStepQuantity(product, quantity + 1);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <BeavySurface variant="elevated" style={styles.card}>
      <Pressable
        onPress={() => {
          triggerHaptic('selection');
          onPressInspect(product);
        }}
        style={({ pressed }) => [styles.cardBodyPress, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Compară prețuri pentru ${title}`}
      >
        <ProductImageBox
          imageUrl={product.image_url}
          productName={product.canonical_name}
          brand={product.brand}
          categoryName={product.category_name}
          familyName={product.family_name}
          variant="medium"
        />

        <View style={styles.infoCol}>
          {metaParts.length > 0 && (
            <Text numberOfLines={1} style={styles.metaEyebrow}>
              {metaParts.join(' · ')}
            </Text>
          )}

          <Text numberOfLines={2} style={styles.titleText}>
            {title}
          </Text>

          {hasPrice ? (
            <View style={styles.priceBlock}>
              <View style={styles.priceHeadlineRow}>
                <Text style={styles.minPriceText}>
                  {`de la ${product.min_price!.toFixed(2)} RON`}
                </Text>
                {hasRegularStrike && (
                  <Text style={styles.strikeText}>
                    {`${product.regular_min_price!.toFixed(2)}`}
                  </Text>
                )}
                {product.has_promo && <BeavyBadge label="Promo" tone="accent" size="sm" />}
                {product.has_loyalty && <BeavyBadge label="Card" tone="neutral" size="sm" />}
              </View>

              {unitEstimate?.estimatedUnitLine && (
                <Text numberOfLines={1} style={styles.unitEstimateLabel}>
                  {unitEstimate.estimatedUnitLine}
                </Text>
              )}

              <View style={styles.storesRow}>
                {retailerSlugs.length > 0 && (
                  <View style={styles.dotsGroup}>
                    {retailerSlugs.slice(0, 4).map((slug, idx) => (
                      <RetailerLogo
                        key={slug}
                        retailerName={slug}
                        slug={slug}
                        size={18}
                        shape="circle"
                        style={idx > 0 ? styles.stackedLogoOverlap : undefined}
                      />
                    ))}
                  </View>
                )}
                <Text numberOfLines={1} style={styles.storesLabel}>
                  {`${product.cheapest_retailer_name || 'Supermarket'} · ${storeCount} ${
                    storeCount === 1 ? 'magazin' : 'magazine'
                  }`}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.noPriceRow}>
              <BeavyBadge label="Fără ofertă activă momentan" tone="outline" size="sm" />
            </View>
          )}
        </View>
      </Pressable>

      <View style={styles.actionCol}>
        {quantity === 0 ? (
          <Pressable
            onPress={() => {
              triggerHaptic('medium');
              onStepQuantity(product, 1);
            }}
            hitSlop={6}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Adaugă ${title} în listă`}
          >
            <SymbolView
              name="plus"
              tintColor={C.surface}
              size={16}
              fallback={<Text style={styles.addBtnFallback}>+</Text>}
            />
          </Pressable>
        ) : (
          <QuantityStepper
            quantity={quantity}
            variant="card"
            onDecrement={() => {
              triggerHaptic('selection');
              onStepQuantity(product, quantity - 1);
            }}
            onIncrement={() => {
              triggerHaptic('light');
              onStepQuantity(product, quantity + 1);
            }}
          />
        )}
      </View>
    </BeavySurface>
  );
});

type BeavyBasketProductRowProps = {
  entry: ItemComparisonStatus;
  isLast: boolean;
  onPressItem: (itemId: string) => void;
  onChangeQuantity: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
};

/**
 * Rând de produs unificat în Coș cu ecart de preț, fidelitate și stări explicite de stoc.
 */
export const BeavyBasketProductRow = React.memo(function BeavyBasketProductRow({
  entry,
  isLast,
  onPressItem,
  onChangeQuantity,
  onRemoveItem,
}: BeavyBasketProductRowProps) {
  const rawName = entry.canonicalName ?? entry.item.name;
  const displayName = cleanScraperProductName(rawName);
  const rawBrand = entry.canonicalBrand ?? entry.item.brand;
  const rawSize = entry.canonicalPackageSize ?? entry.item.packageSize;
  const displayBrand =
    rawBrand && !/(orice\s+(firm[aă]|brand)|produs\s+propriu|generic)/i.test(rawBrand.trim())
      ? rawBrand.trim()
      : null;
  const displaySize = cleanDisplayPackageSize(rawSize, displayName);
  const displayImageUrl = entry.canonicalImageUrl ?? entry.item.imageUrl;

  const spread =
    entry.lowestPrice !== null &&
    entry.highestPrice !== null &&
    entry.highestPrice > entry.lowestPrice
      ? roundDiff(entry.highestPrice - entry.lowestPrice)
      : 0;

  let statusLabel = 'Fără preț verificat · vezi echivalente';
  let tone: 'price' | 'equiv' | 'alert' = 'alert';

  if (entry.status === 'has_offers' && entry.lowestPrice !== null) {
    statusLabel =
      spread > 0 && entry.highestPrice !== null
        ? `${entry.lowestPrice.toFixed(2)} – ${entry.highestPrice.toFixed(2)} RON · dif. ${spread.toFixed(2)} RON`
        : `de la ${entry.lowestPrice.toFixed(2)} RON`;
    tone = 'price';
  } else if (entry.status === 'equivalent_only' && entry.lowestPrice !== null) {
    statusLabel = `Echivalent confirmat · de la ${entry.lowestPrice.toFixed(2)} RON`;
    tone = 'equiv';
  } else if (entry.status === 'unavailable') {
    statusLabel = 'Indisponibil în stoc · vezi echivalente';
    tone = 'alert';
  } else if (entry.status === 'manual_item') {
    statusLabel = 'Produs neasociat · alege din catalog';
    tone = 'alert';
  }

  const qtyUnitMeta =
    entry.item.quantity > 1
      ? displaySize
        ? `${entry.item.quantity} × ${displaySize}`
        : `${entry.item.quantity} buc.`
      : displaySize;

  const prefixMeta = [qtyUnitMeta, displayBrand].filter(Boolean).join(' · ');

  return (
    <View style={[styles.basketRow, isLast && styles.basketRowLast]}>
      <Pressable
        onPress={() => {
          triggerHaptic('selection');
          onPressItem(entry.item.id);
        }}
        style={({ pressed }) => [styles.basketMainPress, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Compară sau vezi echivalente pentru ${displayName}`}
      >
        <ProductImageBox
          imageUrl={displayImageUrl}
          productName={displayName}
          brand={displayBrand}
          categoryName={entry.canonicalCategoryName}
          variant="medium"
        />

        <View style={styles.basketInfo}>
          <Text numberOfLines={2} style={styles.basketName}>
            {displayName}
          </Text>

          <Text numberOfLines={2} style={styles.basketMeta}>
            {prefixMeta ? `${prefixMeta} · ` : ''}
            <Text
              style={
                tone === 'price'
                  ? styles.priceInline
                  : tone === 'equiv'
                    ? styles.equivInline
                    : styles.alertInline
              }
            >
              {statusLabel}
            </Text>
          </Text>

          <View style={styles.badgesWrap}>
            {entry.hasLoyaltyOffer ? (
              <BeavyBadge
                tone="positive"
                label={
                  entry.lowestLoyaltyPrice !== null
                    ? `Card ${entry.bestLoyaltyRetailerName ?? ''}: ${entry.lowestLoyaltyPrice.toFixed(2)} RON`
                    : `${entry.bestLoyaltyRetailerName ? `${entry.bestLoyaltyRetailerName}: ` : ''}${
                        entry.bestLoyaltyLabel || 'Reducere card'
                      }`
                }
              />
            ) : entry.hasRegularPromo && entry.bestRegularPromoLabel ? (
              <BeavyBadge tone="accent" label={`Ofertă: ${entry.bestRegularPromoLabel}`} />
            ) : null}
          </View>
        </View>
      </Pressable>

      <QuantityStepper
        quantity={entry.item.quantity}
        variant="paper"
        onDecrement={() => {
          triggerHaptic('selection');
          if (entry.item.quantity <= 1) {
            onRemoveItem(entry.item.id);
          } else {
            onChangeQuantity(entry.item.id, -1);
          }
        }}
        onIncrement={() => {
          triggerHaptic('light');
          onChangeQuantity(entry.item.id, 1);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  catalogRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
    paddingVertical: 9,
  },
  catalogRowLast: {
    borderBottomWidth: 0,
  },
  catalogMainPress: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  catalogInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  catalogTitle: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 13.5,
    lineHeight: 18,
    color: C.primary,
  },
  catalogMeta: {
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
    fontSize: 11.5,
    lineHeight: 15,
    color: C.muted,
  },
  catalogAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.grapefruit,
  },
  catalogAddFallback: {
    color: C.primary,
    fontFamily: BeavyFonts.medium,
    fontSize: 20,
    lineHeight: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  cardBodyPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  metaEyebrow: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  titleText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 19,
    color: C.primary,
  },
  priceBlock: {
    gap: 4,
    marginTop: 2,
  },
  priceHeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  minPriceText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 14,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  strikeText: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11.5,
    color: C.muted,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  storesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedLogoOverlap: {
    marginLeft: -5,
  },
  storesLabel: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 11.5,
    color: C.leekDark,
    flexShrink: 1,
  },
  noPriceRow: {
    marginTop: 2,
  },
  actionCol: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnFallback: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 20,
    color: C.surface,
    lineHeight: 22,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingVertical: 8,
  },
  compactDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  compactInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  compactTitle: {
    fontSize: 13.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactMeta: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
    color: C.muted,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  compactRetailers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  compactRetailersMore: {
    fontSize: 10,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.muted,
  },
  compactAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactAddText: {
    color: C.surface,
    fontSize: 17,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    lineHeight: 19,
  },
  basketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  basketRowLast: {
    borderBottomWidth: 0,
  },
  basketMainPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  basketInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  basketName: {
    fontSize: 13.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
    lineHeight: 18,
  },
  basketMeta: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
    color: C.muted,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  priceInline: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  equivInline: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.leekDark,
  },
  alertInline: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primarySoft,
  },
  badgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
  },
  gridCard: {
    flex: 1,
    padding: 10,
    gap: 8,
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  gridCardActive: {
    borderColor: C.leekDark,
  },
  gridPressTop: {
    gap: 8,
  },
  gridImageStage: {
    position: 'relative',
  },
  gridOverlayBadges: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    gap: 4,
  },
  gridBody: {
    gap: 4,
  },
  gridTitleText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13.5,
    lineHeight: 17.5,
    color: C.primary,
    minHeight: 35,
  },
  gridPriceStack: {
    gap: 2,
    marginTop: 2,
  },
  gridPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 5,
  },
  gridPriceText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 15.5,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  gridStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  gridNoPrice: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
    marginTop: 4,
  },
  gridActionFooter: {
    marginTop: 'auto',
  },
  gridAddBtn: {
    minHeight: 40,
    borderRadius: 99,
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
  },
  gridAddBtnFallback: {
    color: C.surface,
    fontSize: 15,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    lineHeight: 17,
  },
  gridAddBtnText: {
    color: C.surface,
    fontSize: 12.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  gridStepperWrap: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.leek,
    borderRadius: 99,
    paddingHorizontal: 6,
  },
  pressed: {
    opacity: 0.78,
  },
  unitEstimateLabel: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
});
