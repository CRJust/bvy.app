#!/usr/bin/env node
/**
 * Colector Lidl.ro (Sitemap oficial + pagini SSR JSON-LD & __NUXT_DATA__)
 * Extrage produsele publice alimentare cu EAN (gtin13), preț standard și promoții Lidl Plus.
 */
import zlib from 'node:zlib';
import { isValidEanCheckDigit, normalizeText, parseQuantity } from './lib/catalog-normalization.mjs';
import {
  buildNewCanonicalCandidate,
  buildStandardOffer,
  createIngestionContext,
  flushContextAndOffers,
  isRetailerPrivateBrand,
  matchExternalProduct,
} from './lib/retailer-ingest-helper.mjs';
import { getSupabaseAdmin, resolveRetailerBySlug } from './lib/supabase-admin.mjs';

const LIDL_SITEMAP_URL = 'https://www.lidl.ro/p/export/RO/ro/product_sitemap.xml.gz';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function resolveNuxt(nuxt, idx, depth = 0, seen = new Set()) {
  if (depth > 12 || typeof idx !== 'number' || idx < 0 || idx >= nuxt.length || seen.has(idx)) {
    return idx;
  }
  const val = nuxt[idx];
  if (val === null || typeof val !== 'object') return val;
  const s2 = new Set(seen);
  s2.add(idx);
  if (Array.isArray(val)) {
    if (typeof val[0] === 'string' && ['ShallowReactive', 'Reactive', 'Ref', 'Set'].includes(val[0])) {
      return resolveNuxt(nuxt, val[1], depth + 1, s2);
    }
    return val.slice(0, 40).map((v) => resolveNuxt(nuxt, v, depth + 1, s2));
  }
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    out[k] = resolveNuxt(nuxt, v, depth + 1, s2);
  }
  return out;
}

function parseRoPriceText(txt) {
  const m = String(txt || '').match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}

