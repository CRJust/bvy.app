#!/usr/bin/env node
import { getSupabaseAdmin } from './lib/supabase-admin.mjs';
import {
  buildBrandPhraseIndex,
  computeNormalizedUnitPrice,
  findBrandCandidatesForTitle,
  normalizeBrandKey,
  normalizeText,
  parseQuantity,
  scoreCanonicalCandidate,
} from './lib/catalog-normalization.mjs';

const supabase = await getSupabaseAdmin();

const CARREFOUR_RETAILER_ID = 'a7af2e48-c152-49a6-b33d-f37ab0caf68a';
const CARREFOUR_ORIGIN = 'https://carrefour.ro';

const PRIVATE_LABEL_CATEGORIES = [
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/marci-proprii-carrefour/carrefour-bio/`, name: 'Carrefour Bio' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/marci-proprii-carrefour/carrefour-classic/`, name: 'Carrefour Classic' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/marci-proprii-carrefour/drag-de-romania/`, name: 'Drag de Romania' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/marci-proprii-carrefour/reflets-de-france/`, name: 'Reflets de France' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/marci-proprii-carrefour/carrefour-extra/`, name: 'Carrefour Extra' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/marci-proprii-carrefour/carrefour-selection/`, name: 'Carrefour Selection' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/marci-proprii-carrefour/carrefour-sensation/`, name: 'Carrefour Sensation' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/marci-proprii-carrefour/carrefour-original/`, name: 'Carrefour Original' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/marci-proprii-carrefour/terre-d-italia/`, name: "Terre d'Italia" },
];

const PUBLIC_GROCERY_CATEGORIES = [
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/alimente/`, name: 'Alimente' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/bauturi-nealcoolice/`, name: 'Băuturi nealcoolice' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/bauturi-alcoolice/`, name: 'Băuturi alcoolice' },
  { url: `${CARREFOUR_ORIGIN}/bacanie-carrefour/vinuri-romanesti-si-internationale/`, name: 'Vinuri' },
  { url: `${CARREFOUR_ORIGIN}/bebelusi-copii-si-jucarii/articole-bebelusi/hrana-bebelusi/`, name: 'Hrană bebeluși' },
];

function parseSgrFromBlock(blockHtml) {
  const m = blockHtml.match(/class="listing-sgr"[\s\S]*?\+\s*(\d+(?:[.,]\d+)?)\s*LEI/i);
  if (!m) return null;
  const val = Number(m[1].replace(',', '.'));
  return Number.isFinite(val) && val > 0 ? Math.round(val * 100) / 100 : null;
}

function isCarrefourPrivateLabelName(name) {
  const norm = normalizeBrandKey(name);
  return (
    /\b(carrefour|drag de romania|reflets de france|terre d italia|p tit carrefour)\b/.test(norm) ||
    /\bsimpl\b/.test(norm)
  );
}

function parseOldPriceHtml(blockHtml) {
  const m = blockHtml.match(/id="old-price-[^"]+"[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return null;
  const plain = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const numMatch = plain.match(/(\d+)\s+(\d{2})/) || plain.match(/(\d+[.,]\d{1,2})/);
  if (!numMatch) return null;
  const num = numMatch[2]
    ? Number(`${numMatch[1]}.${numMatch[2]}`)
    : Number(numMatch[1].replace(',', '.'));
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
}

