import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { type StyleProps } from 'react-native-reanimated';

import { ChecklistItemRow } from '@/components/checklist-item-row';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type { ShoppingItem, ShoppingList } from '@/context/shopping-context';
import type { AisleGroup } from '@/services/beavy-aisle-classifier';

type ActiveListPanelProps = {
  listsCount: number;
  activeList: ShoppingList | null;
  shoppingItems: ShoppingItem[];
  uncheckedItems: ShoppingItem[];
  checkedItems: ShoppingItem[];
  uncheckedUnits: number;
  checkedUnits: number;
  buyListExpanded: boolean;
  listExpanded: boolean;
  checkedSectionOpen: boolean;
  sortByAisles?: boolean;
  sortMode?: 'aisle' | 'recent' | 'alphabetical';
  aisleGroups: AisleGroup[] | null;
  displayedUncheckedItems: ShoppingItem[];
  sheetAnimatedStyle: StyleProps;
  getResolvedImageUrl: (item: ShoppingItem) => string | null | undefined;
  onToggleBuyListExpanded: () => void;
  onToggleListExpanded: () => void;
  onToggleCheckedSection: () => void;
  onToggleSortByAisles?: () => void;
  onChangeSortMode?: (mode: 'aisle' | 'recent' | 'alphabetical') => void;
  onShareList: () => void;
  onToggleItem: (itemId: string) => void;
  onQuantityChange: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
  onLongPressItem: (item: ShoppingItem) => void;
  onClearChecked: () => void;
  onOpenListsSheet: () => void;
  onOpenCreateList: () => void;
};

/**
 * Afișarea listei active „De cumpărat” (cu grupare pe raioane și steppere)
 * plus istoricul compact „Achiziționate” sau starea goală editorială.
 */
