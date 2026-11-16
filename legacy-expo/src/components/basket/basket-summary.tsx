import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import { type BasketPricingMode, type BasketTotals, formatLei } from '@/services/live-basket';

type BasketSummaryProps = {
  storeName: string | null;
  totals: BasketTotals;
  mode: BasketPricingMode;
  /** Există cel puțin o alternativă de marcă proprie (comutatorul are efect). */
  canEconomy: boolean;
  onChangeMode: (mode: BasketPricingMode) => void;
  onEnterStoreMode: () => void;
  onOpenCompare?: () => void;
  loading?: boolean;
};

/**
 * Rezumatul coșului: total la magazinul activ, comutator global Fidel / Economie Maximă
 * și intrarea în modul „Sunt în magazin”.
 */
export function BasketSummary({
  storeName,
  totals,
  mode,
  canEconomy,
  onChangeMode,
  onEnterStoreMode,
  onOpenCompare,
  loading,
}: BasketSummaryProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.totalBlock}>
          <Text style={styles.label} numberOfLines={1}>
            {storeName ? `Total la ${storeName}` : 'Total coș'}
          </Text>
          <Text style={[styles.total, loading && styles.totalLoading]} accessibilityLiveRegion="polite">
            {formatLei(totals.total)}
          </Text>
          {totals.missingCount > 0 ? (
            <Text style={styles.warn}>
              {totals.missingCount === 1
                ? '1 produs fără ofertă aici'
                : `${totals.missingCount} produse fără ofertă aici`}
            </Text>
          ) : totals.economySavings > 0 && mode === 'economy' ? (
            <View style={styles.savingBadge}>
              <Text style={styles.savingText}>Economisești {formatLei(totals.economySavings)}</Text>
            </View>
          ) : totals.promoSavings > 0 ? (
            <View style={styles.savingBadge}>
              <Text style={styles.savingText}>Din oferte: −{formatLei(totals.promoSavings)}</Text>
            </View>
          ) : null}
        </View>

        {storeName ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sunt în magazin, ${storeName}`}
            onPress={() => {
              triggerHaptic('medium');
              onEnterStoreMode();
            }}
            style={({ pressed }) => [styles.storeCta, pressed && styles.pressed]}
          >
            <SymbolView
              name="figure.walk"
              size={16}
              tintColor={C.white}
              fallback={<Text style={styles.ctaGlyph}>→</Text>}
            />
            <Text style={styles.ctaText}>Sunt în magazin</Text>
          </Pressable>
        ) : null}
      </View>

      {onOpenCompare ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compară coșul pe toate magazinele"
          onPress={() => {
            triggerHaptic('light');
            onOpenCompare();
          }}
          style={({ pressed }) => [styles.compareLink, pressed && styles.pressed]}
        >
          <Text style={styles.compareLinkText}>Compară produs cu produs în toate magazinele →</Text>
        </Pressable>
      ) : null}

      <View style={styles.modeTrack} accessibilityRole="tablist">
        {(
          [
            { id: 'faithful', label: 'Mod Fidel' },
            { id: 'economy', label: 'Economie Maximă' },
          ] as const
        ).map((opt) => {
          const active = mode === opt.id;
          const disabled = opt.id === 'economy' && !canEconomy && !active;
          return (
            <Pressable
              key={opt.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled }}
              accessibilityLabel={
                opt.id === 'faithful'
                  ? 'Mod Fidel: exact brandurile alese'
                  : 'Mod Economie Maximă: înlocuiește cu mărci proprii echivalente'
              }
              disabled={disabled}
              onPress={() => {
                if (active) return;
                triggerHaptic('selection');
                onChangeMode(opt.id);
              }}
              style={({ pressed }) => [
                styles.modeBtn,
                active && styles.modeBtnActive,
                disabled && styles.modeBtnDisabled,
                pressed && !active && styles.pressed,
              ]}
            >
              <Text style={[styles.modeText, active && styles.modeTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingTop: 14, paddingBottom: 6 },
  topRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  totalBlock: { flex: 1, gap: 2 },
  label: { fontSize: 12.5, color: C.muted, fontFamily: BeavyFonts.semiBold, fontWeight: '600' },
  total: {
    fontSize: 32,
    lineHeight: 38,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  totalLoading: { opacity: 0.6 },
  warn: { fontSize: 12.5, color: C.muted, fontFamily: BeavyFonts.semiBold },
  savingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
  },
  savingText: {
    fontSize: 12,
    color: C.cherry,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  storeCta: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.cherry,
  },
  ctaGlyph: { color: C.white, fontSize: 14, fontFamily: BeavyFonts.extraBold },
  ctaText: { color: C.white, fontSize: 14, fontFamily: BeavyFonts.extraBold, fontWeight: '800' },
  pressed: { opacity: 0.8 },
  compareLink: { minHeight: 44, justifyContent: 'center' },
  compareLinkText: { fontSize: 13, color: C.cherry, fontFamily: BeavyFonts.extraBold, fontWeight: '800' },
  modeTrack: {
    flexDirection: 'row',
    backgroundColor: 'rgba(232, 220, 207, 0.55)',
    borderRadius: BeavyRadius.pill,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: BeavyRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  modeBtnActive: { backgroundColor: C.cherry },
  modeBtnDisabled: { opacity: 0.45 },
  modeText: { fontSize: 13, color: C.muted, fontFamily: BeavyFonts.bold, fontWeight: '700' },
  modeTextActive: { color: C.white },
});
