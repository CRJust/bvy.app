import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BeavyBadge } from '@/components/ui/beavy-badge';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type {
  BasketBudgetSummary,
  BasketComparisonInsights,
  BasketComparisonResult,
  BasketVariantMode,
} from '@/services/beavy-comparison';

type OptimalCartHeroProps = {
  comparison: BasketComparisonResult;
  insights: BasketComparisonInsights;
  lastUpdatedLabel: string | null;
  variantMode?: BasketVariantMode;
  budgetSummary?: BasketBudgetSummary | null;
  onApplyBudgetSwaps?: () => void;
  onSwitchToBudget?: () => void;
  onSwitchToStandard?: () => void;
  onStartPrimaryAction: (retailerName: string) => void;
  onInspectBreakdown: (retailerId: string) => void;
};

/**
 * Evidențiază totalul minim verificat, economiile reale și următorul pas.
 */
export function OptimalCartHero({
  comparison,
  insights,
  lastUpdatedLabel,
  variantMode = 'standard',
  budgetSummary,
  onApplyBudgetSwaps,
  onSwitchToBudget,
  onSwitchToStandard,
  onStartPrimaryAction,
  onInspectBreakdown,
}: OptimalCartHeroProps) {
  const bestStore = insights.bestStore;

  if (!bestStore) {
    return (
      <BeavySurface variant="elevated" style={styles.emptyCard}>
        <Text style={styles.emptyTotalTitle}>Nicio ofertă găsită</Text>
      </BeavySurface>
    );
  }

  const isCompleteWinner = bestStore.hasFullCatalogCoverage;
  const isOnlineOnly =
    !bestStore.retailer.supports_physical && bestStore.retailer.supports_delivery;

  const primaryCtaLabel = isOnlineOnly
    ? `Comandă la ${bestStore.retailer.name}`
    : `Checklist în ${bestStore.retailer.name}`;

  return (
    <View style={styles.cherryHeroCard}>
      {/* Bandă superioară fintech: etichetă acoperire + brand câștigător */}
      <View style={styles.topRow}>
        <View style={styles.statusGroup}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isCompleteWinner ? C.leek : C.accent,
              },
            ]}
          />
          <Text style={styles.overline}>
            {variantMode === 'private_label_budget'
              ? isCompleteWinner
                ? 'Opțiune Budget'
                : `Opțiune Budget · ${bestStore.coveredCount}/${bestStore.totalItemsCount}`
              : isCompleteWinner
                ? 'Cel mai ieftin coș complet'
                : `Acoperire parțială · ${bestStore.coveredCount}/${bestStore.totalItemsCount}`}
          </Text>
        </View>

        <View style={styles.storeChip}>
          <RetailerLogo
            retailerName={bestStore.retailer.name}
            slug={bestStore.retailer.slug}
            logoUrl={bestStore.retailer.logo_url}
            size={20}
            shape="circle"
          />
          <Text style={styles.storeChipText}>
            {bestStore.retailer.name}
          </Text>
        </View>
      </View>

      {/* Preț total în alb cald + economii verificate în Verde praz */}
      <View style={styles.priceRow}>
        <Text style={styles.totalAmount}>
          {`${bestStore.estimatedTotalWithFees.toFixed(2)} RON`}
        </Text>

        {comparison.canCompareFairly &&
        insights.maxSpreadRon !== null &&
        insights.maxSpreadRon > 0 ? (
          <BeavyBadge
            tone="positive"
            size="md"
            label={`-${insights.maxSpreadRon.toFixed(2)} RON · ${insights.cheapestPercentSavings}%`}
          />
        ) : comparison.canCompareFairly ? (
          <BeavyBadge tone="neutral" size="md" label="Preț egal" />
        ) : null}
      </View>

      {/* Info taxe / fidelitate / economii marcă proprie / dată actualizare */}
      <View style={styles.metaStack}>
        {/* Buton vizibil și atractiv pentru activarea economiilor cu produse marcă proprie */}
        {variantMode === 'standard' &&
          budgetSummary?.hasBudgetVariant &&
          budgetSummary.savingsVsStandardBest !== null &&
          budgetSummary.savingsVsStandardBest > 0 &&
          onSwitchToBudget && (
            <Pressable
              onPress={() => {
                triggerHaptic('medium');
                onSwitchToBudget();
              }}
              style={({ pressed }) => [
                styles.saveWithStoreBrandsBtn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Economisește cu opțiunea de buget. Reduci costul cu ${budgetSummary.savingsVsStandardBest.toFixed(2)} RON suplimentar.`}
            >
              <View style={styles.saveWithStoreBrandsLeft}>
                <View style={styles.saveWithStoreBrandsIconWrap}>
                  <SymbolView
                    name="sparkles"
                    tintColor={C.leekDark}
                    size={17}
                    fallback={<Text style={styles.saveWithStoreBrandsGlyph}>✦</Text>}
                  />
                </View>
                <View style={styles.saveWithStoreBrandsCopy}>
                  <Text style={styles.saveWithStoreBrandsTitle}>
                    {`Alternative mai economice (-${budgetSummary.savingsVsStandardBest.toFixed(2)} RON)`}
                  </Text>
                  <Text style={styles.saveWithStoreBrandsSub}>
                    Mărci de buget și ambalaje avantajoase cu aceeași calitate
                  </Text>
                </View>
              </View>

              <View style={styles.saveWithStoreBrandsBadge}>
                <Text style={styles.saveWithStoreBrandsBadgeText}>Activează alternative ›</Text>
              </View>
            </Pressable>
          )}

        {/* Banner activ de confirmare a economiilor de buget */}
        {variantMode === 'private_label_budget' &&
          budgetSummary &&
          budgetSummary.savingsVsStandardBest !== null &&
          budgetSummary.savingsVsStandardBest > 0 && (
            <View style={styles.budgetActiveBanner}>
              <View style={styles.saveWithStoreBrandsLeft}>
                <View style={[styles.saveWithStoreBrandsIconWrap, styles.budgetActiveIconWrap]}>
                  <SymbolView
                    name="checkmark.seal.fill"
                    tintColor={C.leekDark}
                    size={16}
                    fallback={<Text style={styles.saveWithStoreBrandsGlyph}>✓</Text>}
                  />
                </View>
                <View style={styles.saveWithStoreBrandsCopy}>
                  <Text style={styles.budgetActiveTitle}>
                    {`Alternative economice active (-${budgetSummary.savingsVsStandardBest.toFixed(2)} RON)`}
                  </Text>
                  <Text style={styles.budgetActiveSub}>
                    Prețuri calculate cu cele mai avantajoase variante
                  </Text>
                </View>
              </View>

              {onSwitchToStandard && (
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    onSwitchToStandard();
                  }}
                  hitSlop={6}
                  style={styles.switchBackBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Revino la brandurile standard"
                >
                  <Text style={styles.switchBackBtnText}>Standard ›</Text>
                </Pressable>
              )}
            </View>
          )}

        {bestStore.loyaltyOfferCount > 0 && bestStore.loyaltyProgramName && (
          <View style={styles.loyaltyHighlightRow}>
            <SymbolView
              name="creditcard.fill"
              tintColor={C.primary}
              size={12}
              fallback={<Text style={styles.fallbackGlyph}>◈</Text>}
            />
            <Text numberOfLines={1} style={styles.loyaltyHighlightText}>
              {bestStore.potentialLoyaltySavings > 0
                ? comparison.appliedLoyaltyCards
                  ? `Include -${bestStore.potentialLoyaltySavings.toFixed(2)} RON prin ${bestStore.loyaltyProgramName}`
                  : `Cu ${bestStore.loyaltyProgramName}: ${bestStore.estimatedTotalWithLoyalty.toFixed(2)} RON (-${bestStore.potentialLoyaltySavings.toFixed(2)} RON)`
                : `${bestStore.loyaltyProgramName}: ofertă condiționată de cantitate`}
            </Text>
          </View>
        )}

        <Text style={styles.subtitle}>
          {[
            bestStore.estimatedFeesTotal > 0
              ? `Include ${bestStore.estimatedFeesTotal.toFixed(2)} RON livrare/taxe`
              : `${bestStore.channelLabel} · fără taxe de livrare`,
            lastUpdatedLabel ? `actualizat ${lastUpdatedLabel}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      {/* CTA primar luminos Coral pe fundal Cherry */}
      <View style={styles.actionsWrap}>
        <Pressable
          onPress={() => {
            triggerHaptic('medium');
            onStartPrimaryAction(bestStore.retailer.name);
          }}
          hitSlop={4}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={primaryCtaLabel}
        >
          <SymbolView
            name={isOnlineOnly ? 'bag.fill' : 'checklist'}
            tintColor={C.primary}
            size={15}
            fallback={<Text style={styles.primaryFallbackGlyph}>→</Text>}
          />
          <Text style={styles.primaryBtnText}>{primaryCtaLabel}</Text>
        </Pressable>

        {variantMode === 'private_label_budget' &&
          (bestStore.budgetSwapCount ?? 0) > 0 &&
          onApplyBudgetSwaps && (
            <Pressable
              onPress={() => {
                triggerHaptic('medium');
                onApplyBudgetSwaps();
              }}
              hitSlop={4}
              style={({ pressed }) => [styles.applyBudgetBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Aplică ${(bestStore.budgetSwapCount ?? 0)} alternative de buget pe listă`}
            >
              <Text style={styles.applyBudgetBtnText}>
                {bestStore.budgetSwapCount === 1
                  ? 'Înlocuiește cu alternativa mai economică pe listă'
                  : `Înlocuiește cu cele ${bestStore.budgetSwapCount} alternative mai economice pe listă`}
              </Text>
            </Pressable>
          )}

        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            onInspectBreakdown(bestStore.retailer.id);
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.secondaryLinkBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Vezi defalcarea prețurilor pentru ${bestStore.retailer.name}`}
        >
          <Text style={styles.secondaryLinkText}>Vezi defalcarea coșului ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 8,
  },
  emptyOverline: {
    fontSize: 11,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: C.muted,
  },
  emptyTotalTitle: {
    fontSize: 20,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.4,
  },
  emptySubtitle: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    lineHeight: 18,
  },
  cherryHeroCard: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  overline: {
    fontSize: 11,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: 0.75,
    textTransform: 'uppercase',
    color: C.muted,
    flexShrink: 1,
  },
  storeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  storeChipText: {
    fontSize: 12.5,
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
    fontSize: 31,
    lineHeight: 36,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.7,
    fontVariant: ['tabular-nums'],
  },
  metaStack: {
    gap: 8,
  },
  saveWithStoreBrandsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(58, 84, 42, 0.22)',
  },
  saveWithStoreBrandsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  saveWithStoreBrandsIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  saveWithStoreBrandsGlyph: {
    fontSize: 14,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  saveWithStoreBrandsCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  saveWithStoreBrandsTitle: {
    fontSize: 13.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.2,
  },
  saveWithStoreBrandsSub: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.leekDark,
    lineHeight: 15,
  },
  saveWithStoreBrandsBadge: {
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
    flexShrink: 0,
  },
  saveWithStoreBrandsBadgeText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.surface,
  },
  budgetActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(219, 227, 198, 0.45)',
    borderRadius: BeavyRadius.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: C.leek,
    marginTop: 2,
  },
  budgetActiveIconWrap: {
    backgroundColor: C.leek,
  },
  budgetActiveTitle: {
    fontSize: 13,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  budgetActiveSub: {
    fontSize: 11,
    fontFamily: BeavyFonts.medium,
    color: C.leekDark,
  },
  switchBackBtn: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexShrink: 0,
  },
  switchBackBtnText: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  loyaltyHighlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  fallbackGlyph: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    color: C.muted,
  },
  loyaltyHighlightText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    lineHeight: 17,
  },
  actionsWrap: {
    marginTop: 4,
    gap: 8,
  },
  primaryBtn: {
    minHeight: 48,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  primaryBtnPressed: {
    opacity: 0.88,
  },
  primaryFallbackGlyph: {
    fontSize: 14,
    fontFamily: BeavyFonts.extraBold,
    color: C.surface,
  },
  primaryBtnText: {
    fontSize: 14.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.surface,
    letterSpacing: -0.2,
  },
  applyBudgetBtn: {
    minHeight: 44,
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  applyBudgetBtnText: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.leekDark,
  },
  secondaryLinkBtn: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLinkText: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  pressed: {
    opacity: 0.72,
  },
});
