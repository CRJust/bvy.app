import { SymbolView } from 'expo-symbols';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';

type DeliveryRule = {
  storeId: string;
  name: string;
  channel: 'physical' | 'online' | 'hybrid';
  deliveryFee: number;
  freeDeliveryThreshold: number | null;
  minOrder: number;
  note: string;
};

const RETAILER_DELIVERY_RULES: DeliveryRule[] = [
  {
    storeId: 'lidl',
    name: 'Lidl',
    channel: 'physical',
    deliveryFee: 0,
    freeDeliveryThreshold: null,
    minOrder: 0,
    note: 'Doar în magazin fizic',
  },
  {
    storeId: 'kaufland',
    name: 'Kaufland',
    channel: 'physical',
    deliveryFee: 0,
    freeDeliveryThreshold: null,
    minOrder: 0,
    note: 'Doar în magazin fizic (sau Glovo/Tazz)',
  },
  {
    storeId: 'penny',
    name: 'PENNY',
    channel: 'physical',
    deliveryFee: 0,
    freeDeliveryThreshold: null,
    minOrder: 0,
    note: 'Doar în magazin fizic',
  },
  {
    storeId: 'profi',
    name: 'Profi',
    channel: 'physical',
    deliveryFee: 0,
    freeDeliveryThreshold: null,
    minOrder: 0,
    note: 'Doar în magazin fizic',
  },
  {
    storeId: 'carrefour',
    name: 'Carrefour',
    channel: 'hybrid',
    deliveryFee: 14.99,
    freeDeliveryThreshold: 200,
    minOrder: 70,
    note: 'Livrare 14,99 lei · Gratuit peste 200 lei (Min. 70 lei)',
  },
  {
    storeId: 'auchan',
    name: 'Auchan',
    channel: 'hybrid',
    deliveryFee: 14.9,
    freeDeliveryThreshold: 199,
    minOrder: 75,
    note: 'Livrare 14,90 lei · Gratuit peste 199 lei (Min. 75 lei)',
  },
  {
    storeId: 'mega_image',
    name: 'Mega Image',
    channel: 'hybrid',
    deliveryFee: 12.9,
    freeDeliveryThreshold: 150,
    minOrder: 50,
    note: 'Livrare 12,90 lei · Gratuit peste 150 lei (Min. 50 lei)',
  },
  {
    storeId: 'freshful',
    name: 'Freshful',
    channel: 'online',
    deliveryFee: 15.0,
    freeDeliveryThreshold: 220,
    minOrder: 100,
    note: 'Online · Livrare 15,00 lei · Gratuit peste 220 lei (Min. 100 lei)',
  },
  {
    storeId: 'sezamo',
    name: 'Sezamo',
    channel: 'online',
    deliveryFee: 14.9,
    freeDeliveryThreshold: 200,
    minOrder: 100,
    note: 'Online · Livrare 14,90 lei · Gratuit cu Sezamo Xtra sau peste 200 lei (Min. 100 lei)',
  },
];

type DeliveryRulesModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function DeliveryRulesModal({
  visible,
  onClose,
}: DeliveryRulesModalProps) {
  return (
    <BeavySheetModal visible={visible} onClose={onClose} maxHeightRatio="85%">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <SymbolView
              name="shippingbox.fill"
              size={20}
              tintColor={C.cherry}
              fallback={<Text style={styles.fallbackIcon}>📦</Text>}
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.subtitleKicker}>POLITICI DE LIVRARE & COMENZI</Text>
            <Text style={styles.title}>Reguli de livrare cele 9 supermarketuri</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.rulesList}>
            {RETAILER_DELIVERY_RULES.map((rule, idx) => {
              const isPhysicalOnly = rule.channel === 'physical';
              return (
                <View
                  key={rule.storeId}
                  style={[
                    styles.ruleCard,
                    idx > 0 && styles.ruleCardBorder,
                  ]}
                >
                  <View style={styles.ruleTopRow}>
                    <View style={styles.retailerRow}>
                      <RetailerLogo retailerName={rule.name} size={22} shape="circle" />
                      <Text style={styles.retailerName}>{rule.name}</Text>
                    </View>
                    <View
                      style={[
                        styles.channelBadge,
                        isPhysicalOnly
                          ? styles.channelBadgePhysical
                          : rule.channel === 'online'
                            ? styles.channelBadgeOnline
                            : styles.channelBadgeHybrid,
                      ]}
                    >
                      <Text
                        style={[
                          styles.channelBadgeText,
                          isPhysicalOnly
                            ? styles.channelBadgeTextPhysical
                            : styles.channelBadgeTextOnline,
                        ]}
                      >
                        {isPhysicalOnly
                          ? 'Magazin fizic'
                          : rule.channel === 'online'
                            ? 'Online'
                            : 'Fizic + Online'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.ruleNote}>{rule.note}</Text>

                  {!isPhysicalOnly && (
                    <View style={styles.metricsRow}>
                      <View style={styles.metric}>
                        <Text style={styles.metricLabel}>TAXĂ LIVRARE</Text>
                        <Text style={styles.metricValue}>
                          {`${rule.deliveryFee.toFixed(2)} lei`}
                        </Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metric}>
                        <Text style={styles.metricLabel}>GRATUIT PESTE</Text>
                        <Text style={styles.metricValue}>
                          {rule.freeDeliveryThreshold
                            ? `${rule.freeDeliveryThreshold} lei`
                            : '—'}
                        </Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metric}>
                        <Text style={styles.metricLabel}>COMANDĂ MIN.</Text>
                        <Text style={styles.metricValue}>
                          {`${rule.minOrder} lei`}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              triggerHaptic('selection');
              onClose();
            }}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          >
            <Text style={styles.closeBtnText}>Închide</Text>
          </Pressable>
        </View>
      </View>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.grapefruit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    fontSize: 20,
    color: C.cherry,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  subtitleKicker: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 17,
    color: C.cherry,
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  rulesList: {
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    overflow: 'hidden',
  },
  ruleCard: {
    padding: 14,
    gap: 8,
  },
  ruleCardBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
  },
  ruleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  retailerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retailerName: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 14,
    color: C.cherry,
  },
  channelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BeavyRadius.pill,
  },
  channelBadgePhysical: {
    backgroundColor: C.grapefruit,
  },
  channelBadgeOnline: {
    backgroundColor: C.leek,
  },
  channelBadgeHybrid: {
    backgroundColor: C.buttermilk,
    borderWidth: 1,
    borderColor: C.rule,
  },
  channelBadgeText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
  },
  channelBadgeTextPhysical: {
    color: C.cherry,
  },
  channelBadgeTextOnline: {
    color: C.cherry,
  },
  ruleNote: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.muted,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: C.rule,
  },
  metricLabel: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 8.5,
    color: C.muted,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.cherry,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
    backgroundColor: C.white,
  },
  closeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.cherry,
  },
  closeBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.white,
  },
  pressed: {
    opacity: 0.8,
  },
});
