#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { loadEnv } from './lib/catalog-normalization.mjs';
import {
  buildCanonicalSyncSql,
  buildChunkedCanonicalSyncSqls,
  deduplicateFreshfulItems,
  reconcileFreshfulWithCatalog,
} from './lib/canonical-catalog.mjs';
import { collectFreshfulCategory } from './freshful-collector.mjs';

const ROOT_DIR = process.cwd();
const OUTPUT_DIR = path.join(ROOT_DIR, 'scripts', 'output');

function getArg(args, name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return fallback;
}

async function fetchSupabaseJson(supabaseUrl, anonKey, relativePath) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${relativePath}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!res.ok) {
    throw new Error(`Supabase REST ${res.status} pe ${relativePath}`);
  }
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const category = getArg(args, '--category', '401-lapte-smantana-si-branza-proaspata');
  const inputFile = getArg(args, '--input');
  const shouldCollect = args.includes('--collect') || !inputFile;
  const maxPages = Number(getArg(args, '--max-pages', '10'));
  const maxProducts = Number(getArg(args, '--max-products', '200'));
  const delayMs = Number(getArg(args, '--delay-ms', '1100'));
  const batchName = getArg(args, '--batch', `freshful_${category.replace(/[^a-z0-9]+/gi, '_')}_test`);
  const city = getArg(args, '--city', 'București');
  const channel = getArg(args, '--channel', 'delivery');
  const dryRun = args.includes('--dry-run');
  const fixturePath = getArg(args, '--fixture');
  const chunkSize = Number(getArg(args, '--chunk-size', '12'));

  let collectedSnapshot;
  if (inputFile && !args.includes('--collect')) {
    const raw = await fs.readFile(path.resolve(ROOT_DIR, inputFile), 'utf8');
    collectedSnapshot = JSON.parse(raw);
  } else if (shouldCollect) {
    collectedSnapshot = await collectFreshfulCategory({
      categoryInput: category,
      maxPages: Number.isFinite(maxPages) ? maxPages : 10,
      maxProducts: Number.isFinite(maxProducts) ? maxProducts : 200,
      delayMs: Number.isFinite(delayMs) ? delayMs : 1100,
      headless: !args.includes('--headful'),
    });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const rawOut = path.join(OUTPUT_DIR, `freshful-${collectedSnapshot.collector.categorySlug}-raw.json`);
    await fs.writeFile(rawOut, JSON.stringify(collectedSnapshot, null, 2), 'utf8');
    console.log(`→ Snapshot brut salvat: ${rawOut}`);
  }

  // Re-deduplică determinist peste rawItems pentru consistență
  const rawItems = collectedSnapshot.rawItems || collectedSnapshot.dedupedItems || [];
  const deduped = deduplicateFreshfulItems(rawItems);

  let canonicalProducts = [];
  let categories = [];
  let families = [];
  const existingSourceLinks = new Map();

  if (fixturePath) {
    const fx = JSON.parse(await fs.readFile(path.resolve(ROOT_DIR, fixturePath), 'utf8'));
    canonicalProducts = fx.products || [];
    categories = fx.categories || [];
    families = fx.families || [];
  } else {
    const env = await loadEnv(ROOT_DIR);
    const url = env.EXPO_PUBLIC_SUPABASE_URL;
    const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    [canonicalProducts, categories, families] = await Promise.all([
      fetchSupabaseJson(
        url,
        key,
        'beavy_products?select=id,canonical_name,normalized_name,brand,category,subcategory,package_size,quantity_value,quantity_unit,barcode,image_url,canonical_code,canonical_key,category_id,attributes&is_active=eq.true&limit=3000'
      ),
      fetchSupabaseJson(
        url,
        key,
        'beavy_categories?select=id,parent_id,slug,name,is_active&limit=500'
      ),
      fetchSupabaseJson(
        url,
        key,
        'beavy_product_families?select=id,family_key,canonical_name,category_id,is_active&limit=1000'
      ),
    ]);
  }

  const existingCategoriesBySlug = new Map(categories.map((c) => [c.slug, c]));
  const existingFamiliesByKey = new Map(families.map((f) => [f.family_key, f]));

  const reconciliation = reconcileFreshfulWithCatalog({
    dedupedItems: deduped.items,
    canonicalProducts,
    existingSourceLinks,
    existingCategoriesBySlug,
    existingFamiliesByKey,
    catalogBatch: batchName,
  });

  console.log('\n=== RECONCILIERE CATALOG CANONIC FRESHFUL ===');
  console.log(`Categorie colectată: ${collectedSnapshot.collector?.categoryName || category}`);
  console.log(`Brut colectat: ${deduped.stats.rawInputCount}`);
  console.log(`După deduplicare SKU (Tier 1): ${deduped.stats.afterSkuDedupeCount} (-${deduped.stats.tier1DuplicatesRemoved})`);
  console.log(`După deduplicare canonică (Tier 2): ${deduped.stats.afterCanonicalDedupeCount} (-${deduped.stats.tier2CanonicalMerges})`);
  console.log(`Potrivite pe produse existente în DB: ${reconciliation.summary.matchedExistingCount} (din care ${reconciliation.summary.matchedImageBackfillCount} pot primi imagine nouă)`);
  console.log(`Propuse pentru review uman (ambigue): ${reconciliation.summary.reviewNeededCount}`);
  console.log(`Produse canonice noi de promovat: ${reconciliation.summary.newCanonicalCount}`);

  if (reconciliation.matchedExisting.length > 0) {
    console.log('\nExemple potriviri exacte cu DB:');
    for (const m of reconciliation.matchedExisting.slice(0, 10)) {
      console.log(`  ✓ [${m.confidence}] ${m.item.canonical_candidate_name} (${m.item.price} RON) => "${m.canonicalProduct.canonical_name}"`);
    }
  }

  if (reconciliation.reviewNeeded.length > 0) {
    console.log('\nProduse trimise în queue review:');
    for (const r of reconciliation.reviewNeeded.slice(0, 12)) {
      console.log(`  ? [${r.confidence}] ${r.item.canonical_candidate_name} vs "${r.candidateProduct.canonical_name}" (${r.reasons.join('; ')})`);
    }
  }

  const slug = collectedSnapshot.collector?.categorySlug || category;
  const report = {
    collector: collectedSnapshot.collector,
    dedupeStats: deduped.stats,
    tier1Duplicates: deduped.tier1Duplicates,
    tier2Merges: deduped.tier2Merges,
    reconciliationSummary: reconciliation.summary,
    matchedExisting: reconciliation.matchedExisting.map((m) => ({
      sku: m.item.source_product_id,
      freshful_name: m.item.canonical_candidate_name,
      price: m.item.price,
      regular_price: m.item.regular_price,
      canonical_product_id: m.canonicalProduct.id,
      canonical_name: m.canonicalProduct.canonical_name,
      confidence: m.confidence,
      backfill_image: m.shouldBackfillImage ? m.item.image_url : null,
      reasons: m.reasons,
    })),
    reviewNeeded: reconciliation.reviewNeeded.map((r) => ({
      sku: r.item.source_product_id,
      freshful_name: r.item.canonical_candidate_name,
      candidate_id: r.candidateProduct.id,
      candidate_name: r.candidateProduct.canonical_name,
      confidence: r.confidence,
      reasons: r.reasons,
    })),
    newCanonicalPreview: reconciliation.newCanonical.map((n) => ({
      sku: n.item.source_product_id,
      canonical_name: n.canonical_name,
      brand: n.brand,
      package_size: n.package_size,
      category_slug: n.category_slug,
      family_key: n.family_key,
      price: n.item.price,
      image_url: n.image_url,
    })),
  };

  if (!dryRun) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const reportPath = path.join(OUTPUT_DIR, `freshful-${slug}-report.json`);
    const sqlPath = path.join(OUTPUT_DIR, `freshful-${slug}-canonical-sync.sql`);
    const sqlOptions = {
      reconciliation,
      dedupeStats: deduped.stats,
      collectorMeta: collectedSnapshot.collector,
      city,
      channel,
      observedAt: collectedSnapshot.collector?.observedAt || new Date().toISOString(),
      catalogBatch: batchName,
    };
    const sql = buildCanonicalSyncSql(sqlOptions);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(sqlPath, sql, 'utf8');

    const chunkDir = path.join(OUTPUT_DIR, `chunks-${slug}`);
    await fs.mkdir(chunkDir, { recursive: true });
    const chunks = buildChunkedCanonicalSyncSqls(sqlOptions, Number.isFinite(chunkSize) && chunkSize > 0 ? chunkSize : 12);
    await fs.rm(chunkDir, { recursive: true, force: true });
    await fs.mkdir(chunkDir, { recursive: true });
    for (const c of chunks) {
      await fs.writeFile(path.join(chunkDir, c.name), c.sql, 'utf8');
    }
    console.log(`\nRaport reconciliere: ${reportPath}`);
    console.log(`SQL idempotent pregătit: ${sqlPath} (+ ${chunks.length} chunk-uri în ${chunkDir})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Eroare pipeline canonic Freshful:', err);
    process.exit(1);
  });
}
