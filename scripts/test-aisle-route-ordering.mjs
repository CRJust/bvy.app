import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyShoppingItemAisle,
  groupShoppingItemsByAisle,
  sortShoppingItems,
  AISLE_DEFINITIONS,
} from '../src/services/beavy-aisle-classifier.ts';

function classifyName(name) {
  return classifyShoppingItemAisle({
    id: 'test',
    name,
    checked: false,
    quantity: 1,
    addedAt: Date.now(),
  });
}

test('Aisle Classifier & Route Ordering Engine', async (t) => {
  await t.test('1. Substring false-positive elimination', () => {
    // "margaritar" contains "mar", but must NOT match "măr" (produce)
    const sugar = classifyName('Zahăr Mărgăritar 1kg');
    assert.equal(sugar.id, 'camara-bacanie', 'Zahăr Mărgăritar must go to pantry');

    // "marimea M" contains "mar", but must NOT match "măr"
    const eggs = classifyName('Ouă proaspete mărimea M 10 buc');
    assert.equal(eggs.id, 'lactate-oua', 'Ouă mărimea M must go to dairy/eggs');

    // "ciocolata cu lapte" contains "lapte", but sweets take priority over dairy
    const chocolate = classifyName('Ciocolată Milka cu lapte 100g');
    assert.equal(chocolate.id, 'cafea-dulciuri', 'Ciocolată cu lapte must go to sweets');

    // "biscuiti cu unt" contains "unt", but sweets take priority over dairy
    const biscuits = classifyName('Biscuiți Petit Beurre cu unt');
    assert.equal(biscuits.id, 'cafea-dulciuri', 'Biscuiți must go to sweets');

    // "ceai de lamaie" contains "lamaie", but tea takes priority over fresh fruit
    const tea = classifyName('Ceai verde cu lămâie');
    assert.equal(tea.id, 'cafea-dulciuri', 'Ceai cu lămâie must go to tea/sweets');
  });

  await t.test('2. Compound exception rules', () => {
    // "pasta de dinti" contains "pasta", but belongs in Personal Care, not Pantry pasta
    const toothpaste = classifyName('Pastă de dinți Colgate Total 75ml');
    assert.equal(toothpaste.id, 'igiena-personala', 'Pastă de dinți must go to hygiene');

    // "hartie de copt" contains "hartie", but belongs in Household, not Hygiene
    const bakingPaper = classifyName('Hârtie de copt Fino');
    assert.equal(bakingPaper.id, 'curatenie-menaj', 'Hârtie de copt must go to household');

    // "hartie igienica" belongs in Hygiene
    const toiletPaper = classifyName('Hârtie igienică Zewa Deluxe 8 role');
    assert.equal(toiletPaper.id, 'igiena-personala', 'Hârtie igienică must go to hygiene');

    // "detergent vase" belongs in Cleaning
    const dishSoap = classifyName('Detergent vase Fairy Lemon 800ml');
    assert.equal(dishSoap.id, 'curatenie-menaj', 'Detergent vase must go to cleaning');
  });

  await t.test('3. Store Route (11 Aisle Steps) grouping and sequential flow', () => {
    const rawItems = [
      { id: '1', name: 'Detergent vase Fairy', checked: false, quantity: 1, addedAt: 1 },
      { id: '2', name: 'Banane bio', checked: false, quantity: 1, addedAt: 2 },
      { id: '3', name: 'Pâine toast secară', checked: false, quantity: 1, addedAt: 3 },
      { id: '4', name: 'Piept de pui dezosat', checked: false, quantity: 1, addedAt: 4 },
      { id: '5', name: 'Lapte Zuzu 3.5%', checked: false, quantity: 1, addedAt: 5 },
      { id: '6', name: 'Telemea de vacă Napolact', checked: false, quantity: 1, addedAt: 6 },
      { id: '7', name: 'Ulei de măsline extravirgin', checked: false, quantity: 1, addedAt: 7 },
      { id: '8', name: 'Biscuiți Oreo', checked: false, quantity: 1, addedAt: 8 },
      { id: '9', name: 'Apă plată Bucovina 2L', checked: false, quantity: 1, addedAt: 9 },
      { id: '10', name: 'Șampon Head & Shoulders', checked: false, quantity: 1, addedAt: 10 },
      { id: '11', name: 'Baterii AA Duracell', checked: false, quantity: 1, addedAt: 11 },
    ];

    const groups = groupShoppingItemsByAisle(rawItems);
    assert.equal(groups.length, 11, 'All 11 aisles must be represented');

    // Steps must be strictly increasing: 1 through 11
    const steps = groups.map((g) => g.step);
    assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    assert.equal(groups[0].name, 'Legume & Fructe');
    assert.equal(groups[1].name, 'Brutărie & Panificație');
    assert.equal(groups[2].name, 'Lactate & Ouă');
    assert.equal(groups[3].name, 'Brânzeturi & Specialități');
    assert.equal(groups[4].name, 'Carne, Mezeluri & Pește');
    assert.equal(groups[5].name, 'Cămară, Paste & Conserve');
    assert.equal(groups[6].name, 'Cafea, Ceai & Dulciuri');
    assert.equal(groups[7].name, 'Băuturi & Snacks');
    assert.equal(groups[8].name, 'Curățenie & Menaj');
    assert.equal(groups[9].name, 'Igienă & Îngrijire');
    assert.equal(groups[10].name, 'Diverse & Casă');
  });

  await t.test('4. sortShoppingItems in all 3 sort modes', () => {
    const rawItems = [
      { id: 'c', name: 'Lapte Zuzu', checked: false, quantity: 1, addedAt: 100 },
      { id: 'a', name: 'Banane bio', checked: false, quantity: 1, addedAt: 300 },
      { id: 'b', name: 'Detergent vase', checked: false, quantity: 1, addedAt: 200 },
    ];

    // Aisle route: Banane (Step 1) -> Lapte (Step 3) -> Detergent (Step 9)
    const sortedAisle = sortShoppingItems(rawItems, 'aisle');
    assert.deepEqual(
      sortedAisle.map((it) => it.id),
      ['a', 'c', 'b'],
      'Aisle sort must follow physical route'
    );

    // Recent (preserves original user list insertion order): c -> a -> b
    const sortedRecent = sortShoppingItems(rawItems, 'recent');
    assert.deepEqual(
      sortedRecent.map((it) => it.id),
      ['c', 'a', 'b'],
      'Recent sort must preserve original user list order'
    );

    // Alphabetical: Banane (a) -> Detergent (b) -> Lapte (c)
    const sortedAlpha = sortShoppingItems(rawItems, 'alphabetical');
    assert.deepEqual(
      sortedAlpha.map((it) => it.id),
      ['a', 'b', 'c'],
      'Alphabetical sort must follow localeCompare'
    );
  });
});

