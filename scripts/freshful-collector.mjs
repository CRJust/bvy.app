#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

import {
  deduplicateFreshfulItems,
  extractFreshfulRecord,
} from './lib/canonical-catalog.mjs';

const FRESHFUL_ORIGIN = 'https://www.freshful.ro';
const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'output');

function getArg(args, name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return fallback;
}

/**
 * Găsește executabilul Chromium/Brave/Chrome disponibil local dacă binarul Playwright nu e descărcat.
 */
export function resolveBrowserExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  try {
    const bundled = chromium.executablePath();
    if (bundled && fsSync.existsSync(bundled)) {
      return undefined;
    }
  } catch {
    // fallback către browser-ul instalat în sistem
  }

  const candidates = [
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ];
  for (const bin of candidates) {
    if (fsSync.existsSync(bin)) return bin;
  }
  return undefined;
}

/**
 * Caută calea completă (`/c/...`) a unui slug de categorie în arborele `categories` din `__NEXT_DATA__`.
 */
export function findCategoryPathInTree(tree, targetSlug) {
  const cleanTarget = targetSlug.replace(/^\/+|\/+$/g, '').toLowerCase();
  let found = null;

  function walk(nodes, chain = []) {
    if (found || !nodes) return;
    const list = Array.isArray(nodes) ? nodes : nodes.items || nodes.children || nodes.categories || [];
    for (const node of list) {
      if (!node || typeof node !== 'object') continue;
      const slug = String(node.slug ?? '').trim();
      const nextChain = slug ? [...chain, slug] : chain;
      if (slug.toLowerCase() === cleanTarget) {
        found = {
          path: `/c/${nextChain.join('/')}`,
          name: String(node.name ?? node.title ?? slug),
          slug,
          breadcrumbs: nextChain,
        };
        return;
      }
      walk(node.children || node.subcategories, nextChain);
    }
  }

  walk(tree);
  return found;
}

async function readNextDataQueries(page) {
  return page.evaluate(() => {
    const script = document.querySelector('#__NEXT_DATA__');
    if (!script?.textContent) return null;
    try {
      const parsed = JSON.parse(script.textContent);
      return parsed?.props?.pageProps?.dehydratedState?.queries ?? null;
    } catch {
      return null;
    }
  });
}

/**
 * Extrage lista tuturor categoriilor de nivel 2 (`depth = 2`) din arborele `categories` Freshful.
 */
export function extractDepth2Categories(tree) {
  const roots = Array.isArray(tree) ? tree : tree?.payload || tree?.items || tree?.children || [];
  const d2List = [];
  for (const d1 of roots) {
    if (!d1?.slug) continue;
    for (const d2 of d1.children || d1.subcategories || []) {
      if (!d2?.slug) continue;
      d2List.push({
        d1Slug: d1.slug,
        d1Name: String(d1.name ?? d1.title ?? d1.slug),
        slug: d2.slug,
        name: String(d2.name ?? d2.title ?? d2.slug),
        path: `/c/${d1.slug}/${d2.slug}`,
      });
    }
  }
  return d2List;
}

async function dismissCookieBanner(page, waitMs = 0) {
  const cookieBtn = page
    .locator('.ReactModalPortal button')
    .filter({ hasText: /Refuză toate|Doar esențiale|Acceptă toate/i })
    .first();
  if (waitMs > 0) {
    await cookieBtn.waitFor({ state: 'visible', timeout: waitMs }).catch(() => {});
  }
  if (await cookieBtn.count().catch(() => 0)) {
    await cookieBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(350);
    return true;
  }
  const closeBtn = page
    .locator(
      '.ReactModalPortal button[aria-label*="close" i], .ReactModalPortal button[aria-label*="inchide" i], .ReactModalPortal button:has-text("Închide"), .ReactModalPortal button:has-text("Nu acum")'
    )
    .first();
  if (await closeBtn.count().catch(() => 0)) {
    await closeBtn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(250);
    return true;
  }
  return false;
}

