import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, {
  type ComponentRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductPriceGrid } from '@/components/product/product-price-grid';
import { ProductImageBox } from '@/components/product-image-box';
import { QuantityStepper } from '@/components/quantity-stepper';
import { BeavyScreenTransition } from '@/components/screen-transition';
import { BeavyHeader } from '@/components/ui/beavy-header';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useShopping } from '@/context/shopping-context';
import { useTabBar } from '@/context/tab-bar-context';
import { fetchProductPriceGrid } from '@/services/product-price-grid-api';
import {
  compactStoresLabel,
  formatPriceLei,
  type PriceGridSummary,
} from '@/services/product-price-grid';
import {
  type AiComposerMessage,
  composeShoppingListWithAi,
  INITIAL_AI_PROMPTS,
} from '@/services/beavy-ai-composer';
import {
  type CatalogIndexProduct,
  matchExtractedItemsToCatalog,
} from '@/services/beavy-list-scanner';

const GREETING_MESSAGE: AiComposerMessage = {
  id: 'greeting',
  role: 'assistant',
  text: 'Bună! Sunt asistentul tău Beavy pentru cumpărături.\n\nÎți pot compune liste pentru orice rețetă sau ocazie, pot curăța ingredientele pe care le ai deja în cămară sau pot căuta cele mai bune oferte.',
  quickPrompts: INITIAL_AI_PROMPTS,
  timestamp: new Date().toISOString(),
};

// Cache în memorie pentru a persista conversația la navigarea între tab-uri
let chatSessionCache: {
  messages: AiComposerMessage[];
  addedBatchIds: string[];
} | null = null;

