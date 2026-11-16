import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import { formatLei } from '@/services/live-basket';

type InStoreBarProps = {
  storeName: string;
  inCart: number;
  remaining: number;
  checkedCount: number;
  onScan: () => void;
  onFinish: () => void;
  onExit: () => void;
};

/**
 * Bara fixă a modului „Sunt în magazin”: contor mare coș fizic / rămas, scanare raft și finalizare.
 */
export function InStoreBar({
  storeName,
  inCart,
  remaining,
  checkedCount,
  onScan,
  onFinish,
  onExit,
}: InStoreBarProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.store} numberOfLines={1}>
          În magazin · {storeName}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ieși din modul magazin"
          onPress={() => {
            triggerHaptic('selection');
            onExit();
          }}
          style={({ pressed }) => [styles.exit, pressed && styles.pressed]}
        >
          <Text style={styles.exitText}>Ieși</Text>
        </Pressable>
      </View>

      <Text style={styles.counter} accessibilityLiveRegion="polite">
        În coșul fizic: {formatLei(inCart)}
        <Text style={styles.counterMuted}> · Rămas pe listă: {formatLei(remaining)}</Text>
      </Text>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scanează codul de bare de la raft"
          onPress={() => {
            triggerHaptic('light');
            onScan();
          }}
          style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
        >
          <SymbolView
            name="barcode.viewfinder"
            size={18}
            tintColor={C.cherry}
            fallback={<Text style={styles.glyph}>▯</Text>}
          />
          <Text style={styles.btnGhostText}>Verifică preț la raft</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Finalizează cumpărăturile"
          disabled={checkedCount === 0}
          onPress={() => {
            triggerHaptic('success');
            onFinish();
          }}
          style={({ pressed }) => [
            styles.btn,
            styles.btnPrimary,
            checkedCount === 0 && styles.btnDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.btnPrimaryText}>Gata ({checkedCount})</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: C.grapefruit,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  store: {
    flex: 1,
    fontSize: 12.5,
    color: C.cherry,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
  },
  exit: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  exitText: { fontSize: 14, color: C.cherry, fontFamily: BeavyFonts.extraBold, fontWeight: '800' },
  counter: {
    fontSize: 22,
    lineHeight: 28,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  counterMuted: { fontSize: 15, color: C.muted, fontFamily: BeavyFonts.bold, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    minHeight: 48,
    borderRadius: BeavyRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  btnGhost: { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.rule },
  btnGhostText: { fontSize: 13.5, color: C.cherry, fontFamily: BeavyFonts.bold, fontWeight: '700' },
  btnPrimary: { backgroundColor: C.cherry, minWidth: 104 },
  btnPrimaryText: {
    fontSize: 14,
    color: C.white,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  btnDisabled: { opacity: 0.4 },
  glyph: { fontSize: 14, color: C.cherry },
  pressed: { opacity: 0.8 },
});
