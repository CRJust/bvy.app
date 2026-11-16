import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { DefaultTheme, Tabs, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { BeavyColors as C, BeavyFonts, triggerHaptic } from '@/constants/theme';
import { AuthProvider } from '@/context/auth-context';
import { ShoppingProvider, useShopping } from '@/context/shopping-context';
import { TabBarProvider, useTabBar } from '@/context/tab-bar-context';

SplashScreen.preventAutoHideAsync();

const TAB_BAR_PADDING = 5;
const INDICATOR_DURATION_MS = 210;

const TAB_ITEMS = [
  {
    name: 'index',
    label: 'Listă',
    iosSymbol: 'list.bullet.rectangle.portrait' as const,
    androidSymbol: 'FormatListBulleted' as const,
  },
  {
    name: 'chat',
    label: 'Chat',
    iosSymbol: 'sparkles' as const,
    androidSymbol: 'AutoAwesome' as const,
  },
  {
    name: 'compare',
    label: 'Coș',
    iosSymbol: 'basket' as const,
    androidSymbol: 'ShoppingBasket' as const,
  },
  {
    name: 'profile',
    label: 'Cont',
    iosSymbol: 'person.crop.circle' as const,
    androidSymbol: 'Person' as const,
  },
];

function TabFallbackIcon({
  name,
  color,
}: {
  name: (typeof TAB_ITEMS)[number]['name'];
  color: string;
}) {
  if (name === 'index') {
    return (
      <View style={styles.fallbackIconBox}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.fallbackListRow}>
            <View style={[styles.fallbackListDot, { backgroundColor: color }]} />
            <View style={[styles.fallbackListBar, { backgroundColor: color }]} />
          </View>
        ))}
      </View>
    );
  }

  if (name === 'chat') {
    return (
      <View style={styles.fallbackIconBox}>
        <Text style={{ color, fontSize: 15, fontFamily: BeavyFonts.extraBold }}>✦</Text>
      </View>
    );
  }

  if (name === 'compare') {
    return (
      <View style={styles.fallbackIconBox}>
        <View style={[styles.fallbackBasketHandle, { borderColor: color }]} />
        <View style={[styles.fallbackBasketBody, { borderColor: color }]} />
      </View>
    );
  }

  return (
    <View style={styles.fallbackPersonBox}>
      <View style={[styles.fallbackPersonHead, { borderColor: color }]} />
      <View style={[styles.fallbackPersonBody, { borderColor: color }]} />
    </View>
  );
}

