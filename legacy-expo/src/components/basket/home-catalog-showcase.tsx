import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BeavyCatalogProductCard } from '@/components/product/beavy-product-card';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import {
  type DisplayProduct,
  fetchCatalogProductsPage,
} from '@/services/beavy-catalog-search';

type HomeCatalogShowcaseProps = {
  hasBasketItems: boolean;
  getProductQuantity: (productId: string) => number;
  onProductStep: (product: DisplayProduct, nextQty: number) => void;
  onInspectProduct: (product: DisplayProduct) => void;
  onSelectSmartPrompt: (prompt: string) => void;
  onLoadDemoBaskets: () => void;
  onOpenFullCatalog: () => void;
};

const QUICK_INTENT_CHIPS = [
  {
    label: 'Somon cu sparanghel (2 pers.)',
    prompt: 'Cină cu somon la cuptor cu sparanghel pentru 2 persoane',
    icon: 'fork.knife' as const,
  },
  {
    label: 'Paste Carbonara (4 pers.)',
    prompt: 'Paste carbonara pentru 4 persoane',
    icon: 'fork.knife' as const,
  },
  {
    label: 'Ciorbă de văcuță',
    prompt: 'Ce îmi trebuie pentru ciorbă de văcuță?',
    icon: 'fork.knife' as const,
  },
  {
    label: 'Listă rapidă: 2 lapte, pâine, ouă, unt',
    prompt: '2 lapte, pâine, 10 ouă, banane, unt 82%',
    icon: 'list.bullet' as const,
  },
] as const;

const SHOWCASE_FILTERS = [
  { id: 'all', label: 'Top 9 Magazine', retailerSlug: null, promoOnly: false },
  { id: 'promo', label: 'Oferte & Card', retailerSlug: null, promoOnly: true },
  { id: 'lidl', label: 'Lidl', retailerSlug: 'lidl', promoOnly: false },
  { id: 'kaufland', label: 'Kaufland', retailerSlug: 'kaufland', promoOnly: false },
  { id: 'carrefour', label: 'Carrefour', retailerSlug: 'carrefour', promoOnly: false },
  { id: 'auchan', label: 'Auchan', retailerSlug: 'auchan', promoOnly: false },
  { id: 'mega-image', label: 'Mega Image', retailerSlug: 'mega-image', promoOnly: false },
] as const;

/**
 * Secțiune interactivă pe ecranul principal (`index.tsx`):
 * 1. Scurtături rapide pentru Rețete cu cost/porție și Liste multi-produs;
 * 2. Explorator live de produse comparate în cele 9 supermarketuri, cu mini-grilă de prețuri și adăugare 1-tap.
 */
export function HomeCatalogShowcase({
  hasBasketItems,
  getProductQuantity,
  onProductStep,
  onInspectProduct,
  onSelectSmartPrompt,
  onLoadDemoBaskets,
  onOpenFullCatalog,
}: HomeCatalogShowcaseProps) {
  const [filterId, setFilterId] = useState<(typeof SHOWCASE_FILTERS)[number]['id']>('all');
  const [dataState, setDataState] = useState<{
    filterId: string;
    products: DisplayProduct[];
  } | null>(null);

  const activeFilter =
    SHOWCASE_FILTERS.find((f) => f.id === filterId) ?? SHOWCASE_FILTERS[0];
  const loading = dataState === null || dataState.filterId !== filterId;
  const products = dataState?.products ?? [];

  useEffect(() => {
    let cancelled = false;
    fetchCatalogProductsPage({
      query: '',
      categorySlug: null,
      brand: null,
      retailerSlug: activeFilter.retailerSlug,
      promoOnly: activeFilter.promoOnly,
      sort: 'stores_desc',
      limit: 10,
      offset: 0,
      includeFamilies: false,
    })
      .then((res) => {
        if (!cancelled) {
          setDataState({ filterId, products: res.products });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataState({ filterId, products: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filterId, activeFilter.retailerSlug, activeFilter.promoOnly]);

  return (
    <View style={styles.wrap}>
      {/* Scurtături inteligente (Rețete & Liste rapide) */}
      <View style={styles.quickSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.overline}>
            {hasBasketItems ? 'ADAUGĂ RAPID O REȚETĂ SAU LISTĂ' : 'ÎNCEPE ÎN 3 SECUNDE'}
          </Text>
          {!hasBasketItems && (
            <Pressable
              onPress={() => {
                triggerHaptic('medium');
                onLoadDemoBaskets();
              }}
              hitSlop={6}
              accessibilityRole="button"
            >
              <Text style={styles.demoLink}>Încarcă coșuri demo →</Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {QUICK_INTENT_CHIPS.map((chip) => (
            <Pressable
              key={chip.label}
              onPress={() => {
                triggerHaptic('light');
                onSelectSmartPrompt(chip.prompt);
              }}
              style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
            >
              <SymbolView
                name={chip.icon}
                tintColor={C.primary}
                size={13}
                fallback={<Text style={styles.quickGlyph}>✦</Text>}
              />
              <Text style={styles.quickChipText}>{chip.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Explorator de produse comparate în cele 9 magazine */}
      <View style={styles.catalogSection}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.overline}>CATALOG CANONIC MULTI-MAGAZIN</Text>
            <Text style={styles.sectionTitle}>
              Comparate live în 9 supermarketuri
            </Text>
          </View>
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              onOpenFullCatalog();
            }}
            style={({ pressed }) => [styles.fullCatalogBtn, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.fullCatalogBtnText}>Tot catalogul →</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {SHOWCASE_FILTERS.map((f) => {
            const active = f.id === filterId;
            return (
              <Pressable
                key={f.id}
                onPress={() => {
                  if (!active) {
                    triggerHaptic('selection');
                    setFilterId(f.id);
                  }
                }}
                style={[styles.filterPill, active && styles.filterPillActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <BeavySurface variant="elevated" style={styles.productsSheet}>
          {loading ? (
            <Text style={styles.statusText}>
              Încărcăm produsele cu cea mai mare acoperire în magazine…
            </Text>
          ) : products.length === 0 ? (
            <Text style={styles.statusText}>
              Niciun produs găsit pentru filtrul selectat.
            </Text>
          ) : (
            products.map((prod, idx) => (
              <BeavyCatalogProductCard
                key={prod.id}
                product={prod}
                quantity={getProductQuantity(prod.id)}
                variant="catalog"
                isLast={idx === products.length - 1}
                onPressInspect={onInspectProduct}
                onStepQuantity={onProductStep}
              />
            ))
          )}
        </BeavySurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 18,
    marginTop: 10,
  },
  quickSection: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overline: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.7,
  },
  sectionTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 18,
    color: C.primary,
    letterSpacing: -0.4,
    marginTop: 1,
  },
  demoLink: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 12,
    color: C.primary,
  },
  quickRow: {
    gap: 8,
    paddingVertical: 2,
  },
  quickChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.grapefruit,
    borderWidth: 1,
    borderColor: C.rule,
  },
  quickGlyph: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 13,
    color: C.primary,
  },
  quickChipText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12.5,
    color: C.primary,
  },
  catalogSection: {
    gap: 10,
  },
  fullCatalogBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullCatalogBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 12,
    color: C.primary,
  },
  filterRow: {
    gap: 6,
  },
  filterPill: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  filterPillText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12.5,
    color: C.primary,
  },
  filterPillTextActive: {
    color: C.surface,
  },
  productsSheet: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusText: {
    paddingVertical: 18,
    fontFamily: BeavyFonts.medium,
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});
