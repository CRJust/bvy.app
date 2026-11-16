import { Image } from 'expo-image';
import { type BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type { DisplayProduct } from '@/services/beavy-catalog-search';
import {
  calculateAisleBasketSummary,
  type LiveAisleBasketItem,
  type ScannedBarcodeResult,
  resolveScannedBarcode,
  validateBarcodeChecksum,
} from '@/services/beavy-local-barcode';

export type BarcodeScannerModalProps = {
  visible: boolean;
  onClose: () => void;
  onBarcodeDetected?: (barcode: string) => void;
  onAddProductToList?: (product: DisplayProduct, quantity?: number) => void;
  onInspectProduct?: (product: DisplayProduct) => void;
  userCity?: string;
};

const SUPPORTED_BARCODE_TYPES: BarcodeType[] = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'itf14',
];

const BARCODE_SCANNER_SETTINGS = {
  barcodeTypes: SUPPORTED_BARCODE_TYPES,
};

type ScannerViewportProps = {
  sessionKey: number;
  torchOn: boolean;
  onBarcode: (rawData: string) => void;
  onCameraReady: () => void;
  onMountError: (msg: string) => void;
};

const ScannerCameraViewport = React.memo(function ScannerCameraViewport({
  sessionKey,
  torchOn,
  onBarcode,
  onCameraReady,
  onMountError,
}: ScannerViewportProps) {
  const handleBarcodeScanned = useCallback(
    (event: { data?: string }) => {
      if (event?.data) {
        onBarcode(String(event.data));
      }
    },
    [onBarcode]
  );

  const handleMountError = useCallback(
    (err: { message?: string }) => {
      onMountError(err?.message || 'Camera nu a putut fi pornită.');
    },
    [onMountError]
  );

  return (
    <CameraView
      key={`scanner-cam-${sessionKey}`}
      style={StyleSheet.absoluteFill}
      facing="back"
      enableTorch={torchOn}
      barcodeScannerSettings={BARCODE_SCANNER_SETTINGS}
      onBarcodeScanned={handleBarcodeScanned}
      onCameraReady={onCameraReady}
      onMountError={handleMountError}
    />
  );
});

type BarcodeScannerModalContentProps = {
  onClose: () => void;
  onBarcodeDetected?: (barcode: string) => void;
  onAddProductToList?: (product: DisplayProduct, quantity?: number) => void;
  onInspectProduct?: (product: DisplayProduct) => void;
  userCity?: string;
};

