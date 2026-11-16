import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { getRetailerBrandStyle } from '@/components/cart/retailer-brand';
import { BeavyCategoryBar } from '@/components/ui/beavy-category-bar';
import { BeavyMetricTile } from '@/components/ui/beavy-metric-tile';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type {
  BasketComparisonInsights,
  BasketComparisonResult,
  RetailerComparisonSummary,
} from '@/services/beavy-comparison';

const MAX_BAR_HEIGHT = 144;
const MIN_BAR_HEIGHT = 64;
const PARTIAL_MAX_HEIGHT = 90;

function ChartBarColumn({
  summary,
  targetHeight,
  isWinner,
  isPartial,
  isEmpty,
  compactFixedWidth = false,
  onPress,
}: {
  summary: RetailerComparisonSummary;
  targetHeight: number;
  isWinner: boolean;
  isPartial: boolean;
  isEmpty: boolean;
  compactFixedWidth?: boolean;
  onPress: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const brand = getRetailerBrandStyle(summary.retailer.name, summary.retailer.slug);
  const animatedHeight = useSharedValue(reducedMotion ? targetHeight : 28);

  useEffect(() => {
    if (reducedMotion) {
      animatedHeight.value = targetHeight;
      return;
    }
    animatedHeight.value = withTiming(targetHeight, {
      duration: 210,
      easing: Easing.out(Easing.cubic),
    });
  }, [targetHeight, animatedHeight, reducedMotion]);

  const heightStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
  }));

  return (
    <Pressable
      disabled={isEmpty}
      onPress={() => {
        if (isEmpty) return;
        triggerHaptic('selection');
        onPress();
      }}
      style={({ pressed }) => [
        styles.columnPressable,
        compactFixedWidth && styles.columnPressableFixed,
        !isEmpty && pressed && styles.pressed,
      ]}
      accessibilityRole={isEmpty ? undefined : 'button'}
      accessibilityState={{ disabled: isEmpty }}
      accessibilityLabel={
        isEmpty
          ? `${summary.retailer.name}: fără prețuri confirmate`
          : `${summary.retailer.name}: ${summary.estimatedTotalWithFees.toFixed(2)} RON, ${summary.coveredCount} din ${summary.totalItemsCount} produse`
      }
    >
      <View style={styles.barStage}>
        {isWinner && !isEmpty && (
          <View style={styles.optimBadge}>
            <Text style={styles.optimBadgeText}>Optim</Text>
          </View>
        )}

        <Animated.View
          style={[
            styles.barRect,
            heightStyle,
            isEmpty
              ? styles.barEmpty
              : {
                  backgroundColor: brand.barColor,
                  opacity: isPartial ? 0.65 : 1,
                },
          ]}
        >
          {isEmpty ? (
            <Text style={styles.barEmptyDash}>—</Text>
          ) : (
            <View style={styles.barPriceStack}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.76}
                style={styles.barPriceValue}
              >
                {summary.estimatedTotalWithFees.toFixed(2)}
              </Text>
              <Text style={styles.barCurrency}>RON</Text>
            </View>
          )}
        </Animated.View>
      </View>

      <View style={styles.barFooter}>
        <RetailerLogo
          retailerName={summary.retailer.name}
          slug={summary.retailer.slug}
          logoUrl={summary.retailer.logo_url}
          size={28}
          shape="rounded"
        />
        <Text
          numberOfLines={1}
          style={[styles.storeNameLabel, isWinner && styles.storeNameWinner]}
        >
          {brand.shortName}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.coverageLabel,
            summary.hasFullCatalogCoverage &&
              summary.coveredCount > 0 &&
              styles.coverageCompleteLabel,
          ]}
        >
          {summary.coveredCount > 0
            ? `${summary.coveredCount}/${summary.totalItemsCount}`
            : 'Lipsă'}
        </Text>
      </View>
    </Pressable>
  );
}

type StoreComparisonChartProps = {
  comparison: BasketComparisonResult;
  insights: BasketComparisonInsights;
  onPressStore: (retailerId: string) => void;
};

/**
 * Vizualizare comparativă Beavy 2.0: bare colorate per supermarket + carduri de metrici (media coșului, diferență %, fidelitate).
 */
