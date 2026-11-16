#!/usr/bin/env node
/**
 * Colector Sezamo.ro (API REST Rohlik public)
 * Colectează toate categoriile alimentare din Sezamo, potrivește pe EAN + heuristică canonică,
 * promovează produsele alimentare lipsă în catalog și încarcă ofertele active (inclusiv prețuri Xtra).
 */
import { normalizeText, parseQuantity } from './lib/catalog-normalization.mjs';
import {
  buildNewCanonicalCandidate,
  buildStandardOffer,
  createIngestionContext,
  flushContextAndOffers,
  isRetailerPrivateBrand,
  matchExternalProduct,
} from './lib/retailer-ingest-helper.mjs';
import { getSupabaseAdmin, resolveRetailerBySlug } from './lib/supabase-admin.mjs';

const SEZAMO_ORIGIN = 'https://www.sezamo.ro';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Categorii strict alimentare și băuturi (excludem farmacie, pet shop, curățenie, cosmetice)
const FOOD_TOP_CATEGORIES = new Set([
  '627', // Fructe si Legume
  '626', // Brutarie si Patiserie
  '631', // Lactate si oua
  '628', // Carne si Peste
  '3759', // BBQ
  '630', // Ready to Eat & Cook
  '629', // Mezeluri
  '2621', // Plant Based
  '632', // Bacanie
  '633', // Produse congelate
  '634', // Bauturi
  '2364', // Nutritie speciala
  '2743', // Craciun
  '637', // Mama si copilul (filtrat suplimentar în inferGroceryCategory)
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 403 || res.status === 429) {
    throw new Error(`Acces limitat de Sezamo (HTTP ${res.status}). Oprire.`);
  }
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}

async function fetchSezamoGroceryCategories() {
  const html = await (
    await fetch(SEZAMO_ORIGIN, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    })
  ).text();

  const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!ndMatch) throw new Error('Nu am găsit __NEXT_DATA__ pe sezamo.ro');
  const nd = JSON.parse(ndMatch[1]);
  const queries = nd?.props?.pageProps?.dehydratedState?.queries || [];
  const navQ = queries.find((q) => JSON.stringify(q.queryKey).includes('navigationCategories'));
  const items = navQ?.state?.data?.items || [];

  const subCatIds = [];
  for (const top of items) {
    const idStr = String(top.id);
    if (!FOOD_TOP_CATEGORIES.has(idStr)) continue;
    const subs = Array.isArray(top.subcategoryIds) && top.subcategoryIds.length > 0
      ? top.subcategoryIds.map((s) => ({ id: s, parentName: top.name }))
      : [{ id: top.id, parentName: top.name }];
    subCatIds.push(...subs);
  }
  return subCatIds;
}

async function fetchCategoryProductIds(catId) {
  const ids = [];
  for (let page = 0; page < 40; page++) {
    const data = await fetchJson(
      `${SEZAMO_ORIGIN}/api/v1/categories/normal/${catId}/products?page=${page}&size=50&sort=recommended&filter=`
    );
    const list = data?.productIds || [];
    ids.push(...list);
    if (list.length < 50) break;
    await sleep(60);
  }
  return ids;
}

function parseSezamoPricing(priceObj) {
  if (!priceObj?.price?.amount) return null;
  const price = Math.round(Number(priceObj.price.amount) * 100) / 100;
  if (!Number.isFinite(price) || price <= 0) return null;

  const sales = Array.isArray(priceObj.sales) ? priceObj.sales : [];
  const xtraSale = sales.find((s) => s.type === 'premium' && s.price?.amount > 0);
  const publicSale = sales.find((s) => s.type !== 'premium' && s.price?.amount > 0);

  const regularAmount = publicSale?.originalPrice?.amount
    ? Math.round(Number(publicSale.originalPrice.amount) * 100) / 100
    : price;
  const promoAmount =
    publicSale && publicSale.price.amount < regularAmount
      ? Math.round(Number(publicSale.price.amount) * 100) / 100
      : null;

  const currentStdPrice = promoAmount ?? price;
  const loyaltyPrice =
    xtraSale && Number(xtraSale.price.amount) < currentStdPrice
      ? Math.round(Number(xtraSale.price.amount) * 100) / 100
      : null;

  let promoLabel = null;
  if (loyaltyPrice !== null) {
    promoLabel = 'Preț Sezamo Xtra';
  } else if (promoAmount !== null && regularAmount > promoAmount) {
    const pct = Math.round(((regularAmount - promoAmount) / regularAmount) * 100);
    promoLabel = pct >= 3 ? `-${pct}%` : 'Promoție';
  }

  return {
    price: currentStdPrice,
    regularPrice: regularAmount,
    promoPrice: promoAmount,
    loyaltyPrice,
    promoLabel,
    promoRequiresCard: loyaltyPrice !== null,
  };
}

