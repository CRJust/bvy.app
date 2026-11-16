import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import {
  recalculateBasketWithReassignments,
  runSmartShoppingOptimization,
  type ScenarioBasket,
  type SmartProductInput,
  type SmartShoppingConfig,
  type SmartShoppingResult,
} from '@/services/smart-shopping';
import { ProductAssignmentRow } from './product-assignment-row';
import { RetailerBasketCard } from './retailer-basket-card';
import { ScenarioSwitcher, type ScenarioType } from './scenario-switcher';
import { SmartShoppingLoading } from './smart-shopping-loading';

export interface SmartShoppingModalProps {
  visible: boolean;
  onClose: () => void;
  shoppingListId?: string;
  items: SmartProductInput[];
  config?: Partial<SmartShoppingConfig>;
  userId?: string | null;
  checkedItemIds?: string[];
  onToggleItemChecked?: (itemId: string) => void;
  onStartShopping: (retailerName: string, itemIds: string[]) => void;
}

function formatFreshnessDateRo(isoDate: string | null | undefined): string {
  if (!isoDate) return 'Verificat recent';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return 'Verificat recent';
  const datePart = parsed.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: 'short',
  });
  const timePart = parsed.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart}, ${timePart}`;
}

export function SmartShoppingModal({
  visible,
  onClose,
  shoppingListId,
  items,
  config,
  userId,
  checkedItemIds = [],
  onToggleItemChecked,
  onStartShopping,
}: SmartShoppingModalProps) {
  const [result, setResult] = useState<SmartShoppingResult | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType>('smart_basket');
  const [reassignmentsByScenario, setReassignmentsByScenario] = useState<
    Record<ScenarioType, Record<string, string>>
  >({
    smart_basket: {},
    cheapest_basket: {},
    single_store: {},
    online_basket: {},
  });

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [progressState, setProgressState] = useState<{
    stageIndex: number;
    stageMessage: string;
    identifiedCount?: number;
    retailersCount?: number;
    offersCount?: number;
    combinationsCount?: number;
  }>({
    stageIndex: 0,
    stageMessage: 'Analizăm lista ta…',
  });

  const activeRequestRef = useRef(false);

  const executeOptimization = useCallback(async () => {
    if (activeRequestRef.current) return;
    if (items.length === 0) {
      setError('Lista ta de cumpărături este goală.');
      return;
    }

    activeRequestRef.current = true;
    setAnimationComplete(false);
    setIsOptimizing(true);
    setError(null);
    setProgressState({
      stageIndex: 0,
      stageMessage: 'Analizăm lista ta…',
      identifiedCount: items.length,
    });

    try {
      const res = await runSmartShoppingOptimization({
        shoppingListId,
        items,
        config,
        userId,
        onProgress: (stage) => {
          setProgressState((prev) => ({
            stageIndex: stage.stageIndex,
            stageMessage: stage.stageMessage,
            identifiedCount: stage.identifiedCount ?? prev.identifiedCount,
            retailersCount: stage.retailersCount ?? prev.retailersCount,
            offersCount: stage.offersCount ?? prev.offersCount,
            combinationsCount: stage.combinationsCount ?? prev.combinationsCount,
          }));
        },
      });

      setResult(res);
      setSelectedScenario(res.recommendedScenario.scenarioId);
      setReassignmentsByScenario({
        smart_basket: {},
        cheapest_basket: {},
        single_store: {},
        online_basket: {},
      });
    } catch {
      setError('Nu am reușit să optimizăm coșul.');
    } finally {
      activeRequestRef.current = false;
      setIsOptimizing(false);
    }
  }, [shoppingListId, items, config, userId]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      void executeOptimization();
    }, 0);
    return () => clearTimeout(timer);
  }, [visible, executeOptimization]);

  const baseScenarioBasket: ScenarioBasket | null = useMemo(() => {
    if (!result) return null;
    if (selectedScenario === 'cheapest_basket') return result.scenarios.cheapestBasket;
    if (selectedScenario === 'single_store' && result.scenarios.singleStoreBasket) {
      return result.scenarios.singleStoreBasket;
    }
    if (selectedScenario === 'online_basket' && result.scenarios.onlineBasket) {
      return result.scenarios.onlineBasket;
    }
    return result.scenarios.smartBasket;
  }, [result, selectedScenario]);

  const activeReassignments = useMemo(
    () => reassignmentsByScenario[selectedScenario] || {},
    [reassignmentsByScenario, selectedScenario]
  );

  const hasManualReassignments = Object.keys(activeReassignments).length > 0;

  const activeBasket: ScenarioBasket | null = useMemo(() => {
    if (!baseScenarioBasket || !result) return null;
    if (!hasManualReassignments) return baseScenarioBasket;

    const benchmarkCost = result.scenarios.singleStoreBasket
      ? result.scenarios.singleStoreBasket.totalToPay
      : baseScenarioBasket.totalToPay + baseScenarioBasket.totalSavings;

    return recalculateBasketWithReassignments({
      basket: baseScenarioBasket,
      reassignments: activeReassignments,
      retailers: result.retailers || [],
      fulfillmentRules: result.fulfillmentRules || {},
      benchmarkCost,
      config: result.config,
    });
  }, [baseScenarioBasket, result, hasManualReassignments, activeReassignments]);

  const handleReassignRetailer = useCallback(
    (itemId: string, retailerSlug: string) => {
      setReassignmentsByScenario((prev) => ({
        ...prev,
        [selectedScenario]: {
          ...(prev[selectedScenario] || {}),
          [itemId]: retailerSlug,
        },
      }));
    },
    [selectedScenario]
  );

  const handleResetReassignments = useCallback(() => {
    triggerHaptic('light');
    setReassignmentsByScenario((prev) => ({
      ...prev,
      [selectedScenario]: {},
    }));
  }, [selectedScenario]);

  const showLoadingView = isOptimizing || (!animationComplete && !error && !result);

  return (
    <BeavySheetModal visible={visible} onClose={onClose} maxHeightRatio="92%">
      {/* Sheet Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Image
            source={require('@/assets/images/beavy-logo.png')}
            style={styles.headerLogo}
            contentFit="contain"
          />
          <View>
            <Text style={styles.headerTitle}>Coșul tău optimizat</Text>
            <Text style={styles.headerSubtitle}>
              Smart Shopping · Optimizare echilibrată
            </Text>
          </View>
        </View>

        <Pressable
          hitSlop={10}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
          onPress={() => {
            triggerHaptic('light');
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Închide fereastra"
        >
          <SymbolView
            name="xmark"
            size={15}
            tintColor={C.primary}
            fallback={<Text style={styles.closeFallback}>✕</Text>}
          />
        </Pressable>
      </View>

      {/* Content Area */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {showLoadingView ? (
          <SmartShoppingLoading
            stageIndex={progressState.stageIndex}
            currentStageMessage={progressState.stageMessage}
            identifiedCount={progressState.identifiedCount}
            retailersCount={progressState.retailersCount}
            offersCount={progressState.offersCount}
            combinationsCount={progressState.combinationsCount}
            isFinished={!isOptimizing && Boolean(result)}
            onAnimationFinish={() => setAnimationComplete(true)}
          />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Nu am reușit să optimizăm coșul.</Text>
            <Text style={styles.errorSub}>
              Încearcă din nou. Lista ta este în continuare salvată.
            </Text>
            <Pressable
              hitSlop={8}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
              onPress={() => {
                triggerHaptic('medium');
                void executeOptimization();
              }}
            >
              <Text style={styles.retryBtnText}>Încearcă din nou</Text>
            </Pressable>
          </View>
        ) : activeBasket && result ? (
          <View>
            {/* Scenario Switcher */}
            <ScenarioSwitcher
              selectedScenario={selectedScenario}
              availableScenarios={result.scenarios}
              onSelectScenario={setSelectedScenario}
            />

            {/* KPI Summary Card */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View>
                  <Text style={styles.heroEyebrow}>{activeBasket.title.toUpperCase()}</Text>
                  <Text style={styles.heroPrice}>
                    {activeBasket.totalToPay.toFixed(2)}{' '}
                    <Text style={styles.heroCurrency}>RON</Text>
                  </Text>
                </View>

                {activeBasket.totalSavings > 0.05 ? (
                  <View style={styles.savingsBadge}>
                    <Text style={styles.savingsBadgeLabel}>Economie estimată</Text>
                    <Text style={styles.savingsBadgeValue}>
                      -{activeBasket.totalSavings.toFixed(2)} RON
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.explanationText}>{activeBasket.explanation}</Text>

              <View style={styles.kpiStrip}>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiValue}>{activeBasket.storeCount}</Text>
                  <Text style={styles.kpiLabel}>
                    {activeBasket.storeCount === 1 ? 'magazin' : 'magazine'}
                  </Text>
                </View>
                <View style={styles.kpiDivider} />
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiValue}>
                    {activeBasket.productAssignments.length}/{items.length}
                  </Text>
                  <Text style={styles.kpiLabel}>produse acoperite</Text>
                </View>
                <View style={styles.kpiDivider} />
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiValue}>
                    {formatFreshnessDateRo(activeBasket.freshnessTimestamp)}
                  </Text>
                  <Text style={styles.kpiLabel}>prospețime prețuri</Text>
                </View>
              </View>
            </View>

            {/* Retailer Breakdown Cards */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Magazine recomandate</Text>
              <Text style={styles.sectionMeta}>
                {activeBasket.storeCount}{' '}
                {activeBasket.storeCount === 1 ? 'oprire' : 'opriri'}
              </Text>
            </View>

            {activeBasket.storeAssignments.map((storeAssign) => (
              <RetailerBasketCard
                key={storeAssign.retailer.slug}
                storeAssignment={storeAssign}
                onStartShopping={(retName, itemIds) => {
                  onClose();
                  onStartShopping(retName, itemIds);
                }}
              />
            ))}

            {/* Product Assignments & Manual Store Reassignment */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                Alocarea produselor ({activeBasket.productAssignments.length})
              </Text>
              {hasManualReassignments ? (
                <Pressable
                  hitSlop={8}
                  style={styles.resetManualBtn}
                  onPress={handleResetReassignments}
                >
                  <Text style={styles.resetManualText}>Resetează modificările</Text>
                </Pressable>
              ) : null}
            </View>

            {activeBasket.productAssignments.map((assignment) => (
              <ProductAssignmentRow
                key={assignment.itemId}
                assignment={assignment}
                isChecked={checkedItemIds.includes(assignment.itemId)}
                onToggleChecked={onToggleItemChecked}
                onReassignRetailer={handleReassignRetailer}
              />
            ))}

            {/* Unavailable Products Disclosure */}
            {activeBasket.unavailableItems.length > 0 ? (
              <View style={styles.unavailableSection}>
                <Text style={styles.unavailableTitle}>
                  Produse indisponibile ({activeBasket.unavailableItems.length})
                </Text>
                <Text style={styles.unavailableSub}>
                  Aceste articole nu au oferte active verificate în magazinele selectate și au fost excluse din calculul prețului:
                </Text>
                {activeBasket.unavailableItems.map((u) => (
                  <View key={u.itemId} style={styles.unavailableRow}>
                    <Text style={styles.unavailableItemName}>{u.name}</Text>
                    <Text style={styles.unavailableReason}>Fără ofertă activă</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky Action Footer */}
      {!showLoadingView && activeBasket ? (
        <View style={styles.footer}>
          <Pressable
            hitSlop={6}
            style={({ pressed }) => [
              styles.recalcBtn,
              pressed && styles.recalcBtnPressed,
            ]}
            onPress={() => {
              triggerHaptic('light');
              void executeOptimization();
            }}
          >
            <SymbolView
              name="arrow.clockwise"
              size={15}
              tintColor={C.primary}
              fallback={<Text style={styles.recalcFallback}>↻</Text>}
            />
            <Text style={styles.recalcBtnText}>Recalculează</Text>
          </Pressable>

          {activeBasket.storeAssignments.length > 0 ? (
            <Pressable
              hitSlop={6}
              style={({ pressed }) => [
                styles.startShoppingBtn,
                pressed && styles.startShoppingBtnPressed,
              ]}
              onPress={() => {
                triggerHaptic('medium');
                const primaryStop = activeBasket.storeAssignments[0];
                onClose();
                onStartShopping(
                  primaryStop.retailer.name,
                  primaryStop.assignedItems.map((a) => a.itemId)
                );
              }}
            >
              <Text style={styles.startShoppingBtnText}>
                Începe cumpărăturile ({activeBasket.storeAssignments[0].retailer.name})
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerLogo: {
    width: 34,
    height: 34,
  },
  headerTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 18,
    color: C.primary,
  },
  headerSubtitle: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12,
    color: C.muted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: {
    opacity: 0.75,
  },
  closeFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  errorBox: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.rule,
    marginVertical: 20,
  },
  errorTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 17,
    color: C.primary,
    textAlign: 'center',
    marginBottom: 6,
  },
  errorSub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    marginBottom: 18,
  },
  retryBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: BeavyRadius.pill,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryBtnPressed: {
    opacity: 0.85,
  },
  retryBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.surface,
  },
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.xl,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: C.rule,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  heroEyebrow: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  heroPrice: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 28,
    color: C.primary,
  },
  heroCurrency: {
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.muted,
  },
  savingsBadge: {
    backgroundColor: C.leek,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BeavyRadius.md,
    alignItems: 'flex-end',
  },
  savingsBadgeLabel: {
    fontFamily: BeavyFonts.medium,
    fontSize: 10,
    color: C.leekDark,
  },
  savingsBadgeValue: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 15,
    color: C.leekDark,
  },
  explanationText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 13,
    color: C.primary,
    lineHeight: 19,
    marginBottom: 14,
  },
  kpiStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: BeavyRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
  },
  kpiValue: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  kpiLabel: {
    fontFamily: BeavyFonts.regular,
    fontSize: 10,
    color: C.muted,
    marginTop: 1,
  },
  kpiDivider: {
    width: 1,
    height: 24,
    backgroundColor: C.rule,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.primary,
  },
  sectionMeta: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.muted,
  },
  resetManualBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.grapefruit,
  },
  resetManualText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.primary,
  },
  unavailableSection: {
    backgroundColor: C.grapefruit,
    borderRadius: BeavyRadius.lg,
    padding: 14,
    marginTop: 12,
  },
  unavailableTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
    marginBottom: 4,
  },
  unavailableSub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12,
    color: C.muted,
    lineHeight: 17,
    marginBottom: 10,
  },
  unavailableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
  },
  unavailableItemName: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 13,
    color: C.primary,
  },
  unavailableReason: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
    backgroundColor: C.background,
  },
  recalcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
  },
  recalcBtnPressed: {
    opacity: 0.78,
  },
  recalcFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  recalcBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.primary,
  },
  startShoppingBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  startShoppingBtnPressed: {
    opacity: 0.88,
  },
  startShoppingBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.surface,
  },
});
