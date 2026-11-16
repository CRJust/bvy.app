#!/usr/bin/env node
import { getSupabaseAdmin } from './lib/supabase-admin.mjs';
import {
  normalizeText,
  parseQuantity,
} from './lib/catalog-normalization.mjs';

const supabase = await getSupabaseAdmin();

async function fetchAll(table, select, filterFn) {
  const rows = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    let q = supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw new Error(`Error fetching ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    page++;
  }
  return rows;
}

async function runAudit() {
  console.log('=== AUDIT COMPLET CELOR 4 MAGAZINE (FRESHFUL, MEGA IMAGE, CARREFOUR, AUCHAN) ===\n');

  const [products, offers, sourceCatalog] = await Promise.all([
    fetchAll(
      'beavy_products',
      'id, canonical_name, brand, package_size, quantity_value, quantity_unit, category, attributes, is_active',
      (q) => q.eq('is_active', true)
    ),
    fetchAll(
      'beavy_product_offers',
      'id, product_id, retailer_id, retailer_name, price, regular_price, promo_price, loyalty_price, promo_label, promo_requires_card, package_size, stock_status, is_active, raw_data',
      (q) => q.eq('is_active', true)
    ),
    fetchAll(
      'beavy_source_catalog',
      'id, retailer_id, source, source_product_id, source_product_name, canonical_product_id, match_status, match_confidence, raw_data',
      null
    ),
  ]);

  const prodById = new Map(products.map((p) => [p.id, p]));
  console.log(`Produse canonice active: ${products.length}`);
  console.log(`Oferte active totale: ${offers.length}`);
  console.log(`Rânduri source_catalog: ${sourceCatalog.length}\n`);

  // Check how multipacks are represented in beavy_products
  const multipackCanonicals = products.filter((p) =>
    /\d+\s*[x×]\s*\d+/i.test(`${p.package_size || ''} ${p.canonical_name}`)
  );
  console.log(`Produse canonice tip multipack (NxM): ${multipackCanonicals.length}`);
  for (const mp of multipackCanonicals.slice(0, 8)) {
    const pq = parseQuantity(mp.package_size || mp.canonical_name);
    console.log(
      `  • "${mp.canonical_name}" | pkg="${mp.package_size}" | qv=${mp.quantity_value} ${mp.quantity_unit} | parseQuantity=${pq ? `${pq.baseValue}${pq.baseUnit} (pack=${pq.packCount})` : 'null'}`
    );
  }

  // Per retailer summary
  const byRetailer = new Map();
  for (const o of offers) {
    if (!byRetailer.has(o.retailer_name)) byRetailer.set(o.retailer_name, []);
    byRetailer.get(o.retailer_name).push(o);
  }

  console.log('\n--- 1. STATISTICI PE MAGAZIN ---');
  for (const [name, list] of byRetailer.entries()) {
    const loyaltyCount = list.filter((o) => o.loyalty_price !== null || o.promo_requires_card).length;
    const promoCount = list.filter((o) => o.promo_label || o.promo_price !== null).length;
    const sgrCount = list.filter((o) => o.raw_data?.sgr_fee > 0).length;
    const oosCount = list.filter((o) => o.stock_status === 'out_of_stock').length;
    console.log(
      `  ${name.padEnd(12)} | oferte=${String(list.length).padStart(4)} | promo=${String(promoCount).padStart(4)} | fidelitate/card=${String(loyaltyCount).padStart(3)} | SGR=${String(sgrCount).padStart(3)} | OOS=${String(oosCount).padStart(3)}`
    );
  }

  // Private labels count per source
  const privateBySource = new Map();
  for (const sc of sourceCatalog) {
    if (sc.raw_data?.is_private_label && !sc.canonical_product_id) {
      privateBySource.set(sc.source, (privateBySource.get(sc.source) || 0) + 1);
    }
  }
  console.log('\n--- 2. MĂRCI PROPRII STOCATE (fără canonical_product_id) ---');
  for (const [src, cnt] of privateBySource.entries()) {
    console.log(`  ${src}: ${cnt}`);
  }

  // Overlap distribution
  const storesByProduct = new Map();
  for (const o of offers) {
    if (!o.product_id) continue;
    if (!storesByProduct.has(o.product_id)) storesByProduct.set(o.product_id, []);
    storesByProduct.get(o.product_id).push(o);
  }
  const overlapCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const list of storesByProduct.values()) {
    const uniqStores = new Set(list.map((o) => o.retailer_name)).size;
    overlapCounts[uniqStores] = (overlapCounts[uniqStores] || 0) + 1;
  }
  console.log('\n--- 3. SUPRAPUNERE ÎNTRE MAGAZINE ---');
  console.log(
    `  1 magazin=${overlapCounts[1]} | 2 magazine=${overlapCounts[2]} | 3 magazine=${overlapCounts[3]} | 4 magazine=${overlapCounts[4]}`
  );

  // Price spread audit (>= 2.0x spread across stores for same product, in-stock offers only)
  console.log('\n--- 4. AUDIT DIFERENȚE MARI DE PREȚ (>= 2.0x ÎNTRE MAGAZINE, ÎN STOC) ---');
  const suspiciousSpreads = [];
  for (const [pid, list] of storesByProduct.entries()) {
    const inStockList = list.filter((o) => o.stock_status !== 'out_of_stock');
    if (inStockList.length < 2) continue;
    const sorted = [...inStockList].sort((a, b) => a.price - b.price);
    const minO = sorted[0];
    const maxO = sorted[sorted.length - 1];
    const ratio = maxO.price / minO.price;
    if (ratio >= 2.0 && maxO.price - minO.price >= 5) {
      const prod = prodById.get(pid);
      suspiciousSpreads.push({
        ratio,
        prod,
        offers: sorted.map((o) => ({
          retailer: o.retailer_name,
          price: o.price,
          loyalty: o.loyalty_price,
          extName: o.raw_data?.auchan_name || o.raw_data?.mega_name || o.raw_data?.carrefour_name || '(Freshful)',
        })),
      });
    }
  }
  suspiciousSpreads.sort((a, b) => b.ratio - a.ratio);
  console.log(`Total cazuri cu raport max/min >= 2.0x (și dif >= 5 RON): ${suspiciousSpreads.length}`);
  for (const sp of suspiciousSpreads.slice(0, 45)) {
    console.log(
      `\n  [${sp.ratio.toFixed(2)}x] Canonical: "${sp.prod?.canonical_name}" (${sp.prod?.package_size || ''})`
    );
    for (const o of sp.offers) {
      console.log(`     - ${o.retailer.padEnd(10)}: ${o.price.toFixed(2)} RON ${o.loyalty ? `(card ${o.loyalty})` : ''} | ${o.extName}`);
    }
  }

  // Pack-count & token mismatch audit on matched offers (Auchan / Mega Image / Carrefour)
  console.log('\n--- 5. AUDIT NECONCORDANȚE PACHET / MULTIPACK / DENUMIRE ---');
  const packMismatches = [];
  const sublineMismatches = [];
  for (const o of offers) {
    if (o.retailer_name === 'Freshful') continue;
    const prod = prodById.get(o.product_id);
    if (!prod) continue;
    const extName = String(
      o.raw_data?.auchan_name || o.raw_data?.mega_name || o.raw_data?.carrefour_name || ''
    );
    if (!extName) continue;

    const cQty = parseQuantity(prod.package_size || prod.canonical_name);
    const eQty = parseQuantity(extName);
    if (cQty && eQty && cQty.packCount !== eQty.packCount) {
      packMismatches.push({ retailer: o.retailer_name, prod: prod.canonical_name, pkg: prod.package_size, extName, score: o.raw_data?.match_score });
    }

    // Check suspicious key words appearing on only one side
    const cNorm = normalizeText(prod.canonical_name);
    const eNorm = normalizeText(extName);
    const guards = [
      'decofeinizata', 'fara cofeina', 'fara alcool', '0.0%',
      'crema', 'velvet', 'kronung', 'monarch', 'espresso', 'intense',
      'clasic', 'classic', 'gold', 'platinum', 'roast',
      'feliat', 'feliata', 'cuburi', 'ras', 'rasa', 'bucata',
      'afumat', 'afumata', 'pui', 'porc', 'vita', 'curcan', 'somon', 'ton',
      'extravirgin', 'virgin', 'turte', 'pufuleti', 'covrigei',
      'vegan', 'post', 'keto', 'proteic', 'zero', 'twist', 'lime',
      'capsule', 'plicuri', 'doze', 'borcan', 'sticla', 'cutie', 'punga',
      'lapte', 'smantana', 'iaurt', 'cascaval', 'telemea', 'branza',
    ];
    const diffs = [];
    for (const g of guards) {
      const inC = new RegExp(`\\b${g}\\b`).test(cNorm);
      const inE = new RegExp(`\\b${g}\\b`).test(eNorm);
      if (inC !== inE) diffs.push(`${inC ? 'Beavy' : o.retailer}:${g}`);
    }
    if (diffs.length >= 2 || (diffs.some((d) => /decofeinizata|fara alcool|fara cofeina|extravirgin|afumat|pui|porc|vita|curcan|ton|somon|ras|feliat|capsule|plicuri|lapte|iaurt|cascaval|telemea/.test(d)))) {
      sublineMismatches.push({
        retailer: o.retailer_name,
        prod: prod.canonical_name,
        pkg: prod.package_size,
        extName,
        diffs: diffs.join(', '),
      });
    }
  }
  console.log(`Neconcordanțe packCount (multipack vs simplu): ${packMismatches.length}`);
  for (const m of packMismatches.slice(0, 20)) {
    console.log(`  - [${m.retailer}] "${m.prod}" (${m.pkg})  <-->  "${m.extName}"`);
  }

  console.log(`\nPosibile conflicte subtip/sub-gamă: ${sublineMismatches.length}`);
  for (const m of sublineMismatches.slice(0, 40)) {
    console.log(`  - [${m.retailer}] (${m.diffs}) | "${m.prod}" <--> "${m.extName}"`);
  }

  // Freshful missing canonicals analysis
  const freshfulOfferPids = new Set((byRetailer.get('Freshful') || []).map((o) => o.product_id));
  const missingFreshful = products.filter((p) => !freshfulOfferPids.has(p.id));
  console.log(`\n--- 6. ANALIZĂ PRODUSE FĂRĂ OFERTĂ LA FRESHFUL (${missingFreshful.length}) ---`);
  const missByCatSlug = new Map();
  let noSku = 0;
  for (const p of missingFreshful) {
    if (!p.attributes?.freshful_sku) noSku++;
    const slug = p.attributes?.freshful_category_slug || '(no slug)';
    missByCatSlug.set(slug, (missByCatSlug.get(slug) || 0) + 1);
  }
  console.log(`  Fără freshful_sku: ${noSku}`);
  console.log('  Top 15 categorii Freshful fără preț:', [...missByCatSlug.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15));
}

runAudit().catch((e) => {
  console.error(e);
  process.exit(1);
});
