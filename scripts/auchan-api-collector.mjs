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

const AUCHAN_RETAILER_ID = '2b0b01a4-318a-4317-b570-dbda52404f0d';

const AUCHAN_PRIVATE_BRANDS = new Set([
  'auchan',
  'auchan bio',
  'auchan baby',
  'auchan gourmet',
  'auchan essentiel',
  'auchan terroir',
  'auchan mmm',
  'auchan collection',
  'pouce',
  'cosmia',
  'cosmia baby',
  'actuel',
  'qilive',
  'inextenso',
  'cup s',
  'one two fun',
  'airport',
  'selecline',
]);

export function isAuchanPrivateLabel(item) {
  const brandNorm = (item.brand || '').toLowerCase().trim();
  if (AUCHAN_PRIVATE_BRANDS.has(brandNorm)) return true;
  if (brandNorm.includes('auchan')) return true;
  if (item.productClusters) {
    const clusterValues = Object.values(item.productClusters).join(' ').toLowerCase();
    if (
      clusterValues.includes('marcile auchan') ||
      clusterValues.includes('marca auchan') ||
      clusterValues.includes('toate brandurile auchan')
    ) {
      return true;
    }
  }
  return false;
}

function parseSgrFee(item) {
  const rawArr = item?.GARANTIE_SGR;
  if (!Array.isArray(rawArr) || rawArr.length === 0) return null;
  const num = Number(String(rawArr[0]).replace(',', '.').trim());
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
}

function parseAuchanPricing(item, commOffer) {
  const rawPrice = Number(commOffer?.Price);
  const rawListPrice = commOffer?.ListPrice != null ? Number(commOffer.ListPrice) : null;
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;

  const listPrice =
    rawListPrice !== null && Number.isFinite(rawListPrice) && rawListPrice >= rawPrice
      ? Math.round(rawListPrice * 100) / 100
      : Math.round(rawPrice * 100) / 100;
  const sellingPrice = Math.round(rawPrice * 100) / 100;

  const highlights = Array.isArray(commOffer?.DiscountHighLight)
    ? commOffer.DiscountHighLight.map((h) => Object.values(h || {}).join(' ')).filter(Boolean)
    : [];
  const highlightText = highlights.join(' | ');
  const isLoyaltyCard = /BLUELOYALTY|MYCLUB|CARD/i.test(highlightText);

  let loyaltyLabel = null;
  if (isLoyaltyCard && highlightText) {
    const afterColon = highlightText.includes(':')
      ? highlightText.split(':').slice(1).join(':').trim()
      : highlightText;
    loyaltyLabel = afterColon || 'Promoție Card MyCLUB';
  }

  // Dacă prețul mic din VTEX este condiționat de Card MyCLUB (BLUELOYALTY),
  // păstrăm `price` la prețul standard fără card (`listPrice`) și punem prețul cu card în `loyalty_price`.
  if (isLoyaltyCard && sellingPrice < listPrice) {
    return {
      price: listPrice,
      regularPrice: listPrice,
      promoPrice: null,
      loyaltyPrice: sellingPrice,
      promoRequiresCard: true,
      promoLabel: loyaltyLabel,
    };
  }

  const hasDirectDiscount = sellingPrice < listPrice;
  const pct = hasDirectDiscount ? Math.round(((listPrice - sellingPrice) / listPrice) * 100) : 0;

  return {
    price: sellingPrice,
    regularPrice: listPrice,
    promoPrice: hasDirectDiscount ? sellingPrice : null,
    loyaltyPrice: null,
    promoRequiresCard: false,
    promoLabel: hasDirectDiscount && pct >= 2 ? `-${pct}%` : hasDirectDiscount ? 'Promoție Auchan' : null,
  };
}

async function fetchAuchanSearch(query, from = 0, to = 49) {
  const url = `https://www.auchan.ro/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}&_from=${from}&_to=${to}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    if (res.status === 403 || res.status === 429) {
      throw new Error(`Acces blocat de Auchan (HTTP ${res.status}).`);
    }
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error(`Eroare la apel Auchan API pentru "${query}":`, err.message);
    return [];
  }
}

async function fetchAuchanCategory(categoryId, from = 0, to = 49) {
  const url = `https://www.auchan.ro/api/catalog_system/pub/products/search?fq=C:${categoryId}&_from=${from}&_to=${to}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    if (res.status === 403 || res.status === 429) {
      throw new Error(`Acces blocat de Auchan (HTTP ${res.status}).`);
    }
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error(`Eroare la apel Auchan categorie "${categoryId}":`, err.message);
    return [];
  }
}

