#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { getSupabaseAdmin } from './lib/supabase-admin.mjs';
import {
  computeNormalizedUnitPrice,
  parseQuantity,
} from './lib/catalog-normalization.mjs';

const supabase = await getSupabaseAdmin();

const FRESHFUL_RETAILER_ID = '9f5b313a-c17c-4d16-b686-da176fb287db';

async function loadActiveCanonicalsAndSources() {
  console.log('--- 1. Încărcare produse canonice active + source_catalog Freshful ---');
  const products = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('beavy_products')
      .select('id, canonical_name, package_size, quantity_value, quantity_unit, attributes')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`Eroare citire beavy_products: ${error.message}`);
    products.push(...(data || []));
    if (!data || data.length < pageSize) break;
    page++;
  }

  const sourceMapByCanonicalId = new Map();
  let scPage = 0;
  while (true) {
    const { data, error } = await supabase
      .from('beavy_source_catalog')
      .select('id, canonical_product_id, source_product_id')
      .eq('retailer_id', FRESHFUL_RETAILER_ID)
      .not('canonical_product_id', 'is', null)
      .order('id', { ascending: true })
      .range(scPage * pageSize, (scPage + 1) * pageSize - 1);
    if (error) throw new Error(`Eroare citire beavy_source_catalog: ${error.message}`);
    for (const row of data || []) {
      sourceMapByCanonicalId.set(row.canonical_product_id, row.id);
    }
    if (!data || data.length < pageSize) break;
    scPage++;
  }

  console.log(`Produse canonice active: ${products.length}, mapări source_catalog: ${sourceMapByCanonicalId.size}`);
  return { products, sourceMapByCanonicalId };
}

async function fetchFreshfulCategoryPage(slug, page = 1) {
  const url = `https://www.freshful.ro/api/v2/shop/categories/${encodeURIComponent(slug)}?page=${page}&limit=60`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  });

  if (res.status === 403 || res.status === 429) {
    throw new Error(`Acces blocat de Freshful (HTTP ${res.status}). Oprire imediată.`);
  }
  if (!res.ok) {
    return null;
  }
  const json = await res.json().catch(() => null);
  return json?.payload ?? null;
}

