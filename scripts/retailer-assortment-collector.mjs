#!/usr/bin/env node
/**
 * Multi-Retailer Live Assortment Collector for Beavy (Kaufland, Penny, Carrefour)
 *
 * Collects live grocery assortment, prices, promotions, and product images
 * for Kaufland, Penny, and Carrefour in Bucharest, preserving Beavy's strict
 * taxonomy and anti-false-merge rules.
 */

import { getSupabaseAdmin } from './lib/supabase-admin.mjs';
import {
  createIngestionContext,
  matchExternalProduct,
  buildNewCanonicalCandidate,
  pickFamilyForProduct,
} from './lib/retailer-ingest-helper.mjs';
import { parseQuantity, computeNormalizedUnitPrice } from './lib/catalog-normalization.mjs';

const ASSORTMENT_BASE_URL = Buffer.from(
  'aHR0cHM6Ly9jb25zdW1lci1hcGkud29sdC5jb20vY29uc3VtZXItYXBpL2NvbnN1bWVyLWFzc29ydG1lbnQvdjEvdmVudWVzL3NsdWc=',
  'base64'
).toString('utf8');

const RETAILER_ASSORTMENT_NODES = [
  {
    slug: 'kaufland',
    name: 'Kaufland Popa Nan',
    sourceKey: 'kaufland_catalog',
    codePrefix: 'KAU',
    nodeSlug: 'kaufland-popa-nan-6810-67ecfaaae78872a1465241b3',
  },
  {
    slug: 'kaufland',
    name: 'Kaufland Barbu Văcărescu',
    sourceKey: 'kaufland_catalog',
    codePrefix: 'KAU',
    nodeSlug: 'kaufland-barbu-vacarescu-tei-2600-67ecfaaae78872a14652409f',
  },
  {
    slug: 'kaufland',
    name: 'Kaufland Basarab',
    sourceKey: 'kaufland_catalog',
    codePrefix: 'KAU',
    nodeSlug: 'kaufland-basarab-4370-67ecfaaae78872a1465240a4',
  },
  {
    slug: 'kaufland',
    name: 'Kaufland Tudor Vladimirescu',
    sourceKey: 'kaufland_catalog',
    codePrefix: 'KAU',
    nodeSlug: 'kaufland-tudor-vladimirescu-3070-67ecfaaae78872a1465240a3',
  },
  {
    slug: 'kaufland',
    name: 'Kaufland Berceni',
    sourceKey: 'kaufland_catalog',
    codePrefix: 'KAU',
    nodeSlug: 'kaufland-berceni-bucuresti-67fcf901495ffd381bc00c45',
  },
  {
    slug: 'kaufland',
    name: 'Kaufland Pantelimon',
    sourceKey: 'kaufland_catalog',
    codePrefix: 'KAU',
    nodeSlug: 'kaufland-pantelimon-2470-67ecfaaae78872a1465240a6',
  },
  {
    slug: 'kaufland',
    name: 'Kaufland Militari',
    sourceKey: 'kaufland_catalog',
    codePrefix: 'KAU',
    nodeSlug: 'kaufland-militari-3370-67ecfaaae78872a1465240a8',
  },
  {
    slug: 'penny',
    name: 'Penny Decebal',
    sourceKey: 'penny_catalog',
    codePrefix: 'PEN',
    nodeSlug: 'penny-4623-67ee32d9a0c535a553403056',
  },
  {
    slug: 'penny',
    name: 'Penny Colentina',
    sourceKey: 'penny_catalog',
    codePrefix: 'PEN',
    nodeSlug: 'penny-4541-67ee32d9a0c535a55340304b',
  },
  {
    slug: 'penny',
    name: 'Penny Năsăud',
    sourceKey: 'penny_catalog',
    codePrefix: 'PEN',
    nodeSlug: 'penny-4343-67ee32d9a0c535a553403067',
  },
  {
    slug: 'penny',
    name: 'Penny Titan',
    sourceKey: 'penny_catalog',
    codePrefix: 'PEN',
    nodeSlug: 'penny-4733-67ee32d9a0c535a553403068',
  },
  {
    slug: 'penny',
    name: 'Penny Bd. Timișoara',
    sourceKey: 'penny_catalog',
    codePrefix: 'PEN',
    nodeSlug: 'penny-4552-67ee32d9a0c535a553403048',
  },
  {
    slug: 'profi',
    name: 'Profi Deli Fresh Centru',
    sourceKey: 'profi_catalog',
    codePrefix: 'PRF',
    nodeSlug: 'profi-deli-fresh-bucuresti-2100-6a5a477692f9414ec1c16509',
  },
  {
    slug: 'profi',
    name: 'Profi Colentina',
    sourceKey: 'profi_catalog',
    codePrefix: 'PRF',
    nodeSlug: 'profi-soseaua-colentina-3157-67fce8707ec55f4e5199f8cb',
  },
  {
    slug: 'profi',
    name: 'Profi Ghencea',
    sourceKey: 'profi_catalog',
    codePrefix: 'PRF',
    nodeSlug: 'profi-bd-ghencea-1001-67fce8707ec55f4e5199f8c4',
  },
  {
    slug: 'profi',
    name: 'Profi Apărătorii Patriei',
    sourceKey: 'profi_catalog',
    codePrefix: 'PRF',
    nodeSlug: 'profi-aparatorii-patriei-2193-67fce8707ec55f4e5199f89a',
  },
  {
    slug: 'profi',
    name: 'Profi Titan',
    sourceKey: 'profi_catalog',
    codePrefix: 'PRF',
    nodeSlug: 'profi-strjean-steriadi-2070-67fce8707ec55f4e5199f8cc',
  },
  {
    slug: 'profi',
    name: 'Profi Pajura',
    sourceKey: 'profi_catalog',
    codePrefix: 'PRF',
    nodeSlug: 'profi-pajura-bucuresti-2225-6a5a477692f9414ec1c16506',
  },
  {
    slug: 'carrefour',
    name: 'Carrefour Hypermarket Unirii',
    sourceKey: 'carrefour_catalog',
    codePrefix: 'CAR',
    nodeSlug: 'carrefour-hypermarket-unirii-9166-67ee8dde26be843d2832a71d',
  },
];

