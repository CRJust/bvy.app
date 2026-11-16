#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  classifyBarcode,
  computeContentHash,
  computeNormalizedUnitPrice,
  loadEnv,
  normalizeText,
  parseQuantity,
  scoreCanonicalCandidate,
  sqlLiteral,
  toBaseUnit,
} from './lib/catalog-normalization.mjs';

const ROOT_DIR = process.cwd();
const OUTPUT_DIR = path.join(ROOT_DIR, 'scripts', 'output');

/**
 * Parser CSV compatibil RFC-4180 (suportă ghilimele duble și virgule/linii în valori).
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell !== '')) rows.push(row);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((vals) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? '';
    });
    return obj;
  });
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const cleaned = String(val).replace(/\s+/g, '').replace(',', '.');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeStockStatus(rawStock, rawAvail) {
  const s = normalizeText(rawStock || rawAvail);
  if (!s) return 'in_stock';
  if (/(out of stock|unavailable|indisponibil|stoc epuizat|epuizat|0|false|no)/.test(s)) {
    return 'out_of_stock';
  }
  if (/(low|limitat|putine)/.test(s)) {
    return 'low_stock';
  }
  return 'in_stock';
}

function normalizeSellByMode(rawMode, rawQty, rawName) {
  const m = normalizeText(rawMode);
  if (m === 'kg' || m === 'weight') return 'kg';
  if (m === 'catch weight' || m === 'catch_weight' || m === 'variabil') return 'catch_weight';
  const combined = normalizeText(`${rawQty ?? ''} ${rawName ?? ''}`);
  if (/\b(vrac|per kg|\/kg)\b/.test(combined)) return 'kg';
  return 'unit';
}

/**
 * Adaptează un rând brut din feed extern (JSON/CSV) în schema unificată Beavy.
 */
