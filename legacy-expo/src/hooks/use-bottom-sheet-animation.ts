import { useCallback, useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, Keyboard } from 'react-native';
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { triggerHaptic } from '@/constants/theme';

/**
 * Animates a Beavy bottom-sheet modal with backdrop fade, slide-up, and swipe-down dismiss.
 */
export function useBottomSheetAnimation(
  visible: boolean,
  onClose: () => void,
  initialOffset = 640
) {
  const [rendered, setRendered] = useState(visible);
  const reducedMotion = useReducedMotion();
  const translateY = useSharedValue(initialOffset);
  const backdropOpacity = useSharedValue(0);

  const onCloseRef = useRef(onClose);
  const dragStartYRef = useRef(0);
  const dragLastDeltaRef = useRef(0);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    Keyboard.dismiss();
    onCloseRef.current();
  }, []);

  const onStartShouldSetResponder = useCallback((e: GestureResponderEvent) => {
    dragStartYRef.current = e.nativeEvent.pageY;
    dragLastDeltaRef.current = 0;
    return true;
  }, []);

  const onMoveShouldSetResponder = useCallback((e: GestureResponderEvent) => {
    return Math.abs(e.nativeEvent.pageY - dragStartYRef.current) > 5;
  }, []);

  const onResponderMove = useCallback(
    (e: GestureResponderEvent) => {
      const dy = e.nativeEvent.pageY - dragStartYRef.current;
      dragLastDeltaRef.current = dy;
      if (dy > 0) {
        translateY.set(dy);
      }
    },
    [translateY]
  );

  const onResponderRelease = useCallback(() => {
    if (dragLastDeltaRef.current > 90) {
      triggerHaptic('selection');
      requestClose();
    } else {
      translateY.set(
        withTiming(0, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        })
      );
    }
  }, [requestClose, translateY]);

  useEffect(() => {
    if (visible) {
      const mountFrame = requestAnimationFrame(() => setRendered(true));
      if (reducedMotion) {
        backdropOpacity.set(1);
        translateY.set(0);
        return () => cancelAnimationFrame(mountFrame);
      }
      backdropOpacity.set(
        withTiming(1, {
          duration: 200,
          easing: Easing.out(Easing.quad),
        })
      );
      translateY.set(
        withTiming(0, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        })
      );
      return () => cancelAnimationFrame(mountFrame);
    }

    if (rendered) {
      if (reducedMotion) {
        backdropOpacity.set(0);
        translateY.set(initialOffset);
        const hideFrame = requestAnimationFrame(() => setRendered(false));
        return () => cancelAnimationFrame(hideFrame);
      }
      backdropOpacity.set(
        withTiming(0, {
          duration: 180,
          easing: Easing.in(Easing.quad),
        })
      );
      translateY.set(
        withTiming(
          initialOffset,
          {
            duration: 210,
            easing: Easing.in(Easing.cubic),
          },
          (finished) => {
            if (finished) {
              runOnJS(setRendered)(false);
            }
          }
        )
      );
    }
  }, [visible, rendered, initialOffset, backdropOpacity, translateY, reducedMotion]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.get(),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));

  return {
    rendered,
    reducedMotion,
    requestClose,
    panHandlers: {
      onStartShouldSetResponder,
      onMoveShouldSetResponder,
      onResponderMove,
      onResponderRelease,
    },
    backdropStyle,
    sheetStyle,
  };
}
