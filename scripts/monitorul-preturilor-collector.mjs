#!/usr/bin/env node
/**
 * Monitorul Prețurilor Official API Collector for Beavy
 * 
 * Fetches real, daily price submissions mandated by the Romanian Competition Council
 * (Consiliul Concurenței) from https://monitorulpreturilor.info
 * 
 * Covers major supermarket networks:
 * - Kaufland (KAUFLAND)
 * - Lidl (4055329000008)
 * - Penny (PENNY)
 * - Auchan (AUCHAN)
 * - Carrefour (5940475006709)
 * - Mega Image (5940475870003)
 * 
 * Guarantees:
 * 1. Strict anti-slop / anti-false-merge matching: preserves meat cuts, fat percentages,
 *    distinct brand identities, and exact packaging.
 * 2. High-speed comparison: updates verified offers with fresh observed_at timestamps.
 * 3. Preserves existing category and subcategory taxonomy.
 */

import https from 'node:https';
import { getSupabaseAdmin, resolveRetailerBySlug } from './lib/supabase-admin.mjs';
import {
  createIngestionContext,
  matchExternalProduct,
  buildNewCanonicalCandidate,
  buildStandardOffer,
  isRetailerPrivateBrand,
  pickFamilyForProduct,
} from './lib/retailer-ingest-helper.mjs';
import { parseQuantity, computeNormalizedUnitPrice } from './lib/catalog-normalization.mjs';

// Ignore governmental SSL intermediate chain validation quirks on Node.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const agent = new https.Agent({ rejectUnauthorized: false });

const BASE_URL = 'https://monitorulpreturilor.info/pmonsvc/Retail';

const NETWORK_MAP = {
  'KAUFLAND': { slug: 'kaufland', name: 'Kaufland' },
  '4055329000008': { slug: 'lidl', name: 'Lidl' },
  'PENNY': { slug: 'penny', name: 'Penny' },
  'AUCHAN': { slug: 'auchan', name: 'Auchan' },
  '5940475006709': { slug: 'carrefour', name: 'Carrefour' },
  '5940475870003': { slug: 'mega-image', name: 'Mega Image' },
};

// Priority staple category IDs from Monitorul Prețurilor
const STAPLE_CATEGORIES = [
  { id: 138, name: 'Unt' },
  { id: 182, name: 'Oua de gaina' },
  { id: 137, name: 'Lapte' },
  { id: 139, name: 'Smantana' },
  { id: 136, name: 'Iaurturi' },
  { id: 113, name: 'Carne pasare proaspata' },
  { id: 114, name: 'Carne porc proaspata' },
  { id: 115, name: 'Carne vita proaspata' },
  { id: 147, name: 'Salamuri' },
  { id: 148, name: 'Carnati' },
  { id: 150, name: 'Crenwursti' },
  { id: 151, name: 'Parizer' },
  { id: 149, name: 'Pate ficat' },
  { id: 153, name: 'Peste proaspat' },
  { id: 92,  name: 'Legume proaspete' },
  { id: 142, name: 'Rosii' },
  { id: 143, name: 'Cartofi' },
  { id: 129, name: 'Mere' },
  { id: 132, name: 'Banane' },
  { id: 133, name: 'Citrice' },
  { id: 167, name: 'Paine proaspata' },
  { id: 168, name: 'Paine ambalata' },
  { id: 159, name: 'Faina' },
  { id: 160, name: 'Orez' },
  { id: 162, name: 'Ulei floarea soarelui' },
  { id: 164, name: 'Zahar' },
  { id: 171, name: 'Paste' },
  { id: 107, name: 'Apa plata' },
  { id: 108, name: 'Apa carbogazoasa' },
  { id: 111, name: 'Cafea' },
];

// Anchors covering Bucharest Sectors 1-6 (buffer 3500m per probe)
const PROBE_ANCHORS = [
  { sector: 1, name: 'Sector 1 (Băneasa / Victoriei)', lat: 44.4650, lon: 26.0750, buffer: 3500 },
  { sector: 2, name: 'Sector 2 (Obor / Colentina)', lat: 44.4500, lon: 26.1350, buffer: 3500 },
  { sector: 3, name: 'Sector 3 (Titan / Vitan)', lat: 44.4150, lon: 26.1500, buffer: 3500 },
  { sector: 4, name: 'Sector 4 (Berceni / Olteniței)', lat: 44.3850, lon: 26.1100, buffer: 3500 },
  { sector: 5, name: 'Sector 5 (Rahova / Sebastian)', lat: 44.4050, lon: 26.0650, buffer: 3500 },
  { sector: 6, name: 'Sector 6 (Drumul Taberei / Militari)', lat: 44.4350, lon: 26.0150, buffer: 3500 },
];

