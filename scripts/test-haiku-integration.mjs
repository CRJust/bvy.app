import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRecipeSmart, parseRecipeFromText } from '../src/services/beavy-recipe-parser.ts';
import { isHaikuAvailable, CLAUDE_HAIKU_MODEL } from '../src/services/beavy-claude-haiku.ts';

test('Claude 3.5 Haiku Service & Recipe Extractor', async (t) => {
  await t.test('1. Model constant & configuration sanity', () => {
    assert.equal(CLAUDE_HAIKU_MODEL, 'claude-3-5-haiku-20241022');
  });

  await t.test('2. Availability check runs safely in Node/Web environment', async () => {
    const available = await isHaikuAvailable();
    assert.equal(typeof available, 'boolean');
  });

  await t.test('3. parseRecipeSmart falls back gracefully to deterministic engine when offline', async () => {
    const rawRecipe = `
Paste Carbonara
Ingrediente pentru 4 persoane:
- 400g spaghete
- 200g guanciale sau pancetta
- 4 oua proaspete
- 100g parmezan sau pecorino
- un praf de sare
- piper negru proaspat macinat
    `;

    const res = await parseRecipeSmart(rawRecipe, 4);
    assert.ok(res);
    assert.ok(res.ingredients.length >= 4);

    const names = res.ingredients.map(i => i.cleanName.toLowerCase());
    assert.ok(names.some(n => n.includes('spaghete')));
    assert.ok(names.some(n => n.includes('guanciale') || n.includes('pancetta')));
    assert.ok(names.some(n => n.includes('ou')));
    assert.ok(names.some(n => n.includes('parmezan') || n.includes('pecorino')));

    // Pantry staples correctly identified
    const sare = res.ingredients.find(i => i.cleanName.toLowerCase().includes('sare'));
    if (sare) {
      assert.equal(sare.isPantryStaple, true);
    }
    const piper = res.ingredients.find(i => i.cleanName.toLowerCase().includes('piper'));
    if (piper) {
      assert.equal(piper.isPantryStaple, true);
    }
  });

  await t.test('4. Jamila / Savori Urbane format parsing', async () => {
    const ciorbaText = `
Ciorbă de perișoare
Ingrediente:
500 g carne tocată de porc și vită
1 ceapă mare
2 morcovi
1 păstârnac
1 legătură pătrunjel
1 l borș
    `;

    const res = await parseRecipeSmart(ciorbaText, 4);
    assert.ok(res.ingredients.length >= 4);
    const carne = res.ingredients.find(i => i.cleanName.toLowerCase().includes('carne'));
    assert.ok(carne);
    assert.equal(carne.baseQuantity, 500);
    assert.equal(carne.unit, 'g');
  });
});
