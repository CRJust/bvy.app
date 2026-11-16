import { SymbolView } from 'expo-symbols';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BeavyBadge } from '@/components/ui/beavy-badge';
import { BeavyMetricTile } from '@/components/ui/beavy-metric-tile';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type { OutboundClickRecord } from '@/context/shopping-context';
import { summarizeOutboundClicks } from '@/lib/open-external-store';

type PartnerClicksCardProps = {
  clicks: OutboundClickRecord[];
  onClearClicks: () => void;
  onLoadDemoBaskets?: () => void;
};

/**
 * Panou compact de măsurare a traficului trimis către magazine (UTM + intenție coș).
 * Util pentru demonstrații către parteneri și validarea ratelor de conversie outbound.
 */
export function PartnerClicksCard({
  clicks,
  onClearClicks,
  onLoadDemoBaskets,
}: PartnerClicksCardProps) {
  const summary = useMemo(() => summarizeOutboundClicks(clicks), [clicks]);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Măsurare click-uri parteneri</Text>
        <View style={styles.headerActions}>
          {onLoadDemoBaskets && (
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onLoadDemoBaskets();
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.demoBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Încarcă cele 2 coșuri Demo"
            >
              <Text style={styles.demoBtnText}>Coșuri Demo</Text>
            </Pressable>
          )}
          {summary.totalClicks > 0 && (
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onClearClicks();
              }}
              hitSlop={8}
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Resetează contorul de click-uri"
            >
              <Text style={styles.clearText}>Resetează</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.metricsRow}>
        <BeavyMetricTile
          tone="tonal"
          overline="Click-uri magazine"
          value={`${summary.totalClicks}`}
        />

        <BeavyMetricTile
          tone="elevated"
          overline="Valoare trimisă"
          value={`${summary.totalReferredRon.toFixed(2)} RON`}
        />
      </View>

      {summary.byRetailer.length === 0 ? (
        <BeavySurface variant="elevated" style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <SymbolView
              name="arrow.up.right.square"
              tintColor={C.primary}
              size={15}
              fallback={<Text style={styles.fallbackGlyph}>↗</Text>}
            />
          </View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>Niciun click extern înregistrat încă</Text>
          </View>
        </BeavySurface>
      ) : (
        <BeavySurface variant="elevated" style={styles.listCard}>
          {summary.byRetailer.map((row, idx) => {
            const isLast = idx === summary.byRetailer.length - 1;
            const dateStr = new Date(row.lastClickedAt).toLocaleTimeString('ro-RO', {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <View
                key={`${row.retailerSlug ?? row.retailerName}`}
                style={[styles.row, isLast && styles.rowLast]}
              >
                <RetailerLogo
                  retailerName={row.retailerName}
                  slug={row.retailerSlug}
                  size={32}
                  shape="rounded"
                />

                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {row.retailerName}
                  </Text>
                  <Text numberOfLines={1} style={styles.rowMeta}>
                    {`${row.clicks} ${row.clicks === 1 ? 'click' : 'click-uri'} · ultimul la ${dateStr}`}
                  </Text>
                </View>

                <View style={styles.rowRight}>
                  {row.referredRon > 0 && (
                    <Text style={styles.rowRon}>{`${row.referredRon.toFixed(2)} RON`}</Text>
                  )}
                  <BeavyBadge label="UTM activ" tone="positive" />
                </View>
              </View>
            );
          })}
        </BeavySurface>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 16,
    color: C.primary,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  demoBtn: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoBtnText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 11.5,
    color: C.primary,
  },
  clearText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12.5,
    color: C.muted,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
  },
  emptyIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCopy: {
    flex: 1,
    gap: 2,
  },
  emptyTitle: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13.5,
    color: C.primary,
  },
  emptySub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: C.muted,
  },
  listCard: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13.5,
    color: C.primary,
  },
  rowMeta: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11.5,
    color: C.muted,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rowRon: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13,
    color: C.primary,
  },
  fallbackGlyph: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
  },
  pressed: {
    opacity: 0.72,
  },
});