export function StoreComparisonChart({
  comparison,
  insights,
  onPressStore,
}: StoreComparisonChartProps) {
  const [infoExpanded, setInfoExpanded] = useState(false);
  const activeStores = insights.chartSummariesDescending.filter((s) => s.coveredCount > 0);
  const visibleStores =
    activeStores.length > 0 ? activeStores : insights.chartSummariesDescending.slice(0, 4);
  const useHorizontalScroll = visibleStores.length > 5;

  if (visibleStores.length === 0) return null;

  const comparableTotals = visibleStores
    .filter((s) => s.coveredCount > 0 && s.hasFullCatalogCoverage)
    .map((s) => s.estimatedTotalWithFees);
  const allActiveTotals = visibleStores
    .filter((s) => s.coveredCount > 0)
    .map((s) => s.estimatedTotalWithFees);

  const scaleTotals = comparableTotals.length > 0 ? comparableTotals : allActiveTotals;
  const minTotal = scaleTotals.length > 0 ? Math.min(...scaleTotals) : 0;
  const maxTotal = scaleTotals.length > 0 ? Math.max(...scaleTotals) : 0;

  const fullCoverageStoresCount = comparison.retailerSummaries.filter(
    (s) => s.coveredCount > 0 && s.hasFullCatalogCoverage
  ).length;
  const partialCoverageStoresCount = comparison.retailerSummaries.filter(
    (s) => s.coveredCount > 0 && !s.hasFullCatalogCoverage
  ).length;
  const zeroCoverageStoresCount = comparison.retailerSummaries.filter(
    (s) => s.coveredCount === 0
  ).length;

  const computeBarHeight = (s: RetailerComparisonSummary): number => {
    if (s.coveredCount === 0) return 38;
    if (comparableTotals.length > 0 && !s.hasFullCatalogCoverage) {
      return PARTIAL_MAX_HEIGHT;
    }
    if (maxTotal <= minTotal || maxTotal <= 0) {
      return Math.round((MIN_BAR_HEIGHT + MAX_BAR_HEIGHT) / 2);
    }
    const ratio = (s.estimatedTotalWithFees - minTotal) / (maxTotal - minTotal);
    return Math.round(MIN_BAR_HEIGHT + ratio * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT));
  };

  return (
    <View style={styles.sectionStack}>
      <BeavySurface variant="elevated" style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Comparație între magazine</Text>
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              setInfoExpanded((v) => !v);
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.infoBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: infoExpanded }}
            accessibilityLabel="Cum este calculată comparația"
          >
            <SymbolView
              name="info.circle"
              tintColor={C.muted}
              size={15}
              fallback={<Text style={styles.infoFallback}>ⓘ</Text>}
            />
          </Pressable>
        </View>

        {infoExpanded && (
          <Text style={styles.infoNote}>{comparison.transparencyNote}</Text>
        )}

        <BeavyCategoryBar
          height={7}
          segments={[
            {
              key: 'full',
              label: `${fullCoverageStoresCount} complete`,
              value: fullCoverageStoresCount,
              color: C.leekDark,
            },
            {
              key: 'partial',
              label: `${partialCoverageStoresCount} parțiale`,
              value: partialCoverageStoresCount,
              color: C.accent,
            },
            {
              key: 'missing',
              label: `${zeroCoverageStoresCount} fără ofertă`,
              value: zeroCoverageStoresCount,
              color: C.secondary,
            },
          ]}
        />

        {useHorizontalScroll ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.barsRowScroll}
          >
            {visibleStores.map((summary) => (
              <ChartBarColumn
                key={summary.retailer.id}
                summary={summary}
                targetHeight={computeBarHeight(summary)}
                isWinner={
                  Boolean(insights.bestStore) &&
                  insights.bestStore?.retailer.id === summary.retailer.id &&
                  summary.coveredCount > 0
                }
                isPartial={
                  summary.coveredCount > 0 && !summary.hasFullCatalogCoverage
                }
                isEmpty={summary.coveredCount === 0}
                compactFixedWidth
                onPress={() => onPressStore(summary.retailer.id)}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.barsRow}>
            {visibleStores.map((summary) => (
              <ChartBarColumn
                key={summary.retailer.id}
                summary={summary}
                targetHeight={computeBarHeight(summary)}
                isWinner={
                  Boolean(insights.bestStore) &&
                  insights.bestStore?.retailer.id === summary.retailer.id &&
                  summary.coveredCount > 0
                }
                isPartial={
                  summary.coveredCount > 0 && !summary.hasFullCatalogCoverage
                }
                isEmpty={summary.coveredCount === 0}
                onPress={() => onPressStore(summary.retailer.id)}
              />
            ))}
          </View>
        )}
      </BeavySurface>

      {/* Grilă Bento 2 coloane KPI în stil Tremor / Fintech */}
      {(insights.averageBasketTotal !== null ||
        insights.maxSpreadRon !== null ||
        insights.bestLoyaltyStore !== null) && (
        <View style={styles.bentoStack}>
          <View style={styles.bentoRow}>
            {insights.averageBasketTotal !== null && (
              <BeavyMetricTile
                tone="elevated"
                overline="Preț mediu coș"
                value={`${insights.averageBasketTotal.toFixed(2)} RON`}
                caption={
                  comparison.canCompareFairly
                    ? 'între magazinele complete'
                    : 'pe ofertele confirmate'
                }
              />
            )}

            {insights.maxSpreadRon !== null &&
            insights.maxSpreadRon > 0 &&
            insights.bestStore &&
            insights.mostExpensiveComparableStore ? (
              <BeavyMetricTile
                tone="positive"
                overline="Economie maximă"
                value={
                  insights.cheapestPercentSavings > 0
                    ? `-${insights.cheapestPercentSavings}%`
                    : `-${insights.maxSpreadRon.toFixed(2)} RON`
                }
                badgeLabel={`-${insights.maxSpreadRon.toFixed(2)} RON`}
                badgeTone="primary"
                caption={`vs ${insights.mostExpensiveComparableStore.retailer.name}`}
              />
            ) : comparison.canCompareFairly ? (
              <BeavyMetricTile
                tone="tonal"
                overline="Diferență coș"
                value="0.00 RON"
                caption="prețuri identice între magazine"
              />
            ) : null}
          </View>

          {insights.bestLoyaltyStore &&
            insights.bestLoyaltyStore.loyaltyProgramName && (
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  onPressStore(insights.bestLoyaltyStore!.retailer.id);
                }}
                style={({ pressed }) => [styles.loyaltyStrip, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Vezi economia cu ${insights.bestLoyaltyStore.loyaltyProgramName}`}
              >
                <View style={styles.loyaltyStripLeft}>
                  <SymbolView
                    name="creditcard.fill"
                    tintColor={C.primary}
                    size={14}
                    fallback={<Text style={styles.loyaltyStripGlyph}>◈</Text>}
                  />
                  <Text numberOfLines={1} style={styles.loyaltyStripText}>
                    {comparison.appliedLoyaltyCards
                      ? `${insights.bestLoyaltyStore.loyaltyProgramName} aplicat la ${insights.bestLoyaltyStore.retailer.name}`
                      : `${insights.bestLoyaltyStore.loyaltyProgramName} la ${insights.bestLoyaltyStore.retailer.name}`}
                  </Text>
                </View>
                <Text style={styles.loyaltyStripValue}>
                  {`-${insights.bestLoyaltyStore.potentialLoyaltySavings.toFixed(2)} RON ›`}
                </Text>
              </Pressable>
            )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionStack: {
    gap: 12,
  },
  chartCard: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 10,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chartTitle: {
    fontSize: 15,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.3,
  },
  infoBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoFallback: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    color: C.muted,
  },
  infoNote: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 6,
  },
  barsRowScroll: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 6,
    paddingRight: 4,
  },
  columnPressable: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
  },
  columnPressableFixed: {
    flex: 0,
    width: 66,
    minWidth: 66,
  },
  barStage: {
    width: '100%',
    height: MAX_BAR_HEIGHT + 24,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 5,
  },
  optimBadge: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  optimBadgeText: {
    fontSize: 10,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.leekDark,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  barRect: {
    width: '100%',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 9,
  },
  barEmpty: {
    backgroundColor: C.background,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.secondary,
  },
  barPriceStack: {
    alignItems: 'center',
  },
  barPriceValue: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.surface,
    fontVariant: ['tabular-nums'],
  },
  barCurrency: {
    fontSize: 9.5,
    lineHeight: 11,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.88)',
    letterSpacing: 0.4,
  },
  barEmptyDash: {
    fontSize: 14,
    fontFamily: BeavyFonts.bold,
    color: C.muted,
  },
  barFooter: {
    alignItems: 'center',
    gap: 3,
    width: '100%',
  },
  storeNameLabel: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
    textAlign: 'center',
  },
  storeNameWinner: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  coverageLabel: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  coverageCompleteLabel: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.leekDark,
  },
  bentoStack: {
    gap: 10,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  loyaltyStrip: {
    minHeight: 44,
    backgroundColor: C.accent,
    borderRadius: BeavyRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  loyaltyStripLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loyaltyStripGlyph: {
    fontSize: 13,
    fontFamily: BeavyFonts.extraBold,
    color: C.primary,
  },
  loyaltyStripText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  loyaltyStripValue: {
    fontSize: 13,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.72,
  },
});
