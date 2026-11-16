#!/usr/bin/env node
/**
 * Colector Penny.ro (API public /api/product-discovery/products)
 * Extrage ofertele active săptămânale inclusiv prețurile PENNY Card și potrivește/promovează produsele alimentare.
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

const PENNY_ORIGIN = 'https://www.penny.ro';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function formatPennyPackageSize(item) {
  const amtRaw = String(item.amount || '').replace(',', '.').trim();
  const volUnit = String(item.volumeLabelShort || '').trim().toLowerCase();
  const amtNum = Number(amtRaw);
  if (Number.isFinite(amtNum) && amtNum > 0 && volUnit) {
    if (volUnit === 'kg' && amtNum < 1) {
      return `${Math.round(amtNum * 1000)} g`;
    }
    if (volUnit === 'l' && amtNum < 1) {
      return `${Math.round(amtNum * 1000)} ml`;
    }
    if (['g', 'kg', 'ml', 'l', 'buc'].includes(volUnit)) {
      return `${amtNum} ${volUnit}`;
    }
  }
  const fromName = parseQuantity(item.name || '');
  return fromName ? `${fromName.baseValue} ${fromName.baseUnit}` : null;
}

function titleCasePennyName(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|\s)([a-zăâîșț])/g, (_, sp, ch) => sp + ch.toUpperCase());
}

export async function runIngestion() {
  console.log('=== COLECTOR PENNY.RO (PRODUCT DISCOVERY API + PENNY CARD) ===');
  const supabase = await getSupabaseAdmin();
  const [retailer, ctx] = await Promise.all([
    resolveRetailerBySlug(supabase, 'penny'),
    createIngestionContext(supabase),
  ]);

  const rawProducts = [];
  for (let page = 0; page < 20; page++) {
    const res = await fetch(
      `${PENNY_ORIGIN}/api/product-discovery/products?page=${page}&pageSize=100`,
      {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) break;
    const json = await res.json();
    const list = json?.results || [];
    rawProducts.push(...list);
    if (rawProducts.length >= (json?.total || 0) || list.length < 100) break;
  }

  console.log(`📋 Produse colectate de pe Penny: ${rawProducts.length}`);

  const sourceCatalogRows = [];
  const matchedOffersMap = new Map();
  let matchedExisting = 0;
  let promotedNew = 0;
  let skippedNonFood = 0;

  for (const item of rawProducts) {
    if (!item?.name || !item?.price?.regular?.value) continue;

    // Notă: în Rewe/Penny API `price.regular.value` este prețul curent de raft/ofertă în bani,
    // `price.loyalty.value` este prețul cu PENNY Card, iar `lowestPrice` este strict referința Omnibus 30 zile!
    const regularVal = Math.round((Number(item.price.regular.value) / 100) * 100) / 100;
    if (!Number.isFinite(regularVal) || regularVal <= 0) continue;

    const loyaltyValRaw = item.price.loyalty?.value
      ? Math.round((Number(item.price.loyalty.value) / 100) * 100) / 100
      : null;
    const loyaltyVal =
      loyaltyValRaw && loyaltyValRaw > 0 && loyaltyValRaw < regularVal
        ? loyaltyValRaw
        : null;

    const cleanName = titleCasePennyName(item.name);
    const brand = item.brandMarketing ? String(item.brandMarketing).trim() : null;
    const pkgSize = formatPennyPackageSize(item);
    const displayNameWithSize =
      pkgSize && !cleanName.toLowerCase().includes(pkgSize.toLowerCase())
        ? `${cleanName} ${pkgSize}`
        : cleanName;

    const catHint = [
      item.category,
      ...(Array.isArray(item.parentCategories)
        ? item.parentCategories.flat().map((c) => c?.name)
        : []),
    ]
      .filter(Boolean)
      .join(' > ');

    const imageUrl = Array.isArray(item.images) && item.images[0] ? item.images[0] : null;
    const productUrl = item.slug ? `${PENNY_ORIGIN}/product/${item.slug}` : `${PENNY_ORIGIN}/oferte`;
    const isPrivate = isRetailerPrivateBrand(brand, displayNameWithSize);

    const match = matchExternalProduct(ctx, {
      source: 'penny_discovery_api',
      retailerSlug: 'penny',
      name: displayNameWithSize,
      brand,
      packageSize: pkgSize,
      barcode: null,
      imageUrl,
    });

    let canonical = match?.canonical ?? null;
    if (match) {
      matchedExisting++;
    } else {
      const promoted = buildNewCanonicalCandidate(ctx, {
        retailerSlug: 'penny',
        retailerCodePrefix: 'PNY',
        sourceProductId: String(item.sku || item.productId),
        name: displayNameWithSize,
        brand,
        packageSize: pkgSize,
        imageUrl,
        barcode: null,
        hintCategoryPath: catHint,
        isPrivateLabel: isPrivate,
      });
      if (promoted) {
        canonical = promoted;
        promotedNew++;
      } else {
        skippedNonFood++;
      }
    }

    const parsedQty = parseQuantity(canonical?.package_size || pkgSize || displayNameWithSize);
    sourceCatalogRows.push({
      source: 'penny_discovery_api',
      retailer_id: retailer.id,
      source_product_id: String(item.sku || item.productId),
      source_product_name: displayNameWithSize,
      normalized_source_name: normalizeText(displayNameWithSize),
      brand,
      category: item.category || null,
      external_category_path: catHint || null,
      barcode: null,
      package_size: canonical?.package_size || pkgSize,
      quantity_value: parsedQty?.baseValue ?? null,
      quantity_unit: parsedQty?.baseUnit ?? null,
      image_url: imageUrl,
      product_url: productUrl,
      raw_data: {
        penny_sku: item.sku,
        price: regularVal,
        loyalty_price: loyaltyVal,
        omnibus_30d_lowest: item.price.lowestPrice ? item.price.lowestPrice / 100 : null,
        validity_start: item.price.validityStart || null,
        validity_end: item.price.validityEnd || null,
        is_private_label: isPrivate,
      },
      is_active: true,
      canonical_product_id: canonical?.id ?? null,
      match_status: canonical ? 'matched' : 'unmatched',
      match_confidence: match?.confidence ?? (canonical ? 1.0 : 0.0),
      match_method: match?.method ?? (canonical ? 'promoted_penny_offer' : 'filtered_out'),
      match_reasons: match?.reasons ?? (canonical ? ['Ofertă alimentară promovată din Penny'] : ['Non-food']),
      observed_at: new Date().toISOString(),
      imported_at: new Date().toISOString(),
    });

    if (!canonical) continue;

    const offer = buildStandardOffer({
      productId: canonical.id,
      retailerId: retailer.id,
      retailerName: retailer.name,
      source: 'penny_discovery_api',
      price: regularVal,
      regularPrice: regularVal,
      promoPrice: item.inPromotion ? regularVal : null,
      loyaltyPrice: loyaltyVal,
      promoLabel: loyaltyVal !== null ? 'PENNY Card' : item.inPromotion ? 'Ofertă săptămânală' : null,
      promoRequiresCard: loyaltyVal !== null,
      packageSize: canonical.package_size || pkgSize,
      quantityValue: canonical.quantity_value,
      quantityUnit: canonical.quantity_unit,
      productUrl,
      imageUrl,
      fulfillmentChannel: 'store',
      city: 'București',
      isAvailable: true,
      rawData: {
        penny_sku: item.sku,
        penny_name: displayNameWithSize,
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
    retailerSlug: 'penny',
    retailerName: retailer.name,
    source: 'penny_discovery_api',
    sourceCatalogRows,
    offerRows: [...matchedOffersMap.values()],
  });

  console.log(`\n🎉 Penny finalizat! matched=${matchedExisting}, promoted=${promotedNew}, skipped=${skippedNonFood}, offers=${result.offersCount}`);
}

runIngestion().catch((err) => {
  console.error('Fatal Penny error:', err);
  process.exit(1);
});
