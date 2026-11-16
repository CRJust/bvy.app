#!/usr/bin/env node
/**
 * Colector Kaufland.ro (Oferte săptămânale + EAN-uri din Schwarz CDN)
 * Parsează cardurile `.k-product-tile`, extrage codul EAN 13 cifre din URL-ul imaginii,
 * potrivește pe EAN + heuristică canonică și promovează ofertele alimentare valide.
 */
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

const KAUFLAND_OFFERS_URL = 'https://www.kaufland.ro/oferte/oferte-saptamanale/saptamana-curenta.html';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRoNumber(raw) {
  const m = String(raw || '').match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const val = Number(m[1].replace(',', '.'));
  return Number.isFinite(val) && val > 0 ? Math.round(val * 100) / 100 : null;
}

function parseKauflandTiles(html) {
  if (/cf-turnstile|just a moment|verify you are human/i.test(html.slice(0, 4000))) {
    throw new Error('Detectat Challenge pe Kaufland. Oprire.');
  }

  const blocks = html.split(/<a[^>]+class="k-product-tile"/i).slice(1);
  const items = [];

  for (let idx = 0; idx < blocks.length; idx++) {
    const endPos = blocks[idx].indexOf('</a>');
    const block = endPos > 0 ? blocks[idx].slice(0, endPos) : blocks[idx].slice(0, 4500);

    const title = stripTags(block.match(/class="k-product-tile__title"[^>]*>([\s\S]*?)<\/div>/)?.[1]);
    const subtitle = stripTags(block.match(/class="k-product-tile__subtitle"[^>]*>([\s\S]*?)<\/div>/)?.[1]);
    const unitPriceStr = stripTags(block.match(/class="k-product-tile__unit-price"[^>]*>([\s\S]*?)<\/div>/)?.[1]);
    const discountStr = stripTags(block.match(/class="k-price-tag__discount"[^>]*>([\s\S]*?)<\/div>/)?.[1]);
    const eyeCatcher = stripTags(block.match(/class="k-eye-catcher[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1]);

    const price = parseRoNumber(stripTags(block.match(/class="k-price-tag__price"[^>]*>([\s\S]*?)<\/div>/)?.[1]));
    const oldPrice = parseRoNumber(stripTags(block.match(/class="k-price-tag__old-price-line-through"[^>]*>([\s\S]*?)<\/span>/)?.[1]));

    const imgSrc = block.match(/class="k-image k-product-tile__main-image"[^>]+src="([^"]+)"/)?.[1] || null;
    const eanCandidate = imgSrc?.match(/\/schwarz\/(\d{8,14})_RO_/i)?.[1] || null;
    const ean = eanCandidate && isValidEanCheckDigit(eanCandidate) ? eanCandidate : null;
    const rawSku = imgSrc?.match(/\/schwarz\/([A-Za-z0-9_-]+)/)?.[1] || 'item';
    const schwarzSku = `${rawSku}-${idx}`;

    if (!title || !price) continue;

    // Curățăm dublarea unității din subtitle (Kaufland pune deseori unitatea la finalul subtitle și în unit-price)
    let cleanSubtitle = subtitle;
    if (unitPriceStr && cleanSubtitle.toLowerCase().endsWith(unitPriceStr.toLowerCase())) {
      cleanSubtitle = cleanSubtitle.slice(0, -unitPriceStr.length).trim();
    }

    const fullName = cleanSubtitle ? `${title} ${cleanSubtitle}` : title;
    const looksBranded = title.length >= 2 && cleanSubtitle.length >= 4 && !/^(kg|buc|\d)/i.test(cleanSubtitle);
    const brand = looksBranded ? title : null;
    const isCardPromo = /kaufland card|k-card/i.test(`${eyeCatcher} ${discountStr}`);
    const promoLabel = discountStr || eyeCatcher || null;

    items.push({
      sku: schwarzSku,
      title,
      subtitle: cleanSubtitle,
      fullName,
      brand,
      packageSize: unitPriceStr && !/^(kg|buc)$/i.test(unitPriceStr) ? unitPriceStr : parseQuantity(fullName) ? `${parseQuantity(fullName).baseValue} ${parseQuantity(fullName).baseUnit}` : unitPriceStr || null,
      price,
      regularPrice: oldPrice && oldPrice > price ? oldPrice : price,
      promoPrice: oldPrice && oldPrice > price && !isCardPromo ? price : null,
      loyaltyPrice: isCardPromo ? price : null,
      promoRequiresCard: isCardPromo,
      promoLabel,
      ean,
      imageUrl: imgSrc,
    });
  }

  return items;
}

export async function runIngestion() {
  console.log('=== COLECTOR KAUFLAND.RO (OFERTE SĂPTĂMÂNALE + EAN SCHWARZ) ===');
  const supabase = await getSupabaseAdmin();
  const [retailer, ctx, html] = await Promise.all([
    resolveRetailerBySlug(supabase, 'kaufland'),
    createIngestionContext(supabase),
    fetch(KAUFLAND_OFFERS_URL, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20000),
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} la Kaufland`);
      return r.text();
    }),
  ]);

  const parsed = parseKauflandTiles(html);
  console.log(`📋 Carduri parsate de pe Kaufland: ${parsed.length} (${parsed.filter((p) => p.ean).length} cu EAN valid)`);

  const sourceCatalogRows = [];
  const matchedOffersMap = new Map();
  let matchedExisting = 0;
  let promotedNew = 0;
  let skippedNonFood = 0;

  for (const item of parsed) {
    const isPrivate = isRetailerPrivateBrand(item.brand, item.fullName);
    const match = matchExternalProduct(ctx, {
      source: 'kaufland_offers',
      retailerSlug: 'kaufland',
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
        retailerSlug: 'kaufland',
        retailerCodePrefix: 'KFL',
        sourceProductId: item.sku,
        name: item.fullName,
        brand: item.brand,
        packageSize: item.packageSize,
        imageUrl: item.imageUrl,
        barcode: item.ean,
        hintCategoryPath: item.fullName,
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
      source: 'kaufland_offers',
      retailer_id: retailer.id,
      source_product_id: item.sku,
      source_product_name: item.fullName,
      normalized_source_name: normalizeText(item.fullName),
      brand: item.brand,
      barcode: item.ean,
      package_size: canonical?.package_size || item.packageSize,
      quantity_value: parsedQty?.baseValue ?? null,
      quantity_unit: parsedQty?.baseUnit ?? null,
      image_url: item.imageUrl,
      product_url: KAUFLAND_OFFERS_URL,
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
      match_method: match?.method ?? (canonical ? 'promoted_kaufland_offer' : 'filtered_out'),
      match_reasons: match?.reasons ?? (canonical ? ['Ofertă alimentară promovată din Kaufland'] : ['Non-food']),
      observed_at: new Date().toISOString(),
      imported_at: new Date().toISOString(),
    });

    if (!canonical) continue;

    // Dacă oferta cere card, păstrăm prețul de referință pe regular și loyalty_price separat
    const stdPrice = item.promoRequiresCard ? item.regularPrice : item.price;
    const offer = buildStandardOffer({
      productId: canonical.id,
      retailerId: retailer.id,
      retailerName: retailer.name,
      source: 'kaufland_offers',
      price: stdPrice,
      regularPrice: item.regularPrice,
      promoPrice: item.promoPrice,
      loyaltyPrice: item.loyaltyPrice,
      promoLabel: item.promoLabel,
      promoRequiresCard: item.promoRequiresCard,
      packageSize: canonical.package_size || item.packageSize,
      quantityValue: canonical.quantity_value,
      quantityUnit: canonical.quantity_unit,
      productUrl: KAUFLAND_OFFERS_URL,
      imageUrl: item.imageUrl,
      fulfillmentChannel: 'store',
      city: 'București',
      isAvailable: true,
      rawData: {
        kaufland_sku: item.sku,
        kaufland_name: item.fullName,
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
    retailerSlug: 'kaufland',
    retailerName: retailer.name,
    source: 'kaufland_offers',
    sourceCatalogRows,
    offerRows: [...matchedOffersMap.values()],
  });

  console.log(`\n🎉 Kaufland finalizat! matched=${matchedExisting}, promoted=${promotedNew}, skipped=${skippedNonFood}, offers=${result.offersCount}`);
}

runIngestion().catch((err) => {
  console.error('Fatal Kaufland error:', err);
  process.exit(1);
});
