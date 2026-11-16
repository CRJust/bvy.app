import React from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { BeavyColors as C, BeavyFonts, BeavyRadius } from '@/constants/theme';

export type CategoryBarSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type BeavyCategoryBarProps = {
  segments: CategoryBarSegment[];
  height?: number;
  showLegend?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Bară proporțională inspirată de Tremor CategoryBar pentru acoperirea coșului sau distribuția opririlor.
 */
export function BeavyCategoryBar({
  segments,
  height = 8,
  showLegend = true,
  style,
}: BeavyCategoryBarProps) {
  const activeSegments = segments.filter((s) => s.value > 0);
  const total = activeSegments.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) return null;

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.track, { height, borderRadius: height / 2 }]}>
        {activeSegments.map((seg, idx) => (
          <View
            key={seg.key}
            style={[
              styles.segment,
              {
                flex: seg.value,
                backgroundColor: seg.color,
              },
              idx > 0 && styles.segmentGap,
            ]}
          />
        ))}
      </View>

      {showLegend && (
        <View style={styles.legendRow}>
          {activeSegments.map((seg) => (
            <View key={seg.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
              <Text style={styles.legendText}>{seg.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 7,
  },
  track: {
    width: '100%',
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: C.secondary,
  },
  segment: {
    height: '100%',
  },
  segmentGap: {
    borderLeftWidth: 1.5,
    borderLeftColor: C.surface,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: BeavyRadius.pill,
  },
  legendText: {
    fontSize: 11,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
});
