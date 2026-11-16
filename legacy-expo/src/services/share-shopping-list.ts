import { Alert, Platform, Share } from 'react-native';
import type { ShoppingItem, ShoppingList } from '@/context/shopping-context';

export async function shareShoppingList(
  list: ShoppingList | null,
  items: ShoppingItem[]
): Promise<void> {
  if (!list || items.length === 0) {
    Alert.alert('Listă goală', 'Adaugă mai întâi câteva produse pe listă pentru a o partaja.');
    return;
  }

  const listTitle = list.name || 'Lista de cumpărături';
  const uncheckedItems = items.filter((it) => !it.checked);
  const checkedItems = items.filter((it) => it.checked);

  const uncheckedLines = uncheckedItems.map(
    (it) =>
      `• ${it.quantity > 1 ? `${it.quantity}x ` : ''}${it.name}${
        it.packageSize ? ` (${it.packageSize})` : ''
      }`
  );
  const checkedLines = checkedItems.map(
    (it) => `✓ ${it.quantity > 1 ? `${it.quantity}x ` : ''}${it.name}`
  );

  let message = `${listTitle} — Beavy\n\n`;
  if (uncheckedLines.length > 0) {
    message += `De cumpărat (${uncheckedLines.length}):\n${uncheckedLines.join('\n')}\n\n`;
  }
  if (checkedLines.length > 0) {
    message += `Deja în coș (${checkedLines.length}):\n${checkedLines.join('\n')}\n\n`;
  }
  message += `Organizat cu Beavy — Același coș. Prețuri diferite. (beavy.ro)`;

  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        Alert.alert(
          'Copiat în clipboard!',
          'Lista a fost copiată și o poți trimite pe WhatsApp sau altă aplicație.'
        );
      } else {
        Alert.alert('Lista ta de cumpărături', message);
      }
      return;
    }

    await Share.share({
      message,
      title: listTitle,
    });
  } catch (err) {
    console.warn('Eroare la partajare listă:', err);
  }
}
