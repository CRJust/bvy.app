import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

const moduleCache = new Map();
function loadTsModuleSync(relPath, extraMocks = {}) {
  if (moduleCache.has(relPath)) return moduleCache.get(relPath);
  const fsSync = require('node:fs');
  let actualPath = path.isAbsolute(relPath) ? relPath : path.join(process.cwd(), ...relPath.split('/'));
  if (!fsSync.existsSync(actualPath)) {
    if (fsSync.existsSync(actualPath + '.ts')) {
      actualPath = actualPath + '.ts';
    } else if (fsSync.existsSync(actualPath.replace(/\.ts$/, '.tsx'))) {
      actualPath = actualPath.replace(/\.ts$/, '.tsx');
    } else if (fsSync.existsSync(path.join(actualPath.replace(/\.ts$/, ''), 'index.ts'))) {
      actualPath = path.join(actualPath.replace(/\.ts$/, ''), 'index.ts');
    }
  }
  const source = fsSync.readFileSync(actualPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });

  const mod = { exports: {} };
  moduleCache.set(relPath, mod.exports);

  const sandboxRequire = (id) => {
    if (id in extraMocks) return extraMocks[id];
    if (id.startsWith('@/')) {
      const subRel = id.replace('@/', 'src/') + '.ts';
      return loadTsModuleSync(subRel, extraMocks);
    }
    if (id.startsWith('./') || id.startsWith('../')) {
      const dir = path.dirname(actualPath);
      const resolved = path.resolve(dir, id);
      return loadTsModuleSync(resolved, extraMocks);
    }
    return require(id);
  };

  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {\n${compiled.outputText}\n})`,
    { filename: actualPath }
  );
  wrapper(mod.exports, sandboxRequire, mod, actualPath, path.dirname(actualPath));
  return mod.exports;
}

test('Beavy Recipe Parser & Smart Ingredient Extractor', async (t) => {
  const recipeModule = loadTsModuleSync('src/services/beavy-recipe-parser.ts', {
    '@/lib/supabase': { supabase: {} },
  });

  const {
    parseRecipeFromText,
    scaleRecipeIngredients,
    identifyPantryStaple,
    mapCulinaryNameToGroceryItem,
    parseRecipeFromHtml,
    recipeIngredientsToScanItems,
    isRecipeUrl,
    POPULAR_ROMANIAN_RECIPES,
  } = recipeModule;

  await t.test('1. URL detection', () => {
    assert.equal(isRecipeUrl('https://jamilacuisine.ro/ciorba-radauteana/'), true);
    assert.equal(isRecipeUrl('http://savoriurbane.com/reteta-paste'), true);
    assert.equal(isRecipeUrl('not a url'), false);
    assert.equal(isRecipeUrl('Ingrediente: 500g pui'), false);
  });

  await t.test('2. Pantry staples detection (Am deja în casă)', () => {
    assert.equal(identifyPantryStaple('apă').isStaple, true);
    assert.equal(identifyPantryStaple('sare și piper după gust').isStaple, true);
    assert.equal(identifyPantryStaple('ulei pentru călit').isStaple, true);
    assert.equal(identifyPantryStaple('foi de dafin').isStaple, true);
    assert.equal(identifyPantryStaple('bicarbonat de sodiu').isStaple, true);

    // Olive oil is NOT a cheap staple, it should be purchased
    assert.equal(identifyPantryStaple('ulei de măsline extravirgin').isStaple, false);
    // Chicken or sour cream is NOT a staple
    assert.equal(identifyPantryStaple('piept de pui').isStaple, false);
    assert.equal(identifyPantryStaple('smântână 20%').isStaple, false);
  });

  await t.test('3. Culinary naming normalization to grocery shelf items', () => {
    assert.equal(mapCulinaryNameToGroceryItem('4 gălbenușuri').cleanName, 'Ouă proaspete');
    assert.equal(mapCulinaryNameToGroceryItem('2 căței de usturoi').cleanName, 'Usturoi');
    assert.equal(mapCulinaryNameToGroceryItem('piept de pui cubulețe').cleanName, 'Piept de pui dezosat');
    assert.equal(mapCulinaryNameToGroceryItem('smântână pentru gătit').cleanName, 'Smântână de gătit');
    assert.equal(mapCulinaryNameToGroceryItem('parmezan ras').cleanName, 'Parmezan ras');
    assert.equal(mapCulinaryNameToGroceryItem('ciuperci champignon feliate').cleanName, 'Ciuperci Champignon');
  });

  await t.test('4. Full Romanian text parsing (Ciorbă Rădăuțeană)', () => {
    const recipeText = `
