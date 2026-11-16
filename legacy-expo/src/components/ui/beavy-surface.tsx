import React from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { BeavyColors as C, BeavyRadius, BeavyShadows } from '@/constants/theme';

type BeavySurfaceProps = {
  children: React.ReactNode;
  variant?: 'elevated' | 'tonal' | 'inset';
  style?: StyleProp<ViewStyle>;
};

/**
 * Suprafață editorială fără borduri excesive — separare curată prin elevație și ton cald.
 */
export function BeavySurface({
  children,
  variant = 'elevated',
  style,
}: BeavySurfaceProps) {
  return (
    <View
      style={[
        styles.base,
        variant === 'elevated' && styles.elevated,
        variant === 'tonal' && styles.tonal,
        variant === 'inset' && styles.inset,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BeavyRadius.xl,
    overflow: 'hidden',
  },
  elevated: {
    backgroundColor: C.surface,
    ...BeavyShadows.card,
  },
  tonal: {
    backgroundColor: C.secondary,
  },
  inset: {
    backgroundColor: C.background,
  },
});
