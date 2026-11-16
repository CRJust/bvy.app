import { SymbolView, type SFSymbol } from 'expo-symbols';
import React, {
  type ComponentRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ChangePasswordModal,
  DeleteAccountModal,
  EditProfileModal,
  PrivacyModal,
} from '@/components/account/account-modals';
import { PantryFrequentCard } from '@/components/account/pantry-frequent-card';
import { PartnerClicksCard } from '@/components/account/partner-clicks-card';
import { SavingsAndHistoryCard } from '@/components/account/savings-and-history-card';
import { ShoppingPrefsSection } from '@/components/account/shopping-prefs-section';
import { BeavyAuthView } from '@/components/beavy-auth-view';
import {
  BeavyOnboardingModal,
  type OnboardingResults,
} from '@/components/beavy-onboarding-modal';
import { BeavyScreenTransition } from '@/components/screen-transition';
import { BeavyHeader } from '@/components/ui/beavy-header';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  BeavyShadows,
  triggerHaptic,
} from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useShopping } from '@/context/shopping-context';
import {
  type BeavyRetailer,
  fetchActiveRetailers,
} from '@/services/beavy-comparison';

const CHANNEL_SHORT_LABEL: Record<'all' | 'physical' | 'online', string> = {
  all: 'Fizic și Online',
  physical: 'Magazin fizic',
  online: 'Livrare online',
};

type AccountActionRowProps = {
  icon: SFSymbol;
  fallbackGlyph: string;
  label: string;
  subtitle?: string;
  destructive?: boolean;
  isLast?: boolean;
  onPress: () => void;
};

