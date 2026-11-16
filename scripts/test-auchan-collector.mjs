#!/usr/bin/env node
import { getSupabaseAdmin } from './lib/supabase-admin.mjs';
import { scoreCanonicalCandidate, normalizeText } from './lib/catalog-normalization.mjs';

const supabase = await getSupabaseAdmin();

const AUCHAN_RETAILER_ID = '2b0b01a4-318a-4317-b570-dbda52404f0d';

const AUCHAN_PRIVATE_BRANDS = new Set([
  'auchan',
  'auchan bio',
  'auchan baby',
  'auchan gourmet',
  'auchan essentiel',
  'auchan terroir',
  'pouce',
  'cosmia',
  'cosmia baby',
  'actuel',
  'qilive',
  'inextenso',
  'cup s',
  'one two fun',
  'airport',
]);

function isAuchanPrivateLabel(item) {
  const brandNorm = (item.brand || '').toLowerCase().trim();
  if (AUCHAN_PRIVATE_BRANDS.has(brandNorm)) return true;
  if (brandNorm.includes('auchan')) return true;
  if (item.productClusters) {
    const clusterValues = Object.values(item.productClusters).join(' ').toLowerCase();
    if (clusterValues.includes('marcile auchan') || clusterValues.includes('marca auchan')) {
      return true;
    }
  }
  return false;
}

async function fetchAuchanSearch(query, from = 0, to = 20) {
  const url = `https://www.auchan.ro/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}&_from=${from}&_to=${to}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) return [];
  return res.json();
}

async function run() {
  console.log('--- 1. Încărcare produse canonice Beavy ---');
  let allCanonicals = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('beavy_products')
      .select('id, canonical_name, normalized_name, brand, package_size, quantity_value, quantity_unit, category')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) {
      console.error('Eroare la citire beavy_products:', error);
      break;
    }
    allCanonicals.push(...(data || []));
    if (!data || data.length < pageSize) break;
    page++;
  }
  console.log(`Total produse canonice încărcate: ${allCanonicals.length}`);

  // Indexare după brand normalizat
  const brandMap = new Map();
  for (const p of allCanonicals) {
    const b = (p.brand || '').toLowerCase().trim();
    if (!brandMap.has(b)) brandMap.set(b, []);
    brandMap.get(b).push(p);
  }

  const testQueries = ['Barilla', 'Olympus', 'Hochland', 'ZuZu', 'Napolact', 'Borsec', 'Pouce', 'Cosmia'];
  console.log(`\n--- 2. Testare căutare & matching pentru query-urile: ${testQueries.join(', ')} ---`);

  let matchCount = 0;
  let privateLabelCount = 0;
  let discardedCount = 0;

  for (const q of testQueries) {
    console.log(`\nCăutare Auchan API pentru: "${q}"...`);
    const results = await fetchAuchanSearch(q, 0, 15);
    console.log(`Găsite în Auchan: ${results.length} produse.`);

    for (const item of results) {
      const isPrivate = isAuchanPrivateLabel(item);
      const firstItem = item.items?.[0];
      const commOffer = firstItem?.sellers?.[0]?.commertialOffer;
      const price = commOffer?.Price ?? null;
      const listPrice = commOffer?.ListPrice ?? null;
      const isAvailable = (commOffer?.AvailableQuantity ?? 0) > 0 && price > 0;
      const ean = firstItem?.ean || item.productReference || null;
      const imageUrl = firstItem?.images?.[0]?.imageUrl || null;
      const productUrl = item.linkText ? `https://www.auchan.ro/${item.linkText}/p` : null;

      if (!price) {
        discardedCount++;
        continue;
      }

      // Încercare potrivire canonică
      const itemBrandNorm = (item.brand || '').toLowerCase().trim();
      const candidates = brandMap.get(itemBrandNorm) || [];

      let bestMatch = null;
      let highestScore = 0;

      for (const cand of candidates) {
        const scoreResult = scoreCanonicalCandidate(cand, {
          title: item.productName,
          brand: item.brand,
          package_size: cand.package_size,
          ean: ean,
        });

        if (scoreResult.confidence > highestScore && scoreResult.confidence >= 0.70) {
          highestScore = scoreResult.confidence;
          bestMatch = { canonical: cand, ...scoreResult };
        }
      }

      if (bestMatch) {
        matchCount++;
        console.log(`  ✅ POTRIVIRE (${Math.round(bestMatch.confidence * 100)}%): Auchan "${item.productName}" [${price} RON] -> Canonic "${bestMatch.canonical.canonical_name}"`);
      } else if (isPrivate) {
        privateLabelCount++;
        console.log(`  🏷️ BRAND PROPRIU AUCHAN (păstrat pentru funcție viitoare): "${item.productName}" [Brand: ${item.brand}, ${price} RON]`);
      } else {
        discardedCount++;
        console.log(`  ❌ IGNORAT (Fără match și nu este brand propriu): "${item.productName}" [Brand: ${item.brand}]`);
      }
    }
    // Mică pauză politicoasă între request-uri
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log('\n--- REZUMAT TEST ---');
  console.log(`✅ Potrivite cu catalogul canonic: ${matchCount}`);
  console.log(`🏷️ Brand propriu Auchan (păstrate): ${privateLabelCount}`);
  console.log(`❌ Ignorate (fără potrivire): ${discardedCount}`);
}

run().catch(console.error);
