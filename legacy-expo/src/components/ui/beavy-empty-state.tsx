import { SymbolView, type SFSymbol } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  BeavyShadows,
  triggerHaptic,
} from '@/constants/theme';

type BeavyEmptyStateProps = {
  symbol: SFSymbol;
  fallbackGlyph: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onPressAction?: () => void;
};

/**
 * Stare goală caldă și aerisită, cu un singur CTA clar către acțiunea principală.
 */
export function BeavyEmptyState({
  symbol,
  fallbackGlyph,
  title,
  description,
  actionLabel,
  onPressAction,
}: BeavyEmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <SymbolView
            name={symbol}
            tintColor={C.primary}
            size={22}
            fallback={<Text style={styles.iconFallback}>{fallbackGlyph}</Text>}
          />
        </View>

        <Text style={styles.title}>{title}</Text>
        {!!description && <Text style={styles.description}>{description}</Text>}

        {actionLabel && onPressAction && (
          <Pressable
            onPress={() => {
              triggerHaptic('medium');
              onPressAction();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text style={styles.primaryBtnText}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.xl,
    paddingHorizontal: 24,
    paddingVertical: 30,
    alignItems: 'center',
    gap: 10,
    ...BeavyShadows.card,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconFallback: {
    fontSize: 18,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  title: {
    fontSize: 19,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    textAlign: 'center',
    letterSpacing: -0.35,
  },
  description: {
    fontSize: 13.5,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 19.5,
    maxWidth: 300,
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    minHeight: 46,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: C.surface,
    fontSize: 13.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
});
