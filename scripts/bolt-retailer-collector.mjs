#!/usr/bin/env node
/**
 * Multi-Retailer Live Assortment Collector from Bolt Food API for Beavy
 *
 * Collects live food assortment, in-store prices, promotions, and high-res images
 * for Kaufland and Carrefour in Bucharest via Bolt's public consumer API.
 */

import { getSupabaseAdmin } from './lib/supabase-admin.mjs';
import {
  createIngestionContext,
  matchExternalProduct,
  buildNewCanonicalCandidate,
  pickFamilyForProduct,
} from './lib/retailer-ingest-helper.mjs';
import { parseQuantity, computeNormalizedUnitPrice } from './lib/catalog-normalization.mjs';

const BOLT_API_BASE = 'https://deliveryuser.live.boltsvc.net';
const BUCHAREST_CITY_ID = '325';

const BOLT_STORES = [
  {
    slug: 'kaufland',
    name: 'Kaufland Popa Nan',
    sourceKey: 'bolt_kaufland_catalog',
    codePrefix: 'KAU',
    providerId: 170899,
  },
  {
    slug: 'kaufland',
    name: 'Kaufland Barbu Văcărescu',
    sourceKey: 'bolt_kaufland_catalog',
    codePrefix: 'KAU',
    providerId: 170782,
  },
  {
    slug: 'carrefour',
    name: 'Carrefour Hypermarket Unirii',
    sourceKey: 'bolt_carrefour_catalog',
    codePrefix: 'CAR',
    providerId: 137802,
  },
  {
    slug: 'carrefour',
    name: 'Carrefour Hypermarket Orhideea',
    sourceKey: 'bolt_carrefour_catalog',
    codePrefix: 'CAR',
    providerId: 136041,
  },
  {
    slug: 'penny',
    name: 'PENNY Decebal',
    sourceKey: 'bolt_penny_catalog',
    codePrefix: 'PEN',
    providerId: 138497,
  },
  {
    slug: 'penny',
    name: 'PENNY Colentina',
    sourceKey: 'bolt_penny_catalog',
    codePrefix: 'PEN',
    providerId: 138496,
  },
  {
    slug: 'penny',
    name: 'PENNY Năsăud',
    sourceKey: 'bolt_penny_catalog',
    codePrefix: 'PEN',
    providerId: 138503,
  },
  {
    slug: 'penny',
    name: 'PENNY Titan',
    sourceKey: 'bolt_penny_catalog',
    codePrefix: 'PEN',
    providerId: 122926,
  },
];

const NON_FOOD_CATEGORIES_RE =
  /\b(ingrijire personala|sanatate|curatenie|animale|mama si copilul|jucarii|accesorii pentru casa|flori|tutun|non-food)\b/i;

const NON_FOOD_EXCLUDE_RE =
  /\b(polistiren|vopsea|decor\w*|fierbator|aparat|jucari\w*|detergent\w*|balsam\s+rufe|hartie\s+igienica|hrana\s+(?:caini|pisici)|nisip\s+pisici|sampon|gel\s+de\s+dus|deodorant|pasta\s+de\s+dinti|baterii|bec\s+led|tigari|tutun|odoriz\w*|corp\b|crema\s+corp|lotiune|scutece|absorbante)\b/i;

function cleanRetailerProductName(rawName, retailerSlug) {
  let name = String(rawName || '').trim();
  if (!name) return '';

  if (retailerSlug === 'kaufland') {
    name = name
      .replace(/^Oug\s+/i, '')
      .replace(/^Klc\s+/i, 'K-Classic ')
      .replace(/^Vdr\s+/i, 'Vreau din România ')
      .replace(/^Kfav\s+/i, 'K-Favourites ')
      .replace(/^Kbio\s+/i, 'K-Bio ')
      .replace(/^Kfree\s+/i, 'K-Free ');
  }

  return name.replace(/\s+/g, ' ').trim();
}

