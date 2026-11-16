import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiListComposerModal } from '@/components/list/ai-list-composer-modal';
import { BeavyCatalogProductCard } from '@/components/product/beavy-product-card';
import { ProductVariantsModal, type VariantsModalTarget } from '@/components/product-variants-modal';
import { RecipeImportModal } from '@/components/recipe/recipe-import-modal';
import { BeavyScreenTransition } from '@/components/screen-transition';
import { BeavyHeader } from '@/components/ui/beavy-header';
import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useShopping } from '@/context/shopping-context';
import { useTabBar } from '@/context/tab-bar-context';
import { type DisplayProduct, fetchCatalogProductsPage } from '@/services/beavy-catalog-search';
import { type ConfirmedScanBatch } from '@/services/beavy-list-scanner';

const RECIPE_STARTERS = [
  'Cină cu somon la cuptor pentru 2 persoane',
  'Paste carbonara pentru 4 persoane',
  'Supă cremă de legume pentru 3 persoane',
  'Clătite cu brânză dulce pentru 4 persoane',
] as const;

const OFFER_STORES = [
  { slug: null, label: 'Toate' },
  { slug: 'lidl', label: 'Lidl' },
  { slug: 'kaufland', label: 'Kaufland' },
  { slug: 'carrefour', label: 'Carrefour' },
] as const;

const OFFERS_LIMIT = 20;

/**
 * Tab 2 — „Rețete & Oferte”: rețete care se transformă direct în coș
 * și reduceri reale din catalogul canonic, filtrate pe magazin.
 */