export function normalizeRetailerRecord(raw) {
  const sourceProductId = String(
    raw.source_product_id ?? raw.sku ?? raw.id ?? raw.product_code ?? ''
  ).trim();
  const sourceProductName = String(
    raw.source_product_name ?? raw.product_name ?? raw.name ?? raw.title ?? ''
  ).trim();
  const brand = String(raw.brand ?? raw.manufacturer ?? '').trim() || null;
  const rawBarcode = String(raw.barcode ?? raw.ean ?? raw.gtin ?? '').trim() || null;
  const packageSize =
    String(raw.package_size ?? raw.quantity ?? raw.weight ?? raw.size ?? '').trim() || null;
  const externalCategoryPath =
    String(raw.category_path ?? raw.category ?? raw.department ?? '').trim() || null;

  const basePrice = parseNumber(raw.regular_price ?? raw.base_price ?? raw.list_price);
  const promoPrice = parseNumber(raw.promo_price ?? raw.sale_price ?? raw.discount_price);
  const loyaltyPrice = parseNumber(raw.loyalty_price ?? raw.card_price);
  const explicitPrice = parseNumber(raw.price ?? raw.effective_price);

  const effectivePrice =
    promoPrice !== null && (basePrice === null || promoPrice <= basePrice)
      ? promoPrice
      : explicitPrice ?? basePrice ?? loyaltyPrice ?? 0;

  const regularPrice =
    basePrice !== null
      ? basePrice
      : promoPrice !== null && explicitPrice !== null && explicitPrice > promoPrice
      ? explicitPrice
      : null;

  const promoLabel =
    String(raw.promo_label ?? raw.promo_mechanic ?? '').trim() ||
    (regularPrice !== null && promoPrice !== null && promoPrice < regularPrice
      ? `-${Math.round(((regularPrice - promoPrice) / regularPrice) * 100)}%`
      : null);

  const promoRequiresCard = Boolean(
    raw.promo_requires_card === true ||
      raw.promo_requires_card === 'true' ||
      (loyaltyPrice !== null && (promoPrice === null || loyaltyPrice < effectivePrice))
  );

  const barcodeInfo = rawBarcode ? classifyBarcode(rawBarcode) : null;
  const explicitQtyVal = parseNumber(raw.quantity_value);
  const explicitQtyUnit = raw.quantity_unit ? String(raw.quantity_unit).trim() : null;
  const parsedQty =
    explicitQtyVal && explicitQtyUnit
      ? toBaseUnit(explicitQtyVal, explicitQtyUnit, 1)
      : parseQuantity(packageSize || sourceProductName);

  const sellByMode = normalizeSellByMode(raw.sell_by_mode, packageSize, sourceProductName);
  const qtyForUnitPrice =
    parsedQty ?? (sellByMode === 'kg' ? toBaseUnit(1, 'kg', 1) : null);
  const { normalizedUnitPrice, normalizedUnitLabel } = computeNormalizedUnitPrice(
    effectivePrice,
    qtyForUnitPrice
  );

  const stockStatus = normalizeStockStatus(raw.stock_status, raw.availability);

  const normalizedRecord = {
    source_product_id: sourceProductId,
    source_product_name: sourceProductName,
    normalized_source_name: normalizeText(sourceProductName),
    brand,
    barcode: barcodeInfo ? barcodeInfo.code : null,
    barcode_type: barcodeInfo ? barcodeInfo.barcodeType : null,
    is_global_gtin: Boolean(barcodeInfo?.isGlobalGtin),
    package_size: packageSize,
    quantity_value: parsedQty ? parsedQty.baseValue : explicitQtyVal,
    quantity_unit: parsedQty ? parsedQty.baseUnit : explicitQtyUnit,
    sell_by_mode: sellByMode,
    external_category_path: externalCategoryPath,
    price: Math.round(effectivePrice * 100) / 100,
    regular_price: regularPrice !== null ? Math.round(regularPrice * 100) / 100 : null,
    promo_price: promoPrice !== null ? Math.round(promoPrice * 100) / 100 : null,
    loyalty_price: loyaltyPrice !== null ? Math.round(loyaltyPrice * 100) / 100 : null,
    promo_label: promoLabel,
    promo_requires_card: promoRequiresCard,
    normalized_unit_price: normalizedUnitPrice,
    normalized_unit_label: normalizedUnitLabel,
    stock_status: stockStatus,
    availability: stockStatus === 'out_of_stock' ? 'out_of_stock' : 'in_stock',
    product_url: String(raw.product_url ?? raw.url ?? '').trim() || null,
    image_url: String(raw.image_url ?? '').trim() || null,
    raw_data: raw,
  };

  return {
    ...normalizedRecord,
    content_hash: computeContentHash({
      id: normalizedRecord.source_product_id,
      name: normalizedRecord.normalized_source_name,
      brand: normalizedRecord.brand,
      barcode: normalizedRecord.barcode,
      qty: normalizedRecord.quantity_value,
      unit: normalizedRecord.quantity_unit,
      price: normalizedRecord.price,
      reg: normalizedRecord.regular_price,
      promo: normalizedRecord.promo_price,
      loyal: normalizedRecord.loyalty_price,
      stock: normalizedRecord.stock_status,
      cat: normalizedRecord.external_category_path,
    }),
  };
}

/**
 * Rulează pipeline-ul complet de normalizare + matching determinist + pregătire oferte.
 */
