import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from './lib/supabase-admin.mjs';
import {
  createIngestionContext,
  inferGroceryCategory,
  matchExternalProduct,
  buildNewCanonicalCandidate,
  buildStandardOffer,
  isRetailerPrivateBrand,
} from './lib/retailer-ingest-helper.mjs';
import { normalizeBrandKey, normalizeText } from './lib/catalog-normalization.mjs';

const PROCESSED_NON_FRESH_PRODUCE_RE =
  /\b(esenta|extract|sirop|suc|sucuri|piure|gem|dulceata|marmelada|compot|nectar|bautura|smoothie|cidru|lichior|iaurt|lapte|budinca|inghetata|tort|prajitura|tarta|biscuiti|napolitane|croissant|ciocolata|bomboane|dropsuri|batoane|baton|cereale|musli|granola|chipsuri|snack|seminte|fructe uscate|deshidratat\w*|conserva|conserve|sos|pasta|ketchup|pasta de tomate|bulion|otet|ulei|muraturi|murat\w*|congelat\w*|marinata|pudra|ceai|aroma|tiramisu|panna cotta|desert|crema|cheesecake|mousse|sorbet|turta dulce|radler|bere|apa|pernite)\b/i;

function isFreshProduce(name, category = '') {
  if (PROCESSED_NON_FRESH_PRODUCE_RE.test(name)) return false;
  const catNorm = (category || '').toLowerCase();
  const nameNorm = (name || '').toLowerCase();

  if (/(brutarie|patiserie|dulciuri|bauturi|lactate|desert|congelate|conserve|snack|cafea|ceai|bacanie)/.test(catNorm)) {
    return false;
  }

  const hasProduceWord = /\b(mere|mar|banane|banana|rosii|rosie|cartofi|cartof|ceapa|castraveti|castravete|morcovi|morcov|ardei|salata|varza|lamai|lamaie|portocale|portocala|mandarine|clementine|avocado|struguri|ciuperci|usturoi|dovlecei|vinete|patrunjel|marar|leustean|spanac|ridichi|capsuni|afine|zmeura|piersici|caise|prune|pere|para|pepene|conopida|broccoli|sfecla|telina|praz)\b/.test(nameNorm);

  if (!hasProduceWord) return false;
  return true;
}

