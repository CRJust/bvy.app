import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';
import {
  type DisplayProduct,
  resolveProductImageUrl,
  searchFlatCatalogProducts,
} from '@/services/beavy-catalog-search';
import {
  type CatalogIndexProduct,
  extractKnownBrandFromText,
  matchScannedItemAgainstCatalog,
  parseShoppingListRawText,
  type ScannedRawItem,
  type ScannedReviewItem,
} from '@/services/beavy-list-scanner-core';

export * from '@/services/beavy-list-scanner-core';

const CATALOG_INDEX_TTL_MS = 5 * 60 * 1000;
const MAX_UPLOAD_DIMENSION = 1440;

let cachedCatalogIndex: {
  fetchedAt: number;
  products: CatalogIndexProduct[];
  brands: string[];
} | null = null;

export type PreparedScanImage = {
  uri: string;
  width: number;
  height: number;
  base64: string;
  mimeType: 'image/jpeg';
};

export type ScanExtractionOutcome =
  | {
      status: 'success';
      provider: string;
      reviewItems: ScannedReviewItem[];
      rawText?: string;
    }
  | {
      status: 'unreadable';
      reason: string;
      rawText?: string;
    }
  | {
      status: 'needs_setup' | 'auth_required' | 'error';
      code?: string;
      message: string;
    };

export function catalogIndexProductToDisplay(
  p: CatalogIndexProduct
): DisplayProduct {
  return {
    id: p.id,
    canonical_name: p.canonical_name,
    brand: p.brand,
    package_size: p.package_size,
    image_url: p.image_url,
    family_name: p.familyNames[0],
    category_name: p.category ?? undefined,
    subcategory: p.subcategory,
  };
}

export function displayProductToCatalogIndex(
  p: DisplayProduct
): CatalogIndexProduct {
  const storeCount =
    typeof p.store_count === 'number' && p.store_count > 0
      ? p.store_count
      : Array.isArray(p.retailer_slugs) && p.retailer_slugs.length > 0
      ? p.retailer_slugs.length
      : 1;

  return {
    id: p.id,
    canonical_name: p.canonical_name,
    brand: p.brand,
    package_size: p.package_size,
    quantity_value: null,
    quantity_unit: null,
    image_url: p.image_url,
    category: p.category_name ?? null,
    subcategory: p.subcategory ?? null,
    search_aliases: [],
    familyNames: p.family_name ? [p.family_name] : [],
    familyAliases: [],
    store_count: storeCount,
    retailer_slugs: p.retailer_slugs,
    min_price: p.min_price,
    max_price: p.max_price,
  };
}

/**
 * Resizes/rotates and compresses a selected photo into a lightweight JPEG with Base64 payload.
 */
export async function prepareImageForScan(params: {
  uri: string;
  width?: number;
  height?: number;
  rotateDegrees?: number;
}): Promise<PreparedScanImage> {
  const { uri, width = 0, height = 0, rotateDegrees = 0 } = params;
  const context = ImageManipulator.manipulate(uri);

  if (rotateDegrees !== 0) {
    context.rotate(rotateDegrees);
  }

  if (width > MAX_UPLOAD_DIMENSION && width >= height) {
    context.resize({ width: MAX_UPLOAD_DIMENSION });
  } else if (height > MAX_UPLOAD_DIMENSION) {
    context.resize({ height: MAX_UPLOAD_DIMENSION });
  }

  const rendered = await context.renderAsync();
  try {
    const result = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.82,
      base64: true,
    });

    if (!result.base64) {
      throw new Error('Nu am putut pregăti imaginea pentru analiză.');
    }

    // Menținem dimensiunea binară sub ~950 KB pentru compatibilitate inclusiv cu OCR.space (limită 1 MB)
    if (result.base64.length > 1_250_000) {
      const compactCtx = ImageManipulator.manipulate(result.uri);
      if (result.width > 1120 && result.width >= result.height) {
        compactCtx.resize({ width: 1120 });
      } else if (result.height > 1120) {
        compactCtx.resize({ height: 1120 });
      }
      const compactRendered = await compactCtx.renderAsync();
      try {
        const compactSaved = await compactRendered.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.65,
          base64: true,
        });
        if (compactSaved.base64) {
          return {
            uri: compactSaved.uri,
            width: compactSaved.width,
            height: compactSaved.height,
            base64: compactSaved.base64,
            mimeType: 'image/jpeg',
          };
        }
      } finally {
        (compactCtx as { release?: () => void }).release?.();
        (compactRendered as { release?: () => void }).release?.();
      }
    }

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      base64: result.base64,
      mimeType: 'image/jpeg',
    };
  } finally {
    (context as { release?: () => void }).release?.();
    (rendered as { release?: () => void }).release?.();
  }
}

