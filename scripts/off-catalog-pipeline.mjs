#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  brandMatches,
  isValidEanCheckDigit,
  loadEnv,
  normalizeText,
  scoreCanonicalCandidate,
  sqlLiteral,
  tokenize,
} from './lib/catalog-normalization.mjs';

const ROOT_DIR = process.cwd();
const CACHE_DIR = path.join(ROOT_DIR, 'scripts', '.cache');
const OUTPUT_DIR = path.join(ROOT_DIR, 'scripts', 'output');
const OFF_USER_AGENT = 'BeavyCatalogPipeline/1.0 (https://beavy.ro; contact@beavy.ro)';

const SLEEP_MS = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJsonCache(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function fetchJsonWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': OFF_USER_AGENT,
          Accept: 'application/json',
        },
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          await SLEEP_MS(1000 * (attempt + 1));
          continue;
        }
        return null;
      }
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        if (attempt < retries) {
          await SLEEP_MS(1100 * (attempt + 1));
          continue;
        }
        return null;
      }
      return await res.json();
    } catch {
      if (attempt < retries) {
        await SLEEP_MS(800 * (attempt + 1));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function fetchOffProductV2(ean, v2Cache) {
  const code = String(ean ?? '').trim();
  if (!code) return null;
  if (Object.hasOwn(v2Cache, code)) {
    return v2Cache[code];
  }
  const fields =
    'code,product_name,product_name_ro,generic_name,abbreviated_product_name,brands,quantity,packaging,categories,labels,labels_tags,ingredients_text,nutriments,image_front_url,image_url,countries_tags';
  const data = await fetchJsonWithRetry(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`
  );
  await SLEEP_MS(420);
  const product = data?.status === 1 && data.product ? data.product : null;
  v2Cache[code] = product;
  return product;
}

async function checkImageUrlLive(url, imgCache) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  if (Object.hasOwn(imgCache, url)) return imgCache[url];
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': OFF_USER_AGENT },
    });
    const ct = res.headers.get('content-type') || '';
    const ok = res.ok && ct.startsWith('image/');
    imgCache[url] = ok;
    return ok;
  } catch {
    imgCache[url] = false;
    return false;
  }
}

// Shared canonical normalization, GS1 check, and scoring live in ./lib/catalog-normalization.mjs
function scoreCandidate(beavyProduct, offHit) {
  return scoreCanonicalCandidate(beavyProduct, offHit);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReviewHtml(report) {
  const allRows = [
    ...report.tier1_exact_barcode,
    ...report.tier2_auto_safe,
    ...report.tier3_needs_review,
  ];
  const serializedRows = JSON.stringify(allRows).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <title>Beavy · Review Catalog Canonic Open Food Facts</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #FFF6EE; color: #421726; margin: 0; padding: 24px; }
    .wrap { max-width: 1120px; margin: 0 auto; }
    header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; border-bottom: 1px solid #EFE2D8; padding-bottom: 16px; }
    h1 { margin: 0; font-size: 24px; }
    .stats { display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0 18px; }
    .pill { background: #FFFFFF; border: 1px solid #EFE2D8; border-radius: 999px; padding: 6px 12px; font-size: 13px; font-weight: 700; }
    .pill.t1 { background: #DBE3C6; }
    .pill.t2 { background: #FCE2DB; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
    button { border: 0; border-radius: 999px; padding: 10px 16px; font-weight: 700; cursor: pointer; font-size: 13px; }
    .btn-primary { background: #421726; color: #FFF6EE; }
    .btn-secondary { background: #FFFFFF; color: #421726; border: 1px solid #EFE2D8; }
    .card { display: grid; grid-template-columns: 1fr 110px 1fr 160px; gap: 16px; align-items: center; background: #FFFFFF; border: 1px solid #EFE2D8; border-radius: 16px; padding: 14px; margin-bottom: 12px; }
    .card.rejected { opacity: 0.45; }
    .card.approved { border-color: #3A542A; background: #FCFDF9; }
    .thumb { width: 100px; height: 100px; object-fit: contain; background: #FFF6EE; border-radius: 10px; border: 1px solid #EFE2D8; padding: 6px; }
    .meta { font-size: 12px; color: #765B60; margin-top: 4px; }
    .reasons { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
    .reason { background: #FFF6EE; border: 1px solid #EFE2D8; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
    .actions { display: flex; flex-direction: column; gap: 8px; }
    .btn-approve { background: #DBE3C6; color: #421726; }
    .btn-reject { background: #FCE2DB; color: #421726; }
    @media (max-width: 780px) { .card { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>Beavy · Verificare Imagini & Barcode Open Food Facts</h1>
        <div class="meta">Generat la ${escapeHtml(report.generatedAt)} · Total active fără foto: ${report.summary.totalTargets}</div>
      </div>
      <div class="toolbar">
        <button class="btn-secondary" onclick="approveTier('tier1_exact_barcode')">Aprobă Tier 1 (Barcode exact)</button>
        <button class="btn-secondary" onclick="approveTier('tier2_auto_safe')">Aprobă și Tier 2 (Scor ≥ 86%)</button>
        <button class="btn-primary" onclick="exportApproved()">Descarcă approved-off-matches.json</button>
      </div>
    </header>
    <div class="stats">
      <div class="pill t1">Tier 1 Barcode exact: ${report.tier1_exact_barcode.length}</div>
      <div class="pill t2">Tier 2 Siguranță mare: ${report.tier2_auto_safe.length}</div>
      <div class="pill">Tier 3 Necesită verificare: ${report.tier3_needs_review.length}</div>
      <div class="pill">Nepotrivite / fără OFF: ${report.unmatched.length}</div>
      <div class="pill">Vrac fără brand (omise): ${report.skipped_unbranded.length}</div>
    </div>
    <div id="list"></div>
  </div>
  <script>
    const ROWS = ${serializedRows};
    const decisions = {};
    for (const r of ROWS) {
      decisions[r.product_id] = r.tier === 'tier1_exact_barcode' ? 'approved' : 'pending';
    }
    function esc(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function render() {
      const root = document.getElementById('list');
      root.innerHTML = ROWS.map((r, idx) => {
        const st = decisions[r.product_id];
        return '<div class="card ' + st + '">' +
          '<div><strong>' + esc(r.beavy_name) + '</strong>' +
          '<div class="meta">' + esc(r.beavy_brand) + ' · ' + esc(r.beavy_package_size || '—') + ' · Tier: ' + esc(r.tier) + '</div>' +
          (r.beavy_existing_barcode ? '<div class="meta">EAN existent: <code>' + esc(r.beavy_existing_barcode) + '</code></div>' : '') +
          '</div>' +
          '<img class="thumb" src="' + esc(r.image_url) + '" alt="" loading="lazy" />' +
          '<div><strong>' + esc(r.off_product_name) + '</strong>' +
          '<div class="meta">Brand OFF: ' + esc(r.off_brands) + ' · Gramaj: ' + esc(r.off_quantity || '—') + ' · EAN: <a target="_blank" href="' + esc(r.off_url) + '"><code>' + esc(r.barcode) + '</code></a> · Scor: <strong>' + Math.round(r.confidence * 100) + '%</strong></div>' +
          '<div class="reasons">' + (r.reasons || []).map(x => '<span class="reason">' + esc(x) + '</span>').join('') + '</div>' +
          '</div>' +
          '<div class="actions">' +
          '<button class="btn-approve" onclick="setStatus(' + idx + ', \\'approved\\')">' + (st === 'approved' ? '✓ Aprobat' : 'Aprobă') + '</button>' +
          '<button class="btn-reject" onclick="setStatus(' + idx + ', \\'rejected\\')">' + (st === 'rejected' ? '✕ Respins' : 'Respinge') + '</button>' +
          '</div>' +
          '</div>';
      }).join('');
    }
    window.setStatus = (idx, status) => { decisions[ROWS[idx].product_id] = status; render(); };
    window.approveTier = (tier) => {
      for (const r of ROWS) if (r.tier === tier) decisions[r.product_id] = 'approved';
      render();
    };
    window.exportApproved = () => {
      const approved = ROWS.filter(r => decisions[r.product_id] === 'approved');
      const blob = new Blob([JSON.stringify(approved, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'approved-off-matches.json';
      a.click();
    };
    render();
  </script>
</body>
</html>`;
}

async function fetchAllActiveBeavyProducts(supabaseUrl, anonKey) {
  const url = `${supabaseUrl}/rest/v1/beavy_products?select=id,canonical_name,brand,package_size,quantity_value,quantity_unit,category,subcategory,barcode,image_url,attributes&is_active=eq.true&order=canonical_name.asc`;
  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function discoverCommand() {
  const env = await loadEnv(ROOT_DIR);
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Lipsesc EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY în .env');
  }

  console.log('1. Încărcăm produsele active din Supabase...');
  const allProducts = await fetchAllActiveBeavyProducts(supabaseUrl, anonKey);
  const existingBarcodes = new Set(
    allProducts.map((p) => (p.barcode ? String(p.barcode).trim() : null)).filter(Boolean)
  );

  const targets = allProducts.filter((p) => !p.image_url || !String(p.image_url).trim());
  console.log(`   Total active: ${allProducts.length} | Fără imagine: ${targets.length}`);

  const brandIndexCachePath = path.join(CACHE_DIR, 'off-brand-index.json');
  const v2ProductCachePath = path.join(CACHE_DIR, 'off-products-v2.json');
  const imgCachePath = path.join(CACHE_DIR, 'off-img-checks.json');
  const brandIndexCache = await readJsonCache(brandIndexCachePath, {});
  const v2ProductCache = await readJsonCache(v2ProductCachePath, {});
  const imgCache = await readJsonCache(imgCachePath, {});

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalActive: allProducts.length,
      totalTargets: targets.length,
    },
    tier1_exact_barcode: [],
    tier2_auto_safe: [],
    tier3_needs_review: [],
    unmatched: [],
    skipped_unbranded: [],
  };

  // Pass 1: Exact barcode lookups
  const withBarcode = targets.filter((p) => Boolean(p.barcode));
  console.log(`2. Verificăm ${withBarcode.length} produse cu barcode existent în OFF...`);

  for (const prod of withBarcode) {
    const ean = String(prod.barcode).trim();
    const p = await fetchOffProductV2(ean, v2ProductCache);
    const imgUrl = p?.image_front_url || p?.image_url || null;
    const liveOk = imgUrl ? await checkImageUrlLive(imgUrl, imgCache) : false;

    if (p && liveOk && (!prod.brand || brandMatches(prod.brand, p.brands || p.product_name))) {
      report.tier1_exact_barcode.push({
        tier: 'tier1_exact_barcode',
        product_id: prod.id,
        beavy_name: prod.canonical_name,
        beavy_brand: prod.brand,
        beavy_package_size: prod.package_size,
        beavy_existing_barcode: ean,
        barcode: ean,
        off_product_name: p.product_name_ro || p.product_name || '',
        off_brands: p.brands || '',
        off_quantity: p.quantity || '',
        image_url: imgUrl,
        off_url: `https://ro.openfoodfacts.org/product/${ean}`,
        confidence: 1.0,
        reasons: ['+ Potrivire exactă pe cod EAN existent', '+ Brand & imagine verificate HTTP 200'],
      });
    } else {
      report.unmatched.push({
        product_id: prod.id,
        beavy_name: prod.canonical_name,
        beavy_brand: prod.brand,
        barcode: ean,
        reason: p ? 'Imagine lipsă/invalidă sau neconcordanță brand pe EAN' : 'EAN negăsit în OFF',
      });
    }
  }

  // Pass 2: Group remaining targets by brand
  const needSearch = targets.filter((p) => !p.barcode);
  const byBrand = new Map();
  for (const prod of needSearch) {
    if (!prod.brand) {
      report.skipped_unbranded.push({
        product_id: prod.id,
        beavy_name: prod.canonical_name,
        category: prod.category,
      });
      continue;
    }
    const normBrand = normalizeText(prod.brand);
    const list = byBrand.get(normBrand) ?? [];
    list.push(prod);
    byBrand.set(normBrand, list);
  }

  console.log(`3. Căutăm în Open Food Facts pentru ${byBrand.size} branduri (${needSearch.length - report.skipped_unbranded.length} produse)...`);

  let brandIdx = 0;
  for (const [normBrand, brandProducts] of byBrand.entries()) {
    brandIdx++;
    const displayBrand = brandProducts[0].brand;
    const cacheKey = `v2:${normBrand}`;
    if (!brandIndexCache[cacheKey]) {
      const qRo = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(normBrand)}&countries_tags=en:romania&page_size=60&fields=code,product_name,product_name_ro,brands,quantity,categories,image_front_url,image_url`;
      const roRes = await fetchJsonWithRetry(qRo);
      await SLEEP_MS(280);

      let hits = Array.isArray(roRes?.hits) ? roRes.hits : [];
      if (hits.length === 0) {
        const qGlobal = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(normBrand)}&page_size=50&fields=code,product_name,product_name_ro,brands,quantity,categories,image_front_url,image_url`;
        const globalRes = await fetchJsonWithRetry(qGlobal);
        await SLEEP_MS(280);
        hits = Array.isArray(globalRes?.hits) ? globalRes.hits : [];
      }
      brandIndexCache[cacheKey] = hits;
      process.stdout.write(`   [${brandIdx}/${byBrand.size}] ${displayBrand}: ${hits.length} rezultate OFF\n`);
    }

    const baseHits = brandIndexCache[cacheKey] || [];
    for (const prod of brandProducts) {
      const scorePool = (pool) => {
        const list = [];
        for (const hit of pool) {
          const res = scoreCandidate(prod, hit);
          if (res.confidence > 0.4) {
            list.push({ hit, ...res });
          }
        }
        list.sort((a, b) => b.confidence - a.confidence);
        return list;
      };

      let scored = scorePool(baseHits);

      // Pass 2 targeted search when brand hits saturated (>=55) or missed high-confidence match
      const topScore = scored[0]?.confidence ?? 0;
      if (topScore < 0.85 && (baseHits.length >= 50 || baseHits.length === 0)) {
        const brandTokSet = new Set(tokenize(prod.brand));
        const prodTokens = tokenize(prod.canonical_name).filter(
          (t) => !brandTokSet.has(t) && !/^\d/.test(t)
        );
        const searchTerm = prodTokens.slice(0, 2).join(' ');
        if (searchTerm) {
          const targetKey = `v2q:${normBrand}:${searchTerm}`;
          if (!brandIndexCache[targetKey]) {
            const qStr = `${normBrand} ${searchTerm}`;
            const tRo = await fetchJsonWithRetry(
              `https://search.openfoodfacts.org/search?q=${encodeURIComponent(qStr)}&countries_tags=en:romania&page_size=25&fields=code,product_name,product_name_ro,brands,quantity,categories,image_front_url,image_url`
            );
            await SLEEP_MS(240);
            let tHits = Array.isArray(tRo?.hits) ? tRo.hits : [];
            if (tHits.length === 0) {
              const tGl = await fetchJsonWithRetry(
                `https://search.openfoodfacts.org/search?q=${encodeURIComponent(qStr)}&page_size=25&fields=code,product_name,product_name_ro,brands,quantity,categories,image_front_url,image_url`
              );
              await SLEEP_MS(240);
              tHits = Array.isArray(tGl?.hits) ? tGl.hits : [];
            }
            brandIndexCache[targetKey] = tHits;
          }
          const combined = new Map();
          for (const h of [...baseHits, ...(brandIndexCache[targetKey] || [])]) {
            if (h?.code) combined.set(String(h.code), h);
          }
          scored = scorePool([...combined.values()]);
        }
      }

      // Stage B: Verify top shortlisted candidates against authoritative OFF v2 product API (with nutrition, labels_tags, product_name_ro)
      const verifiedPool = [];
      for (const cand of scored.slice(0, 5)) {
        const candCode = String(cand.hit.code).trim();
        if (existingBarcodes.has(candCode)) continue;

        const v2Prod = await fetchOffProductV2(candCode, v2ProductCache);
        const mergedHit = v2Prod ? { ...cand.hit, ...v2Prod, code: candCode } : cand.hit;
        const verifiedRes = scoreCandidate(prod, mergedHit);
        if (verifiedRes.confidence < 0.62) continue;

        const imgUrl = mergedHit.image_front_url || mergedHit.image_url;
        const liveOk = await checkImageUrlLive(imgUrl, imgCache);
        if (!liveOk) continue;

        verifiedPool.push({ hit: mergedHit, ...verifiedRes });
      }
      verifiedPool.sort((a, b) => b.confidence - a.confidence);
      const chosen = verifiedPool[0] ?? null;
      const runnerUp = verifiedPool[1] ?? null;

      if (!chosen || chosen.confidence < 0.62) {
        report.unmatched.push({
          product_id: prod.id,
          beavy_name: prod.canonical_name,
          beavy_brand: prod.brand,
          beavy_package_size: prod.package_size,
          reason: scored[0]
            ? `Cel mai apropiat scor (${Math.round(scored[0].confidence * 100)}%) respins/sub prag: ${scored[0].reasons.join(', ')}`
            : 'Niciun candidat compatibil găsit în OFF',
        });
        continue;
      }

      const margin = runnerUp ? chosen.confidence - runnerUp.confidence : 0.25;
      const isTier2 =
        chosen.confidence >= 0.86 &&
        chosen.validEan &&
        chosen.quantityExact &&
        margin >= 0.08;

      const ean = String(chosen.hit.code).trim();
      existingBarcodes.add(ean);
      const entry = {
        tier: isTier2 ? 'tier2_auto_safe' : 'tier3_needs_review',
        product_id: prod.id,
        beavy_name: prod.canonical_name,
        beavy_brand: prod.brand,
        beavy_package_size: prod.package_size,
        beavy_existing_barcode: null,
        barcode: ean,
        off_product_name: chosen.hit.product_name_ro || chosen.hit.product_name || chosen.hit.generic_name || '',
        off_brands: Array.isArray(chosen.hit.brands)
          ? chosen.hit.brands.join(', ')
          : String(chosen.hit.brands || ''),
        off_quantity: chosen.hit.quantity || '',
        off_fat_100g: chosen.hit.nutriments?.fat_100g ?? null,
        image_url: chosen.hit.image_front_url || chosen.hit.image_url,
        off_url: `https://ro.openfoodfacts.org/product/${ean}`,
        confidence: chosen.confidence,
        runner_up_confidence: runnerUp ? runnerUp.confidence : null,
        reasons: chosen.reasons,
      };

      if (isTier2) {
        report.tier2_auto_safe.push(entry);
      } else {
        report.tier3_needs_review.push(entry);
      }
    }
  }

  await writeJson(brandIndexCachePath, brandIndexCache);
  await writeJson(v2ProductCachePath, v2ProductCache);
  await writeJson(imgCachePath, imgCache);

  const candidatesPath = path.join(OUTPUT_DIR, 'off-candidates.json');
  const htmlPath = path.join(OUTPUT_DIR, 'off-review.html');
  await writeJson(candidatesPath, report);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(htmlPath, buildReviewHtml(report), 'utf8');

  console.log('\n=== REZULTAT DISCOVERY OPEN FOOD FACTS ===');
  console.log(`Tier 1 (Barcode existent verificat): ${report.tier1_exact_barcode.length}`);
  console.log(`Tier 2 (Siguranță mare >=86% + gramaj & EAN valide): ${report.tier2_auto_safe.length}`);
  console.log(`Tier 3 (Necesită confirmare vizuală): ${report.tier3_needs_review.length}`);
  console.log(`Fără candidat sigur în OFF: ${report.unmatched.length}`);
  console.log(`Vrac fără brand (omise): ${report.skipped_unbranded.length}`);
  console.log(`\nRaport vizual generat: ${htmlPath}`);
  console.log(`Candidați JSON: ${candidatesPath}`);
}