async function fetchAuchanGrocerySubcategories() {
  const targetParentIds = new Set([
    1000000, // Fructe si Legume
    2000000, // Lactate si oua
    3000000, // Bacanie
    4000000, // Brutarie, Cofetarie, Gastro
    5000000, // Bauturi si Tutun
    13000000, // Congelate
    22000000, // Ready meals si mezeluri
    24000000, // Carne si peste
    28000000, // Dietetic si international
  ]);
  const excludedIds = new Set([5070000]); // Tutun

  try {
    const res = await fetch('https://www.auchan.ro/api/catalog_system/pub/category/tree/2', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return [];
    const tree = await res.json();
    const list = [];
    for (const parent of tree || []) {
      if (!targetParentIds.has(Number(parent.id))) continue;
      if (Array.isArray(parent.children) && parent.children.length > 0) {
        for (const child of parent.children) {
          if (!excludedIds.has(Number(child.id))) {
            list.push({
              id: `/${parent.id}/${child.id}/`,
              name: `${parent.name} > ${child.name}`,
            });
          }
        }
      } else {
        list.push({ id: `/${parent.id}/`, name: parent.name });
      }
    }
    return list;
  } catch {
    return [];
  }
}

async function loadAllCanonicals() {
  console.log('--- Încărcare catalog canonic din Supabase ---');
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

    if (error) {
      throw new Error(`Eroare la citirea beavy_products: ${error.message}`);
    }
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    page++;
  }
  console.log(`Încărcate ${all.length} produse canonice active.`);
  return all;
}