/**
 * Loads active canonical products and their family aliases from Supabase (read-only, cached 5 min).
 */
export async function loadCanonicalCatalogIndex(
  forceRefresh = false
): Promise<{ products: CatalogIndexProduct[]; brands: string[] }> {
  if (
    !forceRefresh &&
    cachedCatalogIndex &&
    Date.now() - cachedCatalogIndex.fetchedAt < CATALOG_INDEX_TTL_MS
  ) {
    return {
      products: cachedCatalogIndex.products,
      brands: cachedCatalogIndex.brands,
    };
  }

  // 1. Obținem primele 500 cele mai prezente produse din magazine (alimente de bază din coșuri reale)
  const { data: topSummaries } = await supabase
    .from('beavy_product_price_summary')
    .select('product_id, store_count, retailer_slugs, min_price, max_price')
    .order('store_count', { ascending: false })
    .limit(500);

  const pIds = (topSummaries ?? []).map((s) => s.product_id);

  const [productsRes, membersRes, familiesRes, aliasesRes] = await Promise.all([
    pIds.length > 0
      ? supabase
          .from('beavy_products')
          .select(
            'id, canonical_name, brand, package_size, quantity_value, quantity_unit, image_url, category, subcategory, search_aliases, attributes'
          )
          .in('id', pIds)
      : supabase
          .from('beavy_products')
          .select(
            'id, canonical_name, brand, package_size, quantity_value, quantity_unit, image_url, category, subcategory, search_aliases, attributes'
          )
          .eq('is_active', true)
          .limit(500),
    pIds.length > 0
      ? supabase
          .from('beavy_product_family_members')
          .select('product_id, family_id')
          .in('product_id', pIds)
      : supabase
          .from('beavy_product_family_members')
          .select('product_id, family_id')
          .limit(500),
    supabase
      .from('beavy_product_families')
      .select('id, canonical_name')
      .eq('is_active', true)
      .limit(300),
    supabase
      .from('beavy_product_family_aliases')
      .select('family_id, alias, alias_type')
      .in('alias_type', ['family_name', 'common_term', 'synonym'])
      .limit(500),
  ]);

  if (productsRes.error) {
    throw new Error(
      `Nu am putut încărca catalogul canonic: ${productsRes.error.message}`
    );
  }

  const summaryByProductId = new Map<
    string,
    { store_count: number; retailer_slugs?: string[]; min_price?: number | null; max_price?: number | null }
  >();
  for (const s of topSummaries ?? []) {
    summaryByProductId.set(String(s.product_id), {
      store_count: typeof s.store_count === 'number' ? s.store_count : 1,
      retailer_slugs: Array.isArray(s.retailer_slugs) ? (s.retailer_slugs as string[]) : undefined,
      min_price: s.min_price != null ? Number(s.min_price) : null,
      max_price: s.max_price != null ? Number(s.max_price) : null,
    });
  }

  const familyNameById = new Map<string, string>();
  for (const f of familiesRes.data ?? []) {
    familyNameById.set(String(f.id), String(f.canonical_name ?? ''));
  }

  const aliasesByFamilyId = new Map<string, string[]>();
  for (const a of aliasesRes.data ?? []) {
    const fid = String(a.family_id);
    const arr = aliasesByFamilyId.get(fid) ?? [];
    if (a.alias) arr.push(String(a.alias));
    aliasesByFamilyId.set(fid, arr);
  }

  const familyIdsByProductId = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    const pid = String(m.product_id);
    const fid = String(m.family_id);
    const arr = familyIdsByProductId.get(pid) ?? [];
    arr.push(fid);
    familyIdsByProductId.set(pid, arr);
  }

  const brandSet = new Set<string>();
  const products: CatalogIndexProduct[] = (productsRes.data ?? []).map((p) => {
    const id = String(p.id);
    const brand = p.brand ? String(p.brand).trim() : null;
    if (brand) brandSet.add(brand);

    const famIds = familyIdsByProductId.get(id) ?? [];
    const familyNames = famIds
      .map((fid) => familyNameById.get(fid))
      .filter((n): n is string => Boolean(n));
    const familyAliases = famIds.flatMap(
      (fid) => aliasesByFamilyId.get(fid) ?? []
    );

    const searchAliases = Array.isArray(p.search_aliases)
      ? p.search_aliases.map((x) => String(x)).filter(Boolean)
      : [];

    const summary = summaryByProductId.get(id);

    return {
      id,
      canonical_name: String(p.canonical_name ?? ''),
      brand,
      package_size: p.package_size ? String(p.package_size) : null,
      quantity_value:
        p.quantity_value != null ? Number(p.quantity_value) : null,
      quantity_unit: p.quantity_unit ? String(p.quantity_unit) : null,
      image_url: resolveProductImageUrl(
        p.image_url ? String(p.image_url) : null
      ),
      category: p.category ? String(p.category) : null,
      subcategory: p.subcategory ? String(p.subcategory) : null,
      search_aliases: searchAliases,
      familyNames,
      familyAliases,
      store_count: summary?.store_count ?? 1,
      retailer_slugs: summary?.retailer_slugs,
      min_price: summary?.min_price,
      max_price: summary?.max_price,
      attributes:
        p.attributes && typeof p.attributes === 'object'
          ? (p.attributes as Record<string, unknown>)
          : {},
    };
  });

  const brands = Array.from(brandSet);
  cachedCatalogIndex = { fetchedAt: Date.now(), products, brands };
  return { products, brands };
}