export function processRetailerFeed({
  feedRows,
  retailerSlug,
  retailerName,
  sourceName,
  city = 'București',
  channel = 'delivery',
  observedAt = new Date().toISOString(),
  fullFeed = false,
  canonicalProducts = [],
  barcodeIndex = new Map(),
  categoryMappings = new Map(),
}) {
  const source = sourceName || `feed_${retailerSlug}`;
  const results = [];
  const summary = {
    retailerSlug,
    source,
    totalInput: feedRows.length,
    matchedExactEan: 0,
    matchedStrictCanonical: 0,
    suggestedForReview: 0,
    unmatched: 0,
    skippedInvalid: 0,
    weighScaleBarcodesIsolated: 0,
    offersReady: 0,
  };

  for (const raw of feedRows) {
    const rec = normalizeRetailerRecord(raw);
    if (!rec.source_product_id || !rec.source_product_name || !Number.isFinite(rec.price)) {
      summary.skippedInvalid++;
      continue;
    }

    if (rec.barcode_type === 'weigh_scale' || rec.barcode_type === 'retailer_plu') {
      summary.weighScaleBarcodesIsolated++;
    }

    const mappedCategoryId = rec.external_category_path
      ? categoryMappings.get(normalizeText(rec.external_category_path)) ?? null
      : null;

    let matchStatus = 'unmatched';
    let matchConfidence = 0;
    let matchMethod = null;
    let reviewStatus = 'not_required';
    let canonicalProductId = null;
    let matchReasons = [];
    let runnerUpConfidence = null;

    // 1. Exact global GTIN resolution (never matches weigh_scale / internal PLU globally)
    if (rec.is_global_gtin && rec.barcode && barcodeIndex.has(rec.barcode)) {
      const target = barcodeIndex.get(rec.barcode);
      canonicalProductId = target.id;
      matchStatus = 'matched';
      matchConfidence = 1.0;
      matchMethod = 'ean_exact';
      reviewStatus = 'not_required';
      matchReasons = [`Potrivire exactă pe cod EAN (${rec.barcode})`];
      summary.matchedExactEan++;
    } else {
      // 2. Strict canonical matching (with ±3% shrinkflation & subtype guards)
      const hitPayload = {
        code: rec.barcode || rec.source_product_id,
        product_name: rec.source_product_name,
        brands: rec.brand || '',
        quantity: rec.package_size || rec.source_product_name,
        categories: rec.external_category_path || '',
        image_url: rec.image_url || '',
        requireImage: false,
      };

      const candidates = [];
      for (const prod of canonicalProducts) {
        const scored = scoreCanonicalCandidate(prod, hitPayload);
        if (scored.confidence >= 0.45) {
          candidates.push({ prod, ...scored });
        }
      }
      candidates.sort((a, b) => b.confidence - a.confidence);
      const best = candidates[0] ?? null;
      const second = candidates[1] ?? null;
      const margin = best && second ? best.confidence - second.confidence : 0.25;
      runnerUpConfidence = second ? second.confidence : null;

      if (best && best.confidence >= 0.85 && best.quantityExact && margin >= 0.08) {
        canonicalProductId = best.prod.id;
        matchStatus = 'matched';
        matchConfidence = best.confidence;
        matchMethod = 'canonical_strict';
        reviewStatus = 'not_required';
        matchReasons = best.reasons;
        summary.matchedStrictCanonical++;
      } else if (best && best.confidence >= 0.62) {
        canonicalProductId = best.prod.id;
        matchStatus = 'suggested';
        matchConfidence = best.confidence;
        matchMethod = 'canonical_suggested';
        reviewStatus = 'pending';
        matchReasons = best.reasons;
        summary.suggestedForReview++;
      } else {
        matchReasons = best ? best.reasons : ['Fără candidat compatibil în catalogul canonic'];
        summary.unmatched++;
      }
    }

    const canPublishOffer = matchStatus === 'matched' && canonicalProductId !== null;
    if (canPublishOffer) summary.offersReady++;

    results.push({
      ...rec,
      city,
      fulfillment_channel: channel,
      observed_at: observedAt,
      mapped_category_id: mappedCategoryId,
      canonical_product_id: canonicalProductId,
      match_status: matchStatus,
      match_confidence: matchConfidence,
      runner_up_confidence: runnerUpConfidence,
      match_method: matchMethod,
      review_status: reviewStatus,
      match_reasons: matchReasons,
      publish_offer: canPublishOffer,
    });
  }

  return {
    meta: {
      retailerSlug,
      retailerName: retailerName || retailerSlug,
      source,
      city,
      channel,
      observedAt,
      fullFeed,
    },
    summary,
    items: results,
  };
}

/**
 * Generează tranzacția SQL idempotentă pentru Faza 1:
 * run tracking + delta source_catalog + queue review + atomic offer snapshot + delta price_history + delisting optional.
 */
