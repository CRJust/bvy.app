import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { BeavyColors as C } from '@/constants/theme';
import { useBottomSheetAnimation } from '@/hooks/use-bottom-sheet-animation';

type BeavySheetModalProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeightRatio?: ViewStyle['maxHeight'];
  initialOffset?: number;
};

/**
 * Container unificat pentru foile modale Beavy (swipe-down, backdrop blur cald, animare 220ms).
 */
export function BeavySheetModal({
  visible,
  onClose,
  children,
  maxHeightRatio = '88%',
  initialOffset = 640,
}: BeavySheetModalProps) {
  const {
    rendered,
    requestClose,
    panHandlers,
    backdropStyle,
    sheetStyle,
  } = useBottomSheetAnimation(visible, onClose, initialOffset);

  if (!rendered) return null;

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      onRequestClose={requestClose}
    >
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessibilityLabel="Închide fereastra"
          />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { maxHeight: maxHeightRatio }, sheetStyle]}
        >
          <View {...panHandlers} style={styles.dragZone}>
            <View style={styles.dragHandle} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(66, 23, 38, 0.42)',
  },
  sheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  dragZone: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.secondary,
  },
});