async function promoteCommand(args) {
  const inputIdx = args.indexOf('--input');
  const inputPath =
    inputIdx !== -1 && args[inputIdx + 1]
      ? path.resolve(ROOT_DIR, args[inputIdx + 1])
      : path.join(OUTPUT_DIR, 'approved-off-matches.json');

  const raw = await fs.readFile(inputPath, 'utf8');
  const approved = JSON.parse(raw);
  if (!Array.isArray(approved) || approved.length === 0) {
    throw new Error(`Fișierul ${inputPath} nu conține potriviri aprobate.`);
  }

  const seenBarcodes = new Set();
  const safeRows = [];
  for (const row of approved) {
    if (!row.product_id || !row.image_url) continue;
    const ean = row.barcode ? String(row.barcode).trim() : null;
    if (ean && seenBarcodes.has(ean)) continue;
    if (ean) seenBarcodes.add(ean);
    safeRows.push(row);
  }

  const payload = safeRows.map((r) => {
    const ean = r.barcode ? String(r.barcode).trim() : null;
    const validBarcode = Boolean(ean && isValidEanCheckDigit(ean));
    const sourceUrl = r.off_url || (ean ? `https://ro.openfoodfacts.org/product/${ean}` : null);
    return {
      product_id: r.product_id,
      image_url: r.image_url,
      barcode: validBarcode ? ean : null,
      source_url: sourceUrl,
      off_product_name: r.off_product_name || '',
      confidence: r.confidence ?? 1,
      tier: r.tier || 'manual_review',
      reasons: Array.isArray(r.reasons) ? r.reasons : [],
    };
  });

  const sql = [
    '-- Auto-generated verified Open Food Facts canonical catalog promotion',
    `-- Rows: ${payload.length} | Source: ${path.basename(inputPath)}`,
    'do $promote$',
    'declare',
    '  v_run_id uuid;',
    `  v_rows jsonb := ${sqlLiteral(JSON.stringify(payload))}::jsonb;`,
    '  r jsonb;',
    '  v_pid uuid;',
    '  v_img text;',
    '  v_ean text;',
    '  v_url text;',
    'begin',
    '  insert into public.beavy_product_enrichment_runs (source, mode, status, input_count, matched_count, metadata, finished_at)',
    `  values ('open_food_facts', 'commit', 'success', ${payload.length}, ${payload.length}, ${sqlLiteral(JSON.stringify({ input: path.basename(inputPath) }))}::jsonb, now())`,
    '  returning id into v_run_id;',
    '',
    '  for r in select * from jsonb_array_elements(v_rows) loop',
    "    v_pid := (r->>'product_id')::uuid;",
    "    v_img := r->>'image_url';",
    "    v_ean := nullif(btrim(r->>'barcode'), '');",
    "    v_url := r->>'source_url';",
    '',
    '    update public.beavy_products set',
    "      image_url = coalesce(nullif(btrim(image_url), ''), v_img),",
    "      image_source = coalesce(image_source, 'Open Food Facts'),",
    "      image_license = coalesce(image_license, 'CC-BY-SA-3.0 / ODbL'),",
    "      image_attribution = coalesce(image_attribution, 'Open Food Facts contributors'),",
    '      image_source_url = coalesce(image_source_url, v_url),',
    "      barcode_source = case when v_ean is not null and barcode is null and not exists (select 1 from public.beavy_products x where x.barcode = v_ean) then 'Open Food Facts' else barcode_source end,",
    '      barcode_source_url = case when v_ean is not null and barcode is null and not exists (select 1 from public.beavy_products x where x.barcode = v_ean) then v_url else barcode_source_url end,',
    '      barcode = case when v_ean is not null and barcode is null and not exists (select 1 from public.beavy_products x where x.barcode = v_ean) then v_ean else barcode end,',
    '      updated_at = now()',
    '    where id = v_pid;',
    '',
    '    insert into public.beavy_product_field_provenance (product_id, field_name, source, source_url, license, attribution, observed_value)',
    "    select v_pid, 'image_url', 'Open Food Facts', v_url, 'CC-BY-SA-3.0 / ODbL', 'Open Food Facts contributors',",
    "      jsonb_build_object('image_url', v_img, 'off_product_name', r->>'off_product_name', 'confidence', r->'confidence')",
    "    where not exists (select 1 from public.beavy_product_field_provenance fp where fp.product_id = v_pid and fp.field_name = 'image_url' and fp.source = 'Open Food Facts' and fp.source_record_id is null);",
    '',
    '    if v_ean is not null then',
    '      insert into public.beavy_product_field_provenance (product_id, field_name, source, source_url, license, attribution, observed_value)',
    "      select v_pid, 'barcode', 'Open Food Facts', v_url, 'ODbL-1.0', 'Open Food Facts contributors',",
    "        jsonb_build_object('barcode', v_ean, 'off_product_name', r->>'off_product_name', 'confidence', r->'confidence')",
    "      where not exists (select 1 from public.beavy_product_field_provenance fp where fp.product_id = v_pid and fp.field_name = 'barcode' and fp.source = 'Open Food Facts' and fp.source_record_id is null)",
    "        and exists (select 1 from public.beavy_products p where p.id = v_pid and p.barcode = v_ean and p.barcode_source = 'Open Food Facts');",
    '    end if;',
    '',
    '    insert into public.beavy_product_enrichment_audit (run_id, product_id, action, details)',
    "    values (v_run_id, v_pid, 'off_match_promoted', jsonb_build_object('tier', r->>'tier', 'barcode', v_ean, 'confidence', r->'confidence', 'reasons', r->'reasons'));",
    '  end loop;',
    'end $promote$;',
  ].join('\n');

  const outSql = path.join(OUTPUT_DIR, 'promote-off-matches.sql');
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(outSql, sql, 'utf8');
  console.log(`SQL generat (${payload.length} produse aprobate): ${outSql}`);
}

const [, , cmd, ...rest] = process.argv;
if (cmd === 'discover') {
  discoverCommand().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (cmd === 'promote') {
  promoteCommand(rest).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.log('Utilizare:\n  node scripts/off-catalog-pipeline.mjs discover\n  node scripts/off-catalog-pipeline.mjs promote [--input scripts/output/approved-off-matches.json]');
}