function AccountActionRow({
  icon,
  fallbackGlyph,
  label,
  subtitle,
  destructive = false,
  isLast = false,
  onPress,
}: AccountActionRowProps) {
  return (
    <Pressable
      onPress={() => {
        triggerHaptic(destructive ? 'medium' : 'selection');
        onPress();
      }}
      style={({ pressed }) => [
        styles.actionRow,
        !isLast && styles.actionRowBorder,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.actionIconCircle,
          destructive && styles.actionIconCircleDestructive,
        ]}
      >
        <SymbolView
          name={icon}
          tintColor={C.primary}
          size={15}
          fallback={<Text style={styles.fallbackGlyph}>{fallbackGlyph}</Text>}
        />
      </View>

      <View style={styles.actionCopy}>
        <Text
          style={[styles.actionLabel, destructive && styles.actionLabelDestructive]}
        >
          {label}
        </Text>
        {!!subtitle && <Text style={styles.actionSub}>{subtitle}</Text>}
      </View>

      <SymbolView
        name="chevron.right"
        tintColor={C.muted}
        size={12}
        fallback={<Text style={styles.fallbackGlyph}>›</Text>}
      />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { user, signOut, updatePassword } = useAuth();
  const {
    preferences,
    preferenceMemory,
    updatePreferences,
    clearPreferenceMemory,
    resetAllData,
    lists,
    purchasedItems,
    shoppingHistory,
    clearShoppingHistory,
    outboundClicks,
    clearOutboundClicks,
    loadDemoBaskets,
    getProductQuantity,
    updateCatalogProductQuantity,
  } = useShopping();

  const [retailers, setRetailers] = useState<BeavyRetailer[]>([]);
  const [feedbackBanner, setFeedbackBanner] = useState('');
  const [showScrolledRule, setShowScrolledRule] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [draftName, setDraftName] = useState('');
  const [draftEmail, setDraftEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchActiveRetailers()
      .then((list) => {
        if (!cancelled) {
          setRetailers(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRetailers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const showFeedback = useCallback((message: string) => {
    setFeedbackBanner(message);
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackBanner('');
      feedbackTimerRef.current = null;
    }, 3400);
  }, []);

  const authFullName =
    typeof user?.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name.trim()
      : '';
  const displayName =
    authFullName || preferences.userName?.trim() || 'Cumpărător';
  const displayEmail =
    user?.email || preferences.userEmail?.trim() || '';

  const initials = useMemo(() => {
    const raw =
      authFullName ||
      user?.email?.split('@')[0]?.trim() ||
      preferences.userName?.trim() ||
      'B';
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase();
  }, [authFullName, user?.email, preferences.userName]);

  const handleToggleRetailer = useCallback(
    (slug: string) => {
      triggerHaptic('selection');
      const current = preferences.preferredRetailerSlugs ?? [];
      const exists = current.includes(slug);
      const next = exists
        ? current.filter((item) => item !== slug)
        : [...current, slug];

      const toggledRetailer = retailers.find((r) => r.slug === slug);
      const addedOnlineOnly =
        !exists &&
        toggledRetailer &&
        !toggledRetailer.supports_physical &&
        toggledRetailer.supports_delivery &&
        preferences.preferredChannel === 'physical';
      const addedPhysicalOnly =
        !exists &&
        toggledRetailer &&
        toggledRetailer.supports_physical &&
        !toggledRetailer.supports_delivery &&
        preferences.preferredChannel === 'online';

      if (addedOnlineOnly || addedPhysicalOnly) {
        updatePreferences({
          preferredRetailerSlugs: next,
          preferredChannel: 'all',
        });
        showFeedback(
          'Magazin adăugat și canalul comutat pe Ambele (Fizic + Livrare).'
        );
        return;
      }

      updatePreferences({ preferredRetailerSlugs: next });
      showFeedback(
        exists
          ? 'Magazin scos din preferințe.'
          : 'Magazin adăugat la preferințe.'
      );
    },
    [
      preferences.preferredChannel,
      preferences.preferredRetailerSlugs,
      retailers,
      showFeedback,
      updatePreferences,
    ]
  );

  const handleCompleteOnboarding = useCallback(
    (results: OnboardingResults) => {
      setOnboardingOpen(false);
      updatePreferences({
        city: results.city,
        preferredChannel: results.preferredChannel,
        preferredRetailerSlugs: results.preferredRetailerSlugs,
        hasCompletedOnboarding: true,
      });
      showFeedback(`Preferințele pentru ${results.city} au fost actualizate.`);
    },
    [showFeedback, updatePreferences]
  );

  const handleOpenEditProfile = useCallback(() => {
    setDraftName(displayName);
    setDraftEmail(displayEmail);
    setEditOpen(true);
  }, [displayEmail, displayName]);

  const handleSaveEditProfile = useCallback(() => {
    const cleanName = draftName.trim();
    const cleanEmail = draftEmail.trim();
    if (!cleanName) {
      showFeedback('Introdu un nume valid.');
      return;
    }
    updatePreferences({
      userName: cleanName,
      userEmail: cleanEmail || displayEmail,
    });
    setEditOpen(false);
    showFeedback('Datele de profil au fost actualizate.');
  }, [displayEmail, draftEmail, draftName, showFeedback, updatePreferences]);

  const handleOpenPasswordModal = useCallback(() => {
    if (!user) {
      showFeedback('Conectează-te mai întâi pentru a gestiona parola contului.');
      setAuthModalOpen(true);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordOpen(true);
  }, [showFeedback, user]);

  const handleSubmitPassword = useCallback(async () => {
    setPasswordError('');
    if (!currentPassword.trim()) {
      setPasswordError('Introdu parola curentă pentru confirmare.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Noua parolă trebuie să conțină cel puțin 8 caractere.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Parolele noi nu coincid.');
      return;
    }

    const { error } = await updatePassword(currentPassword, newPassword);
    if (error) {
      setPasswordError(error || 'Nu am putut actualiza parola.');
      return;
    }

    setPasswordOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    showFeedback('Parola contului a fost actualizată.');
  }, [
    confirmPassword,
    currentPassword,
    newPassword,
    showFeedback,
    updatePassword,
  ]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    showFeedback('Te-ai deconectat din contul Beavy.');
  }, [showFeedback, signOut]);

  const handleConfirmDeleteAccount = useCallback(async () => {
    setDeleteOpen(false);
    resetAllData();
    if (user) {
      await signOut();
    }
    showFeedback('Datele locale au fost șterse și sesiunea a fost închisă.');
  }, [resetAllData, showFeedback, signOut, user]);

  const handleClearHistoryRequest = useCallback(() => {
    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined' &&
        window.confirm(
          'Sigur dorești să ștergi istoricul sesiunilor și totalul economiilor verificate?'
        );
      if (ok) {
        clearShoppingHistory();
        showFeedback('Istoricul sesiunilor a fost șters.');
      }
      return;
    }

    Alert.alert(
      'Curăță istoricul',
      'Sigur dorești să ștergi istoricul sesiunilor și totalul economiilor verificate?',
      [
        { text: 'Anulează', style: 'cancel' },
        {
          text: 'Curăță',
          style: 'destructive',
          onPress: () => {
            clearShoppingHistory();
            showFeedback('Istoricul sesiunilor a fost șters.');
          },
        },
      ]
    );
  }, [clearShoppingHistory, showFeedback]);

  const preferredCount = (preferences.preferredRetailerSlugs ?? []).length;
  const totalVerifiedSavings = useMemo(
    () =>
      Math.round(
        shoppingHistory.reduce((sum, item) => sum + (item.verifiedSavings || 0), 0) * 100
      ) / 100,
    [shoppingHistory]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <BeavyScreenTransition style={styles.container}>
        <BeavyHeader
          userInitials={initials}
          onPressProfile={() => {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
          }}
          showBottomRule={showScrolledRule}
        />

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(128, insets.bottom + 104) },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const nextRule = e.nativeEvent.contentOffset.y > 6;
            if (nextRule !== showScrolledRule) {
              setShowScrolledRule(nextRule);
            }
          }}
        >
          {/* Titlu editorial secțiune */}
          <View style={styles.pageIntro}>
            <Text style={styles.pageTitle}>Contul tău</Text>
            <Text style={styles.pageSub}>
              {user
                ? `Sincronizat în ${preferences.city} · ${CHANNEL_SHORT_LABEL[preferences.preferredChannel]}`
                : `Mod local pe dispozitiv · ${preferences.city}`}
            </Text>
          </View>

          {!!feedbackBanner && (
            <View style={styles.feedbackBanner} accessibilityLiveRegion="polite">
              <SymbolView
                name="checkmark.circle.fill"
                tintColor={C.leekDark}
                size={16}
                fallback={<Text style={styles.feedbackFallback}>✓</Text>}
              />
              <Text style={styles.feedbackText}>{feedbackBanner}</Text>
            </View>
          )}

          {/* Wallet card Cherry: identitate + economii verificate cumulate */}
          <View style={styles.cherryWalletCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.avatarLg}>
                <Text style={styles.avatarLgText}>{initials}</Text>
              </View>

              <View style={styles.identityCopy}>
                <Text numberOfLines={1} style={styles.identityName}>
                  {displayName}
                </Text>
                {displayEmail ? (
                  <Text numberOfLines={1} style={styles.identityEmail}>
                    {displayEmail}
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  handleOpenEditProfile();
                }}
                style={({ pressed }) => [
                  styles.editBtn,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Editează profilul"
              >
                <Text style={styles.editBtnText}>Editează</Text>
              </Pressable>
            </View>

            <View style={styles.walletMetricsRow}>
              <View style={styles.walletMetricCol}>
                <Text style={styles.walletMetricOverline}>Economii</Text>
                <Text style={styles.walletMetricHighlight}>
                  {`${totalVerifiedSavings.toFixed(2)} RON`}
                </Text>
              </View>
              <View style={styles.walletMetricDivider} />
              <View style={styles.walletMetricCol}>
                <Text style={styles.walletMetricOverline}>Sesiuni</Text>
                <Text style={styles.walletMetricNum}>{shoppingHistory.length}</Text>
              </View>
              <View style={styles.walletMetricDivider} />
              <View style={styles.walletMetricCol}>
                <Text style={styles.walletMetricOverline}>Liste</Text>
                <Text style={styles.walletMetricNum}>{lists.length}</Text>
              </View>
            </View>

            <View style={styles.metaPillsRow}>
              <View
                style={[
                  styles.statusBadge,
                  user ? styles.statusBadgeSync : styles.statusBadgeLocal,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    user ? styles.statusTextSync : styles.statusTextLocal,
                  ]}
                >
                  {user ? 'Cont sincronizat' : 'Mod local'}
                </Text>
              </View>

              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>
                  {preferredCount > 0
                    ? `${preferredCount} ${preferredCount === 1 ? 'magazin preferat' : 'magazine preferate'}`
                    : 'Toate magazinele'}
                </Text>
              </View>
            </View>
          </View>

          {/* Invitație conectare pentru modul local */}
          {!user && (
            <BeavySurface variant="tonal" style={styles.guestCtaCard}>
              <View style={styles.guestCopy}>
                <Text style={styles.guestTitle}>
                  Păstrează contul și preferințele în siguranță
                </Text>
                <Text style={styles.guestSub}>
                  Conectează-te sau creează un cont gratuit pentru sincronizare pe dispozitivele tale.
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setAuthModalOpen(true);
                }}
                style={({ pressed }) => [
                  styles.guestPrimaryBtn,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <SymbolView
                  name="person.crop.circle.badge.plus"
                  tintColor={C.primary}
                  size={17}
                  fallback={<Text style={styles.guestBtnGlyph}>+</Text>}
                />
                <Text style={styles.guestPrimaryBtnText}>
                  Conectează-te sau creează cont
                </Text>
              </Pressable>
            </BeavySurface>
          )}

          {/* Cămara Mea & Produse Cumpărate Frecvent (1-Tap Re-Add) */}
          <PantryFrequentCard
            preferenceMemory={preferenceMemory}
            purchasedItems={purchasedItems}
            getProductQuantity={getProductQuantity}
            onStepProduct={(prod, nextQty) => {
              updateCatalogProductQuantity(prod, nextQty);
              if (nextQty > 0) {
                showFeedback(`„${prod.canonical_name}” adăugat în lista activă.`);
              }
            }}
          />

          {/* Istoric cumpărături & economii verificate */}
          <SavingsAndHistoryCard
            history={shoppingHistory}
            purchasedCount={purchasedItems.length}
            onClearHistory={handleClearHistoryRequest}
          />

          {/* Măsurare click-uri parteneri (atribuire UTM + intenție coș) */}
          <PartnerClicksCard
            clicks={outboundClicks}
            onClearClicks={() => {
              clearOutboundClicks();
              showFeedback('Contorul de click-uri a fost resetat.');
            }}
            onLoadDemoBaskets={() => {
              loadDemoBaskets();
              showFeedback('Cele 2 coșuri Demo au fost încărcate în Listă.');
            }}
          />

          {/* Preferințe cumpărături, magazine preferate & livrare */}
          <ShoppingPrefsSection
            preferences={preferences}
            retailers={retailers}
            learnedPreferencesCount={
              Object.keys(preferenceMemory.learnedResolutions).length +
              Object.keys(preferenceMemory.brandAffinity).length
            }
            onUpdatePreferences={updatePreferences}
            onClearLearnedPreferences={() => {
              clearPreferenceMemory();
              showFeedback('Preferințele învățate au fost resetate.');
            }}
            onToggleRetailer={handleToggleRetailer}
            onOpenOnboarding={() => setOnboardingOpen(true)}
            onShowFeedback={showFeedback}
          />

          {/* Secțiune Cont și securitate */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cont și securitate</Text>
            <BeavySurface variant="elevated" style={styles.groupCard}>
              <AccountActionRow
                icon="person.text.rectangle"
                fallbackGlyph="✎"
                label="Editează profilul"
                onPress={handleOpenEditProfile}
              />
              <AccountActionRow
                icon="lock.shield.fill"
                fallbackGlyph="⚿"
                label="Schimbă parola"
                onPress={handleOpenPasswordModal}
              />
              <AccountActionRow
                icon="hand.raised.fill"
                fallbackGlyph="§"
                label="Confidențialitate"
                onPress={() => setPrivacyOpen(true)}
              />
              {user && (
                <AccountActionRow
                  icon="rectangle.portrait.and.arrow.right"
                  fallbackGlyph="↪"
                  label="Deconectare"
                  onPress={() => {
                    void handleSignOut();
                  }}
                />
              )}
              <AccountActionRow
                icon="trash.fill"
                fallbackGlyph="✕"
                label="Șterge contul și datele"
                destructive
                isLast
                onPress={() => setDeleteOpen(true)}
              />
            </BeavySurface>
          </View>

          <Text style={styles.footerVersion}>
            beavy. 2.0
          </Text>
        </ScrollView>

        <EditProfileModal
          visible={editOpen}
          name={draftName}
          email={draftEmail}
          onChangeName={setDraftName}
          onChangeEmail={setDraftEmail}
          onClose={() => setEditOpen(false)}
          onSave={handleSaveEditProfile}
        />

        <ChangePasswordModal
          visible={passwordOpen}
          currentPassword={currentPassword}
          newPassword={newPassword}
          confirmPassword={confirmPassword}
          passwordError={passwordError}
          onChangeCurrent={setCurrentPassword}
          onChangeNew={setNewPassword}
          onChangeConfirm={setConfirmPassword}
          onClose={() => setPasswordOpen(false)}
          onSubmit={() => {
            void handleSubmitPassword();
          }}
        />

        <PrivacyModal
          visible={privacyOpen}
          onClose={() => setPrivacyOpen(false)}
          onSaveAndClose={() => {
            setPrivacyOpen(false);
            showFeedback('Setările de confidențialitate au fost salvate.');
          }}
        />

        <DeleteAccountModal
          visible={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirmDelete={() => {
            void handleConfirmDeleteAccount();
          }}
        />

        <BeavyOnboardingModal
          visible={onboardingOpen}
          initialCity={preferences.city}
          initialChannel={preferences.preferredChannel}
          initialRetailers={preferences.preferredRetailerSlugs}
          onComplete={handleCompleteOnboarding}
          onDismiss={() => setOnboardingOpen(false)}
        />

        <Modal
          visible={authModalOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setAuthModalOpen(false)}
        >
          <BeavyAuthView
            isModal
            onSuccess={() => {
              setAuthModalOpen(false);
              showFeedback('Te-ai conectat în contul Beavy.');
            }}
            onSkip={() => setAuthModalOpen(false)}
          />
        </Modal>
      </BeavyScreenTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  container: {
    flex: 1,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: C.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 6,
    gap: 20,
  },
  pageIntro: {
    gap: 2,
    paddingHorizontal: 2,
  },
  pageTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 28,
    lineHeight: 34,
    color: C.primary,
    letterSpacing: -0.7,
  },
  pageSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 13.5,
    color: C.muted,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  feedbackFallback: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 13,
    color: C.leekDark,
  },
  feedbackText: {
    flex: 1,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13,
    color: C.leekDark,
  },
  cherryWalletCard: {
    backgroundColor: C.primary,
    borderRadius: 24,
    padding: 18,
    gap: 14,
    ...BeavyShadows.floating,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarLg: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarLgText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 17,
    color: C.primary,
    letterSpacing: 0.4,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  identityName: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 18,
    color: C.background,
    letterSpacing: -0.3,
  },
  identityEmail: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12.5,
    color: 'rgba(255, 246, 238, 0.72)',
  },
  editBtn: {
    minHeight: 40,
    minWidth: 72,
    borderRadius: BeavyRadius.pill,
    backgroundColor: 'rgba(255, 246, 238, 0.14)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  editBtnText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12.5,
    color: C.background,
  },
  walletMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 246, 238, 0.08)',
    borderRadius: BeavyRadius.lg,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 246, 238, 0.12)',
  },
  walletMetricCol: {
    flex: 1,
    gap: 2,
  },
  walletMetricDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255, 246, 238, 0.14)',
    marginHorizontal: 10,
  },
  walletMetricOverline: {
    fontSize: 10,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'rgba(255, 246, 238, 0.68)',
  },
  walletMetricHighlight: {
    fontSize: 16,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.leek,
    fontVariant: ['tabular-nums'],
  },
  walletMetricNum: {
    fontSize: 16,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.background,
    fontVariant: ['tabular-nums'],
  },
  metaPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  statusBadge: {
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeSync: {
    backgroundColor: C.leek,
  },
  statusBadgeLocal: {
    backgroundColor: 'rgba(255, 246, 238, 0.14)',
  },
  statusBadgeText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 11.5,
  },
  statusTextSync: {
    color: C.leekDark,
  },
  statusTextLocal: {
    color: C.background,
  },
  metaPill: {
    backgroundColor: 'rgba(255, 246, 238, 0.12)',
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaPillText: {
    fontFamily: BeavyFonts.semiBold,
    fontWeight: '600',
    fontSize: 11.5,
    color: 'rgba(255, 246, 238, 0.85)',
  },
  guestCtaCard: {
    padding: 18,
    gap: 14,
  },
  guestCopy: {
    gap: 4,
  },
  guestTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 16,
    color: C.primary,
    letterSpacing: -0.2,
  },
  guestSub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 13,
    lineHeight: 18.5,
    color: C.muted,
  },
  guestPrimaryBtn: {
    minHeight: 46,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  guestBtnGlyph: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 16,
    color: C.primary,
  },
  guestPrimaryBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 14,
    color: C.primary,
  },
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
    minHeight: 56,
  },
  actionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  actionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionIconCircleDestructive: {
    backgroundColor: 'rgba(247, 141, 121, 0.25)',
  },
  fallbackGlyph: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  actionLabel: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 14,
    color: C.primary,
  },
  actionLabelDestructive: {
    color: C.primary,
  },
  actionSub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12,
    color: C.muted,
    lineHeight: 16,
  },
  faqItem: {
    paddingHorizontal: 16,
  },
  faqItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  faqTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 50,
    paddingVertical: 12,
  },
  faqQuestion: {
    flex: 1,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 13.5,
    color: C.primary,
    lineHeight: 19,
  },
  faqAnswer: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: C.muted,
    paddingBottom: 14,
    paddingRight: 18,
  },
  footerVersion: {
    textAlign: 'center',
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.muted,
    paddingTop: 4,
  },
  pressed: {
    opacity: 0.72,
  },
});
