import React from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { BeavyBadge, type BeavyBadgeTone } from '@/components/ui/beavy-badge';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { BeavyColors as C, BeavyFonts } from '@/constants/theme';

type BeavyMetricTileProps = {
  overline: string;
  value: string;
  caption?: string;
  badgeLabel?: string;
  badgeTone?: BeavyBadgeTone;
  tone?: 'elevated' | 'tonal' | 'positive';
  style?: StyleProp<ViewStyle>;
};

/**
 * Bloc analitic compact în stil Tremor / shadcn-fintech cu cifre aliniate tabular.
 */
export function BeavyMetricTile({
  overline,
  value,
  caption,
  badgeLabel,
  badgeTone = 'positive',
  tone = 'elevated',
  style,
}: BeavyMetricTileProps) {
  const surfaceVariant = tone === 'elevated' ? 'elevated' : 'tonal';

  return (
    <BeavySurface
      variant={surfaceVariant}
      style={[styles.tile, tone === 'positive' && styles.positiveBg, style]}
    >
      <Text numberOfLines={1} style={styles.overline}>
        {overline}
      </Text>

      <View style={styles.valueRow}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          style={[styles.value, tone === 'positive' && styles.positiveValue]}
        >
          {value}
        </Text>
        {badgeLabel ? <BeavyBadge label={badgeLabel} tone={badgeTone} size="sm" /> : null}
      </View>

      {caption ? (
        <Text numberOfLines={2} style={styles.caption}>
          {caption}
        </Text>
      ) : null}
    </BeavySurface>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  positiveBg: {
    backgroundColor: C.leek,
  },
  overline: {
    fontSize: 10.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    color: C.muted,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  value: {
    fontSize: 20,
    lineHeight: 24,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  positiveValue: {
    color: C.leekDark,
  },
  caption: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
    color: C.muted,
    lineHeight: 15,
  },
});
