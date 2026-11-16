#!/usr/bin/env node
import {
  buildNewCanonicalCandidate,
  buildStandardOffer,
  createIngestionContext,
  flushContextAndOffers,
  isRetailerPrivateBrand,
  matchExternalProduct,
} from './lib/retailer-ingest-helper.mjs';
import {
  normalizeBrandKey,
  normalizeText,
  parseQuantity,
} from './lib/catalog-normalization.mjs';
import { getSupabaseAdmin, resolveRetailerBySlug } from './lib/supabase-admin.mjs';

const MEGA_ORIGIN = 'https://www.mega-image.ro';

const MEGA_PRIVATE_BRANDS = new Set([
  'mega',
  'mega image',
  'mega apetit',
  'mega grill',
  'gusturi romanesti',
  'delhaize',
  '365',
  'care',
  'clean home',
  'natures promise',
  'natures promise bio',
  'natures promise eco',
  'natures promise free from',
  'natures promise bio baby',
  'natures promise kids',
  'natures promise good life',
  'natures promise healthy life',
  'perla',
  'gustona',
  'excellent',
  'fine crunchy',
  'worlds market',
  'gonuts',
  'caffe gondoliere',
  'kitbis',
  'emma',
  'dream co',
  'delicata',
  'fish market',
  'home kitchen',
  'babycute',
  'cute baby',
  'lovepet',
  'bertold',
  'ever g',
  'milly',
  'albert',
]);

const QUERY_GRAPHQL = `query GetCategoryProductSearch($lang: String, $pageSize: Int, $pageNumber: Int, $category: String, $searchQuery: String) {
  categoryProductSearch: categoryProductSearchV2(lang: $lang, pageSize: $pageSize, pageNumber: $pageNumber, category: $category, searchQuery: $searchQuery) {
    pagination { currentPage pageSize totalPages totalResults }
    products {
      code
      name
      manufacturerName
      manufacturerSubBrandName
      url
      price {
        value
        formattedValue
        discountedPriceFormatted
        discountedUnitPriceFormatted
        supplementaryPriceLabel1
        supplementaryPriceLabel2
        unitPriceFormatted
        unit
        unitCode
      }
      images { url format }
      potentialPromotions { title description simplePromotionMessage }
      categories { code name }
      stock { inStock }
    }
  }
}`;

function parseMegaPriceFormatted(formatted) {
  const s = String(formatted ?? '').replace(/\s+/g, '').replace(',', '.');
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function cleanManufacturer(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\((?:vrac|bucata|produs ambalat|kg)\)$/i.test(s)) return null;
  return s;
}

function toAbsoluteMegaUrl(relOrAbs) {
  const s = String(relOrAbs ?? '').trim();
  if (!s) return null;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return s.startsWith('/') ? `${MEGA_ORIGIN}${s}` : `${MEGA_ORIGIN}/${s}`;
}

function pickProductImage(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const preferred =
    images.find((im) => im.format === 'xlarge') ||
    images.find((im) => im.format === 'zoom') ||
    images.find((im) => im.format === 'respListGrid') ||
    images[0];
  return toAbsoluteMegaUrl(preferred?.url);
}