function parseCarrefourPage(html, isPrivateCategory = false) {
  if (/just a moment|verify you are human|cf-turnstile|g-recaptcha/i.test(html.slice(0, 4000))) {
    throw new Error('Detectată barieră anti-bot / CAPTCHA pe Carrefour. Oprire imediată.');
  }

  const pageNums = [...new Set([...html.matchAll(/\?p=(\d+)/g)].map((m) => Number(m[1])))];
  const maxPage = pageNums.length > 0 ? Math.max(...pageNums) : 1;

  const blocks = html.split(/<li\s+[^>]*data-type="catalog-product"[^>]*>/).slice(1);
  const items = [];

  for (const block of blocks) {
    const evM = block.match(/data-event-attributes='([^']+)'/);
    if (!evM) continue;

    let ev;
    try {
      ev = JSON.parse(evM[1]);
    } catch {
      continue;
    }

    const sku = String(ev.id ?? '').trim();
    const name = String(ev.name ?? '').replace(/\s+/g, ' ').trim();
    const price = Number(ev.price);
    if (!sku || !name || !Number.isFinite(price) || price <= 0) continue;

    const regularCandidate = parseOldPriceHtml(block);
    const regularPrice =
      regularCandidate !== null && regularCandidate > price ? regularCandidate : price;
    const promoPrice = regularPrice > price ? price : null;
    const promoLabel =
      promoPrice !== null
        ? `-${Math.round(((regularPrice - price) / regularPrice) * 100)}%`
        : null;

    const urlM = block.match(/href="(https:\/\/carrefour\.ro\/produse\/[^"]+)"/);
    const imgM = block.match(/data-src="(https:\/\/[^"]+)"/) || block.match(/<img[^>]+src="(https:\/\/cdn-media\.carrefour\.ro\/[^"]+)"/);
    const inStock = !block.includes('schema.org/OutOfStock');
    const sgrFee = parseSgrFromBlock(block);

    const item0 = ev.items?.[0] ?? {};
    const categoryPath = [
      item0.item_category3,
      item0.item_category,
      item0.item_category2,
      item0.item_category4,
    ]
      .filter(Boolean)
      .join(' > ');

    items.push({
      sku,
      name,
      price: Math.round(price * 100) / 100,
      regularPrice,
      promoPrice,
      promoLabel,
      sgrFee,
      productUrl: urlM?.[1] ?? null,
      imageUrl: imgM?.[1] ?? null,
      inStock,
      categoryPath: categoryPath || null,
      isPrivateLabel: isPrivateCategory || isCarrefourPrivateLabelName(name),
    });
  }

  return { items, maxPage };
}

async function fetchCarrefourHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
    },
  });
  if (res.status === 403 || res.status === 429) {
    throw new Error(`Acces blocat de Carrefour (HTTP ${res.status}). Oprire imediată.`);
  }
  if (!res.ok) return null;
  return res.text();
}

