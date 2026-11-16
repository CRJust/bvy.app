import { SymbolView } from 'expo-symbols';
import React, { type ComponentRef, useCallback, useRef, useState } from 'react';
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
  View,
} from 'react-native';

import { ProductImageBox } from '@/components/product-image-box';
import { QuantityStepper } from '@/components/quantity-stepper';
import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import {
  type AiComposerItem,
  type AiComposerMessage,
  composeShoppingListWithAi,
  INITIAL_AI_PROMPTS,
} from '@/services/beavy-ai-composer';
import type { ConfirmedScanBatch } from '@/services/beavy-list-scanner';

type AiListComposerModalProps = {
  visible: boolean;
  activeListName: string;
  initialPrompt?: string | null;
  onClose: () => void;
  onConfirmAddBatch: (batch: ConfirmedScanBatch, title: string) => void;
};

export function AiListComposerModal({
  visible,
  activeListName,
  initialPrompt,
  onClose,
  onConfirmAddBatch,
}: AiListComposerModalProps) {
  const [inputText, setInputText] = useState(initialPrompt ?? '');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<AiComposerMessage[]>([]);
  const [activeItems, setActiveItems] = useState<AiComposerItem[]>([]);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const handleReset = () => {
    setInputText('');
    setBusy(false);
    setMessages([]);
    setActiveItems([]);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSendMessage = useCallback(
    async (textToSend: string) => {
      const clean = textToSend.trim();
      if (!clean || busy) return;

      Keyboard.dismiss();
      triggerHaptic('light');

      const userMsg: AiComposerMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: clean,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
      setBusy(true);

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);

      try {
        const response = await composeShoppingListWithAi({
          prompt: clean,
          existingItems: activeItems,
        });

        setMessages((prev) => [...prev, response]);
        if (response.items && response.items.length > 0) {
          setActiveItems(response.items);
        }
      } catch {
        const errorMsg: AiComposerMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: 'A apărut o problemă la procesarea cererii. Încearcă să formulezi mai simplu sau alege un șablon de mai jos.',
          quickPrompts: INITIAL_AI_PROMPTS.slice(0, 3),
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setBusy(false);
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 150);
      }
    },
    [activeItems, busy]
  );

  const handleToggleItemIncluded = useCallback((id: string) => {
    triggerHaptic('selection');
    setActiveItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, included: !item.included } : item
      )
    );
  }, []);

  const handleQuantityStep = useCallback((id: string, delta: number) => {
    triggerHaptic('light');
    setActiveItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: nextQty };
      })
    );
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    triggerHaptic('selection');
    setActiveItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const includedItems = activeItems.filter((i) => i.included);
  const selectedCount = includedItems.length;

  const handleConfirmAdd = () => {
    if (selectedCount === 0) return;
    triggerHaptic('success');

    const canonicalItems = includedItems
      .filter((i) => Boolean(i.catalogProduct))
      .map((i) => ({
        product: i.catalogProduct!,
        quantity: i.quantity,
      }));

    const manualItems = includedItems
      .filter((i) => !i.catalogProduct)
      .map((i) => ({
        name: i.name,
        quantity: i.quantity,
      }));

    const lastUserPrompt =
      messages.filter((m) => m.role === 'user').slice(-1)[0]?.text ||
      'Listă AI';

    onConfirmAddBatch({ canonicalItems, manualItems }, lastUserPrompt);
    handleClose();
  };

  return (
    <BeavySheetModal visible={visible} onClose={handleClose} maxHeightRatio="92%">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <View style={styles.container}>
          {/* Header modal */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <SymbolView
                  name="sparkles"
                  tintColor={C.primary}
                  size={16}
                  fallback={<Text style={styles.fallbackGlyph}>✦</Text>}
                />
              </View>
              <View style={styles.headerTitles}>
                <Text style={styles.headerTitle}>Asistent listă</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {activeListName}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handleClose}
              hitSlop={10}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Închide asistentul"
            >
              <Text style={styles.closeBtnText}>×</Text>
            </Pressable>
          </View>

          {/* Corpul conversațional / rezultate */}
          <ScrollView
            ref={scrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? (
              <View style={styles.welcomeWrap}>
                <View style={styles.welcomeBanner}>
                  <Text style={styles.welcomeTitle}>
                    Spune-mi ce vrei să gătești sau lipește produse
                  </Text>
                  <Text style={styles.welcomeDesc}>
                    Descompun automat rețeta în produse concrete din supermarket,
                    fără să cumperi de două ori ce ai deja în cămară.
                  </Text>
                </View>

                <View style={styles.presetsWrap}>
                  <Text style={styles.presetsOverline}>Sugestii rapide:</Text>
                  <View style={styles.chipsRow}>
                    {INITIAL_AI_PROMPTS.map((prompt) => (
                      <Pressable
                        key={prompt}
                        onPress={() => handleSendMessage(prompt)}
                        style={({ pressed }) => [
                          styles.presetChip,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.presetChipText}>{prompt}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.conversationWrap}>
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <View
                      key={msg.id}
                      style={[
                        styles.msgRow,
                        isUser ? styles.msgRowUser : styles.msgRowAssistant,
                      ]}
                    >
                      <View
                        style={[
                          styles.bubble,
                          isUser ? styles.userBubble : styles.assistantBubble,
                        ]}
                      >
                        <Text
                          style={[
                            styles.bubbleText,
                            isUser ? styles.userBubbleText : styles.assistantBubbleText,
                          ]}
                        >
                          {msg.text}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {/* Lista curentă de produse interactive */}
                {activeItems.length > 0 && (
                  <View style={styles.itemsCard}>
                    <View style={styles.itemsCardHeader}>
                      <Text style={styles.itemsCardTitle}>
                        {`Produse identificate (${selectedCount}/${activeItems.length})`}
                      </Text>
                    </View>

                    {activeItems.map((item) => {
                      const prod = item.catalogProduct;
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => handleToggleItemIncluded(item.id)}
                          style={[
                            styles.itemRow,
                            !item.included && styles.itemRowExcluded,
                          ]}
                        >
                          {/* Checkbox */}
                          <View
                            style={[
                              styles.checkbox,
                              item.included && styles.checkboxActive,
                            ]}
                          >
                            {item.included && (
                              <Text style={styles.checkGlyph}>✓</Text>
                            )}
                          </View>

                          {/* Thumbnail imagine */}
                          <View style={styles.thumbBox}>
                            <ProductImageBox
                              imageUrl={prod?.image_url}
                              productName={prod?.canonical_name ?? item.name}
                              brand={prod?.brand ?? item.brandHint}
                              variant="thumb"
                            />
                          </View>

                          {/* Info text produs */}
                          <View style={styles.itemCopy}>
                            <Text
                              style={[
                                styles.itemName,
                                !item.included && styles.itemNameStriked,
                              ]}
                              numberOfLines={2}
                            >
                              {prod?.canonical_name ?? item.name}
                            </Text>

                            <View style={styles.itemMetaRow}>
                              {prod?.brand ? (
                                <Text style={styles.itemBrand}>{prod.brand}</Text>
                              ) : null}
                              {item.packageSizeHint ? (
                                <Text style={styles.itemSize}>
                                  {item.packageSizeHint}
                                </Text>
                              ) : null}
                              {item.isPantryStaple ? (
                                <View style={styles.stapleBadge}>
                                  <Text style={styles.stapleBadgeText}>În cămară</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>

                          {/* Stepper cantitate */}
                          {item.included && (
                            <View
                              style={styles.stepperWrap}
                              onStartShouldSetResponder={() => true}
                            >
                              <QuantityStepper
                                quantity={item.quantity}
                                onDecrement={() => handleQuantityStep(item.id, -1)}
                                onIncrement={() => handleQuantityStep(item.id, 1)}
                                variant="paper"
                              />
                            </View>
                          )}

                          {/* Eliminare */}
                          <Pressable
                            onPress={() => handleRemoveItem(item.id)}
                            hitSlop={8}
                            style={styles.removeBtn}
                            accessibilityRole="button"
                            accessibilityLabel={`Scoate ${item.name}`}
                          >
                            <Text style={styles.removeBtnText}>×</Text>
                          </Pressable>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Sugestii de continuare (Quick Prompts) */}
                {messages.length > 0 &&
                  messages[messages.length - 1].quickPrompts && (
                    <View style={styles.quickPromptsWrap}>
                      {messages[messages.length - 1].quickPrompts?.map((chip) => (
                        <Pressable
                          key={chip}
                          onPress={() => handleSendMessage(chip)}
                          style={({ pressed }) => [
                            styles.quickChip,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.quickChipText}>{chip}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
              </View>
            )}

            {busy && (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={styles.busyText}>Pregătesc produsele...</Text>
              </View>
            )}
          </ScrollView>

          {/* Bară inferioară: Input + Buton Adaugă în listă */}
          <View style={styles.bottomArea}>
            <View style={styles.inputBar}>
              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder="Scrie o rețetă sau cerință..."
                placeholderTextColor={C.muted}
                style={styles.textInput}
                returnKeyType="send"
                onSubmitEditing={() => handleSendMessage(inputText)}
                editable={!busy}
              />
              <Pressable
                onPress={() => handleSendMessage(inputText)}
                disabled={!inputText.trim() || busy}
                style={({ pressed }) => [
                  styles.sendBtn,
                  (!inputText.trim() || busy) && styles.sendBtnDisabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Trimite"
              >
                <SymbolView
                  name="arrow.up"
                  tintColor={C.surface}
                  size={15}
                  fallback={<Text style={styles.sendGlyph}>↑</Text>}
                />
              </Pressable>
            </View>

            {selectedCount > 0 && (
              <Pressable
                onPress={handleConfirmAdd}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Adaugă ${selectedCount} produse în listă`}
              >
                <SymbolView
                  name="plus"
                  tintColor={C.surface}
                  size={15}
                  fallback={<Text style={styles.confirmGlyph}>+</Text>}
                />
                <Text style={styles.confirmBtnText}>
                  {`Adaugă ${selectedCount} ${selectedCount === 1 ? 'produs' : 'produse'} în listă`}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    minHeight: 520,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackGlyph: {
    fontSize: 14,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  headerTitles: {
    gap: 1,
  },
  headerTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 16,
    color: C.primary,
  },
  headerSubtitle: {
    fontFamily: BeavyFonts.medium,
    fontWeight: '500',
    fontSize: 12,
    color: C.muted,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: C.primary,
    lineHeight: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  welcomeWrap: {
    gap: 16,
    paddingTop: 6,
  },
  welcomeBanner: {
    backgroundColor: C.surface,
    padding: 16,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
    gap: 6,
  },
  welcomeTitle: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 15,
    color: C.primary,
  },
  welcomeDesc: {
    fontFamily: BeavyFonts.regular,
    fontSize: 13,
    color: C.muted,
    lineHeight: 18,
  },
  presetsWrap: {
    gap: 8,
  },
  presetsOverline: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: BeavyRadius.pill,
    borderWidth: 1,
    borderColor: C.rule,
    minHeight: 44,
    justifyContent: 'center',
  },
  presetChipText: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 12.5,
    color: C.primary,
  },
  conversationWrap: {
    gap: 12,
  },
  msgRow: {
    flexDirection: 'row',
    width: '100%',
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAssistant: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BeavyRadius.md,
  },
  userBubble: {
    backgroundColor: C.primary,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 13.5,
    lineHeight: 19,
  },
  userBubbleText: {
    color: C.surface,
  },
  assistantBubbleText: {
    color: C.primary,
  },
  itemsCard: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    borderWidth: 1,
    borderColor: C.rule,
    paddingVertical: 6,
    gap: 2,
    marginTop: 6,
  },
  itemsCardHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  itemsCardTitle: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13,
    color: C.primary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 10,
    minHeight: 52,
  },
  itemRowExcluded: {
    opacity: 0.42,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  checkGlyph: {
    color: C.surface,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 14,
  },
  thumbBox: {
    width: 36,
    height: 36,
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itemName: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13,
    color: C.primary,
  },
  itemNameStriked: {
    textDecorationLine: 'line-through',
    color: C.muted,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  itemBrand: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
  },
  itemSize: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
  },
  stapleBadge: {
    backgroundColor: C.secondary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BeavyRadius.pill,
  },
  stapleBadgeText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 9.5,
    color: C.primary,
  },
  stepperWrap: {
    flexShrink: 0,
  },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: 18,
    color: C.muted,
    lineHeight: 18,
  },
  quickPromptsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 4,
  },
  quickChip: {
    backgroundColor: C.surface,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: BeavyRadius.pill,
    borderWidth: 1,
    borderColor: C.rule,
  },
  quickChipText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 11.5,
    color: C.primary,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  busyText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: C.muted,
  },
  bottomArea: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.rule,
    gap: 10,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 14,
    minHeight: 46,
    gap: 8,
    borderWidth: 1,
    borderColor: C.rule,
  },
  textInput: {
    flex: 1,
    fontFamily: BeavyFonts.medium,
    fontSize: 13.5,
    color: C.primary,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
  sendGlyph: {
    color: C.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  confirmGlyph: {
    color: C.surface,
    fontSize: 16,
    fontWeight: '800',
  },
  confirmBtnText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 14,
    color: C.surface,
  },
  pressed: {
    opacity: 0.72,
  },
});
