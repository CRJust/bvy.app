import { getSupabaseAdmin } from './lib/supabase-admin.mjs';
import {
  buildNewCanonicalCandidate,
  buildStandardOffer,
  createIngestionContext,
  inferGroceryCategory,
  isRetailerPrivateBrand,
  matchExternalProduct,
} from './lib/retailer-ingest-helper.mjs';
import { normalizeBrandKey, normalizeText } from './lib/catalog-normalization.mjs';

function extractNumericPrice(rawData = {}) {
  const candidates = [
    rawData.price,
    rawData.currentPrice,
    rawData.promo_price,
    rawData.regular_price,
  ];
  for (const val of candidates) {
    if (val === null || val === undefined || val === '') continue;
    const n = Number(val);
    if (Number.isFinite(n) && n > 0 && n < 5000) return Math.round(n * 100) / 100;
  }
  return null;
}

function extractOptionalNum(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

async function fetchAllPrivateLabelSourceRows(supabase) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('beavy_source_catalog')
      .select(
        'id, source, retailer_id, source_product_id, source_product_name, brand, barcode, package_size, quantity_value, quantity_unit, image_url, product_url, external_category_path, raw_data, match_method, canonical_product_id'
      )
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Fetch source_catalog error: ${error.message}`);
    const batch = (data || []).filter(
      (r) =>
        r.raw_data?.is_private_label === true ||
        r.raw_data?.is_private_label === 'true' ||
        String(r.match_method || '').includes('private_label')
    );
    rows.push(...batch);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchExistingOfferPairs(supabase) {
  const pairs = new Set();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('beavy_product_offers')
      .select('product_id, retailer_id')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Fetch existing offers error: ${error.message}`);
    for (const o of data || []) {
      pairs.add(`${o.product_id}:${o.retailer_id}`);
    }
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return pairs;
}