function fetchXml(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const doFetch = (attempt) => {
      const req = https.get(url, { rejectUnauthorized: false, timeout: 20000 }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', (err) => {
        if (attempt >= retries - 1) reject(err);
        else setTimeout(() => doFetch(attempt + 1), 1000 * (attempt + 1));
      });
      req.on('timeout', () => {
        req.destroy();
        if (attempt >= retries - 1) reject(new Error('Timeout la cererea Monitorul Prețurilor'));
        else setTimeout(() => doFetch(attempt + 1), 1000 * (attempt + 1));
      });
    };
    doFetch(0);
  });
}

async function fetchProductsForCategory(cid) {
  const url = `${BASE_URL}/GetCatalogProductsByNameNetwork?CSVcategids=${cid}`;
  const xml = await fetchXml(url);
  const matches = [...xml.matchAll(/<CatalogProduct>[\s\S]*?<Id>(.*?)<\/Id>[\s\S]*?<Name>(.*?)<\/Name>[\s\S]*?<\/CatalogProduct>/g)];
  return matches.map(m => ({
    id: m[1],
    name: m[2].trim(),
    categId: cid,
  }));
}

function parseStorePrices(xml) {
  const storeMatches = [...xml.matchAll(/<RetailStore>([\s\S]*?)<\/RetailStore>/g)];
  const results = [];

  for (const sm of storeMatches) {
    const sxml = sm[1];
    const netId = sxml.match(/<Retailnetwork>[\s\S]*?<Id>(.*?)<\/Id>/)?.[1];
    const storeName = sxml.match(/<Name>(.*?)<\/Name>/)?.[1];
    const netInfo = NETWORK_MAP[netId];
    if (!netInfo) continue;

    const prodMatches = [...sxml.matchAll(/<Product>([\s\S]*?)<\/Product>/g)];
    for (const pm of prodMatches) {
      const pxml = pm[1];
      const priceStr = pxml.match(/<Price>(.*?)<\/Price>/)?.[1];
      const price = parseFloat(priceStr || '0');
      if (!price || price <= 0) continue;

      const pName = pxml.match(/<Name>(.*?)<\/Name>/)?.[1]?.trim() || '';
      const pBrand = pxml.match(/<Brand>(.*?)<\/Brand>/)?.[1]?.trim() || '';
      const pDate = pxml.match(/<Pricedate>(.*?)<\/Pricedate>/)?.[1]?.trim() || '';
      const pUnit = pxml.match(/<Unit>(.*?)<\/Unit>/)?.[1]?.trim() || '';
      const catProdId = pxml.match(/<Catprod>[\s\S]*?<Id>(.*?)<\/Id>/)?.[1] || '';
      const catProdName = pxml.match(/<Catprod>[\s\S]*?<Name>(.*?)<\/Name>/)?.[1]?.trim() || '';

      results.push({
        netId,
        slug: netInfo.slug,
        retailerName: netInfo.name,
        storeName,
        catProdId,
        catProdName,
        name: pName || catProdName,
        brand: pBrand,
        price,
        priceDate: pDate,
        unit: pUnit,
      });
    }
  }

  return results;
}

