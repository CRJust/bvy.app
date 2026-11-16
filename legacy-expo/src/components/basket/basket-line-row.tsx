import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MiniPriceStrip } from '@/components/product/product-price-grid';
import { ProductImageBox } from '@/components/product-image-box';
import { QuantityStepper } from '@/components/quantity-stepper';
import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import type { ShoppingItem } from '@/context/shopping-context';
import { type BasketLine, type BrandSwapHint, formatLei } from '@/services/live-basket';
import type { PriceGridSummary } from '@/services/product-price-grid';

type BasketLineRowProps = {
  item: ShoppingItem;
  line: BasketLine | undefined;
  hint?: BrandSwapHint | null;
  priceGridSummary?: PriceGridSummary | null;
  imageUrl?: string | null;
  showStoreName?: boolean;
  city?: string;
  /** Mod magazin fizic: tap pe rând = pus în coșul fizic. */
  inStore?: boolean;
  inCart?: boolean;
  onToggleInCart?: (itemId: string) => void;
  onInspect?: (item: ShoppingItem) => void;
  onChangeQuantity: (itemId: string, delta: number) => void;
  onLongPress: (item: ShoppingItem) => void;
  onApplyHint?: (itemId: string, hint: BrandSwapHint) => void;
};

function unitPriceLabel(line: BasketLine): string | null {
  const offer = line.match?.offer;
  if (!offer) return null;
  if (offer.normalized_unit_price != null && offer.normalized_unit_label) {
    return `${formatLei(offer.normalized_unit_price)}/${offer.normalized_unit_label.replace(/^.*\//, '')}`;
  }
  return null;
}

