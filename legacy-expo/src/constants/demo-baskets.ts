import type { ShoppingItem, ShoppingList } from '@/context/shopping-context';

export const DEMO_WEEKLY_LIST_ID = 'demo-basket-weekly';
export const DEMO_BREAKFAST_LIST_ID = 'demo-basket-breakfast';
export const CURRENT_DEMO_SEED_VERSION = 2;

type DemoBasketTemplate = {
  id: string;
  name: string;
  items: ShoppingItem[];
};

/**
 * Două coșuri demonstrative calibrate pe produse reale multi-magazin din catalogul Beavy,
 * incluzând atât branduri populare cu promoții/fidelitate, cât și termen generic („Banane”).
 */
export const DEMO_BASKET_TEMPLATES: readonly DemoBasketTemplate[] = [
  {
    id: DEMO_WEEKLY_LIST_ID,
    name: 'Coș Săptămânal · Demo',
    items: [
      {
        id: '7d9463c4-3f7c-448c-a204-245af00b7ccb',
        productId: '7d9463c4-3f7c-448c-a204-245af00b7ccb',
        name: 'Zuzu Lapte 1.5% grăsime 1l',
        brand: 'Zuzu',
        packageSize: '1 L',
        quantity: 2,
        checked: false,
        isCustom: false,
      },
      {
        id: 'f5c5ceb3-6964-47de-beae-30d3de60efff',
        productId: 'f5c5ceb3-6964-47de-beae-30d3de60efff',
        name: 'Albalact Unt 82% grăsime 200g',
        brand: 'Albalact',
        packageSize: '200 g',
        quantity: 1,
        checked: false,
        isCustom: false,
      },
      {
        id: '37634023-c5e6-4acf-9f56-6de9b3183cbb',
        productId: '37634023-c5e6-4acf-9f56-6de9b3183cbb',
        name: 'Jacobs Kronung 250g cafea prăjită și măcinată',
        brand: 'Jacobs',
        packageSize: '250 g',
        quantity: 1,
        checked: false,
        isCustom: false,
      },
      {
        id: '20c2490e-5184-4af5-9a24-973aa52badff',
        productId: '20c2490e-5184-4af5-9a24-973aa52badff',
        name: 'Monini Ulei de măsline extra virgin Classico 500ml',
        brand: 'Monini',
        packageSize: '500 ml',
        quantity: 1,
        checked: false,
        isCustom: false,
      },
      {
        id: 'e3b4f626-0315-4ede-ba66-64f27aedf195',
        productId: 'e3b4f626-0315-4ede-ba66-64f27aedf195',
        name: 'Dorna Apă minerală carbogazoasă, 500ml',
        brand: 'Dorna',
        packageSize: '500 ml',
        quantity: 4,
        checked: false,
        isCustom: false,
      },
      {
        id: 'cde619e8-1bad-46fd-be2b-80b3dc4b7d79',
        productId: 'cde619e8-1bad-46fd-be2b-80b3dc4b7d79',
        name: 'Banane',
        brand: null,
        packageSize: '1 kg',
        imageUrl: 'https://imageproxy.wolt.com/assets/6ae4a95aada75abe97ae882e',
        quantity: 1,
        checked: false,
        isCustom: false,
      },
    ],
  },
  {
    id: DEMO_BREAKFAST_LIST_ID,
    name: 'Mic Dejun & Fidelitate · Demo',
    items: [
      {
        id: '123ec2f8-8b25-49d2-a0fe-c38f3367ecdd',
        productId: '123ec2f8-8b25-49d2-a0fe-c38f3367ecdd',
        name: 'Olympus Iaurt grecesc 10% grăsime 150g',
        brand: 'Olympus',
        packageSize: '150 g',
        quantity: 2,
        checked: false,
        isCustom: false,
      },
      {
        id: 'a50765ce-1ec2-48d5-bad4-0e8c2e40eecf',
        productId: 'a50765ce-1ec2-48d5-bad4-0e8c2e40eecf',
        name: 'Vel Pitar Pâine albă feliată 500g',
        brand: 'Vel Pitar',
        packageSize: '500 g',
        quantity: 1,
        checked: false,
        isCustom: false,
      },
      {
        id: '12818eb4-dbc7-4b26-b7ba-5e38f64b0077',
        productId: '12818eb4-dbc7-4b26-b7ba-5e38f64b0077',
        name: 'Delaco Cașcaval DeSenviș felii 100g',
        brand: 'Delaco',
        packageSize: '100 g',
        quantity: 1,
        checked: false,
        isCustom: false,
      },
      {
        id: 'd96a2418-08cb-400a-aad2-f7131d917277',
        productId: 'd96a2418-08cb-400a-aad2-f7131d917277',
        name: 'Coca-Cola Băutură carbogazoasă cola zero zahăr 2l',
        brand: 'Coca-Cola',
        packageSize: '2 L',
        quantity: 1,
        checked: false,
        isCustom: false,
      },
      {
        id: '983789f0-c955-4470-8ad6-99de9fcb7a27',
        productId: '983789f0-c955-4470-8ad6-99de9fcb7a27',
        name: 'Calvo Ton în ulei de măsline bucăți 160g',
        brand: 'Calvo',
        packageSize: '160 g',
        quantity: 1,
        checked: false,
        isCustom: false,
      },
    ],
  },
];

export function buildDemoShoppingLists(nowIso = new Date().toISOString()): ShoppingList[] {
  return DEMO_BASKET_TEMPLATES.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    createdAt: nowIso,
    updatedAt: nowIso,
    items: tpl.items.map((item) => ({ ...item })),
  }));
}

/**
 * Injectează cele 2 coșuri Demo în listele existente ale utilizatorilor care aveau deja
 * stare salvată înainte de introducerea coșurilor demonstrative, păstrând listele lor proprii.
 */
export function mergeDemoListsIntoSavedLists(
  savedLists: ShoppingList[],
  demoSeedVersion?: number,
  _nowIso = new Date().toISOString()
): { lists: ShoppingList[]; seededNow: boolean } {
  if ((demoSeedVersion ?? 0) >= CURRENT_DEMO_SEED_VERSION) {
    return { lists: savedLists, seededNow: false };
  }

  const templatesById = new Map(
    buildDemoShoppingLists(_nowIso).map((list) => [list.id, list])
  );
  const lists = savedLists.filter((saved) => {
    const template = templatesById.get(saved.id);
    if (!template || saved.name !== template.name || saved.items.length !== template.items.length) {
      return true;
    }

    // Remove only untouched sample baskets. Any edits (including check state or
    // quantities) make the list user-owned, so its contents are preserved.
    return saved.items.some((item, index) => {
      const sample = template.items[index];
      return (
        item.id !== sample.id ||
        item.name !== sample.name ||
        item.quantity !== sample.quantity ||
        item.checked !== sample.checked ||
        item.productId !== sample.productId ||
        item.isCustom !== sample.isCustom
      );
    });
  });

  return { lists, seededNow: false };
}
