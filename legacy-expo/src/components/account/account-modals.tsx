import { SymbolView } from 'expo-symbols';
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BeavyColors as C, BeavyFonts, BeavyRadius } from '@/constants/theme';

type ChangePasswordModalProps = {
  visible: boolean;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  passwordError: string;
  onChangeCurrent: (v: string) => void;
  onChangeNew: (v: string) => void;
  onChangeConfirm: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function ChangePasswordModal({
  visible,
  currentPassword,
  newPassword,
  confirmPassword,
  passwordError,
  onChangeCurrent,
  onChangeNew,
  onChangeConfirm,
  onClose,
  onSubmit,
}: ChangePasswordModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Schimbă parola</Text>
              <Text style={styles.sub}>Introdu parola curentă și alege una nouă</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <SymbolView
                name="xmark"
                tintColor={C.muted}
                size={14}
                fallback={<Text style={styles.fallbackGlyph}>✕</Text>}
              />
            </Pressable>
          </View>

          {!!passwordError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{passwordError}</Text>
            </View>
          )}

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Parola curentă</Text>
              <TextInput
                value={currentPassword}
                onChangeText={onChangeCurrent}
                placeholder="••••••••"
                placeholderTextColor={C.muted}
                secureTextEntry
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Parolă nouă</Text>
              <TextInput
                value={newPassword}
                onChangeText={onChangeNew}
                placeholder="Minim 8 caractere"
                placeholderTextColor={C.muted}
                secureTextEntry
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Confirmă parola nouă</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={onChangeConfirm}
                placeholder="Reintrodu noua parolă"
                placeholderTextColor={C.muted}
                secureTextEntry
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Anulează</Text>
            </Pressable>
            <Pressable onPress={onSubmit} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Salvează parola</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type PrivacyModalProps = {
  visible: boolean;
  onClose: () => void;
  onSaveAndClose: () => void;
};

export function PrivacyModal({
  visible,
  onClose,
  onSaveAndClose,
}: PrivacyModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Confidențialitate</Text>
              <Text style={styles.sub}>Controlează cum sunt procesate datele tale</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <SymbolView
                name="xmark"
                tintColor={C.muted}
                size={14}
                fallback={<Text style={styles.fallbackGlyph}>✕</Text>}
              />
            </Pressable>
          </View>

          <View style={styles.privacyList}>
            <View style={styles.privacyItem}>
              <View style={styles.privacyCopy}>
                <Text style={styles.privacyTitle}>Stocare locală strictă</Text>
                <Text style={styles.privacyDesc}>
                  Listele, istoricul și economiile rămân pe dispozitiv și nu sunt trimise către rețele de profilare.
                </Text>
              </View>
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>Activ</Text>
              </View>
            </View>

            <View style={styles.privacyItem}>
              <View style={styles.privacyCopy}>
                <Text style={styles.privacyTitle}>Diagnostic anonim prețuri</Text>
                <Text style={styles.privacyDesc}>
                  Sesizează automat ofertele expirate sau indisponibile.
                </Text>
              </View>
              <Switch
                value={true}
                disabled
                trackColor={{ false: C.secondary, true: C.primary }}
                thumbColor={C.surface}
              />
            </View>
          </View>

          <Pressable onPress={onSaveAndClose} style={styles.primaryBtnFull}>
            <Text style={styles.primaryBtnText}>Închide și salvează</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

type DeleteAccountModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirmDelete: () => void;
};

export function DeleteAccountModal({
  visible,
  onClose,
  onConfirmDelete,
}: DeleteAccountModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.cardDestructive}>
          <View style={styles.destructiveBadge}>
            <SymbolView
              name="exclamationmark.triangle.fill"
              tintColor={C.primary}
              size={22}
              fallback={<Text style={styles.fallbackGlyph}>!</Text>}
            />
          </View>
          <Text style={styles.destructiveTitle}>Dezactivare cont și date</Text>
          <Text style={styles.destructiveBody}>
            Această acțiune șterge definitiv listele tale de cumpărături, istoricul, economiile salvate și preferințele locale.
          </Text>
          <View style={styles.actionsCol}>
            <Pressable onPress={onConfirmDelete} style={styles.deleteConfirmBtn}>
              <Text style={styles.deleteConfirmText}>
                Dezactivează și șterge toate datele
              </Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Păstrează contul</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type EditProfileModalProps = {
  visible: boolean;
  name: string;
  email: string;
  onChangeName: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function EditProfileModal({
  visible,
  name,
  email,
  onChangeName,
  onChangeEmail,
  onClose,
  onSave,
}: EditProfileModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Editează datele</Text>
              <Text style={styles.sub}>Modifică numele afișat și adresa de e-mail</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <SymbolView
                name="xmark"
                tintColor={C.muted}
                size={14}
                fallback={<Text style={styles.fallbackGlyph}>✕</Text>}
              />
            </Pressable>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nume utilizator</Text>
              <TextInput
                value={name}
                onChangeText={onChangeName}
                placeholder="Ex: Andrei Popescu"
                placeholderTextColor={C.muted}
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Adresă de e-mail</Text>
              <TextInput
                value={email}
                onChangeText={onChangeEmail}
                placeholder="exemplu@email.ro"
                placeholderTextColor={C.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Anulează</Text>
            </Pressable>
            <Pressable onPress={onSave} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Salvează</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(66, 23, 38, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  cardDestructive: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 22,
    gap: 12,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackGlyph: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  errorBox: {
    backgroundColor: 'rgba(247, 141, 121, 0.25)',
    borderRadius: BeavyRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: {
    fontSize: 12.5,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  form: {
    gap: 10,
  },
  field: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  input: {
    minHeight: 44,
    backgroundColor: C.background,
    borderRadius: BeavyRadius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: BeavyFonts.semiBold,
    color: C.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionsCol: {
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    color: C.primary,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryBtnFull: {
    minHeight: 46,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 13,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.surface,
  },
  privacyList: {
    gap: 10,
  },
  privacyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: C.background,
    borderRadius: BeavyRadius.lg,
    padding: 12,
  },
  privacyCopy: {
    flex: 1,
    gap: 2,
  },
  privacyTitle: {
    fontSize: 13,
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  privacyDesc: {
    fontSize: 11.5,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
    lineHeight: 16,
  },
  activePill: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activePillText: {
    fontSize: 11,
    fontFamily: BeavyFonts.extraBold,
    color: C.leekDark,
  },
  destructiveBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveTitle: {
    fontSize: 18,
    fontFamily: BeavyFonts.extraBold,
    color: C.primary,
    textAlign: 'center',
  },
  destructiveBody: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: BeavyFonts.regular,
    color: C.muted,
    textAlign: 'center',
  },
  deleteConfirmBtn: {
    width: '100%',
    minHeight: 46,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  deleteConfirmText: {
    fontSize: 13,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    color: C.primary,
  },
});
