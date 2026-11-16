import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProductImageBox } from '@/components/product-image-box';
import { BeavyBadge } from '@/components/ui/beavy-badge';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type { MatchedBasketItem } from '@/services/beavy-comparison';

type BudgetAlternativesSectionProps = {
  alternatives: MatchedBasketItem[];
  totalItemsCount: number;
  onPressItem: (itemId: string) => void;
  onApplyAll: () => void;
  onModifyList: () => void;
};

/**
 * Lista de sugestii pentru modul „Alternativa Economică”:
 * fiecare produs selectat este comparat cu varianta mai ieftină găsită
 * (marcă proprie sau echivalent), cu prețul și economia aferentă.
 */
export function BudgetAlternativesSection({
  alternatives,
  totalItemsCount,
  onPressItem,
  onApplyAll,
  onModifyList,
}: BudgetAlternativesSectionProps) {
  const totalSavings = alternatives.reduce(
    (sum, matched) => sum + Math.max(0, matched.budgetSavingsLine ?? 0),
    0
  );

  if (alternatives.length === 0) {
    return (
      <BeavySurface variant="tonal" style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Nicio alternativă mai economică</Text>
        <Text style={styles.emptySub}>
          Pentru selecția curentă nu am găsit produse echivalente mai ieftine.
        </Text>
        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            onModifyList();
          }}
          hitSlop={8}
          style={styles.emptyBtn}
          accessibilityRole="button"
          accessibilityLabel="Modifică lista de cumpărături"
        >
          <Text style={styles.emptyBtnText}>Modifică lista</Text>
        </Pressable>
      </BeavySurface>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.overline}>Sugestii mai economice</Text>
          <Text style={styles.title}>
            {alternatives.length === 1
              ? '1 produs mai ieftin'
              : `${alternatives.length} produse mai ieftine`}
          </Text>
          <Text style={styles.subtitle}>
            {alternatives.length === 1
              ? `1 din ${totalItemsCount} produse selectate are o variantă mai avantajoasă.`
              : `${alternatives.length} din ${totalItemsCount} produse selectate au o variantă mai avantajoasă.`}
          </Text>
        </View>

        {totalSavings > 0.05 ? (
          <BeavyBadge
            tone="positive"
            size="md"
            label={`-${totalSavings.toFixed(2)} RON`}
          />
        ) : null}
      </View>

      <BeavySurface variant="elevated" style={styles.card}>
        {alternatives.map((matched, index) => {
          const alternativeName =
            matched.equivalentProductName ?? matched.item.name;
          const alternativeBrand = matched.equivalentBrand ?? null;
          const alternativePackageSize =
            matched.equivalentPackageSize ?? matched.offer.package_size ?? null;
          const alternativeImageUrl =
            matched.equivalentImageUrl ?? matched.offer.image_url ?? null;
          const savings = Math.max(0, matched.budgetSavingsLine ?? 0);
          const originalLineTotal =
            matched.baselineExactPrice !== null &&
            matched.baselineExactPrice !== undefined
              ? matched.baselineExactPrice * matched.item.quantity
              : null;

          return (
            <Pressable
              key={`${matched.item.id}:${matched.offer.id}`}
              onPress={() => {
                triggerHaptic('selection');
                onPressItem(matched.item.id);
              }}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.rowDivider,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${matched.item.name} poate fi înlocuit cu ${alternativeName} la ${matched.offer.retailer_name}, ${matched.lineTotal.toFixed(2)} RON`}
            >
              <ProductImageBox
                imageUrl={alternativeImageUrl}
                productName={alternativeName}
                brand={alternativeBrand}
                variant="thumb"
                style={styles.thumb}
              />

              <View style={styles.info}>
                <Text style={styles.originalLabel} numberOfLines={1}>
                  În loc de{' '}
                  <Text style={styles.originalName}>{matched.item.name}</Text>
                </Text>
                <Text style={styles.alternativeName} numberOfLines={2}>
                  {alternativeName}
                </Text>

                <View style={styles.metaRow}>
                  {alternativeBrand ? (
                    <Text style={styles.brand}>{alternativeBrand}</Text>
                  ) : null}
                  {alternativePackageSize ? (
                    <Text style={styles.meta}>{alternativePackageSize}</Text>
                  ) : null}
                  {matched.item.quantity > 1 ? (
                    <Text style={styles.meta}>×{matched.item.quantity}</Text>
                  ) : null}
                </View>

                <View style={styles.retailerRow}>
                  <RetailerLogo
                    retailerName={matched.offer.retailer_name}
                    size={14}
                  />
                  <Text style={styles.retailerName} numberOfLines={1}>
                    {matched.offer.retailer_name}
                  </Text>
                </View>
              </View>

              <View style={styles.priceCol}>
                {originalLineTotal !== null && originalLineTotal > matched.lineTotal ? (
                  <Text style={styles.oldPrice}>
                    {`${originalLineTotal.toFixed(2)} lei`}
                  </Text>
                ) : null}
                <Text style={styles.price}>
                  {`${matched.lineTotal.toFixed(2)} lei`}
                </Text>
                {savings > 0.05 ? (
                  <BeavyBadge
                    tone="positive"
                    size="sm"
                    label={`-${savings.toFixed(2)} lei`}
                    style={styles.savingsBadge}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </BeavySurface>

      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            triggerHaptic('success');
            onApplyAll();
          }}
          hitSlop={4}
          style={({ pressed }) => [
            styles.applyBtn,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Înlocuiește ${alternatives.length} produse cu alternativele mai economice`}
        >
          <SymbolView
            name="arrow.triangle.swap"
            tintColor={C.leekDark}
            size={15}
            fallback={<Text style={styles.applyFallback}>⇄</Text>}
          />
          <Text style={styles.applyBtnText}>
            {alternatives.length === 1
              ? 'Înlocuiește cu alternativa mai ieftină'
              : `Înlocuiește toate cele ${alternatives.length} sugestii`}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            onModifyList();
          }}
          hitSlop={8}
          style={styles.modifyBtn}
          accessibilityRole="button"
          accessibilityLabel="Modifică lista de cumpărături"
        >
          <Text style={styles.modifyBtnText}>Modifică lista</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  overline: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: C.muted,
  },
  title: {
    fontSize: 17,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    lineHeight: 17,
  },
  card: {
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    minHeight: 76,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: BeavyRadius.sm,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  originalLabel: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
  },
  originalName: {
    fontFamily: BeavyFonts.semiBold,
    textDecorationLine: 'line-through',
  },
  alternativeName: {
    fontSize: 14,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
  },
  brand: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.leekDark,
  },
  meta: {
    fontSize: 11,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
  },
  retailerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  retailerName: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.semiBold,
    color: C.muted,
    flexShrink: 1,
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 3,
    flexShrink: 0,
  },
  savingsBadge: {
    alignSelf: 'flex-end',
  },
  oldPrice: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    textDecorationLine: 'line-through',
  },
  price: {
    fontSize: 14.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    gap: 6,
    marginTop: 2,
  },
  applyBtn: {
    minHeight: 48,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.leek,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  applyBtnText: {
    fontSize: 13,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.leekDark,
    textAlign: 'center',
  },
  applyFallback: {
    fontSize: 15,
    fontFamily: BeavyFonts.extraBold,
    color: C.leekDark,
  },
  modifyBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modifyBtnText: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  emptyCard: {
    padding: 18,
    gap: 6,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  emptySub: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
    lineHeight: 18,
  },
  emptyBtn: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 2,
  },
  emptyBtnText: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  pressed: {
    opacity: 0.72,
  },
});
