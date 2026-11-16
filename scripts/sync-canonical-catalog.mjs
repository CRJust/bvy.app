#!/usr/bin/env node
/**
 * Agregă checkpoint-urile per categorie, rulează deduplicarea globală,
 * filtrează după scope (`food` default sau `all`), mapează pe taxonomia Beavy (fără prețuri),
 * auditează calitatea și emite chunk-uri SQL compacte pentru `public.beavy_ingest_freshful_tuples(...)`.
 */
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCompactIngestBatches,
  deduplicateFreshfulItems,
  inferBeavyCategoryAndFamily,
  isCoreSupermarketItem,
  isFoodFreshfulItem,
  NON_FOOD_FRESHFUL_SLUGS,
  stripFreshfulPrices,
} from './lib/canonical-catalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CATEGORIES_DIR = path.join(__dirname, 'output', 'freshful-full', 'categories');
const DEFAULT_OUT_DIR = path.join(__dirname, 'output', 'canonical-catalog-sql');
const DEFAULT_SNAPSHOT_DIR = path.join(__dirname, 'output', 'canonical-catalog');
const DEFAULT_INVENTORY = path.join(__dirname, 'output', 'freshful-category-inventory.json');

function getArg(args, flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

export async function buildCanonicalCatalogSync({
  categoriesDir = DEFAULT_CATEGORIES_DIR,
  outDir = DEFAULT_OUT_DIR,
  snapshotDir = DEFAULT_SNAPSHOT_DIR,
  inventoryPath = DEFAULT_INVENTORY,
  scope = 'core',
  batchSize = 250,
  catalogBatch = 'canonical_core_2026_11_11',
  city = 'București',
  channel = 'delivery',
} = {}) {
  const normalizedScope =
    scope === 'all' ? 'all' : scope === 'food' ? 'food' : 'core';
  const inventory = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
  const expectedActive = (inventory.categories || []).filter(
    (c) => c.total === undefined || c.total === null || Number(c.total) > 0
  );

  const files = (await fs.readdir(categoriesDir)).filter((f) => f.endsWith('.json')).sort();
  const bySlug = new Map();
  const allRawItems = [];
  const incompleteCategories = [];

  for (const file of files) {
    const data = JSON.parse(await fs.readFile(path.join(categoriesDir, file), 'utf8'));
    const slug = data?.collector?.categorySlug || file.replace(/\.json$/, '');
    bySlug.set(slug, data);

    const expectedPages = Number(data?.collector?.totalPagesAvailable || 0);
    const visitedPages = Number(data?.collector?.pagesVisited || 0);
    if (expectedPages > 0 && visitedPages < expectedPages) {
      incompleteCategories.push({ slug, visitedPages, expectedPages });
    }

    let hadPrices = false;
    const cleanedRawItems = (data.rawItems || []).map((item) => {
      if (
        item.price != null ||
        item.regular_price != null ||
        item.promo_price != null ||
        item.loyalty_price != null
      ) {
        hadPrices = true;
      }
      return stripFreshfulPrices(item);
    });
    if (hadPrices) {
      data.rawItems = cleanedRawItems;
      if (Array.isArray(data.dedupedItems)) {
        data.dedupedItems = data.dedupedItems.map(stripFreshfulPrices);
      }
      await fs.writeFile(path.join(categoriesDir, file), JSON.stringify(data, null, 2), 'utf8');
    }
    for (const item of cleanedRawItems) {
      allRawItems.push(item);
    }
  }

  const missingCategories = expectedActive
    .filter((c) => !bySlug.has(c.slug))
    .map((c) => ({ slug: c.slug, expectedTotal: c.total }));

  const deduped = deduplicateFreshfulItems(allRawItems);

  const scopedItems =
    normalizedScope === 'all'
      ? deduped.items
      : deduped.items
          .filter((it) =>
            normalizedScope === 'core' ? isCoreSupermarketItem(it) : isFoodFreshfulItem(it)
          )
          .map((item) => {
            // Dacă raionul primar e non-alimentar dar SKU-ul apare și într-un raion alimentar, folosim raionul alimentar
            if (NON_FOOD_FRESHFUL_SLUGS.has(item.category_slug_freshful)) {
              const foodSlug = (item.observed_categories || []).find(
                (s) => !NON_FOOD_FRESHFUL_SLUGS.has(s)
              );
              return foodSlug ? { ...item, category_slug_freshful: foodSlug } : item;
            }
            return item;
          });

  const excludedOnHold = deduped.items.length - scopedItems.length;
  const categoryCounts = {};
  const stockCounts = { in_stock: 0, low_stock: 0, out_of_stock: 0 };
  let missingImageCount = 0;
  let priceLeakDetected = false;

  for (const item of scopedItems) {
    if (
      item.price != null ||
      item.regular_price != null ||
      item.promo_price != null ||
      item.loyalty_price != null
    ) {
      priceLeakDetected = true;
    }
    const mapRes = inferBeavyCategoryAndFamily(item);
    categoryCounts[mapRes.categorySlug] = (categoryCounts[mapRes.categorySlug] || 0) + 1;
    stockCounts[item.stock_status] = (stockCounts[item.stock_status] || 0) + 1;
    if (!item.image_url) missingImageCount += 1;
  }

  await fs.mkdir(snapshotDir, { recursive: true });
  const snapshotFilename =
    normalizedScope === 'core'
      ? 'canonical-core-catalog.json'
      : normalizedScope === 'food'
        ? 'canonical-food-catalog.json'
        : 'canonical-full-catalog.json';
  const cleanSnapshotPath = path.join(snapshotDir, snapshotFilename);

  const reportSummary = {
    observedAt: new Date().toISOString(),
    catalogBatch,
    scope: normalizedScope,
    catalogOnlyNoPrices: true,
    priceLeakDetected,
    expectedActiveCategories: expectedActive.length,
    collectedCategoriesCount: files.length,
    missingCategories,
    incompleteCategories,
    dedupeStats: deduped.stats,
    excludedOnHold,
    qualityAudit: {
      totalCanonicalProducts: scopedItems.length,
      missingImageCount,
      stockCounts,
      distinctBeavyCategories: Object.keys(categoryCounts).length,
      categoryCounts,
    },
  };

  await fs.writeFile(
    cleanSnapshotPath,
    JSON.stringify(
      {
        ...reportSummary,
        dedupedItems: scopedItems,
        tier2Merges: deduped.tier2Merges,
      },
      null,
      2
    ),
    'utf8'
  );

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const batchPlan = buildCompactIngestBatches({
    dedupedItems: scopedItems,
    dedupeStats: {
      ...deduped.stats,
      scopedProducts: scopedItems.length,
      excludedOnHold,
      scope: normalizedScope,
    },
    city,
    channel,
    catalogBatch,
    batchSize,
  });

  const manifest = [];
  for (const chunk of batchPlan.chunks) {
    const filePath = path.join(outDir, chunk.name);
    await fs.writeFile(filePath, chunk.sql, 'utf8');
    manifest.push({
      name: chunk.name,
      count: chunk.count,
      bytes: Buffer.byteLength(chunk.sql, 'utf8'),
    });
  }

  await fs.writeFile(
    path.join(outDir, 'manifest.json'),
    JSON.stringify({ ...reportSummary, feedRunId: batchPlan.feedRunId, chunks: manifest }, null, 2),
    'utf8'
  );

  return {
    ...reportSummary,
    cleanSnapshotPath,
    outDir,
    feedRunId: batchPlan.feedRunId,
    chunksCount: manifest.length,
    manifest,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const scope = getArg(args, '--scope', 'core');
  const batchSize = Number(getArg(args, '--batch-size', '250'));
  const catalogBatch = getArg(
    args,
    '--batch',
    scope === 'core'
      ? 'canonical_core_2026_11_11'
      : scope === 'food'
        ? 'canonical_food_2026_11_11'
        : 'canonical_full_2026_11_11'
  );

  const result = await buildCanonicalCatalogSync({
    scope,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 250,
    catalogBatch,
  });

  console.log('\n=== RAPORT CATALOG CANONIC (FĂRĂ PREȚURI) ===');
  console.log(
    `Scope: ${result.scope.toUpperCase()} | Categorii sursă: ${result.collectedCategoriesCount}/${result.expectedActiveCategories} | Lipsă: ${result.missingCategories.length} | Incomplete: ${result.incompleteCategories.length}`
  );
  console.log(
    `Brut: ${result.dedupeStats.rawInputCount} -> După SKU dedupe: ${result.dedupeStats.afterSkuDedupeCount} -> Canonice totale: ${result.dedupeStats.afterCanonicalDedupeCount}`
  );
  console.log(
    `Active în Catalog Canonic (${result.scope}): ${result.qualityAudit.totalCanonicalProducts} | Excluse / pe hold: ${result.excludedOnHold}`
  );
  console.log(
    `Audit calitate: fără imagine=${result.qualityAudit.missingImageCount}, priceLeak=${result.priceLeakDetected}, categorii Beavy=${result.qualityAudit.distinctBeavyCategories}`
  );
  console.log(`Snapshot curat: ${result.cleanSnapshotPath}`);
  console.log(`Chunk-uri SQL generate: ${result.chunksCount} în ${result.outDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error('Eroare buildCanonicalCatalogSync:', err);
    process.exit(1);
  });
}