export const BasketLineRow = React.memo(function BasketLineRow({
  item,
  line,
  hint,
  priceGridSummary,
  imageUrl,
  showStoreName,
  city,
  inStore,
  inCart,
  onToggleInCart,
  onInspect,
  onChangeQuantity,
  onLongPress,
  onApplyHint,
}: BasketLineRowProps) {
  const match = line?.match ?? null;
  const displayName = match?.equivalentProductName ?? item.name;
  const displayBrand = match?.equivalentBrand ?? item.brand ?? null;
  const size = match?.equivalentPackageSize ?? item.packageSize ?? match?.offer.package_size ?? null;
  const unit = line ? unitPriceLabel(line) : null;
  const unavailable = line && line.status !== 'priced';

  const meta = [displayBrand, size].filter(Boolean).join(' · ');

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole={inStore ? 'checkbox' : 'button'}
        accessibilityState={inStore ? { checked: Boolean(inCart) } : undefined}
        accessibilityLabel={`${displayName}${meta ? `, ${meta}` : ''}${
          line?.lineTotal != null ? `, ${formatLei(line.lineTotal)}` : ', fără preț la acest magazin'
        }`}
        onPress={
          inStore
            ? () => onToggleInCart?.(item.id)
            : onInspect
              ? () => {
                  triggerHaptic('selection');
                  onInspect(item);
                }
              : undefined
        }
        onLongPress={() => onLongPress(item)}
        delayLongPress={380}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {inStore ? (
          <View style={[styles.check, inCart && styles.checkOn]}>
            {inCart ? (
              <SymbolView
                name="checkmark"
                size={14}
                weight="bold"
                tintColor={C.white}
                fallback={<Text style={styles.checkGlyph}>✓</Text>}
              />
            ) : null}
          </View>
        ) : null}

        <ProductImageBox
          imageUrl={imageUrl ?? match?.equivalentImageUrl ?? match?.offer.image_url ?? item.imageUrl}
          productName={displayName}
          brand={displayBrand}
          variant="thumb"
        />

        <View style={styles.body}>
          <Text
            numberOfLines={2}
            style={[styles.name, inCart && styles.nameDone]}
          >
            {displayName}
          </Text>
          {meta ? (
            <Text numberOfLines={1} style={styles.meta}>
              {meta}
            </Text>
          ) : null}
          <View style={styles.chipsRow}>
            {line?.isBudgetSwap ? (
              <View style={[styles.chip, styles.chipSaving]}>
                <Text style={styles.chipSavingText}>Marcă proprie</Text>
              </View>
            ) : null}
            {line?.hasPromo ? (
              <View style={[styles.chip, styles.chipPromo]}>
                <Text style={styles.chipPromoText} numberOfLines={1}>
                  {match?.offer.promo_label ?? 'Ofertă'}
                </Text>
              </View>
            ) : null}
            {showStoreName && line?.retailerName ? (
              <Text style={styles.storeTag} numberOfLines={1}>
                {line.retailerName}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.priceCol}>
          {unavailable ? (
            <Text style={styles.noPrice}>
              {line?.status === 'unavailable' ? 'Indisponibil' : 'Fără ofertă'}
            </Text>
          ) : (
            <>
              <Text style={styles.price}>{line?.lineTotal != null ? formatLei(line.lineTotal) : '—'}</Text>
              {unit ? <Text style={styles.unit}>{unit}</Text> : null}
            </>
          )}
          {!inStore ? (
            <QuantityStepper
              quantity={item.quantity}
              onDecrement={() => onChangeQuantity(item.id, -1)}
              onIncrement={() => onChangeQuantity(item.id, 1)}
            />
          ) : (
            <Text style={styles.qtyStatic}>× {item.quantity}</Text>
          )}
        </View>
      </Pressable>

      {!inStore && item.productId ? (
        <View style={styles.stripWrap}>
          <MiniPriceStrip
            product={{
              id: item.productId,
              canonical_name: displayName,
              brand: displayBrand,
              package_size: size,
              image_url: item.imageUrl ?? null,
            }}
            city={city}
            precomputedSummary={priceGridSummary}
            lazy={!priceGridSummary}
          />
        </View>
      ) : null}

      {hint && !inStore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Economisești ${formatLei(hint.savings)} cu ${hint.alternativeName}. Schimbă`}
          disabled={!hint.replacement}
          onPress={() => {
            triggerHaptic('success');
            onApplyHint?.(item.id, hint);
          }}
          style={({ pressed }) => [styles.hint, pressed && styles.pressed]}
        >
          <SymbolView
            name="arrow.triangle.swap"
            size={13}
            tintColor={C.leekDark}
            fallback={<Text style={styles.hintGlyph}>⇄</Text>}
          />
          <Text style={styles.hintText} numberOfLines={1}>
            Economisești {formatLei(hint.savings)} cu {hint.alternativeName}
          </Text>
          <Text style={styles.hintAction}>Schimbă</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  pressed: { opacity: 0.78 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.cherry,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: C.cherry },
  checkGlyph: { color: C.white, fontSize: 14, fontFamily: BeavyFonts.extraBold },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: {
    fontSize: 15,
    lineHeight: 20,
    color: C.cherry,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
  },
  nameDone: { textDecorationLine: 'line-through', color: C.muted },
  meta: {
    fontSize: 12.5,
    color: C.muted,
    fontFamily: BeavyFonts.medium,
  },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BeavyRadius.pill,
    maxWidth: 140,
  },
  chipSaving: { backgroundColor: C.leek },
  chipSavingText: { fontSize: 11, color: C.cherry, fontFamily: BeavyFonts.bold, fontWeight: '700' },
  chipPromo: { backgroundColor: C.grapefruit },
  chipPromoText: { fontSize: 11, color: C.cherry, fontFamily: BeavyFonts.bold, fontWeight: '700' },
  storeTag: { fontSize: 11.5, color: C.muted, fontFamily: BeavyFonts.semiBold },
  priceCol: { alignItems: 'flex-end', gap: 6 },
  price: {
    fontSize: 15.5,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 11,
    color: C.muted,
    fontFamily: BeavyFonts.medium,
    fontVariant: ['tabular-nums'],
  },
  noPrice: { fontSize: 12.5, color: C.muted, fontFamily: BeavyFonts.semiBold },
  qtyStatic: {
    fontSize: 13,
    color: C.muted,
    fontFamily: BeavyFonts.bold,
    fontVariant: ['tabular-nums'],
  },
  stripWrap: { paddingBottom: 4 },
  hint: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.leek,
  },
  hintGlyph: { fontSize: 13, color: C.leekDark, fontFamily: BeavyFonts.extraBold },
  hintText: {
    flex: 1,
    fontSize: 12.5,
    color: C.cherry,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  hintAction: {
    fontSize: 12.5,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
