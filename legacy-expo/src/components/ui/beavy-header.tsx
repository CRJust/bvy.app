import { Image } from 'expo-image';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BeavyColors as C, BeavyFonts, triggerHaptic } from '@/constants/theme';

type BeavyHeaderAction = {
  symbol: SFSymbol;
  fallbackText: string;
  accessibilityLabel: string;
  onPress: () => void;
};

type BeavyHeaderProps = {
  userInitials: string;
  onPressProfile: () => void;
  rightAction?: BeavyHeaderAction;
  showBottomRule?: boolean;
};

/**
 * Antet unitar Beavy 2.0 cu logo, wordmark, acțiune secundară opțională și avatar.
 */
export function BeavyHeader({
  userInitials,
  onPressProfile,
  rightAction,
  showBottomRule = false,
}: BeavyHeaderProps) {
  return (
    <View style={[styles.header, showBottomRule && styles.headerScrolled]}>
      <View style={styles.brandGroup}>
        <Image
          source={require('@/assets/images/beavy-logo.png')}
          style={styles.brandLogo}
          contentFit="contain"
        />
        <Text style={styles.brandWordmark}>beavy.</Text>
      </View>

      <View style={styles.rightActions}>
        {rightAction && (
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              rightAction.onPress();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={rightAction.accessibilityLabel}
          >
            <SymbolView
              name={rightAction.symbol}
              tintColor={C.primary}
              size={15}
              fallback={<Text style={styles.iconFallback}>{rightAction.fallbackText}</Text>}
            />
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            onPressProfile();
          }}
          hitSlop={6}
          style={({ pressed }) => [styles.avatarBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Mergi la Cont"
        >
          <Text style={styles.avatarText}>{userInitials}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: C.background,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  headerScrolled: {
    borderBottomColor: C.secondary,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  brandLogo: {
    width: 36,
    height: 36,
  },
  brandWordmark: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 20,
    color: C.primary,
    letterSpacing: -0.6,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  iconFallback: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  pressed: {
    opacity: 0.72,
  },
});
