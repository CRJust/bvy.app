#!/usr/bin/env node
/**
 * Sincronizează Catalogul Canonic deduplicat (implicit doar alimentar, fără prețuri)
 * din JSON-ul local direct în Supabase, folosind
 * `beavy_start_freshful_catalog_run` + `beavy_ingest_freshful_tuples`.
 *
 * Necesită SUPABASE_SERVICE_ROLE_KEY (nu se stochează în repo/.env).
 * Utilizare:
 *   SUPABASE_SERVICE_ROLE_KEY="..." node scripts/push-canonical-catalog.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  buildCompactFreshfulTuple,
  isCoreSupermarketItem,
  isFoodFreshfulItem,
  NON_FOOD_FRESHFUL_SLUGS,
  stripFreshfulPrices,
} from './lib/canonical-catalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_CORE_INPUT = path.join(
  __dirname,
  'output',
  'canonical-catalog',
  'canonical-core-catalog.json'
);
const DEFAULT_FOOD_INPUT = path.join(
  __dirname,
  'output',
  'canonical-catalog',
  'canonical-food-catalog.json'
);

function getArg(args, flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

async function readEnvValue(keyNames) {
  for (const k of keyNames) {
    if (process.env[k]?.trim()) return process.env[k].trim();
  }
  for (const fileName of ['.env.local', '.env']) {
    try {
      const envRaw = await fs.readFile(path.join(ROOT_DIR, fileName), 'utf8');
      for (const k of keyNames) {
        const re = new RegExp(`^${k}\\s*=\\s*["']?([^\\s"']+)["']?`, 'm');
        const match = envRaw.match(re);
        if (match) return match[1].trim();
      }
    } catch {
      // ignore missing env file
    }
  }
  return null;
}

async function readEnvUrl() {
  return readEnvValue(['SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL']);
}

function sanitizeKeyInput(raw) {
  let clean = String(raw || '').trim();
  clean = clean.replace(/^SUPABASE_SERVICE_ROLE_KEY\s*=\s*/i, '').trim();
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1).trim();
  }
  return clean;
}

async function readServiceRoleKey() {
  const fromEnv = await readEnvValue(['SUPABASE_SERVICE_ROLE_KEY']);
  if (fromEnv) return sanitizeKeyInput(fromEnv);

  if (!process.stdin.isTTY) return null;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    console.log('\nCheia service_role se găsește în Supabase Dashboard → Project Settings → API Keys.');
    const answer = await rl.question('Lipește SUPABASE_SERVICE_ROLE_KEY și apasă Enter: ');
    const key = sanitizeKeyInput(answer);
    return key || null;
  } finally {
    rl.close();
  }
}