async function fetchLidlProduct(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  if (/cf-turnstile|just a moment/i.test(html.slice(0, 3000))) {
    throw new Error('Detectată barieră anti-bot pe Lidl.');
  }

  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const prodLd = lds.find((x) => x['@type'] === 'Product');
  const nuxtRaw = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!nuxtRaw) return null;

  const nuxtArr = JSON.parse(nuxtRaw);
  const root = resolveNuxt(nuxtArr, 1);
  const pd = Object.values(root?.data || {})[0];
  if (!pd || typeof pd !== 'object') return null;

  // Filtrare pe Food / Drink / Food-like
  const categoryName = String(pd.category || '');
  if (categoryName && !/food|grocery|aliment|bautur|drink/i.test(categoryName) && !/food/i.test(String(pd.productType || ''))) {
    // Dacă Lidl îl marchează clar Nonfood / DIY / Fashion, îl omitem înainte de matching
    if (/non|diy|home|fashion|sport|garden|parkside/i.test(categoryName)) return null;
  }

  const sku = String(pd.erpNumber || prodLd?.sku || url.split('/p').pop() || '').trim();
  const brand = prodLd?.brand?.name ? String(prodLd.brand.name).trim() : null;
  const rawTitle = String(prodLd?.name || pd.title || pd.fullTitle || '').replace(/\s+/g, ' ').trim();
  if (!rawTitle) return null;

  const fullName =
    brand && !rawTitle.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} ${rawTitle}`
      : rawTitle;

  const eanList = [
    ...(Array.isArray(prodLd?.gtin13) ? prodLd.gtin13 : prodLd?.gtin13 ? [prodLd.gtin13] : []),
    ...(Array.isArray(pd.eans) ? pd.eans : []),
  ];
  const ean = eanList.map((e) => String(e).trim()).find((e) => isValidEanCheckDigit(e)) || null;
  const imageUrl = prodLd?.image?.[0] || null;

  const pkgRaw = pd.price?.packaging?.text || pd.lidlPlus?.[0]?.price?.packaging?.text || '';
  const pkgFromText = String(pkgRaw).split('/')[0]?.trim() || '';
  const parsedQty = parseQuantity(pkgFromText || fullName);
  const packageSize = parsedQty ? `${parsedQty.baseValue} ${parsedQty.baseUnit}` : pkgFromText || null;

  const stdPriceRaw = Number(pd.price?.price);
  const oldPriceRaw = Number(pd.price?.oldPrice);
  const lp = Array.isArray(pd.lidlPlus) ? pd.lidlPlus[0] : null;
  const lpPriceRaw = Number(lp?.price?.price);
  const lpBasePrice = parseRoPriceText(lp?.price?.basePrice?.text);

  let price = Number.isFinite(stdPriceRaw) && stdPriceRaw > 0 ? Math.round(stdPriceRaw * 100) / 100 : null;
  let regularPrice = Number.isFinite(oldPriceRaw) && oldPriceRaw > 0 ? Math.round(oldPriceRaw * 100) / 100 : price;
  let loyaltyPrice = null;
  let promoPrice = null;
  let promoRequiresCard = false;
  let promoLabel = pd.price?.discount?.discountText || null;

  if (!price && lpBasePrice && Number.isFinite(lpPriceRaw) && lpPriceRaw > 0) {
    price = lpBasePrice;
    regularPrice = lpBasePrice;
    loyaltyPrice = Math.round(lpPriceRaw * 100) / 100;
    promoRequiresCard = true;
    promoLabel = lp?.highlightText ? `Lidl Plus · ${lp.highlightText}` : 'Lidl Plus';
  } else if (price && Number.isFinite(lpPriceRaw) && lpPriceRaw > 0 && lpPriceRaw < price) {
    loyaltyPrice = Math.round(lpPriceRaw * 100) / 100;
    promoRequiresCard = true;
    promoLabel = lp?.highlightText ? `Lidl Plus · ${lp.highlightText}` : 'Lidl Plus';
  }

  if (!price) return null;
  if (regularPrice && regularPrice > price && !promoRequiresCard) {
    promoPrice = price;
  }

  return {
    sku,
    url,
    fullName,
    brand,
    categoryName,
    packageSize,
    ean,
    imageUrl,
    price,
    regularPrice: regularPrice ?? price,
    promoPrice,
    loyaltyPrice,
    promoRequiresCard,
    promoLabel,
  };
}

export async function runIngestion() {
  console.log('=== COLECTOR LIDL.RO (SITEMAP OFICIAL + EAN + LIDL PLUS) ===');
  const supabase = await getSupabaseAdmin();
  const [retailer, ctx, buf] = await Promise.all([
    resolveRetailerBySlug(supabase, 'lidl'),
    createIngestionContext(supabase),
    fetch(LIDL_SITEMAP_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} la Lidl sitemap`);
      return r.arrayBuffer();
    }),
  ]);

  const xml = zlib.gunzipSync(Buffer.from(buf)).toString('utf8');
  const urls = [...new Set([...xml.matchAll(/<loc>(https:\/\/www\.lidl\.ro\/p\/[^<]+)<\/loc>/g)].map((m) => m[1]))];
  console.log(`📋 URL-uri de produse în sitemap Lidl: ${urls.length}`);

  const parsedItems = [];
  const concurrency = 6;
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((u) => fetchLidlProduct(u).catch(() => null))
    );
    for (const r of results) {
      if (r) parsedItems.push(r);
    }
    if ((i + concurrency) % 90 === 0 || i + concurrency >= urls.length) {
      console.log(`  [${Math.min(i + concurrency, urls.length)}/${urls.length}] produse alimentare cu preț: ${parsedItems.length}`);
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  const sourceCatalogRows = [];
  const matchedOffersMap = new Map();
  let matchedExisting = 0;
  let promotedNew = 0;
  let skippedNonFood = 0;

  for (const item of parsedItems) {
    const isPrivate = isRetailerPrivateBrand(item.brand, item.fullName);
    const match = matchExternalProduct(ctx, {
      source: 'lidl_sitemap',
      retailerSlug: 'lidl',
      name: item.fullName,
      brand: item.brand,
      packageSize: item.packageSize,
      barcode: item.ean,
      imageUrl: item.imageUrl,
    });

    let canonical = match?.canonical ?? null;
    if (match) {
      matchedExisting++;
    } else {
      const promoted = buildNewCanonicalCandidate(ctx, {
        retailerSlug: 'lidl',
        retailerCodePrefix: 'LDL',
        sourceProductId: item.sku,
        name: item.fullName,
        brand: item.brand,
        packageSize: item.packageSize,
        imageUrl: item.imageUrl,
        barcode: item.ean,
        hintCategoryPath: `${item.categoryName} ${item.fullName}`,
        isPrivateLabel: isPrivate,
      });
      if (promoted) {
        canonical = promoted;
        promotedNew++;
      } else {
        skippedNonFood++;
      }
    }

    const parsedQty = parseQuantity(canonical?.package_size || item.packageSize || item.fullName);
    sourceCatalogRows.push({
      source: 'lidl_sitemap',
      retailer_id: retailer.id,
      source_product_id: item.sku,
      source_product_name: item.fullName,
      normalized_source_name: normalizeText(item.fullName),
      brand: item.brand,
      category: item.categoryName || null,
      barcode: item.ean,
      package_size: canonical?.package_size || item.packageSize,
      quantity_value: parsedQty?.baseValue ?? null,
      quantity_unit: parsedQty?.baseUnit ?? null,
      image_url: item.imageUrl,
      product_url: item.url,
      raw_data: {
        price: item.price,
        regular_price: item.regularPrice,
        loyalty_price: item.loyaltyPrice,
        promo_label: item.promoLabel,
        promo_requires_card: item.promoRequiresCard,
        is_private_label: isPrivate,
      },
      is_active: true,
      canonical_product_id: canonical?.id ?? null,
      match_status: canonical ? 'matched' : 'unmatched',
      match_confidence: match?.confidence ?? (canonical ? 1.0 : 0.0),
      match_method: match?.method ?? (canonical ? 'promoted_lidl_catalog' : 'filtered_out'),
      match_reasons: match?.reasons ?? (canonical ? ['Produs alimentar promovat din Lidl'] : ['Non-food']),
      observed_at: new Date().toISOString(),
      imported_at: new Date().toISOString(),
    });

    if (!canonical) continue;

    const offer = buildStandardOffer({
      productId: canonical.id,
      retailerId: retailer.id,
      retailerName: retailer.name,
      source: 'lidl_sitemap',
      price: item.price,
      regularPrice: item.regularPrice,
      promoPrice: item.promoPrice,
      loyaltyPrice: item.loyaltyPrice,
      promoLabel: item.promoLabel,
      promoRequiresCard: item.promoRequiresCard,
      packageSize: canonical.package_size || item.packageSize,
      quantityValue: canonical.quantity_value,
      quantityUnit: canonical.quantity_unit,
      productUrl: item.url,
      imageUrl: item.imageUrl,
      fulfillmentChannel: 'store',
      city: 'București',
      isAvailable: true,
      rawData: {
        lidl_sku: item.sku,
        lidl_name: item.fullName,
        ean: item.ean,
        match_score: match?.confidence ?? 1.0,
      },
    });

    const prevOffer = matchedOffersMap.get(canonical.id);
    if (
      !prevOffer ||
      (offer.raw_data.match_score || 0) > (prevOffer.raw_data.match_score || 0) ||
      offer.price < prevOffer.price
    ) {
      matchedOffersMap.set(canonical.id, offer);
    }
  }

  const result = await flushContextAndOffers(ctx, {
    retailerId: retailer.id,
    retailerSlug: 'lidl',
    retailerName: retailer.name,
    source: 'lidl_sitemap',
    sourceCatalogRows,
    offerRows: [...matchedOffersMap.values()],
  });

  console.log(`\n🎉 Lidl finalizat! matched=${matchedExisting}, promoted=${promotedNew}, skipped=${skippedNonFood}, offers=${result.offersCount}`);
}

runIngestion().catch((err) => {
  console.error('Fatal Lidl error:', err);
  process.exit(1);
});