function inferBrandFromName(cleanName, retailerSlug) {
  const lower = cleanName.toLowerCase();
  if (lower.startsWith('k-classic')) return 'K-Classic';
  if (lower.startsWith('k-favourites') || lower.startsWith('k-favorites')) return 'K-Favourites';
  if (lower.startsWith('k-bio')) return 'K-Bio';
  if (lower.startsWith('vreau din romania') || lower.startsWith('vreau din românia')) {
    return 'Vreau din România';
  }
  if (lower.startsWith('carrefour classic') || lower.startsWith('carrefour bio') || lower.startsWith('carrefour extra') || lower.startsWith('carrefour ')) {
    return 'Carrefour';
  }
  if (lower.startsWith('drag de romania') || lower.startsWith('drag de românia')) {
    return 'Drag de România';
  }
  if (lower.startsWith('simpl ')) return 'Simpl';
  if (lower.startsWith('hanul boieresc')) return 'Hanul Boieresc';
  if (lower.startsWith('san fabio')) return 'San Fabio';
  if (lower.startsWith('boni ')) return 'Boni';
  if (lower.startsWith('penny ')) return 'Penny';
  if (lower.startsWith('milkeria')) return 'Milkeria';
  if (lower.startsWith('proxi ') || lower === 'proxi') return 'Proxi';
  if (lower.startsWith('gradina bunicii') || lower.startsWith('grădina bunicii')) return 'Grădina Bunicii';
  if (lower.startsWith('ferma din deal')) return 'Ferma din Deal';
  if (lower.startsWith('deli di')) return 'Deli Di';
  if (lower.startsWith('al saptesprezecelea') || lower.startsWith('al șaptesprezecelea')) return 'Al Șaptesprezecelea';
  if (lower.startsWith('profi ') || lower === 'profi') return 'Profi';

  const knownBrands = [
    'Agricola', 'Familia Toneli', 'Toneli', 'Cocorico', 'Fragedo', 'La Provincia',
    'Sanovita', 'Sano Vita', 'Sante', 'Pirifan', 'Solaris', 'Dr. Oetker',
    'Napolact', 'Zuzu', 'Olympus', 'Albalact', 'Covalact', 'Hochland', 'Delaco',
    'President', 'Lurpak', 'Alpro', 'Müller', 'Danone', 'Activia',
    'Băneasa', 'Baneasa', 'Barilla', 'Pambac', 'Boromir', 'Vel Pitar',
    'Dorna', 'Borsec', 'Aqua Carpatica', 'Bucovina', 'Jacobs', 'Lavazza',
    'Tchibo', 'Doncafe', 'Cris-Tim', 'Caroli', 'Meda', 'Fox', 'Sissi', 'Edenia',
  ];

  for (const kb of knownBrands) {
    const re = new RegExp(`\\b${kb.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
    if (re.test(cleanName)) {
      return kb === 'Sano Vita' ? 'Sanovita' : kb === 'Baneasa' ? 'Băneasa' : kb;
    }
  }

  return null;
}

async function fetchJsonWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

async function collectBoltStoreDishes(store, silent = false) {
  const dishesById = new Map();

  const baseParams = new URLSearchParams({
    version: '1.0.0',
    deviceId: '12345678-1234-1234-1234-1234567890ab',
    deviceType: 'web',
    device_name: 'Chrome',
    device_os_version: '126.0.0.0',
    language: 'ro',
    provider_id: String(store.providerId),
    city_id: BUCHAREST_CITY_ID,
  });

  // 1. Get categories
  const catUrl = `${BOLT_API_BASE}/deliveryClient/public/getMenuCategories?${baseParams.toString()}`;
  let catData;
  try {
    catData = await fetchJsonWithRetry(catUrl);
  } catch (err) {
    if (!silent) console.warn(`  ⚠️ [${store.name}] Eroare la categorii: ${err.message}`);
    return [];
  }

  const itemsMap = catData?.data?.items || {};
  const categories = Object.values(itemsMap).filter((it) => it.type === 'category');

  const foodCategories = categories.filter((c) => {
    const name = String(c.name?.value || '');
    return !NON_FOOD_CATEGORIES_RE.test(name);
  });

  if (!silent) {
    console.log(`  [${store.name}] Explorare ${foodCategories.length} categorii alimentare pe Bolt...`);
  }

  // 2. Fetch dishes for each food category
  for (const cat of foodCategories) {
    try {
      const dishParams = new URLSearchParams({
        version: '1.0.0',
        deviceId: '12345678-1234-1234-1234-1234567890ab',
        deviceType: 'web',
        device_name: 'Chrome',
        device_os_version: '126.0.0.0',
        language: 'ro',
        provider_id: String(store.providerId),
        category_id: String(cat.id),
      });

      const dishUrl = `${BOLT_API_BASE}/deliveryClient/public/getMenuDishes?${dishParams.toString()}`;
      const dishData = await fetchJsonWithRetry(dishUrl);
      const dishItems = Object.values(dishData?.data?.items || {});

      for (const d of dishItems) {
        if (d.type === 'dish' && d.id && d.name?.value && d.price?.value) {
          if (!dishesById.has(d.id)) {
            dishesById.set(d.id, {
              dish: d,
              hintCategory: cat.name?.value || 'Alimente',
            });
          }
        }
      }
    } catch {
      // Ignore single category failure
    }
  }

  return Array.from(dishesById.values());
}

export async function runBoltRetailerCollector(options = {}) {
  const { silent = false } = options;
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  if (!silent) {
    console.log('\n=== Pornire Colector Bolt Retailer (Kaufland, Carrefour, Penny, Profi) ===');
  }

  const supabase = await getSupabaseAdmin();
  const ctx = await createIngestionContext(supabase);

  const { data: retailers } = await supabase
    .from('beavy_retailers')
    .select('id, name, slug')
    .in('slug', ['kaufland', 'carrefour', 'penny', 'profi']);

  const retailerBySlug = new Map((retailers || []).map((r) => [r.slug, r]));
  const stats = {};
  const offersToUpsert = [];
  const nowIso = new Date().toISOString();

  for (const store of BOLT_STORES) {
    const retRow = retailerBySlug.get(store.slug);
    if (!retRow) continue;

    stats[store.name] = { collected: 0, matched: 0, newPromoted: 0, offersSaved: 0 };
    const collectedEntries = await collectBoltStoreDishes(store, silent);
    stats[store.name].collected = collectedEntries.length;

    if (!silent) {
      console.log(`  [${store.name}] Colectate ${collectedEntries.length} produse active.`);
    }

    for (const entry of collectedEntries) {
      const d = entry.dish;
      const cleanName = cleanRetailerProductName(d.name?.value, store.slug);
      if (!cleanName || NON_FOOD_EXCLUDE_RE.test(cleanName)) continue;

      const priceRon = Number(d.price?.value);
      if (!Number.isFinite(priceRon) || priceRon <= 0.2 || priceRon > 2000) continue;

      const origPriceRon =
        d.strike_through_price?.value && Number(d.strike_through_price.value) > priceRon
          ? Number(d.strike_through_price.value)
          : null;

      const brand = inferBrandFromName(cleanName, store.slug);
      const imageUrl =
        d.images?.menu_item_list_v1?.aspect_ratio_map?.original?.['3x'] ||
        d.images?.menu_item_list_v1?.aspect_ratio_map?.original?.['2x'] ||
        null;

      // Bolt's unit text is often a price ("16,49 lei/buc"); the real size is then in the name
      const unitInfo = d.unit_price?.unit_price?.value || '';
      const itemQty = parseQuantity(unitInfo) || parseQuantity(cleanName);
      const itemPkg = itemQty ? `${itemQty.baseValue} ${itemQty.baseUnit}` : null;

      const match = matchExternalProduct(ctx, {
        name: cleanName,
        brand,
        price: priceRon,
        source: store.sourceKey,
        packageSize: itemPkg || undefined,
        retailerSlug: store.slug,
      });

      let targetProductId = null;
      let targetCanonical = null;

      if (match && match.confidence >= 0.84) {
        targetProductId = match.canonical.id;
        targetCanonical = match.canonical;
        stats[store.name].matched++;
      } else {
        const pkgSizeStr = itemPkg || '1 buc';

        const newCand = buildNewCanonicalCandidate(ctx, {
          retailerSlug: store.slug,
          retailerCodePrefix: store.codePrefix,
          sourceProductId: `BOLT-${store.codePrefix}-${d.id}`,
          name: cleanName,
          brand: brand || null,
          packageSize: pkgSizeStr,
          imageUrl,
          barcode: null,
          hintCategoryPath: entry.hintCategory,
          isPrivateLabel: Boolean(
            brand &&
              /^(k-classic|k-favourites|k-bio|vreau din românia|carrefour|drag de românia|simpl|hanul boieresc|san fabio|boni|penny|milkeria|proxi|gradina bunicii|grădina bunicii|ferma din deal|deli di|al șaptesprezecelea|al saptesprezecelea|profi)$/i.test(
                brand
              )
          ),
        });

        if (newCand) {
          ctx.pendingNewProducts.push(newCand);
          const fam = pickFamilyForProduct(
            ctx,
            ctx.categoriesBySlug.get(newCand.category_id),
            newCand.canonical_name
          );
          if (fam) {
            ctx.pendingFamilyLinks.push({ family_id: fam.id, product_id: newCand.id });
          }
          targetProductId = newCand.id;
          targetCanonical = newCand;
          stats[store.name].newPromoted++;
        }
      }

      if (!targetProductId || !targetCanonical) continue;

      const parsedQty = parseQuantity(targetCanonical.package_size || cleanName);
      const qVal = targetCanonical.quantity_value ?? parsedQty?.baseValue ?? 1;
      const qUnit = targetCanonical.quantity_unit ?? parsedQty?.baseUnit ?? 'buc';
      const isWeightItem = /kg|g|kilogram|gram/i.test(qUnit) && qUnit === 'kg' && qVal === 1;
      const unitPriceCalc = computeNormalizedUnitPrice(priceRon, qVal, qUnit);

      offersToUpsert.push({
        product_id: targetProductId,
        retailer_id: retRow.id,
        retailer_name: retRow.name,
        source: store.sourceKey,
        price: priceRon,
        currency: 'RON',
        unit_price: unitPriceCalc?.value ?? priceRon,
        quantity_value: qVal,
        quantity_unit: qUnit,
        package_size:
          targetCanonical.package_size ||
          (parsedQty ? `${parsedQty.baseValue} ${parsedQty.baseUnit}` : '1 buc'),
        product_url: null,
        image_url: imageUrl || targetCanonical.image_url || null,
        fulfillment_channel: 'store',
        city: 'București',
        fulfillment_node_id: `bolt-${store.providerId}`,
        availability: d.availability === 'out_of_stock' ? 'out_of_stock' : 'in_stock',
        observed_at: nowIso,
        is_active: d.availability !== 'out_of_stock',
        regular_price: origPriceRon ?? priceRon,
        promo_price: origPriceRon ? priceRon : null,
        loyalty_price: null,
        promo_label: origPriceRon ? 'Reducere Bolt' : null,
        promo_requires_card: false,
        stock_status: d.availability === 'out_of_stock' ? 'out_of_stock' : 'in_stock',
        sell_by_mode: isWeightItem ? 'kg' : 'unit',
        normalized_unit_price: unitPriceCalc?.value ?? priceRon,
        normalized_unit_label: unitPriceCalc?.label ?? 'RON/buc',
        raw_data: {
          catalog_item_id: d.id,
          catalog_name: cleanName,
          store_venue: store.name,
          platform: 'bolt_food',
        },
      });
      stats[store.name].offersSaved++;
    }
  }

  // Deduplicate and promote new canonical products
  const dedupNewProdsMap = new Map();
  for (const np of ctx.pendingNewProducts) {
    if (!dedupNewProdsMap.has(np.id) && !dedupNewProdsMap.has(np.canonical_key)) {
      dedupNewProdsMap.set(np.id, np);
      dedupNewProdsMap.set(np.canonical_key, np);
    }
  }
  const uniqueNewProducts = Array.from(new Set(dedupNewProdsMap.values()));

  const dedupFamLinksMap = new Map();
  for (const fl of ctx.pendingFamilyLinks) {
    dedupFamLinksMap.set(fl.product_id, fl);
  }
  const uniqueFamilyLinks = Array.from(dedupFamLinksMap.values());

  if (uniqueNewProducts.length > 0 && retailers?.length > 0) {
    if (!silent) {
      console.log(`Promovare ${uniqueNewProducts.length} produse noi în catalogul canonic...`);
    }
    for (let i = 0; i < uniqueNewProducts.length; i += 50) {
      const prodsChunk = uniqueNewProducts.slice(i, i + 50);
      const famLinksChunk = uniqueFamilyLinks.filter((fl) =>
        prodsChunk.some((p) => p.id === fl.product_id)
      );
      const { error: rpcErr } = await supabase.rpc('beavy_ingest_retailer_batch', {
        p_retailer_id: retailers[0].id,
        p_delete_existing_offers: false,
        p_new_products: prodsChunk,
        p_family_links: famLinksChunk,
        p_source_rows: [],
        p_offer_rows: [],
      });
      if (rpcErr && !silent) {
        console.warn('  ⚠️ Eroare la promovare produse noi:', rpcErr.message);
      }
    }
  }

  // Upsert offers per retailer
  const offersByRetailer = new Map();
  for (const off of offersToUpsert) {
    if (!offersByRetailer.has(off.retailer_id)) offersByRetailer.set(off.retailer_id, []);
    offersByRetailer.get(off.retailer_id).push(off);
  }

  let totalSaved = 0;
  for (const [retId, retOffers] of offersByRetailer.entries()) {
    const dedupMap = new Map();
    for (const o of retOffers) {
      const key = `${o.product_id}:${o.fulfillment_channel}`;
      const prev = dedupMap.get(key);
      if (!prev || o.price < prev.price) {
        dedupMap.set(key, o);
      }
    }
    const uniqueOffers = Array.from(dedupMap.values());

    for (let i = 0; i < uniqueOffers.length; i += 100) {
      const offerChunk = uniqueOffers.slice(i, i + 100);
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('beavy_ingest_retailer_batch', {
        p_retailer_id: retId,
        p_delete_existing_offers: false,
        p_new_products: [],
        p_family_links: [],
        p_source_rows: [],
        p_offer_rows: offerChunk,
      });
      if (rpcErr) {
        if (!silent) console.warn(`  ⚠️ Eroare la salvare oferte (${retId}):`, rpcErr.message);
      } else {
        totalSaved += rpcRes?.offers_saved ?? offerChunk.length;
      }
    }
  }

  try {
    await supabase.from('beavy_feed_runs').insert({
      source: 'bolt_retailer_sync',
      status: 'success',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      products_found: offersToUpsert.length,
      offers_saved: totalSaved,
      metadata: { stats, durationMs: Date.now() - startTime },
    });
  } catch {
    // Non-fatal
  }

  if (!silent) {
    console.log(
      `\n=== Colector Bolt Retailer Finalizat în ${((Date.now() - startTime) / 1000).toFixed(1)}s (${totalSaved} oferte salvate) ===`
    );
    console.table(stats);
  }

  return { finalOffersCount: totalSaved, stats };
}

if (process.argv[1]?.endsWith('bolt-retailer-collector.mjs')) {
  runBoltRetailerCollector().catch((err) => {
    console.error('Fatal Bolt retailer collector error:', err);
    process.exit(1);
  });
}
