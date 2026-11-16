import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductImageBox } from '@/components/product-image-box';
import { QuantityStepper } from '@/components/quantity-stepper';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import { useBottomSheetAnimation } from '@/hooks/use-bottom-sheet-animation';
import {
  type DisplayProduct,
  formatProductTitle,
  searchFlatCatalogProducts,
} from '@/services/beavy-catalog-search';
import {
  type CatalogIndexProduct,
  type ConfirmedScanBatch,
  deduplicateConfirmedScanItems,
  displayProductToCatalogIndex,
  type PreparedScanImage,
  prepareImageForScan,
  rematchEditedReviewItem,
  scanFromRawText,
  type ScannedReviewItem,
  scanListFromImage,
} from '@/services/beavy-list-scanner';

type ScanStage = 'source' | 'preview' | 'text_input' | 'review';

type ScanListModalProps = {
  visible: boolean;
  activeListName: string;
  onClose: () => void;
  onConfirmAddItems: (batch: ConfirmedScanBatch) => void;
  onGoToProfile?: () => void;
  onOpenRecipeModal?: () => void;
};

export function ScanListModal({
  visible,
  activeListName,
  onClose,
  onConfirmAddItems,
  onGoToProfile,
  onOpenRecipeModal,
}: ScanListModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const {
    rendered,
    requestClose,
    panHandlers,
    backdropStyle,
    sheetStyle,
  } = useBottomSheetAnimation(visible, onClose, Math.max(680, windowHeight));

  if (!rendered) return null;

  return (
    <ScanListSheetContent
      activeListName={activeListName}
      windowHeight={windowHeight}
      requestClose={requestClose}
      panHandlers={panHandlers}
      backdropStyle={backdropStyle}
      sheetStyle={sheetStyle}
      onConfirmAddItems={onConfirmAddItems}
      onGoToProfile={onGoToProfile}
      onOpenRecipeModal={onOpenRecipeModal}
    />
  );
}

type ScanListSheetContentProps = {
  activeListName: string;
  windowHeight: number;
  requestClose: () => void;
  panHandlers: ReturnType<typeof useBottomSheetAnimation>['panHandlers'];
  backdropStyle: ReturnType<typeof useBottomSheetAnimation>['backdropStyle'];
  sheetStyle: ReturnType<typeof useBottomSheetAnimation>['sheetStyle'];
  onConfirmAddItems: (batch: ConfirmedScanBatch) => void;
  onGoToProfile?: () => void;
  onOpenRecipeModal?: () => void;
};

