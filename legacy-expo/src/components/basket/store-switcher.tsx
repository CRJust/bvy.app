import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RetailerLogo } from '@/components/ui/retailer-logo';
import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import { formatLei, type StoreOption } from '@/services/live-basket';

type StoreSwitcherProps = {
  options: StoreOption[];
  selectedId: string | null;
  loading?: boolean;
  onSelect: (id: string) => void;
  onOpenCompareMatrix?: () => void;
};

/**
 * Live Store Ribbon — bandă orizontală lipicioasă cu toate supermarketurile ordonate
 * în timp real după costul coșului curent, cu logo oficial, badge „Cel mai ieftin” și diferență în RON.
 */
export function StoreSwitcher({
  options,
  selectedId,
  loading,
  onSelect,
  onOpenCompareMatrix,
}: StoreSwitcherProps) {
  if (options.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <SymbolView
          name="chart.bar.xaxis"
          size={14}
          tintColor={C.cherry}
          fallback={<Text style={styles.emptyGlyph}>≡</Text>}
        />
        <Text style={styles.emptyText} numberOfLines={1}>
          {loading
            ? 'Calculez în timp real prețurile pe cele 9 supermarketuri…'
            : 'Adaugă produse în listă pentru comparația live pe supermarketuri'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.overlineRow}>
        <View style={styles.overlineLeft}>
          <View style={styles.liveDot} />
          <Text style={styles.overlineText}>
            {`PREȚUL LISTEI ÎN ${options.filter((o) => o.kind === 'store').length} SUPERMARKETURI`}
          </Text>
        </View>
        {onOpenCompareMatrix ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Deschide matricea completă produs cu produs"
            onPress={() => {
              triggerHaptic('selection');
              onOpenCompareMatrix();
            }}
            hitSlop={6}
            style={({ pressed }) => [styles.matrixLink, pressed && styles.pillPressed]}
          >
            <Text style={styles.matrixLinkText}>Matrice completă →</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((opt) => {
          const selected = opt.id === selectedId;
          const partial = !opt.isFullCoverage && opt.kind === 'store';
          const deltaLabel =
            opt.kind === 'store' && !opt.isBest && opt.deltaVsBest > 0.05
              ? `+${opt.deltaVsBest.toFixed(2).replace('.', ',')} lei`
              : null;

          return (
            <Pressable
              key={opt.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${opt.name}, ${formatLei(opt.total)}${
                opt.isBest ? ', cel mai ieftin' : ''
              }${partial ? `, doar ${opt.coveredCount} din ${opt.totalItemsCount} produse` : ''}`}
              onPress={() => {
                if (!selected) {
                  triggerHaptic('selection');
                  onSelect(opt.id);
                }
              }}
              style={({ pressed }) => [
                styles.pill,
                opt.isBest && !selected && styles.pillBestUnselected,
                selected && styles.pillSelected,
                pressed && styles.pillPressed,
              ]}
            >
              {opt.kind === 'split' ? (
                <View style={[styles.splitIconCircle, selected && styles.splitIconCircleSelected]}>
                  <SymbolView
                    name="arrow.triangle.branch"
                    size={13}
                    tintColor={selected ? C.cherry : C.white}
                    fallback={
                      <Text style={[styles.glyph, selected && styles.glyphSelected]}>⑂</Text>
                    }
                  />
                </View>
              ) : (
                <RetailerLogo
                  retailerName={opt.name}
                  slug={opt.slug}
                  size={24}
                  shape="circle"
                />
              )}

              <View style={styles.pillCopy}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, selected && styles.nameSelected]} numberOfLines={1}>
                    {opt.name}
                  </Text>
                  {opt.isBest ? (
                    <View style={[styles.bestTag, selected && styles.bestTagSelected]}>
                      <Text style={[styles.bestTagText, selected && styles.bestTagTextSelected]}>
                        #1 Ieftin
                      </Text>
                    </View>
                  ) : opt.kind === 'split' ? (
                    <View style={[styles.bestTag, selected && styles.bestTagSelected]}>
                      <Text style={[styles.bestTagText, selected && styles.bestTagTextSelected]}>
                        Optim
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.priceLine}>
                  <Text style={[styles.total, selected && styles.totalSelected]} numberOfLines={1}>
                    {formatLei(opt.total)}
                  </Text>
                  {partial ? (
                    <Text
                      style={[styles.metaSub, selected && styles.metaSubSelected]}
                      numberOfLines={1}
                    >
                      {`${opt.coveredCount}/${opt.totalItemsCount} prod.`}
                    </Text>
                  ) : deltaLabel ? (
                    <Text
                      style={[styles.metaSub, selected && styles.metaSubSelected]}
                      numberOfLines={1}
                    >
                      {deltaLabel}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: C.buttermilk,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    paddingTop: 4,
  },
  overlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  overlineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.leekDark,
  },
  overlineText: {
    fontSize: 10,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.muted,
    letterSpacing: 0.6,
  },
  matrixLink: {
    paddingVertical: 2,
  },
  matrixLinkText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.cherry,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  pill: {
    minHeight: 52,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
  },
  pillBestUnselected: {
    backgroundColor: C.leek,
    borderColor: C.leekDark,
  },
  pillSelected: {
    backgroundColor: C.cherry,
    borderColor: C.cherry,
  },
  pillPressed: { opacity: 0.82 },
  splitIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.cherry,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitIconCircleSelected: {
    backgroundColor: C.leek,
  },
  glyph: { fontSize: 12, color: C.white, fontFamily: BeavyFonts.extraBold },
  glyphSelected: { color: C.cherry },
  pillCopy: {
    gap: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    fontSize: 12,
    lineHeight: 15,
    color: C.cherry,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
  },
  nameSelected: { color: C.grapefruit },
  bestTag: {
    backgroundColor: C.cherry,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BeavyRadius.pill,
  },
  bestTagSelected: {
    backgroundColor: C.leek,
  },
  bestTagText: {
    fontSize: 9.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.white,
  },
  bestTagTextSelected: {
    color: C.cherry,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  total: {
    fontSize: 14.5,
    lineHeight: 18,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  totalSelected: { color: C.white },
  metaSub: {
    fontSize: 10.5,
    color: C.muted,
    fontFamily: BeavyFonts.semiBold,
    fontVariant: ['tabular-nums'],
  },
  metaSubSelected: {
    color: C.grapefruit,
  },
  emptyWrap: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: C.buttermilk,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  emptyGlyph: {
    fontSize: 13,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
  },
  emptyText: {
    flex: 1,
    fontSize: 12.5,
    color: C.muted,
    fontFamily: BeavyFonts.semiBold,
  },
});
