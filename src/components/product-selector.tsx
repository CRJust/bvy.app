
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  CatalogProduct,
  searchCatalogProducts,
} from '@/services/catalog';

const C = {
  background: '#F4F3EF',
  white: '#FFFFFF',
  burgundy: '#481D2D',
  coral: '#EF806B',
  text: '#382B2D',
  muted: '#968A83',
  border: '#EAE5DF',
  softCoral: '#F9E9E1',
  green: '#239B79',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (product: CatalogProduct) => void;
};

export function ProductSelector({ visible, onClose, onAdd }: Props) {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const inputRef = useRef<TextInput>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!visible) return;

    const term = search.trim();

    if (term.length < 2) {
      requestId.current += 1;
      setProducts([]);
      setError('');
      setLoading(false);
      return;
    }

    const currentRequest = ++requestId.current;
    let canceled = false;

    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');

      try {
        const results = await searchCatalogProducts(term, 30);

        if (!canceled && currentRequest === requestId.current) {
          setProducts(results);
        }
      } catch (err) {
        if (!canceled && currentRequest === requestId.current) {
          setProducts([]);
          setError(
            err instanceof Error
              ? err.message
              : 'Nu am putut căuta produsele.'
          );
        }
      } finally {
        if (!canceled && currentRequest === requestId.current) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [search, visible]);

  const close = () => {
    requestId.current += 1;
    Keyboard.dismiss();
    setSearch('');
    setProducts([]);
    setError('');
    setLoading(false);
    setQuantities({});
    onClose();
  };

  const clearSearch = () => {
    setSearch('');
    setProducts([]);
    setError('');
    setLoading(false);
    inputRef.current?.focus();
  };

  const addProduct = (product: CatalogProduct) => {
    onAdd(product);

    setQuantities((current) => ({
      ...current,
      [product.id]: (current[product.id] || 0) + 1,
    }));
  };

  const formatSize = (product: CatalogProduct) =>
    product.package_size ||
    (product.quantity_value && product.quantity_unit
      ? `${product.quantity_value} ${product.quantity_unit}`
      : '');

  const leftColumn = products.filter((_, index) => index % 2 === 0);
  const rightColumn = products.filter((_, index) => index % 2 === 1);

  const renderProduct = (product: CatalogProduct, index: number) => {
    const quantity = quantities[product.id] || 0;
    const size = formatSize(product);

    return (
      <View key={product.id} style={styles.productCard}>
        <View
          style={[
            styles.imageContainer,
            index % 3 === 0
              ? styles.imageTall
              : index % 3 === 1
                ? styles.imageMedium
                : styles.imageShort,
          ]}
        >
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url }}
              style={styles.productImage}
              contentFit="contain"
              transition={200}
            />
          ) : (
            <View style={styles.imageFallback}>
              <Text style={styles.fallbackEmoji}>🥬</Text>
            </View>
          )}

          <Pressable
            onPress={() => addProduct(product)}
            style={[
              styles.addButton,
              quantity > 0 && styles.addedButton,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Adaugă ${product.canonical_name}`}
          >
            <Text
              style={[
                styles.addButtonText,
                quantity > 0 && styles.addedButtonText,
              ]}
            >
              {quantity > 0 ? `+${quantity}` : '+'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.productInfo}>
          {!!product.brand && (
            <Text numberOfLines={1} style={styles.productBrand}>
              {product.brand}
            </Text>
          )}

          <Text numberOfLines={3} style={styles.productName}>
            {product.canonical_name}
          </Text>

          {!!size && (
            <Text style={styles.productSize}>{size}</Text>
          )}

          {quantity > 0 && (
            <View style={styles.addedLabel}>
              <Text style={styles.addedLabelText}>
                Adăugat în listă
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const hasSearch = search.trim().length >= 2;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>b.</Text>
            </View>

            <Text style={styles.headerLabel}>LISTA MEA</Text>

            <Pressable
              onPress={close}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Închide"
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>Ce punem în coș?</Text>
          <Text style={styles.subtitle}>
            Caută produsele de care ai nevoie.
          </Text>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            ref={inputRef}
            value={search}
            onChangeText={setSearch}
            placeholder="Caută lapte, roșii, pâine..."
            placeholderTextColor={C.muted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Caută produse"
          />

          {!!search && (
            <Pressable onPress={clearSearch} style={styles.clearButton}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.resultsHeading}>
          {hasSearch ? (
            <Text style={styles.resultsTitle}>
              {loading ? 'Căutăm...' : 'Produse găsite'}
            </Text>
          ) : (
            <Text style={styles.resultsHint}>
              Sugestiile tale vor apărea aici.
            </Text>
          )}

          {hasSearch && !loading && products.length > 0 && (
            <Text style={styles.resultsCount}>
              {products.length}
            </Text>
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.gridContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!hasSearch && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🛒</Text>
              <Text style={styles.emptyTitle}>
                Începem lista?
              </Text>
              <Text style={styles.emptyText}>
                Scrie un produs în căutare și descoperă sugestiile Beavy.
              </Text>
            </View>
          )}

          {hasSearch && loading && products.length === 0 && (
            <View style={styles.stateContainer}>
              <ActivityIndicator color={C.coral} size="large" />
              <Text style={styles.stateText}>
                Căutăm în catalogul Beavy...
              </Text>
            </View>
          )}

          {!!error && (
            <View style={styles.messageCard}>
              <Text style={styles.messageTitle}>
                Căutarea nu a reușit
              </Text>
              <Text style={styles.stateText}>{error}</Text>
            </View>
          )}

          {hasSearch && !loading && !error && products.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🔎</Text>
              <Text style={styles.emptyTitle}>
                Nu am găsit produsul
              </Text>
              <Text style={styles.emptyText}>
                Încearcă o denumire mai scurtă sau alt termen.
              </Text>
            </View>
          )}

          {products.length > 0 && (
            <View style={styles.masonry}>
              <View style={styles.column}>
                {leftColumn.map((product, index) =>
                  renderProduct(product, index * 2)
                )}
              </View>

              <View style={[styles.column, styles.rightColumn]}>
                {rightColumn.map((product, index) =>
                  renderProduct(product, index * 2 + 1)
                )}
              </View>
            </View>
          )}

          {hasSearch && products.length > 0 && !loading && (
            <Text style={styles.footerHint}>
              Mai caută ceva și completează-ți lista.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 17,
  },

  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 23,
  },

  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: C.white,
    fontSize: 18,
    fontWeight: '900',
  },

  headerLabel: {
    marginLeft: 10,
    flex: 1,
    color: C.muted,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '900',
  },

  closeButton: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    color: C.burgundy,
    fontSize: 25,
    lineHeight: 29,
    marginTop: -2,
  },

  title: {
    color: C.burgundy,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
  },

  subtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 5,
  },

  searchBox: {
    marginHorizontal: 18,
    height: 53,
    borderRadius: 17,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    shadowColor: C.burgundy,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.055,
    shadowRadius: 12,
    elevation: 3,
  },

  searchIcon: {
    color: C.coral,
    fontSize: 26,
    marginRight: 9,
  },

  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    paddingVertical: 0,
  },

  clearButton: {
    width: 30,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  clearText: {
    color: C.muted,
    fontSize: 23,
  },

  resultsHeading: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  resultsTitle: {
    color: C.burgundy,
    fontSize: 13,
    fontWeight: '900',
  },

  resultsHint: {
    color: C.muted,
    fontSize: 11,
  },

  resultsCount: {
    color: C.coral,
    fontSize: 12,
    fontWeight: '900',
  },

  scroll: {
    flex: 1,
  },

  gridContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  masonry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  column: {
    flex: 1,
    gap: 13,
  },

  rightColumn: {
    paddingTop: 28,
  },

  productCard: {
    backgroundColor: C.white,
    borderRadius: 17,
    overflow: 'hidden',
    shadowColor: C.burgundy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.055,
    shadowRadius: 10,
    elevation: 2,
  },

  imageContainer: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#F0EFEA',
    justifyContent: 'center',
    alignItems: 'center',
  },

  imageTall: {
    height: 175,
  },

  imageMedium: {
    height: 145,
  },

  imageShort: {
    height: 120,
  },

  productImage: {
    width: '100%',
    height: '100%',
  },

  imageFallback: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F0E9',
  },

  fallbackEmoji: {
    fontSize: 43,
  },

  addButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },

  addButtonText: {
    color: C.burgundy,
    fontSize: 23,
    fontWeight: '500',
    lineHeight: 27,
  },

  addedButton: {
    backgroundColor: C.green,
  },

  addedButtonText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '900',
  },

  productInfo: {
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 13,
    gap: 4,
  },

  productBrand: {
    color: C.coral,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  productName: {
    color: C.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },

  productSize: {
    color: C.muted,
    fontSize: 10,
    marginTop: 1,
  },

  addedLabel: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5F3ED',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginTop: 4,
  },

  addedLabelText: {
    color: C.green,
    fontSize: 9,
    fontWeight: '900',
  },

  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingTop: 65,
    gap: 10,
  },

  emptyEmoji: {
    fontSize: 45,
    marginBottom: 5,
  },

  emptyTitle: {
    color: C.burgundy,
    fontSize: 18,
    fontWeight: '900',
  },

  emptyText: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 270,
  },

  stateContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },

  stateText: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },

  messageCard: {
    backgroundColor: C.white,
    padding: 18,
    borderRadius: 16,
    gap: 8,
  },

  messageTitle: {
    color: C.burgundy,
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
  },

  footerHint: {
    textAlign: 'center',
    color: C.muted,
    fontSize: 11,
    paddingTop: 20,
  },
});