function BarcodeScannerModalContent({
  onClose,
  onBarcodeDetected,
  onAddProductToList,
  onInspectProduct,
  userCity,
}: BarcodeScannerModalContentProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(1);

  // Mod scanare: 'single' (Card de raft detaliat) vs 'continuous' (Cărucior live pe culoar)
  const [scanMode, setScanMode] = useState<'single' | 'continuous'>('single');

  // Stare rezoluție produs curent
  const [isResolving, setIsResolving] = useState(false);
  const [shelfCardResult, setShelfCardResult] =
    useState<ScannedBarcodeResult | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [detectedToast, setDetectedToast] = useState<string | null>(null);

  // Sesiune „Cărucior Live la Raft”
  const [sessionItems, setSessionItems] = useState<LiveAisleBasketItem[]>([]);
  const [isBasketModalOpen, setIsBasketModalOpen] = useState(false);
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(
    new Set()
  );

  // Introducere manuală
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Lock pentru prevenirea dublurilor instantanee
  const scanLockRef = useRef(false);
  const lastScanTimestampRef = useRef(0);
  const reducedMotion = useReducedMotion();

  // Animații Reanimated
  const laserOffset = useSharedValue(0);
  const cardTranslateY = useSharedValue(500);
  const framePulse = useSharedValue(1);
  const [pulseTrigger, setPulseTrigger] = useState(0);

  // Animație laser
  useEffect(() => {
    if (reducedMotion) {
      laserOffset.value = 0;
      return;
    }
    laserOffset.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.cubic) })
      ),
      -1,
      false
    );
  }, [reducedMotion, laserOffset]);

  // Animație pulsare chenar la detecție cod
  useEffect(() => {
    if (pulseTrigger > 0 && !reducedMotion) {
      framePulse.value = withSequence(
        withTiming(1.08, { duration: 120 }),
        withTiming(1, { duration: 180 })
      );
    }
  }, [pulseTrigger, reducedMotion, framePulse]);

  // Animație foaie card de raft
  useEffect(() => {
    if (shelfCardResult) {
      if (reducedMotion) {
        cardTranslateY.value = 0;
      } else {
        cardTranslateY.value = withSpring(0, {
          damping: 18,
          stiffness: 160,
        });
      }
    } else {
      if (reducedMotion) {
        cardTranslateY.value = 500;
      } else {
        cardTranslateY.value = withTiming(500, { duration: 220 });
      }
    }
  }, [shelfCardResult, reducedMotion, cardTranslateY]);

  const laserAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: laserOffset.value * 120 }],
  }));

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const frameCornerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: framePulse.value }],
  }));

  // Calcul rezumat coș live
  const basketSummary = useMemo(
    () => calculateAisleBasketSummary(sessionItems),
    [sessionItems]
  );

  /**
   * Rezolvă codul scanat (local-first)
   */
  const processScannedCode = useCallback(
    async (rawCode: string) => {
      const clean = rawCode.trim();
      const validation = validateBarcodeChecksum(clean);
      const digits = validation.normalized;

      if (digits.length < 6) return;

      const now = Date.now();
      // Debounce: minim 1200ms între scanări identice
      if (
        scanLockRef.current &&
        lastScannedCode === digits &&
        now - lastScanTimestampRef.current < 1500
      ) {
        return;
      }

      scanLockRef.current = true;
      lastScanTimestampRef.current = now;
      setLastScannedCode(digits);
      setIsResolving(true);

      // Feedback tactil & vizual
      triggerHaptic('success');
      setPulseTrigger((c) => c + 1);

      try {
        const result = await resolveScannedBarcode(digits, { city: userCity });

        if (scanMode === 'single') {
          setShelfCardResult(result);
        } else {
          // Mod continuu: „Cărucior Live la Raft”
          if (result.product) {
            setSessionItems((prev) => {
              const existingIdx = prev.findIndex(
                (item) => item.scannedResult.normalizedEan === result.normalizedEan
              );
              if (existingIdx >= 0) {
                const next = [...prev];
                next[existingIdx] = {
                  ...next[existingIdx],
                  quantity: next[existingIdx].quantity + 1,
                  scannedAt: Date.now(),
                };
                return next;
              }
              return [
                ...prev,
                {
                  id: `aisle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  scannedResult: result,
                  quantity: 1,
                  scannedAt: Date.now(),
                },
              ];
            });

            const bestStore = result.cheapestStore;
            setDetectedToast(
              `✓ ${result.product.canonical_name} (${bestStore ? `${bestStore.price.toFixed(2)} lei la ${bestStore.retailerName}` : 'Adăugat'})`
            );
          } else {
            setDetectedToast(`Cod scanat: ${digits} (produs neasociat)`);
          }

          // Debounce scurt în modul continuu pentru scanare succesivă la raft
          setTimeout(() => {
            scanLockRef.current = false;
            setDetectedToast(null);
          }, 1600);
        }

        // Anunțăm și callback-ul extern dacă este prezent
        onBarcodeDetected?.(digits);
      } catch {
        triggerHaptic('medium');
        setDetectedToast('Eroare la identificarea codului. Încearcă din nou.');
        setTimeout(() => {
          scanLockRef.current = false;
          setDetectedToast(null);
        }, 1500);
      } finally {
        setIsResolving(false);
      }
    },
    [
      lastScannedCode,
      onBarcodeDetected,
      scanMode,
      userCity,
    ]
  );

  const handleDismissShelfCard = useCallback(() => {
    triggerHaptic('selection');
    setShelfCardResult(null);
    setTimeout(() => {
      scanLockRef.current = false;
    }, 240);
  }, []);

  const handleAddSingleToList = useCallback(
    (product: DisplayProduct) => {
      triggerHaptic('success');
      onAddProductToList?.(product, 1);
      setAddedProductIds((prev) => new Set([...prev, product.id]));
    },
    [onAddProductToList]
  );

  const handleAddAllSessionItems = useCallback(() => {
    if (!onAddProductToList || sessionItems.length === 0) return;
    triggerHaptic('success');
    for (const item of sessionItems) {
      if (item.scannedResult.product) {
        onAddProductToList(item.scannedResult.product, item.quantity);
      }
    }
    setSessionItems([]);
    setIsBasketModalOpen(false);
    onClose();
  }, [onAddProductToList, onClose, sessionItems]);

  const handleRestartCamera = useCallback(() => {
    triggerHaptic('selection');
    scanLockRef.current = false;
    setShelfCardResult(null);
    setCameraError(null);
    setCameraReady(false);
    setSessionKey((k) => k + 1);
  }, []);

  const canUseCamera = Boolean(permission?.granted);

  return (
    <View style={[styles.root, { paddingTop: insets.top || 18 }]}>
        {/* Header HUD plutitor peste cameră */}
        <View style={styles.topHud}>
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              setTorchOn(false);
              onClose();
            }}
            hitSlop={12}
            style={({ pressed }) => [styles.hudBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Închide scannerul"
          >
            <SymbolView
              name="xmark"
              tintColor={C.surface}
              size={16}
              fallback={<Text style={styles.hudGlyph}>✕</Text>}
            />
          </Pressable>

          {/* Selector de mod: [ ⚡ Raft ] vs [ 🛒 Coș Live ] */}
          <View style={styles.modePillContainer}>
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setScanMode('single');
                handleDismissShelfCard();
              }}
              style={[
                styles.modePillBtn,
                scanMode === 'single' && styles.modePillBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.modePillText,
                  scanMode === 'single' && styles.modePillTextActive,
                ]}
              >
                ⚡ Raft
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setScanMode('continuous');
                handleDismissShelfCard();
              }}
              style={[
                styles.modePillBtn,
                scanMode === 'continuous' && styles.modePillBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.modePillText,
                  scanMode === 'continuous' && styles.modePillTextActive,
                ]}
              >
                🛒 Coș Live
                {sessionItems.length > 0 ? ` (${sessionItems.length})` : ''}
              </Text>
            </Pressable>
          </View>

          <View style={styles.topRightActions}>
            {Platform.OS !== 'web' && (
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setTorchOn((v) => !v);
                }}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.hudBtn,
                  torchOn && styles.hudBtnActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={torchOn ? 'Oprește lanterna' : 'Aprinde lanterna'}
              >
                <SymbolView
                  name={torchOn ? 'flashlight.on.fill' : 'flashlight.off.fill'}
                  tintColor={torchOn ? C.primary : C.surface}
                  size={16}
                  fallback={<Text style={styles.hudGlyph}>☼</Text>}
                />
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setShowManualInput((v) => !v);
              }}
              hitSlop={12}
              style={({ pressed }) => [
                styles.hudBtn,
                showManualInput && styles.hudBtnActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Tastatură cod bare"
            >
              <SymbolView
                name="keyboard"
                tintColor={showManualInput ? C.primary : C.surface}
                size={16}
                fallback={<Text style={styles.hudGlyph}>⌨</Text>}
              />
            </Pressable>
          </View>
        </View>

        {/* Viewport Cameră */}
        <View style={styles.cameraShell}>
          {!permission ? (
            <View style={styles.permissionCard}>
              <Text style={styles.permText}>Se verifică permisiunea camerei…</Text>
            </View>
          ) : canUseCamera ? (
            <View style={styles.cameraContainer}>
              <ScannerCameraViewport
                sessionKey={sessionKey}
                torchOn={torchOn}
                onBarcode={processScannedCode}
                onCameraReady={() => {
                  setCameraReady(true);
                  setCameraError(null);
                }}
                onMountError={(msg) => setCameraError(msg)}
              />

              {/* Cadru focalizare EAN stil Beavy */}
              <View
                style={[
                  styles.overlayCenter,
                  shelfCardResult ? styles.overlayCenterShifted : null,
                ]}
                pointerEvents="none"
              >
                <Animated.View style={[styles.scanFrame, frameCornerAnimStyle]}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                  <Animated.View style={[styles.scanLaser, laserAnimStyle]} />
                </Animated.View>

                <View style={styles.frameHintPill}>
                  <Text style={styles.frameHintText}>
                    {!cameraReady
                      ? 'Se pornește camera…'
                      : isResolving
                        ? 'Se verifică prețurile în magazine…'
                        : scanMode === 'continuous'
                          ? 'Scanează continuu produsele de pe raft'
                          : 'Încadrează codul de bare EAN'}
                  </Text>
                </View>
              </View>

              {/* Toast notificator în modul continuu */}
              {detectedToast && (
                <View style={styles.toastBanner}>
                  <Text style={styles.toastBannerText} numberOfLines={2}>
                    {detectedToast}
                  </Text>
                </View>
              )}

              {cameraError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{cameraError}</Text>
                  <Pressable
                    onPress={handleRestartCamera}
                    style={styles.retryBtn}
                  >
                    <Text style={styles.retryBtnText}>Reîncearcă</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.permissionCard}>
              <View style={styles.permIconCircle}>
                <SymbolView
                  name="barcode.viewfinder"
                  tintColor={C.primary}
                  size={32}
                  fallback={<Text style={styles.permGlyph}>▦</Text>}
                />
              </View>
              <Text style={styles.permTitle}>Acces la cameră necesar</Text>
              <Text style={styles.permText}>
                Beavy compară instantaneu prețul de la raft cu toate supermarketurile din București.
              </Text>
              <Pressable
                onPress={() => {
                  triggerHaptic('medium');
                  void requestPermission();
                }}
                style={({ pressed }) => [styles.permBtn, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.permBtnText}>Permite camera</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Căsuță de căutare manuală dacă e togglată */}
        {showManualInput && (
          <View style={styles.manualDrawer}>
            <TextInput
              value={manualCode}
              onChangeText={(txt) => setManualCode(txt.replace(/\D/g, ''))}
              placeholder="Introdu cod EAN (ex. 5941000000000)"
              placeholderTextColor={C.muted}
              keyboardType="number-pad"
              maxLength={14}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (manualCode.length >= 6) {
                  void processScannedCode(manualCode);
                  setShowManualInput(false);
                }
              }}
              style={styles.manualInput}
            />
            <Pressable
              disabled={manualCode.length < 6}
              onPress={() => {
                void processScannedCode(manualCode);
                setShowManualInput(false);
              }}
              style={[
                styles.manualSearchBtn,
                manualCode.length < 6 && styles.manualBtnDisabled,
              ]}
            >
              <Text style={styles.manualSearchText}>Caută</Text>
            </Pressable>
          </View>
        )}

        {/* Bara plutitoare „Cărucior Live la Raft” în modul continuu */}
        {scanMode === 'continuous' && sessionItems.length > 0 && !shelfCardResult && (
          <View
            style={[
              styles.liveBasketBar,
              { paddingBottom: Math.max(16, insets.bottom) },
            ]}
          >
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setIsBasketModalOpen(true);
              }}
              style={styles.liveBasketInfo}
            >
              <View style={styles.liveBasketBadge}>
                <Text style={styles.liveBasketBadgeText}>
                  {basketSummary.totalUnits} {basketSummary.totalUnits === 1 ? 'produs' : 'produse'}
                </Text>
              </View>
              {basketSummary.cheapestStoreName && (
                <Text style={styles.liveBasketCheapest}>
                  {basketSummary.cheapestStoreName}:{' '}
                  <Text style={styles.liveBasketPrice}>
                    {basketSummary.cheapestTotal.toFixed(2)} lei
                  </Text>
                </Text>
              )}
              {basketSummary.totalSavingsRon > 0 && (
                <Text style={styles.liveBasketSavings}>
                  Economie: -{basketSummary.totalSavingsRon.toFixed(2)} lei (-{basketSummary.totalSavingsPercent}%)
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleAddAllSessionItems}
              style={styles.liveBasketAddBtn}
            >
              <Text style={styles.liveBasketAddBtnText}>+ În listă</Text>
            </Pressable>
          </View>
        )}

        {/* Cardul de Raft Beavy (Foaie glisantă Reanimated peste cameră) */}
        {shelfCardResult && (
          <Animated.View
            style={[
              styles.shelfSheet,
              cardAnimStyle,
              { paddingBottom: Math.max(20, insets.bottom + 8) },
            ]}
          >
            {/* Mâner tragere foaie */}
            <View style={styles.sheetHandleBar} />

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.shelfSheetScroll}
            >
              {shelfCardResult.product ? (
                <>
                  {/* Antet Produs */}
                  <View style={styles.prodHeaderRow}>
                    {shelfCardResult.product.image_url ? (
                      <Image
                        source={{ uri: shelfCardResult.product.image_url }}
                        style={styles.prodThumb}
                        contentFit="contain"
                      />
                    ) : (
                      <View style={styles.prodThumbFallback}>
                        <SymbolView
                          name="bag.fill"
                          tintColor={C.muted}
                          size={24}
                          fallback={<Text style={styles.prodThumbGlyph}>📦</Text>}
                        />
                      </View>
                    )}

                    <View style={styles.prodMetaCol}>
                      <View style={styles.prodBadgeRow}>
                        {shelfCardResult.product.brand && (
                          <View style={styles.brandBadge}>
                            <Text style={styles.brandBadgeText}>
                              {shelfCardResult.product.brand}
                            </Text>
                          </View>
                        )}
                        <View style={styles.eanBadge}>
                          <Text style={styles.eanBadgeText}>
                            {shelfCardResult.format} {shelfCardResult.normalizedEan}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.prodTitle} numberOfLines={2}>
                        {shelfCardResult.product.canonical_name}
                      </Text>

                      {shelfCardResult.product.package_size && (
                        <Text style={styles.prodPackSize}>
                          Cantitate: {shelfCardResult.product.package_size}
                        </Text>
                      )}
                    </View>

                    <Pressable
                      onPress={handleDismissShelfCard}
                      hitSlop={10}
                      style={styles.sheetCloseBtn}
                    >
                      <SymbolView
                        name="xmark.circle.fill"
                        tintColor={C.muted}
                        size={22}
                        fallback={<Text style={styles.hudGlyph}>✕</Text>}
                      />
                    </Pressable>
                  </View>

                  {/* Bannerul Erou: Cel mai ieftin magazin */}
                  {shelfCardResult.cheapestStore ? (
                    <View style={styles.heroCheapestCard}>
                      <View style={styles.heroCheapestLeft}>
                        <RetailerLogo
                          retailerName={shelfCardResult.cheapestStore.retailerName}
                          slug={shelfCardResult.cheapestStore.retailerSlug}
                          size={40}
                        />
                        <View style={styles.heroCheapestMeta}>
                          <View style={styles.heroBadgeRow}>
                            <Text style={styles.heroBadgeTag}>
                              ★ CEL MAI BUN PREȚ
                            </Text>
                            {shelfCardResult.cheapestStore.hasLoyalty && (
                              <Text style={styles.heroLoyaltyTag}>
                                {shelfCardResult.cheapestStore.loyaltyLabel ?? 'Card'}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.heroStoreTitle}>
                            {shelfCardResult.cheapestStore.retailerName}
                          </Text>
                          {shelfCardResult.maxSavingsRon > 0 && (
                            <Text style={styles.heroSavingsSub}>
                              Economisești{' '}
                              <Text style={styles.heroSavingsHighlight}>
                                {shelfCardResult.maxSavingsRon.toFixed(2)} lei (-{shelfCardResult.maxSavingsPercent}%)
                              </Text>{' '}
                              vs {shelfCardResult.mostExpensiveStore?.retailerName}
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.heroPriceCol}>
                        <Text style={styles.heroPriceMain}>
                          {shelfCardResult.cheapestStore.price.toFixed(2)}
                        </Text>
                        <Text style={styles.heroPriceUnit}>lei</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.noOffersNotice}>
                      <Text style={styles.noOffersNoticeText}>
                        {shelfCardResult.message}
                      </Text>
                    </View>
                  )}

                  {/* Podium Complet de Magazine */}
                  {shelfCardResult.offers.length > 1 && (
                    <View style={styles.podiumBlock}>
                      <Text style={styles.podiumTitle}>
                        Comparație live în supermarketuri
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.podiumScroll}
                      >
                        {shelfCardResult.offers.map((off) => (
                          <View
                            key={off.retailerId + off.retailerName}
                            style={[
                              styles.podiumItem,
                              off.isCheapest && styles.podiumItemCheapest,
                            ]}
                          >
                            <RetailerLogo
                              retailerName={off.retailerName}
                              slug={off.retailerSlug}
                              size={28}
                            />
                            <Text style={styles.podiumStoreName} numberOfLines={1}>
                              {off.retailerName}
                            </Text>
                            <Text
                              style={[
                                styles.podiumStorePrice,
                                off.isCheapest && styles.podiumStorePriceCheapest,
                              ]}
                            >
                              {off.price.toFixed(2)} lei
                            </Text>
                            {off.priceDiffFromCheapest > 0 ? (
                              <Text style={styles.podiumDiffText}>
                                +{off.priceDiffFromCheapest.toFixed(2)} lei
                              </Text>
                            ) : (
                              <View style={styles.cheapestBadgePill}>
                                <Text style={styles.cheapestBadgePillText}>
                                  Ieftin
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Alternativa Inteligentă Marcă Proprie */}
                  {shelfCardResult.privateLabelAlternative && (
                    <Pressable
                      onPress={() => {
                        handleAddSingleToList(
                          shelfCardResult.privateLabelAlternative!.product
                        );
                      }}
                      style={styles.privateLabelBox}
                    >
                      <View style={styles.plLeftCol}>
                        <Text style={styles.plBulb}>💡</Text>
                        <View style={styles.plTextCol}>
                          <Text style={styles.plEyebrow}>
                            Alternativă Marcă Proprie mai ieftină
                          </Text>
                          <Text style={styles.plName} numberOfLines={1}>
                            {shelfCardResult.privateLabelAlternative.product.canonical_name}
                          </Text>
                          <Text style={styles.plSavingsDetail}>
                            {shelfCardResult.privateLabelAlternative.cheapestOffer.price.toFixed(2)}{' '}
                            lei la{' '}
                            {shelfCardResult.privateLabelAlternative.cheapestOffer.retailerName}{' '}
                            (
                            <Text style={styles.plSavingsHighlight}>
                              -{shelfCardResult.privateLabelAlternative.savingsPercent}% mai ieftin
                            </Text>
                            )
                          </Text>
                        </View>
                      </View>
                      <View style={styles.plAddPill}>
                        <Text style={styles.plAddPillText}>+ Adaugă marca</Text>
                      </View>
                    </Pressable>
                  )}

                  {/* Butoane de Acțiune */}
                  <View style={styles.shelfActionsRow}>
                    <Pressable
                      onPress={() =>
                        handleAddSingleToList(shelfCardResult.product!)
                      }
                      style={[
                        styles.addListBtn,
                        addedProductIds.has(shelfCardResult.product.id) &&
                          styles.addListBtnDone,
                      ]}
                    >
                      <SymbolView
                        name={
                          addedProductIds.has(shelfCardResult.product.id)
                            ? 'checkmark'
                            : 'cart.badge.plus'
                        }
                        tintColor={
                          addedProductIds.has(shelfCardResult.product.id)
                            ? C.primary
                            : C.surface
                        }
                        size={17}
                        fallback={<Text style={styles.hudGlyph}>+</Text>}
                      />
                      <Text
                        style={[
                          styles.addListBtnText,
                          addedProductIds.has(shelfCardResult.product.id) &&
                            styles.addListBtnTextDone,
                        ]}
                      >
                        {addedProductIds.has(shelfCardResult.product.id)
                          ? 'Adăugat în listă'
                          : '+ Adaugă în listă'}
                      </Text>
                    </Pressable>

                    {onInspectProduct && (
                      <Pressable
                        onPress={() => {
                          onInspectProduct(shelfCardResult.product!);
                          onClose();
                        }}
                        style={styles.detailsBtn}
                      >
                        <Text style={styles.detailsBtnText}>Detalii</Text>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={handleDismissShelfCard}
                      style={styles.scanNextBtn}
                    >
                      <SymbolView
                        name="barcode.viewfinder"
                        tintColor={C.primary}
                        size={16}
                        fallback={<Text style={styles.hudGlyph}>▦</Text>}
                      />
                      <Text style={styles.scanNextBtnText}>Scanează altul</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                /* Cod negăsit în catalog */
                <View style={styles.notFoundCard}>
                  <Text style={styles.notFoundTitle}>Cod EAN necunoscut</Text>
                  <Text style={styles.notFoundDesc}>
                    {shelfCardResult.message}
                  </Text>
                  <Pressable
                    onPress={handleDismissShelfCard}
                    style={styles.notFoundBtn}
                  >
                    <Text style={styles.notFoundBtnText}>Continuă scanarea</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        )}

        {/* Modal Coș Sesiune Culoar */}
        {isBasketModalOpen && (
          <Modal
            visible={isBasketModalOpen}
            animationType="slide"
            transparent
            onRequestClose={() => setIsBasketModalOpen(false)}
          >
            <View style={styles.basketBackdrop}>
              <View
                style={[
                  styles.basketModalCard,
                  { paddingBottom: Math.max(20, insets.bottom + 8) },
                ]}
              >
                <View style={styles.basketModalHeader}>
                  <Text style={styles.basketModalTitle}>
                    Cărucior Live la Raft ({sessionItems.length})
                  </Text>
                  <Pressable
                    onPress={() => setIsBasketModalOpen(false)}
                    hitSlop={10}
                    style={styles.basketModalClose}
                  >
                    <Text style={styles.hudGlyph}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.basketItemList}>
                  {sessionItems.map((item) => (
                    <View key={item.id} style={styles.basketItemRow}>
                      <View style={styles.basketItemMeta}>
                        <Text style={styles.basketItemTitle} numberOfLines={1}>
                          {item.scannedResult.product?.canonical_name ??
                            item.scannedResult.normalizedEan}
                        </Text>
                        <Text style={styles.basketItemSubtitle}>
                          {item.scannedResult.cheapestStore
                            ? `${item.scannedResult.cheapestStore.price.toFixed(2)} lei la ${item.scannedResult.cheapestStore.retailerName}`
                            : 'Fără preț live'}
                        </Text>
                      </View>
                      <View style={styles.basketItemQtyBox}>
                        <Pressable
                          onPress={() => {
                            triggerHaptic('selection');
                            setSessionItems((prev) =>
                              prev
                                .map((it) =>
                                  it.id === item.id
                                    ? { ...it, quantity: it.quantity - 1 }
                                    : it
                                )
                                .filter((it) => it.quantity > 0)
                            );
                          }}
                          style={styles.qtyBtn}
                        >
                          <Text style={styles.qtyBtnText}>-</Text>
                        </Pressable>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <Pressable
                          onPress={() => {
                            triggerHaptic('selection');
                            setSessionItems((prev) =>
                              prev.map((it) =>
                                it.id === item.id
                                  ? { ...it, quantity: it.quantity + 1 }
                                  : it
                              )
                            );
                          }}
                          style={styles.qtyBtn}
                        >
                          <Text style={styles.qtyBtnText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.basketModalFooter}>
                  {basketSummary.cheapestStoreName && (
                    <Text style={styles.basketModalSummary}>
                      Total cel mai avantajos:{' '}
                      <Text style={styles.basketModalBold}>
                        {basketSummary.cheapestTotal.toFixed(2)} lei ({basketSummary.cheapestStoreName})
                      </Text>
                    </Text>
                  )}
                  <Pressable
                    onPress={handleAddAllSessionItems}
                    style={styles.basketModalAddBtn}
                  >
                    <Text style={styles.basketModalAddBtnText}>
                      Adaugă toate produsele în lista Beavy
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
  );
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onBarcodeDetected,
  onAddProductToList,
  onInspectProduct,
  userCity,
}: BarcodeScannerModalProps) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <BarcodeScannerModalContent
        onClose={onClose}
        onBarcodeDetected={onBarcodeDetected}
        onAddProductToList={onAddProductToList}
        onInspectProduct={onInspectProduct}
        userCity={userCity}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topHud: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hudBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudBtnActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  hudGlyph: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modePillContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: BeavyRadius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modePillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BeavyRadius.pill,
  },
  modePillBtnActive: {
    backgroundColor: C.primary,
  },
  modePillText: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.75)',
  },
  modePillTextActive: {
    color: '#FFFFFF',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cameraShell: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraContainer: {
    ...StyleSheet.absoluteFill,
  },
  overlayCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  overlayCenterShifted: {
    justifyContent: 'flex-start',
    paddingTop: 120,
  },
  scanFrame: {
    width: 260,
    height: 140,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: C.leek,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 6,
  },
  scanLaser: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 10,
    height: 2,
    backgroundColor: C.strawberry,
    borderRadius: 1,
    shadowColor: C.strawberry,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  frameHintPill: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BeavyRadius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  frameHintText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
  },
  toastBanner: {
    position: 'absolute',
    top: 110,
    left: 20,
    right: 20,
    backgroundColor: C.leek,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BeavyRadius.lg,
    zIndex: 25,
    borderWidth: 1,
    borderColor: C.rule,
  },
  toastBannerText: {
    color: C.cherry,
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(247, 141, 121, 0.9)',
    padding: 12,
    borderRadius: BeavyRadius.md,
    alignItems: 'center',
    gap: 8,
  },
  errorBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: BeavyFonts.medium,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: BeavyRadius.pill,
  },
  retryBtnText: {
    color: C.cherry,
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
  },
  permissionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: C.background,
  },
  permIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  permGlyph: {
    fontSize: 28,
  },
  permTitle: {
    fontSize: 18,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  permText: {
    fontSize: 14,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  permBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
  },
  manualDrawer: {
    position: 'absolute',
    top: 104,
    left: 16,
    right: 16,
    zIndex: 22,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: C.surface,
    padding: 10,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  manualInput: {
    flex: 1,
    height: 44,
    backgroundColor: C.background,
    borderRadius: BeavyRadius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: BeavyFonts.regular,
    color: C.primary,
  },
  manualSearchBtn: {
    paddingHorizontal: 16,
    height: 44,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualBtnDisabled: {
    opacity: 0.5,
  },
  manualSearchText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
  },
  liveBasketBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: BeavyRadius['2xl'],
    borderTopRightRadius: BeavyRadius['2xl'],
    paddingHorizontal: 18,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 25,
    borderWidth: 1,
    borderColor: C.rule,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  liveBasketInfo: {
    flex: 1,
    gap: 3,
  },
  liveBasketBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BeavyRadius.sm,
  },
  liveBasketBadgeText: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    color: C.cherry,
  },
  liveBasketCheapest: {
    fontSize: 13,
    fontFamily: BeavyFonts.medium,
    color: C.primary,
  },
  liveBasketPrice: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.cherry,
  },
  liveBasketSavings: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    color: '#2E6930',
  },
  liveBasketAddBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: BeavyRadius.pill,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBasketAddBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
  },
  shelfSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '75%',
    backgroundColor: C.surface,
    borderTopLeftRadius: BeavyRadius['2xl'],
    borderTopRightRadius: BeavyRadius['2xl'],
    zIndex: 30,
    borderTopWidth: 1,
    borderColor: C.rule,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
  },
  sheetHandleBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.rule,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  shelfSheetScroll: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 14,
  },
  prodHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  prodThumb: {
    width: 56,
    height: 56,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.background,
  },
  prodThumbFallback: {
    width: 56,
    height: 56,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prodThumbGlyph: {
    fontSize: 22,
  },
  prodMetaCol: {
    flex: 1,
    gap: 3,
  },
  prodBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  brandBadge: {
    backgroundColor: C.grapefruit,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BeavyRadius.sm,
  },
  brandBadgeText: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    color: C.cherry,
  },
  eanBadge: {
    backgroundColor: C.background,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BeavyRadius.sm,
    borderWidth: 1,
    borderColor: C.rule,
  },
  eanBadgeText: {
    fontSize: 10,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
  },
  prodTitle: {
    fontSize: 15,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    lineHeight: 19,
  },
  prodPackSize: {
    fontSize: 12,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
  },
  sheetCloseBtn: {
    padding: 2,
  },
  heroCheapestCard: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.xl,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#C8D5B0',
  },
  heroCheapestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  heroCheapestMeta: {
    flex: 1,
    gap: 2,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroBadgeTag: {
    fontSize: 10,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#2A441B',
  },
  heroLoyaltyTag: {
    fontSize: 9,
    fontFamily: BeavyFonts.bold,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: BeavyRadius.sm,
    color: '#2A441B',
  },
  heroStoreTitle: {
    fontSize: 16,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.cherry,
  },
  heroSavingsSub: {
    fontSize: 11,
    fontFamily: BeavyFonts.medium,
    color: '#2A441B',
  },
  heroSavingsHighlight: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: '#1E3512',
  },
  heroPriceCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  heroPriceMain: {
    fontSize: 24,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.cherry,
    lineHeight: 26,
  },
  heroPriceUnit: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    color: C.cherry,
  },
  noOffersNotice: {
    backgroundColor: C.background,
    padding: 12,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
  },
  noOffersNoticeText: {
    fontSize: 13,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    textAlign: 'center',
  },
  podiumBlock: {
    gap: 8,
  },
  podiumTitle: {
    fontSize: 12,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: C.muted,
    textTransform: 'uppercase',
  },
  podiumScroll: {
    gap: 8,
    paddingRight: 12,
  },
  podiumItem: {
    backgroundColor: C.background,
    borderRadius: BeavyRadius.lg,
    padding: 10,
    alignItems: 'center',
    gap: 4,
    width: 96,
    borderWidth: 1,
    borderColor: C.rule,
  },
  podiumItemCheapest: {
    backgroundColor: '#F3F7EC',
    borderColor: C.leek,
  },
  podiumStoreName: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
    textAlign: 'center',
  },
  podiumStorePrice: {
    fontSize: 13,
    fontFamily: BeavyFonts.extraBold,
    color: C.cherry,
  },
  podiumStorePriceCheapest: {
    color: '#2A441B',
  },
  podiumDiffText: {
    fontSize: 10,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
  },
  cheapestBadgePill: {
    backgroundColor: C.leek,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BeavyRadius.sm,
  },
  cheapestBadgePillText: {
    fontSize: 9,
    fontFamily: BeavyFonts.bold,
    color: '#2A441B',
  },
  privateLabelBox: {
    backgroundColor: C.background,
    borderRadius: BeavyRadius.xl,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: C.rule,
    gap: 8,
  },
  plLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  plBulb: {
    fontSize: 20,
  },
  plTextCol: {
    flex: 1,
    gap: 2,
  },
  plEyebrow: {
    fontSize: 10,
    fontFamily: BeavyFonts.bold,
    color: C.strawberry,
    textTransform: 'uppercase',
  },
  plName: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  plSavingsDetail: {
    fontSize: 11,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
  },
  plSavingsHighlight: {
    fontFamily: BeavyFonts.bold,
    color: '#2E6930',
  },
  plAddPill: {
    backgroundColor: C.grapefruit,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BeavyRadius.pill,
  },
  plAddPillText: {
    fontSize: 11,
    fontFamily: BeavyFonts.bold,
    color: C.cherry,
  },
  shelfActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  addListBtn: {
    flex: 1,
    height: 44,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addListBtnDone: {
    backgroundColor: C.leek,
  },
  addListBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
  },
  addListBtnTextDone: {
    color: C.cherry,
  },
  detailsBtn: {
    height: 44,
    paddingHorizontal: 16,
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.rule,
  },
  detailsBtnText: {
    color: C.primary,
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
  },
  scanNextBtn: {
    height: 44,
    paddingHorizontal: 14,
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: C.rule,
  },
  scanNextBtnText: {
    color: C.primary,
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
  },
  notFoundCard: {
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  notFoundTitle: {
    fontSize: 16,
    fontFamily: BeavyFonts.extraBold,
    color: C.primary,
  },
  notFoundDesc: {
    fontSize: 13,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  notFoundBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
  },
  notFoundBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
  },
  basketBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  basketModalCard: {
    backgroundColor: C.surface,
    borderTopLeftRadius: BeavyRadius['2xl'],
    borderTopRightRadius: BeavyRadius['2xl'],
    maxHeight: '70%',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  basketModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  basketModalTitle: {
    fontSize: 17,
    fontFamily: BeavyFonts.extraBold,
    color: C.primary,
  },
  basketModalClose: {
    padding: 6,
  },
  basketItemList: {
    maxHeight: 260,
  },
  basketItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: C.rule,
  },
  basketItemMeta: {
    flex: 1,
    marginRight: 10,
  },
  basketItemTitle: {
    fontSize: 14,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  basketItemSubtitle: {
    fontSize: 12,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
  },
  basketItemQtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.rule,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 15,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  qtyText: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
    minWidth: 16,
    textAlign: 'center',
  },
  basketModalFooter: {
    gap: 10,
    paddingTop: 8,
  },
  basketModalSummary: {
    fontSize: 13,
    fontFamily: BeavyFonts.medium,
    color: C.muted,
    textAlign: 'center',
  },
  basketModalBold: {
    fontFamily: BeavyFonts.extraBold,
    color: C.cherry,
  },
  basketModalAddBtn: {
    backgroundColor: C.primary,
    paddingVertical: 14,
    borderRadius: BeavyRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  basketModalAddBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: BeavyFonts.bold,
  },
  pressed: {
    opacity: 0.8,
  },
});