export function ActiveListPanel({
  listsCount,
  activeList,
  shoppingItems,
  uncheckedItems,
  checkedItems,
  uncheckedUnits,
  checkedUnits,
  buyListExpanded,
  listExpanded,
  checkedSectionOpen,
  sortByAisles,
  sortMode,
  aisleGroups,
  displayedUncheckedItems,
  sheetAnimatedStyle,
  getResolvedImageUrl,
  onToggleBuyListExpanded,
  onToggleListExpanded,
  onToggleCheckedSection,
  onToggleSortByAisles,
  onChangeSortMode,
  onShareList,
  onToggleItem,
  onQuantityChange,
  onRemoveItem,
  onLongPressItem,
  onClearChecked,
  onOpenListsSheet,
  onOpenCreateList,
}: ActiveListPanelProps) {
  if (listsCount === 0 || !activeList) {
    return (
      <BeavySurface variant="elevated" style={styles.emptyCard}>
        <View style={styles.emptyRowTop}>
          <View style={styles.emptyIconCircle}>
            <SymbolView
              name="list.bullet.rectangle"
              tintColor={C.primary}
              size={16}
              fallback={<Text style={styles.fallbackGlyph}>☰</Text>}
            />
          </View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>
              {listsCount === 0
                ? 'Nu ai încă o listă activă'
                : 'Nicio listă selectată'}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            if (listsCount === 0) onOpenCreateList();
            else onOpenListsSheet();
          }}
          hitSlop={6}
          style={({ pressed }) => [styles.emptyCtaBtn, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.emptyCtaText}>
            {listsCount === 0 ? 'Creează prima listă' : 'Alege o listă'}
          </Text>
        </Pressable>
      </BeavySurface>
    );
  }

  if (shoppingItems.length === 0) {
    return (
      <BeavySurface variant="elevated" style={styles.emptyCard}>
        <View style={styles.emptyRowTop}>
          <View style={styles.emptyIconCircle}>
            <SymbolView
              name="basket"
              tintColor={C.primary}
              size={15}
              fallback={<Text style={styles.fallbackGlyph}>○</Text>}
            />
          </View>
          <View style={styles.emptyCopy}>
            <Text numberOfLines={1} style={styles.emptyTitle}>
              {`„${activeList.name}” este goală`}
            </Text>
          </View>
          {listsCount > 1 && (
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onOpenListsSheet();
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.switchLinkBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Schimbă lista activă"
            >
              <Text style={styles.switchLinkText}>Schimbă</Text>
            </Pressable>
          )}
        </View>
      </BeavySurface>
    );
  }

  const effectiveSortMode: 'aisle' | 'recent' | 'alphabetical' =
    sortMode ?? (sortByAisles ? 'aisle' : 'recent');

  const handleCycleSortMode = () => {
    triggerHaptic('selection');
    const nextMode: 'aisle' | 'recent' | 'alphabetical' =
      effectiveSortMode === 'aisle'
        ? 'recent'
        : effectiveSortMode === 'recent'
        ? 'alphabetical'
        : 'aisle';
    if (onChangeSortMode) {
      onChangeSortMode(nextMode);
    } else if (onToggleSortByAisles) {
      onToggleSortByAisles();
    }
  };

  const sortLabel =
    effectiveSortMode === 'aisle'
      ? 'Traseu magazin'
      : effectiveSortMode === 'recent'
      ? 'Cronologic'
      : 'Alfabetic A-Z';

  const sortIcon =
    effectiveSortMode === 'aisle'
      ? 'map.fill'
      : effectiveSortMode === 'recent'
      ? 'clock.fill'
      : 'textformat.abc';

  const isAisleMode = effectiveSortMode === 'aisle';

  return (
    <View style={styles.stack}>
      {uncheckedItems.length > 0 && (
        <Animated.View style={sheetAnimatedStyle}>
          <BeavySurface
            variant="elevated"
            style={[
              styles.card,
              !buyListExpanded && styles.cardCollapsed,
            ]}
          >
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onToggleBuyListExpanded();
              }}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityState={{ expanded: buyListExpanded }}
              style={({ pressed }) => [
                styles.accordionHeader,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.headerLeft}>
                <View style={styles.statusDot} />
                <Text numberOfLines={1} style={styles.headerTitle}>
                  De cumpărat
                </Text>
                <View style={styles.summaryPill}>
                  <Text numberOfLines={1} style={styles.summaryText}>
                    {`${uncheckedItems.length} ${
                      uncheckedItems.length === 1 ? 'produs' : 'produse'
                    }`}
                  </Text>
                </View>
              </View>

              <View style={styles.chevronCircle}>
                <SymbolView
                  name={buyListExpanded ? 'chevron.up' : 'chevron.down'}
                  tintColor={C.primary}
                  size={12}
                  fallback={
                    <Text style={styles.fallbackGlyph}>
                      {buyListExpanded ? '▴' : '▾'}
                    </Text>
                  }
                />
              </View>
            </Pressable>

            {buyListExpanded && (
              <View style={styles.expandedBody}>
                <View style={styles.toolbarRow}>
                  <Pressable
                    onPress={handleCycleSortMode}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.toolChip,
                      isAisleMode && styles.toolChipActive,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Ordonare: ${sortLabel}. Apasă pentru a schimba ordinea.`}
                  >
                    <SymbolView
                      name={sortIcon as never}
                      tintColor={isAisleMode ? C.surface : C.primary}
                        size={11}
                        fallback={
                          <Text
                            style={[
                              styles.fallbackGlyph,
                              isAisleMode && styles.toolChipTextActive,
                            ]}
                          >
                            {isAisleMode ? '•' : effectiveSortMode === 'recent' ? '•' : 'AZ'}
                          </Text>
                        }
                      />
                      <Text
                        style={[
                          styles.toolChipText,
                          isAisleMode && styles.toolChipTextActive,
                        ]}
                      >
                        {sortLabel}
                      </Text>
                      <Text
                        style={[
                          styles.toolChipIndicator,
                          isAisleMode && styles.toolChipIndicatorActive,
                        ]}
                      >
                        ⇄
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={onShareList}
                      hitSlop={6}
                      style={({ pressed }) => [styles.toolChip, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel="Trimite lista"
                    >
                      <SymbolView
                        name="square.and.arrow.up"
                        tintColor={C.primary}
                        size={12}
                        fallback={<Text style={styles.fallbackGlyph}>↗</Text>}
                      />
                      <Text style={styles.toolChipText}>Trimite</Text>
                    </Pressable>

                    {uncheckedItems.length > 4 && !isAisleMode && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          onToggleListExpanded();
                        }}
                        hitSlop={6}
                        style={({ pressed }) => [styles.toolChip, pressed && styles.pressed]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.toolChipText}>
                          {listExpanded
                            ? 'Restrânge'
                            : `Toate (${uncheckedItems.length})`}
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {isAisleMode && aisleGroups && aisleGroups.length > 0 ? (
                    <View style={styles.aisleStack}>
                      {aisleGroups.map((group) => (
                        <View key={group.id} style={styles.aisleSection}>
                          <View style={styles.aisleHeader}>
                            <View style={styles.aisleHeaderLeft}>
                              <View style={styles.aisleStepCircle}>
                                <Text style={styles.aisleStepText}>{group.step}</Text>
                              </View>
                              <SymbolView
                                name={group.iconSymbol as never}
                                tintColor={C.primary}
                                size={12}
                                fallback={
                                  <Text style={styles.fallbackGlyph}>
                                    {group.fallbackIcon}
                                  </Text>
                                }
                              />
                              <Text style={styles.aisleTitle}>{group.name}</Text>
                            </View>
                            <View style={styles.aisleCountBadge}>
                              <Text style={styles.aisleCountText}>
                                {group.items.length}
                              </Text>
                            </View>
                          </View>

                          {group.items.map((item, idx) => (
                            <ChecklistItemRow
                              key={item.id}
                              item={item}
                              variant="flat"
                              isLast={idx === group.items.length - 1}
                              resolvedImageUrl={getResolvedImageUrl(item)}
                              onToggle={onToggleItem}
                              onQuantityChange={onQuantityChange}
                              onRemove={onRemoveItem}
                              onLongPressItem={onLongPressItem}
                            />
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View>
                      {displayedUncheckedItems.map((item, idx) => (
                      <ChecklistItemRow
                        key={item.id}
                        item={item}
                        variant="flat"
                        isLast={idx === displayedUncheckedItems.length - 1}
                        resolvedImageUrl={getResolvedImageUrl(item)}
                        onToggle={onToggleItem}
                        onQuantityChange={onQuantityChange}
                        onRemove={onRemoveItem}
                        onLongPressItem={onLongPressItem}
                      />
                    ))}
                  </View>
                )}

                {!sortByAisles && !listExpanded && uncheckedItems.length > 4 && (
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      onToggleListExpanded();
                    }}
                    hitSlop={8}
                    style={styles.moreHintBtn}
                    accessibilityRole="button"
                  >
                    <Text style={styles.moreHintText}>
                      {`+ încă ${uncheckedItems.length - 4}`}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </BeavySurface>
        </Animated.View>
      )}

      {checkedItems.length > 0 && (
        <BeavySurface
          variant="elevated"
          style={[styles.card, !checkedSectionOpen && styles.cardCollapsed]}
        >
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              onToggleCheckedSection();
            }}
            hitSlop={4}
            style={({ pressed }) => [styles.accordionHeader, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: checkedSectionOpen }}
          >
            <View style={styles.headerLeft}>
              <View style={styles.checkedDot}>
                <SymbolView
                  name="checkmark"
                  tintColor={C.leekDark}
                  size={10}
                  fallback={<Text style={styles.fallbackGlyph}>✓</Text>}
                />
              </View>
              <Text numberOfLines={1} style={styles.checkedTitle}>
                {`Achiziționate (${checkedItems.length})`}
              </Text>
            </View>

            <View style={styles.chevronCircle}>
              <SymbolView
                name={checkedSectionOpen ? 'chevron.up' : 'chevron.down'}
                tintColor={C.primary}
                size={12}
                fallback={
                  <Text style={styles.fallbackGlyph}>
                    {checkedSectionOpen ? '▴' : '▾'}
                  </Text>
                }
              />
            </View>
          </Pressable>

          {checkedSectionOpen && (
            <View style={styles.expandedBody}>
              <View style={styles.checkedHeaderRow}>
                <Text style={styles.checkedHintText}>
                  Debifează pentru a readuce în coș
                </Text>
                <Pressable
                  onPress={onClearChecked}
                  hitSlop={8}
                  style={styles.clearCheckedBtn}
                  accessibilityRole="button"
                >
                  <SymbolView
                    name="trash"
                    tintColor={C.primary}
                    size={11}
                    fallback={<Text style={styles.fallbackGlyph}>×</Text>}
                  />
                  <Text style={styles.clearCheckedText}>Curăță bifatele</Text>
                </Pressable>
              </View>

              {checkedItems.map((item, idx) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  variant="flat"
                  isLast={idx === checkedItems.length - 1}
                  resolvedImageUrl={getResolvedImageUrl(item)}
                  onToggle={onToggleItem}
                  onQuantityChange={onQuantityChange}
                  onRemove={onRemoveItem}
                  onLongPressItem={onLongPressItem}
                />
              ))}
            </View>
          )}
        </BeavySurface>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10,
  },
  emptyCard: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  emptyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    fontFamily: BeavyFonts.regular,
    lineHeight: 16,
    color: C.muted,
  },
  emptyCtaBtn: {
    alignSelf: 'flex-start',
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    minHeight: 38,
    paddingHorizontal: 15,
    justifyContent: 'center',
  },
  emptyCtaText: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.surface,
  },
  switchLinkBtn: {
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    minHeight: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  switchLinkText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  card: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 12,
  },
  cardCollapsed: {
    paddingBottom: 2,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingVertical: 6,
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.accent,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.2,
  },
  summaryPill: {
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    flexShrink: 1,
  },
  summaryText: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  chevronCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  expandedBody: {
    borderTopWidth: 1,
    borderTopColor: C.rule,
    paddingTop: 9,
    gap: 6,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 4,
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    minHeight: 32,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  toolChipActive: {
    backgroundColor: C.primary,
  },
  toolChipText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  toolChipTextActive: {
    color: C.surface,
  },
  toolChipIndicator: {
    fontSize: 10,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
  },
  toolChipIndicatorActive: {
    color: C.surface,
    opacity: 0.8,
  },
  aisleStack: {
    gap: 8,
  },
  aisleSection: {
    gap: 2,
  },
  aisleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  aisleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aisleStepCircle: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aisleStepText: {
    fontSize: 9.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.surface,
  },
  aisleTitle: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  aisleCountBadge: {
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  aisleCountText: {
    fontSize: 10,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  moreHintBtn: {
    paddingTop: 6,
    alignItems: 'center',
    minHeight: 34,
    justifyContent: 'center',
  },
  moreHintText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  checkedDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.leek,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedTitle: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
    flexShrink: 1,
  },
  checkedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 4,
  },
  checkedHintText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    flexShrink: 1,
  },
  clearCheckedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.secondary,
  },
  clearCheckedText: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  fallbackGlyph: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  pressed: {
    opacity: 0.72,
  },
});
