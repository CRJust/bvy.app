import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

async function loadTsModule(relPath, extraMocks = {}) {
  const filePath = path.join(process.cwd(), ...relPath.split('/'));
  const source = await fs.readFile(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });

  const mod = { exports: {} };
  const sandboxRequire = (id) => {
    if (id in extraMocks) return extraMocks[id];
    if (id.startsWith('@/')) {
      const rel = id.replace('@/', 'src/') + '.ts';
      return loadTsModuleSync(rel, extraMocks);
    }
    return require(id);
  };

  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {\n${compiled.outputText}\n})`,
    { filename: filePath }
  );
  wrapper(mod.exports, sandboxRequire, mod, filePath, path.dirname(filePath));
  return mod.exports;
}

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

test('Beavy AI Composer & Chat Tests', async (t) => {
  const createQueryMock = () => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      ilike: () => q,
      limit: () => Promise.resolve({ data: [], error: null }),
      then: (fn) => Promise.resolve({ data: [], error: null }).then(fn),
    };
    return q;
  };

  const supabaseMock = {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: null } }),
      },
      rpc: async () => ({ data: [], error: null }),
      from: () => createQueryMock(),
    },
  };

  const composerMod = await loadTsModule('src/services/beavy-ai-composer.ts', {
    '@/lib/supabase': supabaseMock,
    'react-native': { Platform: { OS: 'ios' } },
    'expo-image-manipulator': {},
  });

  const { composeShoppingListWithAi, INITIAL_AI_PROMPTS } = composerMod;

  await t.test('1. Initial prompts & greeting sanity', () => {
    assert.ok(INITIAL_AI_PROMPTS.length >= 4);
  });

  await t.test('2. Preset template matching (carbonara)', async () => {
    const res = await composeShoppingListWithAi({
      prompt: 'Vreau să fac paste carbonara diseară',
    });
    assert.equal(res.role, 'assistant');
    assert.ok(res.items && res.items.length >= 4, `Expected at least 4 items, got ${res.items?.length}`);
    const names = res.items.map((i) => i.name.toLowerCase());
    assert.ok(names.some((n) => n.includes('spaghete')));
    assert.ok(names.some((n) => n.includes('guanciale') || n.includes('pancetta')));
  });

  await t.test('3. Free text parsing multiple products', async () => {
    const res = await composeShoppingListWithAi({
      prompt: '3x lapte zuzu 1.5%, 2 paini feliate, 500g piept pui si 1kg banane',
    });
    assert.equal(res.role, 'assistant');
    assert.ok(res.items && res.items.length >= 4, `Expected at least 4 items, got ${res.items?.length}: ${JSON.stringify(res.items?.map(i => i.name))}`);
  });

  await t.test('4. Conversational refinement: "scoate sarea"', async () => {
    const initial = await composeShoppingListWithAi({
      prompt: 'paste carbonara',
    });
    const itemsBefore = initial.items || [];
    assert.ok(itemsBefore.some((i) => i.name.toLowerCase().includes('sare')));

    const refined = await composeShoppingListWithAi({
      prompt: 'scoate sarea',
      existingItems: itemsBefore,
    });

    const itemsAfter = refined.items || [];
    assert.ok(!itemsAfter.some((i) => i.name.toLowerCase().includes('sare')));
    assert.equal(itemsAfter.length, itemsBefore.length - 1);
  });

  await t.test('5. Conversational refinement: "dublează cantitățile"', async () => {
    const initial = await composeShoppingListWithAi({
      prompt: 'paste carbonara',
    });
    const itemsBefore = initial.items || [];
    const firstQty = itemsBefore[0].quantity;

    const refined = await composeShoppingListWithAi({
      prompt: 'dubleaza cantitatile',
      existingItems: itemsBefore,
    });

    const itemsAfter = refined.items || [];
    assert.equal(itemsAfter[0].quantity, firstQty * 2);
  });

  await t.test('6. Introspection: "ce am în listă"', async () => {
    const res = await composeShoppingListWithAi({
      prompt: 'ce am în listă?',
      context: {
        activeListName: 'Săptămânală',
        currentBasketItems: [
          { name: 'Lapte Zuzu 1.5L', quantity: 2 },
          { name: 'Pâine integrală', quantity: 1 },
        ],
      },
    });
    assert.ok(res.text.includes('Lapte Zuzu'));
    assert.ok(res.text.includes('Săptămânală'));
  });

  await t.test('7. Edge case: "fara zahar" in text vs refinement', async () => {
    const res = await composeShoppingListWithAi({
      prompt: 'biscuiti fara zahar, ceai de tei si mere',
    });
    assert.ok(res.items && res.items.length >= 3, `Expected at least 3 items, got ${res.items?.length}: ${JSON.stringify(res.items?.map(i => i.name))}`);
  });

  await t.test('8. Edge case: incremental addition "mai pune 2 beri"', async () => {
    const initial = await composeShoppingListWithAi({
      prompt: 'paste carbonara',
    });
    const itemsBefore = initial.items || [];

    const refined = await composeShoppingListWithAi({
      prompt: 'mai adaugă 2 beri',
      existingItems: itemsBefore,
    });

    const itemsAfter = refined.items || [];
    assert.ok(itemsAfter.length > itemsBefore.length, `Expected more items, got ${itemsAfter.length} vs ${itemsBefore.length}`);
    const hasBeer = itemsAfter.some(i => i.name.toLowerCase().includes('bere') || i.name.toLowerCase().includes('beri'));
    assert.ok(hasBeer, `Expected beer in list: ${JSON.stringify(itemsAfter.map(i => i.name))}`);
  });

  await t.test('9. Multiple items removal: "scoate sarea și piperul"', async () => {
    const initial = await composeShoppingListWithAi({
      prompt: 'paste carbonara',
    });
    const itemsBefore = initial.items || [];

    const refined = await composeShoppingListWithAi({
      prompt: 'scoate sarea și piperul',
      existingItems: itemsBefore,
    });

    const itemsAfter = refined.items || [];
    assert.ok(!itemsAfter.some(i => i.name.toLowerCase().includes('sare')));
    assert.ok(!itemsAfter.some(i => i.name.toLowerCase().includes('piper')));
    assert.equal(itemsAfter.length, itemsBefore.length - 2);
  });

  await t.test('10. Scaling servings: "fă pentru 6 persoane"', async () => {
    const initial = await composeShoppingListWithAi({
      prompt: 'paste carbonara',
    });
    const itemsBefore = initial.items || [];
    const meatBefore = itemsBefore.find(i => i.name.toLowerCase().includes('pancetta') || i.name.toLowerCase().includes('bacon'))?.quantity || 2;

    const refined = await composeShoppingListWithAi({
      prompt: 'fă pentru 6 persoane',
      existingItems: itemsBefore,
    });

    const itemsAfter = refined.items || [];
    const meatAfter = itemsAfter.find(i => i.name.toLowerCase().includes('pancetta') || i.name.toLowerCase().includes('bacon'))?.quantity;
    // 2 * 6/4 = 3
    assert.equal(meatAfter, Math.round(meatBefore * 1.5));
  });

  await t.test('11. Swapping: "schimbă spaghetele cu penne"', async () => {
    const initial = await composeShoppingListWithAi({
      prompt: 'paste carbonara',
    });
    const itemsBefore = initial.items || [];
    assert.ok(itemsBefore.some(i => i.name.toLowerCase().includes('spaghete')));

    const refined = await composeShoppingListWithAi({
      prompt: 'schimbă spaghetele cu penne',
      existingItems: itemsBefore,
    });

    const itemsAfter = refined.items || [];
    assert.ok(!itemsAfter.some(i => i.name.toLowerCase().includes('spaghete')));
    assert.ok(itemsAfter.some(i => i.name.toLowerCase().includes('penne')));
  });

  await t.test('12. Casual removal suffix: "scoate borșul că am deja"', async () => {
    const initial = await composeShoppingListWithAi({
      prompt: 'ciorbă de perișoare',
    });
    const itemsBefore = initial.items || [];
    assert.ok(itemsBefore.some(i => i.name.toLowerCase().includes('borș') || i.name.toLowerCase().includes('bors')));

    const refined = await composeShoppingListWithAi({
      prompt: 'scoate borșul că am deja',
      existingItems: itemsBefore,
    });

    const itemsAfter = refined.items || [];
    assert.ok(!itemsAfter.some(i => i.name.toLowerCase().includes('borș') || i.name.toLowerCase().includes('bors')));
  });

  await t.test('13. Clear all: "sterge toata lista" clears items without creating a product', async () => {
    const initial = await composeShoppingListWithAi({
      prompt: 'mic dejun',
    });
    const itemsBefore = initial.items || [];
    assert.ok(itemsBefore.length >= 4);

    const res = await composeShoppingListWithAi({
      prompt: 'Sterge toata lista',
      existingItems: itemsBefore,
    });

    assert.equal(res.role, 'assistant');
    // Items MUST be empty! NEVER create a product named "sterge toata lista"
    assert.deepEqual(res.items, []);
    assert.ok(res.text.includes('șters') || res.text.includes('curățat'));
  });

  await t.test('14. Clear all on empty list: "goleste lista"', async () => {
    const res = await composeShoppingListWithAi({
      prompt: 'golește lista',
      existingItems: [],
    });
    assert.equal(res.role, 'assistant');
    assert.deepEqual(res.items, []);
  });

  await t.test('15. Smalltalk: "multumesc" does NOT create a product named "multumesc"', async () => {
    const res = await composeShoppingListWithAi({
      prompt: 'Mulțumesc frumos!',
    });
    assert.equal(res.role, 'assistant');
    assert.deepEqual(res.items, []);
    assert.ok(res.text.toLowerCase().includes('plăcere') || res.text.toLowerCase().includes('placere'));
  });

  await t.test('16. Smalltalk: "salut" / "buna" greets without creating products', async () => {
    const res = await composeShoppingListWithAi({
      prompt: 'Bună ziua!',
    });
    assert.equal(res.role, 'assistant');
    assert.deepEqual(res.items, []);
    assert.ok(res.text.toLowerCase().includes('bună') || res.text.toLowerCase().includes('buna'));
  });

  await t.test('17. Grammar check: "1 produs" vs "2 produse"', async () => {
    const res1 = await composeShoppingListWithAi({
      prompt: 'lapte zuzu',
    });
    assert.ok(res1.text.includes('1 produs'));
    assert.ok(!res1.text.includes('1 produse'));

    const res2 = await composeShoppingListWithAi({
      prompt: 'lapte zuzu, paine',
    });
    assert.ok(res2.text.includes('2 produse'));
  });

  await t.test('18. Instant template with custom servings in prompt: "Ingrediente pentru paste carbonara (6 persoane)"', async () => {
    const t0 = performance.now();
    const res = await composeShoppingListWithAi({
      prompt: 'Ingrediente pentru paste carbonara (6 persoane)',
    });
    const duration = performance.now() - t0;
    assert.equal(res.role, 'assistant');
    assert.ok(res.items && res.items.length >= 5);
    // Verified template was scaled (factor 6/4 = 1.5, bacon 2*1.5 = 3 pachete)
    const bacon = res.items.find((i) => i.name.toLowerCase().includes('bacon'));
    assert.ok(bacon);
    assert.equal(bacon.quantity, 3);
    assert.ok(duration < 50, `Expected instant execution (< 50ms), got ${duration.toFixed(1)}ms`);
  });

  await t.test('19. Instant preset template: "Meniu rapid de seară sub 50 lei"', async () => {
    const t0 = performance.now();
    const res = await composeShoppingListWithAi({
      prompt: 'Meniu rapid de seară sub 50 lei',
    });
    const duration = performance.now() - t0;
    assert.equal(res.role, 'assistant');
    assert.ok(res.items && res.items.length >= 3);
    assert.ok(duration < 50, `Expected instant execution (< 50ms), got ${duration.toFixed(1)}ms`);
  });
});
