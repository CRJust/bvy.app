import { SymbolView } from 'expo-symbols';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BeavyCatalogProductCard } from '@/components/product/beavy-product-card';
import { ProductImageBox } from '@/components/product-image-box';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  BeavyShadows,
  triggerHaptic,
} from '@/constants/theme';
import {
  type AiComposerItem,
  composeShoppingListWithAi,
} from '@/services/beavy-ai-composer';
import { type DisplayProduct } from '@/services/beavy-catalog-search';
import {
  type CatalogIndexProduct,
  type ConfirmedScanBatch,
} from '@/services/beavy-list-scanner';
import {
  extractGramajFacets,
  formatPriceLei,
  normalizeGramajFacet,
} from '@/services/product-price-grid';

type ListSearchComposerProps = {
  search: string;
  onChangeSearch: (value: string) => void;
  onOpenScanModal: () => void;
  onOpenRecipeModal?: () => void;
  onOpenAiComposerModal?: (initialPrompt?: string) => void;
  onOpenFullCatalogSearch?: (query: string) => void;
  onAddCanonicalBatch?: (batch: ConfirmedScanBatch, summaryLabel: string) => void;
  scanImportFeedback: { id: number; message: string; onUndo?: () => void } | null;
  onDismissScanFeedback: () => void;
  suggestions: DisplayProduct[];
  getProductQuantity: (productId: string) => number;
  onProductStep: (product: DisplayProduct, nextQty: number) => void;
  onOpenVariants: (product: DisplayProduct) => void;
  onOpenQueryVariants?: (query: string) => void;
  onAddGenericTerm?: (term: string) => void;
};

type OmnibarIntentKind = 'single_search' | 'recipe' | 'multi_list';

function detectOmnibarIntent(raw: string): { kind: OmnibarIntentKind; servings: number } {
  const clean = raw.trim();
  const norm = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const personsMatch = norm.match(/(\d+)\s*(?:persoane|portii|pers)\b/);
  const servings = personsMatch ? Math.max(1, Math.min(20, parseInt(personsMatch[1], 10))) : 4;

  if (
    /(?:carbonara|ciorba|radauteana|vacuta|perisoare|caesar|clatite|guacamole|gratar|mic\s+dejun|cina\s+cu|reteta|meniu|la\s+cuptor|pentru\s+\d+\s*(?:persoane|portii|pers))/i.test(
      norm
    )
  ) {
    return { kind: 'recipe', servings };
  }

  const parts = clean
    .split(/[,;\n\r]|(?:\s+(?:si|și|\+)\s+)/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);

  if (parts.length >= 2) {
    return { kind: 'multi_list', servings: 1 };
  }

  return { kind: 'single_search', servings: 1 };
}

/**
 * Beavy Omnibar 2.0:
 * 1. Căutare simplă -> Carduri canonice + filtre de gramaj (200g, 250g, 500g, 1kg) + grilă prețuri.
 * 2. Intenție culinară / Rețetă -> Recipe Cost Card cu preț total, preț/porție și toggle cămară.
 * 3. Listă dictată / lipită („2 lapte, pâine, 10 ouă”) -> Rezoluție canonică în lot + adăugare 1-tap.
 */
