import { SymbolView, type SFSymbol } from 'expo-symbols';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import {
  CATALOG_CATEGORIES,
  type CategoryDepartmentGroup,
} from '@/services/beavy-catalog-search';

const AISLE_SYMBOLS: Record<string, SFSymbol> = {
  lapte: 'drop.fill',
  oua: 'oval.portrait.fill',
  paine: 'fork.knife',
  'toast-chifle': 'square.split.2x1.fill',
  'iaurt-kefir': 'takeoutbag.and.cup.and.straw.fill',
  branzeturi: 'circle.grid.2x2.fill',
  'unt-smantana': 'square.stack.3d.down.right.fill',
  'legume-proaspete': 'leaf.fill',
  'fructe-proaspete': 'sparkles',
  'verdeata-ierburi': 'leaf.arrow.triangle.circlepath',
  'cartofi-radacinoase': 'circle.hexagongrid.fill',
  ciuperci: 'cloud.fill',
  'paste-orez': 'tray.2.fill',
  'faina-malai-cereale': 'archivebox.fill',
  'sosuri-condimente': 'flame.fill',
  'zahar-indulcitori': 'cube.fill',
  'tofu-tempeh': 'square.on.square',
  leguminoase: 'circle.grid.3x3.fill',
  cafea: 'cup.and.saucer.fill',
  'ceai-infuzii': 'mug.fill',
  'ulei-otet': 'drop.triangle.fill',
  conserve: 'cylinder.fill',
  apa: 'waterbottle.fill',
  'sucuri-nectaruri': 'wineglass.fill',
  racoritoare: 'bubbles.and.sparkles.fill',
};

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro-RO')
    .trim();
}

const FALLBACK_DEPARTMENTS: CategoryDepartmentGroup[] = [
  {
    id: 'fallback-dairy',
    slug: 'lactate-oua',
    name: 'Lactate și Ouă',
    totalProducts: 0,
    items: CATALOG_CATEGORIES.filter((c) =>
      ['lapte', 'oua', 'iaurt-kefir', 'branzeturi', 'unt-smantana'].includes(c.id)
    ).map((c, idx) => ({
      id: c.id,
      parent_id: 'fallback-dairy',
      slug: c.slug ?? c.id,
      name: c.name,
      sort_order: idx * 10,
      product_count: 0,
    })),
  },
  {
    id: 'fallback-fresh',
    slug: 'fructe-legume',
    name: 'Brutărie, Fructe și Legume',
    totalProducts: 0,
    items: CATALOG_CATEGORIES.filter((c) =>
      ['paine', 'legume-proaspete', 'fructe-proaspete'].includes(c.id)
    ).map((c, idx) => ({
      id: c.id,
      parent_id: 'fallback-fresh',
      slug: c.slug ?? c.id,
      name: c.name,
      sort_order: idx * 10,
      product_count: 0,
    })),
  },
  {
    id: 'fallback-pantry',
    slug: 'bacanie',
    name: 'Băcănie și Băuturi',
    totalProducts: 0,
    items: CATALOG_CATEGORIES.filter((c) =>
      ['paste-orez', 'cafea', 'ulei-otet', 'conserve', 'apa'].includes(c.id)
    ).map((c, idx) => ({
      id: c.id,
      parent_id: 'fallback-pantry',
      slug: c.slug ?? c.id,
      name: c.name,
      sort_order: idx * 10,
      product_count: 0,
    })),
  },
];

type AislePickerModalProps = {
  visible: boolean;
  activeSlug: string | null;
  departments?: CategoryDepartmentGroup[];
  onSelectCategory: (slug: string | null) => void;
  onClose: () => void;
};

/**
 * Selector modular de departamente și raioane alimentare pentru Căutare.
 */
