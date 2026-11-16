import { SymbolView } from 'expo-symbols';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import { formatLei } from '@/services/live-basket';

export type ReceiptAuditItem = {
  id: string;
  name: string;
  quantity: number;
  expectedUnitPrice: number;
  actualUnitPrice?: number;
};

type ReceiptAuditModalProps = {
  visible: boolean;
  onClose: () => void;
  storeName: string;
  estimatedTotal: number;
  items: ReceiptAuditItem[];
  onSaveAudit?: (receiptTotal: number, accuracyPct: number) => void;
};

export function ReceiptAuditModal({
  visible,
  onClose,
  storeName,
  estimatedTotal,
  items,
  onSaveAudit,
}: ReceiptAuditModalProps) {
  const [receiptTotalInput, setReceiptTotalInput] = useState('');
  const [actualUnitPrices, setActualUnitPrices] = useState<Record<string, number>>({});

  const computedSubtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const unit = actualUnitPrices[item.id] ?? item.expectedUnitPrice;
      return sum + unit * item.quantity;
    }, 0);
  }, [items, actualUnitPrices]);

  const parsedReceiptInput = useMemo(() => {
    const raw = receiptTotalInput.replace(',', '.').trim();
    const val = Number(raw);
    return Number.isFinite(val) && val > 0 ? Math.round(val * 100) / 100 : null;
  }, [receiptTotalInput]);

  const finalReceiptTotal = parsedReceiptInput ?? computedSubtotal;
  const deltaRon = Math.round((finalReceiptTotal - estimatedTotal) * 100) / 100;
  const accuracyPct =
    finalReceiptTotal > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              (1 - Math.abs(deltaRon) / Math.max(estimatedTotal, 1)) * 1000
            ) / 10
          )
        )
      : 100;

  const handleSave = () => {
    triggerHaptic('success');
    if (onSaveAudit) {
      onSaveAudit(finalReceiptTotal, accuracyPct);
    }
    onClose();
  };

  const handleUpdateLinePrice = (id: string, text: string) => {
    const val = Number(text.replace(',', '.').trim());
    if (Number.isFinite(val) && val >= 0) {
      setActualUnitPrices((prev) => ({ ...prev, [id]: val }));
    } else if (!text.trim()) {
      setActualUnitPrices((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  return (
    <BeavySheetModal visible={visible} onClose={onClose} maxHeightRatio="90%">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <SymbolView
              name="doc.text.magnifyingglass"
              size={20}
              tintColor={C.cherry}
              fallback={<Text style={styles.fallbackIcon}>🧾</Text>}
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.subtitleKicker}>AUDIT BON FISCAL</Text>
            <Text style={styles.title}>Verificare rezultat · {storeName}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Accuracy Card */}
          <View style={styles.accuracyCard}>
            <View style={styles.accuracyRow}>
              <View style={styles.accuracyStat}>
                <Text style={styles.statLabel}>ESTIMAT BEAVY</Text>
                <Text style={styles.statValue}>{formatLei(estimatedTotal)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.accuracyStat}>
                <Text style={styles.statLabel}>TOTAL PE BON</Text>
                <Text style={styles.statValuePrimary}>
                  {formatLei(finalReceiptTotal)}
                </Text>
              </View>
            </View>

            <View style={styles.accuracyBadgeRow}>
              <View
                style={[
                  styles.accuracyPill,
                  accuracyPct >= 95
                    ? styles.accuracyPillHigh
                    : styles.accuracyPillMedium,
                ]}
              >
                <Text
                  style={[
                    styles.accuracyPillText,
                    accuracyPct >= 95
                      ? styles.accuracyPillTextHigh
                      : styles.accuracyPillTextMedium,
                  ]}
                >
                  {`Acuratețe predicție: ${accuracyPct}%`}
                </Text>
              </View>
              <Text style={styles.deltaText}>
                {deltaRon === 0
                  ? 'Potrivire 100% exactă!'
                  : deltaRon > 0
                    ? `Diferență: +${deltaRon.toFixed(2).replace('.', ',')} lei`
                    : `Diferență: −${Math.abs(deltaRon).toFixed(2).replace('.', ',')} lei`}
              </Text>
            </View>
          </View>

          {/* Manual Receipt Total Input */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>
              INTRODU TOTALUL FINAL DE PE BONUL DE CASĂ
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                value={receiptTotalInput}
                onChangeText={setReceiptTotalInput}
                placeholder={`ex: ${estimatedTotal.toFixed(2)}`}
                placeholderTextColor={C.muted}
                keyboardType="decimal-pad"
                style={styles.textInput}
              />
              <Text style={styles.currencySuffix}>lei</Text>
            </View>
            <Text style={styles.inputHint}>
              Dacă lași liber, calculăm automat din prețurile de raft de mai jos.
            </Text>
          </View>

          {/* Product Items Breakdown */}
          <View style={styles.itemsSection}>
            <Text style={styles.itemsSectionTitle}>
              {`PRODUSE DIN COȘ (${items.length}) · ESTIMAT VS. RAFT`}
            </Text>
            <View style={styles.itemsTable}>
              {items.map((item, idx) => {
                const currentUnit = actualUnitPrices[item.id] ?? item.expectedUnitPrice;
                const lineTotal = currentUnit * item.quantity;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.itemRow,
                      idx > 0 && styles.itemRowBorder,
                    ]}
                  >
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {`${item.quantity}× · estimat ${formatLei(item.expectedUnitPrice)} / buc`}
                      </Text>
                    </View>
                    <View style={styles.itemPriceCol}>
                      <View style={styles.linePriceEditRow}>
                        <TextInput
                          placeholder={item.expectedUnitPrice.toFixed(2)}
                          placeholderTextColor={C.muted}
                          defaultValue={
                            actualUnitPrices[item.id] !== undefined
                              ? String(actualUnitPrices[item.id])
                              : ''
                          }
                          onChangeText={(txt) => handleUpdateLinePrice(item.id, txt)}
                          keyboardType="decimal-pad"
                          style={styles.linePriceInput}
                        />
                        <Text style={styles.linePriceUnit}>lei</Text>
                      </View>
                      <Text style={styles.itemLineTotal}>{formatLei(lineTotal)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={handleSave}
            style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
          >
            <SymbolView
              name="checkmark"
              size={16}
              tintColor={C.white}
              fallback={<Text style={styles.btnGlyph}>✓</Text>}
            />
            <Text style={styles.saveBtnText}>Confirmă și salvează bonul</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.grapefruit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    fontSize: 20,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  subtitleKicker: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 17,
    color: C.cherry,
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  accuracyCard: {
    padding: 16,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    gap: 12,
  },
  accuracyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accuracyStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: C.rule,
  },
  statLabel: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.5,
  },
  statValue: {
    fontFamily: BeavyFonts.bold,
    fontSize: 16,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  statValuePrimary: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 18,
    color: C.cherry,
    fontVariant: ['tabular-nums'],
  },
  accuracyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
    flexWrap: 'wrap',
    gap: 8,
  },
  accuracyPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
  },
  accuracyPillHigh: {
    backgroundColor: C.leek,
  },
  accuracyPillMedium: {
    backgroundColor: C.grapefruit,
  },
  accuracyPillText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  accuracyPillTextHigh: {
    color: C.cherry,
  },
  accuracyPillTextMedium: {
    color: C.cherry,
  },
  deltaText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11.5,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  inputSection: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BeavyRadius.md,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    paddingHorizontal: 14,
  },
  textInput: {
    flex: 1,
    height: 44,
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.cherry,
  },
  currencySuffix: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.muted,
  },
  inputHint: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
  },
  itemsSection: {
    gap: 8,
  },
  itemsSectionTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.5,
  },
  itemsTable: {
    borderRadius: BeavyRadius.md,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  itemRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.cherry,
  },
  itemMeta: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  itemPriceCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  linePriceEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  linePriceInput: {
    minWidth: 54,
    height: 26,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BeavyRadius.sm,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.rule,
    fontFamily: BeavyFonts.semiBold,
    fontSize: 11.5,
    color: C.cherry,
    textAlign: 'right',
  },
  linePriceUnit: {
    fontFamily: BeavyFonts.medium,
    fontSize: 10.5,
    color: C.muted,
  },
  itemLineTotal: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.cherry,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
    backgroundColor: C.white,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.cherry,
  },
  saveBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.white,
  },
  btnGlyph: {
    fontSize: 14,
    color: C.white,
  },
  pressed: {
    opacity: 0.8,
  },
});
