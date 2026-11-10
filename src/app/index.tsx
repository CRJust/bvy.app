
import { useTabBar } from '@/context/tab-bar-context';
import { ProductSelector } from '@/components/product-selector';
import type { CatalogProduct } from '@/services/catalog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = {
  background: '#FFF8F1',
  white: '#FFFFFF',
  burgundy: '#481D2D',
  coral: '#EF806B',
  text: '#382B2D',
  muted: '#968A83',
  border: '#E9DED5',
  softCoral: '#F9E9E1',
};

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'beavy';
};

type ShoppingItem = {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
};

const STORAGE_KEY = '@beavy/app-state-v1';

export default function HomeScreen() {
  const { height } = useWindowDimensions();
  const { setIsTabBarHidden } = useTabBar();

  const [conversationOpen, setConversationOpen] = useState(false);
  const [productSelectorOpen, setProductSelectorOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [sending, setSending] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  // Fereastra ocupă 70% din ecran în mod normal.
  // Când apare tastatura, se întinde exact până la marginea ei.
  const sheetHeight = keyboardVisible
    ? Math.max(260, height - keyboardHeight)
    : height * 0.70;

  const translateY = useRef(new Animated.Value(height)).current;
  const dragStartY = useRef(0);

  // Încarcă lista și conversația salvate pe telefon la pornirea ecranului.
  useEffect(() => {
    let isMounted = true;

    const loadSavedState = async () => {
      try {
        const savedState = await AsyncStorage.getItem(STORAGE_KEY);

        if (savedState) {
          const parsed = JSON.parse(savedState) as {
            shoppingItems?: unknown;
            messages?: unknown;
          };

          if (Array.isArray(parsed.shoppingItems)) {
            // Compatibil cu produsele salvate în versiunile anterioare:
            // cantitatea implicită este 1, iar produsul începe nebifat.
            const validItems: ShoppingItem[] = parsed.shoppingItems
              .filter(
                (item) =>
                  typeof item === 'object' &&
                  item !== null &&
                  typeof (item as { id?: unknown }).id === 'string' &&
                  typeof (item as { name?: unknown }).name === 'string'
              )
              .map((item) => {
                const savedItem = item as Partial<ShoppingItem>;
                return {
                  id: savedItem.id as string,
                  name: savedItem.name as string,
                  quantity:
                    typeof savedItem.quantity === 'number' &&
                    Number.isFinite(savedItem.quantity) &&
                    savedItem.quantity >= 1
                      ? Math.floor(savedItem.quantity)
                      : 1,
                  checked: savedItem.checked === true,
                };
              });

            if (isMounted) setShoppingItems(validItems);
          }

          if (Array.isArray(parsed.messages)) {
            const validMessages = parsed.messages.filter(
              (item): item is Message =>
                typeof item === 'object' &&
                item !== null &&
                typeof (item as Message).id === 'string' &&
                typeof (item as Message).text === 'string' &&
                ((item as Message).sender === 'user' ||
                  (item as Message).sender === 'beavy')
            );

            if (isMounted) setMessages(validMessages);
          }
        }
      } catch (error) {
        console.warn('Beavy: nu am putut încărca datele salvate.', error);
      } finally {
        if (isMounted) setStorageReady(true);
      }
    };

    void loadSavedState();

    return () => {
      isMounted = false;
    };
  }, []);

  // Salvează automat lista și conversația după fiecare modificare.
  useEffect(() => {
    if (!storageReady) return;

    const saveState = async () => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ shoppingItems, messages })
        );
      } catch (error) {
        console.warn('Beavy: nu am putut salva datele.', error);
      }
    };

    void saveState();
  }, [shoppingItems, messages, storageReady]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      setKeyboardVisible(true);
    });

    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!conversationOpen) return;

    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 25,
      stiffness: 180,
    }).start();

  }, [keyboardVisible, conversationOpen, sheetHeight, translateY]);

  const openConversation = () => {
    Keyboard.dismiss();
    setIsTabBarHidden(true);
    translateY.setValue(height);
    setConversationOpen(true);

    requestAnimationFrame(() => {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 25,
        stiffness: 180,
      }).start();
    });
  };

  const closeConversation = () => {
    Keyboard.dismiss();

    Animated.timing(translateY, {
      toValue: height,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setConversationOpen(false);
      setKeyboardVisible(false);
      setIsTabBarHidden(false);
    });
  };

  // Swipe vertical pe mâner: tragem suficient în jos pentru a închide.
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        dragStartY.current = 0;
      },
      onPanResponderMove: (_event, gesture) => {
        dragStartY.current = gesture.dy;
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 65 && Math.abs(gesture.dy) > Math.abs(gesture.dx)) {
          closeConversation();
        }
      },
      onPanResponderTerminate: () => {
        dragStartY.current = 0;
      },
    })
  ).current;

  // Normalizează diacriticele pentru verificarea comenzilor.
  const normalizeText = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('ro-RO')
      .trim();

  // Identifică mai întâi intenția mesajului, înainte să caute produse.
  const getMessageIntent = (
    value: string
  ): 'compare' | 'question' | 'add' | 'unknown' => {
    const normalized = normalizeText(value);

    const comparePattern =
      /\b(compara|compar|comparati|pret|preturi|ieftin|ieftine|magazin|magazine|unde gasesc|cauta|cautati|verifica preturile)\b/;

    if (comparePattern.test(normalized)) {
      return 'compare';
    }

    const questionPattern =
      /\b(ce ai|ce este|cum functioneaza|cum pot|arata-mi|arata|afiseaza|sterge|elimina|scoate|cate produse|lista mea|produsele din lista)\b/;

    if (questionPattern.test(normalized) || value.trim().endsWith('?')) {
      return 'question';
    }

    const explicitAddPattern =
      /\b(am nevoie de|vreau sa adaug|vreau|as vrea|adauga|pune|trece|introdu|mai pune|mai adauga)\b/;

    if (explicitAddPattern.test(normalized)) {
      return 'add';
    }

    // Acceptă liste simple: „lapte, pâine și roșii”.
    if (/,|\bsi\b|\bplus\b|\biar\b/.test(normalized)) {
      return 'add';
    }

    // Acceptă nume simple de produse, de exemplu „Pâine”.
    const blockedStandaloneWords = new Set([
      'acum',
      'produse',
      'produs',
      'produsele',
      'produsul',
      'lista',
      'cumparaturi',
      'cumparaturile',
      'compara',
      'comparare',
      'ajutor',
      'buna',
      'salut',
      'multumesc',
    ]);

    const words = normalized.split(/\s+/).filter(Boolean);

    if (
      words.length > 0 &&
      words.length <= 3 &&
      !blockedStandaloneWords.has(normalized) &&
      !/[.!?]/.test(value.trim())
    ) {
      return 'add';
    }

    return 'unknown';
  };

  // Extrage produsele numai dacă mesajul este o comandă de adăugare.
  const extractProducts = (value: string) => {
    let cleaned = value
      .trim()
      .replace(/[.!?]+$/g, '')
      .replace(/^(te rog[, ]*)?/i, '')
      .replace(
        /^(am nevoie de|as vrea|vreau sa adaug|vreau|adauga|pune|trece|introdu|mai pune|mai adauga)(\s+(in|în)\s+(lista|listă)(\s+mea)?)?[\s,:-]*/i,
        ''
      );

    cleaned = cleaned
      .replace(/\s+(și|si)\s+/gi, ',')
      .replace(/\s+(iar|plus)\s+/gi, ',');

    return cleaned
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map(
        (item) =>
          item.charAt(0).toLocaleUpperCase('ro-RO') + item.slice(1)
      );
  };

  const sendMessage = () => {
    const text = message.trim();

    if (!text || sending) return;

    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-user`,
        text,
        sender: 'user',
      },
    ]);

    const intent = getMessageIntent(text);
    let reply = '';

    if (intent === 'compare') {
      reply =
        'Am înțeles: vrei să compari produsele. Compararea prețurilor între magazine nu este încă activă. Nu am adăugat nimic în listă.';
    } else if (intent === 'question') {
      reply =
        shoppingItems.length > 0
          ? `În lista ta ai: ${shoppingItems.map((item) => item.name).join(', ')}.`
          : 'Lista ta este încă goală. Spune-mi ce produse vrei să adaugi.';
    } else if (intent === 'add') {
      const extracted = extractProducts(text);

      const existingNames = new Set(
        shoppingItems.map((item) => normalizeText(item.name))
      );

      const newProducts = extracted.filter((name) => {
        const normalizedName = normalizeText(name);
        if (existingNames.has(normalizedName)) return false;
        existingNames.add(normalizedName);
        return true;
      });

      if (newProducts.length > 0) {
        setShoppingItems((current) => [
          ...current,
          ...newProducts.map((name, index) => ({
            id: `${Date.now()}-${index}`,
            name,
            quantity: 1,
            checked: false,
          })),
        ]);

        reply = `Am adăugat în lista ta: ${newProducts.join(', ')}. Mai ai și alte produse?`;
      } else if (extracted.length > 0) {
        reply = 'Produsele sunt deja în lista ta. Mai ai nevoie de ceva?';
      } else {
        reply =
          'Nu am identificat un produs. Scrie, de exemplu: lapte, pâine și roșii.';
      }
    } else {
      reply =
        'Momentan pot adăuga produse în lista ta. Pentru comparația prețurilor între magazine trebuie să conectăm sursele de date. Nu am modificat lista.';
    }

    setMessage('');
    setSending(true);
    Keyboard.dismiss();

    setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-reply`,
          text: reply,
          sender: 'beavy',
        },
      ]);

      setSending(false);
    }, 350);
  };

  const toggleShoppingItem = (id: string) => {
    setShoppingItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const changeItemQuantity = (id: string, change: number) => {
    setShoppingItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(1, item.quantity + change) }
          : item
      )
    );
  };

  const removeShoppingItem = (id: string) => {
    setShoppingItems((current) => current.filter((item) => item.id !== id));
  };

  const addCatalogProduct = (product: CatalogProduct) => {
    setShoppingItems((current) => {
      const normalizedName = normalizeText(product.canonical_name);
      const existing = current.find(
        (item) => item.id === product.id || normalizeText(item.name) === normalizedName
      );
      if (existing) {
        return current.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...current, {
        id: product.id,
        name: product.canonical_name,
        quantity: 1,
        checked: false,
      }];
    });
  };

  const checkedItemsCount = shoppingItems.filter((item) => item.checked).length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>

        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>
              beavy<Text style={styles.logoDot}>.</Text>
            </Text>
            <Text style={styles.tagline}>
              Cumpărături chibzuite. Fără risipă.
            </Text>
          </View>

          <Pressable style={styles.profileButton}>
            <Text style={styles.profileText}>B</Text>
          </Pressable>
        </View>

        {/* HOME */}
        <ScrollView
          contentContainerStyle={styles.homeContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.eyebrow}>
            BEAVY · CUMPĂRĂTURI INTELIGENTE
          </Text>

          <Text style={styles.heading}>
            Din listă,{'\n'}în coș.
          </Text>

          <Text style={styles.description}>
            Organizează-ți cumpărăturile, descoperă produse
            și găsește variante avantajoase.
          </Text>

          <View style={styles.listCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>
                  Lista mea de cumpărături
                </Text>
                <Text style={styles.cardSubtitle}>
                  Lista ta te așteaptă aici.
                </Text>
              </View>

              <View style={styles.listIcon}>
                <Text style={styles.listIconText}>≡</Text>
              </View>
            </View>

            {shoppingItems.length === 0 ? (
              <View style={styles.emptyList}>
                <Text style={styles.emptyIcon}>🛒</Text>
                <Text style={styles.emptyTitle}>
                  Lista este pregătită
                </Text>
                <Text style={styles.emptyDescription}>
                  Spune-i lui Beavy ce ai nevoie pentru următoarele cumpărături.
                </Text>
              </View>
            ) : (
              <View style={styles.shoppingItems}>
                <Text style={styles.itemsCount}>
                  {shoppingItems.length}{' '}
                  {shoppingItems.length === 1 ? 'produs' : 'produse'}
                  {' · '}
                  {checkedItemsCount} cumpărate
                </Text>

                {shoppingItems.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.shoppingItem,
                      item.checked && styles.shoppingItemChecked,
                    ]}
                  >
                    <Pressable
                      onPress={() => toggleShoppingItem(item.id)}
                      style={[
                        styles.checkbox,
                        item.checked && styles.checkboxChecked,
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: item.checked }}
                      accessibilityLabel={`${item.checked ? 'Marchează ca necumpărat' : 'Marchează ca și cumpărat'}: ${item.name}`}
                    >
                      {item.checked ? (
                        <Text style={styles.checkboxTick}>✓</Text>
                      ) : null}
                    </Pressable>

                    <Text
                      style={[
                        styles.shoppingItemName,
                        item.checked && styles.shoppingItemNameChecked,
                      ]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>

                    <View style={styles.quantityControl}>
                      <Pressable
                        onPress={() => changeItemQuantity(item.id, -1)}
                        disabled={item.quantity <= 1}
                        style={[
                          styles.quantityButton,
                          item.quantity <= 1 && styles.quantityButtonDisabled,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Scade cantitatea pentru ${item.name}`}
                      >
                        <Text style={styles.quantityButtonText}>−</Text>
                      </Pressable>

                      <Text style={styles.quantityValue}>{item.quantity}</Text>

                      <Pressable
                        onPress={() => changeItemQuantity(item.id, 1)}
                        style={styles.quantityButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Mărește cantitatea pentru ${item.name}`}
                      >
                        <Text style={styles.quantityButtonText}>+</Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => removeShoppingItem(item.id)}
                      hitSlop={8}
                      style={styles.removeItemButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Șterge ${item.name}`}
                    >
                      <Text style={styles.removeItemText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              style={styles.listButton}
              onPress={() => setProductSelectorOpen(true)}
            >
              <Text style={styles.listButtonText}>
                Adaugă produse
              </Text>
              <Text style={styles.buttonArrow}>→</Text>
            </Pressable>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>
              Cumpără mai chibzuit.
            </Text>
            <Text style={styles.infoDescription}>
              Compară prețurile magazinelor și descoperă
              unde merită să faci cumpărăturile.
            </Text>
          </View>

          <Text style={styles.footer}>
            Mai puțină risipă. Mai multă grijă.
          </Text>
        </ScrollView>

        <ProductSelector
          visible={productSelectorOpen}
          onClose={() => setProductSelectorOpen(false)}
          onAdd={addCatalogProduct}
        />

        {/* CONVERSATION WINDOW */}
        {conversationOpen && (
          <View style={styles.overlay}>

            <Pressable
              style={styles.backdrop}
              onPress={closeConversation}
            />

            <Animated.View
              style={[
                styles.sheet,
                {
                  height: sheetHeight,
                  bottom: keyboardVisible ? keyboardHeight : 0,
                  transform: [{ translateY }],
                },
              ]}
            >
              <View style={styles.sheetInner}>
                {/* DRAG HANDLE */}
                <View
                  style={styles.handleArea}
                  {...handlePanResponder.panHandlers}
                >
                  <View style={styles.handle} />
                </View>

                {/* WINDOW HEADER */}
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetLogo}>
                      beavy<Text style={styles.logoDot}>.</Text>
                    </Text>
                    <Text style={styles.sheetSubtitle}>
                      Din listă în coș.
                    </Text>
                  </View>

                  <Pressable
                    onPress={closeConversation}
                    style={styles.closeButton}
                  >
                    <Text style={styles.closeButtonText}>×</Text>
                  </Pressable>
                </View>

                <View style={styles.sheetDivider} />

                {/* MESSAGES */}
                <ScrollView
                  style={styles.messagesContainer}
                  contentContainerStyle={styles.messagesContent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  onScrollBeginDrag={() => {
                    if (keyboardVisible) Keyboard.dismiss();
                  }}
                  showsVerticalScrollIndicator={false}
                >
                  {messages.length === 0 ? (
                    <View style={styles.welcome}>
                      <Text style={styles.welcomeEyebrow}>
                        SUNT AICI SĂ TE AJUT
                      </Text>

                      <Text style={styles.welcomeTitle}>
                        Cu ce începem?
                      </Text>

                      <Text style={styles.welcomeDescription}>
                        Spune-mi ce produse ai nevoie.
                        Le organizăm împreună în lista ta de cumpărături.
                      </Text>

                      <View style={styles.exampleCard}>
                        <Text style={styles.exampleLabel}>
                          DE EXEMPLU
                        </Text>
                        <Text style={styles.exampleText}>
                          „Am nevoie de lapte, pâine integrală
                          și roșii pentru salată.”
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.messages}>
                      {messages.map((item) => (
                        <View
                          key={item.id}
                          style={[
                            styles.messageRow,
                            item.sender === 'user'
                              ? styles.userRow
                              : styles.beavyRow,
                          ]}
                        >
                          {item.sender === 'beavy' && (
                            <View style={styles.avatar}>
                              <Text style={styles.avatarText}>b.</Text>
                            </View>
                          )}

                          <View
                            style={[
                              styles.bubble,
                              item.sender === 'user'
                                ? styles.userBubble
                                : styles.beavyBubble,
                            ]}
                          >
                            <Text
                              style={[
                                styles.messageText,
                                item.sender === 'user'
                                  ? styles.userText
                                  : styles.beavyText,
                              ]}
                            >
                              {item.text}
                            </Text>
                          </View>
                        </View>
                      ))}

                      {sending && (
                        <Text style={styles.typing}>
                          Beavy pregătește un răspuns...
                        </Text>
                      )}
                    </View>
                  )}
                </ScrollView>

                {/* INPUT */}
                <View style={styles.composerContainer}>
                  <View style={styles.composer}>
                    <TextInput
                      value={message}
                      onChangeText={setMessage}
                      placeholder="Scrie aici ce ai nevoie..."
                      placeholderTextColor={C.muted}
                      style={styles.input}
                      multiline
                      maxLength={1000}
                      returnKeyType="send"
                      blurOnSubmit={false}
                      onSubmitEditing={sendMessage}
                    />

                    <Pressable
                      style={[
                        styles.sendButton,
                        !message.trim() && styles.sendDisabled,
                      ]}
                      disabled={!message.trim() || sending}
                      onPress={sendMessage}
                    >
                      <Text style={styles.sendText}>↑</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Animated.View>
          </View>
        )}
      </View>
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
    width: '100%',
    maxWidth: 650,
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.8,
    color: C.burgundy,
  },
  logoDot: {
    color: C.coral,
  },
  tagline: {
    fontSize: 10,
    color: C.muted,
    marginTop: -3,
  },
  profileButton: {
    width: 42,
    height: 42,
    borderRadius: 22,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    color: C.white,
    fontSize: 17,
    fontWeight: '900',
  },
  homeContent: {
    padding: 23,
    paddingBottom: 35,
  },
  eyebrow: {
    color: C.coral,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 25,
    marginBottom: 13,
  },
  heading: {
    color: C.burgundy,
    fontSize: 40,
    lineHeight: 45,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  description: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 13,
    marginBottom: 27,
  },
  listCard: {
    backgroundColor: C.white,
    borderRadius: 21,
    padding: 19,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: C.burgundy,
    fontSize: 17,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: C.muted,
    fontSize: 11,
    marginTop: 5,
  },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.softCoral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listIconText: {
    color: C.burgundy,
    fontSize: 27,
    fontWeight: '800',
  },
  emptyList: {
    alignItems: 'center',
    paddingVertical: 26,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  emptyTitle: {
    color: C.burgundy,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyDescription: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 245,
  },
  shoppingItems: {
    marginTop: 18,
    marginBottom: 16,
    gap: 8,
  },

  itemsCount: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },

  shoppingItem: {
    minHeight: 50,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 11,
    backgroundColor: C.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  shoppingItemChecked: {
    backgroundColor: '#F2EAE4',
  },

  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#C8B8AE',
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  checkboxChecked: {
    backgroundColor: C.burgundy,
    borderColor: C.burgundy,
  },

  checkboxTick: {
    color: C.white,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
  },

  shoppingItemName: {
    color: C.burgundy,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },

  shoppingItemNameChecked: {
    color: C.muted,
    textDecorationLine: 'line-through',
  },

  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 3,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: C.white,
  },

  quantityButton: {
    width: 24,
    height: 26,
    borderRadius: 7,
    backgroundColor: C.softCoral,
    alignItems: 'center',
    justifyContent: 'center',
  },

  quantityButtonDisabled: {
    opacity: 0.4,
  },

  quantityButtonText: {
    color: C.burgundy,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
  },

  quantityValue: {
    color: C.burgundy,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 13,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  removeItemButton: {
    width: 25,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.softCoral,
    alignItems: 'center',
    justifyContent: 'center',
  },

  removeItemText: {
    color: C.burgundy,
    fontSize: 20,
    lineHeight: 23,
  },

  listButton: {
    backgroundColor: C.burgundy,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listButtonText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
  },
  buttonArrow: {
    color: C.white,
    fontSize: 20,
  },
  infoCard: {
    marginTop: 19,
    backgroundColor: C.softCoral,
    padding: 19,
    borderRadius: 18,
  },
  infoTitle: {
    color: C.burgundy,
    fontSize: 17,
    fontWeight: '900',
  },
  infoDescription: {
    color: C.text,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
  footer: {
    color: C.muted,
    textAlign: 'center',
    fontSize: 10,
    marginTop: 30,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(48, 25, 32, 0.32)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -5 },
    elevation: 15,
  },
  sheetInner: {
    flex: 1,
  },
  handleArea: {
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: '#D8CAC0',
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingBottom: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetLogo: {
    color: C.burgundy,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -1,
  },
  sheetSubtitle: {
    color: C.muted,
    fontSize: 9,
    marginTop: -2,
  },
  closeButton: {
    width: 35,
    height: 35,
    backgroundColor: C.softCoral,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: C.burgundy,
    fontSize: 23,
    lineHeight: 26,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: C.border,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: 19,
    paddingVertical: 22,
  },
  welcome: {
    flex: 1,
  },
  welcomeEyebrow: {
    color: C.coral,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  welcomeTitle: {
    color: C.burgundy,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  welcomeDescription: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
  },
  exampleCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 15,
    marginTop: 23,
    borderWidth: 1,
    borderColor: C.border,
  },
  exampleLabel: {
    color: C.coral,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  exampleText: {
    color: C.burgundy,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  messages: {
    gap: 17,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  beavyRow: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: C.white,
    fontWeight: '900',
    fontSize: 11,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  userBubble: {
    backgroundColor: C.burgundy,
    borderBottomRightRadius: 4,
  },
  beavyBubble: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 19,
  },
  userText: {
    color: C.white,
  },
  beavyText: {
    color: C.text,
  },
  typing: {
    color: C.muted,
    fontSize: 11,
    fontStyle: 'italic',
    marginLeft: 35,
  },
  composerContainer: {
    paddingHorizontal: 15,
    paddingTop: 11,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.background,
  },
  composer: {
    backgroundColor: C.white,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 51,
    maxHeight: 105,
    paddingLeft: 13,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 13,
    paddingVertical: 12,
    maxHeight: 85,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  sendDisabled: {
    backgroundColor: '#B8A8A5',
  },
  sendText: {
    color: C.white,
    fontSize: 23,
    fontWeight: '800',
  },
});