function escapeSqlStr(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function escapeSqlJson(val) {
  if (val === null || val === undefined) return "'{}'::jsonb";
  return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
}

async function main() {
  const supabase = await getSupabaseAdmin();
  console.log('1. Loading context...');
  const ctx = await createIngestionContext(supabase);

  const { data: retailer, error: retErr } = await supabase
    .from('beavy_retailers')
    .select('id, slug, name, supports_physical, supports_delivery')
    .eq('slug', 'mega-image')
    .single();
  if (retErr || !retailer) throw new Error('Mega Image retailer not found');

  console.log('2. Fetching unpromoted Mega Image source catalog rows...');
  let from = 0;
  const pageSize = 1000;
  const sourceRows = [];
  while (true) {
    const { data, error } = await supabase
      .from('beavy_source_catalog')
      .select('id, source, retailer_id, source_product_id, source_product_name, brand, package_size, quantity_value, quantity_unit, barcode, image_url, product_url, external_category_path, raw_data')
      .eq('source', 'mega_image_api')
      .is('canonical_product_id', null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    sourceRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`Fetched ${sourceRows.length} source catalog rows.`);

  const newProductsSql = [];
  const familyLinksSql = [];
  const offersSql = [];
  const scUpdatesSql = [];

  let matchedExisting = 0;
  let createdNew = 0;
  let skipped = 0;

  for (const sc of sourceRows) {
    const price = Number(sc.raw_data?.price);
    if (!Number.isFinite(price) || price <= 0 || price > 5000) {
      skipped++;
      continue;
    }

    const { eligible, leafCategory } = inferGroceryCategory(
      sc.source_product_name,
      sc.external_category_path || '',
      sc.brand || '',
      ctx.categoriesBySlug
    );
    if (!eligible) {
      skipped++;
      continue;
    }

    const itemBrand = sc.brand && sc.brand !== '-' ? sc.brand : retailer.name;
    const isProduce = isFreshProduce(sc.source_product_name, sc.external_category_path);
    const isApiPl =
      sc.raw_data?.is_private_label === true ||
      sc.raw_data?.is_private_label === 'true';
    const isBrandPl = isRetailerPrivateBrand(itemBrand, sc.source_product_name);
    const isTruePrivateLabel = !isProduce && (isApiPl || isBrandPl);
    const codePrefix = isTruePrivateLabel
      ? 'pl-mega'
      : isProduce
        ? 'fres-mega'
        : 'can-mega';

    const matchRes = matchExternalProduct(ctx, {
      name: sc.source_product_name,
      brand: itemBrand,
      barcode: sc.barcode,
      packageSize: sc.package_size,
      imageUrl: sc.image_url,
      source: sc.source,
      isPrivateLabel: isTruePrivateLabel,
    });

    let canonical = matchRes?.canonical;
    let matchMethod = matchRes?.method;

    if (canonical) {
      matchedExisting++;
    } else {
      const brandKey = normalizeBrandKey(itemBrand);
      canonical = buildNewCanonicalCandidate(ctx, {
        retailerSlug: retailer.slug,
        retailerCodePrefix: codePrefix,
        sourceProductId: sc.source_product_id,
        name: sc.source_product_name,
        brand: brandKey ? itemBrand : retailer.name,
        packageSize: sc.package_size,
        imageUrl: sc.image_url,
        barcode: sc.barcode,
        hintCategoryPath: sc.external_category_path || '',
        isPrivateLabel: isTruePrivateLabel,
      });

      if (!canonical) {
        skipped++;
        continue;
      }

      createdNew++;
      matchMethod = 'mega_expansion_promoted';

      const customAttributes = {
        retailer_source: 'mega-image',
        is_private_label: isTruePrivateLabel,
        ...(isTruePrivateLabel ? { exclusive_retailer_slug: 'mega-image' } : {}),
        ...(isProduce ? { is_fresh_produce: true } : {}),
        promoted_from_collector: true,
      };

      newProductsSql.push(`INSERT INTO beavy_products (
        id, canonical_name, normalized_name, canonical_key, canonical_code,
        brand, category, subcategory, category_id, package_size,
        quantity_value, quantity_unit, barcode, image_url, attributes, is_active
      ) VALUES (
        ${escapeSqlStr(canonical.id)},
        ${escapeSqlStr(canonical.canonical_name)},
        ${escapeSqlStr(canonical.normalized_name)},
        ${escapeSqlStr(canonical.canonical_key)},
        ${escapeSqlStr(canonical.canonical_code)},
        ${escapeSqlStr(canonical.brand)},
        ${escapeSqlStr(canonical.category)},
        ${escapeSqlStr(canonical.subcategory)},
        ${escapeSqlStr(canonical.category_id)},
        ${escapeSqlStr(canonical.package_size)},
        ${canonical.quantity_value !== null ? canonical.quantity_value : 'NULL'},
        ${escapeSqlStr(canonical.quantity_unit)},
        ${escapeSqlStr(canonical.barcode)},
        ${escapeSqlStr(canonical.image_url)},
        ${escapeSqlJson(customAttributes)},
        true
      ) ON CONFLICT (canonical_key) DO NOTHING;`);
    }

    // Build standard offer
    const offerId = crypto.randomUUID();
    const regularPrice = sc.raw_data?.regular_price ? Number(sc.raw_data.regular_price) : price;
    const promoPrice = sc.raw_data?.promo_price ? Number(sc.raw_data.promo_price) : null;
    const loyaltyPrice = sc.raw_data?.loyalty_price ? Number(sc.raw_data.loyalty_price) : null;
    const promoLabel = sc.raw_data?.promo_title || sc.raw_data?.promo_label || null;
    const sgrFee = sc.raw_data?.sgr_fee && Number(sc.raw_data.sgr_fee) > 0 ? Number(sc.raw_data.sgr_fee) : null;

    offersSql.push(`INSERT INTO beavy_product_offers (
      id, product_id, retailer_id, retailer_name, fulfillment_channel, city,
      price, regular_price, promo_price, loyalty_price, promo_label, promo_requires_card,
      currency, package_size, quantity_value, quantity_unit, product_url, image_url,
      stock_status, is_active, raw_data, observed_at
    ) VALUES (
      ${escapeSqlStr(offerId)},
      ${escapeSqlStr(canonical.id)},
      ${escapeSqlStr(retailer.id)},
      ${escapeSqlStr(retailer.name)},
      'store',
      'Bucuresti',
      ${price},
      ${regularPrice && regularPrice > price ? regularPrice : price},
      ${promoPrice && promoPrice < price ? promoPrice : 'NULL'},
      ${loyaltyPrice && loyaltyPrice < price ? loyaltyPrice : 'NULL'},
      ${escapeSqlStr(promoLabel)},
      ${loyaltyPrice && loyaltyPrice < price ? 'true' : 'false'},
      'RON',
      ${escapeSqlStr(sc.package_size || canonical.package_size)},
      ${sc.quantity_value ?? canonical.quantity_value ?? 'NULL'},
      ${escapeSqlStr(sc.quantity_unit || canonical.quantity_unit)},
      ${escapeSqlStr(sc.product_url)},
      ${escapeSqlStr(sc.image_url || canonical.image_url)},
      'in_stock',
      true,
      ${escapeSqlJson({ ...(sc.raw_data || {}), is_private_label: isTruePrivateLabel, ...(sgrFee ? { sgr_fee: sgrFee } : {}) })},
      NOW()
    ) ON CONFLICT DO NOTHING;`);

    scUpdatesSql.push(`UPDATE beavy_source_catalog SET
      canonical_product_id = ${escapeSqlStr(canonical.id)},
      match_status = 'matched',
      match_method = ${escapeSqlStr(matchMethod)},
      updated_at = NOW()
    WHERE id = ${escapeSqlStr(sc.id)};`);
  }

  // Family links
  for (const link of ctx.pendingFamilyLinks) {
    familyLinksSql.push(`INSERT INTO beavy_product_family_members (
      family_id, product_id, sort_order, is_featured
    ) VALUES (
      ${escapeSqlStr(link.family_id)},
      ${escapeSqlStr(link.product_id)},
      ${link.sort_order || 50},
      ${link.is_featured ? 'true' : 'false'}
    ) ON CONFLICT (family_id, product_id) DO NOTHING;`);
  }

  console.log(`\n=== REZULTAT EXPANDARE MEGA IMAGE ===`);
  console.log(`Matched existing canonicals: ${matchedExisting}`);
  console.log(`Created new canonical products: ${createdNew}`);
  console.log(`Offers to insert: ${offersSql.length}`);
  console.log(`Source catalog updates: ${scUpdatesSql.length}`);
  console.log(`Family links: ${familyLinksSql.length}`);
  console.log(`Skipped (non-food / invalid): ${skipped}`);

  const allStatements = [
    ...newProductsSql,
    ...familyLinksSql,
    ...offersSql,
    ...scUpdatesSql,
  ];

  const outDir = path.join(process.cwd(), 'scripts', 'generated_sql');
  await fs.mkdir(outDir, { recursive: true });

  // Save in chunks of 50 statements
  const chunkSize = 50;
  const chunkFiles = [];
  for (let i = 0; i < allStatements.length; i += chunkSize) {
    const chunk = allStatements.slice(i, i + chunkSize);
    const chunkNum = Math.floor(i / chunkSize) + 1;
    const fileName = `mega_expansion_chunk_${String(chunkNum).padStart(2, '0')}.sql`;
    const filePath = path.join(outDir, fileName);
    await fs.writeFile(filePath, chunk.join('\n\n'), 'utf8');
    chunkFiles.push({ fileName, count: chunk.length });
  }

  console.log(`\nGenerated ${chunkFiles.length} SQL chunk files in scripts/generated_sql/`);
}

main().catch(console.error);
