import React from 'react';
import { type StyleProp, StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native';

import { BeavyColors as C, BeavyFonts, BeavyRadius, BeavySemantics } from '@/constants/theme';

export type BeavyBadgeTone = 'positive' | 'accent' | 'warning' | 'neutral' | 'primary' | 'outline';

type BeavyBadgeProps = {
  label: string;
  tone?: BeavyBadgeTone;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const TONE_MAP: Record<BeavyBadgeTone, { bg: string; fg: string; borderColor?: string }> = {
  positive: { bg: BeavySemantics.positiveBg, fg: BeavySemantics.positiveInk },
  accent: { bg: BeavySemantics.accentBg, fg: BeavySemantics.accentInk },
  warning: { bg: BeavySemantics.warningBg, fg: BeavySemantics.warningInk },
  neutral: { bg: BeavySemantics.neutralBg, fg: BeavySemantics.neutralInk },
  primary: { bg: C.primary, fg: C.surface },
  outline: { bg: 'transparent', fg: C.muted, borderColor: BeavySemantics.divider },
};

/**
 * Pilulă semantică unificată Beavy 2.0 cu contrast garantat WCAG AA.
 */
export function BeavyBadge({
  label,
  tone = 'neutral',
  size = 'sm',
  style,
  textStyle,
}: BeavyBadgeProps) {
  const palette = TONE_MAP[tone];
  const isOutline = tone === 'outline';

  return (
    <View
      style={[
        styles.base,
        size === 'md' ? styles.sizeMd : styles.sizeSm,
        { backgroundColor: palette.bg },
        isOutline && { borderWidth: 1, borderColor: palette.borderColor },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          size === 'md' ? styles.labelMd : styles.labelSm,
          { color: palette.fg },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BeavyRadius.pill,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeSm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sizeMd: {
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  label: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  labelSm: {
    fontSize: 10.5,
    letterSpacing: 0.1,
  },
  labelMd: {
    fontSize: 11.5,
    letterSpacing: 0.15,
  },
});
