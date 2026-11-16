import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BeavyColors as C, BeavyFonts } from '@/constants/theme';

type QuantityStepperProps = {
  quantity: number;
  onDecrement: () => void;
  onIncrement: () => void;
  variant?: 'paper' | 'card';
};

/**
 * Selector de cantitate reutilizabil cu micro-interacțiune discretă (135ms)
 * pe cifra cantității la modificare și suport pentru prefers-reduced-motion.
 */
export const QuantityStepper = React.memo(function QuantityStepper({
  quantity,
  onDecrement,
  onIncrement,
  variant = 'paper',
}: QuantityStepperProps) {
  const reducedMotion = useReducedMotion();
  const prevQtyRef = useRef(quantity);
  const qtyScale = useSharedValue(1);

  useEffect(() => {
    if (quantity !== prevQtyRef.current && !reducedMotion) {
      qtyScale.value = withSequence(
        withTiming(1.22, {
          duration: 60,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(1, {
          duration: 75,
          easing: Easing.out(Easing.cubic),
        })
      );
    }
    prevQtyRef.current = quantity;
  }, [quantity, qtyScale, reducedMotion]);

  const qtyAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: qtyScale.value }],
  }));

  const isCard = variant === 'card';

  return (
    <View style={[styles.container, isCard ? styles.cardContainer : styles.paperContainer]}>
      <Pressable
        onPress={onDecrement}
        hitSlop={9}
        accessibilityRole="button"
        accessibilityLabel="Scade cantitatea"
        style={[styles.stepBtn, isCard && styles.cardStepBtn]}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>

      <Animated.View style={qtyAnimatedStyle}>
        <Text style={styles.qtyText}>{quantity}</Text>
      </Animated.View>

      <Pressable
        onPress={onIncrement}
        hitSlop={9}
        accessibilityRole="button"
        accessibilityLabel="Crește cantitatea"
        style={[styles.stepBtn, isCard && styles.cardStepBtn]}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 99,
    gap: 4,
    minHeight: 32,
  },
  paperContainer: {
    backgroundColor: C.background,
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  cardContainer: {
    backgroundColor: C.leek,
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStepBtn: {
    backgroundColor: C.surface,
  },
  stepBtnText: {
    fontSize: 15,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  qtyText: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    minWidth: 16,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