export default function ChatScreen() {
  const { user } = useAuth();
  const { triggerTabTransition } = useTabBar();
  const {
    activeList,
    basketItems,
    addScannedItemsBatch,
    preferences,
    preferenceMemory,
  } = useShopping();

  const [inputText, setInputText] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<AiComposerMessage[]>(
    () => chatSessionCache?.messages ?? [GREETING_MESSAGE]
  );
  const [addedBatchIds, setAddedBatchIds] = useState<Set<string>>(
    () => new Set(chatSessionCache?.addedBatchIds ?? [])
  );
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [gridsByProductId, setGridsByProductId] = useState<Record<string, PriceGridSummary>>({});
  const requestedGridsRef = useRef<Set<string>>(new Set());

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincronizare cache de sesiune
  useEffect(() => {
    chatSessionCache = {
      messages,
      addedBatchIds: Array.from(addedBatchIds),
    };
  }, [messages, addedBatchIds]);

  // Auto-scroll fluid la ultimul mesaj când se deschide tastatura virtuală
  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 80);
    });

    return () => {
      sub.remove();
    };
  }, []);

  const resolvedUserName = useMemo(() => {
    const authName =
      typeof user?.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name.trim()
        : '';
    if (authName) return authName;
    if (user?.email) {
      const emailPrefix = user.email.split('@')[0]?.trim();
      if (emailPrefix) return emailPrefix;
    }
    return preferences.userName?.trim() || '';
  }, [user, preferences.userName]);

  const userInitials = useMemo(() => {
    const parts = resolvedUserName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return resolvedUserName.slice(0, 2).toUpperCase() || 'B';
  }, [resolvedUserName]);

  // Cele mai recente produse generate de asistent pentru a permite comenzi de rafinare (ex: "scoate sarea", "dublează")
  const latestAssistantItems = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.items && m.items.length > 0) {
        return m.items;
      }
    }
    return [];
  }, [messages]);

  const showToast = useCallback((msg: string) => {
    setFeedbackToast(msg);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackToast(null);
      feedbackTimerRef.current = null;
    }, 3200);
  }, []);

  // Prețurile pe magazine pentru fiecare ingredient canonic propus (cache în serviciu, ~1 interogare / produs).
  useEffect(() => {
    const products = new Map<string, NonNullable<AiComposerMessage['items']>[number]['catalogProduct']>();
    for (const m of messages) {
      for (const it of m.items ?? []) {
        const prod = it.catalogProduct ?? it.candidates?.[0]?.product ?? null;
        if (prod && !requestedGridsRef.current.has(prod.id)) products.set(prod.id, prod);
      }
    }
    if (products.size === 0) return;
    let cancelled = false;
    for (const [id, prod] of products) {
      requestedGridsRef.current.add(id);
      void fetchProductPriceGrid(
        { id, canonical_name: prod!.canonical_name, brand: prod!.brand, package_size: prod!.package_size, image_url: prod!.image_url },
        preferences.city
      )
        .then((summary) => {
          if (!cancelled) setGridsByProductId((prev) => ({ ...prev, [id]: summary }));
        })
        .catch(() => {
          requestedGridsRef.current.delete(id);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [messages, preferences.city]);

  const handleSelectCandidate = useCallback(
    (messageId: string, itemId: string, product: NonNullable<NonNullable<AiComposerMessage['items']>[number]['catalogProduct']>) => {
      triggerHaptic('selection');
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id !== messageId || !msg.items
            ? msg
            : {
                ...msg,
                items: msg.items.map((it) => (it.id === itemId ? { ...it, catalogProduct: product } : it)),
              }
        )
      );
    },
    []
  );

  const handleResetChat = useCallback(() => {
    triggerHaptic('medium');
    chatSessionCache = null;
    setMessages([
      {
        ...GREETING_MESSAGE,
        id: `greeting-${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    ]);
    setAddedBatchIds(new Set());
    setInputText('');
  }, []);

  const handleAddItemsToList = useCallback(
    async (msgId: string) => {
      const targetMessage = messages.find((m) => m.id === msgId);
      const targetItems = targetMessage?.items ?? [];
      const included = targetItems.filter((i) => i.included);
      if (included.length === 0) return;

      triggerHaptic('success');

      // Rezoluție 100% canonică - NICIUN produs manual nu este permis!
      const unmapped = included.filter(
        (i) => !i.catalogProduct && (!i.candidates || i.candidates.length === 0)
      );
      const resolvedUnmapped: Record<string, CatalogIndexProduct> = {};
      if (unmapped.length > 0) {
        try {
          const matched = await matchExtractedItemsToCatalog(
            unmapped.map((u) => ({
              rawLine: u.name,
              name: u.name,
              quantity: u.quantity,
              unit: u.unit ?? 'buc',
              brandHint: null,
              packageSizeHint: null,
              confidence: 0.9,
            }))
          );
          for (let idx = 0; idx < unmapped.length; idx++) {
            const itemMatch = matched[idx];
            const p = itemMatch?.selectedProduct ?? itemMatch?.candidates?.[0]?.product;
            if (p) {
              resolvedUnmapped[unmapped[idx].name] = p;
            }
          }
        } catch {
          // ignore
        }
      }

      const canonicalItems: { product: CatalogIndexProduct; quantity: number }[] = [];
      for (const i of included) {
        const prod =
          i.catalogProduct ||
          i.candidates?.[0]?.product ||
          resolvedUnmapped[i.name];
        if (prod) {
          canonicalItems.push({ product: prod, quantity: i.quantity });
        }
      }

      if (canonicalItems.length === 0) return;

      const res = addScannedItemsBatch({ canonicalItems, manualItems: [] });
      setAddedBatchIds((prev) => new Set([...prev, msgId]));
      const count = res.addedUnits;
      showToast(
        `${count} ${count === 1 ? 'produs adăugat' : 'produse adăugate'} în listă`
      );
    },
    [addScannedItemsBatch, messages, showToast]
  );

  const handleSendMessage = useCallback(
    async (textToSend: string) => {
      const clean = textToSend.trim();
      if (!clean || busy) return;

      // 1. Interceptare rapidă pentru navigare directă la coș / comparația magazinelor
      const isCartNav =
        /(?:vezi|arata|arată|mergi|deschide|compara|compară|care\s+e|cât\s+costă|cat\s+costa).*(?:coș|cos|coșul|cosul)/i.test(
          clean
        ) ||
        /^(?:coș|cos|coșul|cosul|coș\s+ieftin|cos\s+ieftin|cel\s+mai\s+ieftin\s+coș|cel\s+mai\s+ieftin\s+cos)$/i.test(
          clean
        );
      if (isCartNav) {
        Keyboard.dismiss();
        triggerHaptic('medium');
        showToast('Deschid comparația magazinelor...');
        triggerTabTransition(2, () => router.push('/compare'));
        return;
      }

      // 2. Interceptare rapidă pentru comanda „Adaugă în listă” / „Gata, adaugă în listă”
      const isAddToListCmd =
        /^(?:gata,?\s*)?(?:adauga|adaugă)\s+(?:in|în)\s+(?:lista|listă)$/i.test(
          clean
        );
      if (isAddToListCmd) {
        const lastMsgWithItems = [...messages].reverse().find(
          (m) =>
            m.role === 'assistant' &&
            (m.items?.length ?? 0) > 0 &&
            !addedBatchIds.has(m.id)
        );
        if (lastMsgWithItems) {
          Keyboard.dismiss();
          handleAddItemsToList(lastMsgWithItems.id);
          return;
        }
      }

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
          existingItems: latestAssistantItems,
          context: {
            activeListName: activeList?.name ?? 'Lista de cumpărături',
            currentBasketItems: basketItems.map((b) => ({
              name: b.name,
              quantity: b.quantity,
            })),
            preferences,
            preferenceMemory,
            learnPreferencesEnabled: preferences.learnPreferencesEnabled,
          },
        });

        setMessages((prev) => [...prev, response]);
      } catch {
        const errorMsg: AiComposerMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: 'Nu am putut procesa mesajul momentan. Te rog încearcă o formulare mai simplă sau alege o sugestie de mai jos.',
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
    [
      activeList,
      addedBatchIds,
      basketItems,
      busy,
      handleAddItemsToList,
      latestAssistantItems,
      messages,
      preferenceMemory,
      preferences,
      showToast,
      triggerTabTransition,
    ]
  );

  const handleToggleItemIncluded = useCallback((messageId: string, itemId: string) => {
    triggerHaptic('selection');
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId || !msg.items) return msg;
        return {
          ...msg,
          items: msg.items.map((it) =>
            it.id === itemId ? { ...it, included: !it.included } : it
          ),
        };
      })
    );
  }, []);

  const handleQuantityStep = useCallback(
    (messageId: string, itemId: string, delta: number) => {
      triggerHaptic('light');
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId || !msg.items) return msg;
          return {
            ...msg,
            items: msg.items.map((it) => {
              if (it.id !== itemId) return it;
              return { ...it, quantity: Math.max(1, it.quantity + delta) };
            }),
          };
        })
      );
    },
    []
  );

  const handleRemoveItem = useCallback((messageId: string, itemId: string) => {
    triggerHaptic('selection');
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId || !msg.items) return msg;
        return {
          ...msg,
          items: msg.items.filter((it) => it.id !== itemId),
        };
      })
    );
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <BeavyScreenTransition style={styles.container}>
        {/* Header cu acces profil & reset chat */}
        <BeavyHeader
          userInitials={userInitials}
          showBottomRule
          onPressProfile={() =>
            triggerTabTransition(3, () => router.push('/profile'))
          }
          rightAction={{
            symbol: 'arrow.counterclockwise',
            fallbackText: '↺',
            accessibilityLabel: 'Resetează conversația',
            onPress: handleResetChat,
          }}
        />

        {/* Bară de context live: lista activă + acces rapid la Comparatorul de Coș */}
        <View style={styles.contextBar}>
          <View style={styles.contextLeft}>
            <SymbolView
              name="sparkles"
              tintColor={C.primary}
              size={13}
              fallback={<Text style={styles.fallbackGlyph}>✦</Text>}
            />
            <Text numberOfLines={1} style={styles.contextText}>
              {`${activeList?.name ?? 'Lista mea'} · ${basketItems.length} ${
                basketItems.length === 1 ? 'produs în coș' : 'produse în coș'
              }`}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              triggerTabTransition(2, () => router.push('/compare'));
            }}
            style={({ pressed }) => [styles.contextCompareBtn, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.contextCompareBtnText}>Compară coșul →</Text>
          </Pressable>
        </View>

        {/* Notificare scurtă confirmare */}
        {feedbackToast && (
          <View style={styles.toastWrap}>
            <View style={styles.toastDot} />
            <Text style={styles.toastText} numberOfLines={1}>
              {feedbackToast}
            </Text>
          </View>
        )}

        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={0}
          style={styles.keyboardAvoid}
        >
          {/* Fluxul conversațional */}
          <ScrollView
            ref={scrollRef}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isLastMessage = index === messages.length - 1;
              const msgItems = msg.items ?? [];
              const hasItems = !isUser && msgItems.length > 0;
              const isBatchAdded = addedBatchIds.has(msg.id);
              const includedCount = msgItems.filter((i) => i.included).length;
              let estimatedCost = 0;
              let potentialSpreadSavings = 0;
              let pricedIncluded = 0;
              for (const it of msgItems) {
                if (!it.included) continue;
                const pid = (it.catalogProduct ?? it.candidates?.[0]?.product)?.id;
                const gridSummary = pid ? gridsByProductId[pid] : undefined;
                const cheapest = gridSummary?.cheapest ?? null;
                if (cheapest) {
                  estimatedCost += cheapest.price * it.quantity;
                  potentialSpreadSavings += (gridSummary?.spread ?? 0) * it.quantity;
                  pricedIncluded += 1;
                }
              }
              const chips = [...(msg.quickPrompts ?? [])];
              if (hasItems && !isBatchAdded) {
                if (!chips.some((c) => /gata,?\s*adaug/i.test(c))) chips.push('Adaugă în listă');
              }
              if (hasItems) chips.push('Compară coșul în magazine');

              return (
                <View key={msg.id} style={styles.messageBlock}>
                  {/* Bubble text */}
                  <View
                    style={[
                      styles.bubbleRow,
                      isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
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

                  {/* Card interactiv produse (propuse specific de acest mesaj al asistentului) */}
                  {hasItems && (
                    <BeavySurface variant="elevated" style={styles.itemsCard}>
                      {msg.missionConstraints ? (
                        <View style={styles.missionBanner}>
                          <View style={styles.missionHeaderRow}>
                            <SymbolView
                              name="target"
                              tintColor={C.primary}
                              size={14}
                              fallback={<Text style={styles.fallbackGlyph}>🎯</Text>}
                            />
                            <Text style={styles.missionTitle}>Misiune de cumpărături optimizată</Text>
                          </View>
                          <View style={styles.missionPillsRow}>
                            {msg.missionConstraints.budgetRon != null ? (
                              <View style={styles.missionPill}>
                                <Text style={styles.missionPillText}>
                                  {`Buget: ${msg.missionConstraints.budgetRon} lei`}
                                </Text>
                              </View>
                            ) : null}
                            {msg.missionConstraints.servings != null ? (
                              <View style={styles.missionPill}>
                                <Text style={styles.missionPillText}>
                                  {`${msg.missionConstraints.servings} persoane`}
                                </Text>
                              </View>
                            ) : null}
                            {msg.missionConstraints.days != null ? (
                              <View style={styles.missionPill}>
                                <Text style={styles.missionPillText}>
                                  {`${msg.missionConstraints.days} zile`}
                                </Text>
                              </View>
                            ) : null}
                            <View style={styles.missionPill}>
                              <Text style={styles.missionPillText}>
                                {`max ${msg.missionConstraints.maxStores} ${
                                  msg.missionConstraints.maxStores === 1 ? 'magazin' : 'magazine'
                                }`}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ) : null}

                      <View style={styles.itemsCardHeader}>
                        <View style={styles.itemsHeaderLeft}>
                          <SymbolView
                            name="basket.fill"
                            tintColor={C.primary}
                            size={14}
                            fallback={<Text style={styles.fallbackGlyph}>▣</Text>}
                          />
                          <Text style={styles.itemsCardTitle}>
                            {`Produse propuse (${includedCount}/${msgItems.length})`}
                          </Text>
                        </View>

                        {isBatchAdded && (
                          <View style={styles.addedBadge}>
                            <Text style={styles.addedBadgeText}>✓ În listă</Text>
                          </View>
                        )}
                      </View>

                      {pricedIncluded > 0 && (
                        <View style={styles.costSummaryStrip}>
                          <View style={styles.costSummaryCol}>
                            <Text style={styles.costSummaryLabel}>COST ESTIMAT PROPUNERE</Text>
                            <Text style={styles.costSummaryValue}>
                              {`~${formatPriceLei(estimatedCost)} (${formatPriceLei(
                                estimatedCost / 4
                              )} / porție)`}
                            </Text>
                          </View>
                          {potentialSpreadSavings > 0.5 && (
                            <View style={styles.spreadSavingsPill}>
                              <Text style={styles.spreadSavingsText}>
                                {`Până la −${formatPriceLei(potentialSpreadSavings)} între magazine`}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {msgItems.map((item) => {
                        const prod = item.catalogProduct ?? item.candidates?.[0]?.product ?? null;
                        const grid = prod ? gridsByProductId[prod.id] : undefined;
                        const priceLine = grid ? compactStoresLabel(grid) : null;
                        const isExpanded = expandedItemId === item.id;
                        return (
                          <React.Fragment key={item.id}>
                          <Pressable
                            onPress={() => handleToggleItemIncluded(msg.id, item.id)}
                            style={[
                              styles.itemRow,
                              !item.included && styles.itemRowExcluded,
                            ]}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: item.included }}
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

                            {/* Poză produs */}
                            <View style={styles.thumbBox}>
                              <ProductImageBox
                                imageUrl={prod?.image_url}
                                productName={prod?.canonical_name ?? item.name}
                                brand={prod?.brand ?? item.brandHint}
                                variant="thumb"
                              />
                            </View>

                            {/* Informații produs */}
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
                                  <Text style={styles.itemBrand}>
                                    {prod.brand}
                                  </Text>
                                ) : null}
                                {item.packageSizeHint ? (
                                  <Text style={styles.itemSize}>
                                    {item.packageSizeHint}
                                  </Text>
                                ) : null}
                                {item.isPantryStaple ? (
                                  <View style={styles.stapleBadge}>
                                    <Text style={styles.stapleBadgeText}>
                                      În cămară
                                    </Text>
                                  </View>
                                ) : null}
                                {grid && grid.isCommonAcrossStores ? (
                                  <View style={styles.commonStoreBadge}>
                                    <Text style={styles.commonStoreBadgeText}>
                                      {`Comun în ${grid.storeCount} mag.`}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                              {prod ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityState={{ expanded: isExpanded }}
                                  accessibilityLabel={`Compară prețurile pentru ${prod.canonical_name}`}
                                  onPress={() => {
                                    triggerHaptic('selection');
                                    setExpandedItemId(isExpanded ? null : item.id);
                                  }}
                                  style={styles.priceLineBtn}
                                >
                                  {grid?.cheapest?.retailerName && (
                                    <RetailerLogo
                                      retailerName={grid.cheapest.retailerName}
                                      size={14}
                                      shape="circle"
                                    />
                                  )}
                                  <Text style={styles.priceLineText} numberOfLines={1}>
                                    {priceLine ?? 'Compar magazinele…'}
                                  </Text>
                                  <View style={styles.gridExpandBadge}>
                                    <Text style={styles.gridExpandBadgeText}>
                                      {isExpanded ? 'Ascunde ▴' : 'Grilă ▾'}
                                    </Text>
                                  </View>
                                </Pressable>
                              ) : null}
                              {item.tierVariants &&
                              (item.tierVariants.privateLabel ||
                                item.tierVariants.cheaper ||
                                item.tierVariants.premium) ? (
                                <View style={styles.tierPillsRow}>
                                  {item.tierVariants.common ? (
                                    <Pressable
                                      accessibilityRole="button"
                                      onPress={() =>
                                        handleSelectCandidate(
                                          msg.id,
                                          item.id,
                                          item.tierVariants!.common!
                                        )
                                      }
                                      style={[
                                        styles.tierMiniChip,
                                        prod?.id === item.tierVariants.common.id &&
                                          styles.tierMiniChipActive,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.tierMiniChipText,
                                          prod?.id === item.tierVariants.common.id &&
                                            styles.tierMiniChipTextActive,
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
                                        handleSelectCandidate(
                                          msg.id,
                                          item.id,
                                          item.tierVariants!.privateLabel!
                                        )
                                      }
                                      style={[
                                        styles.tierMiniChip,
                                        prod?.id === item.tierVariants.privateLabel.id &&
                                          styles.tierMiniChipActive,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.tierMiniChipText,
                                          prod?.id === item.tierVariants.privateLabel.id &&
                                            styles.tierMiniChipTextActive,
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
                                        handleSelectCandidate(
                                          msg.id,
                                          item.id,
                                          item.tierVariants!.cheaper!
                                        )
                                      }
                                      style={[
                                        styles.tierMiniChip,
                                        prod?.id === item.tierVariants.cheaper.id &&
                                          styles.tierMiniChipActive,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.tierMiniChipText,
                                          prod?.id === item.tierVariants.cheaper.id &&
                                            styles.tierMiniChipTextActive,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {`Mai ieftin${
                                          item.tierVariants.cheaper.min_price != null
                                            ? ` · ${formatPriceLei(item.tierVariants.cheaper.min_price)}`
                                            : ''
                                        }`}
                                      </Text>
                                    </Pressable>
                                  ) : null}
                                  {item.tierVariants.premium ? (
                                    <Pressable
                                      accessibilityRole="button"
                                      onPress={() =>
                                        handleSelectCandidate(
                                          msg.id,
                                          item.id,
                                          item.tierVariants!.premium!
                                        )
                                      }
                                      style={[
                                        styles.tierMiniChip,
                                        prod?.id === item.tierVariants.premium.id &&
                                          styles.tierMiniChipActive,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.tierMiniChipText,
                                          prod?.id === item.tierVariants.premium.id &&
                                            styles.tierMiniChipTextActive,
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

                            {/* Stepper cantitate */}
                            {item.included && (
                              <View
                                style={styles.stepperWrap}
                                onStartShouldSetResponder={() => true}
                              >
                                <QuantityStepper
                                  quantity={item.quantity}
                                  onDecrement={() =>
                                    handleQuantityStep(msg.id, item.id, -1)
                                  }
                                  onIncrement={() =>
                                    handleQuantityStep(msg.id, item.id, 1)
                                  }
                                  variant="paper"
                                />
                              </View>
                            )}

                            {/* Eliminare */}
                            <Pressable
                              onPress={() => handleRemoveItem(msg.id, item.id)}
                              hitSlop={8}
                              style={styles.removeBtn}
                              accessibilityRole="button"
                              accessibilityLabel={`Scoate ${item.name}`}
                            >
                              <Text style={styles.removeBtnText}>×</Text>
                            </Pressable>
                          </Pressable>
                          {isExpanded && prod ? (
                            <View style={styles.gridPanel}>
                              <ProductPriceGrid
                                product={{
                                  id: prod.id,
                                  canonical_name: prod.canonical_name,
                                  brand: prod.brand,
                                  package_size: prod.package_size,
                                  image_url: prod.image_url,
                                }}
                                city={preferences.city}
                              />
                              {(item.candidates ?? []).filter((c) => c.product.id !== prod.id).length > 0 ? (
                                <View style={styles.variantBlock}>
                                  <Text style={styles.variantTitle}>Alege altă variantă</Text>
                                  <View style={styles.variantRow}>
                                    {(item.candidates ?? [])
                                      .filter((c) => c.product.id !== prod.id)
                                      .slice(0, 5)
                                      .map((c) => (
                                        <Pressable
                                          key={c.product.id}
                                          accessibilityRole="button"
                                          onPress={() => handleSelectCandidate(msg.id, item.id, c.product)}
                                          style={({ pressed }) => [styles.variantChip, pressed && styles.pressed]}
                                        >
                                          <Text style={styles.variantChipText} numberOfLines={1}>
                                            {[c.product.brand, c.product.package_size].filter(Boolean).join(' · ') ||
                                              c.product.canonical_name}
                                          </Text>
                                        </Pressable>
                                      ))}
                                  </View>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                          </React.Fragment>
                        );
                      })}

                      {/* Acțiuni pe card */}
                      <View style={styles.cardActionArea}>
                        <Pressable
                          onPress={() => handleAddItemsToList(msg.id)}
                          disabled={includedCount === 0}
                          style={({ pressed }) => [
                            styles.cardAddBtn,
                            isBatchAdded && styles.cardAddBtnSuccess,
                            includedCount === 0 && styles.cardAddBtnDisabled,
                            pressed && styles.pressed,
                          ]}
                          accessibilityRole="button"
                        >
                          <SymbolView
                            name={isBatchAdded ? 'checkmark' : 'plus'}
                            tintColor={isBatchAdded ? C.primary : C.surface}
                            size={14}
                            fallback={<Text style={styles.btnGlyph}>+</Text>}
                          />
                          <Text
                            style={[
                              styles.cardAddBtnText,
                              isBatchAdded && styles.cardAddBtnTextSuccess,
                            ]}
                          >
                            {isBatchAdded
                              ? 'Adăugate în listă (apasă pentru a adăuga din nou)'
                              : `Adaugă ${includedCount} ${includedCount === 1 ? 'produs' : 'produse'} în listă${
                                  pricedIncluded > 0
                                    ? ` · ~${formatPriceLei(estimatedCost)}${pricedIncluded < includedCount ? '+' : ''}`
                                    : ''
                                }`}
                          </Text>
                        </Pressable>

                        {/* Comutare rapidă către Coș după adăugare */}
                        {isBatchAdded && (
                          <Pressable
                            onPress={() =>
                              triggerTabTransition(0, () => router.push('/'))
                            }
                            style={({ pressed }) => [
                              styles.cardViewCartBtn,
                              pressed && styles.pressed,
                            ]}
                            accessibilityRole="button"
                          >
                            <Text style={styles.cardViewCartText}>
                              Mergi la Coș pentru prețuri →
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </BeavySurface>
                  )}

                  {/* Sugestii de continuare (Quick Prompts) */}
                  {isLastMessage && chips.length > 0 && (
                    <View style={styles.quickPromptsRow}>
                      {chips.map((prompt) => (
                        <Pressable
                          key={prompt}
                          onPress={() => handleSendMessage(prompt)}
                          style={({ pressed }) => [
                            styles.quickChip,
                            pressed && styles.pressed,
                          ]}
                          accessibilityRole="button"
                        >
                          <Text style={styles.quickChipText}>{prompt}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Indicator de procesare */}
            {busy && (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={styles.busyText}>Beavy scrie...</Text>
              </View>
            )}
          </ScrollView>

          {/* Bară de introducere mesaj */}
          <View style={styles.bottomBarWrap}>
            <View style={styles.inputContainer}>
              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder="Întreabă sau scrie ce vrei să gătești..."
                placeholderTextColor={C.muted}
                style={styles.textInput}
                returnKeyType="send"
                onSubmitEditing={() => handleSendMessage(inputText)}
                editable={!busy}
                autoCorrect={false}
              />

              <Pressable
                onPress={() => handleSendMessage(inputText)}
                disabled={!inputText.trim() || busy}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => [
                  styles.sendBtn,
                  (!inputText.trim() || busy) && styles.sendBtnDisabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Trimite mesajul"
              >
                <SymbolView
                  name="arrow.up"
                  tintColor={C.surface}
                  size={15}
                  fallback={<Text style={styles.sendGlyph}>↑</Text>}
                />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BeavyScreenTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  container: {
    flex: 1,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  toastWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  toastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.leekDark,
  },
  toastText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12.5,
    color: C.primary,
  },
  keyboardAvoid: {
    flex: 1,
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 16,
  },
  messageBlock: {
    gap: 10,
  },
  bubbleRow: {
    flexDirection: 'row',
    width: '100%',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAssistant: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '86%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BeavyRadius.lg,
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
    lineHeight: 20,
  },
  userBubbleText: {
    color: C.surface,
  },
  assistantBubbleText: {
    color: C.primary,
  },
  itemsCard: {
    paddingVertical: 4,
    gap: 2,
    marginTop: 2,
  },
  itemsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  itemsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemsCardTitle: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13,
    color: C.primary,
  },
  fallbackGlyph: {
    fontSize: 12,
    color: C.primary,
  },
  addedBadge: {
    backgroundColor: C.secondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BeavyRadius.pill,
  },
  addedBadgeText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.primary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.rule,
  },
  itemRowExcluded: {
    opacity: 0.42,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.rule,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  checkGlyph: {
    color: C.surface,
    fontSize: 11,
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
  priceLineBtn: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  priceLineText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.leekDark,
    fontVariant: ['tabular-nums'],
  },
  gridExpandBadge: {
    backgroundColor: C.grapefruit,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BeavyRadius.pill,
  },
  gridExpandBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10.5,
    color: C.primary,
  },
  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: C.buttermilk,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
    gap: 8,
  },
  contextLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contextText: {
    flex: 1,
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  contextCompareBtn: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.leek,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextCompareBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 11.5,
    color: C.primary,
  },
  missionBanner: {
    margin: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.grapefruit,
    borderWidth: 1,
    borderColor: C.rule,
    gap: 8,
  },
  missionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  missionTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  missionPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  missionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
  },
  missionPillText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  costSummaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.buttermilk,
    borderWidth: 1,
    borderColor: C.rule,
    gap: 8,
  },
  costSummaryCol: {
    flex: 1,
    gap: 1,
  },
  costSummaryLabel: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 9.5,
    color: C.muted,
    letterSpacing: 0.5,
  },
  costSummaryValue: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 13.5,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  spreadSavingsPill: {
    backgroundColor: C.leek,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
  },
  spreadSavingsText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10.5,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  gridPanel: {
    gap: 12,
    padding: 12,
    marginBottom: 8,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.buttermilk,
    borderWidth: 1,
    borderColor: C.rule,
  },
  variantBlock: { gap: 6 },
  variantTitle: { fontFamily: BeavyFonts.bold, fontSize: 12.5, color: C.muted },
  variantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  variantChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    maxWidth: 220,
  },
  variantChipText: { fontFamily: BeavyFonts.semiBold, fontSize: 12.5, color: C.primary },
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
  genericBadge: {
    backgroundColor: C.rule,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BeavyRadius.pill,
  },
  genericBadgeText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 9.5,
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
  commonStoreBadge: {
    backgroundColor: C.leek,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BeavyRadius.pill,
  },
  commonStoreBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 9.5,
    color: C.primary,
  },
  tierPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  tierMiniChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.buttermilk,
    borderWidth: 1,
    borderColor: C.rule,
    maxWidth: 170,
  },
  tierMiniChipActive: {
    backgroundColor: C.leek,
    borderColor: C.leekDark,
  },
  tierMiniChipText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 10.5,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  tierMiniChipTextActive: {
    fontFamily: BeavyFonts.extraBold,
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
  cardActionArea: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
  },
  cardAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  cardAddBtnSuccess: {
    backgroundColor: C.secondary,
  },
  cardAddBtnDisabled: {
    opacity: 0.45,
  },
  btnGlyph: {
    color: C.surface,
    fontSize: 14,
    fontWeight: '800',
  },
  cardAddBtnText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13,
    color: C.surface,
  },
  cardAddBtnTextSuccess: {
    color: C.primary,
  },
  cardViewCartBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    minHeight: 36,
  },
  cardViewCartText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.strawberry,
    textDecorationLine: 'underline',
  },
  quickPromptsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingTop: 2,
  },
  quickChip: {
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BeavyRadius.pill,
    borderWidth: 1,
    borderColor: C.rule,
    minHeight: 44,
    justifyContent: 'center',
  },
  quickChipText: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 12,
    color: C.primary,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  busyText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: C.muted,
  },
  bottomBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: C.background,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 14,
    minHeight: 48,
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
  pressed: {
    opacity: 0.72,
  },
});
