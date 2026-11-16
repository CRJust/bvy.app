import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProductImageBox } from '@/components/product-image-box';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import type { MatchQuality, SmartProductAssignment } from '@/services/smart-shopping';

export interface ProductAssignmentRowProps {
  assignment: SmartProductAssignment;
  isChecked?: boolean;
  onToggleChecked?: (itemId: string) => void;
  onReassignRetailer: (itemId: string, retailerSlug: string) => void;
}

function getMatchBadgeLabel(quality: MatchQuality, isSubstitution: boolean): string {
  if (isSubstitution || quality === 'substitution') return 'Alternativă';
  if (quality === 'exact_ean') return 'EAN exact';
  if (quality === 'exact_id') return 'Produs exact';
  if (quality === 'equivalent') return 'Echivalent';
  return 'Identificat';
}

export function ProductAssignmentRow({
  assignment,
  isChecked = false,
  onToggleChecked,
  onReassignRetailer,
}: ProductAssignmentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasAlternatives = assignment.alternativeOffers.length > 1;
  const matchLabel = getMatchBadgeLabel(assignment.matchQuality, assignment.isSubstitution);

  return (
    <View style={[styles.container, isChecked && styles.containerChecked]}>
      <View style={styles.mainRow}>
        {onToggleChecked ? (
          <Pressable
            hitSlop={10}
            style={[styles.checkBox, isChecked && styles.checkBoxActive]}
            onPress={() => {
              triggerHaptic('selection');
              onToggleChecked(assignment.itemId);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked }}
            accessibilityLabel={`Bifează ${assignment.canonicalName}`}
          >
            {isChecked ? (
              <SymbolView
                name="checkmark"
                size={12}
                tintColor={C.surface}
                fallback={<Text style={styles.checkFallback}>✓</Text>}
              />
            ) : null}
          </Pressable>
        ) : null}

        <ProductImageBox
          imageUrl={assignment.imageUrl}
          productName={assignment.canonicalName}
          brand={assignment.brand}
          variant="thumb"
          style={styles.thumb}
        />

        <View style={styles.infoCol}>
          <Text
            style={[styles.productName, isChecked && styles.productNameChecked]}
            numberOfLines={2}
          >
            {assignment.canonicalName}
          </Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {assignment.quantity} {assignment.quantity === 1 ? 'buc.' : 'buc.'}
              {assignment.packageSize ? ` · ${assignment.packageSize}` : ''}
            </Text>
            <View
              style={[
                styles.matchBadge,
                assignment.isSubstitution ? styles.matchBadgeSub : styles.matchBadgeExact,
              ]}
            >
              <Text style={styles.matchBadgeText}>{matchLabel}</Text>
            </View>
          </View>

          {assignment.substitutionReason ? (
            <Text style={styles.subReasonText} numberOfLines={1}>
              {assignment.substitutionReason}
            </Text>
          ) : null}
        </View>

        <View style={styles.priceCol}>
          <Text style={styles.lineTotal}>{assignment.lineTotal.toFixed(2)} lei</Text>
          {assignment.quantity > 1 ? (
            <Text style={styles.unitPrice}>
              {assignment.selectedOffer.effectiveUnitPrice.toFixed(2)} lei/buc
            </Text>
          ) : null}
          {assignment.savingsVsSingleStore > 0.05 ? (
            <View style={styles.savingsPill}>
              <Text style={styles.savingsPillText}>
                -{assignment.savingsVsSingleStore.toFixed(2)} lei
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Assigned store & manual reassignment trigger */}
      <View style={styles.storeBar}>
        <View style={styles.selectedStoreInfo}>
          <RetailerLogo
            retailerName={assignment.selectedRetailer.name}
            slug={assignment.selectedRetailer.slug}
            logoUrl={assignment.selectedRetailer.logoUrl}
            size={20}
          />
          <Text style={styles.selectedStoreName}>{assignment.selectedRetailer.name}</Text>
          {assignment.selectedOffer.freshnessLabel ? (
            <Text style={styles.freshnessDot}>
              · {assignment.selectedOffer.freshnessLabel}
            </Text>
          ) : null}
        </View>

        {hasAlternatives ? (
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [
              styles.changeStoreBtn,
              pressed && styles.changeStoreBtnPressed,
            ]}
            onPress={() => {
              triggerHaptic('selection');
              setExpanded((prev) => !prev);
            }}
          >
            <Text style={styles.changeStoreText}>
              {expanded ? 'Ascunde magazine' : `Schimbă (${assignment.alternativeOffers.length})`}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Expandable Alternative Retailers */}
      {expanded && hasAlternatives ? (
        <View style={styles.alternativesBox}>
          <Text style={styles.alternativesTitle}>Alege alt magazin pentru acest produs:</Text>
          <View style={styles.alternativesGrid}>
            {assignment.alternativeOffers.map((alt) => {
              const isSelected =
                alt.retailerSlug.toLowerCase() ===
                assignment.selectedRetailer.slug.toLowerCase();
              return (
                <Pressable
                  key={`${alt.retailerSlug}-${alt.offerId}`}
                  hitSlop={4}
                  style={({ pressed }) => [
                    styles.altOption,
                    isSelected && styles.altOptionSelected,
                    pressed && styles.altOptionPressed,
                  ]}
                  onPress={() => {
                    triggerHaptic('medium');
                    onReassignRetailer(assignment.itemId, alt.retailerSlug);
                    setExpanded(false);
                  }}
                >
                  <RetailerLogo
                    retailerName={alt.retailerName}
                    slug={alt.retailerSlug}
                    size={20}
                  />
                  <View style={styles.altOptionTextCol}>
                    <Text
                      style={[
                        styles.altRetailerName,
                        isSelected && styles.altRetailerNameSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {alt.retailerName}
                    </Text>
                    <Text
                      style={[
                        styles.altPriceText,
                        isSelected && styles.altPriceTextSelected,
                      ]}
                    >
                      {alt.lineTotal.toFixed(2)} lei
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.rule,
  },
  containerChecked: {
    opacity: 0.68,
    backgroundColor: C.background,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  checkBoxActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  checkFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.surface,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: BeavyRadius.sm,
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  productName: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 13,
    color: C.primary,
    lineHeight: 18,
  },
  productNameChecked: {
    textDecorationLine: 'line-through',
    color: C.muted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3,
  },
  metaText: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
  },
  matchBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: BeavyRadius.sm,
  },
  matchBadgeExact: {
    backgroundColor: C.secondary,
  },
  matchBadgeSub: {
    backgroundColor: C.grapefruit,
  },
  matchBadgeText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 10,
    color: C.primary,
  },
  subReasonText: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
  },
  priceCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  lineTotal: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 14,
    color: C.primary,
  },
  unitPrice: {
    fontFamily: BeavyFonts.regular,
    fontSize: 10,
    color: C.muted,
    marginTop: 1,
  },
  savingsPill: {
    backgroundColor: C.leek,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BeavyRadius.pill,
    marginTop: 3,
  },
  savingsPillText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10,
    color: C.leekDark,
  },
  storeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
  },
  selectedStoreInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  selectedStoreName: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  freshnessDot: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
  },
  changeStoreBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.rule,
    minHeight: 30,
    justifyContent: 'center',
  },
  changeStoreBtnPressed: {
    opacity: 0.75,
  },
  changeStoreText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 11,
    color: C.primary,
  },
  alternativesBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
  },
  alternativesTitle: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
    marginBottom: 8,
  },
  alternativesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  altOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.rule,
    minHeight: 44,
  },
  altOptionSelected: {
    backgroundColor: C.leek,
    borderColor: C.leekDark,
  },
  altOptionPressed: {
    opacity: 0.78,
  },
  altOptionTextCol: {
    justifyContent: 'center',
  },
  altRetailerName: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 11,
    color: C.primary,
  },
  altRetailerNameSelected: {
    fontFamily: BeavyFonts.bold,
    color: C.leekDark,
  },
  altPriceText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  altPriceTextSelected: {
    color: C.leekDark,
  },
});
