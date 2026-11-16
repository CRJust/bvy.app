import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const supabaseUrl = 'https://igjjuivtgrhjxwdsgiaz.supabase.co';
const supabaseKey = 'sb_publishable_b1R9iWZ5wrKZMOi_VwasPg_yidm-kkn';
const realSupabase = createClient(supabaseUrl, supabaseKey);

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
  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {\n${compiled.outputText}\n})`,
    { filename: filePath }
  );
  wrapper(mod.exports, (id) => extraMocks[id] || require(id), mod, filePath, path.dirname(filePath));
  return mod.exports;
}

async function run() {
  const intelMod = await loadTsModule('src/services/beavy-intelligence.ts');
  const compMod = await loadTsModule('src/services/beavy-comparison.ts', {
    '@/lib/supabase': { supabase: realSupabase },
    '@/services/beavy-intelligence': intelMod,
  });

  const testBasket = [
    { id: '1', name: 'piept de pui dezosat', quantity: 1, isCustom: true },
    { id: '2', name: 'smantana 20%', quantity: 1, isCustom: true },
    { id: '3', name: 'oua proaspete', quantity: 1, isCustom: true },
    { id: '4', name: 'morcovi', quantity: 1, isCustom: true },
    { id: '5', name: 'ardei gras', quantity: 1, isCustom: true },
    { id: '6', name: 'usturoi', quantity: 1, isCustom: true },
    { id: '7', name: 'lamaie', quantity: 1, isCustom: true },
    { id: '8', name: 'telina radacina', quantity: 1, isCustom: true },
    { id: '9', name: 'lapte 3.5%', quantity: 2, isCustom: true },
    { id: '10', name: 'paine feliata', quantity: 1, isCustom: true },
    { id: '11', name: 'unt 82%', quantity: 1, isCustom: true },
    { id: '12', name: 'cascaval afumat', quantity: 1, isCustom: true },
    { id: '13', name: 'ulei de floarea soarelui', quantity: 1, isCustom: true },
    { id: '14', name: 'rosii', quantity: 1, isCustom: true },
    { id: '15', name: 'castraveti', quantity: 1, isCustom: true },
    { id: '16', name: 'ceafa de porc', quantity: 1, isCustom: true },
  ];

  console.log('--- TEST 1: Cold basket comparison (8 generic items) ---');
  console.time('cold_comparison');
  const res1 = await compMod.compareShoppingBasketWithVariants(testBasket, {
    city: 'București',
    channelFilter: 'all',
  });
  console.timeEnd('cold_comparison');
  console.log('Best store:', res1.standard?.retailerSummaries[0]?.retailer?.name);
  console.log('Stores compared:', res1.standard?.retailerSummaries.length);
  console.log('Savings:', res1.standardSavingsVsAverage);

  console.log('\n--- TEST 2: Warm comparison with preferenceMemory ---');
  console.time('warm_with_pref_memory');
  const res2 = await compMod.compareShoppingBasketWithVariants(testBasket, {
    city: 'București',
    channelFilter: 'all',
    preferenceMemory: { preferredStores: [], learnedResolutions: {} },
    learnPreferencesEnabled: true,
  });
  console.timeEnd('warm_with_pref_memory');
  console.log('Best store:', res2.standard?.retailerSummaries[0]?.retailer?.name);

  console.log('\n--- TEST 3: User adds 1 new item to basket ("unt 82%") ---');
  const basketWith9 = [
    ...testBasket,
    { id: '9', name: 'unt 82%', quantity: 1, isCustom: true },
  ];
  console.time('incremental_item_comparison');
  const res3 = await compMod.compareShoppingBasketWithVariants(basketWith9, {
    city: 'București',
    channelFilter: 'all',
  });
  console.timeEnd('incremental_item_comparison');
  console.log('Best store with 9 items:', res3.standard?.retailerSummaries[0]?.retailer?.name);
}

run().catch(console.error);
