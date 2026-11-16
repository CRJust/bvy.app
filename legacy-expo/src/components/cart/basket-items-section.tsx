import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BeavyBasketProductRow } from '@/components/product/beavy-product-card';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type { ItemComparisonStatus } from '@/services/beavy-comparison';

type BasketItemsSectionProps = {
  attentionItems: ItemComparisonStatus[];
  comparedItems: ItemComparisonStatus[];
  onPressItem: (itemId: string) => void;
  onChangeQuantity: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
  onModifyList: () => void;
};

/**
 * Listă detaliată pe produse din coș cu stări explicite:
 * indisponibile, fără preț verificat, echivalente confirmate și diferențe de preț.
 */
export function BasketItemsSection({
  attentionItems,
  comparedItems,
  onPressItem,
  onChangeQuantity,
  onRemoveItem,
  onModifyList,
}: BasketItemsSectionProps) {
  return (
    <View style={styles.stack}>
      {attentionItems.length > 0 && (
        <View style={styles.groupWrap}>
          <Text style={styles.groupLabel}>
            {`Necesită atenție (${attentionItems.length})`}
          </Text>
          <BeavySurface variant="tonal" style={[styles.card, styles.attentionCard]}>
            {attentionItems.map((entry, idx) => (
              <BeavyBasketProductRow
                key={entry.item.id}
                entry={entry}
                isLast={idx === attentionItems.length - 1}
                onPressItem={onPressItem}
                onChangeQuantity={onChangeQuantity}
                onRemoveItem={onRemoveItem}
              />
            ))}
          </BeavySurface>
        </View>
      )}

      {comparedItems.length > 0 && (
        <View style={styles.groupWrap}>
          {attentionItems.length > 0 && (
            <Text style={styles.groupLabel}>
              {`Cu oferte comparate (${comparedItems.length})`}
            </Text>
          )}
          <BeavySurface variant="elevated" style={styles.card}>
            {comparedItems.map((entry, idx) => (
              <BeavyBasketProductRow
                key={entry.item.id}
                entry={entry}
                isLast={idx === comparedItems.length - 1}
                onPressItem={onPressItem}
                onChangeQuantity={onChangeQuantity}
                onRemoveItem={onRemoveItem}
              />
            ))}
          </BeavySurface>
        </View>
      )}

      <Pressable
        onPress={() => {
          triggerHaptic('selection');
          onModifyList();
        }}
        hitSlop={8}
        style={({ pressed }) => [styles.modifyBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Adaugă sau modifică produsele din listă"
      >
        <SymbolView
          name="plus"
          tintColor={C.primary}
          size={13}
          fallback={<Text style={styles.modifyBtnPlus}>+</Text>}
        />
        <Text style={styles.modifyBtnText}>Adaugă produse din listă</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  groupWrap: {
    gap: 6,
  },
  groupLabel: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.muted,
    paddingHorizontal: 4,
  },
  card: {
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  attentionCard: {
    backgroundColor: C.grapefruit,
  },
  modifyBtn: {
    minHeight: 46,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  modifyBtnPlus: {
    fontSize: 15,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  modifyBtnText: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  pressed: {
    opacity: 0.72,
  },
});
