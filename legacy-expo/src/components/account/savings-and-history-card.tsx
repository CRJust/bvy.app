import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
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
import type { ShoppingSessionRecord } from '@/context/shopping-context';

type SavingsAndHistoryCardProps = {
  history: ShoppingSessionRecord[];
  purchasedCount: number;
  onClearHistory: () => void;
};

/**
 * Istoric de cumpărături și economii verificate obținute din sesiunile finalizate.
 */
export function SavingsAndHistoryCard({
  history,
  purchasedCount,
  onClearHistory,
}: SavingsAndHistoryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const totalVerifiedSavings =
    Math.round(
      history.reduce((sum, item) => sum + (item.verifiedSavings || 0), 0) * 100
    ) / 100;
  const totalPurchasedItems = history.reduce((sum, item) => sum + item.itemsCount, 0);
  const visibleSessions = expanded ? history : history.slice(0, 3);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Istoric și economii verificate</Text>
        {history.length > 0 && (
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              onClearHistory();
            }}
            hitSlop={8}
            style={({ pressed }) => [pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Curăță istoricul sesiunilor"
          >
            <Text style={styles.clearActionText}>Curăță istoric</Text>
          </Pressable>
        )}
      </View>

      {/* Sumar KPI verificat (Tremor/Fintech tiles) */}
      <View style={styles.summaryRow}>
        <BeavyMetricTile
          tone="positive"
          overline="Economii verificate"
          value={`${totalVerifiedSavings.toFixed(2)} RON`}
        />

        <BeavyMetricTile
          tone="elevated"
          overline="Produse cumpărate"
          value={`${history.length > 0 ? totalPurchasedItems : purchasedCount}`}
        />
      </View>

      {history.length === 0 ? (
        <BeavySurface variant="elevated" style={styles.emptyHistoryCard}>
          <View style={styles.emptyIconCircle}>
            <SymbolView
              name="clock.arrow.circlepath"
              tintColor={C.primary}
              size={16}
              fallback={<Text style={styles.fallbackGlyph}>↺</Text>}
            />
          </View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>Nicio sesiune finalizată încă</Text>
          </View>
        </BeavySurface>
      ) : (
        <BeavySurface variant="elevated" style={styles.historyListCard}>
          {visibleSessions.map((session, idx) => {
            const isLast = idx === visibleSessions.length - 1;
            const dateStr = new Date(session.completedAt).toLocaleDateString(
              'ro-RO',
              { day: '2-digit', month: 'short' }
            );

            return (
              <View
                key={session.id}
                style={[styles.historyRow, isLast && styles.historyRowLast]}
              >
                <RetailerLogo
                  retailerName={session.retailerName}
                  slug={session.retailerSlug}
                  size={34}
                  shape="rounded"
                />

                <View style={styles.historyInfo}>
                  <Text numberOfLines={1} style={styles.historyTitle}>
                    {`${session.retailerName} · ${session.listName}`}
                  </Text>
                  <Text numberOfLines={1} style={styles.historyMeta}>
                    {`${dateStr} · ${
                      session.channelMode === 'online' ? 'Online' : 'Magazin fizic'
                    } · ${session.itemsCount} ${
                      session.itemsCount === 1 ? 'produs' : 'produse'
                    }`}
                  </Text>
                </View>

                <View style={styles.historyAmountCol}>
                  {session.verifiedTotal !== null ? (
                    <Text style={styles.historyTotal}>
                      {`${session.verifiedTotal.toFixed(2)} RON`}
                    </Text>
                  ) : (
                    <Text style={styles.historyNoPrice}>Fără total</Text>
                  )}
                  {session.verifiedSavings > 0 && (
                    <BeavyBadge
                      tone="positive"
                      size="sm"
                      label={`-${session.verifiedSavings.toFixed(2)} RON`}
                    />
                  )}
                </View>
              </View>
            );
          })}

          {history.length > 3 && (
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setExpanded((v) => !v);
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.expandBtn, pressed && styles.pressed]}
            >
              <Text style={styles.expandBtnText}>
                {expanded
                  ? 'Restrânge istoricul'
                  : `Vezi toate cele ${history.length} sesiuni`}
              </Text>
            </Pressable>
          )}
        </BeavySurface>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 12.5,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.75,
  },
  clearActionText: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 3,
  },
  kpiLeek: {
    backgroundColor: 'rgba(219, 227, 198, 0.58)',
  },
  kpiLabel: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.muted,
  },
  kpiValue: {
    fontSize: 20,
    lineHeight: 25,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  kpiSub: {
    fontSize: 11,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
  },
  emptyHistoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 14,
    gap: 12,
  },
  emptyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fallbackGlyph: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  emptyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  emptyTitle: {
    fontSize: 13.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  emptySub: {
    fontSize: 12,
    lineHeight: 16.5,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
  },
  historyListCard: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  historyRowLast: {
    borderBottomWidth: 0,
  },
  storeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  storeCode: {
    fontSize: 11,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  historyInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  historyTitle: {
    fontSize: 13.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  historyMeta: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
  },
  historyAmountCol: {
    alignItems: 'flex-end',
    gap: 3,
    flexShrink: 0,
  },
  historyTotal: {
    fontSize: 13.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  historyNoPrice: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
  },
  savedChip: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },
  savedChipText: {
    fontSize: 10,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.leekDark,
    fontVariant: ['tabular-nums'],
  },
  expandBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: C.rule,
  },
  expandBtnText: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  pressed: {
    opacity: 0.72,
  },
});