export async function runPushCanonicalCatalog(args = process.argv.slice(2)) {
  const rawScope = getArg(args, '--scope', 'core');
  const scope = rawScope === 'all' ? 'all' : rawScope === 'food' ? 'food' : 'core';
  const defaultInput = scope === 'core' ? DEFAULT_CORE_INPUT : DEFAULT_FOOD_INPUT;
  const inputPath = path.resolve(process.cwd(), getArg(args, '--input', defaultInput));
  const batchSize = Math.max(25, Number(getArg(args, '--batch-size', '250')) || 250);
  const catalogBatch = getArg(
    args,
    '--batch',
    scope === 'core'
      ? 'canonical_core_2026_11_11'
      : scope === 'food'
        ? 'canonical_food_2026_11_11'
        : 'canonical_full_2026_11_11'
  );
  const city = getArg(args, '--city', 'București');
  const channel = getArg(args, '--channel', 'delivery');
  const dryRun = args.includes('--dry-run');

  const payload = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const rawItems = (payload.dedupedItems || payload.items || []).map(stripFreshfulPrices);
  const items =
    scope === 'all'
      ? rawItems
      : rawItems
          .filter((it) => (scope === 'core' ? isCoreSupermarketItem(it) : isFoodFreshfulItem(it)))
          .map((item) => {
            if (NON_FOOD_FRESHFUL_SLUGS.has(item.category_slug_freshful)) {
              const foodSlug = (item.observed_categories || []).find(
                (s) => !NON_FOOD_FRESHFUL_SLUGS.has(s)
              );
              return foodSlug ? { ...item, category_slug_freshful: foodSlug } : item;
            }
            return item;
          });

  if (items.length === 0) {
    throw new Error(`Nu s-au găsit produse în ${inputPath} pentru scope=${scope}`);
  }

  const usedCanonicalKeys = new Set();
  const tuples = items.map(
    (item) => buildCompactFreshfulTuple(item, usedCanonicalKeys, catalogBatch).tuple
  );

  if (dryRun) {
    console.log(
      `[dry-run] Catalog Canonic (${scope}, fără prețuri): ${tuples.length} tupluri pregătite în batch-uri de ${batchSize} (total ${Math.ceil(tuples.length / batchSize)} batch-uri).`
    );
    return { dryRun: true, count: tuples.length, scope };
  }

  const supabaseUrl = await readEnvUrl();
  const serviceRoleKey = await readServiceRoleKey();
  if (!supabaseUrl) {
    throw new Error('Lipsește EXPO_PUBLIC_SUPABASE_URL / SUPABASE_URL.');
  }
  if (!serviceRoleKey) {
    throw new Error(
      'Lipsește SUPABASE_SERVICE_ROLE_KEY. Rulează `npm run catalog:push` într-o consolă sau pune SUPABASE_SERVICE_ROLE_KEY=... în .env.local.'
    );
  }
  if (serviceRoleKey.startsWith('sb_publishable_')) {
    throw new Error(
      'Ai introdus cheia publică (sb_publishable_...). Pentru upload este necesară cheia secretă (service_role / sb_secret_...) din Supabase Dashboard → Project Settings → API Keys.'
    );
  }
  if (serviceRoleKey.length < 30) {
    throw new Error(
      'Valoarea introdusă este prea scurtă pentru o cheie service_role (pare a fi doar Project ID-ul). Copiază cheia completă `service_role` (începe cu `eyJ...` sau `sb_secret_...`).'
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const observedAt = payload.observedAt || new Date().toISOString();
  const runMetadata = {
    catalogBatch,
    scope,
    catalogOnlyNoPrices: true,
    dedupeStats: payload.dedupeStats || null,
    totalProducts: tuples.length,
  };

  const { data: feedRunId, error: runErr } = await supabase.rpc(
    'beavy_start_freshful_catalog_run',
    {
      p_total_products: tuples.length,
      p_metadata: runMetadata,
    }
  );
  if (runErr || !feedRunId) {
    throw new Error(`Eroare beavy_start_freshful_catalog_run: ${runErr?.message || 'empty run id'}`);
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalProcessed = 0;
  const totalBatches = Math.ceil(tuples.length / batchSize);

  for (let start = 0; start < tuples.length; start += batchSize) {
    const slice = tuples.slice(start, start + batchSize);
    const batchIdx = Math.floor(start / batchSize) + 1;

    let resData = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, error } = await supabase.rpc('beavy_ingest_freshful_tuples', {
        p_feed_run_id: feedRunId,
        p_observed_at: observedAt,
        p_city: city,
        p_channel: channel,
        p_catalog_batch: catalogBatch,
        p_rows: slice,
      });
      if (!error) {
        resData = data;
        lastErr = null;
        break;
      }
      lastErr = error;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }

    if (lastErr) {
      throw new Error(`Eroare la batch ${batchIdx}/${totalBatches}: ${lastErr.message}`);
    }

    totalProcessed += Number(resData?.processed || 0);
    totalInserted += Number(resData?.inserted || 0);
    totalUpdated += Number(resData?.updated || 0);
    console.log(
      `✓ [${batchIdx}/${totalBatches}] Procesate: ${resData?.processed ?? slice.length} (noi: ${resData?.inserted ?? 0}, actualizate: ${resData?.updated ?? 0}, prețuri: ${resData?.offers_upserted ?? 0})`
    );
  }

  const { count: liveCount } = await supabase
    .from('beavy_products')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log('\n=== SINCRONIZARE CATALOG CANONIC COMPLETĂ (DOAR ALIMENTAR, FĂRĂ PREȚURI) ===');
  console.log(
    `FeedRun: ${feedRunId} | Procesate: ${totalProcessed} | Inserate: ${totalInserted} | Actualizate: ${totalUpdated} | Produse active în beavy_products: ${liveCount}`
  );

  return { feedRunId, totalProcessed, totalInserted, totalUpdated, liveCount };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runPushCanonicalCatalog().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
