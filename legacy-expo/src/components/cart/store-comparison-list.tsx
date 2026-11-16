import { SymbolView } from 'expo-symbols';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import {
  openExternalStoreUrl,
  type TrackedOutboundClickPayload,
} from '@/lib/open-external-store';
import type {
  BasketComparisonInsights,
  BasketComparisonResult,
} from '@/services/beavy-comparison';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

type StoreComparisonListProps = {
  comparison: BasketComparisonResult;
  insights: BasketComparisonInsights;
  listName?: string;
  channelMode?: 'physical' | 'online' | 'all';
  onPressBreakdown: (retailerId: string) => void;
  onOpenStoreMode: (retailerName: string) => void;
  onTrackOutboundClick?: (payload: TrackedOutboundClickPayload) => void;
};

/**
 * Listă curată per magazin pentru compararea rapidă a ofertelor.
 * În loc să repete butonul de „Checklist fizic” pe fiecare rând, interfața
 * permite selectarea magazinului dorit și oferă un panou dedicat de acțiune
 * la baza listei.
 */
export const StoreComparisonList = React.memo(function StoreComparisonList({
  comparison,
  insights,
  listName,
  channelMode,
  onPressBreakdown,
  onOpenStoreMode,
  onTrackOutboundClick,
}: StoreComparisonListProps) {
  const defaultSelectedId = useMemo(() => {
    return (
      insights.bestStore?.retailer.id ??
      comparison.retailerSummaries[0]?.retailer.id ??
      null
    );
  }, [insights.bestStore, comparison.retailerSummaries]);

  const [selectedRetailerId, setSelectedRetailerId] = useState<string | null>(
    defaultSelectedId
  );

  const activeSelectedId =
    selectedRetailerId &&
    comparison.retailerSummaries.some((s) => s.retailer.id === selectedRetailerId)
      ? selectedRetailerId
      : defaultSelectedId;

  const selectedSummary =
    comparison.retailerSummaries.find((s) => s.retailer.id === activeSelectedId) ??
    comparison.retailerSummaries[0] ??
    null;

  const isSelectedOnlineOnly =
    selectedSummary &&
    !selectedSummary.retailer.supports_physical &&
    selectedSummary.retailer.supports_delivery;

  const isSelectedBest =
    Boolean(insights.bestStore) &&
    selectedSummary &&
    insights.bestStore?.retailer.id === selectedSummary.retailer.id;

  const selectedModeLabel = selectedSummary
    ? isSelectedOnlineOnly
      ? 'Comandă online'
      : 'Checklist fizic'
    : 'Checklist';

  return (
    <BeavySurface variant="elevated" style={styles.listCard}>
      {/* Rândurile fiecărui magazin (curate, fără butoane redundante) */}
      <View style={styles.rowsContainer}>
        {comparison.retailerSummaries.map((summary, idx) => {
          const isLast = idx === comparison.retailerSummaries.length - 1;
          const isBest =
            Boolean(insights.bestStore) &&
            insights.bestStore?.retailer.id === summary.retailer.id &&
            summary.coveredCount > 0;
          const isSelected = summary.retailer.id === activeSelectedId;
          const hasRelevantData =
            summary.coveredCount > 0 || summary.unavailableItems.length > 0;

          const diffFromBest =
            insights.bestStore &&
            summary.hasFullCatalogCoverage &&
            insights.bestStore.hasFullCatalogCoverage &&
            summary.retailer.id !== insights.bestStore.retailer.id
              ? roundMoney(
                  summary.estimatedTotalWithFees -
                    insights.bestStore.estimatedTotalWithFees
                )
              : 0;

          const missingCount = Math.max(0, summary.totalItemsCount - summary.coveredCount);
          const coverageLabel =
            summary.coveredCount === 0
              ? 'Fără oferte'
              : summary.equivalentCoveredCount > 0
                ? `${summary.exactCoveredCount}/${summary.totalItemsCount} exacte · ${summary.equivalentCoveredCount} alt.`
                : missingCount > 0
                  ? `${summary.coveredCount}/${summary.totalItemsCount} găsite · ${missingCount} lipsă`
                  : `✓ ${summary.totalItemsCount}/${summary.totalItemsCount} exacte`;

          const metaParts = [
            summary.channelLabel,
            coverageLabel,
          ].filter(Boolean);

          return (
            <Pressable
              key={summary.retailer.id}
              disabled={!hasRelevantData}
              onPress={() => {
                if (!hasRelevantData) return;
                triggerHaptic('selection');
                if (isSelected) {
                  onPressBreakdown(summary.retailer.id);
                } else {
                  setSelectedRetailerId(summary.retailer.id);
                }
              }}
              style={({ pressed }) => [
                styles.storeRow,
                isSelected && (isBest ? styles.storeRowSelectedBest : styles.storeRowSelected),
                !isSelected && !isLast && styles.storeRowDivider,
                pressed && hasRelevantData && styles.pressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{
                selected: isSelected,
                disabled: !hasRelevantData,
              }}
              accessibilityLabel={`${summary.retailer.name}, ${
                summary.coveredCount > 0
                  ? `${summary.estimatedTotalWithFees.toFixed(2)} RON`
                  : 'fără preț'
              }${isSelected ? ', selectat ca destinație' : ''}`}
            >
              {/* Indicator tactil de selecție destinație */}
              <View style={styles.selectionIndicatorCol}>
                <SymbolView
                  name={isSelected ? 'checkmark.circle.fill' : 'circle'}
                  tintColor={isSelected ? (isBest ? C.leekDark : C.primary) : C.rule}
                  size={19}
                  fallback={
                    <Text
                      style={[
                        styles.radioFallback,
                        isSelected && (isBest ? styles.radioFallbackBest : styles.radioFallbackActive),
                      ]}
                    >
                      {isSelected ? '●' : '○'}
                    </Text>
                  }
                />
              </View>

              <RetailerLogo
                retailerName={summary.retailer.name}
                slug={summary.retailer.slug}
                logoUrl={summary.retailer.logo_url}
                size={38}
                shape="rounded"
              />

              <View style={styles.textCol}>
                <View style={styles.titleRow}>
                  <Text numberOfLines={1} style={styles.storeName}>
                    {summary.retailer.name}
                  </Text>
                  {isBest ? (
                    <View style={styles.bestBadge}>
                      <Text style={styles.bestBadgeText}>Optim</Text>
                    </View>
                  ) : diffFromBest > 0 ? (
                    <Text style={styles.diffText}>
                      {`+${diffFromBest.toFixed(2)} RON`}
                    </Text>
                  ) : null}
                </View>

                <Text numberOfLines={1} style={styles.metaText}>
                  {metaParts.join(' · ')}
                </Text>

                {summary.loyaltyOfferCount > 0 && summary.loyaltyProgramName && (() => {
                  const firstConditionalLabel =
                    summary.matchedItems.find(
                      (m) => m.hasLoyaltyOffer && m.loyaltySavings === 0 && m.offer.promo_label
                    )?.offer.promo_label ?? null;
                  const isApplied =
                    Boolean(summary.appliedLoyaltyCards) &&
                    summary.potentialLoyaltySavings > 0;
                  return (
                    <View
                      style={[
                        styles.loyaltyBadge,
                        isApplied && styles.loyaltyBadgeApplied,
                      ]}
                    >
                      <SymbolView
                        name="creditcard.fill"
                        tintColor={isApplied ? C.leekDark : C.primary}
                        size={10}
                        fallback={
                          <Text
                            style={[
                              styles.fallbackGlyph,
                              isApplied && { color: C.leekDark },
                            ]}
                          >
                            ◈
                          </Text>
                        }
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.loyaltyBadgeText,
                          isApplied && styles.loyaltyBadgeTextApplied,
                        ]}
                      >
                        {summary.potentialLoyaltySavings > 0
                          ? `${summary.loyaltyProgramName}: -${summary.potentialLoyaltySavings.toFixed(2)} RON`
                          : firstConditionalLabel
                            ? `${summary.loyaltyProgramName}: ${firstConditionalLabel}`
                            : `${summary.loyaltyProgramName}: ${summary.loyaltyOfferCount} ${
                                summary.loyaltyOfferCount === 1
                                  ? 'ofertă card'
                                  : 'oferte card'
                              }`}
                      </Text>
                    </View>
                  );
                })()}
              </View>

              <View style={styles.priceCol}>
                {Boolean(summary.appliedLoyaltyCards) &&
                  summary.potentialLoyaltySavings > 0 &&
                  summary.standardSubtotalWithoutLoyalty !== undefined && (
                    <Text style={styles.standardStrikeText}>
                      {`${(summary.standardSubtotalWithoutLoyalty + summary.estimatedFeesTotal).toFixed(2)} RON`}
                    </Text>
                  )}
                <Text
                  style={[
                    styles.priceText,
                    summary.coveredCount === 0 && styles.priceUnavailableText,
                  ]}
                >
                  {summary.coveredCount > 0
                    ? `${summary.estimatedTotalWithFees.toFixed(2)} RON`
                    : 'Fără preț'}
                </Text>

                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    if (!hasRelevantData) return;
                    triggerHaptic('selection');
                    onPressBreakdown(summary.retailer.id);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 12, right: 6 }}
                  style={({ pressed }) => [styles.detailsHit, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Vezi detalii coș pentru ${summary.retailer.name}`}
                >
                  <Text style={styles.breakdownHint}>
                    {!hasRelevantData
                      ? 'Lipsă oferte'
                      : summary.estimatedFeesTotal > 0
                        ? '+ taxe · Detalii ›'
                        : 'Detalii ›'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Panou unic de acțiune pentru magazinul selectat */}
      {selectedSummary && (
        <View style={styles.actionPanel}>
          <View style={styles.actionPanelDivider} />

          <View style={styles.actionPanelHeader}>
            <View style={styles.actionPanelHeaderLeft}>
              <View style={styles.actionPanelStoreRow}>
                <RetailerLogo
                  retailerName={selectedSummary.retailer.name}
                  slug={selectedSummary.retailer.slug}
                  logoUrl={selectedSummary.retailer.logo_url}
                  size={20}
                  shape="circle"
                />
                <Text numberOfLines={1} style={styles.actionPanelStoreName}>
                  {selectedSummary.retailer.name}
                </Text>
                {isSelectedBest && (
                  <View style={styles.bestBadge}>
                    <Text style={styles.bestBadgeText}>Optim</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.actionPanelHeaderRight}>
              <Text style={styles.actionPanelTotalLabel}>Total estimat</Text>
              <Text style={styles.actionPanelTotalValue}>
                {selectedSummary.coveredCount > 0
                  ? `${selectedSummary.estimatedTotalWithFees.toFixed(2)} RON`
                  : '—'}
              </Text>
            </View>
          </View>

          {/* Butonul primar de checklist fizic / comandă */}
          <Pressable
            onPress={() => {
              triggerHaptic('medium');
              onOpenStoreMode(selectedSummary.retailer.name);
            }}
            disabled={selectedSummary.coveredCount === 0}
            style={({ pressed }) => [
              styles.primaryCtaBtn,
              selectedSummary.coveredCount === 0 && styles.primaryCtaBtnDisabled,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${selectedModeLabel} pentru ${selectedSummary.retailer.name}`}
          >
            <SymbolView
              name={isSelectedOnlineOnly ? 'bag.fill' : 'checklist'}
              tintColor={C.surface}
              size={16}
              fallback={<Text style={styles.primaryCtaFallbackGlyph}>→</Text>}
            />
            <Text style={styles.primaryCtaBtnText}>
              {isSelectedOnlineOnly
                ? `Comandă · ${selectedSummary.retailer.name}`
                : `Checklist · ${selectedSummary.retailer.name}`}
            </Text>
          </Pressable>

          {/* Acțiuni secundare discrete: defalcare produse & link magazin online */}
          <View style={styles.actionPanelSecondaryRow}>
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onPressBreakdown(selectedSummary.retailer.id);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => [
                styles.actionPanelSecondaryBtn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Vezi defalcarea produselor pentru ${selectedSummary.retailer.name}`}
            >
              <SymbolView
                name="list.bullet.rectangle"
                tintColor={C.primary}
                size={12}
                fallback={<Text style={styles.linkFallbackGlyph}>›</Text>}
              />
              <Text style={styles.actionPanelSecondaryText}>
                Defalcare ›
              </Text>
            </Pressable>

            {!!selectedSummary.retailer.website_url && (
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  void openExternalStoreUrl(
                    selectedSummary.retailer.website_url,
                    {
                      retailerName: selectedSummary.retailer.name,
                      retailerSlug: selectedSummary.retailer.slug,
                      source: 'comparison_list',
                      channelMode:
                        channelMode ??
                        (isSelectedOnlineOnly ? 'online' : 'physical'),
                      listName,
                      itemsCount: selectedSummary.coveredCount,
                      estimatedValueRon:
                        selectedSummary.coveredCount > 0
                          ? selectedSummary.estimatedTotalWithFees
                          : null,
                    },
                    onTrackOutboundClick
                  );
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => [
                  styles.actionPanelSecondaryBtn,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="link"
                accessibilityLabel={`Deschide site-ul ${selectedSummary.retailer.name}`}
              >
                <Text style={styles.actionPanelSecondaryText}>
                  {isSelectedOnlineOnly ? 'Deschide site ↗' : 'Vezi pe site ↗'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </BeavySurface>
  );
});

const styles = StyleSheet.create({
  listCard: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
  },
  rowsContainer: {
    gap: 3,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: BeavyRadius.md,
    gap: 10,
    minHeight: 52,
  },
  storeRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  storeRowSelected: {
    backgroundColor: 'rgba(252, 226, 219, 0.42)', // Grapefruit tint
  },
  storeRowSelectedBest: {
    backgroundColor: 'rgba(219, 227, 198, 0.38)', // Leek tint
  },
  selectionIndicatorCol: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioFallback: {
    fontSize: 16,
    color: C.rule,
    fontFamily: BeavyFonts.bold,
  },
  radioFallbackActive: {
    color: C.primary,
  },
  radioFallbackBest: {
    color: C.leekDark,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  storeName: {
    fontSize: 14.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.2,
  },
  bestBadge: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bestBadgeText: {
    fontSize: 9.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.leekDark,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  diffText: {
    fontSize: 11,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  metaText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
    lineHeight: 15,
  },
  loyaltyBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    backgroundColor: 'rgba(247, 141, 121, 0.22)',
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: '100%',
  },
  loyaltyBadgeApplied: {
    backgroundColor: C.leek,
  },
  loyaltyBadgeText: {
    fontSize: 10,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
    flexShrink: 1,
  },
  loyaltyBadgeTextApplied: {
    color: C.leekDark,
  },
  fallbackGlyph: {
    fontSize: 10,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
    minWidth: 70,
  },
  standardStrikeText: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  priceText: {
    fontSize: 15,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  priceUnavailableText: {
    fontSize: 12,
    fontFamily: BeavyFonts.semiBold,
    color: C.muted,
  },
  detailsHit: {
    minHeight: 24,
    justifyContent: 'center',
  },
  breakdownHint: {
    fontSize: 11,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
  },
  actionPanel: {
    marginTop: 8,
    gap: 10,
  },
  actionPanelDivider: {
    height: 1,
    backgroundColor: C.rule,
    marginHorizontal: -4,
  },
  actionPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 2,
    gap: 8,
  },
  actionPanelHeaderLeft: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  actionPanelOverline: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  actionPanelStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionPanelStoreName: {
    fontSize: 14,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  actionPanelHeaderRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  actionPanelTotalLabel: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
  },
  actionPanelTotalValue: {
    fontSize: 15.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  primaryCtaBtn: {
    minHeight: 46,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryCtaBtnDisabled: {
    opacity: 0.45,
  },
  primaryCtaBtnText: {
    fontSize: 13.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.surface,
    letterSpacing: -0.2,
  },
  primaryCtaFallbackGlyph: {
    fontSize: 14,
    color: C.surface,
    fontFamily: BeavyFonts.bold,
  },
  actionPanelSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  actionPanelSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingVertical: 4,
  },
  actionPanelSecondaryText: {
    fontSize: 12,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.primary,
  },
  linkFallbackGlyph: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  pressed: {
    opacity: 0.75,
  },
});