export default function DiscoverScreen() {
  const {
    preferences,
    activeList,
    addScannedItemsBatch,
    updateCatalogProductQuantity,
    getProductQuantity,
  } = useShopping();
  const { user } = useAuth();
  const { triggerTabTransition } = useTabBar();

  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [result, setResult] = useState<{
    slug: string | null;
    products: DisplayProduct[];
    error: boolean;
  } | null>(null);
  const loading = result === null || result.slug !== storeSlug;
  const offers = result?.products ?? [];
  const error = Boolean(result?.error);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [variantsTarget, setVariantsTarget] = useState<VariantsModalTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const userInitials = useMemo(() => {
    const name =
      (typeof user?.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
      user?.email?.split('@')[0] ||
      preferences.userName ||
      '';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || 'B';
  }, [user, preferences.userName]);

  useEffect(() => {
    let cancelled = false;
    fetchCatalogProductsPage({
      query: '',
      categorySlug: null,
      brand: null,
      retailerSlug: storeSlug,
      promoOnly: true,
      sort: 'stores_desc',
      limit: OFFERS_LIMIT,
      offset: 0,
      includeFamilies: false,
    })
      .then((res) => {
        if (!cancelled) setResult({ slug: storeSlug, products: res.products, error: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ slug: storeSlug, products: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  const handleStep = useCallback(
    (product: DisplayProduct, nextQty: number) => {
      triggerHaptic(nextQty > 0 ? 'light' : 'selection');
      updateCatalogProductQuantity(product, nextQty);
    },
    [updateCatalogProductQuantity]
  );

  const handleBatch = useCallback(
    (batch: ConfirmedScanBatch) => {
      const { addedDistinct } = addScannedItemsBatch(batch);
      setRecipeModalOpen(false);
      setAiOpen(false);
      setAiPrompt(null);
      if (addedDistinct > 0) {
        triggerHaptic('success');
        setToast(`${addedDistinct} produse adăugate în coș`);
        setTimeout(() => setToast(null), 3200);
      }
    },
    [addScannedItemsBatch]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <BeavyScreenTransition style={styles.container}>
        <BeavyHeader
          userInitials={userInitials}
          onPressProfile={() => triggerTabTransition(3, () => router.push('/profile'))}
        />
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
        >
          <Text style={styles.h1}>Rețete</Text>
          <Text style={styles.sub}>
            Descrie masa și primești ingrediente cu gramaje reale de raft, direct în coș.
          </Text>
          <View style={styles.starterWrap}>
            {RECIPE_STARTERS.map((prompt) => (
              <Pressable
                key={prompt}
                accessibilityRole="button"
                accessibilityLabel={prompt}
                onPress={() => {
                  triggerHaptic('light');
                  setAiPrompt(prompt);
                  setAiOpen(true);
                }}
                style={({ pressed }) => [styles.starter, pressed && styles.pressed]}
              >
                <SymbolView
                  name="fork.knife"
                  size={16}
                  tintColor={C.cherry}
                  fallback={<Text style={styles.glyph}>•</Text>}
                />
                <Text style={styles.starterText}>{prompt}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                triggerHaptic('light');
                setRecipeModalOpen(true);
              }}
              style={({ pressed }) => [styles.starter, styles.starterAlt, pressed && styles.pressed]}
            >
              <SymbolView
                name="link"
                size={16}
                tintColor={C.cherry}
                fallback={<Text style={styles.glyph}>↗</Text>}
              />
              <Text style={styles.starterText}>Importă o rețetă din link sau text</Text>
            </Pressable>
          </View>

          <Text style={[styles.h1, styles.h1Spaced]}>Oferte reale</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {OFFER_STORES.map((s) => {
              const active = s.slug === storeSlug;
              return (
                <Pressable
                  key={s.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    if (!active) {
                      triggerHaptic('selection');
                      setStoreSlug(s.slug);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.filter,
                    active && styles.filterActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {loading ? (
            <Text style={styles.status}>Caut reducerile de azi…</Text>
          ) : error ? (
            <Text style={styles.status}>Nu am putut încărca ofertele. Încearcă din nou în câteva clipe.</Text>
          ) : offers.length === 0 ? (
            <Text style={styles.status}>Nicio ofertă activă pentru acest magazin acum.</Text>
          ) : (
            <View>
              {offers.map((p, idx) => (
                <BeavyCatalogProductCard
                  key={p.id}
                  product={p}
                  quantity={getProductQuantity(p.id)}
                  variant="compact"
                  isLast={idx === offers.length - 1}
                  onPressInspect={(product) => setVariantsTarget({ kind: 'product', product })}
                  onStepQuantity={handleStep}
                />
              ))}
            </View>
          )}
        </ScrollView>

        {toast ? (
          <View pointerEvents="none" style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}

        <RecipeImportModal
          visible={recipeModalOpen}
          activeListName={activeList?.name ?? 'Lista de cumpărături'}
          onClose={() => setRecipeModalOpen(false)}
          onConfirmAddBatch={(batch) => handleBatch(batch)}
        />
        <AiListComposerModal
          visible={aiOpen}
          activeListName={activeList?.name ?? 'Lista de cumpărături'}
          initialPrompt={aiPrompt}
          onClose={() => {
            setAiOpen(false);
            setAiPrompt(null);
          }}
          onConfirmAddBatch={(batch) => handleBatch(batch)}
        />
        <ProductVariantsModal
          visible={Boolean(variantsTarget)}
          target={variantsTarget}
          getProductQuantity={getProductQuantity}
          onUpdateQuantity={handleStep}
          onClose={() => setVariantsTarget(null)}
        />
      </BeavyScreenTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  container: { flex: 1, minHeight: 0, maxWidth: 680, width: '100%', alignSelf: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  h1: {
    fontSize: 24,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  h1Spaced: { marginTop: 28 },
  sub: { marginTop: 4, fontSize: 14, lineHeight: 20, color: C.muted, fontFamily: BeavyFonts.medium },
  starterWrap: { marginTop: 14, gap: 8 },
  starter: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.grapefruit,
  },
  starterAlt: { backgroundColor: C.white, borderWidth: 1, borderColor: C.rule },
  starterText: {
    flex: 1,
    fontSize: 14.5,
    color: C.cherry,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
  },
  glyph: { fontSize: 14, color: C.cherry },
  pressed: { opacity: 0.8 },
  filterRow: { gap: 8, paddingVertical: 12 },
  filter: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterActive: { backgroundColor: C.cherry, borderColor: C.cherry },
  filterText: { fontSize: 13.5, color: C.cherry, fontFamily: BeavyFonts.bold, fontWeight: '700' },
  filterTextActive: { color: C.white },
  status: { paddingVertical: 24, fontSize: 14, color: C.muted, fontFamily: BeavyFonts.medium },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    padding: 14,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.cherry,
  },
  toastText: { color: C.white, fontFamily: BeavyFonts.bold, fontWeight: '700', fontSize: 14 },
});
