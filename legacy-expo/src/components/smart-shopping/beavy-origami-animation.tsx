import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BeavyColors as C, BeavyFonts } from '@/constants/theme';

export interface BeavyOrigamiAnimationProps {
  size?: number;
  isComplete?: boolean;
  onAnimationFinish?: () => void;
}

/**
 * Signature Beavy Origami 7-Frame Brand Animation:
 * FRAME 1 — PAPER ORIGIN (clean coral/orange surface)
 * FRAME 2 — FIRST FOLD (geometric diagonal fold with realistic shadow)
 * FRAME 3 — SECOND FOLD (tag geometry begins emerging)
 * FRAME 4 — TAG FORMATION (chamfered silhouette and punch hole detail)
 * FRAME 5 — BEAVY WORDMARK (sequential letter reveal: b-e-a-v-y in #421726)
 * FRAME 6 — SHOPPING LIST (three horizontal list lines appear progressively)
 * FRAME 7 — FINAL BRAND STATE (completed Beavy origami tag matching brand asset)
 */
export function BeavyOrigamiAnimation({
  size = 140,
  isComplete = false,
  onAnimationFinish,
}: BeavyOrigamiAnimationProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      onAnimationFinish?.();
      return;
    }

    progress.value = withTiming(1, {
      duration: 2100,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });

    const timer = setTimeout(() => {
      onAnimationFinish?.();
    }, 2120);

    return () => clearTimeout(timer);
  }, [reducedMotion, progress, onAnimationFinish]);

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 1;
      return;
    }

    pulse.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.0, { duration: 900, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
  }, [reducedMotion, isComplete, pulse]);

  const finalAssetStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 0.86, 0.96, 1], [0, 0, 1, 1]);
    return {
      opacity: reducedMotion ? 1 : opacity,
      transform: [{ scale: pulse.value }],
    };
  });

  const proceduralWrapStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 0.86, 0.96, 1], [1, 1, 0, 0]);
    const scale = interpolate(progress.value, [0, 0.2, 0.45, 1], [1, 0.95, 0.9, 1]);
    return {
      opacity: reducedMotion ? 0 : opacity,
      transform: [{ scale }],
    };
  });

  const tagBodyStyle = useAnimatedStyle(() => {
    const topRightRadius = interpolate(progress.value, [0, 0.35, 0.55, 1], [8, 8, 28, 28]);
    const baseRadius = interpolate(progress.value, [0, 0.35, 0.55, 1], [8, 8, 14, 14]);
    return {
      borderRadius: baseRadius,
      borderTopRightRadius: topRightRadius,
    };
  });

  const foldFlapStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 0.12, 0.18, 0.58, 0.65], [0, 0, 1, 1, 0]);
    const deg = interpolate(progress.value, [0, 0.15, 0.42, 1], [0, 0, -45, -45]);
    return {
      opacity,
      transform: [{ rotate: `${deg}deg` }],
    };
  });

  const punchHoleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 0.45, 0.56, 1], [0, 0, 1, 1]);
    const scale = interpolate(progress.value, [0, 0.45, 0.56, 1], [0.4, 0.4, 1, 1]);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const letterBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.58, 0.62, 1], [0, 0, 1, 1]),
  }));
  const letterEStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.62, 0.66, 1], [0, 0, 1, 1]),
  }));
  const letterAStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.66, 0.7, 1], [0, 0, 1, 1]),
  }));
  const letterVStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.7, 0.74, 1], [0, 0, 1, 1]),
  }));
  const letterYStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.74, 0.78, 1], [0, 0, 1, 1]),
  }));

  const lineTrackWidth = Math.round(size * 0.52);
  const line1Style = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 0.76, 0.82, 1], [0, 0, lineTrackWidth * 0.82, lineTrackWidth * 0.82]),
  }));
  const line2Style = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 0.8, 0.86, 1], [0, 0, lineTrackWidth * 0.65, lineTrackWidth * 0.65]),
  }));
  const line3Style = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 0.84, 0.9, 1], [0, 0, lineTrackWidth * 0.74, lineTrackWidth * 0.74]),
  }));

  return (
    <View
      style={[styles.root, { width: size, height: size }]}
      accessibilityRole="image"
      accessibilityLabel="Animație origami Beavy"
    >
      {/* FINAL FRAME 7: Master brand asset */}
      <Animated.View style={[styles.fillAbsolute, styles.center, finalAssetStyle]}>
        <Image
          source={require('@/assets/images/beavy-logo.png')}
          style={{ width: size * 0.92, height: size * 0.92 }}
          contentFit="contain"
        />
      </Animated.View>

      {/* FRAMES 1–6: Procedural Origami Folding Sequence */}
      <Animated.View style={[styles.fillAbsolute, styles.center, proceduralWrapStyle]}>
        <Animated.View
          style={[
            styles.tagBody,
            {
              width: size * 0.72,
              height: size * 0.84,
            },
            tagBodyStyle,
          ]}
        >
          {/* Frame 4: Tag Punch Hole detail */}
          <Animated.View
            style={[
              styles.punchHole,
              {
                top: size * 0.08,
                right: size * 0.12,
                width: size * 0.11,
                height: size * 0.11,
                borderRadius: (size * 0.11) / 2,
              },
              punchHoleStyle,
            ]}
          />

          {/* Frames 2–4: Origami Diagonal Folding Flap & Crease */}
          <Animated.View
            style={[
              styles.creaseShadow,
              foldFlapStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.foldFlap,
              {
                width: size * 0.32,
                height: size * 0.32,
              },
              foldFlapStyle,
            ]}
          />

          {/* Frame 5: Wordmark "beavy" (sequential letters) */}
          <View style={[styles.wordmarkRow, { marginTop: size * 0.28 }]}>
            <Animated.Text style={[styles.letter, letterBStyle]}>b</Animated.Text>
            <Animated.Text style={[styles.letter, letterEStyle]}>e</Animated.Text>
            <Animated.Text style={[styles.letter, letterAStyle]}>a</Animated.Text>
            <Animated.Text style={[styles.letter, letterVStyle]}>v</Animated.Text>
            <Animated.Text style={[styles.letter, letterYStyle]}>y</Animated.Text>
          </View>

          {/* Frame 6: 3 Shopping list lines */}
          <View style={[styles.listLinesContainer, { marginTop: size * 0.06, width: lineTrackWidth }]}>
            <View style={styles.lineTrack}>
              <Animated.View style={[styles.lineFill, line1Style]} />
            </View>
            <View style={[styles.lineTrack, { marginTop: 4 }]}>
              <Animated.View style={[styles.lineFill, line2Style]} />
            </View>
            <View style={[styles.lineTrack, { marginTop: 4 }]}>
              <Animated.View style={[styles.lineFill, line3Style]} />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  fillAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagBody: {
    backgroundColor: C.accent,
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.grapefruit,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  punchHole: {
    position: 'absolute',
    backgroundColor: C.primary,
    borderWidth: 1.5,
    borderColor: C.muted,
  },
  foldFlap: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: C.grapefruit,
    borderBottomLeftRadius: 12,
    borderWidth: 1,
    borderColor: C.rule,
  },
  creaseShadow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 56,
    height: 56,
    backgroundColor: 'rgba(66, 23, 38, 0.22)',
  },
  wordmarkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  letter: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 18,
    color: C.primary,
    letterSpacing: -0.5,
  },
  listLinesContainer: {
    paddingHorizontal: 2,
  },
  lineTrack: {
    height: 3,
    backgroundColor: 'rgba(66, 23, 38, 0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  lineFill: {
    height: '100%',
    backgroundColor: C.primary,
    borderRadius: 2,
  },
});