function ScanListSheetContent({
  activeListName,
  windowHeight,
  requestClose,
  panHandlers,
  backdropStyle,
  sheetStyle,
  onConfirmAddItems,
  onGoToProfile,
  onOpenRecipeModal,
}: ScanListSheetContentProps) {
  const insets = useSafeAreaInsets();
  const maxSheetHeight = Math.max(
    400,
    Math.min(
      Math.round(windowHeight * 0.92),
      windowHeight - Math.max(insets.top + 12, 40)
    )
  );

  const [stage, setStage] = useState<ScanStage>('source');
  const [pickedAsset, setPickedAsset] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [preparedImage, setPreparedImage] = useState<PreparedScanImage | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');
  const [permissionNotice, setPermissionNotice] = useState<{
    message: string;
    canOpenSettings: boolean;
  } | null>(null);
  const [extractionFeedback, setExtractionFeedback] = useState<{
    kind: 'unreadable' | 'needs_setup' | 'auth_required' | 'error';
    message: string;
  } | null>(null);
  const [showTextFallbackInPreview, setShowTextFallbackInPreview] =
    useState(false);
  const [manualRawText, setManualRawText] = useState('');

  const [reviewItems, setReviewItems] = useState<ScannedReviewItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState('');

  // In-sheet variant disambiguation / catalog picker
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerSearchResults, setPickerSearchResults] = useState<
    CatalogIndexProduct[]
  >([]);
  const [pickerSearching, setPickerSearching] = useState(false);

  const activePickerItem = useMemo(
    () => reviewItems.find((it) => it.localId === pickerItemId) ?? null,
    [reviewItems, pickerItemId]
  );

  const handlePickerQueryChange = (nextText: string) => {
    setPickerQuery(nextText);
    const clean = nextText.trim();
    if (clean.length < 2) {
      setPickerSearchResults([]);
      setPickerSearching(false);
    } else {
      setPickerSearching(true);
    }
  };

  // Debounced catalog search inside variant picker
  useEffect(() => {
    if (!pickerItemId) return;
    const clean = pickerQuery.trim();
    if (clean.length < 2) return;

    let canceled = false;
    const timer = setTimeout(async () => {
      try {
        const rows: DisplayProduct[] = await searchFlatCatalogProducts(
          clean,
          null
        );
        if (!canceled) {
          setPickerSearchResults(
            rows.slice(0, 16).map(displayProductToCatalogIndex)
          );
        }
      } catch {
        if (!canceled) {
          setPickerSearchResults([]);
        }
      } finally {
        if (!canceled) {
          setPickerSearching(false);
        }
      }
    }, 220);

    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [pickerItemId, pickerQuery]);

  const handlePickFromSource = async (mode: 'camera' | 'gallery') => {
    triggerHaptic('selection');
    setPermissionNotice(null);
    setExtractionFeedback(null);

    try {
      if (mode === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setPermissionNotice({
            message:
              'Beavy are nevoie de acces la cameră pentru a fotografia lista. Poți activa permisiunea din Setări sau poți alege o poză din galerie.',
            canOpenSettings: perm.canAskAgain === false,
          });
          return;
        }
        const res = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.9,
        });
        if (res.canceled || !res.assets?.[0]) return;
        const asset = res.assets[0];
        await loadPickedImage(asset.uri, asset.width, asset.height);
        return;
      }

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPermissionNotice({
          message:
            'Beavy are nevoie de acces la galerie pentru a importa o fotografie sau captură de ecran.',
          canOpenSettings: perm.canAskAgain === false,
        });
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      await loadPickedImage(asset.uri, asset.width, asset.height);
    } catch {
      setPermissionNotice({
        message:
          mode === 'camera'
            ? 'Camera nu este disponibilă pe acest dispozitiv. Încearcă importul din galerie sau introducerea textului.'
            : 'Nu am putut deschide galeria foto.',
        canOpenSettings: false,
      });
    }
  };

  const loadPickedImage = async (
    uri: string,
    width: number,
    height: number
  ) => {
    setBusy(true);
    setBusyMessage('Pregătim fotografia…');
    try {
      const prep = await prepareImageForScan({ uri, width, height });
      setPickedAsset({ uri: prep.uri, width: prep.width, height: prep.height });
      setPreparedImage(prep);
      setShowTextFallbackInPreview(false);
      setExtractionFeedback(null);
      setStage('preview');
    } catch {
      setPermissionNotice({
        message: 'Nu am putut procesa imaginea selectată. Încearcă o altă fotografie.',
        canOpenSettings: false,
      });
    } finally {
      setBusy(false);
      setBusyMessage('');
    }
  };

  const handleRotatePreview = async () => {
    if (!pickedAsset || busy) return;
    triggerHaptic('light');
    setBusy(true);
    setBusyMessage('Rotim fotografia…');
    try {
      const rotated = await prepareImageForScan({
        uri: pickedAsset.uri,
        width: pickedAsset.width,
        height: pickedAsset.height,
        rotateDegrees: 90,
      });
      setPickedAsset({
        uri: rotated.uri,
        width: rotated.width,
        height: rotated.height,
      });
      setPreparedImage(rotated);
    } catch {
      // Ignorăm eșecul de rotire păstrând imaginea actuală
    } finally {
      setBusy(false);
      setBusyMessage('');
    }
  };

  const handleRunImageExtraction = async () => {
    if (!preparedImage || busy) return;
    triggerHaptic('medium');
    setBusy(true);
    setBusyMessage('Analizăm lista și căutăm produsele în cămară…');
    setExtractionFeedback(null);

    try {
      const outcome = await scanListFromImage(preparedImage);
      if (outcome.status === 'success') {
        triggerHaptic('success');
        setReviewItems(outcome.reviewItems);
        setStage('review');
        return;
      }

      if (outcome.status === 'unreadable') {
        setExtractionFeedback({
          kind: 'unreadable',
          message: outcome.reason,
        });
        if (outcome.rawText) {
          setManualRawText(outcome.rawText);
        }
        return;
      }

      if (outcome.status === 'needs_setup' || outcome.status === 'auth_required') {
        setExtractionFeedback({
          kind: outcome.status,
          message: outcome.message,
        });
        setShowTextFallbackInPreview(true);
        return;
      }

      setExtractionFeedback({
        kind: 'error',
        message: outcome.message,
      });
    } finally {
      setBusy(false);
      setBusyMessage('');
    }
  };

  const handleRunTextExtraction = async () => {
    if (busy) return;
    triggerHaptic('medium');
    setBusy(true);
    setBusyMessage('Normalizăm liniile și căutăm în catalog…');
    setExtractionFeedback(null);

    try {
      const outcome = await scanFromRawText(manualRawText);
      if (outcome.status === 'success') {
        triggerHaptic('success');
        setReviewItems(outcome.reviewItems);
        setStage('review');
        return;
      }

      setExtractionFeedback({
        kind: outcome.status === 'unreadable' ? 'unreadable' : 'error',
        message:
          outcome.status === 'unreadable'
            ? outcome.reason
            : outcome.message,
      });
    } finally {
      setBusy(false);
      setBusyMessage('');
    }
  };

  const handleToggleInclude = (localId: string) => {
    triggerHaptic('selection');
    setReviewItems((prev) =>
      prev.map((it) =>
        it.localId === localId ? { ...it, included: !it.included } : it
      )
    );
  };

  const handleDeleteReviewItem = (localId: string) => {
    triggerHaptic('selection');
    setReviewItems((prev) => prev.filter((it) => it.localId !== localId));
  };

  const handleStepQuantity = (localId: string, delta: number) => {
    triggerHaptic('light');
    setReviewItems((prev) =>
      prev.map((it) =>
        it.localId === localId
          ? {
              ...it,
              quantity: Math.min(99, Math.max(1, it.quantity + delta)),
            }
          : it
      )
    );
  };

  const handleCommitInlineEdit = async (item: ScannedReviewItem) => {
    const clean = editDraftText.trim();
    setEditingItemId(null);
    if (!clean || clean === item.editedName) return;
    const updated = await rematchEditedReviewItem(item, clean);
    setReviewItems((prev) =>
      prev.map((it) => (it.localId === item.localId ? updated : it))
    );
  };

  const handleSelectVariantForItem = (
    localId: string,
    product: CatalogIndexProduct | null
  ) => {
    triggerHaptic('selection');
    setReviewItems((prev) =>
      prev.map((it) => {
        if (it.localId !== localId) return it;
        if (!product) {
          return {
            ...it,
            selectedProduct: null,
            matchStatus: 'unmatched',
            userResolved: true,
            included: true,
          };
        }
        return {
          ...it,
          selectedProduct: product,
          editedName: formatProductTitle(product.canonical_name, product.brand),
          matchStatus: 'matched',
          matchConfidence: 1,
          userResolved: true,
          included: true,
        };
      })
    );
    setPickerItemId(null);
    handlePickerQueryChange('');
  };

  const reviewStats = useMemo(() => {
    const included = reviewItems.filter((it) => it.included);
    const matched = included.filter(
      (it) => it.matchStatus === 'matched' && it.selectedProduct !== null
    ).length;
    const ambiguousUnresolved = included.filter(
      (it) => it.matchStatus === 'ambiguous' && it.selectedProduct === null
    ).length;
    const manual = included.filter((it) => it.selectedProduct === null).length;
    const batch = deduplicateConfirmedScanItems(reviewItems);
    const canonicalOnlyBatch: ConfirmedScanBatch = {
      canonicalItems: batch.canonicalItems,
      manualItems: [],
    };
    const distinctAdded = canonicalOnlyBatch.canonicalItems.length;
    const totalUnits = canonicalOnlyBatch.canonicalItems.reduce(
      (a, b) => a + b.quantity,
      0
    );

    return {
      totalRows: reviewItems.length,
      includedRows: included.length,
      matched,
      ambiguousUnresolved,
      manual,
      distinctAdded,
      totalUnits,
      hasDuplicatesMerged: distinctAdded < canonicalOnlyBatch.canonicalItems.length,
      batch: canonicalOnlyBatch,
    };
  }, [reviewItems]);

  const pickerCandidatesToShow = useMemoPickerCandidates(
    activePickerItem,
    pickerQuery,
    pickerSearchResults
  );

  const handleConfirmImport = () => {
    if (reviewStats.distinctAdded === 0) return;
    triggerHaptic('success');
    onConfirmAddItems(reviewStats.batch);
    requestClose();
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={requestClose}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={styles.keyboardWrap}
        >
          <Animated.View
            style={[
              styles.sheet,
              { maxHeight: maxSheetHeight },
              sheetStyle,
            ]}
          >
            {/* 1. DRAG HANDLE */}
            <View {...panHandlers} style={styles.dragZone}>
              <View style={styles.dragHandle} />
            </View>

            {/* 2. HEADER */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.modeBadge}>
                  <View style={styles.modeBadgeDot} />
                  <Text style={styles.modeBadgeText}>
                    {pickerItemId
                      ? 'ALEGE VARIANTA'
                      : stage === 'review'
                        ? 'VERIFICARE PRODUSE'
                        : 'SCANEAZĂ LISTA'}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.title}>
                  {pickerItemId && activePickerItem
                    ? activePickerItem.editedName
                    : stage === 'preview'
                      ? 'Confirmă fotografia'
                      : stage === 'text_input'
                        ? 'Lipește textul listei'
                        : stage === 'review'
                          ? `Pentru „${activeListName}”`
                          : 'Importă din fotografie'}
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  if (pickerItemId) {
                    setPickerItemId(null);
                    handlePickerQueryChange('');
                  } else {
                    requestClose();
                  }
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.closeBtn,
                  pressed && styles.btnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={pickerItemId ? 'Înapoi la verificare' : 'Închide'}
              >
                <SymbolView
                  name={pickerItemId ? 'chevron.left' : 'xmark'}
                  tintColor={C.cherry}
                  size={14}
                  fallback={
                    <Text style={styles.closeFallback}>
                      {pickerItemId ? '‹' : '×'}
                    </Text>
                  }
                />
              </Pressable>
            </View>

            {/* 3. CONȚINUT PRINCIPAL */}
            {pickerItemId && activePickerItem ? (
              <View style={styles.pickerContainer}>
                <View style={styles.pickerContextStrip}>
                  <Text numberOfLines={2} style={styles.pickerContextText}>
                    Din listă: „{activePickerItem.rawLine}”
                  </Text>
                </View>

                <View style={styles.pickerSearchWrap}>
                  <View style={styles.pickerSearchBar}>
                    <SymbolView
                      name="magnifyingglass"
                      tintColor={C.muted}
                      size={15}
                      fallback={<Text style={styles.searchFallback}>⌕</Text>}
                    />
                    <TextInput
                      value={pickerQuery}
                      onChangeText={handlePickerQueryChange}
                      placeholder="Caută alt produs în cămară…"
                      placeholderTextColor={C.muted}
                      style={styles.pickerSearchInput}
                      autoCorrect={false}
                      autoCapitalize="none"
                    />
                    {!!pickerQuery && (
                      <Pressable
                        onPress={() => handlePickerQueryChange('')}
                        hitSlop={8}
                        style={styles.clearInlineBtn}
                      >
                        <Text style={styles.clearInlineText}>×</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                >
                  <View style={styles.listSheet}>
                    {pickerSearching ? (
                      <View style={styles.pickerLoadingRow}>
                        <ActivityIndicator size="small" color={C.strawberry} />
                        <Text style={styles.pickerLoadingText}>
                          Căutăm variante în catalog…
                        </Text>
                      </View>
                    ) : pickerCandidatesToShow.length === 0 ? (
                      <View style={styles.pickerEmptyRow}>
                        <Text style={styles.pickerEmptyText}>
                          Nicio variantă potrivită găsită. Încearcă să cauți după un alt termen din catalog.
                        </Text>
                      </View>
                    ) : (
                      pickerCandidatesToShow.map((entry, idx) => {
                        const isLast = idx === pickerCandidatesToShow.length - 1;
                        const isSelected =
                          activePickerItem.selectedProduct?.id === entry.product.id;
                        const cleanTitle = formatProductTitle(
                          entry.product.canonical_name,
                          entry.product.brand
                        );
                        const meta = [
                          entry.product.brand,
                          entry.product.package_size,
                        ]
                          .filter(Boolean)
                          .join(' · ');

                        return (
                          <Pressable
                            key={entry.product.id}
                            onPress={() =>
                              handleSelectVariantForItem(
                                activePickerItem.localId,
                                entry.product
                              )
                            }
                            style={({ pressed }) => [
                              styles.variantRow,
                              !isLast && styles.rowDivider,
                              isSelected && styles.variantRowSelected,
                              pressed && styles.btnPressed,
                            ]}
                          >
                            <ProductImageBox
                              imageUrl={entry.product.image_url}
                              productName={entry.product.canonical_name}
                              brand={entry.product.brand}
                              categoryName={entry.product.category}
                              variant="thumb"
                            />
                            <View style={styles.flexOne}>
                              <Text numberOfLines={2} style={styles.variantTitle}>
                                {cleanTitle}
                              </Text>
                              {!!meta && (
                                <Text numberOfLines={1} style={styles.variantMeta}>
                                  {meta}
                                </Text>
                              )}
                            </View>
                            {entry.score !== null && (
                              <View style={styles.scorePill}>
                                <Text style={styles.scorePillText}>
                                  {Math.round(entry.score * 100)}%
                                </Text>
                              </View>
                            )}
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                </ScrollView>
              </View>
            ) : (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {/* STAGE 1: SURSA */}
                {stage === 'source' && (
                  <View style={styles.sourceStack}>
                    <Text style={styles.subtitle}>
                      Fotografiază o listă scrisă de mână, imprimată sau importă o captură de ecran.
                    </Text>

                    {permissionNotice && (
                      <View style={styles.noticeCard}>
                        <Text style={styles.noticeText}>
                          {permissionNotice.message}
                        </Text>
                        {permissionNotice.canOpenSettings && (
                          <Pressable
                            onPress={() => void Linking.openSettings()}
                            style={styles.noticeActionBtn}
                          >
                            <Text style={styles.noticeActionText}>
                              Deschide Setări
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    )}

                    <View style={styles.listSheet}>
                      <Pressable
                        onPress={() => void handlePickFromSource('camera')}
                        disabled={busy}
                        style={({ pressed }) => [
                          styles.sourceRow,
                          styles.rowDivider,
                          pressed && styles.btnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Fotografiază lista"
                      >
                        <View style={styles.sourceIconCircle}>
                          <SymbolView
                            name="camera.fill"
                            tintColor={C.cherry}
                            size={18}
                            fallback={<Text style={styles.symbolFallback}>◎</Text>}
                          />
                        </View>
                        <View style={styles.flexOne}>
                          <Text style={styles.sourceTitle}>
                            Fotografiază lista
                          </Text>
                          <Text style={styles.sourceSub}>
                            Cameră foto · listă de mână sau imprimată
                          </Text>
                        </View>
                        <SymbolView
                          name="chevron.right"
                          tintColor={C.muted}
                          size={13}
                          fallback={<Text style={styles.chevronFallback}>›</Text>}
                        />
                      </Pressable>

                      <Pressable
                        onPress={() => void handlePickFromSource('gallery')}
                        disabled={busy}
                        style={({ pressed }) => [
                          styles.sourceRow,
                          pressed && styles.btnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Alege din galerie"
                      >
                        <View
                          style={[
                            styles.sourceIconCircle,
                            styles.sourceIconCircleWarm,
                          ]}
                        >
                          <SymbolView
                            name="photo.on.rectangle.angled"
                            tintColor={C.cherry}
                            size={18}
                            fallback={<Text style={styles.symbolFallback}>▣</Text>}
                          />
                        </View>
                        <View style={styles.flexOne}>
                          <Text style={styles.sourceTitle}>
                            Alege din galerie
                          </Text>
                          <Text style={styles.sourceSub}>
                            Fotografie salvată sau captură de ecran
                          </Text>
                        </View>
                        <SymbolView
                          name="chevron.right"
                          tintColor={C.muted}
                          size={13}
                          fallback={<Text style={styles.chevronFallback}>›</Text>}
                        />
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        setExtractionFeedback(null);
                        setStage('text_input');
                      }}
                      style={({ pressed }) => [
                        styles.textShortcutBtn,
                        pressed && styles.btnPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Sau lipește textul listei"
                    >
                      <SymbolView
                        name="doc.text"
                        tintColor={C.cherry}
                        size={14}
                        fallback={<Text style={styles.symbolFallback}>≡</Text>}
                      />
                      <Text style={styles.textShortcutLabel}>
                        Sau lipește textul listei
                      </Text>
                    </Pressable>

                    {onOpenRecipeModal && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          requestClose();
                          onOpenRecipeModal();
                        }}
                        style={({ pressed }) => [
                          styles.textShortcutBtn,
                          pressed && styles.btnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Importă ingrediente din rețetă sau link"
                      >
                        <SymbolView
                          name="fork.knife"
                          tintColor={C.cherry}
                          size={14}
                          fallback={<Text style={styles.symbolFallback}>*</Text>}
                        />
                        <Text style={styles.textShortcutLabel}>
                          Importă din rețetă sau link culinar
                        </Text>
                      </Pressable>
                    )}

                    {busy && (
                      <View style={styles.busyInlineRow}>
                        <ActivityIndicator size="small" color={C.strawberry} />
                        <Text style={styles.busyText}>{busyMessage}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* STAGE 2: PREVIZUALIZARE & CONFIRMARE FOTOGRAFIE */}
                {stage === 'preview' && pickedAsset && (
                  <View style={styles.previewStack}>
                    <View style={styles.previewFrame}>
                      <Image
                        source={{ uri: pickedAsset.uri }}
                        style={styles.previewImage}
                        contentFit="contain"
                      />
                    </View>

                    <View style={styles.previewToolsRow}>
                      <Pressable
                        onPress={() => void handleRotatePreview()}
                        disabled={busy}
                        style={({ pressed }) => [
                          styles.previewToolPill,
                          pressed && styles.btnPressed,
                        ]}
                      >
                        <SymbolView
                          name="rotate.right"
                          tintColor={C.cherry}
                          size={13}
                          fallback={<Text style={styles.symbolFallback}>↻</Text>}
                        />
                        <Text style={styles.previewToolText}>Rotește 90°</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          setExtractionFeedback(null);
                          setStage('source');
                        }}
                        disabled={busy}
                        style={({ pressed }) => [
                          styles.previewToolPill,
                          pressed && styles.btnPressed,
                        ]}
                      >
                        <SymbolView
                          name="arrow.triangle.2.circlepath"
                          tintColor={C.cherry}
                          size={13}
                          fallback={<Text style={styles.symbolFallback}>↺</Text>}
                        />
                        <Text style={styles.previewToolText}>Altă poză</Text>
                      </Pressable>
                    </View>

                    {busy && (
                      <View style={styles.busyCard}>
                        <ActivityIndicator size="small" color={C.strawberry} />
                        <Text style={styles.busyText}>{busyMessage}</Text>
                      </View>
                    )}

                    {extractionFeedback && (
                      <View style={styles.noticeCard}>
                        <Text style={styles.noticeText}>
                          {extractionFeedback.message}
                        </Text>

                        <View style={styles.noticeActionsRow}>
                          {extractionFeedback.kind === 'auth_required' &&
                            onGoToProfile && (
                              <Pressable
                                onPress={() => {
                                  requestClose();
                                  onGoToProfile();
                                }}
                                style={styles.noticeActionBtn}
                              >
                                <Text style={styles.noticeActionText}>
                                  Mergi la Cont
                                </Text>
                              </Pressable>
                            )}

                          {!showTextFallbackInPreview && (
                            <Pressable
                              onPress={() => setShowTextFallbackInPreview(true)}
                              style={styles.noticeSecondaryBtn}
                            >
                              <Text style={styles.noticeSecondaryText}>
                                Lipește textul manual
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    )}

                    {showTextFallbackInPreview && (
                      <View style={styles.fallbackTextBox}>
                        <Text style={styles.fallbackTextLabel}>
                          Lipește sau scrie produsele din poză (câte unul pe rând):
                        </Text>
                        <TextInput
                          value={manualRawText}
                          onChangeText={setManualRawText}
                          placeholder={'Ex:\n2 l lapte Zuzu\n3 ouă\npâine feliată'}
                          placeholderTextColor={C.muted}
                          multiline
                          textAlignVertical="top"
                          style={styles.multilineInput}
                        />
                        <Pressable
                          onPress={() => void handleRunTextExtraction()}
                          disabled={busy || !manualRawText.trim()}
                          style={({ pressed }) => [
                            styles.inlineExtractBtn,
                            (!manualRawText.trim() || busy) && styles.btnDisabled,
                            pressed && styles.btnPressed,
                          ]}
                        >
                          <Text style={styles.inlineExtractBtnText}>
                            Analizează textul
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}

                {/* STAGE 3: INTRODUCERE TEXT DIRECT */}
                {stage === 'text_input' && (
                  <View style={styles.previewStack}>
                    <Text style={styles.subtitle}>
                      Lipește textul copiat dintr-o notă, WhatsApp sau Live Text, câte un produs pe linie.
                    </Text>
                    <View style={styles.fallbackTextBox}>
                      <TextInput
                        value={manualRawText}
                        onChangeText={setManualRawText}
                        placeholder={'Ex:\n2x lapte Napolact 3.5%\n1 kg roșii\n500 g paste Barilla\nunt 82%'}
                        placeholderTextColor={C.muted}
                        multiline
                        textAlignVertical="top"
                        style={[styles.multilineInput, styles.multilineInputTall]}
                      />
                    </View>
                    {extractionFeedback && (
                      <View style={styles.noticeCard}>
                        <Text style={styles.noticeText}>
                          {extractionFeedback.message}
                        </Text>
                      </View>
                    )}
                    {busy && (
                      <View style={styles.busyCard}>
                        <ActivityIndicator size="small" color={C.strawberry} />
                        <Text style={styles.busyText}>{busyMessage}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* STAGE 4: VERIFICARE PRODUSE IDENTIFICATE */}
                {stage === 'review' && (
                  <View style={styles.reviewStack}>
                    {/* Rezumat identificare */}
                    <View style={styles.summaryCard}>
                      <View style={styles.summaryBadgesRow}>
                        <View style={styles.summaryPillNeutral}>
                          <Text style={styles.summaryPillNeutralText}>
                            {reviewStats.includedRows}{' '}
                            {reviewStats.includedRows === 1
                              ? 'produs'
                              : 'produse'}
                          </Text>
                        </View>
                        {reviewStats.matched > 0 && (
                          <View style={styles.summaryPillLeek}>
                            <Text style={styles.summaryPillText}>
                              {reviewStats.matched} sigure
                            </Text>
                          </View>
                        )}
                        {reviewStats.ambiguousUnresolved > 0 && (
                          <View style={styles.summaryPillPeach}>
                            <Text style={styles.summaryPillText}>
                              {reviewStats.ambiguousUnresolved} de ales
                            </Text>
                          </View>
                        )}
                        {reviewStats.manual - reviewStats.ambiguousUnresolved >
                          0 && (
                          <View style={styles.summaryPillNeutral}>
                            <Text style={styles.summaryPillNeutralText}>
                              {reviewStats.manual -
                                reviewStats.ambiguousUnresolved}{' '}
                              proprii
                            </Text>
                          </View>
                        )}
                      </View>

                      {reviewStats.ambiguousUnresolved > 0 && (
                        <Text style={styles.summaryHintText}>
                          Alege varianta dorită pentru produsele marcate „Ambiguu” sau păstrează-le ca text propriu.
                        </Text>
                      )}
                    </View>

                    {reviewItems.length === 0 ? (
                      <View style={styles.emptyReviewBox}>
                        <Text style={styles.emptyReviewTitle}>
                          Niciun produs rămas de importat
                        </Text>
                        <Text style={styles.emptyReviewSub}>
                          Poți scana o altă fotografie sau introduce produsele manual.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.listSheet}>
                        {reviewItems.map((item, idx) => {
                          const isLast = idx === reviewItems.length - 1;
                          const isEditing = editingItemId === item.localId;
                          const isAmbiguous =
                            item.matchStatus === 'ambiguous' &&
                            item.selectedProduct === null;
                          const isMatched =
                            item.matchStatus === 'matched' &&
                            item.selectedProduct !== null;

                          const displayName = item.selectedProduct
                            ? formatProductTitle(
                                item.selectedProduct.canonical_name,
                                item.selectedProduct.brand
                              )
                            : item.editedName;

                          const productMeta = item.selectedProduct
                            ? [
                                item.selectedProduct.brand,
                                item.selectedProduct.package_size,
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : [item.brandHint, item.packageSizeHint]
                                .filter(Boolean)
                                .join(' · ');

                          return (
                            <View
                              key={item.localId}
                              style={[
                                styles.reviewRow,
                                !isLast && styles.rowDivider,
                                !item.included && styles.reviewRowExcluded,
                              ]}
                            >
                              <View style={styles.reviewTopLine}>
                                <Pressable
                                  onPress={() =>
                                    handleToggleInclude(item.localId)
                                  }
                                  hitSlop={10}
                                  accessibilityRole="checkbox"
                                  accessibilityState={{ checked: item.included }}
                                  style={styles.checkboxHit}
                                >
                                  <View
                                    style={[
                                      styles.checkCircle,
                                      item.included
                                        ? styles.checkCircleChecked
                                        : styles.checkCircleIdle,
                                    ]}
                                  >
                                    {item.included && (
                                      <SymbolView
                                        name="checkmark"
                                        tintColor={C.white}
                                        size={11}
                                        fallback={
                                          <Text style={styles.checkFallback}>
                                            ✓
                                          </Text>
                                        }
                                      />
                                    )}
                                  </View>
                                </Pressable>

                                {item.selectedProduct && (
                                  <ProductImageBox
                                    imageUrl={item.selectedProduct.image_url}
                                    productName={
                                      item.selectedProduct.canonical_name
                                    }
                                    brand={item.selectedProduct.brand}
                                    categoryName={item.selectedProduct.category}
                                    variant="thumb"
                                  />
                                )}

                                <View style={styles.flexOne}>
                                  {isEditing ? (
                                    <TextInput
                                      value={editDraftText}
                                      onChangeText={setEditDraftText}
                                      onBlur={() =>
                                        void handleCommitInlineEdit(item)
                                      }
                                      onSubmitEditing={() =>
                                        void handleCommitInlineEdit(item)
                                      }
                                      returnKeyType="done"
                                      autoFocus
                                      style={styles.inlineNameInput}
                                    />
                                  ) : (
                                    <Pressable
                                      onPress={() => {
                                        triggerHaptic('selection');
                                        setEditingItemId(item.localId);
                                        setEditDraftText(displayName);
                                      }}
                                      hitSlop={4}
                                    >
                                      <Text
                                        numberOfLines={2}
                                        style={styles.reviewItemTitle}
                                      >
                                        {displayName}
                                      </Text>
                                    </Pressable>
                                  )}

                                  <Text
                                    numberOfLines={1}
                                    style={styles.reviewItemSub}
                                  >
                                    {productMeta
                                      ? `${productMeta} · „${item.rawLine}”`
                                      : `Din poză: „${item.rawLine}”`}
                                  </Text>
                                </View>

                                <Pressable
                                  onPress={() =>
                                    handleDeleteReviewItem(item.localId)
                                  }
                                  hitSlop={10}
                                  style={styles.deleteRowBtn}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Elimină ${displayName}`}
                                >
                                  <SymbolView
                                    name="trash"
                                    tintColor={C.muted}
                                    size={13}
                                    fallback={
                                      <Text style={styles.deleteFallback}>
                                        ×
                                      </Text>
                                    }
                                  />
                                </Pressable>
                              </View>

                              <View style={styles.reviewBottomLine}>
                                <View style={styles.reviewBadgesLeft}>
                                  <View
                                    style={[
                                      styles.confidenceBadge,
                                      isMatched
                                        ? styles.confidenceBadgeMatched
                                        : isAmbiguous
                                          ? styles.confidenceBadgeAmbiguous
                                          : styles.confidenceBadgeManual,
                                    ]}
                                  >
                                    <Text style={styles.confidenceBadgeText}>
                                      {isMatched
                                        ? `Sigur · ${Math.round(
                                            item.matchConfidence * 100
                                          )}%`
                                        : isAmbiguous
                                          ? `Ambiguu · ${item.candidates.length} var.`
                                          : 'Neasociat'}
                                    </Text>
                                  </View>

                                  <Pressable
                                    onPress={() => {
                                      triggerHaptic('selection');
                                      setPickerItemId(item.localId);
                                      handlePickerQueryChange('');
                                    }}
                                    hitSlop={6}
                                    style={({ pressed }) => [
                                      styles.variantPickBtn,
                                      isAmbiguous &&
                                        styles.variantPickBtnHighlight,
                                      pressed && styles.btnPressed,
                                    ]}
                                  >
                                    <Text style={styles.variantPickBtnText}>
                                      {isAmbiguous
                                        ? 'Alege varianta ▾'
                                        : item.selectedProduct
                                          ? 'Schimbă'
                                          : 'Catalog'}
                                    </Text>
                                  </Pressable>
                                </View>

                                <QuantityStepper
                                  quantity={item.quantity}
                                  variant="paper"
                                  onDecrement={() =>
                                    handleStepQuantity(item.localId, -1)
                                  }
                                  onIncrement={() =>
                                    handleStepQuantity(item.localId, 1)
                                  }
                                />
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            )}

            {/* 4. FOOTER FIX CU RESPECTARE iOS SAFE AREA */}
            {!pickerItemId && stage !== 'source' && (
              <View
                style={[
                  styles.footer,
                  { paddingBottom: Math.max(16, insets.bottom + 8) },
                ]}
              >
                {stage === 'preview' && (
                  <>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        setStage('source');
                      }}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.secondaryFooterBtn,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.secondaryFooterBtnText}>Înapoi</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => void handleRunImageExtraction()}
                      disabled={busy || !preparedImage}
                      style={({ pressed }) => [
                        styles.primaryFooterBtn,
                        (busy || !preparedImage) && styles.btnDisabled,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.primaryFooterBtnText}>
                        {busy ? 'Se analizează…' : 'Extrage produsele'}
                      </Text>
                    </Pressable>
                  </>
                )}

                {stage === 'text_input' && (
                  <>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        setStage('source');
                      }}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.secondaryFooterBtn,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.secondaryFooterBtnText}>Înapoi</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => void handleRunTextExtraction()}
                      disabled={busy || !manualRawText.trim()}
                      style={({ pressed }) => [
                        styles.primaryFooterBtn,
                        (busy || !manualRawText.trim()) && styles.btnDisabled,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.primaryFooterBtnText}>
                        Analizează textul
                      </Text>
                    </Pressable>
                  </>
                )}

                {stage === 'review' && (
                  <View style={styles.reviewFooterCol}>
                    {reviewStats.hasDuplicatesMerged && (
                      <Text style={styles.mergeHintText}>
                        Elementele duplicate se cumulează automat la adăugare.
                      </Text>
                    )}
                    <View style={styles.reviewFooterRow}>
                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          setStage('source');
                        }}
                        style={({ pressed }) => [
                          styles.secondaryFooterBtn,
                          pressed && styles.btnPressed,
                        ]}
                      >
                        <Text style={styles.secondaryFooterBtnText}>
                          Altă poză
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={handleConfirmImport}
                        disabled={reviewStats.distinctAdded === 0}
                        style={({ pressed }) => [
                          styles.primaryFooterBtn,
                          reviewStats.distinctAdded === 0 && styles.btnDisabled,
                          pressed && styles.btnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Adaugă ${reviewStats.distinctAdded} produse în listă`}
                      >
                        <Text style={styles.primaryFooterBtnText}>
                          Adaugă ({reviewStats.distinctAdded} prod. ·{' '}
                          {reviewStats.totalUnits} buc.)
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function useMemoPickerCandidates(
  activePickerItem: ScannedReviewItem | null,
  pickerQuery: string,
  pickerSearchResults: CatalogIndexProduct[]
): { product: CatalogIndexProduct; score: number | null }[] {
  return useMemo(() => {
    if (!activePickerItem) return [];
    const clean = pickerQuery.trim();
    if (clean.length >= 2) {
      return pickerSearchResults.map((p) => {
        const matchedCand = activePickerItem.candidates.find(
          (c) => c.product.id === p.id
        );
        return {
          product: p,
          score: matchedCand ? matchedCand.score : null,
        };
      });
    }
    return activePickerItem.candidates.map((c) => ({
      product: c.product,
      score: c.score,
    }));
  }, [activePickerItem, pickerQuery, pickerSearchResults]);
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(66, 23, 38, 0.45)',
  },
  sheet: {
    backgroundColor: C.buttermilk,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    flexShrink: 1,
    borderTopWidth: 1,
    borderColor: C.rule,
    shadowColor: C.cherry,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 14,
  },
  dragZone: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    flexShrink: 0,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: BeavyRadius.pill,
    backgroundColor: 'rgba(118, 91, 96, 0.28)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
    flexShrink: 0,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: C.grapefruit,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  modeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.strawberry,
  },
  modeBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10,
    color: C.cherry,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 20,
    color: C.cherry,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: BeavyFonts.medium,
    fontSize: 13,
    color: C.muted,
    lineHeight: 18,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFallback: {
    fontSize: 18,
    fontWeight: '700',
    color: C.cherry,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 16,
    gap: 12,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  btnPressed: {
    opacity: 0.8,
  },
  btnDisabled: {
    opacity: 0.48,
  },
  listSheet: {
    backgroundColor: C.white,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
    paddingHorizontal: 12,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },

  // SOURCE STAGE
  sourceStack: {
    gap: 12,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    minHeight: 62,
  },
  sourceIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.grapefruit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceIconCircleWarm: {
    backgroundColor: C.buttermilk,
    borderWidth: 1,
    borderColor: C.rule,
  },
  sourceTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 14.5,
    color: C.cherry,
  },
  sourceSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.muted,
  },
  textShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 44,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: C.rule,
    backgroundColor: C.white,
  },
  textShortcutLabel: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13,
    color: C.cherry,
  },

  // PREVIEW STAGE
  previewStack: {
    gap: 10,
  },
  previewFrame: {
    backgroundColor: C.white,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
    height: 220,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  previewToolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 99,
    paddingHorizontal: 14,
    minHeight: 38,
  },
  previewToolText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12.5,
    color: C.cherry,
  },

  // NOTICES & BUSY
  busyInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  busyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.white,
    borderRadius: BeavyRadius.md,
    borderWidth: 1,
    borderColor: C.rule,
    padding: 12,
  },
  busyText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12.5,
    color: C.cherry,
    flex: 1,
  },
  noticeCard: {
    backgroundColor: C.grapefruit,
    borderRadius: BeavyRadius.md,
    borderWidth: 1,
    borderColor: C.paperRule,
    padding: 12,
    gap: 8,
  },
  noticeText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: C.cherry,
    lineHeight: 17,
  },
  noticeActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  noticeActionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: C.cherry,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  noticeActionText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: C.white,
  },
  noticeSecondaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: C.white,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.paperRule,
  },
  noticeSecondaryText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: C.cherry,
  },

  // TEXT FALLBACK
  fallbackTextBox: {
    backgroundColor: C.white,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
    padding: 12,
    gap: 8,
  },
  fallbackTextLabel: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12.5,
    color: C.cherry,
  },
  multilineInput: {
    minHeight: 92,
    backgroundColor: C.buttermilk,
    borderRadius: BeavyRadius.md,
    borderWidth: 1,
    borderColor: C.rule,
    padding: 10,
    fontFamily: BeavyFonts.medium,
    fontSize: 13.5,
    color: C.cherry,
    lineHeight: 19,
  },
  multilineInputTall: {
    minHeight: 160,
  },
  inlineExtractBtn: {
    alignSelf: 'flex-end',
    backgroundColor: C.cherry,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 38,
    justifyContent: 'center',
  },
  inlineExtractBtnText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: C.white,
  },

  // REVIEW STAGE
  reviewStack: {
    gap: 10,
  },
  summaryCard: {
    backgroundColor: C.white,
    borderRadius: BeavyRadius.md,
    borderWidth: 1,
    borderColor: C.rule,
    padding: 11,
    gap: 6,
  },
  summaryBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  summaryPillNeutral: {
    backgroundColor: C.buttermilk,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: C.rule,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  summaryPillNeutralText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: C.cherry,
  },
  summaryPillLeek: {
    backgroundColor: C.leek,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  summaryPillPeach: {
    backgroundColor: C.grapefruit,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  summaryPillText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: C.cherry,
  },
  summaryHintText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
    lineHeight: 16,
  },
  emptyReviewBox: {
    backgroundColor: C.white,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  emptyReviewTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 15,
    color: C.cherry,
  },
  emptyReviewSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: C.muted,
    textAlign: 'center',
  },
  reviewRow: {
    paddingVertical: 10,
    gap: 8,
  },
  reviewRowExcluded: {
    opacity: 0.45,
  },
  reviewTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  checkboxHit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleIdle: {
    borderWidth: 1.5,
    borderColor: C.cherry,
    backgroundColor: C.buttermilk,
  },
  checkCircleChecked: {
    backgroundColor: C.cherry,
    borderWidth: 1.5,
    borderColor: C.cherry,
  },
  checkFallback: {
    fontSize: 11,
    color: C.white,
    fontWeight: '800',
  },
  reviewItemTitle: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13.5,
    color: C.cherry,
    lineHeight: 17,
  },
  reviewItemSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
  },
  inlineNameInput: {
    backgroundColor: C.buttermilk,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.paperRule,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontFamily: BeavyFonts.bold,
    fontSize: 13.5,
    color: C.cherry,
  },
  deleteRowBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteFallback: {
    fontSize: 17,
    color: C.muted,
    fontWeight: '700',
  },
  reviewBottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingLeft: 33,
  },
  reviewBadgesLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  confidenceBadge: {
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  confidenceBadgeMatched: {
    backgroundColor: C.leek,
  },
  confidenceBadgeAmbiguous: {
    backgroundColor: C.grapefruit,
  },
  confidenceBadgeManual: {
    backgroundColor: C.buttermilk,
    borderWidth: 1,
    borderColor: C.rule,
  },
  confidenceBadgeText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 10.5,
    color: C.cherry,
  },
  variantPickBtn: {
    backgroundColor: C.buttermilk,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: C.rule,
    paddingHorizontal: 9,
    paddingVertical: 4,
    minHeight: 28,
    justifyContent: 'center',
  },
  variantPickBtnHighlight: {
    backgroundColor: C.white,
    borderColor: C.strawberry,
  },
  variantPickBtnText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: C.cherry,
  },

  // VARIANT PICKER SUB-VIEW
  pickerContainer: {
    flexShrink: 1,
    minHeight: 0,
    gap: 8,
  },
  pickerContextStrip: {
    marginHorizontal: 16,
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.rule,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pickerContextText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.muted,
  },
  pickerSearchWrap: {
    paddingHorizontal: 16,
  },
  pickerSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: C.paperRule,
    paddingHorizontal: 12,
    minHeight: 42,
    gap: 8,
  },
  pickerSearchInput: {
    flex: 1,
    fontFamily: BeavyFonts.semiBold,
    fontSize: 13.5,
    color: C.cherry,
    paddingVertical: 0,
  },
  searchFallback: {
    fontSize: 14,
    color: C.muted,
  },
  clearInlineBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.buttermilk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearInlineText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.muted,
  },
  pickerLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  pickerLoadingText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: C.muted,
  },
  pickerEmptyRow: {
    paddingVertical: 16,
  },
  pickerEmptyText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: C.muted,
    lineHeight: 18,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    minHeight: 54,
  },
  variantRowSelected: {
    backgroundColor: C.buttermilk,
  },
  variantTitle: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13,
    color: C.cherry,
    lineHeight: 17,
  },
  variantMeta: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
  },
  scorePill: {
    backgroundColor: C.leek,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scorePillText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10.5,
    color: C.cherry,
  },

  // FOOTER
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.rule,
    backgroundColor: C.buttermilk,
    flexShrink: 0,
  },
  reviewFooterCol: {
    flex: 1,
    gap: 6,
  },
  mergeHintText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
    textAlign: 'center',
  },
  reviewFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryFooterBtn: {
    backgroundColor: C.white,
    borderRadius: 99,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryFooterBtnText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13,
    color: C.cherry,
  },
  primaryFooterBtn: {
    flex: 1,
    backgroundColor: C.cherry,
    borderRadius: 99,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryFooterBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13,
    color: C.white,
  },
  symbolFallback: {
    fontSize: 13,
    color: C.cherry,
    fontWeight: '700',
  },
  chevronFallback: {
    fontSize: 16,
    color: C.muted,
    fontWeight: '700',
  },
});
