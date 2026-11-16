import { SymbolView } from 'expo-symbols';
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ProductImageBox } from '@/components/product-image-box';
import { QuantityStepper } from '@/components/quantity-stepper';
import { BeavyColors as C, BeavyFonts, triggerHaptic } from '@/constants/theme';
import type { ShoppingItem } from '@/context/shopping-context';
import {
  cleanDisplayPackageSize,
  cleanScraperProductName,
} from '@/services/beavy-comparison';

type ChecklistItemRowProps = {
  item: ShoppingItem;
  resolvedImageUrl?: string | null;
  checkedBadgeLabel?: string;
  storeUnitPrice?: number | null;
  storeLoyaltyLabel?: string | null;
  storePackagingNote?: string | null;
  variant?: 'card' | 'flat';
  compact?: boolean;
  isLast?: boolean;
  onToggle: (itemId: string) => void;
  onQuantityChange: (itemId: string, delta: number) => void;
  onRemove: (itemId: string) => void;
  onLongPressItem?: (item: ShoppingItem) => void;
};

export const ChecklistItemRow = React.memo(function ChecklistItemRow({
  item,
  resolvedImageUrl,
  checkedBadgeLabel = 'Achiziționat',
  storeUnitPrice,
  storeLoyaltyLabel,
  storePackagingNote,
  variant = 'card',
  compact = false,
  isLast = false,
  onToggle,
  onQuantityChange,
  onRemove,
  onLongPressItem,
}: ChecklistItemRowProps) {
  const isFlat = variant === 'flat';
  const reducedMotion = useReducedMotion();
  const prevCheckedRef = useRef(item.checked);
  const checkScale = useSharedValue(1);

  useEffect(() => {
    if (item.checked !== prevCheckedRef.current && !reducedMotion) {
      checkScale.value = withSequence(
        withTiming(1.22, {
          duration: 90,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(1, {
          duration: 110,
          easing: Easing.out(Easing.cubic),
        })
      );
    }
    prevCheckedRef.current = item.checked;
  }, [item.checked, checkScale, reducedMotion]);

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const cleanTitle = cleanScraperProductName(item.name);
  const cleanPackageSize = cleanDisplayPackageSize(item.packageSize, item.name);

  const cleanBrand =
    item.brand && !/(orice\s+(firm[aă]|brand)|produs\s+propriu|generic)/i.test(item.brand.trim())
      ? item.brand.trim()
      : null;

  const qtyUnitLabel = cleanPackageSize
    ? item.quantity > 1 && item.isCustom && !/^\d/.test(cleanPackageSize)
      ? `${item.quantity} ${cleanPackageSize}`
      : item.quantity > 1
        ? `${item.quantity} × ${cleanPackageSize}`
        : cleanPackageSize
    : item.quantity > 1
      ? `${item.quantity} buc.`
      : null;

  const meta = [cleanBrand, qtyUnitLabel].filter(Boolean).join(' · ');

  return (
    <Pressable
      onLongPress={() => {
        triggerHaptic('medium');
        if (onLongPressItem) {
          onLongPressItem(item);
        }
      }}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
        isFlat && styles.rowFlat,
        compact && styles.rowCompact,
        isFlat && !isLast && styles.rowFlatDivider,
        item.checked && (isFlat ? styles.rowFlatChecked : styles.rowChecked),
        pressed && (isFlat ? styles.rowFlatPressed : styles.rowPressed),
      ]}
    >
      {/* 1. CHECKBOX TACTIL CU ANIMAȚIE & SIMBOL NATIV */}
      <Pressable
        onPress={() => {
          triggerHaptic('selection');
          onToggle(item.id);
        }}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={`${
          item.checked
            ? 'Anulează marcarea ca achiziționat pentru'
            : 'Marchează ca achiziționat'
        } ${item.name}`}
      >
        <Animated.View
          style={[
            styles.checkCircle,
            item.checked ? styles.checkCircleChecked : styles.checkCircleIdle,
            checkAnimatedStyle,
          ]}
        >
          {item.checked ? (
            <SymbolView
              name="checkmark"
              tintColor={C.white}
              size={12}
              fallback={<Text style={styles.checkFallbackIcon}>✓</Text>}
            />
          ) : (
            <View style={styles.checkInnerRing} />
          )}
        </Animated.View>
      </Pressable>

      {/* 2. THUMBNAIL PRODUS */}
      <ProductImageBox
        imageUrl={resolvedImageUrl ?? item.imageUrl}
        productName={cleanTitle}
        brand={item.brand}
        variant="thumb"
        style={compact ? styles.compactThumb : undefined}
      />

      {/* 3. DENUMIRE & METADATE CU PERSONALITATE EDITORIALĂ */}
      <Pressable
        onPress={() => {
          triggerHaptic('selection');
          onToggle(item.id);
        }}
        style={styles.textCol}
      >
        <View style={styles.titleWrap}>
          <Text
            numberOfLines={2}
            style={[styles.itemName, item.checked && styles.itemNameChecked]}
          >
            {cleanTitle}
          </Text>
          {item.checked && (
            <View style={styles.inCartBadge}>
              <Text style={styles.inCartBadgeText}>{checkedBadgeLabel}</Text>
            </View>
          )}
        </View>

        {(!!meta || storeUnitPrice != null || !!storeLoyaltyLabel || !!storePackagingNote) && (
          <View style={styles.metaLineRow}>
            {!!meta && (
              <Text numberOfLines={1} style={styles.itemMeta}>
                {meta}
              </Text>
            )}
            {storePackagingNote ? (
              <View style={styles.storePackBadge}>
                <SymbolView
                  name="shippingbox.fill"
                  tintColor={C.cherry}
                  size={9.5}
                  fallback={<Text style={styles.loyaltyFallback}>◈</Text>}
                />
                <Text numberOfLines={1} style={styles.storePackBadgeText}>
                  {storePackagingNote}
                </Text>
              </View>
            ) : storeUnitPrice != null ? (
              <View style={styles.storePriceBadge}>
                <Text style={styles.storePriceBadgeText}>
                  {(storeUnitPrice * item.quantity).toFixed(2)} RON
                  {item.quantity > 1 ? ` (${storeUnitPrice.toFixed(2)}/buc)` : ''}
                </Text>
              </View>
            ) : null}
            {!!storeLoyaltyLabel && (
              <View style={styles.storeLoyaltyBadge}>
                <SymbolView
                  name="creditcard.fill"
                  tintColor={C.cherry}
                  size={9.5}
                  fallback={<Text style={styles.loyaltyFallback}>◈</Text>}
                />
                <Text numberOfLines={1} style={styles.storeLoyaltyBadgeText}>
                  {storeLoyaltyLabel}
                </Text>
              </View>
            )}
          </View>
        )}
      </Pressable>

      {/* 4. QUANTITY STEPPER SAU PILL */}
      <View style={styles.stepperWrap}>
        <QuantityStepper
          quantity={item.quantity}
          variant="paper"
          onDecrement={() => {
            triggerHaptic('selection');
            if (item.quantity <= 1) {
              onRemove(item.id);
            } else {
              onQuantityChange(item.id, -1);
            }
          }}
          onIncrement={() => {
            triggerHaptic('light');
            onQuantityChange(item.id, 1);
          }}
        />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.rule,
    gap: 8,
  },
  rowFlat: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 2,
    paddingVertical: 7,
  },
  rowCompact: {
    minHeight: 44,
    paddingVertical: 4,
    gap: 7,
  },
  compactThumb: {
    width: 30,
    height: 30,
    borderRadius: 7,
    padding: 3,
  },
  rowFlatDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  rowChecked: {
    backgroundColor: C.buttermilk,
    borderColor: C.rule,
    opacity: 0.78,
  },
  rowFlatChecked: {
    opacity: 0.72,
  },
  rowPressed: {
    backgroundColor: C.grapefruit,
  },
  rowFlatPressed: {
    backgroundColor: C.buttermilk,
  },

  // CHECKBOX
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleIdle: {
    borderWidth: 1.5,
    borderColor: C.cherry,
    backgroundColor: C.buttermilk,
  },
  checkCircleChecked: {
    backgroundColor: C.cherry,
    borderWidth: 1.5,
    borderColor: C.cherry,
  },
  checkInnerRing: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  checkFallbackIcon: {
    fontSize: 11,
    color: C.white,
    fontWeight: '800',
    lineHeight: 12,
  },

  // TEXT
  textCol: {
    flex: 1,
    gap: 1,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  itemName: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13.5,
    lineHeight: 17,
    color: C.cherry,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  itemNameChecked: {
    color: C.muted,
    textDecorationLine: 'line-through',
    textDecorationColor: C.muted,
  },
  inCartBadge: {
    backgroundColor: C.leek,
    borderRadius: 99,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  inCartBadgeText: {
    fontSize: 10,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.cherry,
  },
  metaLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  itemMeta: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
    flexShrink: 1,
  },
  storePriceBadge: {
    backgroundColor: C.leek,
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },
  storePriceBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10,
    color: C.cherry,
  },
  storePackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: C.leek,
    borderWidth: 1,
    borderColor: 'rgba(66, 23, 38, 0.12)',
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },
  storePackBadgeText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 10,
    color: C.cherry,
    flexShrink: 1,
  },
  storeLoyaltyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: C.grapefruit,
    borderWidth: 1,
    borderColor: 'rgba(247, 141, 121, 0.5)',
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },
  storeLoyaltyBadgeText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 10,
    color: C.cherry,
    flexShrink: 1,
  },
  loyaltyFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 9.5,
    color: C.cherry,
  },

  // STEPPER
  stepperWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
