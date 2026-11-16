import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BeavyColors as C, BeavyFonts, triggerHaptic } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useShopping } from '@/context/shopping-context';

type BeavyAuthViewProps = {
  onSuccess?: () => void;
  onSkip?: () => void;
  isModal?: boolean;
};

export function BeavyAuthView({
  onSuccess,
  onSkip,
  isModal = false,
}: BeavyAuthViewProps) {
  const { signIn, signUp, resetPassword } = useAuth();
  const { updatePreferences } = useShopping();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const clearMessages = () => {
    setErrorMessage('');
    setInfoMessage('');
  };

  const handleSwitchMode = (nextMode: 'signin' | 'signup' | 'forgot') => {
    triggerHaptic('selection');
    clearMessages();
    setMode(nextMode);
  };

  const handleSubmit = async () => {
    clearMessages();
    triggerHaptic('medium');
    setLoading(true);

    try {
      if (mode === 'forgot') {
        const res = await resetPassword(email);
        if (res.error) {
          setErrorMessage(res.error);
        } else {
          setInfoMessage('Ți-am trimis un link de resetare a parolei pe email.');
        }
        return;
      }

      if (mode === 'signup') {
        const res = await signUp(email, password, fullName);
        if (res.error) {
          setErrorMessage(res.error);
        } else if (res.needsConfirmation) {
          setInfoMessage(
            'Contul a fost creat! Te rugăm să verifici căsuța de email pentru confirmare.'
          );
        } else {
          if (fullName.trim()) {
            updatePreferences({
              userName: fullName.trim(),
              userEmail: email.trim().toLowerCase(),
            });
          }
          if (onSuccess) onSuccess();
        }
        return;
      }

      // Mode: signin
      const res = await signIn(email, password);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        if (onSuccess) onSuccess();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardContainer}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isModal && styles.modalScrollContent,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* BRAND HEADER */}
        <View style={styles.brandHero}>
          <Image
            source={require('@/assets/images/beavy-logo.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <Text style={styles.wordmark}>beavy.</Text>
          <Text style={styles.tagline}>Același coș. Prețuri diferite.</Text>
        </View>

        {/* CARD AUTENTIFICARE MINIMALISTĂ */}
        <View style={styles.card}>
          {/* SEGMENT SWITCH (AUTENTIFICARE / CONT NOU) */}
          {mode !== 'forgot' ? (
            <View style={styles.segmentedRow}>
              <Pressable
                onPress={() => handleSwitchMode('signin')}
                style={[
                  styles.segmentBtn,
                  mode === 'signin' && styles.segmentBtnActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Comută pe Autentificare"
              >
                <Text
                  style={[
                    styles.segmentBtnText,
                    mode === 'signin' && styles.segmentBtnTextActive,
                  ]}
                >
                  Intră în cont
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleSwitchMode('signup')}
                style={[
                  styles.segmentBtn,
                  mode === 'signup' && styles.segmentBtnActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Comută pe Cont nou"
              >
                <Text
                  style={[
                    styles.segmentBtnText,
                    mode === 'signup' && styles.segmentBtnTextActive,
                  ]}
                >
                  Cont nou
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.forgotHeaderRow}>
              <Pressable
                onPress={() => handleSwitchMode('signin')}
                hitSlop={8}
                style={styles.backToSigninBtn}
              >
                <Text style={styles.backToSigninArrow}>←</Text>
                <Text style={styles.backToSigninText}>Înapoi la autentificare</Text>
              </Pressable>
            </View>
          )}

          {/* TITLU & SUBTITLU */}
          <View style={styles.headingBlock}>
            <Text style={styles.headingTitle}>
              {mode === 'signin'
                ? 'Bine ai revenit!'
                : mode === 'signup'
                ? 'Creează-ți contul'
                : 'Resetează parola'}
            </Text>
            <Text style={styles.headingSubtitle}>
              {mode === 'signin'
                ? 'Conectează-te pentru a-ți accesa listele sincronizate.'
                : mode === 'signup'
                ? 'Salvează listele și monitorizează prețurile în orașul tău.'
                : 'Introdu adresa de email și îți trimitem instrucțiunile.'}
            </Text>
          </View>

          {/* MESAJE DE EROARE / INFORMARE */}
          {!!errorMessage && (
            <View style={styles.errorBox}>
              <SymbolView
                name="exclamationmark.circle.fill"
                tintColor={C.strawberry}
                size={14}
                fallback={<Text style={styles.symbolFallback}>!</Text>}
              />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {!!infoMessage && (
            <View style={styles.infoBox}>
              <SymbolView
                name="checkmark.circle.fill"
                tintColor={C.cherry}
                size={14}
                fallback={<Text style={styles.symbolFallback}>✓</Text>}
              />
              <Text style={styles.infoText}>{infoMessage}</Text>
            </View>
          )}

          {/* CÂMP NUME COMPLET (DOAR LA SIGNUP) */}
          {mode === 'signup' && (
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Nume complet</Text>
              <View style={styles.inputWrap}>
                <SymbolView
                  name="person.fill"
                  tintColor={C.muted}
                  size={15}
                  fallback={<Text style={styles.inputIconFallback}>•</Text>}
                />
                <TextInput
                  value={fullName}
                  onChangeText={(val) => {
                    clearMessages();
                    setFullName(val);
                  }}
                  placeholder="ex. Andrei Popescu"
                  placeholderTextColor={C.muted}
                  style={styles.input}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
            </View>
          )}

          {/* CÂMP ADRESĂ EMAIL */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Adresă de email</Text>
            <View style={styles.inputWrap}>
              <SymbolView
                name="envelope.fill"
                tintColor={C.muted}
                size={14}
                fallback={<Text style={styles.inputIconFallback}>@</Text>}
              />
              <TextInput
                value={email}
                onChangeText={(val) => {
                  clearMessages();
                  setEmail(val);
                }}
                placeholder="nume@exemplu.ro"
                placeholderTextColor={C.muted}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType={mode === 'forgot' ? 'done' : 'next'}
                onSubmitEditing={mode === 'forgot' ? handleSubmit : undefined}
              />
            </View>
          </View>

          {/* CÂMP PAROLĂ (SIGNIN & SIGNUP) */}
          {mode !== 'forgot' && (
            <View style={styles.fieldWrap}>
              <View style={styles.passwordLabelRow}>
                <Text style={styles.fieldLabel}>Parolă</Text>
                {mode === 'signin' && (
                  <Pressable
                    onPress={() => handleSwitchMode('forgot')}
                    hitSlop={6}
                  >
                    <Text style={styles.forgotLinkText}>Ai uitat parola?</Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.inputWrap}>
                <SymbolView
                  name="lock.fill"
                  tintColor={C.muted}
                  size={14}
                  fallback={<Text style={styles.inputIconFallback}>#</Text>}
                />
                <TextInput
                  value={password}
                  onChangeText={(val) => {
                    clearMessages();
                    setPassword(val);
                  }}
                  placeholder={
                    mode === 'signup' ? 'Minim 6 caractere' : 'Parola contului'
                  }
                  placeholderTextColor={C.muted}
                  style={styles.input}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  style={styles.eyeBtn}
                >
                  <SymbolView
                    name={showPassword ? 'eye.slash.fill' : 'eye.fill'}
                    tintColor={C.muted}
                    size={15}
                    fallback={
                      <Text style={styles.eyeFallback}>
                        {showPassword ? 'Ascunde' : 'Arată'}
                      </Text>
                    }
                  />
                </Pressable>
              </View>
            </View>
          )}

          {/* BUTON PRINCIPAL CTA */}
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={({ pressed }) => [
              styles.primaryCtaBtn,
              pressed && styles.primaryCtaBtnPressed,
              loading && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'signin'
                ? 'Intră în cont'
                : mode === 'signup'
                ? 'Creează cont'
                : 'Resetează parola'
            }
          >
            {loading ? (
              <ActivityIndicator color={C.white} size="small" />
            ) : (
              <>
                <Text style={styles.primaryCtaBtnText}>
                  {mode === 'signin'
                    ? 'Intră în cont'
                    : mode === 'signup'
                    ? 'Creează contul Beavy'
                    : 'Trimite link de resetare'}
                </Text>
                <Text style={styles.primaryCtaBtnArrow}>→</Text>
              </>
            )}
          </Pressable>

          {/* ACȚIUNE OPȚIONALĂ: CONTINUĂ CA OASPETE */}
          {onSkip && (
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onSkip();
              }}
              style={styles.skipBtn}
              accessibilityRole="button"
              accessibilityLabel="Continuă ca oaspete"
            >
              <Text style={styles.skipBtnText}>Explorează ca oaspete</Text>
            </Pressable>
          )}
        </View>

        {/* NOTĂ DE CONFIDENȚIALITATE */}
        <Text style={styles.footerPrivacyNote}>
          Prin continuarea utilizării, ești de acord cu standardele de confidențialitate Beavy.
          Datele tale nu sunt vândute către terți.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: C.buttermilk,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  modalScrollContent: {
    paddingVertical: 12,
  },
  brandHero: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 44,
    height: 44,
    marginBottom: 6,
  },
  wordmark: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 26,
    color: C.cherry,
    letterSpacing: -0.8,
  },
  tagline: {
    fontFamily: BeavyFonts.medium,
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: C.rule,
    shadowColor: C.cherry,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3,
    gap: 14,
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: C.buttermilk,
    borderRadius: 99,
    padding: 3,
    borderWidth: 1,
    borderColor: C.rule,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 99,
  },
  segmentBtnActive: {
    backgroundColor: C.cherry,
  },
  segmentBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.muted,
  },
  segmentBtnTextActive: {
    color: C.white,
    fontFamily: BeavyFonts.extraBold,
  },
  forgotHeaderRow: {
    paddingBottom: 4,
  },
  backToSigninBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backToSigninArrow: {
    fontSize: 15,
    color: C.cherry,
    fontWeight: '800',
  },
  backToSigninText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.cherry,
  },
  headingBlock: {
    gap: 3,
    marginTop: 2,
  },
  headingTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 20,
    color: C.cherry,
    letterSpacing: -0.4,
  },
  headingSubtitle: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12,
    color: C.muted,
    lineHeight: 17,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.grapefruit,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.strawberry,
  },
  errorText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.cherry,
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.leek,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.leek,
  },
  infoText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.cherry,
    flex: 1,
  },
  fieldWrap: {
    gap: 5,
  },
  fieldLabel: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.cherry,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  forgotLinkText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.strawberry,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.buttermilk,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.rule,
  },
  inputIconFallback: {
    fontSize: 12,
    color: C.muted,
  },
  input: {
    flex: 1,
    fontFamily: BeavyFonts.medium,
    fontSize: 14,
    color: C.cherry,
    padding: 0,
  },
  eyeBtn: {
    padding: 4,
  },
  eyeFallback: {
    fontSize: 13,
  },
  primaryCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.strawberry,
    borderRadius: 99,
    paddingVertical: 14,
    marginTop: 6,
    shadowColor: C.strawberry,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryCtaBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  primaryCtaBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 14,
    color: C.white,
    letterSpacing: -0.2,
  },
  primaryCtaBtnArrow: {
    color: C.white,
    fontSize: 15,
    fontWeight: '800',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  skipBtnText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12,
    color: C.muted,
  },
  footerPrivacyNote: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 18,
    paddingHorizontal: 16,
  },
  symbolFallback: {
    fontSize: 11,
    color: C.cherry,
    fontWeight: '800',
  },
});
