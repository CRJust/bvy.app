import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';

const LIST_NAME_SUGGESTIONS = [
  'Cumpărături săptămânale',
  'Achiziții rapide',
  'Mic dejun & lactate',
  'Cină rapidă',
  'Grătar & Weekend',
  'Aprovizionare cămară',
];

type SezamoCreateListModalProps = {
  visible: boolean;
  onCreateList: (name: string) => void;
  onClose: () => void;
};

/**
 * Foaie curată pentru crearea unei liste noi de cumpărături cu șabloane rapide.
 */
export function SezamoCreateListModal({
  visible,
  onCreateList,
  onClose,
}: SezamoCreateListModalProps) {
  const [listName, setListName] = useState('');

  const closeSheet = () => {
    Keyboard.dismiss();
    setListName('');
    onClose();
  };

  const handleCreate = (overrideName?: string) => {
    const clean = (overrideName ?? listName).trim() || 'Lista mea nouă';
    triggerHaptic('medium');
    onCreateList(clean);
    setListName('');
    onClose();
  };

  return (
    <BeavySheetModal visible={visible} onClose={closeSheet} maxHeightRatio="76%">
      <View style={styles.sheetInner}>
        <View style={styles.header}>
          <Text style={styles.title}>Creează o listă nouă</Text>
          <Pressable
            onPress={closeSheet}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Închide"
          >
            <SymbolView
              name="xmark"
              tintColor={C.primary}
              size={14}
              fallback={<Text style={styles.closeFallback}>✕</Text>}
            />
          </Pressable>
        </View>

        <View style={styles.inputWrap}>
          <TextInput
            value={listName}
            onChangeText={setListName}
            placeholder="De exemplu „cumpărături de weekend”"
            placeholderTextColor={C.muted}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={() => handleCreate()}
          />
          {!!listName && (
            <Pressable
              onPress={() => setListName('')}
              hitSlop={8}
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel="Șterge numele"
            >
              <Text style={styles.clearBtnText}>×</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.suggestionsSection}>
          <Text style={styles.suggestionsTitle}>Sugestii rapide</Text>
          <View style={styles.suggestionsGrid}>
            {LIST_NAME_SUGGESTIONS.map((sug) => {
              const isSelected = listName === sug;
              return (
                <Pressable
                  key={sug}
                  onPress={() => {
                    triggerHaptic('selection');
                    setListName(sug);
                  }}
                  style={[
                    styles.suggestionChip,
                    isSelected && styles.suggestionChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.suggestionChipText,
                      isSelected && styles.suggestionChipTextSelected,
                    ]}
                  >
                    {sug}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => handleCreate()}
          style={({ pressed }) => [styles.createBtn, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.createBtnText}>Creează lista</Text>
        </Pressable>
      </View>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  sheetInner: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 20,
    color: C.primary,
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.lg,
    paddingHorizontal: 14,
    minHeight: 50,
    gap: 8,
  },
  input: {
    flex: 1,
    fontFamily: BeavyFonts.semiBold,
    fontSize: 15,
    color: C.primary,
  },
  clearBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 15,
    color: C.primary,
  },
  suggestionsSection: {
    gap: 8,
  },
  suggestionsTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 11.5,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    minHeight: 40,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  suggestionChipSelected: {
    backgroundColor: C.secondary,
  },
  suggestionChipText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12.5,
    color: C.muted,
  },
  suggestionChipTextSelected: {
    fontFamily: BeavyFonts.extraBold,
    color: C.primary,
  },
  createBtn: {
    minHeight: 48,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  createBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 14.5,
    color: C.surface,
  },
  pressed: {
    opacity: 0.78,
  },
});