async function assertNoChallengeGate(page, lastStatus) {
  if (lastStatus === 403 || lastStatus === 429) {
    throw new Error(`Acces blocat de server (HTTP ${lastStatus}). Oprire imediată fără retry agresiv.`);
  }
  const hasChallenge = await page.evaluate(() => {
    const txt = (document.body?.innerText || '').toLowerCase();
    const title = (document.title || '').toLowerCase();
    const hasTurnstile = Boolean(
      document.querySelector(
        'iframe[src*="challenges.cloudflare.com"], iframe[src*="captcha"], .cf-turnstile, .g-recaptcha'
      )
    );
    return (
      hasTurnstile ||
      title.includes('just a moment') ||
      txt.includes('verify you are human') ||
      txt.includes('checking your browser')
    );
  });
  if (hasChallenge) {
    throw new Error(
      'Detectată barieră anti-bot / CAPTCHA pe Freshful. Colectorul s-a oprit respectând restricțiile.'
    );
  }
}

function createCategorySessionTracker(page) {
  const capturedApiPages = new Map();
  const pendingParses = [];
  const state = {
    activeSlug: null,
    blockedStatus: null,
    cookieDismissed: false,
  };

  function recordCategoryPayload(json, sourceTag) {
    const payload =
      json?.payload ??
      json?.pageProps?.dehydratedState?.queries?.find(
        (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'category'
      )?.state?.data?.payload;

    if (!payload || !Array.isArray(payload.items)) return;
    if (state.activeSlug && payload.slug && payload.slug !== state.activeSlug) return;

    const pageNo = Number(payload.page || 1);
    capturedApiPages.set(pageNo, {
      page: pageNo,
      pages: Number(payload.pages || 1),
      total: Number(payload.total || payload.items.length),
      name: payload.name || null,
      slug: payload.slug || null,
      breadcrumbs: payload.breadcrumbs || [],
      items: payload.items,
      source: sourceTag,
    });
  }

  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('freshful.ro')) return;

    if (res.status() === 403 || res.status() === 429) {
      state.blockedStatus = res.status();
      return;
    }

    if (
      (url.includes('/api/v2/shop/categories/') || (url.includes('/_next/data/') && url.includes('/c/'))) &&
      res.status() === 200
    ) {
      if (state.activeSlug && !url.includes(state.activeSlug)) return;
      pendingParses.push(
        res
          .json()
          .then((json) => recordCategoryPayload(json, url.includes('/api/v2/') ? 'xhr_response' : 'next_data_route'))
          .catch(() => {})
      );
    }
  });

  return {
    capturedApiPages,
    pendingParses,
    state,
    recordCategoryPayload,
    resetForSlug(slug) {
      capturedApiPages.clear();
      pendingParses.length = 0;
      state.activeSlug = slug;
      state.blockedStatus = null;
    },
  };
}

