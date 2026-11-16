import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';

import { BEAVY_CITIES, BeavyColors as C, BeavyFonts, triggerHaptic } from '@/constants/theme';

export type OnboardingResults = {
  city: string;
  preferredChannel: 'all' | 'physical' | 'online';
  preferredRetailerSlugs: string[];
};

type BeavyOnboardingModalProps = {
  visible: boolean;
  initialCity?: string;
  initialChannel?: 'all' | 'physical' | 'online';
  initialRetailers?: string[];
  onComplete: (results: OnboardingResults) => void;
  onDismiss?: () => void;
};

const CITIES = BEAVY_CITIES;

const CHANNELS: {
  id: 'all' | 'physical' | 'online';
  title: string;
  subtitle: string;
  symbol: string;
  fallback: string;
}[] = [
  {
    id: 'all',
    title: 'Ambele variante (Recomandat)',
    subtitle: 'Vreau să văd unde e mai ieftin, indiferent de canal',
    symbol: 'arrow.left.arrow.right',
    fallback: '⇄',
  },
  {
    id: 'physical',
    title: 'Magazin fizic',
    subtitle: 'Merg la supermarketul din cartier (Kaufland, Lidl, Carrefour, Penny)',
    symbol: 'building.2.fill',
    fallback: '⌂',
  },
  {
    id: 'online',
    title: 'Livrare online la ușă',
    subtitle: 'Comand prin curier cu livrare programată (Sezamo, Freshful)',
    symbol: 'shippingbox.fill',
    fallback: '↗',
  },
];

const POPULAR_RETAILERS: {
  slug: string;
  name: string;
  tagline: string;
}[] = [
  { slug: 'kaufland', name: 'Kaufland', tagline: 'Prețuri mici & volum' },
  { slug: 'lidl', name: 'Lidl', tagline: 'Mărci proprii & promoții' },
  { slug: 'carrefour', name: 'Carrefour', tagline: 'Gamă extinsă & hipermarket' },
  { slug: 'mega-image', name: 'Mega Image', tagline: 'Aproape de casă' },
  { slug: 'sezamo', name: 'Sezamo', tagline: 'Livrare rapidă 3h online' },
  { slug: 'freshful', name: 'Freshful by eMAG', tagline: 'Supermarket 100% online' },
  { slug: 'auchan', name: 'Auchan', tagline: 'Cumpărături mari de familie' },
  { slug: 'penny', name: 'Penny', tagline: 'Economii de cartier' },
  { slug: 'profi', name: 'Profi', tagline: 'Zilnic prețuri mici' },
];