export function buildIngestionSql(processed) {
  const { meta, summary, items } = processed;
  const payload = items.map((x) => ({
    source_product_id: x.source_product_id,
    source_product_name: x.source_product_name,
    normalized_source_name: x.normalized_source_name,
    brand: x.brand,
    barcode: x.barcode,
    package_size: x.package_size,
    quantity_value: x.quantity_value,
    quantity_unit: x.quantity_unit,
    sell_by_mode: x.sell_by_mode,
    external_category_path: x.external_category_path,
    product_url: x.product_url,
    canonical_product_id: x.canonical_product_id,
    match_status: x.match_status,
    match_confidence: x.match_confidence,
    runner_up_confidence: x.runner_up_confidence,
    match_method: x.match_method,
    review_status: x.review_status,
    match_reasons: x.match_reasons,
    content_hash: x.content_hash,
    publish_offer: x.publish_offer,
    price: x.price,
    regular_price: x.regular_price,
    promo_price: x.promo_price,
    loyalty_price: x.loyalty_price,
    promo_label: x.promo_label,
    promo_requires_card: x.promo_requires_card,
    normalized_unit_price: x.normalized_unit_price,
    normalized_unit_label: x.normalized_unit_label,
    stock_status: x.stock_status,
    availability: x.availability,
    raw_data: x.raw_data,
  }));

  return [
    '-- Auto-generated generic retailer feed ingestion (Phase 1 Delta + Atomic Snapshots)',
    `-- Retailer: ${meta.retailerSlug} | Items: ${items.length} | Offers ready: ${summary.offersReady} | Full feed TTL reconcile: ${meta.fullFeed}`,
    'do $ingest$',
    'declare',
    '  v_retailer_id uuid;',
    '  v_retailer_name text;',
    '  v_run_id uuid;',
    `  v_source text := ${sqlLiteral(meta.source)};`,
    `  v_city text := ${sqlLiteral(meta.city)};`,
    `  v_channel text := ${sqlLiteral(meta.channel)};`,
    `  v_observed_at timestamptz := ${sqlLiteral(meta.observedAt)}::timestamptz;`,
    `  v_full_feed boolean := ${meta.fullFeed ? 'true' : 'false'};`,
    `  v_rows jsonb := ${sqlLiteral(JSON.stringify(payload))}::jsonb;`,
    '  r jsonb;',
    '  v_src_id uuid;',
    '  v_pid uuid;',
    '  v_prev_price numeric;',
    'begin',
    `  select id, name into v_retailer_id, v_retailer_name from public.beavy_retailers where slug = ${sqlLiteral(meta.retailerSlug)} limit 1;`,
    '  if v_retailer_id is null then',
    `    raise exception 'Retailer necunoscut în beavy_retailers: %', ${sqlLiteral(meta.retailerSlug)};`,
    '  end if;',
    '',
    '  insert into public.beavy_feed_runs (source, retailer_id, status, started_at, finished_at, products_found, offers_saved, metadata)',
    `  values (v_source, v_retailer_id, 'success', now(), now(), ${items.length}, ${summary.offersReady}, ${sqlLiteral(JSON.stringify(summary))}::jsonb)`,
    '  returning id into v_run_id;',
    '',
    '  for r in select * from jsonb_array_elements(v_rows) loop',
    '    insert into public.beavy_source_catalog (',
    '      source, retailer_id, source_product_id, source_product_name, normalized_source_name,',
    '      brand, barcode, package_size, quantity_value, quantity_unit, sell_by_mode,',
    '      external_category_path, product_url, canonical_product_id, match_status,',
    '      match_confidence, match_method, match_reasons, review_status, content_hash,',
    '      last_seen_run_id, last_seen_at, observed_at, raw_data',
    '    )',
    '    values (',
    "      v_source, v_retailer_id, r->>'source_product_id', r->>'source_product_name', r->>'normalized_source_name',",
    "      nullif(r->>'brand',''), nullif(r->>'barcode',''), nullif(r->>'package_size',''),",
    "      nullif(r->>'quantity_value','')::numeric, nullif(r->>'quantity_unit',''), r->>'sell_by_mode',",
    "      nullif(r->>'external_category_path',''), nullif(r->>'product_url',''),",
    "      nullif(r->>'canonical_product_id','')::uuid, r->>'match_status',",
    "      (r->>'match_confidence')::numeric, nullif(r->>'match_method',''), coalesce(r->'match_reasons','[]'::jsonb),",
    "      r->>'review_status', r->>'content_hash', v_run_id, v_observed_at, v_observed_at, coalesce(r->'raw_data','{}'::jsonb)",
    '    )',
    '    on conflict (source, source_product_id) do update set',
    '      source_product_name = excluded.source_product_name,',
    '      normalized_source_name = excluded.normalized_source_name,',
    '      brand = excluded.brand,',
    '      barcode = excluded.barcode,',
    '      package_size = excluded.package_size,',
    '      quantity_value = excluded.quantity_value,',
    '      quantity_unit = excluded.quantity_unit,',
    '      sell_by_mode = excluded.sell_by_mode,',
    '      external_category_path = excluded.external_category_path,',
    '      canonical_product_id = coalesce(public.beavy_source_catalog.canonical_product_id, excluded.canonical_product_id),',
    "      match_status = case when public.beavy_source_catalog.review_status = 'approved' then public.beavy_source_catalog.match_status else excluded.match_status end,",
    "      match_confidence = case when public.beavy_source_catalog.review_status = 'approved' then public.beavy_source_catalog.match_confidence else excluded.match_confidence end,",
    '      content_hash = excluded.content_hash,',
    '      last_seen_run_id = v_run_id,',
    '      last_seen_at = v_observed_at,',
    '      observed_at = v_observed_at,',
    '      is_active = true,',
    '      updated_at = now()',
    '    returning id, canonical_product_id into v_src_id, v_pid;',
    '',
    "    if (r->>'review_status') = 'pending' then",
    '      insert into public.beavy_product_match_reviews (source_catalog_id, candidate_barcode, candidate_payload, confidence, runner_up_confidence, reasons, status)',
    "      values (v_src_id, nullif(r->>'barcode',''), jsonb_build_object('canonical_product_id', r->>'canonical_product_id', 'source_product_name', r->>'source_product_name'), (r->>'match_confidence')::numeric, nullif(r->>'runner_up_confidence','')::numeric, coalesce(r->'match_reasons','[]'::jsonb), 'pending');",
    '    end if;',
    '',
    "    if (r->>'publish_offer')::boolean and v_pid is not null then",
    '      select price into v_prev_price from public.beavy_product_offers',
    '      where retailer_id = v_retailer_id and fulfillment_node_id is null and product_id = v_pid and fulfillment_channel = v_channel and is_active = true;',
    '',
    '      insert into public.beavy_product_offers (',
    '        product_id, source_catalog_id, retailer_id, retailer_name, source,',
    '        price, regular_price, promo_price, loyalty_price, promo_label, promo_requires_card,',
    '        currency, unit_price, normalized_unit_price, normalized_unit_label, sell_by_mode,',
    '        quantity_value, quantity_unit, package_size, product_url, fulfillment_channel,',
    '        city, availability, stock_status, observed_at, is_active, last_seen_run_id, content_hash',
    '      )',
    '      values (',
    '        v_pid, v_src_id, v_retailer_id, v_retailer_name, v_source,',
    "        (r->>'price')::numeric, nullif(r->>'regular_price','')::numeric, nullif(r->>'promo_price','')::numeric,",
    "        nullif(r->>'loyalty_price','')::numeric, nullif(r->>'promo_label',''), (r->>'promo_requires_card')::boolean,",
    "        'RON', nullif(r->>'normalized_unit_price','')::numeric, nullif(r->>'normalized_unit_price','')::numeric,",
    "        nullif(r->>'normalized_unit_label',''), r->>'sell_by_mode', nullif(r->>'quantity_value','')::numeric,",
    "        nullif(r->>'quantity_unit',''), nullif(r->>'package_size',''), nullif(r->>'product_url',''),",
    "        v_channel, v_city, r->>'availability', r->>'stock_status', v_observed_at, true, v_run_id, r->>'content_hash'",
    '      )',
    "      on conflict (retailer_id, coalesce(fulfillment_node_id, '00000000-0000-0000-0000-000000000000'::uuid), product_id, fulfillment_channel) where (is_active is true and product_id is not null and retailer_id is not null)",
    '      do update set',
    '        price = excluded.price,',
    '        regular_price = excluded.regular_price,',
    '        promo_price = excluded.promo_price,',
    '        loyalty_price = excluded.loyalty_price,',
    '        promo_label = excluded.promo_label,',
    '        promo_requires_card = excluded.promo_requires_card,',
    '        normalized_unit_price = excluded.normalized_unit_price,',
    '        normalized_unit_label = excluded.normalized_unit_label,',
    '        availability = excluded.availability,',
    '        stock_status = excluded.stock_status,',
    '        observed_at = excluded.observed_at,',
    '        last_seen_run_id = v_run_id,',
    '        content_hash = excluded.content_hash;',
    '',
    "      if v_prev_price is distinct from (r->>'price')::numeric then",
    '        insert into public.beavy_product_price_history (',
    '          product_id, retailer_id, fulfillment_channel, price, regular_price, promo_price, loyalty_price, currency, observed_at, run_id',
    '        )',
    '        values (',
    "          v_pid, v_retailer_id, v_channel, (r->>'price')::numeric, nullif(r->>'regular_price','')::numeric,",
    "          nullif(r->>'promo_price','')::numeric, nullif(r->>'loyalty_price','')::numeric, 'RON', v_observed_at, v_run_id",
    '        );',
    '      end if;',
    '    end if;',
    '  end loop;',
    '',
    '  if v_full_feed then',
    '    update public.beavy_product_offers set is_active = false',
    '    where retailer_id = v_retailer_id',
    '      and fulfillment_channel = v_channel',
    '      and city = v_city',
    '      and is_active = true',
    '      and last_seen_run_id is distinct from v_run_id;',
    '  end if;',
    'end $ingest$;',
  ].join('\n');
}

