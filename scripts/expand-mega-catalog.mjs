import { getSupabaseAdmin } from './lib/supabase-admin.mjs';
import {
  createIngestionContext,
  inferGroceryCategory,
  matchExternalProduct,
  buildNewCanonicalCandidate,
  buildStandardOffer,
  isRetailerPrivateBrand,
  pickFamilyForProduct,
} from './lib/retailer-ingest-helper.mjs';
import { normalizeBrandKey } from './lib/catalog-normalization.mjs';

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

async function main() {
  const supabase = await getSupabaseAdmin();
  console.log('1. Inițializare context de ingestie...');
  const ctx = await createIngestionContext(supabase);

  const { data: retailer, error: retErr } = await supabase
    .from('beavy_retailers')
    .select('id, slug, name, supports_physical, supports_delivery')
    .eq('slug', 'mega-image')
    .single();
  if (retErr || !retailer) throw new Error('Retailerul Mega Image nu a fost găsit');

  console.log('2. Preluare rânduri nepromovate din beavy_source_catalog pentru Mega Image...');
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
  console.log(`Preluat ${sourceRows.length} rânduri nepromovate din catalogul sursă.`);

  const pendingNewProducts = [];
  const pendingFamilyLinks = [];
  const pendingSourceRows = [];
  const pendingOfferRows = [];

  let skippedCount = 0;
  let produceCount = 0;
  let privateLabelCount = 0;
  let brandCount = 0;

  for (const sc of sourceRows) {
    const price = Number(sc.raw_data?.price);
    if (!Number.isFinite(price) || price <= 0 || price > 5000) {
      skippedCount++;
      continue;
    }

    const { eligible, categoryRow } = inferGroceryCategory(
      sc.source_product_name,
      sc.external_category_path || '',
      sc.brand || '',
      ctx.categoriesBySlug
    );
    if (!eligible) {
      skippedCount++;
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
      matchMethod = matchMethod || 'barcode_or_exact';
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
        skippedCount++;
        continue;
      }

      matchMethod = 'mega_expansion_promoted';

      const customAttributes = {
        retailer_source: 'mega-image',
        is_private_label: isTruePrivateLabel,
        ...(isTruePrivateLabel ? { exclusive_retailer_slug: 'mega-image' } : {}),
        ...(isProduce ? { is_fresh_produce: true } : {}),
        promoted_from_collector: true,
      };

      canonical.attributes = customAttributes;
      pendingNewProducts.push(canonical);

      if (categoryRow) {
        const fam = pickFamilyForProduct(ctx, categoryRow, canonical.canonical_name);
        if (fam) {
          pendingFamilyLinks.push({
            family_id: fam.id,
            product_id: canonical.id,
            sort_order: 99,
            is_featured: false,
          });
        }
      }
    }

    if (isProduce) produceCount++;
    else if (isTruePrivateLabel) privateLabelCount++;
    else brandCount++;

    const promoPrice =
      sc.raw_data?.promo_price && Number(sc.raw_data.promo_price) < price
        ? Number(sc.raw_data.promo_price)
        : null;

    const offer = buildStandardOffer({
      productId: canonical.id,
      retailerId: retailer.id,
      retailerName: retailer.name,
      source: 'mega_image_api',
      price: promoPrice ?? price,
      regularPrice: price,
      promoPrice,
      loyaltyPrice: null,
      promoLabel: sc.raw_data?.promo_label || null,
      promoRequiresCard: false,
      productUrl: sc.product_url,
      imageUrl: sc.image_url,
      packageSize: sc.package_size,
      quantityValue: sc.quantity_value,
      quantityUnit: sc.quantity_unit,
      fulfillmentChannel: 'store',
      city: 'București',
      observedAt: new Date().toISOString(),
      rawData: {
        ...(sc.raw_data || {}),
        promoted_from_collector: true,
        is_private_label: isTruePrivateLabel,
        ...(isProduce ? { is_fresh_produce: true } : {}),
      },
    });

    pendingOfferRows.push(offer);

    pendingSourceRows.push({
      id: sc.id,
      source: sc.source,
      retailer_id: retailer.id,
      source_product_id: sc.source_product_id,
      source_product_name: sc.source_product_name,
      brand: sc.brand,
      package_size: sc.package_size,
      quantity_value: sc.quantity_value,
      quantity_unit: sc.quantity_unit,
      external_category_path: sc.external_category_path,
      image_url: sc.image_url,
      product_url: sc.product_url,
      canonical_product_id: canonical.id,
      match_status: 'matched',
      match_confidence: 0.95,
      match_method: matchMethod,
      match_reasons: ['mega_expansion_promoted'],
      raw_data: sc.raw_data,
      is_active: true,
      observed_at: new Date().toISOString(),
      imported_at: new Date().toISOString(),
    });
  }

  console.log('\n=== REZULTAT CLASIFICARE PROGRESIVĂ ===');
  console.log(`Produse noi de inserat: ${pendingNewProducts.length}`);
  console.log(`- Marcă proprie: ${privateLabelCount}`);
  console.log(`- Fructe & Legume proaspete: ${produceCount}`);
  console.log(`- Branduri comerciale alimentare: ${brandCount}`);
  console.log(`Legături de familie de creat: ${pendingFamilyLinks.length}`);
  console.log(`Oferte de salvat: ${pendingOfferRows.length}`);
  console.log(`Actualizări catalog sursă: ${pendingSourceRows.length}`);
  console.log(`Sărite (nealimentare / fără preț): ${skippedCount}`);

  console.log('\n3. Executare loturi securizate via beavy_ingest_retailer_batch...');
  const BATCH_SIZE = 40;
  let totalNewCanonicals = 0;
  let totalFamilyLinks = 0;
  let totalSourcesUpdated = 0;
  let totalOffersSaved = 0;

  // Împărțim produsele, ofertele și sursele sincronizate în tranșe atomice
  for (let i = 0; i < pendingOfferRows.length; i += BATCH_SIZE) {
    const chunkOffers = pendingOfferRows.slice(i, i + BATCH_SIZE);
    const chunkProductIds = new Set(chunkOffers.map((o) => o.product_id));
    const chunkProducts = pendingNewProducts.filter((p) => chunkProductIds.has(p.id));
    const chunkFamilies = pendingFamilyLinks.filter((f) => chunkProductIds.has(f.product_id));
    const chunkSources = pendingSourceRows.slice(i, i + BATCH_SIZE);

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('beavy_ingest_retailer_batch', {
      p_retailer_id: retailer.id,
      p_delete_existing_offers: false,
      p_new_products: chunkProducts,
      p_family_links: chunkFamilies,
      p_source_rows: chunkSources,
      p_offer_rows: chunkOffers,
    });

    if (rpcErr) {
      console.error(`❌ Eroare la lotul ${i / BATCH_SIZE + 1}:`, rpcErr.message);
      throw rpcErr;
    }

    totalNewCanonicals += rpcRes?.new_canonicals ?? 0;
    totalFamilyLinks += rpcRes?.family_links ?? 0;
    totalSourcesUpdated += rpcRes?.source_catalog ?? 0;
    totalOffersSaved += rpcRes?.offers_saved ?? 0;

    process.stdout.write(
      `Lot ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pendingOfferRows.length / BATCH_SIZE)} finalizat ` +
      `(+${rpcRes?.new_canonicals || 0} produse, +${rpcRes?.offers_saved || 0} oferte)\n`
    );
  }

  console.log('\n=== SUCCES EXPANDARE CATALOG MEGA IMAGE ===');
  console.log(`Total produse canonice noi adăugate: ${totalNewCanonicals}`);
  console.log(`Total legături de familie: ${totalFamilyLinks}`);
  console.log(`Total oferte active adăugate: ${totalOffersSaved}`);
  console.log(`Total rânduri actualizate în source catalog: ${totalSourcesUpdated}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
