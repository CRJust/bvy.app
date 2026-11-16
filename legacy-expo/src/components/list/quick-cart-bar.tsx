import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { type StyleProps } from 'react-native-reanimated';

import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  BeavyShadows,
  triggerHaptic,
} from '@/constants/theme';

type QuickCartBarProps = {
  totalUnits: number;
  distinctItemsCount: number;
  countCircleAnimatedStyle: StyleProps;
  onPressCart: () => void;
};

/**
 * Bara flotantă principală pentru acces rapid la comparația coșului.
 */
export function QuickCartBar({
  totalUnits,
  distinctItemsCount,
  countCircleAnimatedStyle,
  onPressCart,
}: QuickCartBarProps) {
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable
        onPress={() => {
          triggerHaptic('medium');
          onPressCart();
        }}
        hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }}
        accessibilityRole="button"
        accessibilityLabel={`${totalUnits} ${
          totalUnits === 1 ? 'bucată' : 'bucăți'
        } în coș (${distinctItemsCount} ${
          distinctItemsCount === 1 ? 'produs distinct' : 'produse distincte'
        }). Vezi coșul`}
        style={({ pressed }) => [styles.bar, pressed && styles.barPressed]}
      >
        <View style={styles.leftGroup}>
          <Animated.View style={[styles.countCircle, countCircleAnimatedStyle]}>
            <Text style={styles.countText}>{totalUnits}</Text>
          </Animated.View>
          <View style={styles.textGroup}>
            <Text numberOfLines={1} style={styles.titleText}>
              {totalUnits === 1 ? 'bucată în coș' : 'bucăți în coș'}
            </Text>
            <Text numberOfLines={1} style={styles.distinctMeta}>
              {`· ${distinctItemsCount} prod.`}
            </Text>
          </View>
        </View>

        <View style={styles.rightGroup}>
          <Text style={styles.ctaText}>Vezi coșul</Text>
          <SymbolView
            name="arrow.right"
            tintColor={C.accent}
            size={13}
            fallback={<Text style={styles.arrowFallback}>→</Text>}
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
    backgroundColor: C.background,
    borderTopWidth: 1,
    borderTopColor: C.rule,
    flexShrink: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    minHeight: 40,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 15,
    gap: 8,
    ...BeavyShadows.floating,
  },
  barPressed: {
    backgroundColor: C.primarySoft,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    minWidth: 0,
  },
  countCircle: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: C.primary,
    fontSize: 12,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  textGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  titleText: {
    color: C.surface,
    fontSize: 13.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  distinctMeta: {
    color: C.secondary,
    fontSize: 11.5,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    flexShrink: 0,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  ctaText: {
    color: C.surface,
    fontSize: 12.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  arrowFallback: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '800',
  },
});