async function scrapeCategoryWithSession({
  page,
  tracker,
  targetUrl,
  resolvedSlug,
  resolvedName = null,
  categoryInput = resolvedSlug,
  maxPages = 100,
  maxProducts = 0,
  delayMs = 700,
  executablePath = undefined,
  allowEmptyCategory = false,
}) {
  const startedAt = Date.now();
  const observedAt = new Date().toISOString();
  tracker.resetForSlug(resolvedSlug);

  console.log(`→ Navighez cu Playwright la: ${targetUrl}`);
  const navRes = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await assertNoChallengeGate(page, tracker.state.blockedStatus ?? navRes?.status());

  if (await dismissCookieBanner(page, tracker.state.cookieDismissed ? 0 : 2500)) {
    tracker.state.cookieDismissed = true;
  }
  await Promise.allSettled(tracker.pendingParses.splice(0, tracker.pendingParses.length));

  if (!tracker.capturedApiPages.has(1)) {
    const queries = await readNextDataQueries(page);
    const catQuery = queries?.find((q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'category');
    const data = catQuery?.state?.data;
    if (data?.type === 'subcategory' && data?.payload?.items) {
      const p = data.payload;
      tracker.capturedApiPages.set(1, {
        page: Number(p.page || 1),
        pages: Number(p.pages || 1),
        total: Number(p.total || p.items.length),
        name: p.name || resolvedName,
        slug: p.slug || resolvedSlug,
        breadcrumbs: p.breadcrumbs || [],
        items: p.items,
        source: 'next_data_hydration',
      });
    }
  }

  // Dacă nici după domcontentloaded n-a prins XHR-ul client-side, așteaptă scurt hidratarea
  if (!tracker.capturedApiPages.has(1)) {
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await Promise.allSettled(tracker.pendingParses.splice(0, tracker.pendingParses.length));
  }

  const firstPageData = tracker.capturedApiPages.get(1);
  if (!firstPageData) {
    if (allowEmptyCategory) {
      return {
        collector: {
          retailer: 'freshful',
          categoryInput,
          categorySlug: resolvedSlug,
          categoryName: resolvedName || resolvedSlug,
          categoryUrl: targetUrl,
          advertisedTotal: 0,
          totalPagesAvailable: 0,
          pagesVisited: 0,
          domProductLinksPage1: 0,
          maxProductsCap: maxProducts,
          elapsedMs: Date.now() - startedAt,
          observedAt,
        },
        dedupeStats: { rawInputCount: 0, afterSkuDedupeCount: 0, tier1DuplicatesRemoved: 0, afterCanonicalDedupeCount: 0, tier2CanonicalMerges: 0 },
        tier1Duplicates: [],
        tier2Merges: [],
        rawItemsCount: 0,
        rawItems: [],
        dedupedItems: [],
      };
    }
    throw new Error(
      `Pagina ${targetUrl} nu a returnat un listing de subcategorie paginat. Folosește un slug de subcategorie frunză (ex: 401-lapte-smantana-si-branza-proaspata sau 501-mezeluri).`
    );
  }

  const totalPages = Math.min(firstPageData.pages, maxPages);
  const categoryName = firstPageData.name || resolvedName || resolvedSlug;
  console.log(
    `✓ [${resolvedSlug}] Pagina 1/${firstPageData.pages} (${firstPageData.items.length} carduri, total raportat: ${firstPageData.total})`
  );

  const domLinksP1 = await page.locator('a[href^="/p/"]').count();

  let currentCollected = firstPageData.items.length;
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    if (maxProducts > 0 && currentCollected >= maxProducts) {
      console.log(`→ Oprire la limita de test (${maxProducts} produse atinsă).`);
      break;
    }

    await page.waitForTimeout(delayMs);

    const pageLocator = page
      .locator(`a[aria-label="Page ${pageNo}"], button[aria-label="Page ${pageNo}"]`)
      .first();
    if (!(await pageLocator.count())) {
      console.log(`! [${resolvedSlug}] Controlul pentru pagina ${pageNo} nu este în DOM; oprire.`);
      break;
    }

    if (await dismissCookieBanner(page, 0)) {
      tracker.state.cookieDismissed = true;
    }
    await pageLocator.scrollIntoViewIfNeeded();
    await pageLocator.click();
    const deadline = Date.now() + 8000;
    while (
      !tracker.capturedApiPages.has(pageNo) &&
      tracker.state.blockedStatus == null &&
      Date.now() < deadline
    ) {
      if (tracker.pendingParses.length > 0) {
        await Promise.allSettled(tracker.pendingParses.splice(0, tracker.pendingParses.length));
        if (tracker.capturedApiPages.has(pageNo)) break;
      }
      await page.waitForTimeout(80);
    }
    await Promise.allSettled(tracker.pendingParses.splice(0, tracker.pendingParses.length));
    await assertNoChallengeGate(page, tracker.state.blockedStatus);

    const pData = tracker.capturedApiPages.get(pageNo);
    if (!pData) {
      console.log(`! [${resolvedSlug}] Nu s-a recepționat payload JSON pentru pagina ${pageNo}.`);
      break;
    }
    currentCollected += pData.items.length;
    console.log(`✓ [${resolvedSlug}] Pagina ${pageNo}/${firstPageData.pages} (${pData.items.length} carduri)`);
  }

  const rawExtracted = [];
  const sortedPages = Array.from(tracker.capturedApiPages.keys()).sort((a, b) => a - b);
  for (const pNo of sortedPages) {
    const pageEntry = tracker.capturedApiPages.get(pNo);
    for (const rawItem of pageEntry.items) {
      if (maxProducts > 0 && rawExtracted.length >= maxProducts) break;
      const normalized = extractFreshfulRecord(rawItem, {
        categoryName,
        categorySlug: pageEntry.slug || resolvedSlug,
        externalCategoryPath:
          pageEntry.breadcrumbs?.map((b) => b.name).join(' > ') || categoryName,
        page: pNo,
        observedAt,
        includePrices: false,
      });
      rawExtracted.push(normalized);
    }
  }

  const deduped = deduplicateFreshfulItems(rawExtracted);

  return {
    collector: {
      retailer: 'freshful',
      collectorEngine: executablePath
        ? `playwright (${path.basename(executablePath)})`
        : 'playwright-chromium',
      categoryInput,
      categorySlug: resolvedSlug,
      categoryName,
      categoryUrl: targetUrl,
      advertisedTotal: firstPageData.total,
      totalPagesAvailable: firstPageData.pages,
      pagesVisited: sortedPages.length,
      domProductLinksPage1: domLinksP1,
      maxProductsCap: maxProducts,
      elapsedMs: Date.now() - startedAt,
      observedAt,
    },
    dedupeStats: deduped.stats,
    tier1Duplicates: deduped.tier1Duplicates,
    tier2Merges: deduped.tier2Merges,
    rawItemsCount: rawExtracted.length,
    rawItems: rawExtracted,
    dedupedItems: deduped.items,
  };
}