function parseFreshfulSgr(rawItem) {
  if (!Array.isArray(rawItem?.taxes)) return null;
  for (const tax of rawItem.taxes) {
    if (String(tax?.type ?? '').toLowerCase() === 'sgr') {
      const m = String(tax?.text ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
      if (m) {
        const val = Number(m[1]);
        if (Number.isFinite(val) && val > 0) return Math.round(val * 100) / 100;
      }
    }
  }
  return null;
}

function buildOfferRow(rawItem, canonical, sourceCatalogId, observedAt) {
  const rawPrice = Number(rawItem.price);
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;

  const effectivePrice = Math.round(rawPrice * 100) / 100;
  const origRaw = rawItem.originalPrice != null ? Number(rawItem.originalPrice) : null;
  const regularPrice =
    origRaw !== null && Number.isFinite(origRaw) && origRaw > effectivePrice
      ? Math.round(origRaw * 100) / 100
      : effectivePrice;
  const promoPrice = regularPrice > effectivePrice ? effectivePrice : null;

  const geniusRaw = rawItem.geniusPrice != null ? Number(rawItem.geniusPrice) : null;
  const loyaltyPrice =
    geniusRaw !== null && Number.isFinite(geniusRaw) && geniusRaw > 0 && geniusRaw < effectivePrice
      ? Math.round(geniusRaw * 100) / 100
      : null;

  const sgrFee = parseFreshfulSgr(rawItem);

  const basePromoLabel =
    String(rawItem.discountLabel ?? '').trim() ||
    String(rawItem.activePromotion?.name ?? '').trim() ||
    (regularPrice > effectivePrice
      ? `-${Math.round(((regularPrice - effectivePrice) / regularPrice) * 100)}%`
      : null);

  const geniusDiscountTxt = String(rawItem.geniusDiscountLabel ?? '').trim();
  const geniusTag = loyaltyPrice !== null
    ? geniusDiscountTxt
      ? `Genius (${geniusDiscountTxt})`
      : 'Preț Genius'
    : null;
  const promoLabel = [basePromoLabel, geniusTag].filter(Boolean).join(' · ') || null;

  const isAvailable = rawItem.isAvailable !== false;
  const stockStatus = !isAvailable
    ? 'out_of_stock'
    : rawItem.maxAvailableQuantity != null &&
      Number(rawItem.maxAvailableQuantity) > 0 &&
      Number(rawItem.maxAvailableQuantity) <= 3
    ? 'low_stock'
    : 'in_stock';

  const parsedQty = parseQuantity(canonical.package_size || canonical.canonical_name);
  const liveQty = parseQuantity(rawItem.name);
  if (parsedQty && liveQty) {
    if (
      parsedQty.kind !== liveQty.kind ||
      Math.abs(parsedQty.baseValue - liveQty.baseValue) / parsedQty.baseValue > 0.05 ||
      (parsedQty.packCount !== liveQty.packCount &&
        Math.max(parsedQty.packCount, liveQty.packCount) >= 3)
    ) {
      return null;
    }
  }
  const { normalizedUnitPrice, normalizedUnitLabel } = computeNormalizedUnitPrice(
    effectivePrice,
    parsedQty
  );

  const slug = String(rawItem.slug ?? '').trim();
  const productUrl = slug ? `https://www.freshful.ro/p/${slug}` : canonical.attributes?.freshful_url || null;
  const imageUrl =
    rawItem.image?.extralarge?.default ||
    rawItem.image?.large?.default ||
    rawItem.image?.thumbnail?.default ||
    null;

  return {
    product_id: canonical.id,
    source_catalog_id: sourceCatalogId ?? null,
    retailer_id: FRESHFUL_RETAILER_ID,
    retailer_name: 'Freshful',
    source: 'freshful_api_temp',
    price: effectivePrice,
    regular_price: regularPrice,
    promo_price: promoPrice,
    loyalty_price: loyaltyPrice,
    promo_label: promoLabel,
    promo_requires_card: loyaltyPrice !== null,
    currency: 'RON',
    unit_price: normalizedUnitPrice,
    normalized_unit_price: normalizedUnitPrice,
    normalized_unit_label: normalizedUnitLabel,
    quantity_value: canonical.quantity_value,
    quantity_unit: canonical.quantity_unit,
    package_size: canonical.package_size,
    product_url: productUrl,
    image_url: imageUrl,
    fulfillment_channel: 'delivery',
    city: 'București',
    stock_status: stockStatus,
    availability: stockStatus,
    is_active: true,
    observed_at: observedAt,
    raw_data: {
      freshful_sku: String(rawItem.sku ?? rawItem.code ?? ''),
      unit_price_label: rawItem.unitPriceLabel ?? null,
      active_promotion: rawItem.activePromotion ?? null,
      genius_discount_label: geniusDiscountTxt || null,
      sgr_fee: sgrFee,
      temporary_price_sync: true,
    },
  };
}

async function run() {
  const { products, sourceMapByCanonicalId } = await loadActiveCanonicalsAndSources();

  const skuToProduct = new Map();
  const categorySlugs = new Set();

  for (const p of products) {
    const sku = String(p.attributes?.freshful_sku ?? '').trim();
    if (sku) skuToProduct.set(sku, p);
    const catSlug = String(p.attributes?.freshful_category_slug ?? '').trim();
    if (catSlug) categorySlugs.add(catSlug);
  }

  // Adăugăm și eventuale slug-uri alimentare din inventar dacă mai există produse negăsite
  let extraFoodSlugs = [];
  try {
    const invPath = path.join(process.cwd(), 'scripts', 'output', 'freshful-category-inventory.json');
    const inv = JSON.parse(await fs.readFile(invPath, 'utf8'));
    extraFoodSlugs = (inv.categories || [])
      .map((c) => c.slug)
      .filter((s) => s && !categorySlugs.has(s));
  } catch {
    // opțional
  }

  const primarySlugs = Array.from(categorySlugs);
  console.log(`\n--- 2. Colectare prețuri reale Freshful din ${primarySlugs.length} categorii ---`);

  const observedAt = new Date().toISOString();
  const offersByProductId = new Map();
  let requestsCount = 0;

  async function processSlug(slug) {
    const first = await fetchFreshfulCategoryPage(slug, 1);
    requestsCount++;
    if (!first || !Array.isArray(first.items)) return;

    const totalPages = Math.max(1, Number(first.pages || 1));
    const ingestItems = (items) => {
      for (const raw of items) {
        const sku = String(raw.sku ?? raw.code ?? raw.variantCode ?? '').trim();
        const canonical = skuToProduct.get(sku);
        if (!canonical) continue;
        if (offersByProductId.has(canonical.id)) continue;

        const row = buildOfferRow(
          raw,
          canonical,
          sourceMapByCanonicalId.get(canonical.id),
          observedAt
        );
        if (row) offersByProductId.set(canonical.id, row);
      }
    };

    ingestItems(first.items);

    for (let p = 2; p <= totalPages; p++) {
      await new Promise((r) => setTimeout(r, 90));
      const next = await fetchFreshfulCategoryPage(slug, p);
      requestsCount++;
      if (next && Array.isArray(next.items)) {
        ingestItems(next.items);
      }
    }
  }

  for (let i = 0; i < primarySlugs.length; i++) {
    const slug = primarySlugs[i];
    await processSlug(slug);
    if ((i + 1) % 10 === 0 || i + 1 === primarySlugs.length) {
      console.log(
        `  [${i + 1}/${primarySlugs.length}] categorii procesate -> ${offersByProductId.size}/${products.length} produse cu preț găsite (${requestsCount} reqs)`
      );
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  if (offersByProductId.size < skuToProduct.size && extraFoodSlugs.length > 0) {
    console.log(`\nVerificare ${extraFoodSlugs.length} subcategorii alimentare suplimentare pentru SKUs rămase...`);
    for (const slug of extraFoodSlugs) {
      await processSlug(slug);
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  const offersToInsert = Array.from(offersByProductId.values());
  console.log(`\n--- 3. Salvare ${offersToInsert.length} oferte Freshful în beavy_product_offers ---`);

  if (offersToInsert.length < 20) {
    throw new Error(
      `Refusing to replace Freshful offers: scrape produced ${offersToInsert.length} offers (minimum 20).`
    );
  }

  const { error: delErr } = await supabase
    .from('beavy_product_offers')
    .delete()
    .eq('retailer_id', FRESHFUL_RETAILER_ID);

  if (delErr) {
    throw new Error(`Eroare la ștergerea snapshotului anterior Freshful: ${delErr.message}`);
  }

  const chunkSize = 150;
  for (let i = 0; i < offersToInsert.length; i += chunkSize) {
    const chunk = offersToInsert.slice(i, i + chunkSize);
    const { error: insErr } = await supabase.from('beavy_product_offers').insert(chunk);
    if (insErr) {
      throw new Error(`Eroare la inserare chunk ${i}: ${insErr.message}`);
    }
  }

  console.log(
    `\n🎉 Finalizat! Inserate ${offersToInsert.length} oferte Freshful cu prețuri reale (din ${products.length} produse canonice active).`
  );
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