export function BeavyOnboardingModal({
  visible,
  initialCity = 'București',
  initialChannel = 'all',
  initialRetailers = ['freshful', 'sezamo', 'kaufland'],
  onComplete,
  onDismiss,
}: BeavyOnboardingModalProps) {
  const [prevVisible, setPrevVisible] = useState(visible);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCity, setSelectedCity] = useState(initialCity);
  const [selectedChannel, setSelectedChannel] = useState<'all' | 'physical' | 'online'>(initialChannel);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>(initialRetailers);

  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setStep(1);
      setSelectedCity(initialCity);
      setSelectedChannel(initialChannel);
      setSelectedRetailers(initialRetailers);
    }
  }

  const reducedMotion = useReducedMotion();

  if (!visible) return null;

  const handleNext = () => {
    triggerHaptic('light');
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else {
      triggerHaptic('medium');
      onComplete({
        city: selectedCity,
        preferredChannel: selectedChannel,
        preferredRetailerSlugs: selectedRetailers.length > 0 ? selectedRetailers : ['freshful'],
      });
    }
  };

  const handleBack = () => {
    triggerHaptic('selection');
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
    else if (onDismiss) onDismiss();
  };

  const toggleRetailer = (slug: string) => {
    triggerHaptic('selection');
    setSelectedRetailers((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.sheetCard}>
          {/* Header & Step progress */}
          <View style={styles.header}>
            <View style={styles.progressRow}>
              {[1, 2, 3].map((s) => (
                <View
                  key={s}
                  style={[
                    styles.progressDot,
                    step === s && styles.progressDotActive,
                    step > s && styles.progressDotDone,
                  ]}
                />
              ))}
            </View>

            {onDismiss && (
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  onDismiss();
                }}
                hitSlop={10}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Închide chestionarul"
              >
                <Text style={styles.closeBtnText}>×</Text>
              </Pressable>
            )}
          </View>

          {/* Step 1: ORAȘUL */}
          {step === 1 && (
            <Animated.View
              entering={reducedMotion ? undefined : FadeIn.duration(180)}
              exiting={reducedMotion ? undefined : FadeOut.duration(120)}
              style={styles.stepContainer}
            >
              <Text style={styles.stepSubtitle}>Pasul 1 din 3 · Localizare</Text>
              <Text style={styles.stepTitle}>În ce oraș faci cumpărăturile?</Text>
              <Text style={styles.stepDescription}>
                Beavy compară prețurile reale confirmate din cataloagele valabile în orașul tău.
              </Text>

              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.cityGrid}
                showsVerticalScrollIndicator={false}
              >
                {CITIES.map((c) => {
                  const isSelected = selectedCity === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => {
                        triggerHaptic('selection');
                        setSelectedCity(c);
                      }}
                      style={[styles.cityChip, isSelected && styles.cityChipActive]}
                    >
                      <Text
                        style={[
                          styles.cityChipText,
                          isSelected && styles.cityChipTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                      {isSelected && (
                        <View style={styles.cityCheckMark}>
                          <Text style={styles.cityCheckMarkText}>✓</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Animated.View>
          )}

          {/* Step 2: CUM PREFERI SĂ CUMPERI */}
          {step === 2 && (
            <Animated.View
              entering={reducedMotion ? undefined : FadeIn.duration(180)}
              exiting={reducedMotion ? undefined : FadeOut.duration(120)}
              style={styles.stepContainer}
            >
              <Text style={styles.stepSubtitle}>Pasul 2 din 3 · Stil de cumpărături</Text>
              <Text style={styles.stepTitle}>Cum preferi să cumperi?</Text>
              <Text style={styles.stepDescription}>
                Vom prioritiza rezultatele conform modului în care îți faci aprovizionarea.
              </Text>

              <View style={styles.channelOptionsCol}>
                {CHANNELS.map((ch) => {
                  const isSelected = selectedChannel === ch.id;
                  return (
                    <Pressable
                      key={ch.id}
                      onPress={() => {
                        triggerHaptic('selection');
                        setSelectedChannel(ch.id);
                      }}
                      style={[styles.channelCard, isSelected && styles.channelCardActive]}
                    >
                      <View
                        style={[
                          styles.channelIconBox,
                          isSelected && styles.channelIconBoxActive,
                        ]}
                      >
                        <SymbolView
                          name={ch.symbol as any}
                          tintColor={isSelected ? C.strawberry : C.cherry}
                          size={18}
                          fallback={<Text style={styles.channelFallback}>{ch.fallback}</Text>}
                        />
                      </View>
                      <View style={styles.channelTextCol}>
                        <Text
                          style={[
                            styles.channelTitle,
                            isSelected && styles.channelTitleActive,
                          ]}
                        >
                          {ch.title}
                        </Text>
                        <Text style={styles.channelSub}>{ch.subtitle}</Text>
                      </View>
                      <View
                        style={[
                          styles.radioCircle,
                          isSelected && styles.radioCircleActive,
                        ]}
                      >
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* Step 3: SUPERMARKETURI FAVORITE */}
          {step === 3 && (
            <Animated.View
              entering={reducedMotion ? undefined : FadeIn.duration(180)}
              exiting={reducedMotion ? undefined : FadeOut.duration(120)}
              style={styles.stepContainer}
            >
              <Text style={styles.stepSubtitle}>Pasul 3 din 3 · Magazine</Text>
              <Text style={styles.stepTitle}>Ce supermarketuri preferi?</Text>
              <Text style={styles.stepDescription}>
                Selectează magazinele din care cumperi de obicei. Poți alege oricâte.
              </Text>

              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.retailersGrid}
                showsVerticalScrollIndicator={false}
              >
                {POPULAR_RETAILERS.map((r) => {
                  const isSelected = selectedRetailers.includes(r.slug);
                  return (
                    <Pressable
                      key={r.slug}
                      onPress={() => toggleRetailer(r.slug)}
                      style={[
                        styles.retailerCard,
                        isSelected && styles.retailerCardActive,
                      ]}
                    >
                      <View style={styles.retailerCardHeader}>
                        <Text
                          style={[
                            styles.retailerName,
                            isSelected && styles.retailerNameActive,
                          ]}
                        >
                          {r.name}
                        </Text>
                        <View
                          style={[
                            styles.checkboxBox,
                            isSelected && styles.checkboxBoxActive,
                          ]}
                        >
                          {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
                        </View>
                      </View>
                      <Text style={styles.retailerTagline}>{r.tagline}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Animated.View>
          )}

          {/* Bottom Actions */}
          <View style={styles.footerRow}>
            {step > 1 ? (
              <Pressable
                onPress={handleBack}
                hitSlop={8}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Pasul anterior"
              >
                <Text style={styles.backBtnText}>Înapoi</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            <Pressable
              onPress={handleNext}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={step === 3 ? 'Finalizează' : 'Pasul următor'}
            >
              <Text style={styles.primaryBtnText}>
                {step === 3 ? 'Finalizează & Începe' : 'Continuă'}
              </Text>
              <Text style={styles.primaryBtnArrow}>→</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(66, 23, 38, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  sheetCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: C.buttermilk,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: C.rule,
    shadowColor: C.cherry,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 24,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.rule,
  },
  progressDotActive: {
    width: 36,
    backgroundColor: C.strawberry,
  },
  progressDotDone: {
    backgroundColor: C.cherry,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  closeBtnText: {
    fontSize: 22,
    color: C.muted,
    lineHeight: 22,
  },
  stepContainer: {
    minHeight: 330,
  },
  stepSubtitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.strawberry,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  stepTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 21,
    color: C.cherry,
    letterSpacing: -0.4,
    lineHeight: 27,
    marginBottom: 6,
  },
  stepDescription: {
    fontFamily: BeavyFonts.regular,
    fontSize: 13,
    color: C.muted,
    lineHeight: 18,
    marginBottom: 16,
  },
  scrollArea: {
    maxHeight: 250,
  },
  cityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8,
  },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.white,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.rule,
  },
  cityChipActive: {
    backgroundColor: C.cherry,
    borderColor: C.cherry,
  },
  cityChipText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 13,
    color: C.cherry,
  },
  cityChipTextActive: {
    color: C.white,
    fontFamily: BeavyFonts.bold,
  },
  cityCheckMark: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.strawberry,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityCheckMarkText: {
    color: C.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  channelOptionsCol: {
    gap: 10,
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.rule,
    gap: 12,
  },
  channelCardActive: {
    borderColor: C.strawberry,
    backgroundColor: C.white,
  },
  channelIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.grapefruit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelIconBoxActive: {
    backgroundColor: C.grapefruit,
  },
  channelFallback: {
    fontSize: 16,
  },
  channelTextCol: {
    flex: 1,
  },
  channelTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.cherry,
    marginBottom: 2,
  },
  channelTitleActive: {
    color: C.cherry,
  },
  channelSub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
    lineHeight: 15,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: C.strawberry,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.strawberry,
  },
  retailersGrid: {
    gap: 8,
    paddingBottom: 8,
  },
  retailerCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.rule,
  },
  retailerCardActive: {
    borderColor: C.strawberry,
    backgroundColor: C.white,
  },
  retailerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  retailerName: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.cherry,
  },
  retailerNameActive: {
    color: C.cherry,
  },
  retailerTagline: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxActive: {
    backgroundColor: C.strawberry,
    borderColor: C.strawberry,
  },
  checkboxTick: {
    color: C.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    gap: 12,
  },
  backBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 99,
  },
  backBtnText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 13,
    color: C.muted,
  },
  primaryBtn: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: 99,
    paddingVertical: 13,
    paddingHorizontal: 22,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  primaryBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 14,
    color: C.surface,
  },
  primaryBtnArrow: {
    fontSize: 15,
    color: C.surface,
    fontWeight: '800',
  },
});