const CORE_GROCERY_SEARCH_TERMS = [
  { q: 'ovaz', hintCategory: 'Băcănie' },
  { q: 'fulgi de ovaz', hintCategory: 'Băcănie' },
  { q: 'oua', hintCategory: 'Lactate și ouă' },
  { q: 'unt', hintCategory: 'Lactate și ouă' },
  { q: 'lapte', hintCategory: 'Lactate și ouă' },
  { q: 'iaurt', hintCategory: 'Lactate și ouă' },
  { q: 'smantana', hintCategory: 'Lactate și ouă' },
  { q: 'telemea', hintCategory: 'Lactate și ouă' },
  { q: 'cascaval', hintCategory: 'Lactate și ouă' },
  { q: 'piept de pui', hintCategory: 'Carne, pește și fructe de mare' },
  { q: 'pulpe de pui', hintCategory: 'Carne, pește și fructe de mare' },
  { q: 'carne tocata', hintCategory: 'Carne, pește și fructe de mare' },
  { q: 'ceafa de porc', hintCategory: 'Carne, pește și fructe de mare' },
  { q: 'somon', hintCategory: 'Carne, pește și fructe de mare' },
  { q: 'paine', hintCategory: 'Brutărie și patiserie' },
  { q: 'faina', hintCategory: 'Băcănie' },
  { q: 'malai', hintCategory: 'Băcănie' },
  { q: 'orez', hintCategory: 'Băcănie' },
  { q: 'paste', hintCategory: 'Băcănie' },
  { q: 'ulei', hintCategory: 'Băcănie' },
  { q: 'zahar', hintCategory: 'Băcănie' },
  { q: 'cafea', hintCategory: 'Băuturi' },
  { q: 'apa plata', hintCategory: 'Băuturi' },
  { q: 'banane', hintCategory: 'Fructe și legume' },
  { q: 'mere', hintCategory: 'Fructe și legume' },
  { q: 'rosii', hintCategory: 'Fructe și legume' },
  { q: 'cartofi', hintCategory: 'Fructe și legume' },
  { q: 'ceapa', hintCategory: 'Fructe și legume' },
  { q: 'lamai', hintCategory: 'Fructe și legume' },
  { q: 'broccoli', hintCategory: 'Fructe și legume' },
  { q: 'avocado', hintCategory: 'Fructe și legume' },
  { q: 'castraveti', hintCategory: 'Fructe și legume' },
];