async function fetchMegaGraphQL({ category = '', searchQuery = '', pageNumber = 0, pageSize = 50 }) {
  const res = await fetch(`${MEGA_ORIGIN}/api/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      operationName: 'GetCategoryProductSearch',
      variables: { lang: 'ro', pageSize, pageNumber, category, searchQuery },
      query: QUERY_GRAPHQL,
    }),
  });

  if (res.status === 403 || res.status === 429) {
    throw new Error(`Acces blocat de Mega Image (HTTP ${res.status}). Oprire imediată.`);
  }
  if (!res.ok) {
    return null;
  }
  const json = await res.json().catch(() => null);
  return json?.data?.categoryProductSearch ?? null;
}

async function fetchAllPages({ category = '', searchQuery = '', label = '' }) {
  const pageSize = 50;
  const first = await fetchMegaGraphQL({ category, searchQuery, pageNumber: 0, pageSize });
  if (!first) return [];
  const totalPages = Math.max(1, Number(first.pagination?.totalPages || 1));
  const totalResults = Number(first.pagination?.totalResults || 0);
  const collected = [...(first.products || [])];
  if (label) {
    console.log(`  🚀 Începere ${label}: ${totalResults} produse (~${totalPages} pagini)`);
  }

  for (let p = 1; p < totalPages; p++) {
    await new Promise((r) => setTimeout(r, 65));
    let retries = 0;
    let next = null;
    while (retries < 3 && !next) {
      try {
        next = await fetchMegaGraphQL({ category, searchQuery, pageNumber: p, pageSize });
      } catch {
        retries++;
        await new Promise((r) => setTimeout(r, 350 * retries));
      }
    }
    if (next?.products) {
      collected.push(...next.products);
    }
    if (p % 25 === 0 && label) {
      console.log(`    ...progres ${label}: pagina ${p}/${totalPages} (${collected.length} produse colectate)`);
    }
  }
  if (label) {
    console.log(`  ✓ ${label}: ${collected.length} produse colectate.`);
  }
  return collected;
}

function parseMegaPricing(item, rawPrice) {
  const basePrice = Math.round(rawPrice * 100) / 100;
  const promoTitleRaw =
    item.potentialPromotions?.[0]?.simplePromotionMessage ||
    item.potentialPromotions?.[0]?.title ||
    null;
  const promoLabel = promoTitleRaw ? String(promoTitleRaw).replace(/\s+/g, ' ').trim() : null;
  const promoRequiresCard = Boolean(promoLabel && /connect/i.test(promoLabel));

  const discPrice = parseMegaPriceFormatted(item.price?.discountedPriceFormatted);
  const hasLowerDisc = discPrice !== null && discPrice < basePrice;

  if (promoRequiresCard && hasLowerDisc) {
    return {
      price: basePrice,
      regularPrice: basePrice,
      promoPrice: null,
      loyaltyPrice: discPrice,
      promoLabel,
      promoRequiresCard: true,
    };
  }

  if (!promoRequiresCard && hasLowerDisc) {
    const pct = Math.round(((basePrice - discPrice) / basePrice) * 100);
    return {
      price: discPrice,
      regularPrice: basePrice,
      promoPrice: discPrice,
      loyaltyPrice: null,
      promoLabel: promoLabel || (pct >= 2 ? `-${pct}%` : 'Promoție Mega Image'),
      promoRequiresCard: false,
    };
  }

  return {
    price: basePrice,
    regularPrice: basePrice,
    promoPrice: null,
    loyaltyPrice: null,
    promoLabel,
    promoRequiresCard,
  };
}

export async function runIngestion() {
  console.log('=== 1. CONECTARE & PREGĂTIRE CONTEXT INGESTIE MEGA IMAGE ===');
  const supabase = await getSupabaseAdmin();
  const [retailer, ctx] = await Promise.all([
    resolveRetailerBySlug(supabase, 'mega-image'),
    createIngestionContext(supabase),
  ]);
  const observedAt = new Date().toISOString();

  console.log('\n=== 2. COLECTARE MĂRCI PROPRII MEGA IMAGE (ownBrands=true) ===');
  const ownBrandItems = await fetchAllPages({
    category: '',
    searchQuery: ':relevance:ownBrands:true',
    label: 'Mărci proprii Mega Image',
  });
  const ownBrandCodes = new Set(ownBrandItems.map((i) => String(i.code)));

  console.log('\n=== 3. COLECTARE CATALOG EXTINS MEGA IMAGE (~8.600 PRODUSE) ===');
  const allProds = await fetchAllPages({
    category: '',
    searchQuery: '',
    label: 'Catalog complet Mega Image',
  });

  const allItemsByCode = new Map();
  for (const item of ownBrandItems) {
    if (item?.code) allItemsByCode.set(String(item.code), item);
  }
  for (const item of allProds) {
    if (item?.code && !allItemsByCode.has(String(item.code))) {
      allItemsByCode.set(String(item.code), item);
    }
  }

  console.log(`\n📋 Total produse unice preluate din API Mega Image: ${allItemsByCode.size}`);

  const matchedOffersMap = new Map();
  const sourceCatalogRows = [];
  let matchedExisting = 0;
  let promotedNew = 0;
  let skippedNonFood = 0;
  let discardedCount = 0;

  for (const item of allItemsByCode.values()) {
    const code = String(item.code ?? '').trim();
    const rawPrice = Number(item.price?.value);
    if (!code || !Number.isFinite(rawPrice) || rawPrice <= 0) {
      discardedCount++;
      continue;
    }

    const pricing = parseMegaPricing(item, rawPrice);
    const brand = cleanManufacturer(item.manufacturerName);
    const subBrand = cleanManufacturer(item.manufacturerSubBrandName);
    const brandNormKey = normalizeBrandKey(brand);
    const fullBrandStr = [brand, subBrand].filter(Boolean).join(' ').trim();
    const isOwnBrand =
      ownBrandCodes.has(code) ||
      MEGA_PRIVATE_BRANDS.has(brandNormKey) ||
      isRetailerPrivateBrand(brand, item.name);

    const imageUrl = pickProductImage(item.images);
    const productUrl = toAbsoluteMegaUrl(item.url);
    const rawName = String(item.name ?? '').replace(/\s+/g, ' ').trim();
    const displayTitle =
      brand && !normalizeText(rawName).startsWith(normalizeText(brand))
        ? `${brand} ${rawName}`
        : rawName;

    const parsedQty =
      parseQuantity(rawName) ??
      parseQuantity(item.price?.supplementaryPriceLabel2);
    const pkgSize = parsedQty ? `${parsedQty.baseValue} ${parsedQty.baseUnit}` : null;
    const isAvailable = item.stock?.inStock !== false;
    const categoryPath = Array.isArray(item.categories)
      ? item.categories.map((c) => c.name).filter(Boolean).join(' > ')
      : null;

    // 1. Căutare match pe catalogul canonic existent
    const match = matchExternalProduct(ctx, {
      source: 'mega_image_api',
      retailerSlug: 'mega-image',
      name: displayTitle,
      brand: fullBrandStr || brand || null,
      packageSize: pkgSize,
      barcode: null,
      imageUrl,
    });

    let canonical = match?.canonical ?? null;
    if (match) {
      matchedExisting++;
    } else {
      // 2. Extindere: dacă produsul alimentar nu există încă în catalog, îl promovăm direct ca produs canonic nou!
      const promoted = buildNewCanonicalCandidate(ctx, {
        retailerSlug: 'mega-image',
        retailerCodePrefix: 'MGA',
        sourceProductId: code,
        name: displayTitle,
        brand: fullBrandStr || brand || null,
        packageSize: pkgSize,
        imageUrl,
        barcode: null,
        hintCategoryPath: categoryPath,
        isPrivateLabel: isOwnBrand,
      });

      if (promoted) {
        canonical = promoted;
        promotedNew++;
      } else {
        skippedNonFood++;
      }
    }

    sourceCatalogRows.push({
      source: 'mega_image_api',
      retailer_id: retailer.id,
      source_product_id: code,
      source_product_name: displayTitle,
      normalized_source_name: normalizeText(displayTitle),
      brand: brand || null,
      barcode: null,
      package_size: canonical?.package_size || pkgSize,
      quantity_value: canonical?.quantity_value ?? parsedQty?.baseValue ?? null,
      quantity_unit: canonical?.quantity_unit ?? parsedQty?.baseUnit ?? null,
      image_url: imageUrl,
      product_url: productUrl,
      external_category_path: categoryPath,
      raw_data: {
        mega_code: code,
        raw_name: rawName,
        brand,
        sub_brand: subBrand,
        price: pricing.price,
        regular_price: pricing.regularPrice,
        loyalty_price: pricing.loyaltyPrice,
        promo_title: pricing.promoLabel,
        is_available: isAvailable,
        is_private_label: isOwnBrand,
      },
      is_active: true,
      canonical_product_id: canonical ? canonical.id : null,
      match_status: (match || canonical) ? 'matched' : 'unmatched',
      match_confidence: match ? match.confidence : canonical ? 1.0 : 0.0,
      match_method: match ? match.method : canonical ? 'promoted_canonical' : 'none',
      match_reasons: match
        ? match.reasons
        : canonical
        ? ['Promovat ca produs canonic nou din Mega Image']
        : ['Neeligibil alimentar'],
      observed_at: observedAt,
      imported_at: observedAt,
    });

    if (canonical) {
      const offerRow = buildStandardOffer({
        productId: canonical.id,
        retailerId: retailer.id,
        retailerName: retailer.name,
        source: 'mega_image_api',
        price: pricing.price,
        regularPrice: pricing.regularPrice,
        promoPrice: pricing.promoPrice,
        loyaltyPrice: pricing.loyaltyPrice,
        promoLabel: pricing.promoLabel,
        promoRequiresCard: pricing.promoRequiresCard,
        packageSize: canonical.package_size || pkgSize,
        quantityValue: canonical.quantity_value ?? parsedQty?.baseValue ?? null,
        quantityUnit: canonical.quantity_unit ?? parsedQty?.baseUnit ?? null,
        productUrl,
        imageUrl,
        fulfillmentChannel: 'store',
        city: 'București',
        isAvailable,
        rawData: {
          mega_code: code,
          mega_name: displayTitle,
          match_score: match ? match.confidence : 1.0,
          promo_title: pricing.promoLabel,
          is_promoted: !match,
        },
      });

      const existing = matchedOffersMap.get(canonical.id);
      if (
        !existing ||
        (match && match.confidence > (existing.raw_data?.match_score || 0)) ||
        pricing.price < existing.price
      ) {
        matchedOffersMap.set(canonical.id, offerRow);
      }
    }
  }

  const finalOffers = Array.from(matchedOffersMap.values());
  console.log('\n=== 4. REZULTATE MATCHING & EXTINDERE CATALOG MEGA IMAGE ===');
  console.log(`✅ Oferte potrivite pe produse existente: ${matchedExisting}`);
  console.log(`✨ Produse noi promovate în catalogul Beavy: ${promotedNew}`);
  console.log(`📦 Total oferte active Mega Image generate: ${finalOffers.length}`);
  console.log(`⏭️ Produse non-food/neeligibile sărite: ${skippedNonFood}`);
  console.log(`❌ Produse cu date incomplete ignorate: ${discardedCount}`);

  const flushResult = await flushContextAndOffers(ctx, {
    retailerId: retailer.id,
    retailerSlug: 'mega-image',
    retailerName: retailer.name,
    source: 'mega_image_api',
    sourceCatalogRows,
    offerRows: finalOffers,
  });

  return {
    matchedExisting,
    promotedNew,
    skippedNonFood,
    offersSaved: flushResult.offersCount,
  };
}

if (process.argv[1]?.endsWith('mega-image-api-collector.mjs')) {
  runIngestion()
    .then((stats) => {
      console.log('\n🎉 Ingestie extinsă Mega Image finalizată cu succes!', stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}