async function main() {
  const supabase = await getSupabaseAdmin();
  console.log('=== 1. Încărcare context catalog & retaileri ===');
  const [ctx, { data: retailers, error: retErr }] = await Promise.all([
    createIngestionContext(supabase),
    supabase.from('beavy_retailers').select('id, slug, name, supports_physical, supports_delivery, is_active'),
  ]);
  if (retErr) throw new Error(retErr.message);

  const retailerById = new Map((retailers || []).map((r) => [r.id, r]));

  console.log('\n=== 2. Backfill flag is_private_label pe produsele canonice existente ===');
  const attrUpdates = [];
  for (const prod of ctx.activeProducts) {
    const alreadyPl =
      prod.attributes?.is_private_label === true ||
      prod.attributes?.is_private_label === 'true';
    if (alreadyPl) continue;
    if (isRetailerPrivateBrand(prod.brand, prod.canonical_name)) {
      attrUpdates.push({
        id: prod.id,
        attributes: {
          ...(prod.attributes || {}),
          is_private_label: true,
        },
      });
    }
  }
  let attrDone = 0;
  for (let i = 0; i < attrUpdates.length; i += 50) {
    const chunk = attrUpdates.slice(i, i + 50);
    await Promise.all(
      chunk.map((item) =>
        supabase
          .from('beavy_products')
          .update({ attributes: item.attributes })
          .eq('id', item.id)
      )
    );
    attrDone += chunk.length;
  }
  console.log(`🏷️ Backfill is_private_label=true pe ${attrDone} produse canonice existente.`);

  console.log('\n=== 3. Reparare familii greșite („Lapte de capră” -> „Lapte”) ===');
  const { data: goatFam } = await supabase
    .from('beavy_product_families')
    .select('id, family_key')
    .eq('family_key', 'lapte-de-capra')
    .maybeSingle();
  const { data: cowMilkFamByName } = await supabase
    .from('beavy_product_families')
    .select('id, family_key')
    .eq('normalized_name', 'lapte')
    .limit(1)
    .maybeSingle();

  if (goatFam && cowMilkFamByName) {
    const { data: goatMembers } = await supabase
      .from('beavy_product_family_members')
      .select('product_id')
      .eq('family_id', goatFam.id);
    const toRemoveIds = [];
    const toMoveToCowMilk = [];
    for (const m of goatMembers || []) {
      const prod = ctx.productsById.get(m.product_id);
      if (!prod) continue;
      const n = normalizeText(prod.canonical_name);
      if (!/\bcapr/.test(n)) {
        toRemoveIds.push(prod.id);
        const isActualMilk =
          /\blapte\b/.test(n) &&
          !/\b(ciocolat|napolitan|kit kat|biscuit|croissant|caf|prajit)\b/.test(n);
        if (isActualMilk) {
          toMoveToCowMilk.push({
            family_id: cowMilkFamByName.id,
            product_id: prod.id,
            sort_order: 50,
            is_featured: false,
          });
        }
      }
    }
    if (toRemoveIds.length > 0) {
      for (let i = 0; i < toRemoveIds.length; i += 100) {
        await supabase
          .from('beavy_product_family_members')
          .delete()
          .eq('family_id', goatFam.id)
          .in('product_id', toRemoveIds.slice(i, i + 100));
      }
      if (toMoveToCowMilk.length > 0) {
        await supabase
          .from('beavy_product_family_members')
          .upsert(toMoveToCowMilk, {
            onConflict: 'family_id,product_id',
            ignoreDuplicates: true,
          });
      }
      console.log(
        `🔧 Curățate ${toRemoveIds.length} legături greșite din „Lapte de capră” (${toMoveToCowMilk.length} mutate în „Lapte”).`
      );
    }
  }

  console.log('\n=== 4. Promovare produse alimentare marcă proprie din beavy_source_catalog ===');
  const unpromoted = await fetchAllPrivateLabelSourceRows(supabase);
  console.log(`📦 Rânduri marcă proprie găsite în source_catalog: ${unpromoted.length}`);

  const existingOfferPairs = await fetchExistingOfferPairs(supabase);
  console.log(`🧾 Oferte active deja prezente: ${existingOfferPairs.size}`);

  let promotedCount = 0;
  let matchedCount = 0;
  let skippedNonFoodOrInvalid = 0;
  const scUpdates = [];
  const newOfferRows = [];
  const statsByRetailer = new Map();

  for (const sc of unpromoted) {
    const retailer = retailerById.get(sc.retailer_id);
    if (!retailer || !retailer.is_active) continue;

    const price = extractNumericPrice(sc.raw_data);
    if (!price) {
      skippedNonFoodOrInvalid++;
      continue;
    }

    let canonical = sc.canonical_product_id
      ? ctx.productsById.get(sc.canonical_product_id) || null
      : null;

    if (!canonical) {
      const { eligible } = inferGroceryCategory(
        sc.source_product_name,
        sc.external_category_path || '',
        sc.brand || '',
        ctx.categoriesBySlug
      );
      if (!eligible) {
        skippedNonFoodOrInvalid++;
        continue;
      }

      const itemBrand = sc.brand && sc.brand !== '-' ? sc.brand : retailer.name;
      const matchRes = matchExternalProduct(ctx, {
        name: sc.source_product_name,
        brand: itemBrand,
        barcode: sc.barcode,
        packageSize: sc.package_size,
        imageUrl: sc.image_url,
        source: sc.source,
        isPrivateLabel: true,
      });
      if (matchRes?.canonical) {
        canonical = matchRes.canonical;
        matchedCount++;
      } else {
        const brandKey = normalizeBrandKey(itemBrand);
        canonical = buildNewCanonicalCandidate(ctx, {
          retailerSlug: retailer.slug,
          retailerCodePrefix: `pl-${retailer.slug.slice(0, 4)}`,
          sourceProductId: sc.source_product_id,
          name: sc.source_product_name,
          brand: brandKey ? itemBrand : retailer.name,
          packageSize: sc.package_size,
          imageUrl: sc.image_url,
          barcode: sc.barcode,
          hintCategoryPath: sc.external_category_path || '',
          isPrivateLabel: true,
        });
        if (!canonical) {
          skippedNonFoodOrInvalid++;
          continue;
        }
        promotedCount++;
      }

      scUpdates.push({
        id: sc.id,
        canonical_product_id: canonical.id,
        match_status: 'matched',
        match_method: matchRes ? matchRes.method : 'private_label_promoted',
      });
    }

    const pairKey = `${canonical.id}:${retailer.id}`;
    if (!existingOfferPairs.has(pairKey)) {
      existingOfferPairs.add(pairKey);
      const regularPrice = extractOptionalNum(sc.raw_data?.regular_price);
      const promoPrice = extractOptionalNum(sc.raw_data?.promo_price);
      const loyaltyPrice = extractOptionalNum(sc.raw_data?.loyalty_price);
      const promoLabel = sc.raw_data?.promo_title || sc.raw_data?.promo_label || null;
      const isAvailable = sc.raw_data?.is_available !== false;
      const channel = retailer.supports_physical ? 'store' : 'delivery';
      const sgrFee =
        sc.raw_data?.sgr_fee && Number(sc.raw_data.sgr_fee) > 0
          ? Number(sc.raw_data.sgr_fee)
          : null;

      const offer = buildStandardOffer({
        productId: canonical.id,
        retailerId: retailer.id,
        retailerName: retailer.name,
        source: sc.source,
        price,
        regularPrice: regularPrice && regularPrice > price ? regularPrice : price,
        promoPrice: promoPrice && promoPrice < (regularPrice || price) ? promoPrice : null,
        loyaltyPrice,
        promoLabel,
        promoRequiresCard: Boolean(loyaltyPrice && loyaltyPrice < price),
        packageSize: sc.package_size || canonical.package_size,
        quantityValue: sc.quantity_value ?? canonical.quantity_value,
        quantityUnit: sc.quantity_unit ?? canonical.quantity_unit,
        productUrl: sc.product_url,
        imageUrl: sc.image_url || canonical.image_url,
        fulfillmentChannel: channel,
        isAvailable,
        rawData: {
          ...(sc.raw_data || {}),
          is_private_label: true,
          ...(sgrFee !== null ? { sgr_fee: sgrFee } : {}),
        },
      });
      newOfferRows.push(offer);
      statsByRetailer.set(retailer.name, (statsByRetailer.get(retailer.name) || 0) + 1);
    }
  }

  console.log(
    `📊 Rezultat procesare: ${promotedCount} noi promovate, ${matchedCount} potrivite existent, ${skippedNonFoodOrInvalid} nealimentare/fără preț sărite.`
  );

  if (ctx.pendingNewProducts.length > 0) {
    for (let i = 0; i < ctx.pendingNewProducts.length; i += 100) {
      const chunk = ctx.pendingNewProducts.slice(i, i + 100);
      const { error } = await supabase.from('beavy_products').insert(chunk);
      if (error) {
        console.error(`⚠️ Insert new products chunk ${i}:`, error.message);
      }
    }
    console.log(`✨ Inserate ${ctx.pendingNewProducts.length} produse marcă proprie în beavy_products.`);
  }

  if (ctx.pendingFamilyLinks.length > 0) {
    for (let i = 0; i < ctx.pendingFamilyLinks.length; i += 200) {
      const chunk = ctx.pendingFamilyLinks.slice(i, i + 200);
      const { error } = await supabase
        .from('beavy_product_family_members')
        .upsert(chunk, { onConflict: 'family_id,product_id', ignoreDuplicates: true });
      if (error) {
        console.error(`⚠️ Insert family links chunk ${i}:`, error.message);
      }
    }
    console.log(`🔗 Create ${ctx.pendingFamilyLinks.length} legături de familie.`);
  }

  if (scUpdates.length > 0) {
    for (let i = 0; i < scUpdates.length; i += 50) {
      const chunk = scUpdates.slice(i, i + 50);
      await Promise.all(
        chunk.map((u) =>
          supabase
            .from('beavy_source_catalog')
            .update({
              canonical_product_id: u.canonical_product_id,
              match_status: u.match_status,
              match_method: u.match_method,
            })
            .eq('id', u.id)
        )
      );
    }
    console.log(`📦 Actualizate ${scUpdates.length} legături în beavy_source_catalog.`);
  }

  if (newOfferRows.length > 0) {
    let insOffers = 0;
    for (let i = 0; i < newOfferRows.length; i += 100) {
      const chunk = newOfferRows.slice(i, i + 100);
      const { error } = await supabase.from('beavy_product_offers').insert(chunk);
      if (error) {
        console.error(`⚠️ Insert offers chunk ${i}:`, error.message);
      } else {
        insOffers += chunk.length;
      }
    }
    console.log(`✅ Inserate ${insOffers} oferte marcă proprie în beavy_product_offers!`);
  }

  for (const [rName, cnt] of statsByRetailer.entries()) {
    console.log(`   - ${rName}: +${cnt} oferte marcă proprie`);
  }
}

main().catch((err) => {
  console.error('❌ Eroare promovare mărci proprii:', err);
  process.exit(1);
});
