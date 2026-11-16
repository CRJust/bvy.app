import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProductImageBox } from '@/components/product-image-box';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import {
  type BasketComparisonResult,
  cleanDisplayPackageSize,
  cleanScraperProductName,
  type MatchedBasketItem,
} from '@/services/beavy-comparison';
import { deriveUnitPriceLabel, formatPriceLei } from '@/services/product-price-grid';

type BasketStoreMatrixProps = {
  comparison: BasketComparisonResult;
  onPressStore: (retailerId: string) => void;
  onPressItem: (itemId: string) => void;
};

const PRODUCT_COL_WIDTH = 158;
const STORE_COL_WIDTH = 122;

/**
 * Tabel / Grilă Comparativă Produs-cu-Produs pe Magazine (Basket vs. All Stores Matrix):
 * - Rândurile sunt produsele din lista activă;
 * - Coloanele sunt supermarketurile (Lidl, Kaufland, Carrefour, Auchan, Mega Image, Penny etc.);
 * - Evidențiază în verde (`leek`) unde este cel mai ieftin fiecare produs și totalul pe magazin.
 */
export function BasketStoreMatrix({
  comparison,
  onPressStore,
  onPressItem,
}: BasketStoreMatrixProps) {
  const stores = useMemo(
    () => comparison.retailerSummaries.filter((s) => s.coveredCount > 0),
    [comparison.retailerSummaries]
  );

  const items = comparison.itemStatuses;

  const matchByStoreAndItem = useMemo(() => {
    const map = new Map<string, Map<string, MatchedBasketItem>>();
    for (const s of stores) {
      const inner = new Map<string, MatchedBasketItem>();
      for (const m of s.matchedItems) {
        inner.set(m.item.id, m);
      }
      map.set(s.retailer.id, inner);
    }
    return map;
  }, [stores]);

  const minLineByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of items) {
      let min = Infinity;
      for (const s of stores) {
        const m = matchByStoreAndItem.get(s.retailer.id)?.get(entry.item.id);
        if (m && m.lineTotal < min) {
          min = m.lineTotal;
        }
      }
      if (Number.isFinite(min)) {
        map.set(entry.item.id, min);
      }
    }
    return map;
  }, [items, stores, matchByStoreAndItem]);

  if (stores.length === 0 || items.length === 0) return null;

  const cheapestStoreId =
    comparison.cheapestComparableRetailerId ?? stores[0]?.retailer.id ?? null;

  return (
    <BeavySurface variant="elevated" style={styles.card}>
      <View style={styles.headerBlock}>
        <View style={styles.headerTopRow}>
          <Text style={styles.overline}>MATRICE COMPARATIVĂ PRODUS × MAGAZIN</Text>
          <View style={styles.legendPill}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Cel mai ieftin pe rând</Text>
          </View>
        </View>
        <Text style={styles.title}>
          {`Comparație linie cu linie în ${stores.length} ${
            stores.length === 1 ? 'magazin' : 'magazine'
          }`}
        </Text>
      </View>

      <View style={styles.tableContainer}>
        {/* Coloana stângă fixă: Produs */}
        <View style={styles.leftFixedCol}>
          <View style={[styles.cornerCell, styles.headerHeight]}>
            <Text style={styles.cornerLabel}>Produs din listă</Text>
            <Text style={styles.cornerSub}>{`${items.length} rânduri`}</Text>
          </View>

          {items.map((entry) => {
            const displayTitle = cleanScraperProductName(
              entry.canonicalName ?? entry.item.name
            );
            const cleanSize = cleanDisplayPackageSize(
              entry.canonicalPackageSize ?? entry.item.packageSize,
              displayTitle
            );
            return (
              <Pressable
                key={entry.item.id}
                onPress={() => {
                  triggerHaptic('selection');
                  onPressItem(entry.item.id);
                }}
                style={({ pressed }) => [
                  styles.productCell,
                  styles.rowHeight,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Detalii și grilă completă pentru ${displayTitle}`}
              >
                <ProductImageBox
                  imageUrl={entry.canonicalImageUrl ?? entry.item.imageUrl}
                  productName={displayTitle}
                  brand={entry.canonicalBrand ?? entry.item.brand}
                  variant="thumb"
                />
                <View style={styles.productTextCol}>
                  <Text numberOfLines={2} style={styles.productTitle}>
                    {displayTitle}
                  </Text>
                  <Text numberOfLines={1} style={styles.productMeta}>
                    {`${entry.item.quantity}×${cleanSize ? ` · ${cleanSize}` : ''}`}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          <View style={[styles.footerProductCell, styles.footerHeight]}>
            <Text style={styles.footerProductLabel}>Total coș</Text>
            <Text style={styles.footerProductSub}>cu taxe / reduceri</Text>
          </View>
        </View>

        {/* Coloanele orizontale derulabile: Magazinele */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storesScrollContent}
        >
          {stores.map((summary) => {
            const storeId = summary.retailer.id;
            const isBestStore = storeId === cheapestStoreId;
            const storeMap = matchByStoreAndItem.get(storeId);

            return (
              <View
                key={storeId}
                style={[styles.storeCol, isBestStore && styles.storeColBest]}
              >
                {/* Antet magazin */}
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    onPressStore(storeId);
                  }}
                  style={({ pressed }) => [
                    styles.storeHeaderCell,
                    styles.headerHeight,
                    isBestStore && styles.storeHeaderCellBest,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Vezi bonul complet pentru ${summary.retailer.name}`}
                >
                  <View style={styles.storeHeaderTop}>
                    <RetailerLogo
                      retailerName={summary.retailer.name}
                      slug={summary.retailer.slug}
                      logoUrl={summary.retailer.logo_url}
                      size={20}
                      shape="circle"
                    />
                    <Text numberOfLines={1} style={styles.storeHeaderName}>
                      {summary.retailer.name}
                    </Text>
                  </View>
                  <Text style={styles.storeHeaderTotal}>
                    {formatPriceLei(summary.estimatedTotalWithFees)}
                  </Text>
                  <Text style={styles.storeHeaderCoverage}>
                    {`${summary.coveredCount}/${summary.totalItemsCount} găsite`}
                  </Text>
                </Pressable>

                {/* Celulele pe fiecare produs */}
                {items.map((entry) => {
                  const match = storeMap?.get(entry.item.id);
                  const minLine = minLineByItemId.get(entry.item.id);
                  const isRowCheapest =
                    Boolean(match) &&
                    minLine !== undefined &&
                    Math.abs(match!.lineTotal - minLine) < 0.015;

                  if (!match) {
                    return (
                      <View
                        key={`${storeId}-${entry.item.id}`}
                        style={[styles.valueCell, styles.rowHeight]}
                      >
                        <Text style={styles.missingDash}>—</Text>
                        <Text style={styles.missingSub}>Lipsă</Text>
                      </View>
                    );
                  }

                  const unitLabel = deriveUnitPriceLabel(
                    match.offer.price,
                    match.offer.normalized_unit_price ?? match.offer.unit_price,
                    match.offer.normalized_unit_label,
                    match.equivalentPackageSize ?? match.offer.package_size ?? entry.item.packageSize,
                    match.equivalentProductName ?? entry.canonicalName ?? entry.item.name
                  );

                  const isAlt =
                    Boolean(match.isBudgetSwap) || match.matchType === 'equivalent';

                  return (
                    <Pressable
                      key={`${storeId}-${entry.item.id}`}
                      onPress={() => {
                        triggerHaptic('selection');
                        onPressItem(entry.item.id);
                      }}
                      style={({ pressed }) => [
                        styles.valueCell,
                        styles.rowHeight,
                        isRowCheapest && styles.valueCellCheapest,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${entry.item.name} la ${summary.retailer.name}: ${formatPriceLei(
                        match.lineTotal
                      )}${isRowCheapest ? ', cel mai ieftin' : ''}`}
                    >
                      <Text
                        style={[
                          styles.cellPrice,
                          isRowCheapest && styles.cellPriceCheapest,
                        ]}
                      >
                        {formatPriceLei(match.lineTotal)}
                      </Text>

                      {unitLabel ? (
                        <Text numberOfLines={1} style={styles.cellUnit}>
                          {unitLabel}
                        </Text>
                      ) : match.item.quantity > 1 ? (
                        <Text numberOfLines={1} style={styles.cellUnit}>
                          {`${match.item.quantity} × ${match.offer.price.toFixed(2)}`}
                        </Text>
                      ) : null}

                      <View style={styles.cellBadgeWrap}>
                        {isRowCheapest ? (
                          <View style={styles.cheapestBadge}>
                            <Text style={styles.cheapestBadgeText}>Cel mai ieftin</Text>
                          </View>
                        ) : isAlt ? (
                          <View style={styles.altBadge}>
                            <Text numberOfLines={1} style={styles.altBadgeText}>
                              {match.isBudgetSwap
                                ? match.equivalentBrand || 'Marcă proprie'
                                : 'Alternativă'}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.exactHint}>Exact</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}

                {/* Footer Total Magazin */}
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    onPressStore(storeId);
                  }}
                  style={[
                    styles.footerStoreCell,
                    styles.footerHeight,
                    isBestStore && styles.footerStoreCellBest,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={styles.footerStoreTotal}>
                    {formatPriceLei(summary.estimatedTotalWithFees)}
                  </Text>
                  <Text style={styles.footerStoreCta}>
                    {isBestStore ? '★ Câștigător' : 'Vezi bonul ›'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </BeavySurface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.rule,
  },
  headerBlock: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overline: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.7,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.leek,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BeavyRadius.pill,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.leekDark,
  },
  legendText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.primary,
  },
  title: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 16,
    color: C.primary,
    letterSpacing: -0.3,
  },
  tableContainer: {
    flexDirection: 'row',
  },
  leftFixedCol: {
    width: PRODUCT_COL_WIDTH,
    borderRightWidth: 1,
    borderRightColor: C.rule,
    backgroundColor: C.buttermilk,
  },
  headerHeight: {
    height: 68,
  },
  rowHeight: {
    height: 76,
  },
  footerHeight: {
    height: 54,
  },
  cornerCell: {
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  cornerLabel: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 11.5,
    color: C.primary,
  },
  cornerSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 10.5,
    color: C.muted,
  },
  productCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  productTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  productTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    lineHeight: 15,
    color: C.primary,
  },
  productMeta: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 10.5,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  footerProductCell: {
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: C.sand,
  },
  footerProductLabel: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 12,
    color: C.primary,
  },
  footerProductSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 10,
    color: C.muted,
  },
  storesScrollContent: {
    flexDirection: 'row',
  },
  storeCol: {
    width: STORE_COL_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: C.rule,
    backgroundColor: C.surface,
  },
  storeColBest: {
    backgroundColor: 'rgba(219, 227, 198, 0.16)',
  },
  storeHeaderCell: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    gap: 2,
  },
  storeHeaderCellBest: {
    backgroundColor: C.leek,
  },
  storeHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  storeHeaderName: {
    flex: 1,
    fontFamily: BeavyFonts.bold,
    fontSize: 11.5,
    color: C.primary,
  },
  storeHeaderTotal: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  storeHeaderCoverage: {
    fontFamily: BeavyFonts.medium,
    fontSize: 10,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  valueCell: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
    gap: 2,
  },
  valueCellCheapest: {
    backgroundColor: C.leek,
  },
  cellPrice: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13.5,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  cellPriceCheapest: {
    color: C.primary,
  },
  cellUnit: {
    fontFamily: BeavyFonts.medium,
    fontSize: 10,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  cellBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  cheapestBadge: {
    backgroundColor: C.surface,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BeavyRadius.pill,
    borderWidth: 1,
    borderColor: C.leekDark,
  },
  cheapestBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 9.5,
    color: C.leekDark,
  },
  altBadge: {
    backgroundColor: C.sand,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BeavyRadius.pill,
    maxWidth: STORE_COL_WIDTH - 16,
  },
  altBadgeText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 9.5,
    color: C.primary,
  },
  exactHint: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 9.5,
    color: C.leekDark,
  },
  missingDash: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.muted,
  },
  missingSub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 10,
    color: C.muted,
  },
  footerStoreCell: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: C.buttermilk,
    gap: 1,
  },
  footerStoreCellBest: {
    backgroundColor: C.leek,
  },
  footerStoreTotal: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  footerStoreCta: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10,
    color: C.leekDark,
  },
  pressed: {
    opacity: 0.78,
  },
});