export async function runIngestion(options = {}) {
  const maxQueries = options.maxQueries || 300;
  const canonicals = await loadAllCanonicals();
  const brandIndex = buildBrandPhraseIndex(canonicals);

  const displayBrandCounts = new Map();
  for (const p of canonicals) {
    const b = (p.brand || '').trim();
    if (b) displayBrandCounts.set(b, (displayBrandCounts.get(b) || 0) + 1);
  }

  const targetBrands = [...displayBrandCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxQueries)
    .map(([b]) => b);

  const privateBrandsToFetch = ['Auchan', 'Pouce', 'Cosmia', 'Actuel'];
  const subCategories = await fetchAuchanGrocerySubcategories();

  console.log(
    `\n--- Colectare oferte Auchan: ${subCategories.length} subcategorii alimentare + fallback branduri (${targetBrands.length}) + ${privateBrandsToFetch.length} mărci proprii ---`
  );

  const seenAuchanProductIds = new Set();
  const matchedOffersMap = new Map();
  const sourceCatalogRows = [];

  let totalPrivateLabel = 0;
  let totalDiscarded = 0;

  // 1. Parcurgem toate subcategoriile alimentare Auchan (paginat câte 50 până la 1500/cat)
  for (let i = 0; i < subCategories.length; i++) {
    const cat = subCategories[i];
    let catCount = 0;
    for (let offset = 0; offset < 1500; offset += 50) {
      const results = await fetchAuchanCategory(cat.id, offset, offset + 49);
      catCount += results.length;
      processAuchanBatch(results);
      if (results.length < 50) break;
      await new Promise((r) => setTimeout(r, 95));
    }
    if ((i + 1) % 10 === 0 || i + 1 === subCategories.length) {
      console.log(
        `  [${i + 1}/${subCategories.length}] ${cat.name} (${catCount} prod) -> oferte potrivite: ${matchedOffersMap.size}`
      );
    }
    await new Promise((r) => setTimeout(r, 85));
  }

  // 2. Fallback pe brandurile din catalog care nu au fost acoperite complet de categoriile alimentare (ex: hrana bebe, diete speciale)
  const matchedBrandSet = new Set();
  for (const offer of matchedOffersMap.values()) {
    const p = canonicals.find((c) => c.id === offer.product_id);
    if (p?.brand) matchedBrandSet.add(normalizeBrandKey(p.brand));
  }

  const uncoveredBrands = targetBrands.filter(
    (b) => !matchedBrandSet.has(normalizeBrandKey(b))
  );
  console.log(`\n🔍 Căutare suplimentară pentru ${uncoveredBrands.length} branduri încă neacoperite...`);
  for (const brand of uncoveredBrands) {
    const results = await fetchAuchanSearch(brand, 0, 49);
    processAuchanBatch(results);
    await new Promise((r) => setTimeout(r, 100));
  }

  for (const pb of privateBrandsToFetch) {
    console.log(`🏷️ Mărcile proprii Auchan: "${pb}"...`);
    for (const offset of [0, 50, 100, 150, 200]) {
      const results = await fetchAuchanSearch(pb, offset, offset + 49);
      processAuchanBatch(results);
      if (results.length < 50) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const finalOffersToUpsert = Array.from(matchedOffersMap.values());

  if (finalOffersToUpsert.length < 20) {
    throw new Error(
      `Refusing to replace Auchan offers: scrape produced ${finalOffersToUpsert.length} offers (minimum 20).`
    );
  }

  console.log('\n--- REZULTATE MATCHING STRICT & FILTRARE AUCHAN ---');
  console.log(`✅ Oferte potrivite canonic verificate: ${finalOffersToUpsert.length}`);
  console.log(`🏷️ Produse brand propriu Auchan reținute (pentru funcție viitoare): ${totalPrivateLabel}`);
  console.log(`❌ Produse Auchan ignorate (fără potrivire sigură și fără brand propriu): ${totalDiscarded}`);
  console.log(`Total rânduri de inserat în beavy_source_catalog: ${sourceCatalogRows.length}`);

  if (sourceCatalogRows.length > 0) {
    console.log('\n--- Salvare în public.beavy_source_catalog ---');
    await supabase
      .from('beavy_source_catalog')
      .delete()
      .eq('retailer_id', AUCHAN_RETAILER_ID);

    const chunkSize = 200;
    for (let i = 0; i < sourceCatalogRows.length; i += chunkSize) {
      const chunk = sourceCatalogRows.slice(i, i + chunkSize);
      const { error } = await supabase.from('beavy_source_catalog').upsert(chunk, {
        onConflict: 'source,source_product_id',
      });
      if (error) {
        console.error(`Eroare la salvare chunk source_catalog ${i}:`, error.message);
      }
    }
    console.log(`Salvate cu succes ${sourceCatalogRows.length} înregistrări în beavy_source_catalog.`);
  }

  console.log('\n--- Salvare oferte active verificate în public.beavy_product_offers ---');
  await supabase
    .from('beavy_product_offers')
    .delete()
    .eq('retailer_id', AUCHAN_RETAILER_ID);

  if (finalOffersToUpsert.length > 0) {
    const insertChunkSize = 100;
    for (let i = 0; i < finalOffersToUpsert.length; i += insertChunkSize) {
      const chunk = finalOffersToUpsert.slice(i, i + insertChunkSize);
      const { error } = await supabase.from('beavy_product_offers').insert(chunk);
      if (error) {
        console.error(`Eroare la inserare chunk product_offers ${i}:`, error.message);
      }
    }
    console.log(`Inserate cu succes ${finalOffersToUpsert.length} oferte Auchan active în beavy_product_offers.`);
  }

  return {
    matchedCount: finalOffersToUpsert.length,
    privateLabelCount: totalPrivateLabel,
    discardedCount: totalDiscarded,
    totalIngestedSourceRows: sourceCatalogRows.length,
  };

  function processAuchanBatch(items) {
    for (const item of items) {
      if (!item || !item.productId || seenAuchanProductIds.has(item.productId)) continue;
      seenAuchanProductIds.add(item.productId);

      const firstItem = item.items?.[0];
      const commOffer = firstItem?.sellers?.[0]?.commertialOffer;
      const pricing = parseAuchanPricing(item, commOffer);
      const isAvailable = (commOffer?.AvailableQuantity ?? 0) > 0 && Boolean(pricing);
      const ean = firstItem?.ean || item.productReference || null;
      const imageUrl = firstItem?.images?.[0]?.imageUrl || null;
      const productUrl = item.linkText ? `https://www.auchan.ro/${item.linkText}/p` : null;
      const sgrFee = parseSgrFee(item);

      if (!pricing) {
        totalDiscarded++;
        continue;
      }

      const isPrivate = isAuchanPrivateLabel(item);
      const auchanQty = parseQuantity(item.productName);
      const auchanQtyStr = auchanQty ? `${auchanQty.baseValue} ${auchanQty.baseUnit}` : '';

      const lookupTitle = `${item.brand || ''} ${item.productName}`.trim();
      const candidates = findBrandCandidatesForTitle(lookupTitle, brandIndex);
      const brandsForScore = [
        item.brand,
        /\bdolce\s+gusto\b/i.test(item.productName) ? 'Dolce Gusto' : null,
        /\bbrasero\b/i.test(item.productName) ? 'Brasero' : null,
      ]
        .filter(Boolean)
        .join(' ');

      let bestMatch = null;
      let highestScore = 0;

      for (const cand of candidates) {
        const scoreResult = scoreCanonicalCandidate(cand, {
          code: ean,
          product_name: item.productName,
          brands: brandsForScore || item.brand || '',
          image_url: imageUrl,
          quantity: auchanQtyStr,
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
          source: 'auchan_api',
          retailer_id: AUCHAN_RETAILER_ID,
          source_product_id: String(item.productId),
          source_product_name: item.productName,
          normalized_source_name: normalizeText(item.productName),
          brand: item.brand || null,
          barcode: ean,
          package_size: cand.package_size,
          image_url: imageUrl,
          product_url: productUrl,
          raw_data: {
            auchan_product_id: item.productId,
            price: pricing.price,
            regular_price: pricing.regularPrice,
            loyalty_price: pricing.loyaltyPrice,
            promo_label: pricing.promoLabel,
            promo_requires_card: pricing.promoRequiresCard,
            sgr_fee: sgrFee,
            is_available: isAvailable,
            product_clusters: item.productClusters,
          },
          is_active: true,
          canonical_product_id: cand.id,
          match_status: 'matched',
          match_confidence: bestMatch.confidence,
          match_method: 'brand_and_token_heuristic',
          match_reasons: bestMatch.reasons,
          observed_at: new Date().toISOString(),
          imported_at: new Date().toISOString(),
        });

        const parsedQty = parseQuantity(cand.package_size || cand.canonical_name);
        const { normalizedUnitPrice, normalizedUnitLabel } = computeNormalizedUnitPrice(
          pricing.price,
          parsedQty
        );

        const newOffer = {
          product_id: cand.id,
          retailer_id: AUCHAN_RETAILER_ID,
          retailer_name: 'Auchan',
          source: 'auchan_api',
          price: pricing.price,
          regular_price: pricing.regularPrice,
          promo_price: pricing.promoPrice,
          loyalty_price: pricing.loyaltyPrice,
          promo_label: pricing.promoLabel,
          promo_requires_card: pricing.promoRequiresCard,
          currency: 'RON',
          unit_price: normalizedUnitPrice,
          normalized_unit_price: normalizedUnitPrice,
          normalized_unit_label: normalizedUnitLabel,
          quantity_value: cand.quantity_value,
          quantity_unit: cand.quantity_unit,
          package_size: cand.package_size,
          product_url: productUrl,
          image_url: imageUrl,
          fulfillment_channel: 'store',
          city: 'București',
          stock_status: isAvailable ? 'in_stock' : 'out_of_stock',
          availability: isAvailable ? 'in_stock' : 'out_of_stock',
          is_active: true,
          observed_at: new Date().toISOString(),
          raw_data: {
            auchan_product_id: item.productId,
            auchan_name: item.productName,
            link_text: item.linkText,
            match_score: bestMatch.confidence,
            sgr_fee: sgrFee,
          },
        };

        const existing = matchedOffersMap.get(cand.id);
        if (
          !existing ||
          bestMatch.confidence > (existing.raw_data.match_score || 0) ||
          (bestMatch.confidence === (existing.raw_data.match_score || 0) &&
            newOffer.price < existing.price)
        ) {
          matchedOffersMap.set(cand.id, newOffer);
        }
      } else if (isPrivate) {
        totalPrivateLabel++;
        sourceCatalogRows.push({
          source: 'auchan_api',
          retailer_id: AUCHAN_RETAILER_ID,
          source_product_id: String(item.productId),
          source_product_name: item.productName,
          normalized_source_name: normalizeText(item.productName),
          brand: item.brand || 'Auchan',
          barcode: ean,
          package_size: auchanQty ? `${auchanQty.baseValue} ${auchanQty.baseUnit}` : null,
          quantity_value: auchanQty ? auchanQty.baseValue : null,
          quantity_unit: auchanQty ? auchanQty.baseUnit : null,
          image_url: imageUrl,
          product_url: productUrl,
          raw_data: {
            is_private_label: true,
            auchan_product_id: item.productId,
            brand: item.brand,
            price: pricing.price,
            regular_price: pricing.regularPrice,
            loyalty_price: pricing.loyaltyPrice,
            sgr_fee: sgrFee,
            is_available: isAvailable,
            categories: item.categories,
            product_clusters: item.productClusters,
          },
          is_active: true,
          canonical_product_id: null,
          match_status: 'unmatched',
          match_confidence: 1.0,
          match_method: 'auchan_private_label_detector',
          match_reasons: ['Brand propriu Auchan / Pouce / Cosmia / Actuel'],
          observed_at: new Date().toISOString(),
          imported_at: new Date().toISOString(),
        });
      } else {
        totalDiscarded++;
      }
    }
  }
}

if (process.argv[1]?.endsWith('auchan-api-collector.mjs')) {
  runIngestion()
    .then((stats) => {
      console.log('\n🎉 Ingestie Auchan finalizată cu succes!', stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}
