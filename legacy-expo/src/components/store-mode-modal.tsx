import { SymbolView } from 'expo-symbols';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ChecklistItemRow } from '@/components/checklist-item-row';
import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type { ShoppingItem, ShoppingList } from '@/context/shopping-context';
import {
  openExternalStoreUrl,
  type TrackedOutboundClickPayload,
} from '@/lib/open-external-store';
import { groupShoppingItemsByAisle } from '@/services/beavy-aisle-classifier';

export type StoreChannelMode = 'physical' | 'online' | 'hybrid';

type ConfirmMode = 'finish' | 'clear_checked' | null;

type StoreModeModalProps = {
  visible: boolean;
  list: ShoppingList | null;
  storeName?: string;
  storeSlug?: string | null;
  storeChannelMode?: StoreChannelMode;
  storeWebsiteUrl?: string | null;
  estimatedBasketTotal?: number | null;
  storeUnitPricesByItemId?: Record<string, number>;
  storeLoyaltyLabelsByItemId?: Record<string, string>;
  storePackagingNotesByItemId?: Record<string, string>;
  resolvedImageUrlsByItemId?: Record<string, string | null>;
  checkedItemIds?: string[];
  onClose: () => void;
  onToggleItem: (itemId: string) => void;
  onToggleSessionItem?: (itemId: string) => void;
  onClearSessionChecked?: () => void;
  onRestoreSessionChecked?: (itemIds: string[]) => void;
  onCommitCheckedItems?: (itemIds: string[]) => void;
  onQuantityChange: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
  onLongPressItem: (item: ShoppingItem) => void;
  onShareList: (checkedIdsInStore: string[]) => void;
  onGoToPantry?: () => void;
  onGoToCompare?: () => void;
  onTrackOutboundClick?: (payload: TrackedOutboundClickPayload) => void;
};

/**
 * Foaie Mod Magazin / Checklist Comandă Online reorganizată pe raioane cu total live.
 */