/**
 * Rulează colectarea cu Playwright pe o categorie Freshful (cu paginare și extragere structurată).
 */
export async function collectFreshfulCategory({
  categoryInput = '401-lapte-smantana-si-branza-proaspata',
  maxPages = 10,
  maxProducts = 200,
  delayMs = 1100,
  headless = true,
}) {
  const executablePath = resolveBrowserExecutable();

  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const context = await browser.newContext({
    locale: 'ro-RO',
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const tracker = createCategorySessionTracker(page);

  try {
    let targetUrl;
    let resolvedSlug = categoryInput;
    let resolvedName = null;

    if (/^https?:\/\//i.test(categoryInput)) {
      targetUrl = categoryInput;
      resolvedSlug = categoryInput.split('/').filter(Boolean).pop() || 'custom';
    } else if (categoryInput.startsWith('/c/')) {
      targetUrl = `${FRESHFUL_ORIGIN}${categoryInput}`;
      resolvedSlug = categoryInput.split('/').filter(Boolean).pop() || 'custom';
    } else {
      console.log(`→ Rezolv calea categoriei „${categoryInput}” din Freshful...`);
      const homeRes = await page.goto(`${FRESHFUL_ORIGIN}/c/4-lactate-branzeturi-si-oua`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await assertNoChallengeGate(page, tracker.state.blockedStatus ?? homeRes?.status());
      const queries = await readNextDataQueries(page);
      const catQuery = queries?.find((q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'categories');
      const resolved = findCategoryPathInTree(catQuery?.state?.data, categoryInput);
      if (!resolved) {
        throw new Error(`Categoria „${categoryInput}” nu a fost găsită în arborele Freshful.`);
      }
      targetUrl = `${FRESHFUL_ORIGIN}${resolved.path}`;
      resolvedSlug = resolved.slug;
      resolvedName = resolved.name;
    }

    return await scrapeCategoryWithSession({
      page,
      tracker,
      targetUrl,
      resolvedSlug,
      resolvedName,
      categoryInput,
      maxPages,
      maxProducts,
      delayMs,
      executablePath,
    });
  } finally {
    await browser.close();
  }
}

/**
 * Colectează întregul catalog Freshful pe toate categoriile de nivel 2, cu salvare/resume per categorie
 * și deduplicare globală cross-categorie.
 */
export async function collectAllFreshfulCategories({
  outDir = path.join(OUTPUT_DIR, 'freshful-full'),
  delayMs = 550,
  categoryDelayMs = 350,
  maxCategories = 0,
  force = false,
  headless = true,
  inventoryPath = path.join(OUTPUT_DIR, 'freshful-category-inventory.json'),
} = {}) {
  const startedAt = Date.now();
  const catOutDir = path.join(outDir, 'categories');
  await fs.mkdir(catOutDir, { recursive: true });

  const executablePath = resolveBrowserExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const context = await browser.newContext({
    locale: 'ro-RO',
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const tracker = createCategorySessionTracker(page);

  let categoriesList = [];
  try {
    try {
      const cachedInv = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
      if (Array.isArray(cachedInv?.categories) && cachedInv.categories.length > 0) {
        categoriesList = cachedInv.categories;
      }
    } catch {
      // fetch live category tree below
    }

    if (categoriesList.length === 0) {
      const navRes = await page.goto(`${FRESHFUL_ORIGIN}/c/4-lactate-branzeturi-si-oua`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await assertNoChallengeGate(page, tracker.state.blockedStatus ?? navRes?.status());
      await dismissCookieBanner(page);
      const queries = await readNextDataQueries(page);
      const catQuery = queries?.find((q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'categories');
      categoriesList = extractDepth2Categories(catQuery?.state?.data);
    }

    const activeTargets = categoriesList.filter((c) => c.total === undefined || c.total === null || Number(c.total) > 0);
    const slice = maxCategories > 0 ? activeTargets.slice(0, maxCategories) : activeTargets;

    const allRawItems = [];
    const categorySummaries = [];

    for (let i = 0; i < slice.length; i++) {
      const cat = slice[i];
      const catFile = path.join(catOutDir, `${cat.slug}.json`);
      let snapshot = null;

      if (!force) {
        try {
          const existing = JSON.parse(await fs.readFile(catFile, 'utf8'));
          const expectedPages = existing?.collector?.totalPagesAvailable ?? 0;
          const visitedPages = existing?.collector?.pagesVisited ?? 0;
          if (expectedPages > 0 && visitedPages >= expectedPages && Array.isArray(existing.rawItems)) {
            snapshot = existing;
            console.log(`↺ [${i + 1}/${slice.length}] Din cache: ${cat.slug} (${existing.rawItems.length} carduri)`);
          }
        } catch {
          // cache miss
        }
      }

      if (!snapshot) {
        const targetUrl = `${FRESHFUL_ORIGIN}${cat.path}`;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            snapshot = await scrapeCategoryWithSession({
              page,
              tracker,
              targetUrl,
              resolvedSlug: cat.slug,
              resolvedName: cat.name,
              categoryInput: cat.slug,
              maxPages: 100,
              maxProducts: 0,
              delayMs,
              executablePath,
              allowEmptyCategory: true,
            });
            break;
          } catch (err) {
            const msg = String(err?.message || '');
            if (msg.includes('HTTP 403') || msg.includes('HTTP 429') || msg.includes('anti-bot') || attempt >= 2) {
              throw err;
            }
            console.log(`! [${cat.slug}] Retry după eroare tranzitorie: ${msg}`);
            await page.waitForTimeout(1500);
          }
        }
        await fs.writeFile(catFile, JSON.stringify(snapshot, null, 2), 'utf8');
        if (i < slice.length - 1) {
          await page.waitForTimeout(categoryDelayMs);
        }
      }

      categorySummaries.push({
        d1Slug: cat.d1Slug || null,
        d1Name: cat.d1Name || null,
        slug: cat.slug,
        name: snapshot.collector.categoryName,
        advertisedTotal: snapshot.collector.advertisedTotal,
        rawItemsCount: snapshot.rawItems.length,
        pagesVisited: snapshot.collector.pagesVisited,
        totalPagesAvailable: snapshot.collector.totalPagesAvailable,
      });

      for (const item of snapshot.rawItems) {
        allRawItems.push(item);
      }
    }

    const deduped = deduplicateFreshfulItems(allRawItems);
    const fullResult = {
      collector: {
        retailer: 'freshful',
        mode: 'full_catalog',
        collectorEngine: executablePath
          ? `playwright (${path.basename(executablePath)})`
          : 'playwright-chromium',
        categoriesRequested: slice.length,
        elapsedMs: Date.now() - startedAt,
        observedAt: new Date().toISOString(),
      },
      dedupeStats: deduped.stats,
      tier1DuplicatesCount: deduped.tier1Duplicates.length,
      tier2MergesCount: deduped.tier2Merges.length,
      categorySummaries,
      rawItemsCount: allRawItems.length,
      dedupedItemsCount: deduped.items.length,
      dedupedItems: deduped.items,
      tier2Merges: deduped.tier2Merges,
    };

    await fs.writeFile(
      path.join(outDir, 'freshful-full-deduped.json'),
      JSON.stringify(fullResult, null, 2),
      'utf8'
    );
    console.log('\n=== RAPORT COLECTOR FULL FRESHFUL ===');
    console.log(
      `Categorii: ${slice.length} | Durată: ${Math.round(fullResult.collector.elapsedMs / 1000)}s | Brut: ${deduped.stats.rawInputCount} | Unice SKU (Tier 1): ${deduped.stats.afterSkuDedupeCount} | Canonice (Tier 2): ${deduped.stats.afterCanonicalDedupeCount}`
    );
    return fullResult;
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const headless = !args.includes('--headful');

  if (args.includes('--all')) {
    const outArg = getArg(args, '--out-dir');
    const outDir = outArg
      ? path.resolve(process.cwd(), outArg)
      : path.join(OUTPUT_DIR, 'freshful-full');
    const delayMs = Number(getArg(args, '--delay-ms', '550'));
    const categoryDelayMs = Number(getArg(args, '--category-delay-ms', '350'));
    const maxCategories = Number(getArg(args, '--max-categories', '0'));
    const force = args.includes('--force');

    await collectAllFreshfulCategories({
      outDir,
      delayMs: Number.isFinite(delayMs) ? delayMs : 550,
      categoryDelayMs: Number.isFinite(categoryDelayMs) ? categoryDelayMs : 350,
      maxCategories: Number.isFinite(maxCategories) ? maxCategories : 0,
      force,
      headless,
    });
    return;
  }

  const category = getArg(args, '--category', '401-lapte-smantana-si-branza-proaspata');
  const maxPages = Number(getArg(args, '--max-pages', '10'));
  const maxProducts = Number(getArg(args, '--max-products', '200'));
  const delayMs = Number(getArg(args, '--delay-ms', '1100'));

  const result = await collectFreshfulCategory({
    categoryInput: category,
    maxPages: Number.isFinite(maxPages) ? maxPages : 10,
    maxProducts: Number.isFinite(maxProducts) ? maxProducts : 200,
    delayMs: Number.isFinite(delayMs) ? delayMs : 1100,
    headless,
  });

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outArg = getArg(args, '--out');
  const outPath = outArg
    ? path.resolve(process.cwd(), outArg)
    : path.join(OUTPUT_DIR, `freshful-${result.collector.categorySlug}-raw.json`);

  await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');

  console.log('\n=== RAPORT COLECTOR PLAYWRIGHT FRESHFUL ===');
  console.log(`Categorie: ${result.collector.categoryName} (${result.collector.categorySlug})`);
  console.log(
    `Pagini parcurse: ${result.collector.pagesVisited}/${result.collector.totalPagesAvailable} | Durată: ${result.collector.elapsedMs} ms`
  );
  console.log(
    `Extrase brut: ${result.dedupeStats.rawInputCount} | După SKU dedupe: ${result.dedupeStats.afterSkuDedupeCount} | După semnătură canonică: ${result.dedupeStats.afterCanonicalDedupeCount}`
  );
  console.log(`Fișier salvat: ${outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Eroare colector Freshful:', err);
    process.exit(1);
  });
}
