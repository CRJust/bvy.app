import '@/global.css';

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Paleta Beavy — „Culorile din cămară”.
 * Accentul Strawberry folosește exclusiv text și iconițe Cherry pentru contrast.
 */
export const BeavyColors = {
  /** Tokenuri semantice Beavy 2.0 */
  primary: '#421726',
  primarySoft: '#5F263B',
  accent: '#F78D79',
  background: '#FFF6EE',
  surface: '#FFFFFF',
  secondary: '#E8DCCF',
  sand: '#E8DCCF',

  /** Aliasuri de compatibilitate din sistemul Beavy Cămară */
  /** Lapte bătut — Fundal cald principal */
  buttermilk: '#FFF6EE',
  /** Alb — Spațiu liber și carduri elevate */
  white: '#FFFFFF',
  /** Vișină — Titluri, corp de text și acțiuni principale */
  cherry: '#421726',
  /** Vișină mai deschis pentru stări apăsate */
  cherrySoft: '#5F263B',
  /** Fragi — Accent editorial și evidențieri calde */
  strawberry: '#F78D79',
  /** Iaurt cu grepfrut — Fundal cald pentru suprafețe secundare/atenționare */
  grapefruit: '#FCE2DB',
  /** Verde praz — Confirmări, bifat și cel mai mic coș */
  leek: '#DBE3C6',
  /** Verde praz intens pentru text/iconițe pe fundal Verde praz */
  leekDark: '#3A542A',
  /** Text secundar cald */
  muted: '#765B60',
  /** Linie fină caldă pentru separatoare structurale */
  rule: '#EFE2D8',
  /** Linie fină pe suprafață secondary (#E8DCCF) */
  paperRule: '#DFD1C2',
} as const;

/**
 * Tokenuri semantice Fintech / Beavy 2.0 inspirate din sistemele analitice moderne
 * cu contrast verificat WCAG AA pe fundal cald.
 */
export const BeavySemantics = {
  positiveBg: BeavyColors.leek,
  positiveInk: BeavyColors.leekDark,
  warningBg: BeavyColors.grapefruit,
  warningInk: BeavyColors.primary,
  accentBg: BeavyColors.accent,
  accentInk: BeavyColors.primary,
  neutralBg: BeavyColors.secondary,
  neutralInk: BeavyColors.primary,
  mutedInk: BeavyColors.muted,
  divider: BeavyColors.rule,
  tonalDivider: BeavyColors.paperRule,
  overlay: 'rgba(66, 23, 38, 0.42)',
} as const;

export const BeavyFonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
} as const;

export const BeavyRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  pill: 999,
} as const;

export const BeavySpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const BeavyShadows = {
  card: {
    shadowColor: BeavyColors.cherry,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  floating: {
    shadowColor: BeavyColors.cherry,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

/**
 * Feedback haptic sigur pe iOS / Android (ignoră silențios pe web sau dispozitive nesuportate).
 */
export function triggerHaptic(type: 'light' | 'medium' | 'selection' | 'success' = 'light') {
  if (Platform.OS === 'web') return;
  try {
    if (type === 'selection') {
      void Haptics.selectionAsync();
    } else if (type === 'success') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'medium') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // Dispozitiv fără motor haptic
  }
}

export const Colors = {
  light: {
    text: BeavyColors.cherry,
    background: BeavyColors.buttermilk,
    backgroundElement: BeavyColors.grapefruit,
    backgroundSelected: BeavyColors.leek,
    textSecondary: BeavyColors.muted,
  },
  dark: {
    text: BeavyColors.cherry,
    background: BeavyColors.buttermilk,
    backgroundElement: BeavyColors.grapefruit,
    backgroundSelected: BeavyColors.leek,
    textSecondary: BeavyColors.muted,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'Manrope_500Medium',
    serif: 'ui-serif',
    rounded: 'Manrope_700Bold',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Manrope_500Medium',
    serif: 'serif',
    rounded: 'Manrope_700Bold',
    mono: 'monospace',
  },
  web: {
    sans: 'Manrope, system-ui, sans-serif',
    serif: 'var(--font-serif)',
    rounded: 'Manrope, system-ui, sans-serif',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const BEAVY_CITIES = [
  'București',
] as const;
