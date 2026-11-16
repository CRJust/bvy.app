import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProductImageBox } from '@/components/product-image-box';
import { QuantityStepper } from '@/components/quantity-stepper';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type { ShoppingItem } from '@/context/shopping-context';
import {
  type DisplayProduct,
  fetchCatalogProductsPage,
} from '@/services/beavy-catalog-search';
import type { UserPreferenceMemory } from '@/services/beavy-intelligence';

type PantryFrequentCardProps = {
  preferenceMemory: UserPreferenceMemory;
  purchasedItems: ShoppingItem[];
  getProductQuantity: (productId: string, canonicalName?: string) => number;
  onStepProduct: (product: DisplayProduct, nextQty: number) => void;
};

/**
 * Cămara Mea & Produse Frecvente (1-Tap Re-Add):
 * Reunește produsele canonice învățate din alegerile utilizatorului, produsele achiziționate recent
 * și produsele esențiale de cămară din catalogul canonic, pentru re-adăugare cu 1 tap în listă.
 */
export function PantryFrequentCard({
  preferenceMemory,
  purchasedItems,
  getProductQuantity,
  onStepProduct,
}: PantryFrequentCardProps) {
  const [fallbackStaples, setFallbackStaples] = useState<DisplayProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCatalogProductsPage({
      query: '',
      categorySlug: null,
      brand: null,
      sort: 'stores_desc',
      limit: 6,
      offset: 0,
      includeFamilies: false,
    })
      .then((res) => {
        if (!cancelled) setFallbackStaples(res.products);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const frequentProducts = useMemo(() => {
    const byId = new Map<string, DisplayProduct>();

    for (const learned of Object.values(preferenceMemory.learnedResolutions ?? {})) {
      if (!learned.productId || byId.has(learned.productId)) continue;
      byId.set(learned.productId, {
        id: learned.productId,
        canonical_name: learned.canonicalName,
        brand: learned.brand ?? null,
        package_size: learned.packageSize ?? null,
        image_url: null,
      });
    }

    for (const item of purchasedItems) {
      if (!item.productId || byId.has(item.productId)) continue;
      byId.set(item.productId, {
        id: item.productId,
        canonical_name: item.name,
        brand: item.brand ?? null,
        package_size: item.packageSize ?? null,
        image_url: item.imageUrl ?? null,
      });
    }

    for (const staple of fallbackStaples) {
      if (byId.size >= 8) break;
      if (!byId.has(staple.id)) {
        byId.set(staple.id, staple);
      }
    }

    return Array.from(byId.values()).slice(0, 8);
  }, [preferenceMemory.learnedResolutions, purchasedItems, fallbackStaples]);

  if (frequentProducts.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.overline}>CĂMARĂ & RE-ADĂUGARE CU 1 TAP</Text>
          <Text style={styles.title}>Produse cumpărate frecvent</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{`${frequentProducts.length} produse`}</Text>
        </View>
      </View>

      <BeavySurface variant="elevated" style={styles.card}>
        {frequentProducts.map((prod, idx) => {
          const isLast = idx === frequentProducts.length - 1;
          const qty = getProductQuantity(prod.id, prod.canonical_name);
          const meta = [prod.brand, prod.package_size].filter(Boolean).join(' · ');

          return (
            <View
              key={prod.id}
              style={[styles.row, !isLast && styles.rowBorder]}
            >
              <ProductImageBox
                imageUrl={prod.image_url}
                productName={prod.canonical_name}
                brand={prod.brand}
                variant="thumb"
              />

              <View style={styles.copyCol}>
                <Text numberOfLines={1} style={styles.prodName}>
                  {prod.canonical_name}
                </Text>
                <Text numberOfLines={1} style={styles.prodMeta}>
                  {meta || 'Produs frecvent în cămară'}
                </Text>
              </View>

              {qty === 0 ? (
                <Pressable
                  onPress={() => {
                    triggerHaptic('medium');
                    onStepProduct(prod, 1);
                  }}
                  style={({ pressed }) => [styles.reAddBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Re-adaugă ${prod.canonical_name} în listă`}
                >
                  <Text style={styles.reAddBtnText}>+ În coș</Text>
                </Pressable>
              ) : (
                <QuantityStepper
                  quantity={qty}
                  variant="card"
                  onDecrement={() => {
                    triggerHaptic('selection');
                    onStepProduct(prod, qty - 1);
                  }}
                  onIncrement={() => {
                    triggerHaptic('light');
                    onStepProduct(prod, qty + 1);
                  }}
                />
              )}
            </View>
          );
        })}
      </BeavySurface>
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
    paddingHorizontal: 2,
  },
  overline: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.7,
  },
  title: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 17,
    color: C.primary,
    letterSpacing: -0.3,
  },
  countPill: {
    backgroundColor: C.leek,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: BeavyRadius.pill,
  },
  countPillText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 11,
    color: C.primary,
  },
  card: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  copyCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  prodName: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13.5,
    color: C.primary,
  },
  prodMeta: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
  },
  reAddBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reAddBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 12,
    color: C.surface,
  },
  pressed: {
    opacity: 0.78,
  },
});