function BeavyBottomTabBar({
  state,
  navigateToTab,
}: {
  state: { index: number; routes: { key: string; name: string }[] };
  navigateToTab: (routeKey: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { basketItems } = useShopping();
  const { visualTabIndex, triggerTabTransition, syncVisualTabIndex } = useTabBar();
  const reducedMotion = useReducedMotion();

  const [innerWidth, setInnerWidth] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () =>
      setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setIsKeyboardVisible(false)
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const currentRouteName = state.routes[state.index]?.name ?? 'index';
  const actualTabIdx = Math.max(
    0,
    TAB_ITEMS.findIndex((t) => t.name === currentRouteName)
  );

  useEffect(() => {
    syncVisualTabIndex(actualTabIdx);
  }, [actualTabIdx, syncVisualTabIndex]);

  const activeVisualIdx = visualTabIndex ?? actualTabIdx;
  const tabCount = TAB_ITEMS.length;
  const singleTabWidth =
    innerWidth > 0 ? (innerWidth - TAB_BAR_PADDING * 2) / tabCount : 0;

  // 1. Alunecarea indicatorului burgundy (210ms)
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (singleTabWidth <= 0) return;
    if (reducedMotion) {
      translateX.set(activeVisualIdx * singleTabWidth);
      return;
    }
    translateX.set(
      withTiming(activeVisualIdx * singleTabWidth, {
        duration: INDICATOR_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [activeVisualIdx, singleTabWidth, translateX, reducedMotion]);

  const indicatorAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  // 2. Badge-ul tabului Coș afișează exclusiv numărul produselor distincte aflate efectiv în coș (neachiziționate)
  const distinctCount = basketItems.length;
  const totalUnits = basketItems.reduce((acc, it) => acc + (it.quantity || 1), 0);
  const prevActivityRef = useRef({ distinct: distinctCount, units: totalUnits });
  const badgeScale = useSharedValue(1);

  useEffect(() => {
    const grew =
      distinctCount > prevActivityRef.current.distinct ||
      totalUnits > prevActivityRef.current.units;
    if (grew && !reducedMotion) {
      badgeScale.set(
        withSequence(
          withTiming(1.3, {
            duration: 90,
            easing: Easing.out(Easing.quad),
          }),
          withTiming(1, {
            duration: 120,
            easing: Easing.out(Easing.cubic),
          })
        )
      );
    }
    prevActivityRef.current = { distinct: distinctCount, units: totalUnits };
  }, [distinctCount, totalUnits, badgeScale, reducedMotion]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.get() }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== innerWidth) {
      setInnerWidth(w);
      const initialSlot = (w - TAB_BAR_PADDING * 2) / tabCount;
      translateX.set(activeVisualIdx * initialSlot);
    }
  };

  return (
    <View
      style={[
        styles.tabBarOuter,
        {
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 10),
          display: isKeyboardVisible ? 'none' : 'flex',
        },
      ]}
    >
      <View onLayout={handleLayout} style={styles.tabBarInner}>
        {singleTabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.slidingIndicator,
              { width: singleTabWidth },
              indicatorAnimatedStyle,
            ]}
          />
        )}

        {TAB_ITEMS.map((tab, tabIdx) => {
          const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
          if (routeIndex === -1) return null;
          const route = state.routes[routeIndex];
          const isFocused = activeVisualIdx === tabIdx;
          const iconColor = isFocused ? C.white : C.cherry;

          const onPress = () => {
            if (state.index !== routeIndex && activeVisualIdx !== tabIdx) {
              triggerHaptic('selection');
              triggerTabTransition(tabIdx, () => {
                navigateToTab(route.key);
              });
            }
          };

          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={tab.label}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tabItem,
                singleTabWidth === 0 && isFocused && styles.tabItemFallbackActive,
                pressed && styles.tabItemPressed,
              ]}
            >
              <View style={styles.iconWrap}>
                <SymbolView
                  name={tab.iosSymbol}
                  tintColor={iconColor}
                  size={18}
                  fallback={<TabFallbackIcon name={tab.name} color={iconColor} />}
                />
                {/* Badge „Coș”: numărul produselor distincte */}
                {tab.name === 'compare' && distinctCount > 0 && (
                  <Animated.View
                    style={[
                      styles.badge,
                      isFocused && {
                        backgroundColor: C.strawberry,
                        borderColor: C.cherry,
                      },
                      badgeAnimatedStyle,
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {distinctCount > 99 ? '99+' : distinctCount}
                    </Text>
                  </Animated.View>
                )}
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={[styles.tabLabel, isFocused && styles.tabLabelActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const BeavyNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: C.cherry,
    background: C.buttermilk,
    card: C.buttermilk,
    text: C.cherry,
    border: C.rule,
  },
};

export default function RootLayout() {
  useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="dark" />
      <ThemeProvider value={BeavyNavigationTheme}>
        <AuthProvider>
          <ShoppingProvider>
            <TabBarProvider>
              <AnimatedSplashOverlay />
              <Tabs
                detachInactiveScreens={false}
                tabBar={(props) => <BeavyBottomTabBar {...props} />}
                screenOptions={{
                  headerShown: false,
                  lazy: true,
                  freezeOnBlur: true,
                  sceneStyle: { backgroundColor: C.buttermilk },
                }}
              >
                <Tabs.Screen name="index" options={{ title: 'Beavy · Listă de cumpărături' }} />
                <Tabs.Screen name="chat" options={{ title: 'Beavy · Chat Asistent' }} />
                <Tabs.Screen name="compare" options={{ title: 'Beavy · Coș & Comparație' }} />
                <Tabs.Screen name="profile" options={{ title: 'Beavy · Cont' }} />
                <Tabs.Screen name="search" options={{ href: null }} />
                <Tabs.Screen name="discover" options={{ href: null }} />
              </Tabs>
            </TabBarProvider>
          </ShoppingProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    backgroundColor: C.buttermilk,
    paddingTop: 6,
    paddingHorizontal: 8,
  },
  tabBarInner: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: C.white,
    borderRadius: 99,
    padding: TAB_BAR_PADDING,
    borderWidth: 1,
    borderColor: C.rule,
    shadowColor: C.cherry,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  slidingIndicator: {
    position: 'absolute',
    left: TAB_BAR_PADDING,
    top: TAB_BAR_PADDING,
    bottom: TAB_BAR_PADDING,
    backgroundColor: C.cherry,
    borderRadius: 99,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 99,
    gap: 6,
    zIndex: 1,
  },
  tabItemFallbackActive: {
    backgroundColor: C.cherry,
  },
  tabItemPressed: {
    opacity: 0.82,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIconBox: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
  },
  fallbackListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  fallbackListDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 2,
  },
  fallbackListBar: {
    width: 10,
    height: 2,
    borderRadius: 1,
  },
  fallbackBasketHandle: {
    width: 8,
    height: 4,
    borderWidth: 1.6,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    marginBottom: -2,
  },
  fallbackBasketBody: {
    width: 14,
    height: 9,
    borderWidth: 1.6,
    borderRadius: 3,
  },
  fallbackSearchBox: {
    width: 16,
    height: 16,
    position: 'relative',
  },
  fallbackSearchLens: {
    position: 'absolute',
    top: 1.5,
    left: 1.5,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.7,
  },
  fallbackSearchHandle: {
    position: 'absolute',
    right: 1.5,
    bottom: 2,
    width: 5,
    height: 1.8,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  fallbackPersonBox: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1.5,
  },
  fallbackPersonHead: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.6,
  },
  fallbackPersonBody: {
    width: 12,
    height: 6,
    borderWidth: 1.6,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.strawberry,
    paddingHorizontal: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.white,
  },
  badgeText: {
    color: C.cherry,
    fontSize: 9,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  tabLabel: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.cherry,
    letterSpacing: -0.2,
  },
  tabLabelActive: {
    color: C.white,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 12.5,
    letterSpacing: -0.2,
  },
});
