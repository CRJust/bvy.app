import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import { BeavySurface } from '@/components/ui/beavy-surface';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import type { ShoppingList } from '@/context/shopping-context';

const QUICK_LIST_TEMPLATES = [
  'Lista săptămânală',
  'Pentru weekend',
  'Mic dejun',
  'Cină rapidă',
];

type ListsSheetModalProps = {
  visible: boolean;
  lists: ShoppingList[];
  activeListId: string;
  onSelectList: (listId: string) => void;
  onCreateList: (name?: string) => void;
  onRenameList?: (listId: string, newName: string) => void;
  onDeleteList: (listId: string) => void;
  onLoadDemoBaskets?: () => void;
  onClose: () => void;
};

/**
 * Foaie editorială pentru gestionarea și comutarea rapidă a listelor de cumpărături.
 */
export function ListsSheetModal({
  visible,
  lists,
  activeListId,
  onSelectList,
  onCreateList,
  onRenameList,
  onDeleteList,
  onLoadDemoBaskets,
  onClose,
}: ListsSheetModalProps) {
  const [newListName, setNewListName] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editDraftName, setEditDraftName] = useState('');

  const closeSheet = () => {
    Keyboard.dismiss();
    setEditingListId(null);
    onClose();
  };

  const handleCreate = (customName?: string) => {
    const clean = (customName ?? newListName).trim();
    triggerHaptic('medium');
    onCreateList(clean || undefined);
    setNewListName('');
    closeSheet();
  };

  const confirmDeleteList = (listId: string, listName: string) => {
    triggerHaptic('medium');
    if (Platform.OS === 'web') {
      if (
        typeof window !== 'undefined' &&
        window.confirm(`Sigur dorești să ștergi lista „${listName}”?`)
      ) {
        triggerHaptic('medium');
        onDeleteList(listId);
      }
      return;
    }

    Alert.alert(
      'Șterge lista',
      `Sigur dorești să ștergi definitiv lista „${listName}”?`,
      [
        { text: 'Anulează', style: 'cancel' },
        {
          text: 'Șterge lista',
          style: 'destructive',
          onPress: () => {
            triggerHaptic('medium');
            onDeleteList(listId);
          },
        },
      ]
    );
  };

  return (
    <BeavySheetModal visible={visible} onClose={closeSheet} maxHeightRatio="84%">
      <View style={styles.sheetInner}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.title}>Listele tale</Text>
            <Text style={styles.subtitle}>
              Schimbă lista activă, redenumește sau pornește una nouă
            </Text>
          </View>

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

        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {lists.length === 0 ? (
            <BeavySurface variant="elevated" style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nu ai încă nicio listă</Text>
              <Text style={styles.emptySub}>
                Alege un șablon rapid de mai jos sau scrie un nume nou.
              </Text>
            </BeavySurface>
          ) : (
            <BeavySurface variant="elevated" style={styles.listCard}>
              {lists.map((l, idx) => {
                const isLast = idx === lists.length - 1;
                const isCurrent = l.id === activeListId;
                const totalUnits = l.items.reduce(
                  (acc, it) => acc + (it.quantity || 1),
                  0
                );
                const uncheckedCount = l.items.filter((it) => !it.checked).length;

                if (editingListId === l.id) {
                  return (
                    <View
                      key={l.id}
                      style={[
                        styles.rowWrap,
                        !isLast && styles.rowBorder,
                        styles.rowActiveBg,
                      ]}
                    >
                      <TextInput
                        value={editDraftName}
                        onChangeText={setEditDraftName}
                        style={styles.renameInput}
                        placeholder="Nume listă..."
                        placeholderTextColor={C.muted}
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          if (editDraftName.trim() && onRenameList) {
                            triggerHaptic('medium');
                            onRenameList(l.id, editDraftName.trim());
                          }
                          setEditingListId(null);
                        }}
                      />
                      <Pressable
                        onPress={() => {
                          if (editDraftName.trim() && onRenameList) {
                            triggerHaptic('medium');
                            onRenameList(l.id, editDraftName.trim());
                          }
                          setEditingListId(null);
                        }}
                        hitSlop={6}
                        style={styles.saveRenameBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Salvează numele"
                      >
                        <Text style={styles.saveRenameBtnText}>✓</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setEditingListId(null)}
                        hitSlop={6}
                        style={styles.deleteBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Anulează redenumirea"
                      >
                        <Text style={styles.deleteBtnText}>✕</Text>
                      </Pressable>
                    </View>
                  );
                }

                return (
                  <View
                    key={l.id}
                    style={[
                      styles.rowWrap,
                      !isLast && styles.rowBorder,
                      isCurrent && styles.rowActiveBg,
                    ]}
                  >
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        onSelectList(l.id);
                        closeSheet();
                      }}
                      onLongPress={() => confirmDeleteList(l.id, l.name)}
                      delayLongPress={350}
                      style={styles.listMainPressable}
                      accessibilityRole="button"
                      accessibilityLabel={`Selectează lista ${l.name}`}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          isCurrent ? styles.statusDotActive : styles.statusDotIdle,
                        ]}
                      />

                      <View style={styles.listTextCol}>
                        <View style={styles.listNameRow}>
                          <Text numberOfLines={1} style={styles.listName}>
                            {l.name}
                          </Text>
                          {isCurrent && (
                            <View style={styles.activeTag}>
                              <Text style={styles.activeTagText}>Activă</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.listMeta}>
                          {l.items.length === 0
                            ? 'Listă goală'
                            : `${uncheckedCount} de luat · ${totalUnits} buc. total`}
                        </Text>
                      </View>
                    </Pressable>

                    {onRenameList && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('light');
                          setEditDraftName(l.name);
                          setEditingListId(l.id);
                        }}
                        hitSlop={6}
                        style={({ pressed }) => [
                          styles.iconActionBtn,
                          pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Redenumește ${l.name}`}
                      >
                        <SymbolView
                          name="pencil"
                          tintColor={C.primary}
                          size={14}
                          fallback={<Text style={styles.editFallback}>✎</Text>}
                        />
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() => confirmDeleteList(l.id, l.name)}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.deleteBtn,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Șterge ${l.name}`}
                    >
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </Pressable>
                  </View>
                );
              })}
            </BeavySurface>
          )}
        </ScrollView>

        <View style={styles.templatesRow}>
          {onLoadDemoBaskets && (
            <Pressable
              onPress={() => {
                triggerHaptic('medium');
                onLoadDemoBaskets();
                closeSheet();
              }}
              style={({ pressed }) => [styles.demoTplChip, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Încarcă cele 2 coșuri Demo"
            >
              <Text style={styles.demoTplChipText}>★ Coșuri Demo (2)</Text>
            </Pressable>
          )}
          {QUICK_LIST_TEMPLATES.map((tpl) => (
            <Pressable
              key={tpl}
              onPress={() => handleCreate(tpl)}
              style={({ pressed }) => [styles.tplChip, pressed && styles.pressed]}
            >
              <Text style={styles.tplChipText}>+ {tpl}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.composerRow}>
          <TextInput
            value={newListName}
            onChangeText={setNewListName}
            placeholder="Nume listă nouă..."
            placeholderTextColor={C.muted}
            style={styles.composerInput}
            returnKeyType="done"
            onSubmitEditing={() => handleCreate()}
          />
          <Pressable
            onPress={() => handleCreate()}
            style={({ pressed }) => [styles.composerBtn, pressed && styles.pressed]}
          >
            <Text style={styles.composerBtnText}>Creează</Text>
          </Pressable>
        </View>
      </View>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  sheetInner: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 20,
    color: C.primary,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12.5,
    color: C.muted,
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
  listScroll: {
    maxHeight: 320,
  },
  listScrollContent: {
    paddingBottom: 4,
  },
  emptyCard: {
    padding: 18,
    alignItems: 'center',
    gap: 4,
  },
  emptyTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  emptySub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12.5,
    color: C.muted,
    textAlign: 'center',
  },
  listCard: {
    paddingVertical: 2,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    minHeight: 58,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  rowActiveBg: {
    backgroundColor: 'rgba(232, 220, 207, 0.35)',
  },
  listMainPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minWidth: 0,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    flexShrink: 0,
  },
  statusDotActive: {
    backgroundColor: C.primary,
  },
  statusDotIdle: {
    backgroundColor: C.secondary,
  },
  listTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  listNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listName: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 14.5,
    color: C.primary,
    flexShrink: 1,
  },
  activeTag: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activeTagText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10.5,
    color: C.leekDark,
  },
  listMeta: {
    fontFamily: BeavyFonts.regular,
    fontSize: 12,
    color: C.muted,
  },
  iconActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(247, 141, 121, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.primary,
  },
  renameInput: {
    flex: 1,
    minHeight: 40,
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.md,
    paddingHorizontal: 12,
    fontFamily: BeavyFonts.semiBold,
    fontSize: 14,
    color: C.primary,
  },
  saveRenameBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.leek,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveRenameBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 14,
    color: C.leekDark,
  },
  templatesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  tplChip: {
    minHeight: 38,
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 13,
    justifyContent: 'center',
  },
  demoTplChip: {
    minHeight: 38,
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 13,
    justifyContent: 'center',
  },
  demoTplChipText: {
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
    fontSize: 12,
    color: C.leekDark,
  },
  tplChipText: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12,
    color: C.primary,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composerInput: {
    flex: 1,
    minHeight: 46,
    backgroundColor: C.surface,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 16,
    fontFamily: BeavyFonts.semiBold,
    fontSize: 14,
    color: C.primary,
  },
  composerBtn: {
    minHeight: 46,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13.5,
    color: C.surface,
  },
  pressed: {
    opacity: 0.72,
  },
});