export function ListSearchComposer({
  search,
  onChangeSearch,
  onOpenScanModal,
  onOpenRecipeModal,
  onOpenAiComposerModal,
  onOpenFullCatalogSearch,
  onAddCanonicalBatch,
  scanImportFeedback,
  onDismissScanFeedback,
  suggestions,
  getProductQuantity,
  onProductStep,
  onOpenVariants,
  onOpenQueryVariants,
  onAddGenericTerm,
}: ListSearchComposerProps) {
  const [selectedGramaj, setSelectedGramaj] = useState<string | null>(null);
  const [smartState, setSmartState] = useState<{
    query: string;
    loading: boolean;
    reply: string;
    items: AiComposerItem[];
  } | null>(null);

  const cleanSearch = search.trim();
  const intent = useMemo(() => detectOmnibarIntent(cleanSearch), [cleanSearch]);
  const isSmartIntent =
    cleanSearch.length >= 4 &&
    (intent.kind === 'recipe' || intent.kind === 'multi_list') &&
    Boolean(onAddCanonicalBatch);

  useEffect(() => {
    if (!isSmartIntent) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSmartState((prev) =>
        prev?.query === cleanSearch ? prev : { query: cleanSearch, loading: true, reply: '', items: [] }
      );
      composeShoppingListWithAi({ prompt: cleanSearch })
        .then((res) => {
          if (cancelled) return;
          setSmartState({
            query: cleanSearch,
            loading: false,
            reply: res.text,
            items: (res.items ?? []).filter(
              (it) => Boolean(it.catalogProduct || it.candidates?.[0]?.product)
            ),
          });
        })
        .catch(() => {
          if (!cancelled) {
            setSmartState({ query: cleanSearch, loading: false, reply: '', items: [] });
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cleanSearch, isSmartIntent]);

  const gramajFacets = useMemo(() => extractGramajFacets(suggestions), [suggestions]);
  const activeGramaj =
    selectedGramaj && gramajFacets.some((g) => g.label === selectedGramaj)
      ? selectedGramaj
      : null;

  const filteredSuggestions = useMemo(() => {
    if (!activeGramaj) return suggestions;
    return suggestions.filter(
      (s) => normalizeGramajFacet(s.package_size, s.canonical_name) === activeGramaj
    );
  }, [suggestions, activeGramaj]);

  const topSuggestions = cleanSearch.length >= 2 ? filteredSuggestions.slice(0, 8) : [];

  const smartItems = useMemo(
    () => (isSmartIntent && smartState?.query === cleanSearch ? smartState.items : []),
    [isSmartIntent, smartState, cleanSearch]
  );
  const includedSmartItems = useMemo(
    () => smartItems.filter((i) => i.included),
    [smartItems]
  );

  const smartEstimatedTotal = useMemo(() => {
    let sum = 0;
    for (const it of includedSmartItems) {
      const prod = it.catalogProduct ?? it.candidates?.[0]?.product;
      const unitPrice = prod?.min_price ?? 6.5;
      sum += unitPrice * it.quantity;
    }
    return Math.round(sum * 100) / 100;
  }, [includedSmartItems]);

  const handleToggleSmartItem = (itemId: string) => {
    triggerHaptic('selection');
    setSmartState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((it) =>
          it.id === itemId ? { ...it, included: !it.included } : it
        ),
      };
    });
  };

  const handleConfirmSmartBatch = () => {
    if (!onAddCanonicalBatch || includedSmartItems.length === 0) return;
    const canonicalItems: { product: CatalogIndexProduct; quantity: number }[] = [];
    for (const it of includedSmartItems) {
      const prod = it.catalogProduct ?? it.candidates?.[0]?.product;
      if (prod) {
        canonicalItems.push({ product: prod, quantity: it.quantity });
      }
    }
    if (canonicalItems.length === 0) return;
    triggerHaptic('success');
    onAddCanonicalBatch(
      { canonicalItems, manualItems: [] },
      intent.kind === 'recipe' ? `rețeta „${cleanSearch}”` : 'lista rapidă'
    );
    onChangeSearch('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.searchBar}>
        <SymbolView
          name="magnifyingglass"
          tintColor={C.primary}
          size={16}
          fallback={<Text style={styles.searchFallbackIcon}>⌕</Text>}
        />
        <TextInput
          value={search}
          onChangeText={onChangeSearch}
          placeholder="Caută produs, rețetă („paste carbonara”) sau listă („2 lapte, pâine, ouă”)..."
          placeholderTextColor={C.muted}
          style={styles.searchInput}
          returnKeyType="done"
          onSubmitEditing={() => {
            Keyboard.dismiss();
            if (isSmartIntent && includedSmartItems.length > 0) {
              handleConfirmSmartBatch();
              return;
            }
            if (cleanSearch.length > 0 && filteredSuggestions[0]) {
              onProductStep(
                filteredSuggestions[0],
                getProductQuantity(filteredSuggestions[0].id) + 1
              );
              onChangeSearch('');
            } else if (cleanSearch.length > 0 && onAddGenericTerm) {
              onAddGenericTerm(cleanSearch);
            }
          }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {!!search && (
          <Pressable
            onPress={() => onChangeSearch('')}
            hitSlop={10}
            style={styles.clearBtn}
            accessibilityRole="button"
            accessibilityLabel="Șterge căutarea"
          >
            <Text style={styles.clearBtnText}>×</Text>
          </Pressable>
        )}
        {onOpenAiComposerModal && (
          <>
            <View style={styles.searchDivider} />
            <Pressable
              onPress={() => {
                triggerHaptic('light');
                onOpenAiComposerModal(cleanSearch || undefined);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={({ pressed }) => [styles.scanTriggerBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Asistent listă AI"
            >
              <SymbolView
                name="sparkles"
                tintColor={C.primary}
                size={16}
                fallback={<Text style={styles.recipeFallbackIcon}>✦</Text>}
              />
            </Pressable>
          </>
        )}
        {onOpenRecipeModal && (
          <>
            <View style={styles.searchDivider} />
            <Pressable
              onPress={() => {
                triggerHaptic('light');
                onOpenRecipeModal();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={({ pressed }) => [styles.scanTriggerBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Importă rețetă sau link"
            >
              <SymbolView
                name="fork.knife"
                tintColor={C.primary}
                size={16}
                fallback={<Text style={styles.recipeFallbackIcon}>✦</Text>}
              />
            </Pressable>
          </>
        )}
        <View style={styles.searchDivider} />
        <Pressable
          onPress={() => {
            triggerHaptic('light');
            onOpenScanModal();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 12 }}
          style={({ pressed }) => [styles.scanTriggerBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Scanează lista"
        >
          <SymbolView
            name="camera"
            tintColor={C.primary}
            size={17}
            fallback={
              <View style={styles.cameraGlyphBody}>
                <View style={styles.cameraGlyphBump} />
                <View style={styles.cameraGlyphLens} />
              </View>
            }
          />
        </Pressable>
      </View>

      {scanImportFeedback && (
        <View style={styles.scanFeedbackBanner}>
          <Pressable
            onPress={onDismissScanFeedback}
            style={styles.scanFeedbackRow}
            accessibilityRole="button"
            accessibilityLabel="Ascunde notificarea"
          >
            <SymbolView
              name="checkmark.circle.fill"
              tintColor={C.leekDark}
              size={15}
              fallback={<View style={styles.scanFeedbackDot} />}
            />
            <Text style={styles.scanFeedbackText} numberOfLines={1}>
              {scanImportFeedback.message}
            </Text>
          </Pressable>
          {scanImportFeedback.onUndo && (
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                scanImportFeedback.onUndo?.();
              }}
              style={({ pressed }) => [styles.undoChip, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Anulează ultima acțiune"
            >
              <Text style={styles.undoChipText}>Anulează</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Card inteligent pentru Rețetă (Recipe Cost Card) sau Listă Multi-Produs */}
      {isSmartIntent && (
        <BeavySurface variant="elevated" style={styles.recipeCostCard}>
          <View style={styles.recipeCardHeader}>
            <View style={styles.recipeHeaderLeft}>
              <View style={styles.intentPill}>
                <Text style={styles.intentPillText}>
                  {intent.kind === 'recipe'
                    ? `REȚETĂ CANONICĂ · ${intent.servings} PORȚII`
                    : 'LISTĂ MULTI-PRODUS DETECTATĂ'}
                </Text>
              </View>
              <Text style={styles.recipeTitle} numberOfLines={2}>
                {smartState?.reply || `Ingrediente canonice pentru „${cleanSearch}”`}
              </Text>
            </View>

            {smartEstimatedTotal > 0 && (
              <View style={styles.costBadgeCol}>
                <Text style={styles.costTotalText}>
                  {`~${formatPriceLei(smartEstimatedTotal)}`}
                </Text>
                {intent.kind === 'recipe' && intent.servings > 1 && (
                  <Text style={styles.costPerServingText}>
                    {`~${formatPriceLei(smartEstimatedTotal / intent.servings)} / porție`}
                  </Text>
                )}
              </View>
            )}
          </View>

          {smartState?.loading ? (
            <View style={styles.smartLoadingRow}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={styles.smartLoadingText}>
                Aleg gramajele reale de raft din catalogul canonic…
              </Text>
            </View>
          ) : smartItems.length > 0 ? (
            <>
              <View style={styles.smartItemsList}>
                {smartItems.map((item) => {
                  const prod = item.catalogProduct ?? item.candidates?.[0]?.product;
                  if (!prod) return null;
                  const linePrice =
                    prod.min_price != null ? prod.min_price * item.quantity : null;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => handleToggleSmartItem(item.id)}
                      style={[
                        styles.smartItemRow,
                        !item.included && styles.smartItemRowExcluded,
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: item.included }}
                    >
                      <View
                        style={[
                          styles.smartCheck,
                          item.included && styles.smartCheckOn,
                        ]}
                      >
                        {item.included && <Text style={styles.smartCheckGlyph}>✓</Text>}
                      </View>
                      <ProductImageBox
                        imageUrl={prod.image_url}
                        productName={prod.canonical_name}
                        brand={prod.brand}
                        variant="thumb"
                      />
                      <View style={styles.smartItemCopy}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.smartItemName,
                            !item.included && styles.smartItemNameExcluded,
                          ]}
                        >
                          {`${item.quantity}× ${prod.canonical_name}`}
                        </Text>
                        <View style={styles.smartItemMetaRow}>
                          {prod.package_size || item.packageSizeHint ? (
                            <Text style={styles.smartItemMeta}>
                              {prod.package_size || item.packageSizeHint}
                            </Text>
                          ) : null}
                          {item.isPantryStaple ? (
                            <View style={styles.pantryTag}>
                              <Text style={styles.pantryTagText}>În cămară</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <Text style={styles.smartItemPrice}>
                        {linePrice != null ? `de la ${formatPriceLei(linePrice)}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={handleConfirmSmartBatch}
                disabled={includedSmartItems.length === 0}
                style={({ pressed }) => [
                  styles.recipeAddCta,
                  includedSmartItems.length === 0 && styles.recipeAddCtaDisabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <SymbolView
                  name="basket.fill"
                  tintColor={C.surface}
                  size={15}
                  fallback={<Text style={styles.ctaPlusGlyph}>+</Text>}
                />
                <Text style={styles.recipeAddCtaText}>
                  {intent.kind === 'recipe'
                    ? `Adaugă rețeta în coș (+${formatPriceLei(smartEstimatedTotal)})`
                    : `Adaugă cele ${includedSmartItems.length} produse în coș (+${formatPriceLei(
                        smartEstimatedTotal
                      )})`}
                </Text>
              </Pressable>
            </>
          ) : null}
        </BeavySurface>
      )}

      {cleanSearch.length >= 2 && (
        <View style={styles.assistStack}>
          {topSuggestions.length > 0 ? (
            <BeavySurface variant="elevated" style={styles.suggestionsCard}>
              <View style={styles.suggestionsHeaderRow}>
                <Text style={styles.suggestionsOverline}>
                  {`Produse canonice (${filteredSuggestions.length})`}
                </Text>
                {onOpenFullCatalogSearch && (
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      onOpenFullCatalogSearch(cleanSearch);
                    }}
                    hitSlop={6}
                    accessibilityRole="button"
                  >
                    <Text style={styles.openCatalogLink}>Toate filtrele & raioanele →</Text>
                  </Pressable>
                )}
              </View>

              {gramajFacets.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.gramajRow}
                  keyboardShouldPersistTaps="handled"
                >
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      setSelectedGramaj(null);
                    }}
                    style={[styles.gramajChip, !activeGramaj && styles.gramajChipActive]}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.gramajChipText,
                        !activeGramaj && styles.gramajChipTextActive,
                      ]}
                    >
                      {`Toate (${suggestions.length})`}
                    </Text>
                  </Pressable>
                  {gramajFacets.map((f) => {
                    const active = activeGramaj === f.label;
                    return (
                      <Pressable
                        key={f.label}
                        onPress={() => {
                          triggerHaptic('selection');
                          setSelectedGramaj(active ? null : f.label);
                        }}
                        style={[styles.gramajChip, active && styles.gramajChipActive]}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.gramajChipText,
                            active && styles.gramajChipTextActive,
                          ]}
                        >
                          {`${f.label} (${f.count})`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {topSuggestions.map((sug, idx) => (
                <BeavyCatalogProductCard
                  key={sug.id}
                  product={sug}
                  quantity={getProductQuantity(sug.id)}
                  variant="compact"
                  isLast={idx === topSuggestions.length - 1}
                  onPressInspect={onOpenVariants}
                  onStepQuantity={onProductStep}
                />
              ))}

              {onOpenQueryVariants && suggestions.length > 0 && (
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    onOpenQueryVariants(cleanSearch);
                  }}
                  style={styles.aiSuggestionRow}
                  accessibilityRole="button"
                >
                  <SymbolView
                    name="square.stack.3d.up"
                    tintColor={C.primary}
                    size={13}
                    fallback={<Text style={styles.recipeFallbackIcon}>≡</Text>}
                  />
                  <Text style={styles.aiSuggestionText} numberOfLines={1}>
                    {`Vezi toate variantele pentru „${cleanSearch}” (${suggestions.length})`}
                  </Text>
                </Pressable>
              )}

              {onOpenAiComposerModal && cleanSearch.length >= 3 && (
                <Pressable
                  onPress={() => {
                    triggerHaptic('light');
                    onOpenAiComposerModal(cleanSearch);
                  }}
                  style={styles.aiSuggestionRow}
                  accessibilityRole="button"
                >
                  <SymbolView
                    name="sparkles"
                    tintColor={C.primary}
                    size={13}
                    fallback={<Text style={styles.recipeFallbackIcon}>✦</Text>}
                  />
                  <Text style={styles.aiSuggestionText} numberOfLines={1}>
                    {`Compune rețetă / meniu cu AI pentru „${cleanSearch}”`}
                  </Text>
                </Pressable>
              )}
            </BeavySurface>
          ) : !isSmartIntent ? (
            <BeavySurface variant="elevated" style={styles.suggestionsCard}>
              {onOpenAiComposerModal && cleanSearch.length >= 3 && (
                <Pressable
                  onPress={() => {
                    triggerHaptic('light');
                    onOpenAiComposerModal(cleanSearch);
                  }}
                  style={styles.aiSuggestionRow}
                  accessibilityRole="button"
                >
                  <SymbolView
                    name="sparkles"
                    tintColor={C.primary}
                    size={13}
                    fallback={<Text style={styles.recipeFallbackIcon}>✦</Text>}
                  />
                  <Text style={styles.aiSuggestionText} numberOfLines={1}>
                    {`Compune cu AI lista pentru „${cleanSearch}”`}
                  </Text>
                </Pressable>
              )}
            </BeavySurface>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 48,
    gap: 8,
    borderWidth: 1,
    borderColor: C.rule,
    ...BeavyShadows.card,
  },
  searchFallbackIcon: {
    fontSize: 18,
    color: C.primary,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.primary,
    paddingVertical: 0,
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
    fontSize: 15,
    fontWeight: '700',
    color: C.primary,
    lineHeight: 17,
  },
  searchDivider: {
    width: 1,
    height: 18,
    backgroundColor: C.rule,
  },
  scanTriggerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraGlyphBody: {
    width: 16,
    height: 11,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cameraGlyphBump: {
    position: 'absolute',
    top: -3,
    width: 6,
    height: 2.5,
    borderTopLeftRadius: 1.5,
    borderTopRightRadius: 1.5,
    backgroundColor: C.primary,
  },
  cameraGlyphLens: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: 1.5,
    borderColor: C.primary,
  },
  recipeFallbackIcon: {
    fontSize: 13,
  },
  scanFeedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.leek,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BeavyRadius.md,
    gap: 8,
  },
  scanFeedbackRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scanFeedbackDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.leekDark,
  },
  scanFeedbackText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  undoChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
  },
  undoChipText: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.extraBold,
    color: C.surface,
  },
  recipeCostCard: {
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: C.leekDark,
  },
  recipeCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  recipeHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  intentPill: {
    alignSelf: 'flex-start',
    backgroundColor: C.leek,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BeavyRadius.pill,
  },
  intentPillText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 9.5,
    color: C.primary,
    letterSpacing: 0.5,
  },
  recipeTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 15,
    color: C.primary,
    lineHeight: 20,
  },
  costBadgeCol: {
    alignItems: 'flex-end',
    backgroundColor: C.buttermilk,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BeavyRadius.md,
    borderWidth: 1,
    borderColor: C.rule,
  },
  costTotalText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 16,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  costPerServingText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.leekDark,
    fontVariant: ['tabular-nums'],
  },
  smartLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  smartLoadingText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: C.muted,
  },
  smartItemsList: {
    gap: 4,
  },
  smartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  smartItemRowExcluded: {
    opacity: 0.5,
  },
  smartCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smartCheckOn: {
    backgroundColor: C.primary,
  },
  smartCheckGlyph: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 12,
    color: C.surface,
  },
  smartItemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  smartItemName: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13.5,
    color: C.primary,
  },
  smartItemNameExcluded: {
    textDecorationLine: 'line-through',
  },
  smartItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smartItemMeta: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
  },
  pantryTag: {
    backgroundColor: C.sand,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BeavyRadius.pill,
  },
  pantryTagText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10,
    color: C.primary,
  },
  smartItemPrice: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 12.5,
    color: C.leekDark,
    fontVariant: ['tabular-nums'],
  },
  recipeAddCta: {
    minHeight: 46,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  recipeAddCtaDisabled: {
    opacity: 0.4,
  },
  ctaPlusGlyph: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 16,
    color: C.surface,
  },
  recipeAddCtaText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 14,
    color: C.surface,
    fontVariant: ['tabular-nums'],
  },
  assistStack: {
    gap: 8,
  },
  suggestionsCard: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  suggestionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  suggestionsOverline: {
    fontSize: 10,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  openCatalogLink: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.extraBold,
    color: C.primary,
  },
  aiSuggestionRow: {
    marginTop: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.rule,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiSuggestionText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.primary,
  },
  pressed: {
    opacity: 0.72,
  },
  gramajRow: {
    gap: 6,
    paddingBottom: 6,
    paddingTop: 2,
  },
  gramajChip: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gramajChipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  gramajChipText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11.5,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  gramajChipTextActive: {
    color: C.surface,
  },
});
