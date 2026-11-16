import { Image } from 'expo-image';
import React from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { getRetailerBrandStyle } from '@/components/cart/retailer-brand';
import { BeavyColors as C, BeavyFonts } from '@/constants/theme';

type RetailerLogoProps = {
  retailerName: string;
  slug?: string | null;
  logoUrl?: string | null;
  size?: number;
  shape?: 'circle' | 'rounded';
  style?: StyleProp<ViewStyle>;
};

/**
 * Logo oficial de supermarket cu încadrare curată (asset local verificat sau fallback pe monogramă).
 */
export function RetailerLogo({
  retailerName,
  slug,
  logoUrl,
  size = 32,
  shape = 'rounded',
  style,
}: RetailerLogoProps) {
  const brand = getRetailerBrandStyle(retailerName, slug);
  const source = brand.logoSource ?? (logoUrl ? { uri: logoUrl } : undefined);
  const borderRadius =
    shape === 'circle' ? size / 2 : Math.max(6, Math.round(size * 0.28));
  const innerPad = brand.isFullBleedLogo
    ? 0
    : Math.max(2, Math.round(size * 0.13));

  if (!source) {
    return (
      <View
        style={[
          styles.fallbackBox,
          {
            width: size,
            height: size,
            borderRadius,
            backgroundColor: brand.softTint,
          },
          style,
        ]}
      >
        <Text
          style={[
            styles.fallbackText,
            {
              color: brand.textColor,
              fontSize: Math.max(9, Math.round(size * 0.34)),
            },
          ]}
        >
          {brand.shortCode}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.logoFrame,
        {
          width: size,
          height: size,
          borderRadius,
          padding: innerPad,
        },
        brand.isFullBleedLogo && styles.fullBleedFrame,
        style,
      ]}
    >
      <Image
        source={source}
        style={styles.logoImage}
        contentFit="contain"
        contentPosition="center"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoFrame: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  fullBleedFrame: {
    borderWidth: 0,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  fallbackBox: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  fallbackText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
});