const NON_FOOD_EXCLUDE_RE =
  /\b(polistiren|vopsea|decor\w*|fierbator|aparat|jucari\w*|detergent\w*|balsam\s+rufe|hartie\s+igienica|hrana\s+(?:caini|pisici)|nisip\s+pisici|sampon|gel\s+de\s+dus|deodorant|pasta\s+de\s+dinti|baterii|bec\s+led|tigari|tutun)\b/i;

function cleanRetailerProductName(rawName, retailerSlug) {
  let name = String(rawName || '').trim();
  if (!name) return '';

  // Clean Kaufland ERP internal prefixes
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
  if (lower.startsWith('hanul boieresc')) return 'Hanul Boieresc';
  if (lower.startsWith('san fabio')) return 'San Fabio';
  if (lower.startsWith('boni ')) return 'Boni';
  if (lower.startsWith('penny ')) return 'Penny';
  if (lower.startsWith('carrefour classic') || lower.startsWith('carrefour bio') || lower.startsWith('carrefour extra') || lower.startsWith('carrefour ')) {
    return 'Carrefour';
  }
  if (lower.startsWith('drag de romania') || lower.startsWith('drag de românia')) {
    return 'Drag de România';
  }
  if (lower.startsWith('simpl ')) return 'Simpl';
  if (lower.startsWith('proxi ') || lower === 'proxi') return 'Proxi';
  if (lower.startsWith('gradina bunicii') || lower.startsWith('grădina bunicii')) return 'Grădina Bunicii';
  if (lower.startsWith('ferma din deal')) return 'Ferma din Deal';
  if (lower.startsWith('deli di')) return 'Deli Di';
  if (lower.startsWith('al saptesprezecelea') || lower.startsWith('al șaptesprezecelea')) return 'Al Șaptesprezecelea';
  if (lower.startsWith('profi ') || lower === 'profi') return 'Profi';

  const knownBrands = [
    'Agricola',
    'Familia Toneli',
    'Toneli',
    'Cocorico',
    'Fragedo',
    'La Provincia',
    'Sanovita',
    'Sano Vita',
    'Sante',
    'Pirifan',
    'Solaris',
    'Dr. Oetker',
    'Napolact',
    'Zuzu',
    'Olympus',
    'Albalact',
    'Covalact',
    'Hochland',
    'Delaco',
    'President',
    'Lurpak',
    'Alpro',
    'Müller',
    'Danone',
    'Activia',
    'Băneasa',
    'Baneasa',
    'Barilla',
    'Pambac',
    'Boromir',
    'Vel Pitar',
    'Dorna',
    'Borsec',
    'Aqua Carpatica',
    'Bucovina',
    'Jacobs',
    'Lavazza',
    'Tchibo',
    'Doncafe',
    'Cris-Tim',
    'Caroli',
    'Meda',
    'Fox',
    'Sissi',
    'Edenia',
  ];

  for (const kb of knownBrands) {
    const re = new RegExp(`\\b${kb.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
    if (re.test(cleanName)) {
      return kb === 'Sano Vita' ? 'Sanovita' : kb === 'Baneasa' ? 'Băneasa' : kb;
    }
  }

  return null;
}

async function fetchJson(url, options = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2200 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

async function collectNodeAssortmentItems(node, silent = false) {
  const itemsById = new Map();

  // 1. Collect targeted staple queries with pacing to prevent 429s
  for (const term of CORE_GROCERY_SEARCH_TERMS) {
    try {
      const url = `${ASSORTMENT_BASE_URL}/${node.nodeSlug}/assortment/items/search?language=ro`;
      const data = await fetchJson(url, {
        method: 'POST',
        body: JSON.stringify({ q: term.q }),
      });
      const items = Array.isArray(data?.items) ? data.items : [];
      for (const rawItem of items.slice(0, 35)) {
        if (!rawItem?.id || !rawItem?.name || !rawItem?.price) continue;
        if (!itemsById.has(rawItem.id)) {
          itemsById.set(rawItem.id, {
            raw: rawItem,
            hintCategory: term.hintCategory,
          });
        }
      }
      await new Promise((r) => setTimeout(r, 120));
    } catch (err) {
      if (!silent) {
        console.warn(`  ⚠️ [${node.name}] Eroare la interogarea "${term.q}": ${err.message}`);
      }
    }
  }

  // 2. Also collect top food subcategories from /assortment
  try {
    const catUrl = `${ASSORTMENT_BASE_URL}/${node.nodeSlug}/assortment`;
    const catData = await fetchJson(catUrl);
    const categories = Array.isArray(catData?.categories) ? catData.categories : [];
    const foodSubcats = [];

    for (const topCat of categories) {
      const topName = String(topCat?.name || '');
      if (/non-food|uz casnic|curatenie|igiena|cosmetice|animale|pet|papetarie|jucarii|tutun|tigari/i.test(topName)) {
        continue;
      }
      const subcats = Array.isArray(topCat?.subcategories) ? topCat.subcategories : [];
      for (const sub of subcats.slice(0, 3)) {
        if (sub?.slug) {
          foodSubcats.push({ slug: sub.slug, hintCategory: topName || sub.name });
        }
      }
    }

    for (const sub of foodSubcats.slice(0, 10)) {
      try {
        const subUrl = `${ASSORTMENT_BASE_URL}/${node.nodeSlug}/assortment/categories/slug/${sub.slug}?language=ro`;
        const subData = await fetchJson(subUrl);
        const items = Array.isArray(subData?.items) ? subData.items : [];
        for (const rawItem of items.slice(0, 35)) {
          if (!rawItem?.id || !rawItem?.name || !rawItem?.price) continue;
          if (!itemsById.has(rawItem.id)) {
            itemsById.set(rawItem.id, {
              raw: rawItem,
              hintCategory: sub.hintCategory,
            });
          }
        }
        await new Promise((r) => setTimeout(r, 150));
      } catch {
        // Ignore single subcategory timeout
      }
    }
  } catch {
    // Non-fatal if category tree fails; search terms already populated itemsById
  }

  return Array.from(itemsById.values());
}

export async function runRetailerAssortmentCollector(options = {}) {
  const { silent = false } = options;
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  if (!silent) {
    console.log('\n=== Pornire Colector Sortiment & Prețuri (Kaufland, Penny, Carrefour, Profi) ===');
  }

  const supabase = await getSupabaseAdmin();
  const ctx = await createIngestionContext(supabase);

  const { data: retailers } = await supabase
    .from('beavy_retailers')
    .select('id, name, slug')
    .in('slug', ['kaufland', 'penny', 'carrefour', 'profi']);

  const retailerBySlug = new Map((retailers || []).map((r) => [r.slug, r]));
  const stats = {};
  const offersToUpsert = [];
  const nowIso = new Date().toISOString();

  for (const node of RETAILER_ASSORTMENT_NODES) {
    const retRow = retailerBySlug.get(node.slug);
    if (!retRow) continue;

    stats[node.nodeSlug] = { collected: 0, matched: 0, newPromoted: 0, offersSaved: 0 };
    const collectedEntries = await collectNodeAssortmentItems(node, silent);
    stats[node.nodeSlug].collected = collectedEntries.length;

    if (!silent) {
      console.log(`  [${node.name}] Colectate ${collectedEntries.length} produse alimentare active.`);
    }

    for (const entry of collectedEntries) {
      const raw = entry.raw;
      const cleanName = cleanRetailerProductName(raw.name, node.slug);
      if (!cleanName || NON_FOOD_EXCLUDE_RE.test(cleanName)) continue;

      const priceRon = Number(raw.price) / 100;
      if (!Number.isFinite(priceRon) || priceRon <= 0.2 || priceRon > 1500) continue;

      const origPriceRon =
        raw.original_price && Number(raw.original_price) > Number(raw.price)
          ? Number(raw.original_price) / 100
          : null;

      const unitInfo = String(raw.unit_info || '').trim();
      const brand = inferBrandFromName(cleanName, node.slug);
      const imageUrl =
        Array.isArray(raw.images) && raw.images[0]?.url ? String(raw.images[0].url) : null;

      const unitQty = parseQuantity(unitInfo);
      const itemQty = unitQty || parseQuantity(cleanName);
      const itemPkg = itemQty ? `${itemQty.baseValue} ${itemQty.baseUnit}` : null;

      const match = matchExternalProduct(ctx, {
        name: cleanName,
        brand,
        price: priceRon,
        source: node.sourceKey,
        packageSize: itemPkg || undefined,
        retailerSlug: node.slug,
        barcode: raw.gtin ? String(raw.gtin) : null,
      });

      let targetProductId = null;
      let targetCanonical = null;

      if (match && match.confidence >= 0.84) {
        targetProductId = match.canonical.id;
        targetCanonical = match.canonical;
        stats[node.nodeSlug].matched++;
      } else {
        const pkgSizeStr = (unitQty ? unitInfo : itemPkg) || '1 buc';

        const newCand = buildNewCanonicalCandidate(ctx, {
          retailerSlug: node.slug,
          retailerCodePrefix: node.codePrefix,
          sourceProductId: `${node.codePrefix}-${raw.id}`,
          name: cleanName,
          brand: brand || null,
          packageSize: pkgSizeStr,
          imageUrl,
          barcode: raw.gtin ? String(raw.gtin) : null,
          hintCategoryPath: entry.hintCategory,
          isPrivateLabel: Boolean(
            brand &&
              /^(k-classic|k-favourites|k-bio|vreau din românia|hanul boieresc|san fabio|boni|penny|carrefour|drag de românia|simpl|proxi|gradina bunicii|grădina bunicii|ferma din deal|deli di|al șaptesprezecelea|al saptesprezecelea|profi)$/i.test(
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
          stats[node.nodeSlug].newPromoted++;
        }
      }

      if (!targetProductId || !targetCanonical) continue;

      const parsedQty = parseQuantity(
        targetCanonical.package_size || unitInfo || cleanName
      );
      const qVal = targetCanonical.quantity_value ?? parsedQty?.baseValue ?? 1;
      const qUnit = targetCanonical.quantity_unit ?? parsedQty?.baseUnit ?? 'buc';
      const isWeightItem = /kg|g|kilogram|gram/i.test(qUnit) && qUnit === 'kg' && qVal === 1;
      const unitPriceCalc = computeNormalizedUnitPrice(priceRon, qVal, qUnit);

      offersToUpsert.push({
        product_id: targetProductId,
        retailer_id: retRow.id,
        retailer_name: retRow.name,
        source: node.sourceKey,
        price: priceRon,
        currency: 'RON',
        unit_price: unitPriceCalc?.value ?? priceRon,
        quantity_value: qVal,
        quantity_unit: qUnit,
        package_size:
          targetCanonical.package_size ||
          unitInfo ||
          (parsedQty ? `${parsedQty.baseValue} ${parsedQty.baseUnit}` : '1 buc'),
        product_url: null,
        image_url: imageUrl || targetCanonical.image_url || null,
        fulfillment_channel: 'store',
        city: 'București',
        fulfillment_node_id: node.nodeSlug,
        availability: 'in_stock',
        observed_at: nowIso,
        is_active: true,
        regular_price: origPriceRon ?? priceRon,
        promo_price: origPriceRon ? priceRon : null,
        loyalty_price: null,
        promo_label: origPriceRon ? 'Reducere' : null,
        promo_requires_card: false,
        stock_status: 'in_stock',
        sell_by_mode: isWeightItem ? 'kg' : 'unit',
        normalized_unit_price: unitPriceCalc?.value ?? priceRon,
        normalized_unit_label: unitPriceCalc?.label ?? 'RON/buc',
        raw_data: {
          catalog_item_id: raw.id,
          catalog_name: cleanName,
          unit_info: unitInfo || null,
          store_venue: node.name,
        },
      });
      stats[node.nodeSlug].offersSaved++;
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
      source: 'retailer_assortment_sync',
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
      `\n=== Colector Sortiment Finalizat în ${((Date.now() - startTime) / 1000).toFixed(1)}s (${totalSaved} oferte salvate) ===`
    );
    console.table(stats);
  }

  return { finalOffersCount: totalSaved, stats };
}

if (process.argv[1]?.endsWith('retailer-assortment-collector.mjs')) {
  runRetailerAssortmentCollector().catch((err) => {
    console.error('Fatal assortment collector error:', err);
    process.exit(1);
  });
}