function getArg(args, name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return fallback;
}

async function fetchLiveCanonicalCatalog(supabaseUrl, anonKey) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/beavy_products?select=id,canonical_name,brand,package_size,quantity_value,quantity_unit,barcode,attributes&is_active=eq.true&limit=2000`,
    {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    }
  );
  if (!res.ok) throw new Error(`Supabase fetch error: ${res.status}`);
  return await res.json();
}

async function fetchLiveBarcodes(supabaseUrl, anonKey) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/beavy_product_barcodes?select=product_id,barcode,barcode_type,retailer_id&limit=5000`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const retailerSlug = getArg(args, '--retailer');
  const inputFile = getArg(args, '--input');
  if (!retailerSlug || !inputFile) {
    console.log(
      'Utilizare:\n  node scripts/retailer-feed-pipeline.mjs --retailer <slug> --input <feed.json|csv> [--city București] [--channel delivery] [--full-feed] [--catalog-fixture path.json] [--dry-run]'
    );
    return;
  }

  const city = getArg(args, '--city', 'București');
  const channel = getArg(args, '--channel', 'delivery');
  const fullFeed = args.includes('--full-feed');
  const dryRun = args.includes('--dry-run');
  const fixturePath = getArg(args, '--catalog-fixture');

  const rawText = await fs.readFile(path.resolve(ROOT_DIR, inputFile), 'utf8');
  const feedRows = inputFile.toLowerCase().endsWith('.csv')
    ? parseCsv(rawText)
    : JSON.parse(rawText);

  let canonicalProducts = [];
  let extraBarcodes = [];
  if (fixturePath) {
    canonicalProducts = JSON.parse(await fs.readFile(path.resolve(ROOT_DIR, fixturePath), 'utf8'));
  } else {
    const env = await loadEnv(ROOT_DIR);
    canonicalProducts = await fetchLiveCanonicalCatalog(
      env.EXPO_PUBLIC_SUPABASE_URL,
      env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
    extraBarcodes = await fetchLiveBarcodes(
      env.EXPO_PUBLIC_SUPABASE_URL,
      env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
  }

  const productsById = new Map(canonicalProducts.map((p) => [p.id, p]));
  const barcodeIndex = new Map();
  for (const prod of canonicalProducts) {
    if (prod.barcode) {
      barcodeIndex.set(String(prod.barcode).trim(), prod);
    }
  }
  for (const row of extraBarcodes) {
    if (!row.retailer_id && row.barcode && productsById.has(row.product_id)) {
      barcodeIndex.set(String(row.barcode).trim(), productsById.get(row.product_id));
    }
  }

  const processed = processRetailerFeed({
    feedRows,
    retailerSlug,
    city,
    channel,
    fullFeed,
    canonicalProducts,
    barcodeIndex,
  });

  console.log('\n=== REZULTAT INGESTIE FEED RETAILER ===');
  console.log(JSON.stringify(processed.summary, null, 2));

  if (!dryRun) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const outReport = path.join(OUTPUT_DIR, `ingest-${retailerSlug}-report.json`);
    const outSql = path.join(OUTPUT_DIR, `ingest-${retailerSlug}.sql`);
    await fs.writeFile(outReport, JSON.stringify(processed, null, 2), 'utf8');
    await fs.writeFile(outSql, buildIngestionSql(processed), 'utf8');
    console.log(`\nRaport: ${outReport}\nSQL atomic generat: ${outSql}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