export function StoreModeModal({
  visible,
  list,
  storeName,
  storeSlug,
  storeChannelMode = 'physical',
  storeWebsiteUrl,
  estimatedBasketTotal,
  storeUnitPricesByItemId,
  storeLoyaltyLabelsByItemId,
  storePackagingNotesByItemId,
  resolvedImageUrlsByItemId,
  checkedItemIds,
  onClose,
  onToggleItem,
  onToggleSessionItem,
  onClearSessionChecked,
  onRestoreSessionChecked,
  onCommitCheckedItems,
  onQuantityChange,
  onRemoveItem,
  onLongPressItem,
  onShareList,
  onGoToPantry,
  onGoToCompare,
  onTrackOutboundClick,
}: StoreModeModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const [prevList, setPrevList] = useState<ShoppingList | null>(list);
  if (list && list !== prevList) {
    setPrevList(list);
  }
  const activeList = visible ? list : (prevList ?? list);

  const [checkedExpanded, setCheckedExpanded] = useState(true);
  const [uncontrolledCheckedIds, setUncontrolledCheckedIds] = useState<string[]>([]);
  const [selectedAisleId, setSelectedAisleId] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [clearedUndoIds, setClearedUndoIds] = useState<string[] | null>(null);
  const reducedMotion = useReducedMotion();
  const undoClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressWidth = useSharedValue(0);

  const isControlled =
    checkedItemIds !== undefined && Boolean(onToggleSessionItem);
  const activeCheckedIds = useMemo(
    () => (isControlled ? checkedItemIds ?? [] : uncontrolledCheckedIds),
    [isControlled, checkedItemIds, uncontrolledCheckedIds]
  );

  const isOnlineOnly = storeChannelMode === 'online';
  const items = useMemo(() => activeList?.items ?? [], [activeList?.items]);

  const sessionItems = useMemo(
    () => items.filter((it) => !it.checked),
    [items]
  );
  const alreadyPurchasedCount = useMemo(
    () => items.filter((it) => it.checked).length,
    [items]
  );

  const sessionCheckedSet = useMemo(() => {
    const activeIds = new Set(sessionItems.map((it) => it.id));
    return new Set(activeCheckedIds.filter((id) => activeIds.has(id)));
  }, [sessionItems, activeCheckedIds]);

  const sessionUncheckedItems = useMemo(
    () => sessionItems.filter((it) => !sessionCheckedSet.has(it.id)),
    [sessionItems, sessionCheckedSet]
  );

  const sessionCheckedItems = useMemo(
    () => sessionItems.filter((it) => sessionCheckedSet.has(it.id)),
    [sessionItems, sessionCheckedSet]
  );

  const totalUnits = useMemo(
    () => sessionItems.reduce((acc, it) => acc + Math.max(1, it.quantity), 0),
    [sessionItems]
  );

  const checkedUnits = useMemo(
    () =>
      sessionCheckedItems.reduce((acc, it) => acc + Math.max(1, it.quantity), 0),
    [sessionCheckedItems]
  );

  const aisleGroups = useMemo(
    () => groupShoppingItemsByAisle(sessionUncheckedItems),
    [sessionUncheckedItems]
  );

  const displayedAisleGroups = useMemo(() => {
    if (!selectedAisleId) return aisleGroups;
    const filtered = aisleGroups.filter((g) => g.id === selectedAisleId);
    return filtered.length > 0 ? filtered : aisleGroups;
  }, [aisleGroups, selectedAisleId]);

  const progressPercent = useMemo(() => {
    if (sessionItems.length === 0) return 0;
    return Math.round((sessionCheckedItems.length / sessionItems.length) * 100);
  }, [sessionItems.length, sessionCheckedItems.length]);

  const cartPricingSummary = useMemo(() => {
    if (!storeUnitPricesByItemId || sessionItems.length === 0) return null;
    let pricedCount = 0;
    let checkedTotal = 0;
    let fullEstimatedTotal = 0;

    for (const item of sessionItems) {
      const unitPrice = storeUnitPricesByItemId[item.id];
      if (typeof unitPrice === 'number' && unitPrice >= 0) {
        const line = unitPrice * item.quantity;
        pricedCount++;
        fullEstimatedTotal += line;
        if (sessionCheckedSet.has(item.id)) {
          checkedTotal += line;
        }
      }
    }

    if (pricedCount === 0) return null;
    return {
      pricedCount,
      checkedTotal: Math.round(checkedTotal * 100) / 100,
      fullEstimatedTotal: Math.round(fullEstimatedTotal * 100) / 100,
    };
  }, [sessionItems, sessionCheckedSet, storeUnitPricesByItemId]);

  useEffect(() => {
    return () => {
      if (undoClearTimerRef.current) {
        clearTimeout(undoClearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      progressWidth.set(progressPercent);
      return;
    }
    progressWidth.set(
      withTiming(progressPercent, {
        duration: 210,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [progressPercent, progressWidth, reducedMotion]);

  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.get()}%`,
  }));

  const handleClose = () => {
    setConfirmMode(null);
    setClearedUndoIds(null);
    onClose();
  };

  const clearUndoToast = () => {
    if (undoClearTimerRef.current) {
      clearTimeout(undoClearTimerRef.current);
      undoClearTimerRef.current = null;
    }
    setClearedUndoIds(null);
  };

  const handleToggleSessionItem = (itemId: string) => {
    triggerHaptic('selection');
    setConfirmMode(null);
    clearUndoToast();
    if (isControlled && onToggleSessionItem) {
      onToggleSessionItem(itemId);
    } else {
      setUncontrolledCheckedIds((prev) =>
        prev.includes(itemId)
          ? prev.filter((id) => id !== itemId)
          : [...prev, itemId]
      );
    }
  };

  const handleConfirmClearChecked = () => {
    const previousIds = sessionCheckedItems.map((it) => it.id);
    setConfirmMode(null);
    if (previousIds.length === 0) return;

    triggerHaptic('medium');
    if (isControlled && onClearSessionChecked) {
      onClearSessionChecked();
    } else {
      setUncontrolledCheckedIds([]);
    }

    if (undoClearTimerRef.current) {
      clearTimeout(undoClearTimerRef.current);
    }
    setClearedUndoIds(previousIds);
    undoClearTimerRef.current = setTimeout(() => {
      setClearedUndoIds(null);
      undoClearTimerRef.current = null;
    }, 7000);
  };

  const handleUndoClearChecked = () => {
    if (!clearedUndoIds || clearedUndoIds.length === 0) return;
    triggerHaptic('selection');
    const idsToRestore = clearedUndoIds;
    clearUndoToast();
    if (isControlled && onRestoreSessionChecked) {
      onRestoreSessionChecked(idsToRestore);
    } else {
      setUncontrolledCheckedIds(idsToRestore);
    }
  };

  const handleRequestFinish = () => {
    triggerHaptic('medium');
    if (sessionItems.length === 0) {
      handleClose();
      return;
    }
    setConfirmMode('finish');
  };

  const handleConfirmFinish = () => {
    const idsToCommit = sessionCheckedItems.map((it) => it.id);
    setConfirmMode(null);
    clearUndoToast();
    if (idsToCommit.length > 0) {
      triggerHaptic('success');
      if (onCommitCheckedItems) {
        onCommitCheckedItems(idsToCommit);
      } else {
        idsToCommit.forEach((id) => onToggleItem(id));
        if (!isControlled) {
          setUncontrolledCheckedIds([]);
        }
      }
    }
    handleClose();
  };

  const confirmCopy = useMemo(() => {
    const checkedCount = sessionCheckedItems.length;
    const uncheckedCount = sessionUncheckedItems.length;

    if (confirmMode === 'clear_checked') {
      return {
        title: 'Cureți produsele bifate?',
        body:
          checkedCount === 1
            ? 'Produsul bifat revine ca nebifat, fără a fi șters din listă.'
            : `Cele ${checkedCount} produse bifate revin ca nebifate, fără a fi șterse din listă.`,
        cancelLabel: 'Înapoi',
        confirmLabel: 'Curăță bifatele',
        isZeroChecked: false,
      };
    }

    if (checkedCount === 0) {
      return {
        title: 'Nu ai bifat niciun produs',
        body: 'Toate produsele rămân de cumpărat în listă.',
        cancelLabel: 'Înapoi la checklist',
        confirmLabel: 'Închide',
        isZeroChecked: true,
      };
    }

    if (uncheckedCount > 0) {
      return {
        title: isOnlineOnly
          ? 'Finalizezi comanda verificată?'
          : 'Finalizezi cumpărăturile?',
        body: `${checkedCount} produse bifate (${checkedUnits} buc.) se marchează ca achiziționate; ${uncheckedCount} rămân în listă.`,
        cancelLabel: 'Înapoi',
        confirmLabel: `Confirmă (${checkedCount})`,
        isZeroChecked: false,
      };
    }

    return {
      title: isOnlineOnly
        ? 'Confirmi comanda completă?'
        : 'Confirmi cumpărăturile?',
      body: `Toate cele ${checkedCount} produse (${checkedUnits} bucăți) vor fi marcate ca achiziționate și salvate în istoric.`,
      cancelLabel: 'Înapoi',
      confirmLabel: `Confirmă (${checkedCount})`,
      isZeroChecked: false,
    };
  }, [
    confirmMode,
    sessionCheckedItems.length,
    sessionUncheckedItems.length,
    checkedUnits,
    isOnlineOnly,
  ]);

  if (!activeList) return null;

  const badgeText = isOnlineOnly
    ? storeName
      ? `COMANDĂ ONLINE · ${storeName.toUpperCase()}`
      : 'CHECKLIST COMANDĂ ONLINE'
    : storeName
      ? `MOD MAGAZIN · ${storeName.toUpperCase()}`
      : 'MOD MAGAZIN · PE RAIOANE';

  const scrollMaxHeight = Math.max(220, Math.round(windowHeight * 0.44));

  return (
    <BeavySheetModal
      visible={visible}
      onClose={handleClose}
      maxHeightRatio="92%"
      initialOffset={Math.max(680, windowHeight)}
    >
      <View style={styles.sheetInner}>
        {/* Antet */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.modeBadge, isOnlineOnly && styles.modeBadgeOnline]}>
              <Text numberOfLines={1} style={styles.modeBadgeText}>
                {badgeText}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.listTitle}>
              {activeList.name}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {sessionItems.length > 0 && (
              <Pressable
                onPress={() => onShareList(Array.from(sessionCheckedSet))}
                hitSlop={6}
                style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Trimite lista"
              >
                <SymbolView
                  name="square.and.arrow.up"
                  tintColor={C.primary}
                  size={14}
                  fallback={<Text style={styles.fallbackGlyph}>↗</Text>}
                />
                <Text style={styles.shareBtnText}>Trimite</Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleClose}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Închide"
            >
              <SymbolView
                name="xmark"
                tintColor={C.primary}
                size={14}
                fallback={<Text style={styles.fallbackGlyph}>✕</Text>}
              />
            </Pressable>
          </View>
        </View>

        {isOnlineOnly && (
          <View style={styles.onlineStrip}>
            <Text numberOfLines={2} style={styles.onlineText}>
              {`Checklist verificare · Finalizezi comanda pe ${storeName || 'site-ul magazinului'}`}
            </Text>
            {!!storeWebsiteUrl && (
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  void openExternalStoreUrl(
                    storeWebsiteUrl,
                    {
                      retailerName: storeName || 'Magazin partener',
                      retailerSlug: storeSlug ?? null,
                      source: 'store_mode',
                      channelMode: isOnlineOnly ? 'online' : 'physical',
                      listName: activeList?.name,
                      itemsCount: sessionItems.length,
                      estimatedValueRon: estimatedBasketTotal ?? null,
                    },
                    onTrackOutboundClick
                  );
                }}
                style={({ pressed }) => [styles.onlineBtn, pressed && styles.pressed]}
              >
                <Text style={styles.onlineBtnText}>Site ↗</Text>
              </Pressable>
            )}
          </View>
        )}

        {sessionItems.length > 0 && (
          <BeavySurface variant="elevated" style={styles.progressCard}>
            <View style={styles.progressTopRow}>
              <Text style={styles.progressLabel}>
                {`${sessionCheckedItems.length} din ${sessionItems.length} ${
                  sessionItems.length === 1 ? 'produs bifat' : 'produse bifate'
                }`}
              </Text>
              <View
                style={[
                  styles.percentPill,
                  progressPercent === 100 && styles.percentPillComplete,
                ]}
              >
                <Text
                  style={[
                    styles.percentPillText,
                    progressPercent === 100 && styles.percentPillTextComplete,
                  ]}
                >
                  {`${progressPercent}%`}
                </Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  progressPercent === 100 && styles.progressFillComplete,
                  progressFillStyle,
                ]}
              />
            </View>

            <View style={styles.progressMetaRow}>
              <Text style={styles.metaSub}>
                {`${checkedUnits}/${totalUnits} bucăți · ${
                  aisleGroups.length > 0
                    ? `${aisleGroups.length} raioane`
                    : 'Totul bifat'
                }`}
              </Text>
              {cartPricingSummary && (
                <Text style={styles.livePriceText}>
                  {`${cartPricingSummary.checkedTotal.toFixed(2)} / ${cartPricingSummary.fullEstimatedTotal.toFixed(2)} RON`}
                </Text>
              )}
            </View>
          </BeavySurface>
        )}

        {sessionUncheckedItems.length > 0 && aisleGroups.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.aisleFilterContent}
            style={styles.aisleFilterContainer}
          >
            <Pressable
              style={[
                styles.aisleFilterChip,
                selectedAisleId === null && styles.aisleFilterChipActive,
              ]}
              onPress={() => {
                triggerHaptic();
                setSelectedAisleId(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Traseu complet"
            >
              <Text
                style={[
                  styles.aisleFilterChipText,
                  selectedAisleId === null && styles.aisleFilterChipTextActive,
                ]}
              >
                {`Traseu complet (${sessionUncheckedItems.length})`}
              </Text>
            </Pressable>

            {aisleGroups.map((group) => {
              const isSelected = selectedAisleId === group.id;
              return (
                <Pressable
                  key={group.id}
                  style={[
                    styles.aisleFilterChip,
                    isSelected && styles.aisleFilterChipActive,
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setSelectedAisleId(isSelected ? null : group.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Raionul ${group.name}, ${group.items.length} produse`}
                >
                  <Text
                    style={[
                      styles.aisleFilterChipText,
                      isSelected && styles.aisleFilterChipTextActive,
                    ]}
                  >
                    {`${group.step}. ${group.name} (${group.items.length})`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <ScrollView
          style={{ maxHeight: scrollMaxHeight }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {clearedUndoIds && clearedUndoIds.length > 0 && (
            <View style={styles.undoBanner}>
              <Text style={styles.undoText}>
                {`${clearedUndoIds.length} ${
                  clearedUndoIds.length === 1 ? 'bifare curățată' : 'bifări curățate'
                }`}
              </Text>
              <Pressable onPress={handleUndoClearChecked} hitSlop={8}>
                <Text style={styles.undoBtnText}>Anulează</Text>
              </Pressable>
            </View>
          )}

          {sessionItems.length === 0 ? (
            <BeavySurface variant="elevated" style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {alreadyPurchasedCount > 0
                  ? 'Niciun produs rămas de cumpărat'
                  : `Lista „${activeList.name}” este goală`}
              </Text>
              <Text style={styles.emptySub}>
                Adaugă produse mai sus sau întoarce-te în Caută pentru prețuri live.
              </Text>
            </BeavySurface>
          ) : (
            <>
              {sessionUncheckedItems.length === 0 ? (
                <BeavySurface variant="tonal" style={styles.allDoneCard}>
                  <Text style={styles.allDoneTitle}>
                    {isOnlineOnly
                      ? 'Toate produsele sunt verificate!'
                      : 'Ai găsit toate produsele!'}
                  </Text>
                  <Text style={styles.allDoneSub}>
                    Apasă butonul de confirmare de mai jos pentru a înregistra sesiunea și economiile.
                  </Text>
                </BeavySurface>
              ) : (
                displayedAisleGroups.map((group) => (
                  <View key={group.id} style={styles.aisleGroup}>
                    <View style={styles.aisleHeader}>
                      <View style={styles.aisleHeaderLeft}>
                        <View style={styles.aisleStepCircle}>
                          <Text style={styles.aisleStepText}>{group.step}</Text>
                        </View>
                        <SymbolView
                          name={group.iconSymbol as never}
                          size={15}
                          tintColor={C.cherry}
                          fallback={
                            <Text style={styles.aisleFallbackIcon}>
                              {group.fallbackIcon}
                            </Text>
                          }
                        />
                        <Text style={styles.aisleTitle}>{group.name}</Text>
                      </View>
                      <View style={styles.aisleCountBadge}>
                        <Text style={styles.aisleCountText}>
                          {`${group.items.length} ${
                            group.items.length === 1 ? 'produs' : 'produse'
                          }`}
                        </Text>
                      </View>
                    </View>

                    <BeavySurface variant="elevated" style={styles.itemsCard}>
                      {group.items.map((item, idx) => (
                        <ChecklistItemRow
                          key={item.id}
                          variant="flat"
                          isLast={idx === group.items.length - 1}
                          item={item}
                          resolvedImageUrl={resolvedImageUrlsByItemId?.[item.id]}
                          checkedBadgeLabel="Bifat"
                          storeUnitPrice={storeUnitPricesByItemId?.[item.id]}
                          storeLoyaltyLabel={storeLoyaltyLabelsByItemId?.[item.id]}
                          storePackagingNote={storePackagingNotesByItemId?.[item.id]}
                          onToggle={handleToggleSessionItem}
                          onQuantityChange={onQuantityChange}
                          onRemove={onRemoveItem}
                          onLongPressItem={onLongPressItem}
                        />
                      ))}
                    </BeavySurface>
                  </View>
                ))
              )}

              {sessionCheckedItems.length > 0 && (
                <BeavySurface variant="elevated" style={styles.checkedCard}>
                  <View style={styles.checkedHeader}>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        setCheckedExpanded((v) => !v);
                      }}
                      style={styles.checkedToggle}
                    >
                      <Text style={styles.checkedTitle}>
                        {`${checkedExpanded ? '▾' : '▸'} Bifate (${sessionCheckedItems.length})`}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('medium');
                        setConfirmMode('clear_checked');
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.clearCheckedText}>Curăță bifatele</Text>
                    </Pressable>
                  </View>

                  {checkedExpanded && (
                    <View>
                      {sessionCheckedItems.map((item, idx) => (
                        <ChecklistItemRow
                          key={item.id}
                          variant="flat"
                          compact
                          isLast={idx === sessionCheckedItems.length - 1}
                          item={{ ...item, checked: true }}
                          resolvedImageUrl={resolvedImageUrlsByItemId?.[item.id]}
                          checkedBadgeLabel="Bifat"
                          storeUnitPrice={storeUnitPricesByItemId?.[item.id]}
                          storeLoyaltyLabel={storeLoyaltyLabelsByItemId?.[item.id]}
                          storePackagingNote={storePackagingNotesByItemId?.[item.id]}
                          onToggle={handleToggleSessionItem}
                          onQuantityChange={onQuantityChange}
                          onRemove={onRemoveItem}
                          onLongPressItem={onLongPressItem}
                        />
                      ))}
                    </View>
                  )}
                </BeavySurface>
              )}
            </>
          )}
        </ScrollView>

        {confirmMode !== null ? (
          <BeavySurface variant="tonal" style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>{confirmCopy.title}</Text>
            <Text style={styles.confirmBody}>{confirmCopy.body}</Text>
            <View style={styles.footerRow}>
              <Pressable
                onPress={() => setConfirmMode(null)}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>
                  {confirmCopy.cancelLabel}
                </Text>
              </Pressable>
              <Pressable
                onPress={
                  confirmMode === 'clear_checked'
                    ? handleConfirmClearChecked
                    : confirmCopy.isZeroChecked
                      ? handleClose
                      : handleConfirmFinish
                }
                style={styles.primaryBtnFlex}
              >
                <Text style={styles.primaryBtnText}>
                  {confirmCopy.confirmLabel}
                </Text>
              </Pressable>
            </View>
          </BeavySurface>
        ) : (
          <View style={styles.footerRow}>
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                handleClose();
                onGoToPantry?.();
              }}
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryBtnText}>+ Produse</Text>
            </Pressable>

            {onGoToCompare ? (
              <Pressable
                onPress={() => {
                  triggerHaptic('medium');
                  handleClose();
                  onGoToCompare();
                }}
                style={styles.primaryBtnFlex}
              >
                <Text style={styles.primaryBtnText}>
                  Vezi prețurile în magazine →
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={handleRequestFinish} style={styles.primaryBtnFlex}>
                <Text style={styles.primaryBtnText}>Gata cumpărăturile ✓</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  sheetInner: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  modeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  modeBadgeOnline: {
    backgroundColor: C.leek,
  },
  modeBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10,
    color: C.primary,
    letterSpacing: 0.6,
  },
  listTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 19,
    color: C.primary,
    letterSpacing: -0.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  shareBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12.5,
    color: C.primary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackGlyph: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  onlineStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: 'rgba(219, 227, 198, 0.55)',
    borderRadius: BeavyRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  onlineText: {
    flex: 1,
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12,
    color: C.leekDark,
  },
  onlineBtn: {
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  onlineBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11.5,
    color: C.surface,
  },
  progressCard: {
    padding: 12,
    gap: 8,
  },
  progressTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13.5,
    color: C.primary,
  },
  percentPill: {
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 9,
    paddingVertical: 2.5,
  },
  percentPillComplete: {
    backgroundColor: C.leek,
  },
  percentPillText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 11.5,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  percentPillTextComplete: {
    color: C.leekDark,
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: C.secondary,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: C.primary,
  },
  progressFillComplete: {
    backgroundColor: C.leekDark,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  metaSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
  },
  livePriceText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 12.5,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 6,
  },
  undoBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  undoText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.primary,
  },
  undoBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 12,
    color: C.primary,
  },
  emptyCard: {
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  emptyTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.primary,
  },
  emptySub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12.5,
    color: C.muted,
    textAlign: 'center',
  },
  allDoneCard: {
    padding: 16,
    gap: 4,
    backgroundColor: C.leek,
  },
  allDoneTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 15,
    color: C.leekDark,
  },
  allDoneSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: C.leekDark,
    lineHeight: 17,
  },
  aisleFilterContainer: {
    maxHeight: 38,
  },
  aisleFilterContent: {
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
    alignItems: 'center',
  },
  aisleFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
  },
  aisleFilterChipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  aisleFilterChipText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12,
    color: C.primary,
  },
  aisleFilterChipTextActive: {
    color: C.surface,
  },
  aisleGroup: {
    gap: 6,
  },
  aisleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  aisleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  aisleStepCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aisleStepText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.cherry,
  },
  aisleFallbackIcon: {
    fontSize: 14,
  },
  aisleTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.cherry,
  },
  aisleCountBadge: {
    backgroundColor: C.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BeavyRadius.pill,
  },
  aisleCountText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 11,
    color: C.muted,
  },
  itemsCard: {
    paddingVertical: 2,
  },
  checkedCard: {
    paddingVertical: 4,
  },
  checkedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  checkedToggle: {
    minHeight: 36,
    justifyContent: 'center',
  },
  checkedTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.muted,
  },
  clearCheckedText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  confirmBox: {
    padding: 14,
    gap: 8,
  },
  confirmTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 15,
    color: C.primary,
  },
  confirmBody: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12.5,
    color: C.muted,
    lineHeight: 17,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 2,
  },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 13.5,
    color: C.primary,
  },
  primaryBtnFlex: {
    flex: 1,
    minHeight: 48,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13.5,
    color: C.surface,
  },
  pressed: {
    opacity: 0.78,
  },
});
