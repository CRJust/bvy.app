import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { ProductImageBox } from '@/components/product-image-box';
import { QuantityStepper } from '@/components/quantity-stepper';
import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import {
  type CatalogIndexProduct,
  type ConfirmedScanBatch,
  deduplicateConfirmedScanItems,
  matchExtractedItemsToCatalog,
  type ScannedReviewItem,
} from '@/services/beavy-list-scanner';
import {
  type AiCreditsInfo,
  DEFAULT_MONTHLY_CREDITS,
  refillAiCredits,
  subscribeAiCredits,
} from '@/services/beavy-claude-haiku';
import {
  fetchAndParseRecipeFromUrl,
  isRecipeUrl,
  parseRecipeSmart,
  POPULAR_ROMANIAN_RECIPES,
  type RecipeParseResult,
  recipeIngredientsToScanItems,
  scaleRecipeIngredients,
} from '@/services/beavy-recipe-parser';

type RecipeImportStage = 'input' | 'review';

type RecipeImportModalProps = {
  visible: boolean;
  activeListName: string;
  initialText?: string | null;
  onClose: () => void;
  onConfirmAddBatch: (batch: ConfirmedScanBatch, recipeTitle: string) => void;
};

export function RecipeImportModal({
  visible,
  activeListName,
  initialText,
  onClose,
  onConfirmAddBatch,
}: RecipeImportModalProps) {
  const { height: windowHeight } = useWindowDimensions();

  const [stage, setStage] = useState<RecipeImportStage>('input');
  const [inputText, setInputText] = useState(initialText ?? '');
  const [prevInitialText, setPrevInitialText] = useState(initialText);
  if (visible && initialText !== prevInitialText) {
    setPrevInitialText(initialText);
    setInputText(initialText ?? '');
  }
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [credits, setCredits] = useState<AiCreditsInfo>({
    remaining: DEFAULT_MONTHLY_CREDITS,
    max: DEFAULT_MONTHLY_CREDITS,
    isUnlimited: false,
    lastResetDate: '',
  });

  useEffect(() => {
    const unsub = subscribeAiCredits(setCredits);
    return unsub;
  }, []);

  const handleRefillInModal = async () => {
    triggerHaptic('success');
    const updated = await refillAiCredits(50);
    setCredits(updated);
  };

  // Rezultate parsare rețetă
  const [recipeResult, setRecipeResult] = useState<RecipeParseResult | null>(null);
  const [targetServings, setTargetServings] = useState(4);
  const [activeTab, setActiveTab] = useState<'to_buy' | 'staples' | 'all'>('to_buy');

  // Elemente pentru review catalog
  const [reviewItems, setReviewItems] = useState<
    (ScannedReviewItem & { isPantryStaple: boolean; stapleReason?: string })[]
  >([]);

  const handleReset = () => {
    setStage('input');
    setInputText('');
    setBusy(false);
    setBusyMessage('');
    setErrorMessage(null);
    setRecipeResult(null);
    setReviewItems([]);
  };

  const handleModalClose = () => {
    handleReset();
    onClose();
  };

  const handleSelectPreset = (presetText: string) => {
    triggerHaptic('selection');
    setInputText(presetText);
    setErrorMessage(null);
  };

  const handleAnalyzeRecipe = async () => {
    const clean = inputText.trim();
    if (!clean) {
      setErrorMessage('Lipește un link sau textul ingredientelor.');
      return;
    }

    Keyboard.dismiss();
    setBusy(true);
    setErrorMessage(null);

    try {
      let parsed: RecipeParseResult;

      if (isRecipeUrl(clean)) {
        setBusyMessage('Descărcăm și analizăm rețeta de pe web…');
        parsed = await fetchAndParseRecipeFromUrl(clean);
      } else {
        setBusyMessage('Identificăm ingredientele cu Claude 3.5 Haiku…');
        parsed = await parseRecipeSmart(clean, targetServings);
      }

      if (parsed.ingredients.length === 0) {
        setErrorMessage(
          'Nu am putut identifica ingrediente clare în text. Asigură-te că textul conține o listă de ingrediente.'
        );
        return;
      }

      setRecipeResult(parsed);
      setTargetServings(parsed.baseServings);

      // Potrivire ingrediente cu catalogul canonical Supabase
      setBusyMessage('Căutăm produsele în catalogul magazinelor…');
      const scanRawItems = recipeIngredientsToScanItems(parsed.ingredients);
      const matched = await matchExtractedItemsToCatalog(scanRawItems);

      // Îmbinăm datele de catalog cu indicatorul de cămară și produsul comun implicit
      const enriched = matched.map((item, idx) => {
        const ing = parsed.ingredients[idx];
        const isStaple = ing?.isPantryStaple ?? false;
        const resolvedProduct =
          item.selectedProduct ??
          item.tierVariants?.common ??
          item.candidates?.[0]?.product ??
          null;
        return {
          ...item,
          selectedProduct: resolvedProduct,
          isPantryStaple: isStaple,
          stapleReason: ing?.stapleReason,
          // Ingredientele de bază sunt debifate implicit
          included: !isStaple,
        };
      });

      setReviewItems(enriched);
      setStage('review');
      triggerHaptic('medium');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'A apărut o problemă la analiza rețetei. Încearcă să copiezi direct textul ingredientelor.';
      setErrorMessage(msg);
    } finally {
      setBusy(false);
      setBusyMessage('');
    }
  };

  const handleServingsChange = (newServings: number) => {
    if (!recipeResult || newServings < 1 || newServings > 20) return;
    triggerHaptic('light');

    const scaledIngredients = scaleRecipeIngredients(
      recipeResult.ingredients,
      recipeResult.baseServings,
      newServings
    );

    setTargetServings(newServings);

    // Actualizăm cantitățile din reviewItems proporțional
    setReviewItems((prev) =>
      prev.map((item, idx) => {
        const scaled = scaledIngredients[idx];
        if (!scaled) return item;
        return {
          ...item,
          quantity: Math.max(1, Math.round(scaled.baseQuantity)),
          packageSizeHint: scaled.unit
            ? `${scaled.baseQuantity} ${scaled.unit}`
            : item.packageSizeHint,
        };
      })
    );
  };

  const handleToggleItemIncluded = (localId: string) => {
    triggerHaptic('selection');
    setReviewItems((prev) =>
      prev.map((it) => (it.localId === localId ? { ...it, included: !it.included } : it))
    );
  };

  const handleQuantityStep = (localId: string, delta: number) => {
    triggerHaptic('selection');
    setReviewItems((prev) =>
      prev.map((it) => {
        if (it.localId !== localId) return it;
        const nextQty = Math.max(1, Math.min(99, it.quantity + delta));
        return { ...it, quantity: nextQty };
      })
    );
  };

  const handleSelectVariantProduct = (localId: string, product: CatalogIndexProduct) => {
    triggerHaptic('selection');
    setReviewItems((prev) =>
      prev.map((it) => (it.localId === localId ? { ...it, selectedProduct: product } : it))
    );
  };

  const displayedItems = useMemo(() => {
    if (activeTab === 'to_buy') {
      return reviewItems.filter((it) => !it.isPantryStaple);
    }
    if (activeTab === 'staples') {
      return reviewItems.filter((it) => it.isPantryStaple);
    }
    return reviewItems;
  }, [reviewItems, activeTab]);

  const selectedCount = useMemo(
    () => reviewItems.filter((it) => it.included).length,
    [reviewItems]
  );

  const staplesCount = useMemo(
    () => reviewItems.filter((it) => it.isPantryStaple).length,
    [reviewItems]
  );

  const toBuyCount = useMemo(
    () => reviewItems.filter((it) => !it.isPantryStaple).length,
    [reviewItems]
  );

  const handleConfirmAdd = () => {
    if (selectedCount === 0) return;
    triggerHaptic('medium');

    const includedReviewItems = reviewItems.filter((it) => it.included);
    const batch = deduplicateConfirmedScanItems(includedReviewItems);

    onConfirmAddBatch(batch, recipeResult?.title ?? 'Rețetă importată');
    handleModalClose();
  };

  const maxScrollHeight = Math.min(windowHeight * 0.72, 600);

  return (
    <BeavySheetModal
      visible={visible}
      onClose={handleModalClose}
      maxHeightRatio="92%"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconCircle}>
              <SymbolView
                name="fork.knife"
                tintColor={C.cherry}
                size={16}
                fallback={<Text style={styles.fallbackIcon}>✦</Text>}
              />
            </View>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Importă din rețetă sau link</Text>
              <Text style={styles.headerSub}>
                {stage === 'input'
                  ? 'Bloguri Jamila, Savori Urbane, rețete text sau link-uri'
                  : `${recipeResult?.title ?? 'Rețetă'} · ${activeListName}`}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={handleModalClose}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Închide fereastra"
          >
            <SymbolView
              name="xmark"
              tintColor={C.muted}
              size={14}
              fallback={<Text style={styles.fallbackIcon}>✕</Text>}
            />
          </Pressable>
        </View>

        {stage === 'input' ? (
          <ScrollView
            style={{ maxHeight: maxScrollHeight }}
            contentContainerStyle={styles.inputScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* AI Credits Header Row */}
            <View style={styles.aiCreditsHeaderRow}>
              <View style={styles.aiPillBadge}>
                <SymbolView
                  name="sparkles"
                  tintColor={C.primary}
                  size={12}
                  fallback={<Text style={styles.fallbackIcon}>✦</Text>}
                />
                <Text style={styles.aiPillText}>
                  {credits.remaining > 0
                    ? `Claude 3.5 Haiku integrat · ${credits.remaining} credite rămase`
                    : 'Credite epuizate · Apasă pentru alimentare'}
                </Text>
              </View>
              {credits.remaining <= 10 && (
                <Pressable
                  onPress={handleRefillInModal}
                  style={({ pressed }) => [styles.refillChip, pressed && styles.btnPressed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.refillChipText}>+50 credite</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.inputSection}>
              <Text style={styles.sectionLabel}>Link sau ingrediente rețetă</Text>
              <View style={styles.inputBox}>
                <TextInput
                  value={inputText}
                  onChangeText={(val) => {
                    setInputText(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Lipește linkul rețetei (ex: https://jamilacuisine.ro/...) sau textul cu ingrediente..."
                  placeholderTextColor={C.muted}
                  style={styles.textArea}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                  autoCorrect={false}
                />
                {!!inputText && (
                  <Pressable
                    onPress={() => setInputText('')}
                    hitSlop={8}
                    style={styles.clearBtn}
                  >
                    <Text style={styles.clearBtnText}>✕</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {errorMessage && (
              <View style={styles.errorBanner}>
                <SymbolView
                  name="exclamationmark.circle.fill"
                  tintColor={C.accent}
                  size={15}
                  fallback={<Text style={styles.fallbackIcon}>!</Text>}
                />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            <View style={styles.presetsSection}>
              <Text style={styles.presetsLabel}>Încearcă rapid o rețetă românească:</Text>
              <View style={styles.presetsRow}>
                {POPULAR_ROMANIAN_RECIPES.map((preset) => (
                  <Pressable
                    key={preset.id}
                    onPress={() => handleSelectPreset(preset.text)}
                    style={({ pressed }) => [
                      styles.presetChip,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <View style={styles.presetIconBox}>
                      <SymbolView
                        name={(preset.symbol || 'fork.knife') as never}
                        tintColor={C.cherry}
                        size={15}
                        fallback={<Text style={styles.fallbackIcon}>✦</Text>}
                      />
                    </View>
                    <Text style={styles.presetTitle} numberOfLines={1}>
                      {preset.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.hintCard}>
              <SymbolView
                name="sparkles"
                tintColor={C.cherry}
                size={14}
                fallback={<Text style={styles.fallbackIcon}>✦</Text>}
              />
              <Text style={styles.hintText}>
                Beavy curăță automat ingredientele de bază pe care le ai deja în casă
                (apă, sare, piper, ulei) și găsește cele mai mici prețuri în supermarketuri.
              </Text>
            </View>

            <View style={styles.bottomBar}>
              <Pressable
                onPress={handleAnalyzeRecipe}
                disabled={busy || !inputText.trim()}
                style={({ pressed }) => [
                  styles.primaryCta,
                  (!inputText.trim() || busy) && styles.primaryCtaDisabled,
                  pressed && styles.btnPressed,
                ]}
                accessibilityRole="button"
              >
                {busy ? (
                  <View style={styles.busyRow}>
                    <ActivityIndicator size="small" color={C.surface} />
                    <Text style={styles.primaryCtaText}>{busyMessage}</Text>
                  </View>
                ) : (
                  <View style={styles.ctaContentRow}>
                    <SymbolView
                      name="sparkles"
                      tintColor={C.surface}
                      size={15}
                      fallback={<Text style={styles.fallbackIconWhite}>✦</Text>}
                    />
                    <Text style={styles.primaryCtaText}>Analizează rețeta</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.reviewContainer}>
            {/* CARD REȚETĂ & SCALARE PORȚII */}
            <BeavySurface variant="elevated" style={styles.recipeMetaCard}>
              <View style={styles.recipeMetaTop}>
                {recipeResult?.imageUrl ? (
                  <Image
                    source={{ uri: recipeResult.imageUrl }}
                    style={styles.recipeThumb}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.recipeThumbFallback}>
                    <SymbolView
                      name="fork.knife"
                      tintColor={C.cherry}
                      size={20}
                      fallback={<Text style={styles.fallbackIcon}>✦</Text>}
                    />
                  </View>
                )}
                <View style={styles.recipeMetaCopy}>
                  <Text style={styles.recipeTitle} numberOfLines={2}>
                    {recipeResult?.title}
                  </Text>
                  {recipeResult?.sourceDomain && (
                    <Text style={styles.recipeDomain}>
                      Sursă: {recipeResult.sourceDomain}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.servingsRow}>
                <View style={styles.servingsLabelWrap}>
                  <SymbolView
                    name="person.2.fill"
                    tintColor={C.cherry}
                    size={14}
                    fallback={<Text style={styles.fallbackIcon}>•</Text>}
                  />
                  <Text style={styles.servingsLabel}>Porții rețetă:</Text>
                </View>

                <View style={styles.servingsStepper}>
                  <Pressable
                    onPress={() => handleServingsChange(targetServings - 1)}
                    disabled={targetServings <= 1}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.stepperBtn,
                      targetServings <= 1 && styles.stepperBtnDisabled,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <Text style={styles.stepperBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.servingsValue}>{targetServings}</Text>
                  <Pressable
                    onPress={() => handleServingsChange(targetServings + 1)}
                    disabled={targetServings >= 20}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.stepperBtn,
                      targetServings >= 20 && styles.stepperBtnDisabled,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <Text style={styles.stepperBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </BeavySurface>

            {/* Badge analizat cu Claude 3.5 Haiku */}
            {recipeResult?.parsedWithAi && (
              <View style={styles.aiAnalyzedBadge}>
                <SymbolView
                  name="sparkles"
                  tintColor={C.primary}
                  size={13}
                  fallback={<Text style={styles.fallbackIcon}>✦</Text>}
                />
                <Text style={styles.aiAnalyzedBadgeText}>
                  Rețetă analizată cu Claude 3.5 Haiku · Cămara și porțiile sunt optimizate
                </Text>
              </View>
            )}

            {/* NOTIFICARE CĂMARĂ INTELIGENTĂ */}
            {staplesCount > 0 && (
              <View style={styles.staplesBanner}>
                <SymbolView
                  name="sparkles"
                  tintColor={C.cherry}
                  size={13}
                  fallback={<Text style={styles.fallbackIcon}>✦</Text>}
                />
                <Text style={styles.staplesBannerText}>
                  {`${staplesCount} alimente de bază (apă, sare, piper) sunt debifate automat pentru că probabil le ai deja în cămară.`}
                </Text>
              </View>
            )}

            <View style={styles.economicHintRow}>
              <SymbolView
                name="arrow.triangle.swap"
                tintColor={C.primary}
                size={12}
                fallback={<Text style={styles.fallbackIcon}>⇄</Text>}
              />
              <Text style={styles.economicHintText}>
                Coșul va calcula automat opțiunea cu alternative mai economice pentru toate produsele.
              </Text>
            </View>

            {/* TABURI FILTRARE RAPIDĂ */}
            <View style={styles.tabBar}>
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setActiveTab('to_buy');
                }}
                style={[styles.tabChip, activeTab === 'to_buy' && styles.tabChipActive]}
              >
                <Text
                  style={[
                    styles.tabChipText,
                    activeTab === 'to_buy' && styles.tabChipTextActive,
                  ]}
                >
                  {`De cumpărat (${toBuyCount})`}
                </Text>
              </Pressable>

              {staplesCount > 0 && (
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    setActiveTab('staples');
                  }}
                  style={[
                    styles.tabChip,
                    activeTab === 'staples' && styles.tabChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabChipText,
                      activeTab === 'staples' && styles.tabChipTextActive,
                    ]}
                  >
                    {`În cămară (${staplesCount})`}
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setActiveTab('all');
                }}
                style={[styles.tabChip, activeTab === 'all' && styles.tabChipActive]}
              >
                <Text
                  style={[
                    styles.tabChipText,
                    activeTab === 'all' && styles.tabChipTextActive,
                  ]}
                >
                  {`Toate (${reviewItems.length})`}
                </Text>
              </Pressable>
            </View>

            {/* LISTA DE INGREDIENTE STRUCTURATE */}
            <ScrollView
              style={{ maxHeight: maxScrollHeight - 160 }}
              contentContainerStyle={styles.reviewListContent}
              showsVerticalScrollIndicator={false}
            >
              {displayedItems.map((item) => {
                const product = item.selectedProduct;
                const displayName = product
                  ? `${product.canonical_name}${product.brand ? ` · ${product.brand}` : ''}`
                  : item.editedName;

                return (
                  <Pressable
                    key={item.localId}
                    onPress={() => handleToggleItemIncluded(item.localId)}
                    style={({ pressed }) => [
                      styles.ingredientRow,
                      !item.included && styles.ingredientRowExcluded,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <View style={styles.checkboxCircle}>
                      {item.included ? (
                        <SymbolView
                          name="checkmark.circle.fill"
                          tintColor={C.cherry}
                          size={20}
                          fallback={<Text style={styles.checkboxFallbackActive}>●</Text>}
                        />
                      ) : (
                        <View style={styles.checkboxEmpty} />
                      )}
                    </View>

                    <View style={styles.thumbWrapper}>
                      {product?.image_url ? (
                        <ProductImageBox
                          imageUrl={product.image_url}
                          productName={product.canonical_name}
                          brand={product.brand}
                          variant="thumb"
                        />
                      ) : (
                        <View style={styles.thumbGenericCircle}>
                          <SymbolView
                            name="basket"
                            tintColor={C.muted}
                            size={16}
                            fallback={<Text style={styles.fallbackIcon}>•</Text>}
                          />
                        </View>
                      )}
                    </View>

                    <View style={styles.ingredientCopy}>
                      <Text
                        style={[
                          styles.ingredientTitle,
                          !item.included && styles.textStrikethrough,
                        ]}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>

                      <View style={styles.ingredientMetaRow}>
                        {item.packageSizeHint && (
                          <View style={styles.quantityBadge}>
                            <Text style={styles.quantityBadgeText}>
                              {item.packageSizeHint}
                            </Text>
                          </View>
                        )}

                        {item.isPantryStaple ? (
                          <View style={styles.stapleTag}>
                            <Text style={styles.stapleTagText}>În cămară</Text>
                          </View>
                        ) : product ? (
                          <View style={styles.matchedTag}>
                            <Text style={styles.matchedTagText}>
                              {(product.store_count ?? 1) >= 6
                                ? `Comun în ${product.store_count} mag.`
                                : (product.store_count ?? 1) > 1
                                  ? `În ${product.store_count} mag.`
                                  : 'În catalog'}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {item.tierVariants &&
                      (item.tierVariants.privateLabel ||
                        item.tierVariants.cheaper ||
                        item.tierVariants.premium) ? (
                        <View style={styles.tierRow}>
                          {item.tierVariants.common ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                handleSelectVariantProduct(
                                  item.localId,
                                  item.tierVariants!.common!
                                )
                              }
                              style={[
                                styles.tierPill,
                                product?.id === item.tierVariants.common.id &&
                                  styles.tierPillActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tierPillText,
                                  product?.id === item.tierVariants.common.id &&
                                    styles.tierPillTextActive,
                                ]}
                              >
                                Comun
                              </Text>
                            </Pressable>
                          ) : null}
                          {item.tierVariants.privateLabel ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                handleSelectVariantProduct(
                                  item.localId,
                                  item.tierVariants!.privateLabel!
                                )
                              }
                              style={[
                                styles.tierPill,
                                product?.id === item.tierVariants.privateLabel.id &&
                                  styles.tierPillActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tierPillText,
                                  product?.id === item.tierVariants.privateLabel.id &&
                                    styles.tierPillTextActive,
                                ]}
                                numberOfLines={1}
                              >
                                {`Brand propriu${
                                  item.tierVariants.privateLabel.brand
                                    ? ` · ${item.tierVariants.privateLabel.brand}`
                                    : ''
                                }`}
                              </Text>
                            </Pressable>
                          ) : null}
                          {item.tierVariants.cheaper &&
                          item.tierVariants.cheaper.id !==
                            item.tierVariants.privateLabel?.id ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                handleSelectVariantProduct(
                                  item.localId,
                                  item.tierVariants!.cheaper!
                                )
                              }
                              style={[
                                styles.tierPill,
                                product?.id === item.tierVariants.cheaper.id &&
                                  styles.tierPillActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tierPillText,
                                  product?.id === item.tierVariants.cheaper.id &&
                                    styles.tierPillTextActive,
                                ]}
                                numberOfLines={1}
                              >
                                Mai ieftin
                              </Text>
                            </Pressable>
                          ) : null}
                          {item.tierVariants.premium ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                handleSelectVariantProduct(
                                  item.localId,
                                  item.tierVariants!.premium!
                                )
                              }
                              style={[
                                styles.tierPill,
                                product?.id === item.tierVariants.premium.id &&
                                  styles.tierPillActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tierPillText,
                                  product?.id === item.tierVariants.premium.id &&
                                    styles.tierPillTextActive,
                                ]}
                                numberOfLines={1}
                              >
                                {`Mai premium${
                                  item.tierVariants.premium.brand
                                    ? ` · ${item.tierVariants.premium.brand}`
                                    : ''
                                }`}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>

                    {item.included && (
                      <View
                        style={styles.stepperWrap}
                        onStartShouldSetResponder={() => true}
                      >
                        <QuantityStepper
                          quantity={item.quantity}
                          onDecrement={() => handleQuantityStep(item.localId, -1)}
                          onIncrement={() => handleQuantityStep(item.localId, 1)}
                          variant="paper"
                        />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* BARA INFERIOARĂ DE CONFIRMARE */}
            <View style={styles.reviewBottomBar}>
              <Pressable
                onPress={() => setStage('input')}
                style={({ pressed }) => [
                  styles.backBtn,
                  pressed && styles.btnPressed,
                ]}
              >
                <Text style={styles.backBtnText}>Editează</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmAdd}
                disabled={selectedCount === 0}
                style={({ pressed }) => [
                  styles.confirmCta,
                  selectedCount === 0 && styles.primaryCtaDisabled,
                  pressed && styles.btnPressed,
                ]}
              >
                <SymbolView
                  name="plus"
                  tintColor={C.surface}
                  size={14}
                  fallback={<Text style={styles.fallbackIconWhite}>+</Text>}
                />
                <Text style={styles.confirmCtaText}>
                  {`Adaugă ${selectedCount} ingrediente în listă`}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.cherry,
  },
  headerSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.secondary,
  },
  fallbackIcon: {
    fontSize: 14,
  },
  fallbackIconWhite: {
    fontSize: 14,
    color: C.surface,
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  inputScrollContent: {
    gap: 14,
    paddingTop: 8,
    paddingBottom: 16,
  },
  inputSection: {
    gap: 6,
  },
  sectionLabel: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12.5,
    color: C.cherry,
  },
  inputBox: {
    position: 'relative',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: BeavyRadius.lg,
    padding: 12,
  },
  textArea: {
    fontFamily: BeavyFonts.regular,
    fontSize: 13.5,
    color: C.primary,
    minHeight: 100,
    lineHeight: 19,
    paddingRight: 24,
  },
  clearBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    fontSize: 11,
    color: C.muted,
    fontFamily: BeavyFonts.bold,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDEDEB',
    padding: 10,
    borderRadius: BeavyRadius.md,
  },
  errorText: {
    flex: 1,
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: '#B3261E',
    lineHeight: 16,
  },
  presetsSection: {
    gap: 8,
  },
  presetsLabel: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12,
    color: C.muted,
  },
  presetsRow: {
    gap: 6,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: BeavyRadius.md,
  },
  presetIconBox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12.5,
    color: C.primary,
    flex: 1,
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: C.secondary,
    padding: 12,
    borderRadius: BeavyRadius.md,
  },
  hintText: {
    flex: 1,
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.primary,
    lineHeight: 16,
  },
  bottomBar: {
    paddingTop: 6,
  },
  primaryCta: {
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaDisabled: {
    opacity: 0.45,
  },
  primaryCtaText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13.5,
    color: C.surface,
  },
  ctaContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewContainer: {
    gap: 10,
    paddingTop: 4,
  },
  recipeMetaCard: {
    padding: 12,
    gap: 10,
  },
  recipeMetaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recipeThumb: {
    width: 44,
    height: 44,
    borderRadius: BeavyRadius.md,
  },
  recipeThumbFallback: {
    width: 44,
    height: 44,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeThumbFallbackIcon: {
    fontSize: 22,
  },
  recipeMetaCopy: {
    flex: 1,
    gap: 2,
  },
  recipeTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 14,
    color: C.cherry,
    lineHeight: 18,
  },
  recipeDomain: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
  },
  servingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.rule,
  },
  servingsLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  servingsLabel: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12.5,
    color: C.primary,
  },
  servingsStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  stepperBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.primary,
    lineHeight: 17,
  },
  servingsValue: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 13.5,
    color: C.primary,
    minWidth: 20,
    textAlign: 'center',
  },
  staplesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.secondary,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: BeavyRadius.md,
  },
  staplesBannerText: {
    flex: 1,
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.primary,
    lineHeight: 15,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 6,
  },
  tabChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
  },
  tabChipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  tabChipText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 11.5,
    color: C.primary,
  },
  tabChipTextActive: {
    color: C.surface,
  },
  reviewListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
  },
  ingredientRowExcluded: {
    opacity: 0.5,
    backgroundColor: C.background,
  },
  checkboxCircle: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxEmpty: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: C.muted,
  },
  checkboxFallbackActive: {
    color: C.cherry,
    fontSize: 17,
  },
  thumbWrapper: {
    width: 38,
    height: 38,
  },
  thumbGenericCircle: {
    width: 38,
    height: 38,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbGenericIcon: {
    fontSize: 16,
  },
  ingredientCopy: {
    flex: 1,
    gap: 2,
  },
  ingredientTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.primary,
  },
  textStrikethrough: {
    textDecorationLine: 'line-through',
    color: C.muted,
  },
  ingredientMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quantityBadge: {
    backgroundColor: C.secondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BeavyRadius.sm,
  },
  quantityBadgeText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.primary,
  },
  stapleTag: {
    backgroundColor: '#FCE2DB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BeavyRadius.sm,
  },
  stapleTagText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 10,
    color: C.primary,
  },
  matchedTag: {
    backgroundColor: '#DBE3C6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BeavyRadius.sm,
  },
  matchedTagText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 10,
    color: '#3A542A',
  },
  stepperWrap: {
    transform: [{ scale: 0.9 }],
  },
  reviewBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.rule,
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.primary,
  },
  confirmCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    paddingVertical: 12,
  },
  confirmCtaText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.surface,
  },
  aiCreditsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  aiPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.leek,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BeavyRadius.pill,
  },
  aiPillText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: C.primary,
  },
  refillChip: {
    backgroundColor: C.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
  },
  refillChipText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 10.5,
    color: C.surface,
  },
  aiAnalyzedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  aiAnalyzedBadgeText: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 11.5,
    color: C.primary,
    flex: 1,
  },
  economicHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginTop: 2,
  },
  economicHintText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
    flex: 1,
  },
  tierRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  tierPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.buttermilk,
    borderWidth: 1,
    borderColor: C.rule,
    maxWidth: 160,
  },
  tierPillActive: {
    backgroundColor: C.leek,
    borderColor: C.leekDark,
  },
  tierPillText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 10.5,
    color: C.muted,
  },
  tierPillTextActive: {
    fontFamily: BeavyFonts.extraBold,
    color: C.primary,
  },
});
