import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ProductImageBox } from '@/components/product-image-box';
import { BeavyColors as C, BeavyFonts, triggerHaptic } from '@/constants/theme';
import type { ShoppingItem, ShoppingList } from '@/context/shopping-context';

type ShoppingListsCarouselProps = {
  lists: ShoppingList[];
  activeListId: string;
  canonicalImagesByProductId?: Record<string, string | null>;
  onSelectList: (listId: string) => void;
  onPressCreate: () => void;
  onLongPressList?: (listId: string, listName: string) => void;
};

/**
 * Secțiunea „Listele de cumpărături”:
 * - Nu se afișează când nu există liste (rămâne un singur empty state clar în ecran).
 * - Când există o singură listă, folosește un card orizontal compact pe toată lățimea cu max. 4 miniaturi + indicator +N.
 * - Când există mai multe liste, afișează un carusel orizontal compact + o singură acțiune de creare.
 */
export function ShoppingListsCarousel({
  lists,
  activeListId,
  canonicalImagesByProductId,
  onSelectList,
  onPressCreate,
  onLongPressList,
}: ShoppingListsCarouselProps) {
  if (lists.length === 0) {
    return null;
  }

  const resolveItemImage = (item: ShoppingItem): string | null => {
    if (
      item.productId &&
      canonicalImagesByProductId &&
      Object.prototype.hasOwnProperty.call(canonicalImagesByProductId, item.productId)
    ) {
      return canonicalImagesByProductId[item.productId] ?? item.imageUrl ?? null;
    }
    return item.imageUrl ?? null;
  };

  const renderCollage = (l: ShoppingList) => {
    const pendingItems = l.items.filter((it) => !it.checked);
    const previewSource = pendingItems.length > 0 ? pendingItems : l.items;
    const previewItems = previewSource.slice(0, 4);
    const extraCount = previewSource.length > 4 ? previewSource.length - 4 : 0;

    if (l.items.length === 0) {
      return (
        <View style={styles.emptyCollage}>
          <SymbolView
            name="basket"
            tintColor={C.muted}
            size={24}
            fallback={<Text style={styles.fallbackSymbol}>—</Text>}
          />
          <Text style={styles.emptyCollageText}>Listă goală</Text>
        </View>
      );
    }

    const renderCell = (idx: number) => {
      const item = previewItems[idx];
      if (!item) {
        return <View style={styles.collageEmptySlot} />;
      }
      const uri = resolveItemImage(item);
      if (uri) {
        return <Image source={{ uri }} style={styles.collageImage} contentFit="contain" />;
      }
      return <View style={styles.collageFallbackDot} />;
    };

    return (
      <View style={styles.collageGrid}>
        <View style={styles.collageRow}>
          <View style={styles.collageCell}>{renderCell(0)}</View>
          <View style={styles.collageCell}>{renderCell(1)}</View>
        </View>
        <View style={styles.collageRow}>
          <View style={styles.collageCell}>{renderCell(2)}</View>
          <View style={styles.collageCell}>{renderCell(3)}</View>
        </View>
        {extraCount > 0 && (
          <View style={styles.collageMorePill} accessibilityLabel={`Încă ${extraCount} produse`}>
            <Text style={styles.collageMoreText}>+{extraCount}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderCarouselCard = (l: ShoppingList) => {
    const isCurrent = l.id === activeListId;
    return (
      <View key={l.id} style={styles.cardWrapper}>
        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            onSelectList(l.id);
          }}
          onLongPress={() => {
            if (onLongPressList) {
              onLongPressList(l.id, l.name);
            }
          }}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.listCard,
            isCurrent && styles.listCardActive,
            pressed && styles.cardPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Selectează lista ${l.name}`}
        >
          {isCurrent && (
            <View style={styles.activePillBadge}>
              <View style={styles.activePillDot} />
              <Text style={styles.activePillText}>Activă</Text>
            </View>
          )}
          {renderCollage(l)}
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            onSelectList(l.id);
          }}
          style={styles.cardLabelWrap}
        >
          <Text numberOfLines={1} style={styles.cardTitle}>
            {l.name}
          </Text>
          <Text numberOfLines={1} style={styles.cardSubtitle}>
            {(() => {
              const pending = l.items.filter((it) => !it.checked);
              const purchased = l.items.length - pending.length;
              if (l.items.length === 0) return 'Niciun produs';
              if (pending.length === 0) return `${purchased} achiz.`;
              return `${pending.length} ${pending.length === 1 ? 'produs' : 'produse'}`;
            })()}
          </Text>
        </Pressable>
      </View>
    );
  };

  const singleList = lists.length === 1 ? lists[0] : null;
  const singleIsActive = singleList ? singleList.id === activeListId : false;
  const singlePendingItems = singleList ? singleList.items.filter((it) => !it.checked) : [];
  const singlePurchasedItems = singleList ? singleList.items.filter((it) => it.checked) : [];
  const singlePreviewSource =
    singlePendingItems.length > 0 ? singlePendingItems : singlePurchasedItems;
  const singlePreviewItems = singlePreviewSource.slice(0, 4);
  const singleExtraCount =
    singlePreviewSource.length > 4 ? singlePreviewSource.length - 4 : 0;
  const singlePendingUnits = singlePendingItems.reduce(
    (acc, it) => acc + (it.quantity || 1),
    0
  );

  return (
    <View style={styles.container}>
      {/* Antet compact cu o singură acțiune distinctă de creare */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={singleList ? styles.singleHeading : styles.heading}>
            {singleList ? 'LISTA ACTIVĂ' : 'Listele de cumpărături'}
          </Text>

          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              onPressCreate();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.createHeaderBtn, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel="Creează o nouă listă de cumpărături"
          >
            <Text style={styles.createHeaderBtnPlus}>+</Text>
            <Text style={styles.createHeaderBtnText}>Listă nouă</Text>
          </Pressable>
        </View>
      </View>

      {singleList ? (
        <View style={styles.singleCardWrap}>
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              onSelectList(singleList.id);
            }}
            onLongPress={() => {
              if (onLongPressList) {
                onLongPressList(singleList.id, singleList.name);
              }
            }}
            delayLongPress={350}
            style={({ pressed }) => [
              styles.singleListCard,
              singleIsActive && styles.singleListCardActive,
              pressed && styles.cardPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Lista activă ${singleList.name}`}
          >
            <View style={styles.singleLeftCol}>
              <View style={styles.singleTitleRow}>
                <Text numberOfLines={1} style={styles.singleListTitle}>
                  {singleList.name}
                </Text>
                {singleIsActive && (
                  <View style={styles.singleActiveBadge}>
                    <View style={styles.activePillDot} />
                    <Text style={styles.activePillText}>Activă</Text>
                  </View>
                )}
              </View>

              <Text numberOfLines={1} style={styles.singleListSubtitle}>
                {singleList.items.length === 0
                  ? 'Niciun produs adăugat'
                  : singlePendingItems.length === 0
                  ? `${singlePurchasedItems.length} ${
                      singlePurchasedItems.length === 1 ? 'achiziționat' : 'achiziționate'
                    }`
                  : `${singlePendingItems.length} ${
                      singlePendingItems.length === 1 ? 'produs' : 'produse'
                    }${
                      singlePendingUnits !== singlePendingItems.length
                        ? ` · ${singlePendingUnits} buc.`
                        : ''
                    }${
                      singlePurchasedItems.length > 0
                        ? ` · ${singlePurchasedItems.length} achiz.`
                        : ''
                    }`}
              </Text>
            </View>

            <View style={styles.singleRightCol}>
              {singleList.items.length === 0 ? (
                <View style={styles.singleEmptyIconBox}>
                  <SymbolView
                    name="basket"
                    tintColor={C.muted}
                    size={14}
                    fallback={<Text style={styles.fallbackSymbol}>—</Text>}
                  />
                </View>
              ) : (
                <View style={styles.singlePreviewThumbs}>
                  {singlePreviewItems.map((it) => (
                    <ProductImageBox
                      key={it.id}
                      imageUrl={resolveItemImage(it)}
                      productName={it.name}
                      brand={it.brand}
                      variant="thumb"
                      style={styles.singlePreviewThumb}
                    />
                  ))}
                  {singleExtraCount > 0 && (
                    <View
                      style={styles.singleMorePill}
                      accessibilityLabel={`Încă ${singleExtraCount} produse în listă`}
                    >
                      <Text style={styles.singleMoreText}>+{singleExtraCount}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          horizontal
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselScroll}
        >
          {lists.map(renderCarouselCard)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 5,
  },
  header: {
    paddingHorizontal: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  singleHeading: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 14,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heading: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 15,
    color: C.cherry,
    letterSpacing: -0.3,
  },
  createHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.grapefruit,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: C.paperRule,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  createHeaderBtnPlus: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13.5,
    lineHeight: 14,
    color: C.cherry,
  },
  createHeaderBtnText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 11,
    color: C.cherry,
  },
  fallbackSymbol: {
    fontSize: 12,
    color: C.muted,
  },

  // CARD COMPACT PENTRU O SINGURĂ LISTĂ
  singleCardWrap: {
    paddingHorizontal: 16,
  },
  singleListCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 52,
    backgroundColor: C.white,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: C.rule,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  singleListCardActive: {
    borderColor: C.cherry,
    borderWidth: 1.5,
  },
  singleLeftCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  singleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  singleListTitle: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13.5,
    lineHeight: 17,
    color: C.cherry,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  singleListSubtitle: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    lineHeight: 15,
    color: C.muted,
  },
  singleRightCol: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleEmptyIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.buttermilk,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singlePreviewThumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  singlePreviewThumb: {
    width: 22,
    height: 22,
    borderRadius: 6,
    padding: 2,
  },
  singleMorePill: {
    minWidth: 22,
    height: 22,
    borderRadius: 6,
    paddingHorizontal: 5,
    backgroundColor: C.grapefruit,
    borderWidth: 1,
    borderColor: C.paperRule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleMoreText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 9.5,
    color: C.cherry,
  },
  singleActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: C.leek,
    borderRadius: 99,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },

  // CAROUSEL MULTI-LISTĂ COMPACT
  carouselScroll: {
    paddingHorizontal: 16,
    paddingRight: 28,
    gap: 10,
  },
  cardWrapper: {
    width: 108,
    gap: 3,
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  listCard: {
    width: 108,
    height: 86,
    backgroundColor: C.white,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: C.rule,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  listCardActive: {
    borderColor: C.cherry,
    borderWidth: 2,
    backgroundColor: C.white,
  },
  activePillBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: C.leek,
    borderRadius: 99,
    paddingHorizontal: 5.5,
    paddingVertical: 1.5,
  },
  activePillDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: C.cherry,
  },
  activePillText: {
    fontSize: 9,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.cherry,
  },

  // COLAJ 2x2
  collageGrid: {
    width: 68,
    height: 68,
    gap: 3.5,
    justifyContent: 'center',
    position: 'relative',
  },
  collageRow: {
    flexDirection: 'row',
    gap: 3.5,
    flex: 1,
  },
  collageCell: {
    flex: 1,
    backgroundColor: C.buttermilk,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  collageImage: {
    width: '84%',
    height: '84%',
  },
  collageEmptySlot: {
    width: '100%',
    height: '100%',
    backgroundColor: C.buttermilk,
  },
  collageFallbackDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.rule,
  },
  collageMorePill: {
    position: 'absolute',
    right: -4,
    bottom: -3,
    backgroundColor: C.grapefruit,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.paperRule,
    paddingHorizontal: 4.5,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collageMoreText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 9,
    color: C.cherry,
  },
  emptyCollage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyCollageText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 10.5,
    color: C.muted,
  },

  // ETICHETE SUB CARD CAROUSEL
  cardLabelWrap: {
    gap: 1,
    paddingHorizontal: 2,
  },
  cardTitle: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: C.cherry,
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontFamily: BeavyFonts.regular,
    fontSize: 10.5,
    color: C.muted,
  },
});
