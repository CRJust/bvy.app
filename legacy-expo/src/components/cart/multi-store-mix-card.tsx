import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getRetailerBrandStyle } from '@/components/cart/retailer-brand';
import { BeavyBadge } from '@/components/ui/beavy-badge';
import { BeavyCategoryBar } from '@/components/ui/beavy-category-bar';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import {
  type BasketItemInput,
  type BasketVariantMode,
  type MultiStoreMixPlan,
  resolveLoyaltyProgramName,
} from '@/services/beavy-comparison';

type MultiStoreMixCardProps = {
  mix: MultiStoreMixPlan;
  variantMode?: BasketVariantMode;
  onOpenStopChecklist: (retailerName: string, itemIds: string[]) => void;
  onInspectItem: (item: BasketItemInput) => void;
  onApplyMixBudgetSwaps?: () => void;
};

/**
 * Card compact și scanabil pentru mixul optim între 2–4 magazine active („Best Price Mix”).
 * Afișează proporția pe opriri, totalul cu taxe incluse și checklist dedicat per magazin,
 * cu listă de produse extensibilă la cerere.
 */
export function MultiStoreMixCard({
  mix,
  variantMode = 'standard',
  onOpenStopChecklist,
  onInspectItem,
  onApplyMixBudgetSwaps,
}: MultiStoreMixCardProps) {
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const isBudgetMode = variantMode === 'private_label_budget';

  return (
    <BeavySurface variant="elevated" style={styles.card}>
      {/* Antet compact */}
      <View style={styles.topRow}>
        <View style={styles.overlineGroup}>
          <View style={styles.statusDot} />
          <Text style={styles.overline}>
            {isBudgetMode
              ? `Mix ${mix.stops.length} magazine · Opțiune Budget`
              : `Mix ${mix.stops.length} magazine`}
          </Text>
        </View>

        <View style={styles.stopChipsWrap}>
          {mix.stops.map((stop) => {
            const brand = getRetailerBrandStyle(stop.retailer.name, stop.retailer.slug);
            return (
              <View
                key={stop.retailer.id}
                style={[styles.miniBrandChip, { backgroundColor: brand.softTint }]}
              >
                <RetailerLogo
                  retailerName={stop.retailer.name}
                  slug={stop.retailer.slug}
                  logoUrl={stop.retailer.logo_url}
                  size={16}
                  shape="circle"
                />
                <Text style={[styles.miniBrandText, { color: brand.textColor }]}>
                  {brand.shortName}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Preț total mix + badge economie */}
      <View style={styles.priceRow}>
        <Text style={styles.totalAmount}>{mix.totalWithFees.toFixed(2)} RON</Text>

        {!mix.improvesCoverage && mix.savingsVsBestSingleStore > 0 ? (
          <BeavyBadge
            tone="positive"
            size="md"
            label={`-${mix.savingsVsBestSingleStore.toFixed(2)} RON (${mix.savingsPercentVsBestSingleStore}%) vs ${mix.bestSingleStoreName}`}
          />
        ) : mix.improvesCoverage ? (
          <BeavyBadge
            tone="positive"
            size="md"
            label={`Acoperire ${mix.coveredItemsCount}/${mix.catalogItemsCount}`}
          />
        ) : null}

        {mix.potentialLoyaltySavings > 0 && (
          <BeavyBadge
            tone="positive"
            size="sm"
            label={
              mix.appliedLoyaltyCards
                ? `Card fidelitate: -${mix.potentialLoyaltySavings.toFixed(2)} RON inclus`
                : `Cu carduri: -${mix.potentialLoyaltySavings.toFixed(2)} RON`
            }
          />
        )}
      </View>

      <BeavyCategoryBar
        height={6}
        segments={mix.stops.map((stop) => {
          const brand = getRetailerBrandStyle(stop.retailer.name, stop.retailer.slug);
          const pct =
            mix.totalWithFees > 0
              ? Math.round((stop.totalWithFees / mix.totalWithFees) * 100)
              : 0;
          return {
            key: stop.retailer.id,
            label: `${brand.shortName} ${pct}%`,
            value: stop.totalWithFees,
            color: brand.barColor,
          };
        })}
      />

      {/* Sumar opriri scanabile cu checklist 1-tap */}
      <View style={styles.stopsContainer}>
        {mix.stops.map((stop, stopIdx) => {
          const brand = getRetailerBrandStyle(stop.retailer.name, stop.retailer.slug);
          const isOnlineOnly =
            !stop.retailer.supports_physical && stop.retailer.supports_delivery;
          const stopItemIds = stop.items.map((m) => m.item.id);
          const shortCta = isOnlineOnly ? 'Comandă' : 'Checklist';

          return (
            <View
              key={stop.retailer.id}
              style={[styles.stopSection, stopIdx > 0 && styles.stopDivider]}
            >
              <View style={styles.stopSummaryRow}>
                <View style={styles.stopTitleGroup}>
                  <View style={styles.stopLogoWrap}>
                    <RetailerLogo
                      retailerName={stop.retailer.name}
                      slug={stop.retailer.slug}
                      logoUrl={stop.retailer.logo_url}
                      size={32}
                      shape="rounded"
                    />
                    <View style={[styles.stopIndexBadge, { backgroundColor: brand.barColor }]}>
                      <Text style={styles.stopIndexText}>{stopIdx + 1}</Text>
                    </View>
                  </View>
                  <View style={styles.stopNameCol}>
                    <Text numberOfLines={1} style={styles.stopRetailerName}>
                      {stop.retailer.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.stopMetaCaption}>
                      {stop.estimatedFeesTotal > 0
                        ? `${stop.itemsCount} prod · +${stop.estimatedFeesTotal.toFixed(2)} RON livrare`
                        : `${stop.itemsCount} ${stop.itemsCount === 1 ? 'produs' : 'produse'} · ${stop.totalWithFees.toFixed(2)} RON`}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => {
                    triggerHaptic('medium');
                    onOpenStopChecklist(stop.retailer.name, stopItemIds);
                  }}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.compactStopCta,
                    { backgroundColor: brand.softTint },
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${shortCta} ${stop.retailer.name}`}
                >
                  <SymbolView
                    name={isOnlineOnly ? 'bag.fill' : 'checklist'}
                    tintColor={brand.textColor}
                    size={12}
                    fallback={
                      <Text style={[styles.stopActionGlyph, { color: brand.textColor }]}>
                        →
                      </Text>
                    }
                  />
                  <Text style={[styles.compactStopCtaText, { color: brand.textColor }]}>
                    {shortCta}
                  </Text>
                </Pressable>
              </View>

              {itemsExpanded && (
                <View style={styles.stopItemsList}>
                  {stop.items.map((mItem) => {
                    const displayName =
                      mItem.isBudgetSwap && mItem.equivalentProductName
                        ? mItem.equivalentProductName
                        : mItem.item.name;
                    const unitSize = mItem.isBudgetSwap
                      ? (mItem.equivalentPackageSize ?? mItem.item.packageSize)
                      : mItem.item.packageSize;

                    return (
                      <Pressable
                        key={`${stop.retailer.id}:${mItem.item.id}`}
                        onPress={() => {
                          triggerHaptic('selection');
                          onInspectItem(mItem.item);
                        }}
                        style={({ pressed }) => [
                          styles.itemRow,
                          pressed && styles.itemRowPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${displayName}, ${mItem.lineTotal.toFixed(2)} RON`}
                      >
                        <View style={styles.itemLeft}>
                          <View style={styles.itemNameRow}>
                            <Text numberOfLines={2} style={styles.itemName}>
                              {displayName}
                            </Text>
                            {mItem.item.quantity > 1 && (
                              <Text style={styles.qtyBadge}>{`x${mItem.item.quantity}`}</Text>
                            )}
                          </View>

                          <View style={styles.itemBadgesRow}>
                            {mItem.isBudgetSwap && (
                              <BeavyBadge
                                tone="positive"
                                size="sm"
                                label={
                                  mItem.budgetSavingsLine && mItem.budgetSavingsLine > 0
                                    ? `Alternativă buget · -${mItem.budgetSavingsLine.toFixed(2)} RON`
                                    : 'Alternativă buget'
                                }
                              />
                            )}
                            {!mItem.isBudgetSwap && mItem.matchType === 'equivalent' && (
                              <BeavyBadge tone="neutral" size="sm" label="Echivalent" />
                            )}
                            {unitSize ? <Text style={styles.unitCaption}>{unitSize}</Text> : null}
                          </View>
                        </View>

                        <View style={styles.itemPriceCol}>
                          {Boolean(mix.appliedLoyaltyCards) &&
                            mItem.hasLoyaltyOffer &&
                            mItem.standardLineTotal !== undefined &&
                            mItem.standardLineTotal > mItem.lineTotal && (
                              <Text style={styles.itemStrikePrice}>
                                {`${mItem.standardLineTotal.toFixed(2)} RON`}
                              </Text>
                            )}
                          <Text style={styles.itemPrice}>{mItem.lineTotal.toFixed(2)} RON</Text>
                          {mItem.hasLoyaltyOffer && (
                            <Text style={styles.itemLoyaltyPrice}>
                              {mItem.loyaltyLineTotal !== null
                                ? `${resolveLoyaltyProgramName(stop.retailer.name, mItem.offer.promo_label)}: -${mItem.loyaltySavings.toFixed(2)} RON`
                                : mItem.offer.promo_label
                                  ? `${resolveLoyaltyProgramName(stop.retailer.name, mItem.offer.promo_label)}: ${mItem.offer.promo_label}`
                                  : resolveLoyaltyProgramName(stop.retailer.name, mItem.offer.promo_label)}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Buton extindere detalii produse & aplicare marcă proprie */}
      <View style={styles.footerControls}>
        {isBudgetMode && mix.budgetSwapCount > 0 && onApplyMixBudgetSwaps && (
          <Pressable
            onPress={() => {
              triggerHaptic('medium');
              onApplyMixBudgetSwaps();
            }}
            hitSlop={4}
            style={({ pressed }) => [styles.applyBudgetBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Aplică cele ${mix.budgetSwapCount} alternative de buget din mix pe listă`}
          >
            <Text style={styles.applyBudgetBtnText}>
              {mix.budgetSwapCount === 1
                ? 'Înlocuiește cu alternativa mai economică din mix'
                : `Înlocuiește cu cele ${mix.budgetSwapCount} alternative mai economice din mix`}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            setItemsExpanded((v) => !v);
          }}
          hitSlop={6}
          style={({ pressed }) => [styles.expandToggleBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityState={{ expanded: itemsExpanded }}
        >
          <Text style={styles.expandToggleText}>
            {itemsExpanded
              ? 'Ascunde produsele din mix ▴'
              : `Vezi cele ${mix.coveredItemsCount} produse împărțite pe opriri ▾`}
          </Text>
        </Pressable>
      </View>
    </BeavySurface>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 12,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  overlineGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.leekDark,
  },
  overline: {
    fontSize: 11,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: C.leekDark,
  },
  stopChipsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  miniBrandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 3,
    borderRadius: BeavyRadius.pill,
  },
  miniBrandText: {
    fontSize: 11,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  totalAmount: {
    fontSize: 26,
    lineHeight: 30,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.7,
    fontVariant: ['tabular-nums'],
  },
  stopsContainer: {
    marginTop: 2,
  },
  stopSection: {
    paddingVertical: 8,
    gap: 6,
  },
  stopDivider: {
    borderTopWidth: 1,
    borderTopColor: C.rule,
  },
  stopSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  stopTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  stopLogoWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  stopIndexBadge: {
    position: 'absolute',
    bottom: -3,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIndexText: {
    fontSize: 9.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.surface,
    fontVariant: ['tabular-nums'],
  },
  stopNameCol: {
    flex: 1,
    minWidth: 0,
  },
  stopRetailerName: {
    fontSize: 14,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  stopMetaCaption: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  stopLoyaltyHint: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.leekDark,
    fontVariant: ['tabular-nums'],
  },
  compactStopCta: {
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: BeavyRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  stopActionGlyph: {
    fontSize: 12,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  compactStopCtaText: {
    fontSize: 12,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  stopItemsList: {
    paddingLeft: 31,
    gap: 2,
  },
  itemRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: BeavyRadius.sm,
  },
  itemRowPressed: {
    backgroundColor: C.background,
  },
  itemLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.primary,
    lineHeight: 17,
  },
  qtyBadge: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  itemBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  unitCaption: {
    fontSize: 11,
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
    color: C.muted,
  },
  itemPriceCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  itemStrikePrice: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  itemPrice: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  itemLoyaltyPrice: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.leekDark,
    fontVariant: ['tabular-nums'],
  },
  footerControls: {
    gap: 8,
    marginTop: 2,
  },
  applyBudgetBtn: {
    minHeight: 44,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.leek,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  applyBudgetBtnText: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.leekDark,
  },
  expandToggleBtn: {
    minHeight: 40,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  expandToggleText: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  pressed: {
    opacity: 0.78,
  },
});
