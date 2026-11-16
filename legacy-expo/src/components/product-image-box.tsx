import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { BeavyColors as C, BeavyFonts } from '@/constants/theme';
import {
  getProductMonogram,
  resolveProductImageUrl,
  resolveProductPlaceholderSymbol,
} from '@/services/beavy-catalog-search';

type ProductImageBoxProps = {
  imageUrl?: string | null;
  productName: string;
  brand?: string | null;
  categoryName?: string | null;
  familyName?: string | null;
  variant?: 'card' | 'medium' | 'thumb';
  style?: ViewStyle;
};

/**
 * Placeholder grafic discret în stilul Beavy pentru cardurile fără fotografie asociată.
 * Evită afișarea de inițiale izolate („BA”) pe web/Android, păstrând identitatea cămării.
 */
function BeavyCardPlaceholderGlyph() {
  return (
    <View style={styles.pantryGlyphWrap}>
      <View style={styles.pantryGlyphCap} />
      <View style={styles.pantryGlyphBody}>
        <View style={styles.pantryGlyphLabelLine} />
        <View style={styles.pantryGlyphLabelSubLine} />
      </View>
    </View>
  );
}

/**
 * Container standardizat pentru toate imaginile de produs din Beavy:
 * - Fundal crem identic (#FFF6EE)
 * - Strict imaginea verificată a produsului (fără substituiri mincinoase între branduri)
 * - Placeholder vizual Beavy pentru produsele fără foto
 */
export const ProductImageBox = React.memo(function ProductImageBox({
  imageUrl,
  productName,
  brand = null,
  categoryName = null,
  familyName = null,
  variant = 'card',
  style,
}: ProductImageBoxProps) {
  const resolvedUrl = resolveProductImageUrl(
    imageUrl,
    productName,
    categoryName,
    familyName
  );
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  const imgFailed = Boolean(resolvedUrl) && failedUrl === resolvedUrl;
  const imgLoaded = Boolean(resolvedUrl) && loadedUrl === resolvedUrl;

  const monogram = getProductMonogram(productName, brand);
  const symbolName = resolveProductPlaceholderSymbol(
    productName,
    categoryName,
    familyName
  );
  const isThumb = variant === 'thumb';
  const isMedium = variant === 'medium';
  const isCompactPlaceholder = isThumb || isMedium;
  const showImage = Boolean(resolvedUrl) && !imgFailed;
  const isMissingCanonicalImage = !resolvedUrl || imgFailed;

  return (
    <View
      style={[
        styles.baseContainer,
        isThumb
          ? styles.thumbContainer
          : isMedium
            ? styles.mediumContainer
            : styles.cardContainer,
        style,
      ]}
    >
      {(!showImage || !imgLoaded) && (
        <View style={styles.placeholderStage}>
          <View
            style={[
              styles.monogramCircle,
              isCompactPlaceholder && styles.monogramCircleThumb,
            ]}
          >
            {!isCompactPlaceholder ? (
              symbolName ? (
                <SymbolView
                  name={symbolName as any}
                  tintColor={C.primary}
                  size={18}
                  fallback={<BeavyCardPlaceholderGlyph />}
                />
              ) : (
                <BeavyCardPlaceholderGlyph />
              )
            ) : (
              <Text style={[styles.monogramText, styles.monogramTextThumb]}>
                {monogram}
              </Text>
            )}
          </View>
          {!isCompactPlaceholder && isMissingCanonicalImage && (
            <Text numberOfLines={1} style={styles.placeholderCaption}>
              Fără fotografie
            </Text>
          )}
        </View>
      )}
      {showImage && resolvedUrl ? (
        <Image
          source={{ uri: resolvedUrl }}
          recyclingKey={resolvedUrl}
          cachePolicy="memory-disk"
          onLoad={() => setLoadedUrl(resolvedUrl)}
          onError={() => setFailedUrl(resolvedUrl)}
          style={[
            styles.image,
            !imgLoaded && styles.imageHiddenWhileLoading,
            Platform.OS === 'web' ? ({ mixBlendMode: 'multiply' } as any) : null,
          ]}
          contentFit="contain"
          contentPosition="center"
          transition={120}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  baseContainer: {
    backgroundColor: C.buttermilk,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  cardContainer: {
    width: '100%',
    height: 92,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  thumbContainer: {
    width: 34,
    height: 34,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: C.rule,
  },
  mediumContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    padding: 5,
    borderWidth: 1,
    borderColor: C.rule,
  },
  image: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
  },
  imageHiddenWhileLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  placeholderStage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  monogramCircle: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: C.grapefruit,
    borderWidth: 1,
    borderColor: C.paperRule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramCircleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 0,
  },
  pantryGlyphWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1.5,
  },
  pantryGlyphCap: {
    width: 10,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.cherry,
    opacity: 0.78,
  },
  pantryGlyphBody: {
    width: 15,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.6,
    borderColor: C.cherry,
    backgroundColor: C.buttermilk,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    opacity: 0.84,
  },
  pantryGlyphLabelLine: {
    width: 7,
    height: 1.6,
    borderRadius: 1,
    backgroundColor: C.cherry,
  },
  pantryGlyphLabelSubLine: {
    width: 5,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: C.strawberry,
  },
  placeholderCaption: {
    fontSize: 9.5,
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.1,
  },
  monogramText: {
    fontSize: 13,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.cherry,
    letterSpacing: 0.4,
  },
  monogramTextThumb: {
    fontSize: 10,
  },
});