Ciorbă Rădăuțeană cu mult usturoi și smântână 🍲
Ingrediente pentru 6 porții:
- 700g piept de pui dezosat
- 2 cepe mari
- 3 morcovi
- 400g smântână grasă 20%
- 4 gălbenușuri
- 1 căpățână de usturoi
- 1 legătură de pătrunjel proaspăt
- 50ml oțet de vin
- 2 foi de dafin
- sare și piper după gust
- 3 litri de apă

Mod de preparare:
1. Spălăm pieptul de pui și îl punem la fiert în 3 litri de apă cu puțină sare.
2. Spumăm bine supa când dă în clocot...
`;

    const parsed = parseRecipeFromText(recipeText);
    assert.ok(parsed.title.includes('Ciorbă Rădăuțeană'));
    assert.equal(parsed.baseServings, 6);
    assert.equal(parsed.ingredients.length, 11);

    // Verify staple vs buy
    const staples = parsed.ingredients.filter((i) => i.isPantryStaple);
    const toBuy = parsed.ingredients.filter((i) => !i.isPantryStaple);

    assert.ok(staples.some((s) => s.cleanName.toLowerCase().includes('ap')));
    assert.ok(staples.some((s) => s.cleanName.toLowerCase().includes('sare')));
    assert.ok(staples.some((s) => s.cleanName.toLowerCase().includes('dafin')));

    assert.ok(toBuy.some((b) => b.cleanName === 'Piept de pui dezosat'));
    assert.ok(toBuy.some((b) => b.cleanName === 'Ouă proaspete'));
    assert.ok(toBuy.some((b) => b.cleanName === 'Usturoi'));

    // Check quantities
    const chicken = toBuy.find((b) => b.cleanName === 'Piept de pui dezosat');
    assert.equal(chicken.baseQuantity, 700);
    assert.equal(chicken.unit, 'g');
  });

  await t.test('5. Serving size scaling (6 porții -> 3 porții)', () => {
    const raw = POPULAR_ROMANIAN_RECIPES[0];
    const parsed = parseRecipeFromText(raw.text);
    const scaled = scaleRecipeIngredients(parsed.ingredients, 6, 3);

    const chickenOriginal = parsed.ingredients.find((i) => i.cleanName === 'Piept de pui dezosat');
    const chickenScaled = scaled.find((i) => i.cleanName === 'Piept de pui dezosat');

    assert.equal(chickenOriginal.baseQuantity, 700);
    assert.equal(chickenScaled.baseQuantity, 350);

    const sourCreamOriginal = parsed.ingredients.find((i) => i.cleanName.includes('Smântână'));
    const sourCreamScaled = scaled.find((i) => i.cleanName.includes('Smântână'));
    assert.equal(sourCreamOriginal.baseQuantity, 400);
    assert.equal(sourCreamScaled.baseQuantity, 200);
  });

  await t.test('6. HTML parsing with JSON-LD Schema (JamilaCuisine / Savori Urbane standard)', () => {
    const mockHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Paste Carbonara autentice - Savori Urbane</title>
  <meta property="og:image" content="https://example.com/carbonara.jpg" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Paste Carbonara autentice",
    "image": "https://example.com/carbonara.jpg",
    "recipeYield": "4 porții",
    "recipeIngredient": [
      "400g paste spaghete",
      "200g guanciale sau pancetta",
      "4 gălbenușuri proaspete",
      "80g parmezan sau pecorino",
      "piper negru proaspăt măcinat",
      "sare pentru apa de paste"
    ]
  }
  </script>
</head>
<body>
  <h1>Paste Carbonara</h1>
</body>
</html>
`;

    const parsed = parseRecipeFromHtml(mockHtml, 'https://savoriurbane.com/paste-carbonara/');
    assert.equal(parsed.title, 'Paste Carbonara autentice');
    assert.equal(parsed.baseServings, 4);
    assert.equal(parsed.imageUrl, 'https://example.com/carbonara.jpg');
    assert.equal(parsed.ingredients.length, 6);

    const scanItems = recipeIngredientsToScanItems(parsed.ingredients);
    assert.equal(scanItems.length, 6);
    assert.equal(scanItems[0].name, 'Spaghete');
    assert.equal(scanItems[0].packageSizeHint, '500g');
  });
});
