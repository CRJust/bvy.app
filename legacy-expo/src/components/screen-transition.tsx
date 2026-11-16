import React, { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { BeavyColors } from '@/constants/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

/**
 * Îmbracă conținutul fiecărui tab într-un container stabil, fără latență artificială.
 */
export function BeavyScreenTransition({ children, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeavyColors.buttermilk,
  },
});
