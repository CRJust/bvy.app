import React, { useEffect } from 'react';
import { type DimensionValue, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BeavyColors as C, BeavyRadius } from '@/constants/theme';

type BeavySkeletonProps = {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Placeholder calm pentru stările de încărcare, fără spinner-e obositoare.
 */
export function BeavySkeleton({
  width = '100%',
  height = 16,
  borderRadius = BeavyRadius.md,
  style,
}: BeavySkeletonProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0.65);

  useEffect(() => {
    if (reducedMotion) return;
    opacity.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.55, { duration: 700, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      )
    );
  }, [opacity, reducedMotion]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
  }));

  return (
    <Animated.View
      style={[
        styles.box,
        { width, height, borderRadius },
        animStyle,
        style,
      ]}
    />
  );
}

/**
 * Schelet compus pentru cardurile din Caută și Coș.
 */
export function BeavyCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.stack}>
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} style={styles.card}>
          <View style={styles.row}>
            <BeavySkeleton width={48} height={48} borderRadius={12} />
            <View style={styles.copyCol}>
              <BeavySkeleton width="42%" height={11} borderRadius={6} />
              <BeavySkeleton width="86%" height={15} borderRadius={6} />
              <BeavySkeleton width="58%" height={13} borderRadius={6} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: C.secondary,
  },
  stack: {
    gap: 10,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.xl,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copyCol: {
    flex: 1,
    gap: 7,
  },
});