export function AislePickerModal({
  visible,
  activeSlug,
  departments,
  onSelectCategory,
  onClose,
}: AislePickerModalProps) {
  const [aisleFilter, setAisleFilter] = useState('');

  const handleClose = () => {
    setAisleFilter('');
    onClose();
  };

  const handlePick = (slug: string | null) => {
    triggerHaptic('selection');
    setAisleFilter('');
    onSelectCategory(slug);
    onClose();
  };

  const effectiveDepartments = useMemo(() => {
    if (departments && departments.length > 0) return departments;
    return FALLBACK_DEPARTMENTS;
  }, [departments]);

  const filteredDepartments = useMemo(() => {
    const normQuery = normalizeSearch(aisleFilter);
    if (!normQuery) return effectiveDepartments;

    return effectiveDepartments
      .map((dept) => {
        const deptMatch = normalizeSearch(dept.name).includes(normQuery);
        const matchingItems = deptMatch
          ? dept.items
          : dept.items.filter((item) =>
              normalizeSearch(item.name).includes(normQuery)
            );
        return {
          ...dept,
          items: matchingItems,
        };
      })
      .filter((dept) => dept.items.length > 0);
  }, [effectiveDepartments, aisleFilter]);

  const totalCategoriesCount = useMemo(
    () => effectiveDepartments.reduce((acc, d) => acc + d.items.length, 0),
    [effectiveDepartments]
  );

  return (
    <BeavySheetModal visible={visible} onClose={handleClose} maxHeightRatio="86%">
      <View style={styles.sheetInner}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.title}>Raioanele din cămară</Text>
            <Text style={styles.subtitle}>
              {totalCategoriesCount} categorii alimentare active
            </Text>
          </View>

          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              handleClose();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Închide"
          >
            <SymbolView
              name="xmark"
              tintColor={C.primary}
              size={14}
              fallback={<Text style={styles.closeFallback}>✕</Text>}
            />
          </Pressable>
        </View>

        <View style={styles.searchBar}>
          <SymbolView
            name="magnifyingglass"
            tintColor={C.muted}
            size={15}
            fallback={<Text style={styles.searchFallback}>⌕</Text>}
          />
          <TextInput
            value={aisleFilter}
            onChangeText={setAisleFilter}
            placeholder="Caută un raion (ex: brânzeturi, lactate)..."
            placeholderTextColor={C.muted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {aisleFilter.length > 0 && (
            <Pressable
              onPress={() => setAisleFilter('')}
              hitSlop={8}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>×</Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {!aisleFilter.trim() && (
            <Pressable
              onPress={() => handlePick(null)}
              style={({ pressed }) => [
                styles.allTile,
                activeSlug === null && styles.allTileActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <SymbolView
                name="square.grid.2x2.fill"
                tintColor={activeSlug === null ? C.surface : C.primary}
                size={15}
                fallback={
                  <Text
                    style={[
                      styles.allFallback,
                      activeSlug === null && styles.allTitleActive,
                    ]}
                  >
                    ⊞
                  </Text>
                }
              />
              <Text
                style={[styles.allTitle, activeSlug === null && styles.allTitleActive]}
              >
                Toată cămara (produse populare)
              </Text>
            </Pressable>
          )}

          {filteredDepartments.length === 0 ? (
            <BeavySurface variant="elevated" style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                {`Niciun raion nu se potrivește cu „${aisleFilter.trim()}”.`}
              </Text>
            </BeavySurface>
          ) : (
            filteredDepartments.map((dept) => (
              <View key={dept.id} style={styles.deptSection}>
                <View style={styles.deptHeader}>
                  <Text style={styles.deptTitle}>{dept.name}</Text>
                  {dept.totalProducts > 0 && (
                    <Text style={styles.deptCount}>{dept.totalProducts} prod.</Text>
                  )}
                </View>

                <BeavySurface variant="elevated" style={styles.deptCard}>
                  {dept.items.map((cat, idx) => {
                    const isActive = activeSlug === cat.slug;
                    const isLast = idx === dept.items.length - 1;
                    const iconName = AISLE_SYMBOLS[cat.slug] ?? 'tag.fill';

                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => handlePick(cat.slug)}
                        style={({ pressed }) => [
                          styles.aisleRow,
                          !isLast && styles.aisleRowBorder,
                          isActive && styles.aisleRowActive,
                          pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                      >
                        <View
                          style={[
                            styles.aisleIconBox,
                            isActive && styles.aisleIconBoxActive,
                          ]}
                        >
                          <SymbolView
                            name={iconName}
                            tintColor={isActive ? C.surface : C.primary}
                            size={14}
                            fallback={
                              <Text
                                style={[
                                  styles.aisleFallback,
                                  isActive && styles.aisleTitleActive,
                                ]}
                              >
                                •
                              </Text>
                            }
                          />
                        </View>
                        <Text
                          style={[
                            styles.aisleTitle,
                            isActive && styles.aisleTitleActive,
                          ]}
                        >
                          {cat.name}
                        </Text>
                        {cat.product_count > 0 && (
                          <Text style={styles.aisleCount}>{cat.product_count}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </BeavySurface>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  sheetInner: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 12,
    flexShrink: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 20,
    color: C.primary,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12.5,
    color: C.muted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 14,
    minHeight: 44,
    gap: 8,
  },
  searchFallback: {
    fontSize: 16,
    color: C.muted,
  },
  searchInput: {
    flex: 1,
    fontFamily: BeavyFonts.semiBold,
    fontSize: 14,
    color: C.primary,
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  scrollArea: {
    maxHeight: 440,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 16,
  },
  allTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  allTileActive: {
    backgroundColor: C.primary,
  },
  allFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.primary,
  },
  allTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  allTitleActive: {
    color: C.surface,
  },
  emptyBox: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 13.5,
    color: C.muted,
  },
  deptSection: {
    gap: 6,
  },
  deptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  deptTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 12,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  deptCount: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
  },
  deptCard: {
    paddingVertical: 2,
  },
  aisleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    minHeight: 48,
    paddingVertical: 10,
  },
  aisleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  aisleRowActive: {
    backgroundColor: 'rgba(232, 220, 207, 0.45)',
  },
  aisleIconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aisleIconBoxActive: {
    backgroundColor: C.primary,
  },
  aisleFallback: {
    fontSize: 13,
    color: C.primary,
  },
  aisleTitle: {
    flex: 1,
    fontFamily: BeavyFonts.bold,
    fontSize: 13.5,
    color: C.primary,
  },
  aisleTitleActive: {
    color: C.primary,
  },
  aisleCount: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.75,
  },
});