// Cache în memorie pentru candidați căutați recent (termen -> produse indexate) cu TTL 10 minute
const scanQueryCandidateCache = new Map<
  string,
  { timestamp: number; data: CatalogIndexProduct[] }
>();
const CANDIDATE_CACHE_TTL_MS = 10 * 60 * 1000;

async function searchWithCandidateTimeout(
  query: string,
  timeoutMs = 2500
): Promise<DisplayProduct[]> {
  try {
    return await Promise.race([
      searchFlatCatalogProducts(query, null),
      new Promise<DisplayProduct[]>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
      ),
    ]);
  } catch {
    return [] as DisplayProduct[];
  }
}

async function fetchRpcCandidatesForScanQuery(
  queryText: string
): Promise<CatalogIndexProduct[]> {
  const clean = queryText.trim().replace(/\s+/g, ' ');
  if (clean.length < 2) return [];

  const cacheKey = clean.toLowerCase();
  const cached = scanQueryCandidateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CANDIDATE_CACHE_TTL_MS) {
    return cached.data;
  }

  const merged = new Map<string, DisplayProduct>();
  const addRows = (rows: DisplayProduct[]) => {
    for (const row of rows) {
      if (!merged.has(row.id)) merged.set(row.id, row);
    }
  };

  // Interogări disjunctive cu „sau” (ex: „Bacon sau Pancetta”, „Dulceață de vișine sau afine”)
  const disjunctionParts = clean
    .split(/\s+(?:sau|or|\/)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  if (disjunctionParts.length > 1) {
    const partLists = await Promise.all(
      disjunctionParts.map((part) => searchWithCandidateTimeout(part))
    );
    for (const list of partLists) addRows(list);
  } else {
    addRows(await searchWithCandidateTimeout(clean));
  }

  // Eliminăm gramajele (inclusiv prescurtări OCR ca „2k.”), procentele de grăsime și punctuația
  const withoutUnits = clean
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|gr|g|k|litri|litru|l|ml|cl)\b\.?/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*%/g, ' ')
    .replace(/[.,;:!?()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Oprim căutările secundare dacă avem deja cel puțin 2 candidați buni
  if (merged.size < 2 && withoutUnits.length >= 2 && withoutUnits !== clean) {
    addRows(await searchWithCandidateTimeout(withoutUnits));
  }

  // Fallback DOAR dacă nu s-a găsit absolut niciun candidat (ex. eroare de OCR pe bon)
  if (merged.size === 0) {
    const baseWords = (withoutUnits || clean)
      .split(' ')
      .map((w) => w.trim())
      .filter((w) => w.length >= 3);

    if (baseWords.length >= 3) {
      const shorter = baseWords.slice(0, -1).join(' ');
      if (shorter.length >= 3) {
        addRows(await searchWithCandidateTimeout(shorter));
      }
    }

    if (merged.size === 0 && baseWords.length >= 2) {
      const keywordSeeds = baseWords.filter((w) => w.length >= 4).slice(0, 2);
      if (keywordSeeds.length > 0) {
        const extraLists = await Promise.all(
          keywordSeeds.map((seed) => searchWithCandidateTimeout(seed))
        );
        for (const list of extraLists) addRows(list);
      }
    }
  }

  // Sinonime culinare uzuale românești (doar dacă avem sub 2 rezultate)
  if (merged.size < 2) {
    const normalizedBase = (withoutUnits || clean)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    if (normalizedBase === 'pui') {
      addRows(await searchWithCandidateTimeout('Piept de pui'));
    } else if (normalizedBase.includes('parmezan')) {
      addRows(await searchWithCandidateTimeout('Parmigiano'));
    } else if (normalizedBase === 'spaghete') {
      addRows(await searchWithCandidateTimeout('Spaghetti'));
    } else if (normalizedBase.includes('sare')) {
      addRows(await searchWithCandidateTimeout('Sare fina'));
    }
  }

  // Fallback direct în tabela beavy_products DOAR dacă nu s-a găsit nimic prin RPC
  if (merged.size === 0) {
    const searchTerms = [clean, withoutUnits]
      .flatMap((s) => s.split(/\s+sau\s+/i))
      .map((s) =>
        s
          .replace(/\b(?:proaspat|proaspata|proaspeti|proaspete|ecologic|bio|clasic|traditional)\b/gi, '')
          .trim()
      )
      .filter((s) => s.length >= 3);

    for (const term of Array.from(new Set(searchTerms)).slice(0, 2)) {
      try {
        const { data: directRows } = await supabase
          .from('beavy_products')
          .select('id, canonical_name, brand, package_size, image_url, category, subcategory')
          .or(`canonical_name.ilike.%${term}%,canonical_name.ilike.${term} %`)
          .not('image_url', 'is', null)
          .limit(6);

        if (directRows) {
          for (const r of directRows) {
            if (!merged.has(r.id)) {
              merged.set(r.id, {
                id: r.id,
                canonical_name: r.canonical_name,
                brand: r.brand,
                package_size: r.package_size,
                image_url: r.image_url,
                category_name: r.category,
                subcategory: r.subcategory,
              });
            }
          }
        }
      } catch {
        // Fallback silențios dacă Supabase este inaccesibil
      }
    }
  }

  const result = Array.from(merged.values()).map(displayProductToCatalogIndex);
  scanQueryCandidateCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

/**
 * Interogare batch Supabase pentru toate produsele din listă într-un singur apel RPC,
 * reducând timpul de căutare a rețetelor la sub 2 secunde și eliminând riscul de timeout.
 */
async function fetchBatchRpcCandidatesForScanQueries(
  seeds: string[]
): Promise<Map<string, CatalogIndexProduct[]>> {
  const map = new Map<string, CatalogIndexProduct[]>();
  const cleanSeeds = Array.from(
    new Set(
      seeds
        .map((s) => s.trim())
        .filter((s) => s.length >= 2)
    )
  );

  if (cleanSeeds.length === 0) return map;

  try {
    const { data: rows, error } = await Promise.race([
      supabase.rpc('search_beavy_products_batch', {
        p_queries: cleanSeeds,
        p_limit_per_query: 18,
      }),
      new Promise<{ data: null; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_BATCH')), 3500)
      ),
    ]);

    if (!error && Array.isArray(rows)) {
      for (const row of rows) {
        const qKey = String(row.query_text ?? '').toLowerCase().trim();
        const existing = map.get(qKey) ?? [];
        existing.push(
          displayProductToCatalogIndex({
            id: row.id,
            canonical_name: row.canonical_name,
            brand: row.brand,
            package_size: row.package_size,
            image_url: row.image_url,
            category_name: row.category_name,
            subcategory: row.subcategory,
            min_price: row.min_price != null ? Number(row.min_price) : null,
            store_count: typeof row.store_count === 'number' ? row.store_count : 1,
            retailer_slugs: Array.isArray(row.retailer_slugs)
              ? (row.retailer_slugs as string[])
              : undefined,
          })
        );
        map.set(qKey, existing);
      }
    }
  } catch (err) {
    console.warn('Batch RPC search fallback to individual queries:', err);
  }

  return map;
}

/**
 * Matches extracted raw OCR items against the canonical Supabase catalog.
 */
export async function matchExtractedItemsToCatalog(
  rawItems: ScannedRawItem[]
): Promise<ScannedReviewItem[]> {
  const itemBranchSeeds = rawItems.map((item) => {
    const base = [item.brandHint, item.name].filter(Boolean).join(' ').trim();
    const branches = base
      .split(/\s+(?:sau|or|\/)\s+/i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    return branches.length > 0 ? branches : [base];
  });
  const searchSeeds = itemBranchSeeds.flat();

  const [{ products, brands }, batchCandidateMap] = await Promise.all([
    loadCanonicalCatalogIndex(),
    fetchBatchRpcCandidatesForScanQueries(searchSeeds),
  ]);

  // Pentru produsele găsite prin batch RPC, candidații sunt gata instant (0 ms adăugate).
  // Doar dacă batch-ul nu a găsit candidați pentru o interogare rară, încercăm fallback-ul individual.
  const perItemRpcCandidates = await Promise.all(
    itemBranchSeeds.map(async (branches) => {
      const collected: CatalogIndexProduct[] = [];
      const seen = new Set<string>();
      for (const seed of branches) {
        const key = seed.toLowerCase().trim();
        const fromBatch = batchCandidateMap.get(key) ?? [];
        for (const p of fromBatch) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            collected.push(p);
          }
        }
      }
      if (collected.length > 0) {
        return collected;
      }
      return fetchRpcCandidatesForScanQuery(branches[0] ?? '');
    })
  );

  const baseIds = new Set(products.map((p) => p.id));

  return rawItems.map((item, idx) => {
    const rpcCandidates = perItemRpcCandidates[idx] ?? [];
    const combinedProducts =
      rpcCandidates.length > 0
        ? [
            ...products,
            ...rpcCandidates.filter((c) => !baseIds.has(c.id)),
          ]
        : products;

    const candidateBrands = Array.from(
      new Set([
        ...brands,
        ...rpcCandidates
          .map((c) => c.brand)
          .filter((b): b is string => Boolean(b)),
      ])
    );

    const enrichedBrand =
      item.brandHint ?? extractKnownBrandFromText(item.name, candidateBrands);
    return matchScannedItemAgainstCatalog(
      { ...item, brandHint: enrichedBrand },
      combinedProducts,
      candidateBrands,
      idx
    );
  });
}

/**
 * Re-evaluates a single review row after the user edits its text label.
 */
export async function rematchEditedReviewItem(
  existing: ScannedReviewItem,
  editedName: string
): Promise<ScannedReviewItem> {
  const clean = editedName.trim();
  if (!clean) {
    return {
      ...existing,
      editedName: '',
      matchStatus: 'unmatched',
      matchConfidence: 0,
      selectedProduct: null,
      candidates: [],
      userResolved: true,
    };
  }

  const [{ products, brands }, rpcCandidates] = await Promise.all([
    loadCanonicalCatalogIndex(),
    fetchRpcCandidatesForScanQuery(clean),
  ]);

  const indexIds = new Set(products.map((p) => p.id));
  const combinedProducts = [
    ...products,
    ...rpcCandidates.filter((c) => !indexIds.has(c.id)),
  ];
  const candidateBrands = Array.from(
    new Set([
      ...brands,
      ...rpcCandidates
        .map((c) => c.brand)
        .filter((b): b is string => Boolean(b)),
    ])
  );

  const parsed = parseShoppingListRawText(clean, candidateBrands)[0] ?? {
    rawLine: existing.rawLine,
    name: clean,
    quantity: existing.quantity,
    unit: existing.unit,
    brandHint: extractKnownBrandFromText(clean, candidateBrands),
    packageSizeHint: null,
    confidence: 0.9,
  };

  const rematched = matchScannedItemAgainstCatalog(
    {
      ...parsed,
      quantity: existing.quantity,
      unit: existing.unit,
      confidence: 0.9,
    },
    combinedProducts,
    candidateBrands
  );

  return {
    ...rematched,
    localId: existing.localId,
    rawLine: existing.rawLine,
    editedName: clean,
    included: existing.included,
  };
}

/**
 * Extracts & matches items from raw/pasted text without any server Vision cost ($0.00).
 */
export async function scanFromRawText(
  rawText: string
): Promise<ScanExtractionOutcome> {
  const clean = rawText.trim();
  if (!clean) {
    return {
      status: 'unreadable',
      reason: 'Introdu cel puțin un produs pentru a continua.',
    };
  }

  const { brands } = await loadCanonicalCatalogIndex().catch(() => ({
    products: [] as CatalogIndexProduct[],
    brands: [] as string[],
  }));
  const rawItems = parseShoppingListRawText(clean, brands);
  if (rawItems.length === 0) {
    return {
      status: 'unreadable',
      reason:
        'Nu am identificat produse alimentare valide în textul introdus.',
      rawText: clean,
    };
  }

  const reviewItems = await matchExtractedItemsToCatalog(rawItems);
  return {
    status: 'success',
    provider: 'text-parser',
    reviewItems,
    rawText: clean,
  };
}

/**
 * Invokes the Supabase Edge Function `scan-shopping-list` (keeping Vision keys strictly server-side)
 * and matches extracted lines against the canonical Supabase catalog.
 */
export async function scanListFromImage(
  image: PreparedScanImage
): Promise<ScanExtractionOutcome> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      status: 'auth_required',
      code: 'AUTH_REQUIRED',
      message:
        'Conectează-te în Cont pentru analiza automată a fotografiei cu Vision, sau lipește mai jos textul copiat din poză (Live Text / Lens).',
    };
  }

  const { data, error } = await supabase.functions.invoke(
    'scan-shopping-list',
    {
      body: {
        imageBase64: image.base64,
        mimeType: image.mimeType,
      },
    }
  );

  if (error) {
    const errMsg = error.message || '';
    if (errMsg.includes('401') || errMsg.toLowerCase().includes('jwt')) {
      return {
        status: 'auth_required',
        code: 'AUTH_REQUIRED',
        message:
          'Sesiunea a expirat sau lipsește. Reconectează-te în Cont sau folosește introducerea textului mai jos.',
      };
    }
    return {
      status: 'error',
      message:
        'Nu am putut contacta serviciul de scanare. Verifică conexiunea la internet și încearcă din nou.',
    };
  }

  const payload = data as {
    ok?: boolean;
    provider?: string;
    unreadable?: boolean;
    unreadableReason?: string | null;
    rawText?: string;
    items?: ScannedRawItem[];
    code?: string;
    error?: string;
  } | null;

  if (!payload) {
    return {
      status: 'error',
      message: 'Răspuns invalid de la serviciul de scanare.',
    };
  }

  if (!payload.ok) {
    if (payload.code === 'OCR_PROVIDER_NOT_CONFIGURED') {
      return {
        status: 'needs_setup',
        code: payload.code,
        message:
          'OCR-ul automat din imagine necesită o cheie gratuită GEMINI_API_KEY sau OCR_SPACE_API_KEY în Supabase Edge Function Secrets. Între timp, poți lipi textul din poză mai jos.',
      };
    }
    return {
      status: 'error',
      code: payload.code,
      message:
        payload.error ||
        'Nu am putut analiza fotografia. Încearcă din nou cu o imagine mai clară.',
    };
  }

  if (payload.unreadable || !Array.isArray(payload.items) || payload.items.length === 0) {
    return {
      status: 'unreadable',
      reason:
        payload.unreadableReason ||
        'Fotografia este neclară sau nu conține produse recognoscibile. Încearcă o poză mai luminoasă sau lipește textul manual.',
      rawText: payload.rawText,
    };
  }

  const reviewItems = await matchExtractedItemsToCatalog(payload.items);
  return {
    status: 'success',
    provider: payload.provider ?? 'vision',
    reviewItems,
    rawText: payload.rawText,
  };
}
