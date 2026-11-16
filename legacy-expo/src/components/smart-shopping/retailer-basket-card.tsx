import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RetailerLogo } from '@/components/ui/retailer-logo';
import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import type { SmartStoreAssignment } from '@/services/smart-shopping';

export interface RetailerBasketCardProps {
  storeAssignment: SmartStoreAssignment;
  onStartShopping?: (retailerName: string, itemIds: string[]) => void;
}

export function RetailerBasketCard({ storeAssignment, onStartShopping }: RetailerBasketCardProps) {
  const {
    retailer,
    channel,
    productCount,
    productSubtotal,
    deliveryFee,
    packagingFee,
    minimumOrderValue,
    meetsMinimumOrderValue,
    storeTotal,
    assignedItems,
  } = storeAssignment;

  const isDelivery = channel === 'delivery' || (!retailer.supports_physical && retailer.supports_delivery);
  const extraFees = deliveryFee + packagingFee;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.leftInfo}>
          <RetailerLogo
            retailerName={retailer.name}
            slug={retailer.slug}
            logoUrl={retailer.logo_url}
            size={38}
          />
          <View style={styles.nameBlock}>
            <Text style={styles.storeName}>{retailer.name}</Text>
            <Text style={styles.channelBadge}>
              {isDelivery ? 'Livrare online' : 'Cumpărături în magazin'} · {productCount}{' '}
              {productCount === 1 ? 'produs' : 'produse'}
            </Text>
          </View>
        </View>

        <View style={styles.rightInfo}>
          <Text style={styles.subtotal}>{storeTotal.toFixed(2)} lei</Text>
          {extraFees > 0 ? (
            <Text style={styles.feeNote}>incl. +{extraFees.toFixed(2)} lei livrare</Text>
          ) : null}
        </View>
      </View>

      {!meetsMinimumOrderValue && minimumOrderValue ? (
        <View style={styles.movWarning}>
          <Text style={styles.movWarningText}>
            Subtotal produse ({productSubtotal.toFixed(2)} lei) sub comanda minimă de{' '}
            {minimumOrderValue.toFixed(0)} lei.
          </Text>
        </View>
      ) : null}

      {/* Preview of assigned product chips */}
      <View style={styles.chipsRow}>
        {assignedItems.slice(0, 5).map((it) => (
          <View key={it.itemId} style={styles.itemChip}>
            <Text style={styles.chipText} numberOfLines={1}>
              {it.requestedName} {it.quantity > 1 ? `×${it.quantity}` : ''}
            </Text>
          </View>
        ))}
        {assignedItems.length > 5 && (
          <View style={styles.itemChipMore}>
            <Text style={styles.chipTextMore}>+{assignedItems.length - 5} altele</Text>
          </View>
        )}
      </View>

      {onStartShopping ? (
        <Pressable
          hitSlop={6}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={() => {
            triggerHaptic('light');
            onStartShopping(
              retailer.name,
              assignedItems.map((a) => a.itemId)
            );
          }}
        >
          <SymbolView
            name={isDelivery ? 'cart.fill' : 'checklist'}
            size={14}
            tintColor={C.primary}
            fallback={<Text style={styles.actionFallback}>✓</Text>}
          />
          <Text style={styles.actionBtnText}>
            {isDelivery ? `Checklist & comandă ${retailer.name}` : `Checklist în ${retailer.name}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.rule,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  leftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  nameBlock: {
    justifyContent: 'center',
    flex: 1,
  },
  storeName: {
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.primary,
  },
  channelBadge: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12,
    color: C.muted,
    marginTop: 1,
  },
  rightInfo: {
    alignItems: 'flex-end',
  },
  subtotal: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 16,
    color: C.primary,
  },
  feeNote: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
    marginTop: 1,
  },
  movWarning: {
    backgroundColor: C.grapefruit,
    borderRadius: BeavyRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  movWarningText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.primary,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  itemChip: {
    backgroundColor: C.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BeavyRadius.sm,
    maxWidth: 170,
  },
  chipText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.primary,
  },
  itemChipMore: {
    backgroundColor: C.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BeavyRadius.sm,
  },
  chipTextMore: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 11,
    color: C.primary,
  },
  actionBtn: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.rule,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  actionBtnPressed: {
    opacity: 0.78,
  },
  actionFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  actionBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.primary,
  },
});
