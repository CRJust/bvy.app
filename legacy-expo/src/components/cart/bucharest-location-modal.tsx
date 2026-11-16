import { SymbolView } from 'expo-symbols';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import { BUCHAREST_SECTORS } from '@/constants/bucharest-sectors';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';

const SECTOR_STORES: Record<number, string> = {
  1: 'Kaufland Barbu Văcărescu · Penny Pajura · Profi Deli Centru',
  2: 'Kaufland Popa Nan · Penny Colentina · Profi Doamna Ghica',
  3: 'Kaufland Vitan · Penny Decebal & Titan · Profi Steriadi',
  4: 'Kaufland Berceni · Penny Giurgiului · Profi Apărătorii Patriei',
  5: 'Kaufland Rahova / Sebastian · Penny Năsăud · Profi Ferentari',
  6: 'Kaufland Tudor Vladimirescu · Penny Timișoara · Profi Ghencea',
};

type BucharestLocationModalProps = {
  visible: boolean;
  onClose: () => void;
  selectedSector: number | null | undefined;
  onSelectSector: (sector: 1 | 2 | 3 | 4 | 5 | 6 | null) => void;
};

export function BucharestLocationModal({
  visible,
  onClose,
  selectedSector,
  onSelectSector,
}: BucharestLocationModalProps) {
  return (
    <BeavySheetModal visible={visible} onClose={onClose} maxHeightRatio="85%">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.iconCircle}>
              <SymbolView
                name="mappin.and.ellipse"
                tintColor={C.strawberry}
                size={18}
                fallback={<Text style={styles.fallbackIcon}>📍</Text>}
              />
            </View>
            <View style={styles.titleCol}>
              <Text style={styles.title}>Alege zona din București</Text>
              <Text style={styles.subtitle}>
                Optimizat pentru hipermarketurile și depozitele locale
              </Text>
            </View>
          </View>
        </View>

        {/* Verified Price Guarantee Banner */}
        <View style={styles.guaranteeBanner}>
          <View style={styles.guaranteeIconWrap}>
            <SymbolView
              name="checkmark.seal.fill"
              tintColor={C.primary}
              size={16}
              fallback={<Text style={styles.guaranteeFallbackIcon}>✓</Text>}
            />
          </View>
          <View style={styles.guaranteeContent}>
            <Text style={styles.guaranteeTitle}>Prețuri 100% ca la raft garantate</Text>
            <Text style={styles.guaranteeText}>
              Prețurile Kaufland afișate prin Wolt Assortment sunt identice cu cele de la casa de marcat din magazin, verificate cu Monitorul Prețurilor.
            </Text>
          </View>
        </View>

        {/* Sectors List */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Option: Toată Capitala */}
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              onSelectSector(null);
              onClose();
            }}
            style={({ pressed }) => [
              styles.sectorCard,
              selectedSector === null && styles.sectorCardSelected,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Toată Capitala, toate hipermarketurile și depozitele"
          >
            <View style={styles.sectorCardHeader}>
              <View style={styles.sectorTitleRow}>
                <Text style={styles.sectorName}>Toată Capitala</Text>
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedBadgeText}>Recomandat</Text>
                </View>
              </View>
              <View
                style={[
                  styles.radioOuter,
                  selectedSector === null && styles.radioOuterSelected,
                ]}
              >
                {selectedSector === null && <View style={styles.radioInner} />}
              </View>
            </View>
            <Text style={styles.sectorDescription}>
              Compară peste 50 de magazine Kaufland, Carrefour, Penny, Profi, Mega Image, Auchan, Sezamo și Freshful din București & Ilfov.
            </Text>
          </Pressable>

          {/* Sector 1 to 6 */}
          {BUCHAREST_SECTORS.map((sec) => {
            const isSelected = selectedSector === sec.sector;
            const storesText = SECTOR_STORES[sec.sector];

            return (
              <Pressable
                key={sec.sector}
                onPress={() => {
                  triggerHaptic('selection');
                  onSelectSector(sec.sector);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.sectorCard,
                  isSelected && styles.sectorCardSelected,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${sec.name}, ${sec.description}`}
              >
                <View style={styles.sectorCardHeader}>
                  <Text style={styles.sectorName}>{sec.name}</Text>
                  <View
                    style={[
                      styles.radioOuter,
                      isSelected && styles.radioOuterSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </View>

                <Text style={styles.sectorNeighborhoods}>
                  {sec.neighborhoods.slice(0, 5).join(' · ')}
                </Text>

                {storesText ? (
                  <View style={styles.storeBadgeRow}>
                    <SymbolView
                      name="cart.fill"
                      tintColor={C.muted}
                      size={11}
                      fallback={<Text style={styles.cartFallbackIcon}>🛒</Text>}
                    />
                    <Text style={styles.storeBadgeText} numberOfLines={1}>
                      {storesText}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    flex: 1,
  },
  header: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.grapefruit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    fontSize: 18,
  },
  titleCol: {
    flex: 1,
  },
  title: {
    fontFamily: BeavyFonts.bold,
    fontSize: 18,
    color: C.cherry,
    lineHeight: 22,
  },
  subtitle: {
    fontFamily: BeavyFonts.regular,
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
  },
  guaranteeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.md,
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },
  guaranteeIconWrap: {
    marginTop: 1,
  },
  guaranteeFallbackIcon: {
    color: C.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  guaranteeContent: {
    flex: 1,
  },
  guaranteeTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.cherry,
    lineHeight: 17,
  },
  guaranteeText: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11.5,
    color: C.cherry,
    opacity: 0.85,
    marginTop: 2,
    lineHeight: 15,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 16,
  },
  sectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BeavyRadius.md,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.rule,
    minHeight: 56,
  },
  sectorCardSelected: {
    borderColor: C.strawberry,
    backgroundColor: '#FFFBF8',
  },
  pressed: {
    opacity: 0.88,
  },
  sectorCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectorName: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 15,
    color: C.cherry,
  },
  recommendedBadge: {
    backgroundColor: C.leek,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BeavyRadius.pill,
  },
  recommendedBadgeText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 10.5,
    color: C.primary,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: C.strawberry,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.strawberry,
  },
  sectorDescription: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12,
    color: C.muted,
    lineHeight: 16,
  },
  sectorNeighborhoods: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12,
    color: C.muted,
    lineHeight: 16,
    marginBottom: 6,
  },
  storeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.buttermilk,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BeavyRadius.sm,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  cartFallbackIcon: {
    fontSize: 10,
  },
  storeBadgeText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
    flexShrink: 1,
  },
});