export async function runMonitorulCollector({ maxProductsPerCategory = 120, silent = false } = {}) {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();
  if (!silent) console.log('=== Monitorul Prețurilor Collector Pornit ===');

  const supabase = await getSupabaseAdmin();
  const ctx = await createIngestionContext(supabase);
  if (!silent) console.log(`Încărcate ${ctx.activeProducts.length} produse canonice active în memorie.`);

  // Load retailer rows from DB
  const { data: retailers } = await supabase.from('beavy_retailers').select('id, slug, name');
  const retailerBySlug = new Map(retailers.map(r => [r.slug, r]));

  // Track stats per retailer
  const stats = {};
  for (const info of Object.values(NETWORK_MAP)) {
    stats[info.slug] = { matched: 0, newPromoted: 0, offersSaved: 0 };
  }

  // 1. Gather all staple products to probe
  const catalogProducts = [];
  for (const cat of STAPLE_CATEGORIES) {
    try {
      const prods = await fetchProductsForCategory(cat.id);
      const chosen = prods.slice(0, maxProductsPerCategory);
      if (!silent) console.log(`  [Categ ${cat.id}] ${cat.name}: ${prods.length} total, selectate ${chosen.length}`);
      catalogProducts.push(...chosen);
    } catch (err) {
      console.warn(`  ⚠️ Eroare la categoria ${cat.id} (${cat.name}): ${err.message}`);
    }
  }

  if (!silent) console.log(`Total produse de interogat: ${catalogProducts.length}`);

  // 2. Fetch prices in batches across anchors
  const allPriceEntries = [];
  const BATCH_SIZE = 45;

  for (let i = 0; i < catalogProducts.length; i += BATCH_SIZE) {
    const batch = catalogProducts.slice(i, i + BATCH_SIZE);
    const ids = batch.map(p => p.id).join(',');

    for (const anchor of PROBE_ANCHORS) {
      try {
        const url = `${BASE_URL}/GetStoresForProductsByLatLon?lat=${anchor.lat}&lon=${anchor.lon}&buffer=${anchor.buffer || 3500}&csvprodids=${ids}&OrderBy=price`;
        const xml = await fetchXml(url);
        const prices = parseStorePrices(xml);
        allPriceEntries.push(...prices);
      } catch (err) {
        // Skip occasional timeout on split anchor
      }
    }
    if (!silent && (i + BATCH_SIZE) % 180 === 0) {
      console.log(`  Progres interogare: ${Math.min(i + BATCH_SIZE, catalogProducts.length)} / ${catalogProducts.length} produse procesate...`);
    }
  }

  if (!silent) console.log(`Total înregistrări de preț colectate: ${allPriceEntries.length}`);

  // 3. Deduplicate by retailer slug + catProdId (choose the lowest verified price)
  const uniqueByRetailer = new Map();
  for (const pe of allPriceEntries) {
    const key = `${pe.slug}:${pe.catProdId || pe.name}`;
    const existing = uniqueByRetailer.get(key);
    if (!existing || pe.price < existing.price) {
      uniqueByRetailer.set(key, pe);
    }
  }

  if (!silent) console.log(`Deduplicate la ${uniqueByRetailer.size} combinații unice magazin-produs.`);

  // 4. Match against canonical catalog or promote clean private label
  const offersToUpsert = [];
  const nowIso = new Date().toISOString();

  for (const item of uniqueByRetailer.values()) {
    const retRow = retailerBySlug.get(item.slug);
    if (!retRow) continue;

    // Strict candidate match
    const match = matchExternalProduct(ctx, {
      name: item.name,
      brand: item.brand,
      price: item.price,
      source: 'monitorul_preturilor',
    });

    let targetProductId = null;
    let targetCanonical = null;

    if (match && match.confidence >= 0.85) {
      targetProductId = match.canonical.id;
      targetCanonical = match.canonical;
      stats[item.slug].matched++;
    } else if (isRetailerPrivateBrand(item.brand, item.name)) {
      // Eligible private label product (Pilos, K-Classic, Boni, etc.)
      const parsedQty = parseQuantity(item.name);
      const pkgSizeStr = parsedQty ? `${parsedQty.baseValue} ${parsedQty.baseUnit}` : '1 buc';
      
      const newCand = buildNewCanonicalCandidate(ctx, {
        retailerSlug: item.slug,
        retailerCodePrefix: item.slug.slice(0, 3).toUpperCase(),
        sourceProductId: `MON-${item.catProdId}`,
        name: item.name,
        brand: item.brand || item.retailerName,
        packageSize: pkgSizeStr,
        imageUrl: null,
        barcode: null,
        hintCategoryPath: item.catProdName,
        isPrivateLabel: true,
      });

      if (newCand) {
        ctx.pendingNewProducts.push(newCand);
        const fam = pickFamilyForProduct(ctx, ctx.categoriesBySlug.get(newCand.category_id), newCand.canonical_name);
        if (fam) {
          ctx.pendingFamilyLinks.push({ family_id: fam.id, product_id: newCand.id });
        }
        targetProductId = newCand.id;
        targetCanonical = newCand;
        stats[item.slug].newPromoted++;
      }
    }

    if (!targetProductId || !targetCanonical) continue;

    // Build standard offer row
    const parsedQty = parseQuantity(targetCanonical.package_size || item.name);
    const qVal = targetCanonical.quantity_value ?? parsedQty?.baseValue ?? 1;
    const qUnit = targetCanonical.quantity_unit ?? parsedQty?.baseUnit ?? 'buc';
    const isWeightItem = /kg|g|kilogram|gram/i.test(qUnit) && (qUnit === 'kg' && qVal === 1);
    const unitPriceCalc = computeNormalizedUnitPrice(item.price, qVal, qUnit);

    const offer = {
      product_id: targetProductId,
      retailer_id: retRow.id,
      retailer_name: retRow.name,
      source: 'monitorul_preturilor',
      price: item.price,
      currency: 'RON',
      unit_price: unitPriceCalc?.value ?? item.price,
      quantity_value: qVal,
      quantity_unit: qUnit,
      package_size: targetCanonical.package_size || (parsedQty ? `${parsedQty.baseValue} ${parsedQty.baseUnit}` : '1 buc'),
      product_url: null,
      image_url: targetCanonical.image_url || null,
      fulfillment_channel: 'store',
      city: 'București',
      availability: 'in_stock',
      observed_at: nowIso,
      is_active: true,
      regular_price: item.price,
      promo_price: null,
      loyalty_price: null,
      promo_label: null,
      promo_requires_card: false,
      stock_status: 'in_stock',
      sell_by_mode: isWeightItem ? 'kg' : 'unit',
      normalized_unit_price: unitPriceCalc?.value ?? item.price,
      normalized_unit_label: unitPriceCalc?.label ?? 'RON/buc',
      raw_data: {
        monitorul_prod_id: item.catProdId,
        monitorul_name: item.name,
        monitorul_brand: item.brand,
        store_sample: item.storeName,
        price_date: item.priceDate,
      },
    };

    offersToUpsert.push(offer);
    stats[item.slug].offersSaved++;
  }

  // 5. Commit pending canonical candidates and offers via SECURITY DEFINER RPC
  const offersByRetailer = new Map();
  for (const off of offersToUpsert) {
    if (!offersByRetailer.has(off.retailer_id)) offersByRetailer.set(off.retailer_id, []);
    offersByRetailer.get(off.retailer_id).push(off);
  }

  // Deduplicate new products by ID and canonical_key
  const dedupNewProdsMap = new Map();
  for (const np of ctx.pendingNewProducts) {
    if (!dedupNewProdsMap.has(np.id) && !dedupNewProdsMap.has(np.canonical_key)) {
      dedupNewProdsMap.set(np.id, np);
      dedupNewProdsMap.set(np.canonical_key, np);
    }
  }
  const uniqueNewProducts = Array.from(new Set(dedupNewProdsMap.values()));

  // Deduplicate family links by product_id
  const dedupFamLinksMap = new Map();
  for (const fl of ctx.pendingFamilyLinks) {
    dedupFamLinksMap.set(fl.product_id, fl);
  }
  const uniqueFamilyLinks = Array.from(dedupFamLinksMap.values());

  // First, insert any new canonical products
  if (uniqueNewProducts.length > 0) {
    if (!silent) console.log(`Promovare ${uniqueNewProducts.length} produse noi private-label prin RPC...`);
    for (let i = 0; i < uniqueNewProducts.length; i += 50) {
      const prodsChunk = uniqueNewProducts.slice(i, i + 50);
      const famLinksChunk = uniqueFamilyLinks.filter(fl => prodsChunk.some(p => p.id === fl.product_id));
      const sampleRetailerId = retailers[0].id;

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('beavy_ingest_retailer_batch', {
        p_retailer_id: sampleRetailerId,
        p_delete_existing_offers: false,
        p_new_products: prodsChunk,
        p_family_links: famLinksChunk,
        p_source_rows: [],
        p_offer_rows: [],
      });
      if (rpcErr) {
        console.warn('  ⚠️ Eroare la promovare produse canonice noi:', rpcErr.message);
      }
    }
  }

  // Second, upsert offers per retailer cleanly
  let totalSaved = 0;
  for (const [retId, retOffers] of offersByRetailer.entries()) {
    // Deduplicate offers by product_id + fulfillment_channel
    const dedupMap = new Map();
    for (const o of retOffers) {
      const key = `${o.product_id}:${o.fulfillment_channel}`;
      dedupMap.set(key, o);
    }
    const uniqueOffers = Array.from(dedupMap.values());

    for (let i = 0; i < uniqueOffers.length; i += 100) {
      const offerChunk = uniqueOffers.slice(i, i + 100);
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('beavy_ingest_retailer_batch', {
        p_retailer_id: retId,
        p_delete_existing_offers: false,
        p_new_products: [],
        p_family_links: [],
        p_source_rows: [],
        p_offer_rows: offerChunk,
      });

      if (rpcErr) {
        console.warn(`  ⚠️ Eroare la salvare oferte pentru retailer ${retId}:`, rpcErr.message);
      } else {
        totalSaved += rpcRes?.offers_saved ?? offerChunk.length;
      }
    }
  }

  if (!silent) console.log(`Salvate cu succes ${totalSaved} oferte proaspete în beavy_product_offers.`);

  // 6. Update feed run in beavy_feed_runs
  try {
    await supabase.from('beavy_feed_runs').insert({
      source: 'monitorul_preturilor',
      status: 'success',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      products_found: uniqueByRetailer.size,
      offers_saved: totalSaved,
      metadata: { stats, durationMs: Date.now() - startTime },
    });
  } catch {
    // Non-fatal
  }

  if (!silent) {
    console.log(`\n=== Monitorul Prețurilor Finalizat în ${((Date.now() - startTime) / 1000).toFixed(1)}s ===`);
    console.table(stats);
  }

  return { finalOffersCount: totalSaved, stats };
}

// Allow CLI execution
if (process.argv[1]?.endsWith('monitorul-preturilor-collector.mjs')) {
  runMonitorulCollector().catch((err) => {
    console.error('Fatal collector error:', err);
    process.exit(1);
  });
}