async function scrapeCategory(categoryUrl, label, isPrivateCategory = false) {
  const firstHtml = await fetchCarrefourHtml(categoryUrl);
  if (!firstHtml) return [];

  const first = parseCarrefourPage(firstHtml, isPrivateCategory);
  const collected = [...first.items];
  const totalPages = Math.max(1, first.maxPage);

  if (totalPages > 1) {
    const pageList = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const concurrency = 4;
    for (let i = 0; i < pageList.length; i += concurrency) {
      const batch = pageList.slice(i, i + concurrency);
      const htmls = await Promise.all(
        batch.map((p) => fetchCarrefourHtml(`${categoryUrl}?p=${p}`))
      );
      for (const h of htmls) {
        if (!h) continue;
        const parsed = parseCarrefourPage(h, isPrivateCategory);
        collected.push(...parsed.items);
      }
      if ((i + concurrency) % 40 === 0) {
        console.log(`    ${label}: ${Math.min(i + concurrency + 1, totalPages)}/${totalPages} pagini...`);
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  console.log(`  ✓ ${label}: ${collected.length} produse (${totalPages} pagini)`);
  return collected;
}

async function loadAllCanonicals() {
  console.log('--- 1. Încărcare catalog canonic activ Beavy ---');
  const all = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('beavy_products')
      .select('id, canonical_name, normalized_name, brand, package_size, quantity_value, quantity_unit, category')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`Eroare citire beavy_products: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    page++;
  }
  console.log(`Produse canonice active încărcate: ${all.length}`);
  return all;
}

export async function runIngestion() {
  const canonicals = await loadAllCanonicals();
  const brandIndex = buildBrandPhraseIndex(canonicals);
  const observedAt = new Date().toISOString();

  const itemsBySku = new Map();

  console.log('\n--- 2. Colectare mărci proprii Carrefour ---');
  for (const cat of PRIVATE_LABEL_CATEGORIES) {
    const items = await scrapeCategory(cat.url, cat.name, true);
    for (const it of items) {
      itemsBySku.set(it.sku, it);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log('\n--- 3. Colectare categorii alimentare & băuturi Carrefour ---');
  for (const cat of PUBLIC_GROCERY_CATEGORIES) {
    const items = await scrapeCategory(cat.url, cat.name, false);
    for (const it of items) {
      const prev = itemsBySku.get(it.sku);
      if (prev) {
        it.isPrivateLabel = prev.isPrivateLabel || it.isPrivateLabel;
      }
      itemsBySku.set(it.sku, it);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\nTotal produse unice colectate din Carrefour: ${itemsBySku.size}`);

  const matchedOffersMap = new Map();
  const sourceCatalogRows = [];
  let privateLabelCount = 0;
  let discardedCount = 0;

  for (const item of itemsBySku.values()) {
    const candidates = findBrandCandidatesForTitle(item.name, brandIndex);
    const parsedQty = parseQuantity(item.name);
    const qtyStr = parsedQty ? `${parsedQty.baseValue} ${parsedQty.baseUnit}` : '';

    let bestMatch = null;
    let highestScore = 0;

    for (const cand of candidates) {
      const scoreResult = scoreCanonicalCandidate(cand, {
        code: '',
        product_name: item.name,
        brands: '',
        image_url: item.imageUrl,
        quantity: qtyStr,
        requireImage: false,
      });

      if (
        scoreResult.confidence > highestScore &&
        scoreResult.confidence >= 0.72 &&
        scoreResult.quantityExact === true
      ) {
        highestScore = scoreResult.confidence;
        bestMatch = { canonical: cand, ...scoreResult };
      }
    }

    if (bestMatch) {
      const cand = bestMatch.canonical;

      sourceCatalogRows.push({
        source: 'carrefour_catalog',
        retailer_id: CARREFOUR_RETAILER_ID,
        source_product_id: item.sku,
        source_product_name: item.name,
        normalized_source_name: normalizeText(item.name),
        brand: cand.brand || null,
        barcode: null,
        package_size: cand.package_size,
        image_url: item.imageUrl,
        product_url: item.productUrl,
        external_category_path: item.categoryPath,
        raw_data: {
          carrefour_sku: item.sku,
          price: item.price,
          regular_price: item.regularPrice,
          promo_price: item.promoPrice,
          promo_label: item.promoLabel,
          sgr_fee: item.sgrFee,
          is_available: item.inStock,
          is_private_label: item.isPrivateLabel,
        },
        is_active: true,
        canonical_product_id: cand.id,
        match_status: 'matched',
        match_confidence: bestMatch.confidence,
        match_method: 'brand_and_token_heuristic',
        match_reasons: bestMatch.reasons,
        observed_at: observedAt,
        imported_at: observedAt,
      });

      const canonicalParsedQty = parseQuantity(cand.package_size || cand.canonical_name);
      const { normalizedUnitPrice, normalizedUnitLabel } = computeNormalizedUnitPrice(
        item.price,
        canonicalParsedQty
      );

      const stockStatus = item.inStock ? 'in_stock' : 'out_of_stock';
      const offerRow = {
        product_id: cand.id,
        retailer_id: CARREFOUR_RETAILER_ID,
        retailer_name: 'Carrefour',
        source: 'carrefour_catalog',
        price: item.price,
        regular_price: item.regularPrice,
        promo_price: item.promoPrice,
        loyalty_price: null,
        promo_label: item.promoLabel,
        promo_requires_card: false,
        currency: 'RON',
        unit_price: normalizedUnitPrice,
        normalized_unit_price: normalizedUnitPrice,
        normalized_unit_label: normalizedUnitLabel,
        quantity_value: cand.quantity_value,
        quantity_unit: cand.quantity_unit,
        package_size: cand.package_size,
        product_url: item.productUrl,
        image_url: item.imageUrl,
        fulfillment_channel: 'store',
        city: 'București',
        stock_status: stockStatus,
        availability: stockStatus,
        is_active: true,
        observed_at: observedAt,
        raw_data: {
          carrefour_sku: item.sku,
          carrefour_name: item.name,
          sgr_fee: item.sgrFee,
          match_score: bestMatch.confidence,
        },
      };

      const existing = matchedOffersMap.get(cand.id);
      if (
        !existing ||
        bestMatch.confidence > (existing.raw_data?.match_score || 0) ||
        (bestMatch.confidence === (existing.raw_data?.match_score || 0) && item.price < existing.price)
      ) {
        matchedOffersMap.set(cand.id, offerRow);
      }
    } else if (item.isPrivateLabel) {
      // EXCEPȚIE: Produse marcă proprie Carrefour păstrate pentru funcția viitoare
      privateLabelCount++;
      sourceCatalogRows.push({
        source: 'carrefour_catalog',
        retailer_id: CARREFOUR_RETAILER_ID,
        source_product_id: item.sku,
        source_product_name: item.name,
        normalized_source_name: normalizeText(item.name),
        brand: 'Carrefour',
        barcode: null,
        package_size: parsedQty ? `${parsedQty.baseValue} ${parsedQty.baseUnit}` : null,
        quantity_value: parsedQty ? parsedQty.baseValue : null,
        quantity_unit: parsedQty ? parsedQty.baseUnit : null,
        image_url: item.imageUrl,
        product_url: item.productUrl,
        external_category_path: item.categoryPath,
        raw_data: {
          is_private_label: true,
          carrefour_sku: item.sku,
          price: item.price,
          regular_price: item.regularPrice,
          promo_price: item.promoPrice,
          promo_label: item.promoLabel,
          is_available: item.inStock,
        },
        is_active: true,
        canonical_product_id: null,
        match_status: 'unmatched',
        match_confidence: 1.0,
        match_method: 'carrefour_private_label_detector',
        match_reasons: ['Marcă proprie Carrefour'],
        observed_at: observedAt,
        imported_at: observedAt,
      });
    } else {
      // NU face match și NU e marcă proprie -> NU SE IMPORTĂ
      discardedCount++;
    }
  }

  const finalOffers = Array.from(matchedOffersMap.values());

  if (finalOffers.length < 20) {
    throw new Error(
      `Refusing to replace Carrefour offers: scrape produced ${finalOffers.length} offers (minimum 20).`
    );
  }

  console.log('\n--- 4. REZULTATE MATCHING & FILTRARE CARREFOUR ---');
  console.log(`✅ Oferte potrivite canonic (distincte): ${finalOffers.length}`);
  console.log(`🏷️ Produse marcă proprie Carrefour reținute (pentru funcție viitoare): ${privateLabelCount}`);
  console.log(`❌ Produse Carrefour ignorate (fără match și fără marcă proprie): ${discardedCount}`);
  console.log(`Total înregistrări pentru beavy_source_catalog: ${sourceCatalogRows.length}`);

  if (sourceCatalogRows.length > 0) {
    console.log('\n--- 5. Salvare în public.beavy_source_catalog ---');
    await supabase
      .from('beavy_source_catalog')
      .delete()
      .eq('retailer_id', CARREFOUR_RETAILER_ID);

    const chunkSize = 200;
    for (let i = 0; i < sourceCatalogRows.length; i += chunkSize) {
      const chunk = sourceCatalogRows.slice(i, i + chunkSize);
      const { error } = await supabase.from('beavy_source_catalog').upsert(chunk, {
        onConflict: 'source,source_product_id',
      });
      if (error) throw new Error(`Eroare chunk source_catalog ${i}: ${error.message}`);
    }
    console.log(`Salvate ${sourceCatalogRows.length} înregistrări în beavy_source_catalog.`);
  }

  console.log('\n--- 6. Salvare oferte active în public.beavy_product_offers ---');
  await supabase
    .from('beavy_product_offers')
    .delete()
    .eq('retailer_id', CARREFOUR_RETAILER_ID);

  if (finalOffers.length > 0) {
    const chunkSize = 150;
    for (let i = 0; i < finalOffers.length; i += chunkSize) {
      const chunk = finalOffers.slice(i, i + chunkSize);
      const { error } = await supabase.from('beavy_product_offers').insert(chunk);
      if (error) throw new Error(`Eroare chunk product_offers ${i}: ${error.message}`);
    }
    console.log(`Inserate ${finalOffers.length} oferte active Carrefour în beavy_product_offers.`);
  }

  return {
    matchedCount: finalOffers.length,
    privateLabelCount,
    discardedCount,
    totalSourceRows: sourceCatalogRows.length,
  };
}

if (process.argv[1]?.endsWith('carrefour-collector.mjs')) {
  runIngestion()
    .then((stats) => {
      console.log('\n🎉 Ingestie Carrefour finalizată cu succes!', stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}