export async function runIngestion() {
  console.log('=== COLECTOR SEZAMO.RO (CATALOG ALIMENTAR COMPLET) ===');
  const supabase = await getSupabaseAdmin();
  const [retailer, ctx] = await Promise.all([
    resolveRetailerBySlug(supabase, 'sezamo'),
    createIngestionContext(supabase),
  ]);

  const categories = await fetchSezamoGroceryCategories();
  console.log(`📂 Categorii alimentare detectate pe Sezamo: ${categories.length}`);

  const idToParentName = new Map();
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const prodIds = await fetchCategoryProductIds(cat.id);
    for (const pid of prodIds) {
      if (!idToParentName.has(pid)) idToParentName.set(pid, cat.parentName);
    }
    if ((i + 1) % 20 === 0 || i + 1 === categories.length) {
      console.log(`  [${i + 1}/${categories.length}] ID-uri colectate unic: ${idToParentName.size}`);
    }
    await sleep(50);
  }

  const allIds = [...idToParentName.keys()];
  const sourceCatalogRows = [];
  const matchedOffersMap = new Map();
  let matchedExisting = 0;
  let promotedNew = 0;
  let skippedNonFood = 0;

  const chunkSize = 24;
  for (let i = 0; i < allIds.length; i += chunkSize) {
    const chunk = allIds.slice(i, i + chunkSize);
    const qs = chunk.map((id) => `products=${id}`).join('&');
    const [details, prices, stocks, cards] = await Promise.all([
      fetchJson(`${SEZAMO_ORIGIN}/api/v1/products?${qs}`),
      fetchJson(`${SEZAMO_ORIGIN}/api/v1/products/prices?${qs}`),
      fetchJson(`${SEZAMO_ORIGIN}/api/v1/products/stock?${qs}`),
      fetchJson(`${SEZAMO_ORIGIN}/api/v1/products/card?${qs}`),
    ]);

    const detailMap = new Map((details || []).map((d) => [d.id, d]));
    const priceMap = new Map((prices || []).map((p) => [p.productId, p]));
    const stockMap = new Map((stocks || []).map((s) => [s.productId, s]));
    const cardMap = new Map((cards || []).map((c) => [c.productId, c]));

    for (const pid of chunk) {
      const det = detailMap.get(pid);
      const pr = priceMap.get(pid);
      const st = stockMap.get(pid);
      const cd = cardMap.get(pid);
      if (!det || !pr || det.archived) continue;

      const pricing = parseSezamoPricing(pr);
      if (!pricing) continue;

      const name = String(det.name || cd?.name || '').replace(/\s+/g, ' ').trim();
      const brand = det.brand ? String(det.brand).trim() : null;
      const pkgText = det.textualAmount || (st?.packageInfo?.amount && st?.packageInfo?.unit ? `${st.packageInfo.amount} ${st.packageInfo.unit}` : null);
      const imageUrl = cd?.image?.path || (det.images?.[0]?.path ? `https://cdn.sezamo.ro${det.images[0].path}` : null);
      const productUrl = det.slug ? `${SEZAMO_ORIGIN}/${pid}-${det.slug}` : null;
      const parentCatName = idToParentName.get(pid) || '';
      const isPrivate = isRetailerPrivateBrand(brand, name);
      const isAvailable = (st?.maxBasketAmount ?? 0) > 0 && !st?.unavailabilityReason;

      let match = matchExternalProduct(ctx, {
        source: 'sezamo_api',
        retailerSlug: 'sezamo',
        name,
        brand,
        packageSize: pkgText,
        barcode: null,
        imageUrl,
      });

      let canonical = match?.canonical ?? null;
      if (match) {
        matchedExisting++;
      } else {
        const promoted = buildNewCanonicalCandidate(ctx, {
          retailerSlug: 'sezamo',
          retailerCodePrefix: 'SEZ',
          sourceProductId: pid,
          name,
          brand,
          packageSize: pkgText,
          imageUrl,
          barcode: null,
          hintCategoryPath: parentCatName,
          isPrivateLabel: isPrivate,
        });
        if (promoted) {
          canonical = promoted;
          promotedNew++;
        } else {
          skippedNonFood++;
        }
      }

      const parsedQty = parseQuantity(canonical?.package_size || pkgText || name);
      sourceCatalogRows.push({
        source: 'sezamo_api',
        retailer_id: retailer.id,
        source_product_id: String(pid),
        source_product_name: name,
        normalized_source_name: normalizeText(name),
        brand,
        category: parentCatName || null,
        barcode: null,
        package_size: canonical?.package_size || pkgText,
        quantity_value: parsedQty?.baseValue ?? null,
        quantity_unit: parsedQty?.baseUnit ?? null,
        image_url: imageUrl,
        product_url: productUrl,
        raw_data: {
          sezamo_product_id: pid,
          price: pricing.price,
          regular_price: pricing.regularPrice,
          loyalty_price: pricing.loyaltyPrice,
          promo_label: pricing.promoLabel,
          is_private_label: isPrivate,
          in_stock: isAvailable,
        },
        is_active: true,
        canonical_product_id: canonical?.id ?? null,
        match_status: canonical ? 'matched' : 'unmatched',
        match_confidence: match?.confidence ?? (canonical ? 1.0 : 0.0),
        match_method: match?.method ?? (canonical ? 'promoted_sezamo_catalog' : 'filtered_out'),
        match_reasons: match?.reasons ?? (canonical ? ['Produs alimentar promovat din Sezamo'] : ['Non-food sau fără gramaj']),
        observed_at: new Date().toISOString(),
        imported_at: new Date().toISOString(),
      });

      if (!canonical) continue;

      const newOffer = buildStandardOffer({
        productId: canonical.id,
        retailerId: retailer.id,
        retailerName: retailer.name,
        source: 'sezamo_api',
        price: pricing.price,
        regularPrice: pricing.regularPrice,
        promoPrice: pricing.promoPrice,
        loyaltyPrice: pricing.loyaltyPrice,
        promoLabel: pricing.promoLabel,
        promoRequiresCard: pricing.promoRequiresCard,
        packageSize: canonical.package_size || pkgText,
        quantityValue: canonical.quantity_value,
        quantityUnit: canonical.quantity_unit,
        productUrl,
        imageUrl,
        fulfillmentChannel: 'online',
        city: 'București',
        isAvailable,
        rawData: {
          sezamo_product_id: pid,
          sezamo_name: name,
          match_score: match?.confidence ?? 1.0,
        },
      });

      const prevOffer = matchedOffersMap.get(canonical.id);
      if (
        !prevOffer ||
        (newOffer.raw_data.match_score || 0) > (prevOffer.raw_data.match_score || 0) ||
        newOffer.price < prevOffer.price
      ) {
        matchedOffersMap.set(canonical.id, newOffer);
      }
    }

    if ((i / chunkSize) % 25 === 0) {
      console.log(`  [${Math.min(i + chunkSize, allIds.length)}/${allIds.length}] potrivite=${matchedExisting} | promovate=${promotedNew} | oferte=${matchedOffersMap.size}`);
    }
    await sleep(75);
  }

  const offers = [...matchedOffersMap.values()];
  const result = await flushContextAndOffers(ctx, {
    retailerId: retailer.id,
    retailerSlug: 'sezamo',
    retailerName: retailer.name,
    source: 'sezamo_api',
    sourceCatalogRows,
    offerRows: offers,
  });

  console.log(`\n🎉 Sezamo finalizat! matched=${matchedExisting}, promoted=${promotedNew}, skipped=${skippedNonFood}, offers=${result.offersCount}`);
}

runIngestion().catch((err) => {
  console.error('Fatal Sezamo error:', err);
  process.exit(1);
});
