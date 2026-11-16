import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { BeavySegmentedControl } from '@/components/ui/beavy-segmented-control';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import { BUCHAREST_SECTORS } from '@/constants/bucharest-sectors';
import {
  BEAVY_CITIES,
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type { UserPreferences } from '@/context/shopping-context';
import {
  getAnthropicApiKey,
  setAnthropicApiKey,
} from '@/services/beavy-claude-haiku';
import { ALL_LOYALTY_PROGRAMS, type BeavyRetailer } from '@/services/beavy-comparison';

type ShoppingPrefsSectionProps = {
  preferences: UserPreferences;
  retailers: BeavyRetailer[];
  learnedPreferencesCount?: number;
  onUpdatePreferences: (patch: Partial<UserPreferences>) => void;
  onClearLearnedPreferences?: () => void;
  onToggleRetailer: (slug: string) => void;
  onOpenOnboarding: () => void;
  onShowFeedback: (msg: string) => void;
};

/**
 * Preferințe cumpărături, magazine preferate, preferințe de livrare și alerte.
 */
export function ShoppingPrefsSection({
  preferences,
  retailers,
  learnedPreferencesCount = 0,
  onUpdatePreferences,
  onClearLearnedPreferences,
  onToggleRetailer,
  onOpenOnboarding,
  onShowFeedback,
}: ShoppingPrefsSectionProps) {
  const deliveryPref = preferences.deliveryPreference ?? 'lowest_fee';
  const deliverySlot = preferences.preferredDeliverySlot ?? 'flexible';
  const applyLoyaltyCards = preferences.applyLoyaltyCards ?? true;
  const ownedLoyalty = preferences.ownedLoyaltyPrograms ?? null;
  const learnPreferencesEnabled = preferences.learnPreferencesEnabled ?? true;
  const priceAlertsEnabled = preferences.priceAlertsEnabled ?? true;
  const notificationsEnabled = preferences.notificationsEnabled ?? true;

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAnthropicApiKey().then((k) => {
      if (mounted && k) {
        setHasApiKey(true);
        setApiKeyInput(k);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveApiKey = async () => {
    const clean = apiKeyInput.trim();
    await setAnthropicApiKey(clean || null);
    setHasApiKey(Boolean(clean));
    setShowApiKeyInput(false);
    triggerHaptic('success');
    onShowFeedback(
      clean
        ? 'Cheia personalizată Claude a fost salvată!'
        : 'Cheia personalizată a fost ștearsă. Modul nativ este activ.'
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Preferințe cumpărături și livrare</Text>

      <BeavySurface variant="elevated" style={styles.groupCard}>
        {/* Reia onboarding */}
        <Pressable
          onPress={() => {
            triggerHaptic('selection');
            onOpenOnboarding();
          }}
          style={({ pressed }) => [styles.rowPress, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <View style={styles.iconCircle}>
            <SymbolView
              name="sparkles"
              tintColor={C.primary}
              size={15}
              fallback={<Text style={styles.fallbackGlyph}>★</Text>}
            />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>Configurare inițială</Text>
          </View>
          <SymbolView
            name="chevron.right"
            tintColor={C.muted}
            size={12}
            fallback={<Text style={styles.fallbackGlyph}>›</Text>}
          />
        </Pressable>

        <View style={styles.divider} />

        {/* Orașul */}
        <View style={styles.stackedRow}>
          <View style={styles.stackedHeader}>
            <View style={styles.iconCircle}>
              <SymbolView
                name="mappin.and.ellipse"
                tintColor={C.primary}
                size={15}
                fallback={<Text style={styles.fallbackGlyph}>◎</Text>}
              />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>Orașul tău</Text>
              <Text style={styles.rowSub}>Disponibil exclusiv în București & Ilfov</Text>
            </View>
          </View>

          <View style={styles.chipsWrap}>
            {BEAVY_CITIES.map((city) => {
              const active = preferences.city === city;
              return (
                <Pressable
                  key={city}
                  onPress={() => {
                    triggerHaptic('selection');
                    onUpdatePreferences({ city, sector: city === 'București' ? preferences.sector : null });
                    onShowFeedback(`Orașul a fost actualizat la ${city}.`);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {city}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {preferences.city === 'București' && (
            <View style={styles.sectorBlock}>
              <Text style={styles.sectorOverline}>Localizare pe Sector</Text>
              <View style={styles.chipsWrap}>
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    onUpdatePreferences({ sector: null });
                    onShowFeedback('Toate sectoarele din București sunt active.');
                  }}
                  style={[styles.chip, !preferences.sector && styles.chipActive]}
                >
                  <Text style={[styles.chipText, !preferences.sector && styles.chipTextActive]}>
                    Toată Capitala
                  </Text>
                </Pressable>
                {BUCHAREST_SECTORS.map((sec) => {
                  const active = preferences.sector === sec.sector;
                  return (
                    <Pressable
                      key={sec.sector}
                      onPress={() => {
                        triggerHaptic('selection');
                        onUpdatePreferences({ sector: sec.sector });
                        onShowFeedback(`Localizare: ${sec.name} (${sec.neighborhoods.slice(0, 3).join(', ')})`);
                      }}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {sec.shortName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Mod cumpărare */}
        <View style={styles.stackedRow}>
          <View style={styles.stackedHeader}>
            <View style={styles.iconCircle}>
              <SymbolView
                name="basket.fill"
                tintColor={C.primary}
                size={14}
                fallback={<Text style={styles.fallbackGlyph}>▣</Text>}
              />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>Canal de cumpărare</Text>
            </View>
          </View>

          <BeavySegmentedControl
            options={[
              { id: 'all', label: 'Ambele' },
              { id: 'physical', label: 'Doar fizic' },
              { id: 'online', label: 'Doar online' },
            ]}
            value={preferences.preferredChannel}
            onChange={(next) => {
              onUpdatePreferences({ preferredChannel: next });
              onShowFeedback('Canalul de cumpărare a fost actualizat.');
            }}
          />
        </View>

        <View style={styles.divider} />

        {/* Preferințe de livrare */}
        <View style={styles.stackedRow}>
          <View style={styles.stackedHeader}>
            <View style={styles.iconCircle}>
              <SymbolView
                name="shippingbox.fill"
                tintColor={C.primary}
                size={14}
                fallback={<Text style={styles.fallbackGlyph}>↗</Text>}
              />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>Preferință livrare</Text>
            </View>
          </View>

          <BeavySegmentedControl
            options={[
              { id: 'lowest_fee', label: 'Cost minim' },
              { id: 'fastest', label: 'Rapidă' },
              { id: 'pickup', label: 'Din magazin' },
            ]}
            value={deliveryPref}
            onChange={(next) => {
              onUpdatePreferences({ deliveryPreference: next });
              onShowFeedback('Preferința de livrare a fost salvată.');
            }}
          />

          <View style={styles.chipsWrap}>
            {(
              [
                { id: 'flexible', label: 'Oricând' },
                { id: 'morning', label: 'Dimineața (08–12)' },
                { id: 'evening', label: 'Seara (17–21)' },
              ] as const
            ).map((slot) => {
              const active = deliverySlot === slot.id;
              return (
                <Pressable
                  key={slot.id}
                  onPress={() => {
                    triggerHaptic('selection');
                    onUpdatePreferences({ preferredDeliverySlot: slot.id });
                    onShowFeedback(`Interval preferat: ${slot.label}.`);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {slot.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Magazine preferate */}
        <View style={styles.stackedRow}>
          <View style={styles.stackedHeader}>
            <View style={styles.iconCircle}>
              <SymbolView
                name="storefront.fill"
                tintColor={C.primary}
                size={14}
                fallback={<Text style={styles.fallbackGlyph}>⌂</Text>}
              />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>Magazine preferate</Text>
            </View>
          </View>

          {retailers.length > 0 ? (
            <View style={styles.chipsWrap}>
              {retailers.map((r) => {
                const selected = (preferences.preferredRetailerSlugs ?? []).includes(
                  r.slug
                );
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => onToggleRetailer(r.slug)}
                    style={[
                      styles.retailerPill,
                      selected && styles.retailerPillSelected,
                    ]}
                  >
                    <RetailerLogo
                      retailerName={r.name}
                      slug={r.slug}
                      logoUrl={r.logo_url}
                      size={22}
                      shape="circle"
                    />
                    <Text
                      style={[
                        styles.retailerText,
                        selected && styles.retailerTextSelected,
                      ]}
                    >
                      {r.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.loadingNote}>
              {`Se încarcă magazinele disponibile în ${preferences.city}...`}
            </Text>
          )}
        </View>

        <View style={styles.divider} />

        {/* Alerte & Fidelitate */}
        <View style={styles.toggleRow}>
          <View style={styles.iconCircle}>
            <SymbolView
              name="creditcard.fill"
              tintColor={C.primary}
              size={14}
              fallback={<Text style={styles.fallbackGlyph}>◈</Text>}
            />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>Carduri de fidelitate</Text>
          </View>
          <Switch
            value={applyLoyaltyCards}
            onValueChange={(val) => {
              triggerHaptic('selection');
              onUpdatePreferences({ applyLoyaltyCards: val });
              onShowFeedback(
                val
                  ? 'Reducerile prin carduri de fidelitate sunt incluse în calcule.'
                  : 'Comparația afișează prețurile standard fără carduri.'
              );
            }}
            trackColor={{ false: C.secondary, true: C.primary }}
            thumbColor={C.surface}
          />
        </View>

        {applyLoyaltyCards && (
          <View style={styles.loyaltyWalletWrap}>
            <View style={styles.chipsWrap}>
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  onUpdatePreferences({ ownedLoyaltyPrograms: undefined });
                  onShowFeedback('Toate programele de fidelitate sunt incluse.');
                }}
                style={[
                  styles.chip,
                  ownedLoyalty === null && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    ownedLoyalty === null && styles.chipTextActive,
                  ]}
                >
                  Toate (8)
                </Text>
              </Pressable>
              {ALL_LOYALTY_PROGRAMS.map((prog) => {
                const isSelected =
                  ownedLoyalty !== null && ownedLoyalty.includes(prog);
                return (
                  <Pressable
                    key={prog}
                    onPress={() => {
                      triggerHaptic('selection');
                      const base = ownedLoyalty ?? [...ALL_LOYALTY_PROGRAMS];
                      const next = base.includes(prog)
                        ? base.filter((p) => p !== prog)
                        : [...base, prog];
                      if (next.length === 0) {
                        onUpdatePreferences({ ownedLoyaltyPrograms: undefined });
                      } else if (next.length === ALL_LOYALTY_PROGRAMS.length) {
                        onUpdatePreferences({ ownedLoyaltyPrograms: undefined });
                      } else {
                        onUpdatePreferences({ ownedLoyaltyPrograms: next });
                      }
                    }}
                    style={[styles.chip, isSelected && styles.chipActive]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && styles.chipTextActive,
                      ]}
                    >
                      {prog}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.divider} />

        {/* Învățare preferințe (Preference Intelligence) */}
        <View style={styles.toggleRow}>
          <View style={styles.iconCircle}>
            <SymbolView
              name="slider.horizontal.3"
              tintColor={C.primary}
              size={14}
              fallback={<Text style={styles.fallbackGlyph}>✦</Text>}
            />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>Învățare preferințe</Text>
          </View>
          {learnPreferencesEnabled &&
            learnedPreferencesCount > 0 &&
            onClearLearnedPreferences && (
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  onClearLearnedPreferences();
                }}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.chipText}>
                  {`Resetează (${learnedPreferencesCount})`}
                </Text>
              </Pressable>
            )}
          <Switch
            value={learnPreferencesEnabled}
            onValueChange={(val) => {
              triggerHaptic('selection');
              onUpdatePreferences({ learnPreferencesEnabled: val });
              onShowFeedback(
                val
                  ? 'Învățarea preferințelor a fost activată.'
                  : 'Învățarea preferințelor a fost dezactivată.'
              );
            }}
            trackColor={{ false: C.secondary, true: C.primary }}
            thumbColor={C.surface}
          />
        </View>

        <View style={styles.divider} />

        {/* Asistent AI Claude 3.5 Haiku - Direct în aplicație cu sistem nativ de credite */}
        <View style={styles.stackedRow}>
          <View style={styles.stackedHeader}>
            <View style={styles.iconCircle}>
              <SymbolView
                name="sparkles"
                tintColor={C.primary}
                size={14}
                fallback={<Text style={styles.fallbackGlyph}>✦</Text>}
              />
            </View>
            <View style={styles.rowCopy}>
              <View style={styles.aiHeaderTitleRow}>
                <Text style={styles.rowLabel}>Asistent AI Rețete & Coș</Text>
                <View style={styles.aiActiveBadge}>
                  <Text style={styles.aiActiveBadgeText}>Google Gemini Flash</Text>
                </View>
              </View>
              <Text style={styles.rowSub}>
                Direct în aplicație · Extrage ingrediente, separă cămara și compune coșul optim (gratuit & rapid).
              </Text>
            </View>
          </View>

          {/* Card nativ AI */}
          <View style={styles.creditsCard}>
            <View style={styles.creditsTopRow}>
              <View style={styles.creditsStatusWrap}>
                <View style={styles.creditsLiveDot} />
                <Text style={styles.creditsStatusText}>Activ nativ în aplicație</Text>
              </View>
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setShowApiKeyInput((v) => !v);
                }}
                style={({ pressed }) => [styles.devToggleBtn, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.devToggleText}>
                  {showApiKeyInput ? 'Ascunde' : 'Setări cheie'}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.apiKeyHint}>
              Disponibil instant în Chat și la importul rețetelor pentru toți utilizatorii, fără logare sau limitări.
            </Text>

            {showApiKeyInput && (
              <View style={styles.apiKeyBox}>
                <Text style={styles.apiKeyHint}>
                  Opțional: Cheie API Google Gemini (sau Claude) dedicată pentru suprascriere locală:
                </Text>
                <TextInput
                  value={apiKeyInput}
                  onChangeText={setApiKeyInput}
                  placeholder="AIzaSy... (Gemini) sau sk-ant-..."
                  placeholderTextColor={C.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={hasApiKey && apiKeyInput.length > 10}
                  style={styles.apiKeyInput}
                />
                <View style={styles.apiKeyActions}>
                  {hasApiKey && (
                    <Pressable
                      onPress={() => {
                        setApiKeyInput('');
                        handleSaveApiKey();
                      }}
                      style={({ pressed }) => [
                        styles.apiKeySecondaryBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.apiKeySecondaryText}>Șterge cheia</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={handleSaveApiKey}
                    style={({ pressed }) => [
                      styles.apiKeySaveBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.apiKeySaveText}>Salvează</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={styles.iconCircle}>
            <SymbolView
              name="bell.fill"
              tintColor={C.primary}
              size={15}
              fallback={<Text style={styles.fallbackGlyph}>•</Text>}
            />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>Alerte modificări de preț</Text>
          </View>
          <Switch
            value={priceAlertsEnabled}
            onValueChange={(val) => {
              triggerHaptic('selection');
              onUpdatePreferences({ priceAlertsEnabled: val });
              onShowFeedback(
                val
                  ? 'Alertele de preț au fost activate.'
                  : 'Alertele de preț au fost dezactivate.'
              );
            }}
            trackColor={{ false: C.secondary, true: C.primary }}
            thumbColor={C.surface}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={styles.iconCircle}>
            <SymbolView
              name="calendar"
              tintColor={C.primary}
              size={15}
              fallback={<Text style={styles.fallbackGlyph}>•</Text>}
            />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>Notificări săptămânale</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={(val) => {
              triggerHaptic('selection');
              onUpdatePreferences({ notificationsEnabled: val });
              onShowFeedback(
                val
                  ? 'Notificările săptămânale au fost activate.'
                  : 'Notificările săptămânale au fost dezactivate.'
              );
            }}
            trackColor={{ false: C.secondary, true: C.primary }}
            thumbColor={C.surface}
          />
        </View>
      </BeavySurface>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 12.5,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.75,
    paddingHorizontal: 4,
  },
  groupCard: {
    paddingVertical: 2,
  },
  rowPress: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
    minHeight: 52,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  stackedRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  stackedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fallbackGlyph: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowLabel: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 14,
    color: C.primary,
  },
  rowSub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12,
    color: C.muted,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: C.rule,
    marginLeft: 62,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  sectorBlock: {
    marginTop: 10,
    gap: 6,
  },
  sectorOverline: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 11,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chip: {
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: C.primary,
  },
  chipText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: C.primary,
  },
  chipTextActive: {
    color: C.surface,
  },
  retailerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: C.background,
    borderRadius: BeavyRadius.pill,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retailerPillSelected: {
    backgroundColor: C.secondary,
  },
  retailerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  retailerText: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 12.5,
    color: C.muted,
  },
  retailerTextSelected: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
  loadingNote: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.muted,
  },
  loyaltyWalletWrap: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  loyaltyWalletLabel: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 11.5,
    color: C.muted,
  },
  apiKeyBox: {
    marginTop: 10,
    gap: 8,
  },
  apiKeyInput: {
    minHeight: 44,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.rule,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: BeavyFonts.medium,
    color: C.primary,
  },
  apiKeyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  apiKeySecondaryBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apiKeySecondaryText: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 12,
    color: C.muted,
  },
  apiKeySaveBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apiKeySaveText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: C.surface,
  },
  aiHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  aiActiveBadge: {
    backgroundColor: C.leek,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BeavyRadius.pill,
  },
  aiActiveBadgeText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 10.5,
    color: C.primary,
  },
  creditsCard: {
    marginTop: 12,
    backgroundColor: C.background,
    borderRadius: BeavyRadius.lg,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: C.rule,
  },
  creditsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  creditsStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creditsLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#38A169',
  },
  creditsStatusText: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 11.5,
    color: C.primary,
  },
  devToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  devToggleText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
    textDecorationLine: 'underline',
  },
  apiKeyHint: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
    lineHeight: 15,
  },
  pressed: {
    opacity: 0.72,
  },
});
