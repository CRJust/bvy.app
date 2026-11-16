#!/usr/bin/env node
import { getSupabaseAdmin } from './lib/supabase-admin.mjs';
import {
  parseQuantity,
  scoreCanonicalCandidate,
} from './lib/catalog-normalization.mjs';

const supabase = await getSupabaseAdmin();

const NON_FRESHFUL_RETAILERS = [
  { id: '2b0b01a4-318a-4317-b570-dbda52404f0d', name: 'Auchan', threshold: 0.72 },
  { id: 'fa7e0319-d473-4cdc-8abc-982cf92e104d', name: 'Mega Image', threshold: 0.72 },
  { id: 'a7af2e48-c152-49a6-b33d-f37ab0caf68a', name: 'Carrefour', threshold: 0.72 },
];

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
    if (error) throw new Error(`Fetch error ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    page++;
  }
  return rows;
}

async function runRevalidation() {
  console.log('=== REVALIDARE OFERTE EXISTENTE CU REGULILE FINALE ===\n');

  const products = await fetchAll(
    'beavy_products',
    'id, canonical_name, brand, package_size, quantity_value, quantity_unit, category, attributes',
    (q) => q.eq('is_active', true)
  );
  const prodById = new Map(products.map((p) => [p.id, p]));

  for (const ret of NON_FRESHFUL_RETAILERS) {
    const offers = await fetchAll(
      'beavy_product_offers',
      'id, product_id, retailer_id, retailer_name, price, package_size, image_url, raw_data',
      (q) => q.eq('retailer_id', ret.id).eq('is_active', true)
    );

    const scRows = await fetchAll(
      'beavy_source_catalog',
      'id, canonical_product_id, source_product_id, source_product_name, brand, barcode, raw_data',
      (q) => q.eq('retailer_id', ret.id).not('canonical_product_id', 'is', null)
    );
    const scByProdId = new Map();
    for (const sc of scRows) {
      if (!scByProdId.has(sc.canonical_product_id)) scByProdId.set(sc.canonical_product_id, []);
      scByProdId.get(sc.canonical_product_id).push(sc);
    }

    const toDeleteOfferIds = [];
    const toDeleteScIds = [];
    const toUnmatchPrivateScIds = [];

    for (const o of offers) {
      const cand = prodById.get(o.product_id);
      if (!cand) {
        toDeleteOfferIds.push(o.id);
        continue;
      }

      const scList = scByProdId.get(o.product_id) || [];
      const firstSc = scList[0];
      const extName = String(
        o.raw_data?.auchan_name ||
          o.raw_data?.mega_name ||
          o.raw_data?.carrefour_name ||
          firstSc?.source_product_name ||
          ''
      );
      if (!extName) continue;

      const extSubBrand = firstSc?.raw_data?.sub_brand || '';
      const extBrandBase = firstSc?.raw_data?.brand || firstSc?.brand || '';
      let brandsStr = '';
      if (ret.name === 'Mega Image') {
        brandsStr = [extBrandBase, extSubBrand].filter(Boolean).join(' ').trim();
      } else if (ret.name === 'Auchan') {
        brandsStr = [
          extBrandBase,
          /\bdolce\s+gusto\b/i.test(extName) ? 'Dolce Gusto' : null,
          /\bbrasero\b/i.test(extName) ? 'Brasero' : null,
        ]
          .filter(Boolean)
          .join(' ');
      }

      const parsedExtQty = parseQuantity(extName);
      const qtyStr = parsedExtQty ? `${parsedExtQty.baseValue} ${parsedExtQty.baseUnit}` : '';

      const res = scoreCanonicalCandidate(cand, {
        code: firstSc?.barcode || '',
        product_name: extSubBrand ? `${extName} ${extSubBrand}` : extName,
        brands: brandsStr,
        image_url: o.image_url,
        quantity: qtyStr,
        requireImage: false,
      });

      if (res.confidence < ret.threshold || !res.quantityExact) {
        console.log(
          `  ❌ [${ret.name}] eliminat (${res.confidence.toFixed(2)}, ${res.reasons[res.reasons.length - 1] || ''}): "${cand.canonical_name}" <--> "${extName}"`
        );
        toDeleteOfferIds.push(o.id);
        for (const sc of scList) {
          if (sc.raw_data?.is_private_label) toUnmatchPrivateScIds.push(sc.id);
          else toDeleteScIds.push(sc.id);
        }
      }
    }

    if (toDeleteOfferIds.length > 0) {
      for (let i = 0; i < toDeleteOfferIds.length; i += 100) {
        const chunk = toDeleteOfferIds.slice(i, i + 100);
        const { error } = await supabase.from('beavy_product_offers').delete().in('id', chunk);
        if (error) console.error(`Error deleting offers ${ret.name}:`, error.message);
      }
    }
    if (toDeleteScIds.length > 0) {
      for (let i = 0; i < toDeleteScIds.length; i += 100) {
        const chunk = toDeleteScIds.slice(i, i + 100);
        await supabase.from('beavy_source_catalog').delete().in('id', chunk);
      }
    }
    if (toUnmatchPrivateScIds.length > 0) {
      for (let i = 0; i < toUnmatchPrivateScIds.length; i += 100) {
        const chunk = toUnmatchPrivateScIds.slice(i, i + 100);
        await supabase
          .from('beavy_source_catalog')
          .update({ canonical_product_id: null, match_status: 'unmatched' })
          .in('id', chunk);
      }
    }

    console.log(
      `✓ ${ret.name}: total verificate=${offers.length}, eliminate=${toDeleteOfferIds.length}, rămase=${offers.length - toDeleteOfferIds.length}\n`
    );
  }
}

runRevalidation().catch((err) => {
  console.error(err);
  process.exit(1);
});
