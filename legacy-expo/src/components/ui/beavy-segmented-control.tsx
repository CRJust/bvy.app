import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';

export type SegmentedOption<T extends string> = {
  id: T;
  label: string;
};

type BeavySegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
};

/**
 * Comutator segmentat minimal în paleta Beavy (Cherry pe Sand).
 */
export function BeavySegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: BeavySegmentedControlProps<T>) {
  return (
    <View style={styles.track}>
      {options.map((option) => {
        const active = value === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => {
              if (active) return;
              triggerHaptic('selection');
              onChange(option.id);
            }}
            style={({ pressed }) => [
              styles.optionBtn,
              active && styles.optionBtnActive,
              !active && pressed && styles.optionBtnPressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={[styles.optionText, active && styles.optionTextActive]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 220, 207, 0.55)',
    borderRadius: BeavyRadius.pill,
    padding: 4,
    gap: 4,
  },
  optionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: BeavyRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  optionBtnActive: {
    backgroundColor: C.primary,
  },
  optionBtnPressed: {
    opacity: 0.72,
  },
  optionText: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.muted,
  },
  optionTextActive: {
    color: C.surface,
  },
});
