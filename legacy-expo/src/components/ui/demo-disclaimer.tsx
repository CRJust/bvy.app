import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BeavyColors as C, BeavyFonts } from '@/constants/theme';

type DemoDisclaimerProps = {
  style?: StyleProp<ViewStyle>;
  text?: string;
};

/**
 * Notă discretă de transparență pentru faza de prezentare și validare cu partenerii.
 */
export function DemoDisclaimer({
  style,
  text = 'Date demonstrative · prețurile, reducerile și disponibilitatea au caracter orientativ.',
}: DemoDisclaimerProps) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="text">
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  text: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: C.muted,
    textAlign: 'center',
    opacity: 0.85,
  },
});
