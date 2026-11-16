#!/usr/bin/env node
/**
 * Backfill coduri EAN (GTIN-8/12/13/14) verificate din `beavy_source_catalog`
 * direct pe produsele canonice `beavy_products.barcode` acolo unde maparea este 1:1.
 */
import { classifyBarcode } from './lib/catalog-normalization.mjs';
import { getSupabaseAdmin } from './lib/supabase-admin.mjs';

async function fetchAll(supabase, table, select, filterFn = null) {
  const rows = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    let q = supabase.from(table).select(select).order('id', { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    page++;
  }
  return rows;
}

async function run() {
  const supabase = await getSupabaseAdmin();
  const [products, sourceRows] = await Promise.all([
    fetchAll(supabase, 'beavy_products', 'id, barcode, is_active'),
    fetchAll(
      supabase,
      'beavy_source_catalog',
      'barcode, canonical_product_id, match_confidence, source',
      (q) => q.not('barcode', 'is', null).not('canonical_product_id', 'is', null)
    ),
  ]);

  const usedBarcodes = new Set(products.map((p) => p.barcode).filter(Boolean));
  const prodHasBarcode = new Set(products.filter((p) => Boolean(p.barcode)).map((p) => p.id));
  const activeIds = new Set(products.filter((p) => p.is_active).map((p) => p.id));

  // Un EAN -> exact 1 canonical_product_id; 1 canonical_product_id -> cel mai bun EAN unic
  const eanToProds = new Map();
  const prodToBestEan = new Map();

  for (const row of sourceRows) {
    const conf = Number(row.match_confidence ?? 0);
    if (conf < 0.85) continue;
    if (!activeIds.has(row.canonical_product_id) || prodHasBarcode.has(row.canonical_product_id)) continue;
    const ean = String(row.barcode || '').trim();
    const cls = classifyBarcode(ean);
    if (!cls || !cls.isGlobalGtin || !cls.validCheckDigit) continue;
    if (usedBarcodes.has(ean)) continue;

    if (!eanToProds.has(ean)) eanToProds.set(ean, new Set());
    eanToProds.get(ean).add(row.canonical_product_id);

    const prev = prodToBestEan.get(row.canonical_product_id);
    if (!prev || conf > prev.conf) {
      prodToBestEan.set(row.canonical_product_id, { ean, conf, source: row.source });
    }
  }

  let updated = 0;
  let skippedConflicts = 0;

  for (const [productId, best] of prodToBestEan.entries()) {
    const sharing = eanToProds.get(best.ean);
    if (!sharing || sharing.size !== 1 || usedBarcodes.has(best.ean)) {
      skippedConflicts++;
      continue;
    }
    usedBarcodes.add(best.ean);
    const { error } = await supabase
      .from('beavy_products')
      .update({ barcode: best.ean, barcode_source: best.source })
      .eq('id', productId)
      .is('barcode', null);
    if (!error) updated++;
  }

  console.log(`✅ Backfill EAN finalizat: ${updated} produse actualizate, ${skippedConflicts} conflicte evitate.`);
}

run().catch((err) => {
  console.error('Fatal backfill error:', err);
  process.exit(1);
});
