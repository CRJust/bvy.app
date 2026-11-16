import { supabase } from '@/lib/supabase';
import {
  areSameLineDifferentSizes,
  type BeavyProductOffer,
  type CatalogProductProfile,
  computeProductMatchScore,
  estimateProductUnitPricing,
  extractFreshProduceGenericKey,
  FAMILY_IN_CHUNK_SIZE,
  fetchPaginatedByChunks,
  fetchVerifiedOffersForProducts,
  getFreshProduceCanonicalTitle,
  isCompatibleEquivalentProduct,
  isFreshVerifiedOffer,
  isProcessedNonFreshProduce,
  MAX_VERIFIED_OFFER_AGE_MS,
  matchesGenericTermCandidate,
  resolveGenericTermCatalogMatches,
  UUID_IN_CHUNK_SIZE,
} from '@/services/beavy-comparison';

const CATALOG_REQUEST_TIMEOUT_MS = 15_000;

async function withCatalogTimeout<T>(
  request: (signal: AbortSignal) => PromiseLike<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CATALOG_REQUEST_TIMEOUT_MS
  );

  try {
    return await request(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        'Cererea către catalog a expirat. Verifică conexiunea la internet și încearcă din nou.'
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Un produs afișat direct în catalog / selector, îmbogățit cu rezumat live de prețuri pe magazine.
 */
export type DisplayProduct = {
  id: string;
  canonical_name: string;
  brand: string | null;
  package_size: string | null;
  image_url: string | null;
  family_name?: string;
  category_name?: string;
  category_slug?: string | null;
  subcategory?: string | null;
  barcode?: string | null;
  min_price?: number | null;
  max_price?: number | null;
  regular_min_price?: number | null;
  store_count?: number;
  has_promo?: boolean;
  has_loyalty?: boolean;
  cheapest_retailer_slug?: string | null;
  cheapest_retailer_name?: string | null;
  retailer_slugs?: string[];
  mergedProductIds?: string[];
  canonical_fingerprint?: string | null;
};

export type CatalogSortMode = 'relevance' | 'price_asc' | 'stores_desc';

/**
 * Un produs individual din catalogul Beavy, returnat în preview-ul familiei.
 */
export type BeavySearchProduct = {
  id: string;
  canonical_name: string;
  brand: string | null;
  package_size: string | null;
  image_url: string | null;
  barcode: string | null;
  relevance: number;
};

/**
 * O familie de produse returnată de RPC-ul de căutare.
 * Conține un preview cu produsele cele mai relevante.
 */
export type BeavyFamilySearchResult = {
  family_id: string;
  family_key: string;
  family_name: string;
  category_slug: string;
  category_name: string;
  relevance: number;
  match_source: string;
  product_count: number;
  matched_product_count: number;
  matching_products: BeavySearchProduct[];
};

/**
 * O variantă concretă de produs dintr-o familie.
 * Returnată de RPC-ul get_beavy_family_products.
 */
export type BeavyFamilyProduct = {
  product_id: string;
  canonical_name: string;
  brand: string | null;
  package_size: string | null;
  subcategory: string | null;
  image_url: string | null;
  barcode: string | null;
  attributes: Record<string, unknown>;
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string | null;
};

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  { id: 'lapte', name: 'Lapte', slug: 'lapte' },
  { id: 'oua', name: 'Ouă', slug: 'oua' },
  { id: 'paine', name: 'Pâine', slug: 'paine' },
  { id: 'iaurt-kefir', name: 'Iaurt & Kefir', slug: 'iaurt-kefir' },
  { id: 'branzeturi', name: 'Brânzeturi', slug: 'branzeturi' },
  { id: 'unt-smantana', name: 'Unt & Smântână', slug: 'unt-smantana' },
  { id: 'legume-proaspete', name: 'Legume', slug: 'legume-proaspete' },
  { id: 'fructe-proaspete', name: 'Fructe', slug: 'fructe-proaspete' },
  { id: 'paste-orez', name: 'Paste & Orez', slug: 'paste-orez' },
  { id: 'cafea', name: 'Cafea', slug: 'cafea' },
  { id: 'ulei-otet', name: 'Ulei & Oțet', slug: 'ulei-otet' },
  { id: 'conserve', name: 'Conserve', slug: 'conserve' },
  { id: 'apa', name: 'Apă & Băuturi', slug: 'apa' },
];

/**
 * Returnează strict URL-ul verificat al produsului canonic (fără substituiri generice pe branduri greșite).
 */
export function resolveProductImageUrl(
  directImageUrl: string | null | undefined,
  _canonicalName?: string,
  _categoryName?: string | null,
  _familyName?: string | null
): string | null {
  if (directImageUrl && directImageUrl.trim().length > 0) {
    return directImageUrl.trim();
  }
  return null;
}

const PLACEHOLDER_SYMBOL_RULES: { keywords: string[]; symbol: string }[] = [
  { keywords: ['lapte', 'sana', 'chefir', 'kefir', 'iaurt', 'smantana', 'smântână'], symbol: 'drop.fill' },
  { keywords: ['oua', 'ouă'], symbol: 'oval.portrait.fill' },
  { keywords: ['unt', 'branza', 'brânză', 'telemea', 'cascaval', 'cașcaval', 'mozzarella', 'branzeturi', 'brânzeturi'], symbol: 'circle.grid.2x2.fill' },
  { keywords: ['paine', 'pâine', 'franzela', 'franzelă', 'toast', 'chifle', 'bagheta', 'baghetă'], symbol: 'fork.knife' },
  { keywords: ['legume', 'fructe', 'banane', 'mere', 'rosii', 'roșii', 'ardei', 'cartofi', 'ceapa', 'ceapă', 'avocado', 'verdeata', 'verdeață', 'ciuperci'], symbol: 'leaf.fill' },
  { keywords: ['cafea', 'espresso', 'ceai'], symbol: 'cup.and.saucer.fill' },
  { keywords: ['apa', 'apă', 'suc', 'nectar', 'racoritoare', 'răcoritoare', 'bauturi', 'băuturi'], symbol: 'waterbottle.fill' },
  { keywords: ['ulei', 'otet', 'oțet'], symbol: 'drop.triangle.fill' },
  {
    keywords: [
      'paste',
      'penne',
      'spaghetti',
      'fusilli',
      'farfalle',
      'rigatoni',
      'tagliatelle',
      'pesto',
      'orez',
      'faina',
      'făină',
      'malai',
      'mălai',
      'cereale',
      'conserve',
      'sos',
      'sosuri',
    ],
    symbol: 'archivebox.fill',
  },
];

export function resolveProductPlaceholderSymbol(
  canonicalName: string,
  categoryName?: string | null,
  familyName?: string | null
): string | null {
  const haystack = [canonicalName, categoryName, familyName]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ro-RO');

  for (const rule of PLACEHOLDER_SYMBOL_RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) {
      return rule.symbol;
    }
  }
  return null;
}

/**
 * Generează monograma curată (1-2 litere) pentru produsele fără imagine.
 */
export function getProductMonogram(canonicalName: string, brand: string | null): string {
  const cleanBrand =
    brand && !/(orice\s+(firm[aă]|brand)|produs\s+propriu|generic)/i.test(brand.trim())
      ? brand.trim()
      : null;
  const source = (cleanBrand || canonicalName || 'B').trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Curăță titlul produsului eliminând duplicarea brandului la început.
 */
export function formatProductTitle(canonicalName: string, brand: string | null): string {
  let title = canonicalName.trim();
  if (brand && title.toLowerCase().startsWith(brand.toLowerCase())) {
    title = title.slice(brand.length).trim();
    title = title.replace(/^[-,\s]+/, '');
  }
  return title || canonicalName;
}

export type DynamicCategoryNode = {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  sort_order: number;
  product_count: number;
};

export type CategoryDepartmentGroup = {
  id: string;
  slug: string;
  name: string;
  items: DynamicCategoryNode[];
  totalProducts: number;
};

export type CategoryBrandFacet = {
  brand: string;
  product_count: number;
};

export type CatalogPageResult = {
  products: DisplayProduct[];
  families: BeavyFamilySearchResult[];
  totalCount: number;
  hasMore: boolean;
  barcodeHint?: string | null;
  barcodeSuggestedQuery?: string | null;
};

let cachedCategoriesTree: {
  fetchedAt: number;
  departments: CategoryDepartmentGroup[];
  flatLeaves: DynamicCategoryNode[];
} | null = null;

const CATEGORY_TREE_TTL_MS = 5 * 60 * 1000;

/**
 * Încarcă dinamic departamentele și raioanele active din Supabase cu numărul de produse.
 */
export async function fetchCatalogDepartmentTree(
  forceRefresh = false
): Promise<{
  departments: CategoryDepartmentGroup[];
  flatLeaves: DynamicCategoryNode[];
}> {
  if (
    !forceRefresh &&
    cachedCategoriesTree &&
    Date.now() - cachedCategoriesTree.fetchedAt < CATEGORY_TREE_TTL_MS
  ) {
    return {
      departments: cachedCategoriesTree.departments,
      flatLeaves: cachedCategoriesTree.flatLeaves,
    };
  }

  try {
    const { data, error } = await withCatalogTimeout((signal) =>
      supabase.rpc('get_beavy_active_categories_with_counts').abortSignal(signal)
    );

    if (error || !Array.isArray(data)) {
      throw error ?? new Error('Invalid category response');
    }

    const rows = (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      parent_id: r.parent_id ? String(r.parent_id) : null,
      slug: String(r.slug),
      name: String(r.name),
      sort_order: Number(r.sort_order ?? 0),
      product_count: Number(r.product_count ?? 0),
    }));

    const parents = rows.filter((r) => r.parent_id === null);
    const childrenByParent = new Map<string, DynamicCategoryNode[]>();
    const flatLeaves: DynamicCategoryNode[] = [];

    for (const row of rows) {
      if (row.parent_id !== null && row.product_count > 0) {
        const list = childrenByParent.get(row.parent_id) ?? [];
        list.push(row);
        childrenByParent.set(row.parent_id, list);
        flatLeaves.push(row);
      }
    }

    const departments: CategoryDepartmentGroup[] = [];
    for (const parent of parents) {
      const children = (childrenByParent.get(parent.id) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ro-RO')
      );
      if (children.length > 0) {
        departments.push({
          id: parent.id,
          slug: parent.slug,
          name: parent.name,
          items: children,
          totalProducts: children.reduce((acc, c) => acc + c.product_count, 0),
        });
      }
    }

    // Includem și eventuale categorii root care au produse directe fără subcategorii
    for (const rootCat of parents) {
      if (rootCat.product_count > 0 && !childrenByParent.has(rootCat.id)) {
        flatLeaves.push(rootCat);
        departments.push({
          id: rootCat.id,
          slug: rootCat.slug,
          name: rootCat.name,
          items: [rootCat],
          totalProducts: rootCat.product_count,
        });
      }
    }

    if (flatLeaves.length > 0) {
      cachedCategoriesTree = {
        fetchedAt: Date.now(),
        departments,
        flatLeaves,
      };
      return { departments, flatLeaves };
    }
  } catch {
    // Fallback la lista statică dacă nu există conexiune
  }

  const fallbackLeaves: DynamicCategoryNode[] = CATALOG_CATEGORIES.filter(
    (c): c is CatalogCategory & { slug: string } => Boolean(c.slug)
  ).map((c, idx) => ({
    id: c.id,
    parent_id: 'fallback',
    slug: c.slug,
    name: c.name,
    sort_order: idx * 10,
    product_count: 0,
  }));

  return {
    departments: [
      {
        id: 'fallback',
        slug: 'camara',
        name: 'Raioane de bază',
        items: fallbackLeaves,
        totalProducts: 0,
      },
    ],
    flatLeaves: fallbackLeaves,
  };
}

/**
 * Încarcă brandurile cele mai populare dintr-o categorie (sau din tot catalogul).
 */
export async function fetchCategoryBrands(
  categorySlug: string | null,
  limit = 20
): Promise<CategoryBrandFacet[]> {
  try {
    const { data, error } = await withCatalogTimeout((signal) =>
      supabase
        .rpc('get_beavy_category_brands', {
          p_category_slug: categorySlug,
          p_limit: limit,
        })
        .abortSignal(signal)
    );
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      brand: String(r.brand),
      product_count: Number(r.product_count ?? 0),
    }));
  } catch {
    return [];
  }
}

function mapV2RowToDisplayProduct(r: Record<string, unknown>): DisplayProduct {
  const categoryName = r.category_name ? String(r.category_name) : undefined;
  const canonicalName = String(r.canonical_name ?? '');
  return {
    id: String(r.id),
    canonical_name: canonicalName,
    brand: r.brand ? String(r.brand) : null,
    package_size: r.package_size ? String(r.package_size) : null,
    image_url: resolveProductImageUrl(
      r.image_url ? String(r.image_url) : null,
      canonicalName,
      categoryName
    ),
    barcode: r.barcode ? String(r.barcode) : null,
    category_name: categoryName,
    category_slug: r.category_slug ? String(r.category_slug) : null,
    subcategory: r.subcategory ? String(r.subcategory) : null,
    min_price: r.min_price != null ? Number(r.min_price) : null,
    max_price: r.max_price != null ? Number(r.max_price) : null,
    regular_min_price:
      r.regular_min_price != null ? Number(r.regular_min_price) : null,
    store_count: r.store_count != null ? Number(r.store_count) : 0,
    has_promo: Boolean(r.has_promo),
    has_loyalty: Boolean(r.has_loyalty),
    cheapest_retailer_slug: r.cheapest_retailer_slug
      ? String(r.cheapest_retailer_slug)
      : null,
    cheapest_retailer_name: r.cheapest_retailer_name
      ? String(r.cheapest_retailer_name)
      : null,
    retailer_slugs: Array.isArray(r.retailer_slugs)
      ? (r.retailer_slugs as unknown[]).map(String)
      : [],
    canonical_fingerprint: r.canonical_fingerprint
      ? String(r.canonical_fingerprint)
      : r.cluster_key
        ? String(r.cluster_key)
        : null,
  };
}

/**
 * Normalizare tolerantă pentru termenii de căutare din catalog:
 * fără diacritice, cu cifrele și separatorii de gramaj păstrați.
 */
function normalizeCatalogSearchText(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cuvinte descriptive care nu schimbă identitatea produsului căutat.
 * Sunt eliminate doar când interogarea completă este prea restrictivă.
 */
const CATALOG_RELAXABLE_QUERY_WORDS = new Set([
  'energy',
  'energizant',
  'energizanta',
  'energizante',
  'energizanti',
  'bautura',
  'bauturi',
  'drink',
  'beverage',
  'doza',
  'doze',
  'cutie',
  'cutii',
  'sticla',
  'sticle',
  'pet',
  'sgr',
  'garantie',
  'garantia',
  'ambalaj',
  'pack',
]);

function catalogQueryWords(query: string): string[] {
  return normalizeCatalogSearchText(query)
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .filter((word) => !/^\d+(?:ml|cl|l|g|gr|kg|buc)?$/.test(word));
}

/**
 * Variantă relaxată a interogării, obținută prin eliminarea tuturor
 * cuvintelor descriptive (ex. „Monster Energy Ultra” -> „Monster Ultra”).
 */
function buildRelaxedCatalogQueries(query: string): string[] {
  const words = catalogQueryWords(query);
  if (words.length < 3) return [];

  const distinctive = words.filter(
    (word) => !CATALOG_RELAXABLE_QUERY_WORDS.has(word)
  );
  if (distinctive.length < 2 || distinctive.length === words.length) {
    return [];
  }

  return [distinctive.join(' ')];
}

function countCatalogQueryMatches(product: DisplayProduct, words: string[]): number {
  const haystack = normalizeCatalogSearchText(
    `${product.canonical_name} ${product.brand ?? ''} ${product.package_size ?? ''}`
  );
  return words.reduce(
    (matches, word) => (haystack.includes(word) ? matches + 1 : matches),
    0
  );
}

/**
 * Aromele din linia Monster Ultra care NU trebuie contopite cu Ultra White.
 * „ALRO” apare în feed-ul Bolt Food pentru Monster Ultra White și este tratat
 * ca alias al aceluiași produs.
 */
const MONSTER_ULTRA_OTHER_FLAVORS = new Set([
  'paradise',
  'pineapple',
  'golden',
  'strawberry',
  'dreams',
  'green',
  'mango',
  'loco',
  'apple',
  'bad',
  'lewis',
  'hamilton',
  'lando',
  'pipeline',
  'punch',
  'fiesta',
  'violet',
  'sunrise',
  'watermelon',
  'peach',
  'peachy',
  'rosa',
  'rose',
  'black',
  'blue',
  'red',
  'citron',
  'ruby',
  'guava',
  'melon',
  'cosmic',
  'fantasy',
  'aussie',
  'lemon',
  'lime',
  'orange',
  'grape',
  'cherry',
  'mocha',
  'caramel',
]);

/**
 * Identitate cross-retailer pentru linii de produs cunoscute, acolo unde
 * feed-urile magazinelor folosesc denumiri foarte diferite pentru același produs.
 * Aromele diferite primesc chei diferite și nu sunt niciodată contopite.
 */
function buildCatalogProductIdentityKey(product: DisplayProduct): string | null {
  const name = normalizeCatalogSearchText(product.canonical_name);
  const brand = normalizeCatalogSearchText(product.brand);
  const isMonster = /\bmonster\b/.test(name) || /\bmonster\b/.test(brand);
  if (!isMonster || !/\bultra\b/.test(name)) return null;

  const tokens = name
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const flavorTokens = tokens
    .filter((token) => MONSTER_ULTRA_OTHER_FLAVORS.has(token))
    .sort();

  const sizeHaystack = `${name} ${normalizeCatalogSearchText(product.package_size)}`;
  const isHalfLiter =
    /\b0[.,]5\s*l/.test(sizeHaystack) || /\b500\s*ml/.test(sizeHaystack);
  if (!isHalfLiter) return null;

  // „White” și „ALRO” sunt denumiri comerciale pentru aceeași variantă Ultra.
  return flavorTokens.length > 0
    ? `monster:ultra:${flavorTokens.join('-')}`
    : 'monster:ultra:white';
}

/**
 * Preferă denumiri curate, lizibile, în locul abrevierilor de feed
 * (ex. „MONSTER ULTRA ZERO ALRO 0.5L DZ SGR”).
 */
function catalogTitleQualityScore(name: string): number {
  const trimmed = name.trim();
  if (!trimmed) return 0;

  let score = 0;
  if (/^[A-ZĂÂÎȘȚ]/.test(trimmed)) score += 2;
  if (/[a-zăâîșț]/.test(trimmed)) score += 1;
  if (!/\b(alro|dz|sgr|buc|lei)\b/i.test(trimmed)) score += 2;
  if (trimmed.length <= 48) score += 1;
  return score;
}

const CATALOG_PAGE_CACHE_TTL_MS = 180_000;
const MAX_CATALOG_CACHE_SIZE = 120;
const catalogPageCache = new Map<string, { timestamp: number; result: CatalogPageResult }>();

/**
 * Verifică sincron dacă o căutare de catalog se află deja în memoria cache (TTL 3 min),
 * permițând afișarea instantanee (0 ms) înainte de orice apel de rețea.
 */
export function getCachedCatalogPage(options: {
  query?: string;
  categorySlug?: string | null;
  brand?: string | null;
  retailerSlug?: string | null;
  sort?: CatalogSortMode;
  promoOnly?: boolean;
  limit?: number;
  offset?: number;
}): CatalogPageResult | null {
  const cleanQuery = (options.query ?? '').trim().replace(/\s+/g, ' ');
  const categorySlug = options.categorySlug ?? null;
  const brand = options.brand ?? null;
  const retailerSlug = options.retailerSlug ?? null;
  const sort: CatalogSortMode = options.sort ?? 'relevance';
  const promoOnly = Boolean(options.promoOnly);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 60);
  const offset = Math.max(options.offset ?? 0, 0);

  const cacheKey = `${cleanQuery}|${categorySlug ?? ''}|${brand ?? ''}|${retailerSlug ?? ''}|${sort}|${promoOnly}|${limit}|${offset}`;
  const cached = catalogPageCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CATALOG_PAGE_CACHE_TTL_MS) {
    return cached.result;
  }
  return null;
}

/**
 * Pre-încarcă silențios în fundal o interogare frecventă în memoria cache.
 */
export async function prefetchCatalogProductsPage(options: {
  query?: string;
  categorySlug?: string | null;
  brand?: string | null;
  retailerSlug?: string | null;
  sort?: CatalogSortMode;
  promoOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<void> {
  try {
    await fetchCatalogProductsPage({
      ...options,
      offset: options.offset ?? 0,
    });
  } catch {
    // ignoră erorile de prefetch pasiv
  }
}

/**
 * Returnează o pagină de produse prin noul motor de căutare `search_beavy_products_v2`
 * (matching multi-termen, cod EAN, toleranță la greșeli, filtre magazin/promoție și prețuri live).
 */
export async function fetchCatalogProductsPage(options: {
  query?: string;
  categorySlug?: string | null;
  brand?: string | null;
  retailerSlug?: string | null;
  sort?: CatalogSortMode;
  promoOnly?: boolean;
  limit?: number;
  offset?: number;
  includeFamilies?: boolean;
}): Promise<CatalogPageResult> {
  const cleanQuery = (options.query ?? '').trim().replace(/\s+/g, ' ');
  const categorySlug = options.categorySlug ?? null;
  const brand = options.brand ?? null;
  const retailerSlug = options.retailerSlug ?? null;
  const sort: CatalogSortMode = options.sort ?? 'relevance';
  const promoOnly = Boolean(options.promoOnly);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 60);
  const offset = Math.max(options.offset ?? 0, 0);

  const cacheKey = `${cleanQuery}|${categorySlug ?? ''}|${brand ?? ''}|${retailerSlug ?? ''}|${sort}|${promoOnly}|${limit}|${offset}`;
  const cached = catalogPageCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CATALOG_PAGE_CACHE_TTL_MS) {
    return cached.result;
  }

  const isProduceCategory =
    categorySlug !== null &&
    ['fructe-proaspete', 'legume-proaspete', 'fructe-legume', 'fructe', 'legume'].includes(
      categorySlug
    );

  const fetchRpcPage = (
    pageOffset: number,
    pageLimit: number,
    query: string = cleanQuery
  ) =>
    withCatalogTimeout((signal) =>
      supabase
        .rpc('search_beavy_products_v2', {
          p_query: query || null,
          p_category_slug: categorySlug,
          p_brand: brand,
          p_retailer_slug: retailerSlug,
          p_sort: sort,
          p_promo_only: promoOnly,
          p_limit: pageLimit,
          p_offset: pageOffset,
        })
        .abortSignal(signal)
    );

  // Căutare directă pe cod EAN/UPC + fallback automat Open Food Facts -> catalog Beavy
  if (/^[0-9]{8,14}$/.test(cleanQuery) && offset === 0) {
    // 1) Verificăm mai întâi dacă motorul SQL v2 găsește direct produsul cu ofertele active grupate
    const directV2Res = await fetchRpcPage(0, limit).catch(() => ({ data: null, error: null }));
    if (directV2Res.data && Array.isArray(directV2Res.data) && directV2Res.data.length > 0) {
      const prods = (directV2Res.data as Record<string, unknown>[]).map(mapV2RowToDisplayProduct);
      if (prods.length > 0) {
        return {
          products: prods,
          families: [],
          totalCount: prods.length,
          hasMore: false,
          barcodeHint: `Cod EAN ${cleanQuery} găsit în catalogul Beavy.`,
          barcodeSuggestedQuery: null,
        };
      }
    }

    // 2) Fallback dacă EAN-ul nu este mapat încă în DB (Open Food Facts + căutare inteligentă pe brand/gamă)
    const resolved = await resolveBarcodeViaCatalogOrExternal(cleanQuery);
    let eanMatches = resolved.products;
    if (retailerSlug) {
      eanMatches = eanMatches.filter((p) =>
        (p.retailer_slugs ?? []).includes(retailerSlug)
      );
    }
    if (categorySlug) {
      eanMatches = eanMatches.filter((p) => p.category_slug === categorySlug);
    }
    if (promoOnly) {
      eanMatches = eanMatches.filter((p) => Boolean(p.has_promo || p.has_loyalty));
    }
    return {
      products: eanMatches.slice(0, limit),
      families: [],
      totalCount: eanMatches.length,
      hasMore: false,
      barcodeHint: resolved.barcodeHint,
      barcodeSuggestedQuery: resolved.suggestedQuery,
    };
  }

  const isProduceQuery =
    offset === 0 &&
    cleanQuery.length >= 2 &&
    extractFreshProduceGenericKey(cleanQuery) !== null;

  // Return product cards as soon as the primary, indexed product RPC completes.
  // Semantic family suggestions are loaded separately so a slower secondary RPC
  // cannot hold the visible product results behind it.
  const v2Res = await fetchRpcPage(
    offset,
    isProduceQuery
      ? Math.max(limit, 60)
      : isProduceCategory
        ? Math.min(45, limit + 12)
        : limit
  );

  if (v2Res.error) {
    throw new Error(`Căutarea Beavy v2 a eșuat: ${v2Res.error.message}`);
  }

  const rows = Array.isArray(v2Res.data)
    ? (v2Res.data as Record<string, unknown>[])
    : [];
  const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
  let rawProducts = rows.map(mapV2RowToDisplayProduct);
  let relaxedCoverageApplied = false;

  // Fallback de acoperire cross-retailer: dacă interogarea completă este prea
  // restrictivă (ex. „Monster Energy Ultra” nu găsește „MONSTER ULTRA ZERO”
  // de la Kaufland), repetăm fără cuvintele descriptive de categorie și
  // păstrăm doar rezultatele care respectă restul termenilor.
  if (
    offset === 0 &&
    sort === 'relevance' &&
    !brand &&
    !retailerSlug &&
    limit >= 6 &&
    cleanQuery.length >= 3 &&
    rawProducts.length < Math.min(8, limit)
  ) {
    const queryWords = catalogQueryWords(cleanQuery);
    const relaxedQueries = buildRelaxedCatalogQueries(cleanQuery);

    if (queryWords.length >= 2 && relaxedQueries.length > 0) {
      const relaxedResults = await Promise.all(
        relaxedQueries.map((relaxedQuery) =>
          fetchRpcPage(
            0,
            Math.min(Math.max(limit * 2, 20), 60),
            relaxedQuery
          ).catch(() => ({ data: null, error: null }))
        )
      );

      const anchorWord =
        queryWords
          .filter((word) => !CATALOG_RELAXABLE_QUERY_WORDS.has(word))
          .sort((a, b) => b.length - a.length)[0] ?? null;
      const requiredMatches = Math.min(2, queryWords.length);
      const seenIds = new Set(rawProducts.map((product) => product.id));

      for (const relaxedRes of relaxedResults) {
        if (!Array.isArray(relaxedRes.data)) continue;
        for (const row of relaxedRes.data as Record<string, unknown>[]) {
          const product = mapV2RowToDisplayProduct(row);
          if (seenIds.has(product.id)) continue;

          const haystack = normalizeCatalogSearchText(
            `${product.canonical_name} ${product.brand ?? ''}`
          );
          if (anchorWord && !haystack.includes(anchorWord)) continue;
          if (countCatalogQueryMatches(product, queryWords) < requiredMatches) {
            continue;
          }

          seenIds.add(product.id);
          rawProducts.push(product);
        }
      }

      relaxedCoverageApplied = rawProducts.length > rows.length;
    }
  }

  // Filtrăm gustările/sucurile/batoanele clasificate greșit de DB în „Fructe proaspete” / „Fructe și legume”
  if (isProduceCategory) {
    rawProducts = rawProducts.filter(
      (p) => !isProcessedNonFreshProduce(p.canonical_name)
    );
  }

  let products = deduplicateCatalogProducts(rawProducts);

  // La căutări text (ex. „banane”, „mere”), ridicăm sus fructele/produsele de bază înaintea băuturilor/batoanelor cu aromă
  if (cleanQuery.length >= 2 && sort === 'relevance' && products.length > 1) {
    products = [...products].sort((a, b) => {
      const mA = matchesGenericTermCandidate(cleanQuery, a.canonical_name);
      const mB = matchesGenericTermCandidate(cleanQuery, b.canonical_name);
      if (mA.matches !== mB.matches) return mA.matches ? -1 : 1;
      if (Math.abs(mB.score - mA.score) > 0.05) return mB.score - mA.score;
      return (b.store_count ?? 0) - (a.store_count ?? 0);
    });
  }

  const pageProducts = isProduceCategory ? products.slice(0, limit) : products;
  const pageResult: CatalogPageResult = {
    products: pageProducts,
    families: [],
    // După relaxarea interogării, lista include deja toate magazinele găsite;
    // nu expunem o paginare care ar reinteroga varianta restrictivă.
    totalCount: relaxedCoverageApplied ? pageProducts.length : totalCount,
    hasMore: relaxedCoverageApplied ? false : offset + rows.length < totalCount,
  };

  if (catalogPageCache.size >= MAX_CATALOG_CACHE_SIZE) {
    const oldestKey = catalogPageCache.keys().next().value;
    if (oldestKey) catalogPageCache.delete(oldestKey);
  }
  catalogPageCache.set(cacheKey, { timestamp: Date.now(), result: pageResult });

  return pageResult;
}

export async function fetchCatalogProductFamilies(
  query: string,
  categorySlug?: string | null
): Promise<BeavyFamilySearchResult[]> {
  const cleanQuery = query.trim().replace(/\s+/g, ' ');
  if (cleanQuery.length < 2 || /^[0-9]{8,14}$/.test(cleanQuery)) return [];
  return searchBeavyCatalog(cleanQuery, { limit: 18, categorySlug });
}

export type GenericTermCrossStoreResult = {
  term: string;
  retailerOffers: BeavyProductOffer[];
  matchedProducts: DisplayProduct[];
};

/**
 * Caută un termen generic (ex. „Banane”) în toate magazinele active indiferent de brand/firmă,
 * agregând cea mai bună ofertă per magazin (comparată pe RON/kg când există unitate de greutate).
 */
export async function searchGenericTermAcrossRetailers(
  rawTerm: string,
  city?: string
): Promise<GenericTermCrossStoreResult> {
  const cleanTerm = rawTerm.trim().replace(/\s+/g, ' ');
  if (cleanTerm.length < 2) {
    return { term: cleanTerm, retailerOffers: [], matchedProducts: [] };
  }

  const matchedProfiles = await resolveGenericTermCatalogMatches(cleanTerm, 60).catch(
    () => [] as CatalogProductProfile[]
  );

  if (matchedProfiles.length === 0) {
    return { term: cleanTerm, retailerOffers: [], matchedProducts: [] };
  }

  const matchedProducts: DisplayProduct[] = matchedProfiles.map((prof) => ({
    id: prof.id,
    canonical_name: prof.canonical_name,
    brand: prof.brand,
    package_size: prof.package_size,
    image_url: resolveProductImageUrl(
      prof.image_url ?? null,
      prof.canonical_name,
      prof.category,
      null
    ),
    category_name: prof.category ?? undefined,
    subcategory: prof.subcategory ?? null,
  }));

  const ids = matchedProducts.map((p) => p.id);
  let offers = await fetchVerifiedOffersForProducts(ids, city).catch(
    () => [] as BeavyProductOffer[]
  );
  if (offers.length === 0 && city) {
    offers = await fetchVerifiedOffersForProducts(ids).catch(
      () => [] as BeavyProductOffer[]
    );
  }

  const profileById = new Map<string, CatalogProductProfile>(
    matchedProfiles.map((p) => [p.id, p])
  );

  const enrichOfferUnit = (offer: BeavyProductOffer): BeavyProductOffer => {
    const prof = offer.product_id ? profileById.get(offer.product_id) : undefined;
    const est = estimateProductUnitPricing(
      offer.price,
      offer.package_size ?? prof?.package_size,
      prof?.canonical_name,
      offer.normalized_unit_price,
      offer.normalized_unit_label
    );
    if (est.estimatedPerKg !== null && offer.normalized_unit_label !== 'RON/kg') {
      return {
        ...offer,
        normalized_unit_price: est.estimatedPerKg,
        normalized_unit_label: 'RON/kg',
      };
    }
    if (est.estimatedPerBuc !== null && !offer.normalized_unit_label) {
      return {
        ...offer,
        normalized_unit_price: est.estimatedPerBuc,
        normalized_unit_label: 'RON/buc',
      };
    }
    return offer;
  };

  const pickBestForStore = (
    cur: BeavyProductOffer | undefined,
    cand: BeavyProductOffer
  ): BeavyProductOffer => {
    if (!cur) return cand;
    const curKg =
      cur.normalized_unit_label === 'RON/kg' && cur.normalized_unit_price
        ? cur.normalized_unit_price
        : null;
    const candKg =
      cand.normalized_unit_label === 'RON/kg' && cand.normalized_unit_price
        ? cand.normalized_unit_price
        : null;
    if (curKg !== null && candKg !== null && Math.abs(candKg - curKg) > 0.05) {
      return candKg < curKg ? cand : cur;
    }
    if (curKg === null && candKg !== null) return cand;
    if (curKg !== null && candKg === null) return cur;
    const curUnit = cur.normalized_unit_price ?? cur.price;
    const candUnit = cand.normalized_unit_price ?? cand.price;
    return candUnit < curUnit ? cand : cur;
  };

  const bestByRetailer = new Map<string, BeavyProductOffer>();
  for (const rawOffer of offers) {
    if (rawOffer.stock_status === 'out_of_stock') continue;
    const offer = enrichOfferUnit(rawOffer);
    const rKey = (offer.retailer_id ?? offer.retailer_name).toLowerCase();
    bestByRetailer.set(rKey, pickBestForStore(bestByRetailer.get(rKey), offer));
  }

  const retailerOffers = Array.from(bestByRetailer.values()).sort((a, b) => {
    const aKg = a.normalized_unit_label === 'RON/kg' ? a.normalized_unit_price : null;
    const bKg = b.normalized_unit_label === 'RON/kg' ? b.normalized_unit_price : null;
    if (aKg !== null && bKg !== null && Math.abs(aKg - bKg) > 0.05) {
      return aKg - bKg;
    }
    return a.price - b.price;
  });

  return {
    term: cleanTerm,
    retailerOffers,
    matchedProducts,
  };
}

function toQuickMatchProfile(p: DisplayProduct): CatalogProductProfile {
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
    attributes: {},
    familyIds: [],
    canonical_fingerprint: p.canonical_fingerprint ?? null,
  };
}

/**
 * Unifică produsele canonice identice din catalog (UUID-uri duplicate sau sparte între retaileri)
 * într-o singură carte de produs cu toate magazinele și prețul minim/maxim real agregate.
 */
export function deduplicateCatalogProducts(products: DisplayProduct[]): DisplayProduct[] {
  if (products.length <= 1) return products;

  type Cluster = {
    rep: DisplayProduct;
    repProfile: CatalogProductProfile;
    freshProduceKey: string | null;
    identityKey: string | null;
    mergedIds: Set<string>;
    retailerSlugs: Set<string>;
  };

  const clusters: Cluster[] = [];

  for (const item of products) {
    const itemProfile = toQuickMatchProfile(item);
    const itemProduceKey = extractFreshProduceGenericKey(itemProfile);
    const itemIdentityKey = buildCatalogProductIdentityKey(item);
    let targetCluster: Cluster | null = null;

    for (const cluster of clusters) {
      if (cluster.mergedIds.has(item.id)) {
        targetCluster = cluster;
        break;
      }
      // Produse din linii cunoscute, dar cu arome diferite, nu se contopesc.
      if (
        itemIdentityKey &&
        cluster.identityKey &&
        itemIdentityKey !== cluster.identityKey
      ) {
        continue;
      }
      if (
        item.canonical_fingerprint &&
        cluster.rep.canonical_fingerprint &&
        item.canonical_fingerprint === cluster.rep.canonical_fingerprint
      ) {
        targetCluster = cluster;
        break;
      }
      if (itemIdentityKey && cluster.identityKey === itemIdentityKey) {
        targetCluster = cluster;
        break;
      }
      if (itemProduceKey && cluster.freshProduceKey === itemProduceKey) {
        targetCluster = cluster;
        break;
      }
      if (
        item.barcode &&
        cluster.rep.barcode &&
        item.barcode.trim() === cluster.rep.barcode.trim()
      ) {
        targetCluster = cluster;
        break;
      }
      const shareBrandCandidate =
        Boolean(cluster.rep.brand?.trim() && item.brand?.trim()) &&
        cluster.rep.brand!.trim().toLowerCase() === item.brand!.trim().toLowerCase();
      const resMatch = computeProductMatchScore(cluster.repProfile, itemProfile, {
        skipCategoryCheck: shareBrandCandidate,
      });
      if (resMatch.isCrossCanonicalExact) {
        targetCluster = cluster;
        break;
      }
    }

    if (!targetCluster) {
      clusters.push({
        rep: {
          ...item,
          mergedProductIds: item.mergedProductIds
            ? [...item.mergedProductIds]
            : [item.id],
        },
        repProfile: itemProfile,
        freshProduceKey: itemProduceKey,
        identityKey: itemIdentityKey,
        mergedIds: new Set(item.mergedProductIds ?? [item.id]),
        retailerSlugs: new Set(item.retailer_slugs ?? []),
      });
      continue;
    }

    if (!targetCluster.identityKey && itemIdentityKey) {
      targetCluster.identityKey = itemIdentityKey;
    }
    for (const id of item.mergedProductIds ?? [item.id]) {
      targetCluster.mergedIds.add(id);
    }
    for (const slug of item.retailer_slugs ?? []) {
      if (slug) targetCluster.retailerSlugs.add(slug);
    }
    if (item.cheapest_retailer_slug) {
      targetCluster.retailerSlugs.add(item.cheapest_retailer_slug);
    }

    const rep = targetCluster.rep;
    const itemHasLowerMin =
      item.min_price != null &&
      (rep.min_price == null || item.min_price < rep.min_price);
    const mergedMin = itemHasLowerMin ? item.min_price : rep.min_price;
    const mergedMax =
      item.max_price != null &&
      (rep.max_price == null || item.max_price > rep.max_price)
        ? item.max_price
        : rep.max_price;
    const mergedRegMin =
      item.regular_min_price != null &&
      (rep.regular_min_price == null || item.regular_min_price < rep.regular_min_price)
        ? item.regular_min_price
        : rep.regular_min_price;

    const isFreshCluster = targetCluster.freshProduceKey !== null;
    const sameKnownIdentity =
      !isFreshCluster &&
      itemIdentityKey !== null &&
      itemIdentityKey === targetCluster.identityKey;

    // Identitatea cardului urmează produsul cu cea mai bună acoperire de magazine.
    const itemIsBetterIdentity =
      (item.store_count ?? 0) > (rep.store_count ?? 0) ||
      (!rep.image_url && Boolean(item.image_url));

    // Pentru liniile cunoscute, titlul urmează cea mai lizibilă denumire canonică,
    // nu neapărat produsul cu cele mai multe oferte (ex. abrevierea „ALRO”).
    const itemTitleQuality = catalogTitleQualityScore(item.canonical_name);
    const repTitleQuality = catalogTitleQualityScore(rep.canonical_name);
    const preferItemTitle = isFreshCluster
      ? false
      : sameKnownIdentity
        ? itemTitleQuality > repTitleQuality ||
          (itemTitleQuality === repTitleQuality && itemIsBetterIdentity)
        : itemIsBetterIdentity;

    const canonicalTitle = isFreshCluster
      ? getFreshProduceCanonicalTitle(targetCluster.freshProduceKey!)
      : preferItemTitle
        ? item.canonical_name
        : rep.canonical_name;

    targetCluster.rep = {
      ...(itemIsBetterIdentity ? item : rep),
      id: itemIsBetterIdentity ? item.id : rep.id,
      canonical_name: canonicalTitle,
      image_url: rep.image_url || item.image_url,
      barcode: isFreshCluster ? null : rep.barcode || item.barcode || null,
      package_size: isFreshCluster
        ? 'vrac / per kg'
        : rep.package_size || item.package_size || null,
      // Pentru liniile unificate păstrăm brandul în titlu (denumirile curate
      // conțin deja brandul), evitând dublarea sau tăierea lui la afișare.
      brand: isFreshCluster || sameKnownIdentity
        ? null
        : rep.brand || item.brand || null,
      min_price: mergedMin ?? null,
      max_price: mergedMax ?? null,
      regular_min_price: mergedRegMin ?? null,
      has_promo: Boolean(rep.has_promo || item.has_promo),
      has_loyalty: Boolean(rep.has_loyalty || item.has_loyalty),
      cheapest_retailer_slug: itemHasLowerMin
        ? item.cheapest_retailer_slug
        : rep.cheapest_retailer_slug,
      cheapest_retailer_name: itemHasLowerMin
        ? item.cheapest_retailer_name
        : rep.cheapest_retailer_name,
      retailer_slugs: Array.from(targetCluster.retailerSlugs),
      store_count: targetCluster.retailerSlugs.size,
      mergedProductIds: Array.from(targetCluster.mergedIds),
      canonical_fingerprint: rep.canonical_fingerprint || item.canonical_fingerprint || null,
    };
    targetCluster.repProfile = toQuickMatchProfile(targetCluster.rep);
  }

  return clusters.map((c) => ({
    ...c.rep,
    retailer_slugs: Array.from(c.retailerSlugs),
    store_count: Math.max(c.rep.store_count ?? 0, c.retailerSlugs.size),
    mergedProductIds: Array.from(c.mergedIds),
  }));
}

/**
 * Caută direct un produs în `beavy_products.barcode` și în `beavy_product_offers.raw_data->>ean`,
 * inclusiv variante UPC-12 / EAN-13 cu zero inițial, și hidratează prețurile live din magazine.
 */
export async function searchCatalogProductsByBarcode(
  rawBarcode: string
): Promise<DisplayProduct[]> {
  const digits = rawBarcode.replace(/\D/g, '').trim();
  if (digits.length < 6) return [];

  const variantSet = new Set<string>([digits]);
  if (digits.length === 12) variantSet.add(`0${digits}`);
  if (digits.length === 13 && digits.startsWith('0')) variantSet.add(digits.slice(1));
  const variants = Array.from(variantSet);
  const eanFingerprints = variants.map((v) => `ean:${v}`);
  const observedAfter = new Date(Date.now() - MAX_VERIFIED_OFFER_AGE_MS).toISOString();

  const [directProdRes, fingerprintProdRes, rawOfferEanRes] = await Promise.all([
    withCatalogTimeout((signal) =>
      supabase
        .from('beavy_products')
        .select('id,canonical_name,brand,package_size,image_url,barcode,category,subcategory,canonical_fingerprint')
        .eq('is_active', true)
        .in('barcode', variants)
        .limit(12)
        .abortSignal(signal)
    ),
    withCatalogTimeout((signal) =>
      supabase
        .from('beavy_products')
        .select('id,canonical_name,brand,package_size,image_url,barcode,category,subcategory,canonical_fingerprint')
        .eq('is_active', true)
        .in('canonical_fingerprint', eanFingerprints)
        .limit(12)
        .abortSignal(signal)
    ).catch(() => ({ data: [] as Record<string, unknown>[], error: null })),
    withCatalogTimeout((signal) =>
      supabase
        .from('beavy_product_offers')
        .select('product_id')
        .eq('is_active', true)
        .gte('observed_at', observedAfter)
        .in('raw_data->>ean', variants)
        .limit(20)
        .abortSignal(signal)
    ).catch(() => ({ data: [] as Record<string, unknown>[], error: null })),
  ]);

  const prodRowsById = new Map<string, Record<string, unknown>>();
  for (const row of (directProdRes.data ?? []) as Record<string, unknown>[]) {
    if (row.id) prodRowsById.set(String(row.id), row);
  }
  for (const row of (fingerprintProdRes.data ?? []) as Record<string, unknown>[]) {
    if (row.id && !prodRowsById.has(String(row.id))) {
      prodRowsById.set(String(row.id), row);
    }
  }

  const missingProductIds = Array.from(
    new Set(
      ((rawOfferEanRes.data ?? []) as Record<string, unknown>[])
        .map((r) => (r.product_id ? String(r.product_id) : null))
        .filter((id): id is string => id !== null && !prodRowsById.has(id))
    )
  );

  if (missingProductIds.length > 0) {
    const extraProdRes = await withCatalogTimeout((signal) =>
      supabase
        .from('beavy_products')
        .select('id,canonical_name,brand,package_size,image_url,barcode,category,subcategory')
        .eq('is_active', true)
        .in('id', missingProductIds)
        .limit(20)
        .abortSignal(signal)
    );
    for (const row of (extraProdRes.data ?? []) as Record<string, unknown>[]) {
      if (row.id) prodRowsById.set(String(row.id), row);
    }
  }

  const allProductIds = Array.from(prodRowsById.keys());
  if (allProductIds.length === 0) return [];

  const [offersRes, retailersRes] = await Promise.all([
    withCatalogTimeout((signal) =>
      supabase
        .from('beavy_product_offers')
        .select(
          'product_id,retailer_id,retailer_name,price,regular_price,promo_price,loyalty_price,promo_label,promo_requires_card,stock_status,observed_at,valid_until'
        )
        .in('product_id', allProductIds)
        .eq('is_active', true)
        .gte('observed_at', observedAfter)
        .limit(200)
        .abortSignal(signal)
    ),
    withCatalogTimeout((signal) =>
      supabase
        .from('beavy_retailers')
        .select('id,slug,name')
        .eq('is_active', true)
        .abortSignal(signal)
    ),
  ]);

  const slugByRetailerId = new Map<string, string>();
  const slugByRetailerName = new Map<string, string>();
  for (const r of (retailersRes.data ?? []) as Record<string, unknown>[]) {
    const slug = String(r.slug ?? '');
    if (r.id && slug) slugByRetailerId.set(String(r.id), slug);
    if (r.name && slug) slugByRetailerName.set(String(r.name).toLowerCase(), slug);
  }

  const offersByProd = new Map<string, Record<string, unknown>[]>();
  for (const o of (offersRes.data ?? []) as Record<string, unknown>[]) {
    const pid = o.product_id ? String(o.product_id) : null;
    if (
      !pid ||
      String(o.stock_status ?? '') === 'out_of_stock' ||
      !isFreshVerifiedOffer({
        observed_at: String(o.observed_at ?? ''),
        valid_until: o.valid_until ? String(o.valid_until) : null,
      })
    ) continue;
    const list = offersByProd.get(pid) ?? [];
    list.push(o);
    offersByProd.set(pid, list);
  }

  const results: DisplayProduct[] = [];
  for (const [pid, prod] of prodRowsById.entries()) {
    const prodOffers = offersByProd.get(pid) ?? [];
    let minPrice: number | null = null;
    let maxPrice: number | null = null;
    let regularMinPrice: number | null = null;
    let hasPromo = false;
    let hasLoyalty = false;
    let cheapestSlug: string | null = null;
    let cheapestName: string | null = null;
    const retailerSlugs = new Set<string>();

    for (const o of prodOffers) {
      const price = Number(o.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      const reg = o.regular_price != null ? Number(o.regular_price) : null;
      const loy = o.loyalty_price != null ? Number(o.loyalty_price) : null;
      const promo = o.promo_price != null ? Number(o.promo_price) : null;
      const rName = String(o.retailer_name ?? '');
      const rSlug =
        (o.retailer_id ? slugByRetailerId.get(String(o.retailer_id)) : undefined) ??
        slugByRetailerName.get(rName.toLowerCase()) ??
        rName.toLowerCase().replace(/\s+/g, '-');
      if (rSlug) retailerSlugs.add(rSlug);

      if (minPrice === null || price < minPrice) {
        minPrice = price;
        cheapestSlug = rSlug || null;
        cheapestName = rName || null;
      }
      if (maxPrice === null || price > maxPrice) maxPrice = price;
      if (reg !== null && Number.isFinite(reg) && (regularMinPrice === null || reg < regularMinPrice)) {
        regularMinPrice = reg;
      }
      if (promo !== null || (reg !== null && reg > price) || Boolean(o.promo_label)) {
        hasPromo = true;
      }
      if (loy !== null || Boolean(o.promo_requires_card)) {
        hasLoyalty = true;
      }
    }

    const canonicalName = String(prod.canonical_name ?? '');
    const categoryName = prod.category ? String(prod.category) : undefined;
    results.push({
      id: pid,
      canonical_name: canonicalName,
      brand: prod.brand ? String(prod.brand) : null,
      package_size: prod.package_size ? String(prod.package_size) : null,
      image_url: resolveProductImageUrl(
        prod.image_url ? String(prod.image_url) : null,
        canonicalName,
        categoryName
      ),
      barcode: prod.barcode ? String(prod.barcode) : digits,
      category_name: categoryName,
      category_slug: null,
      subcategory: prod.subcategory ? String(prod.subcategory) : null,
      min_price: minPrice,
      max_price: maxPrice,
      regular_min_price: regularMinPrice,
      store_count: retailerSlugs.size,
      has_promo: hasPromo,
      has_loyalty: hasLoyalty,
      cheapest_retailer_slug: cheapestSlug,
      cheapest_retailer_name: cheapestName,
      retailer_slugs: Array.from(retailerSlugs),
    });
  }

  return results.sort((a, b) => (b.store_count ?? 0) - (a.store_count ?? 0));
}

/**
 * Fallback inteligent pentru coduri de bare nemapate încă în `beavy_products.barcode`:
 * 1) Caută în DB Beavy (`barcode` + `raw_data->>ean`);
 * 2) Dacă produsul nu are EAN în DB, interoghează Open Food Facts (CORS OK, gratuit)
 *    pentru nume/brand/cantitate și caută matematic echivalentul exact în catalogul Beavy.
 */
export async function resolveBarcodeViaCatalogOrExternal(rawBarcode: string): Promise<{
  products: DisplayProduct[];
  barcodeHint: string | null;
  suggestedQuery: string | null;
  source: 'beavy_db' | 'open_food_facts' | 'not_found';
}> {
  const digits = rawBarcode.replace(/\D/g, '').trim();
  if (digits.length < 6) {
    return { products: [], barcodeHint: null, suggestedQuery: null, source: 'not_found' };
  }

  const localHits = deduplicateCatalogProducts(
    await searchCatalogProductsByBarcode(digits)
  );
  if (localHits.length > 0) {
    return {
      products: localHits,
      barcodeHint: `Cod EAN ${digits} găsit direct în catalogul Beavy.`,
      suggestedQuery: null,
      source: 'beavy_db',
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
        digits
      )}.json?fields=code,product_name,product_name_ro,product_name_en,generic_name,brands,quantity,categories,categories_tags,image_front_url`,
      { signal: controller.signal }
    ).finally(() => clearTimeout(timer));

    if (!res.ok) {
      return {
        products: [],
        barcodeHint: `Codul EAN ${digits} nu este asociat încă niciunui produs. Caută după nume sau brand.`,
        suggestedQuery: null,
        source: 'not_found',
      };
    }

    const payload = (await res.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        product_name_ro?: string;
        product_name_en?: string;
        generic_name?: string;
        brands?: string;
        quantity?: string;
        categories?: string;
        categories_tags?: string[];
        image_front_url?: string;
      };
    };

    const offProd = payload?.status === 1 ? payload.product : undefined;
    const rawName = String(
      offProd?.product_name_ro || offProd?.product_name || offProd?.product_name_en || offProd?.generic_name || ''
    ).trim();
    const rawBrandRaw = String(offProd?.brands || '')
      .split(',')[0]
      .trim();
    const rawBrand = rawBrandRaw
      .replace(/\b(services|s\.?a\.?\/?n\.?v\.?|s\.?r\.?l\.?|gmbh|llc|inc|nv|bv)\b/gi, '')
      .replace(/[/,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const brandVariants = Array.from(
      new Set(
        [
          rawBrand,
          rawBrand.replace(/['’]/g, ''),
          rawBrand.replace(/['’]s\b/gi, ''),
        ]
          .map((b) => b.trim())
          .filter((b) => b.length >= 2)
      )
    );

    let inferredType = '';
    if (!rawName && (offProd?.categories || offProd?.categories_tags)) {
      const catText = `${offProd.categories || ''} ${(offProd.categories_tags || []).join(' ')}`.toLowerCase();
      if (/crisp|chip|kartoffelchip/i.test(catText)) inferredType = 'Chipsuri';
      else if (/biscuit|cookie/i.test(catText)) inferredType = 'Biscuiți';
      else if (/chocolate|ciocolat/i.test(catText)) inferredType = 'Ciocolată';
      else if (/snack/i.test(catText)) inferredType = 'Snacks';
      else if (/beer|bere/i.test(catText)) inferredType = 'Bere';
      else if (/juice|suc/i.test(catText)) inferredType = 'Suc';
      else if (/yogurt|iaurt/i.test(catText)) inferredType = 'Iaurt';
      else if (/milk|lapte/i.test(catText)) inferredType = 'Lapte';
      else if (/coffee|cafea/i.test(catText)) inferredType = 'Cafea';
      else if (/water|apa/i.test(catText)) inferredType = 'Apă minerală';
    }

    const effectiveName = rawName || inferredType;
    const rawQty = String(offProd?.quantity || '').trim();

    if (!effectiveName && !rawBrand) {
      return {
        products: [],
        barcodeHint: `Codul EAN ${digits} nu este încă mapat în catalog. Încearcă căutarea după nume sau brand.`,
        suggestedQuery: null,
        source: 'not_found',
      };
    }

    const brandInName =
      rawBrand && effectiveName.toLowerCase().includes(rawBrand.toLowerCase());
    const fullLabel = [brandInName ? '' : rawBrand, effectiveName, rawQty]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const extractWords = (txt: string) =>
      txt
        .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2);

    const nameWords = extractWords(effectiveName);
    const brandWords = extractWords(rawBrand);
    const shortNameQuery = nameWords.slice(0, 4).join(' ');
    const brandPlusNameQuery = Array.from(
      new Set([...brandWords.slice(0, 2), ...nameWords.slice(0, 3)])
    ).join(' ');

    const expandSugarAliases = (q: string): string[] => {
      if (!q) return [];
      const out = [q];
      if (/\bmax\b/i.test(q)) {
        out.push(q.replace(/\bmax\b/gi, 'zero'));
      } else if (/\bzero\b/i.test(q)) {
        out.push(q.replace(/\bzero\b/gi, 'max'));
      }
      return out;
    };

    const seedQueries: string[] = [];
    const spaceQty = rawQty ? rawQty.replace(/([0-9]+)\s*([a-zA-Z]+)/, '$1 $2').trim() : '';

    for (const bv of (brandVariants.length > 0 ? brandVariants : [rawBrand])) {
      if (effectiveName && rawQty) {
        seedQueries.push(`${bv} ${effectiveName} ${rawQty}`);
        if (spaceQty && spaceQty !== rawQty) seedQueries.push(`${bv} ${effectiveName} ${spaceQty}`);
      }
      if (rawQty) {
        seedQueries.push(`${bv} ${rawQty}`);
        if (spaceQty && spaceQty !== rawQty) seedQueries.push(`${bv} ${spaceQty}`);
      }
      if (effectiveName) {
        seedQueries.push(`${bv} ${effectiveName}`);
      }
      seedQueries.push(bv);
    }

    if (effectiveName) {
      if (rawQty) seedQueries.push(`${effectiveName} ${rawQty}`);
      seedQueries.push(effectiveName);
    }
    if (shortNameQuery) {
      if (rawQty) seedQueries.push(`${shortNameQuery} ${rawQty}`);
      seedQueries.push(shortNameQuery);
    }
    if (brandPlusNameQuery) {
      if (rawQty) seedQueries.push(`${brandPlusNameQuery} ${rawQty}`);
      seedQueries.push(brandPlusNameQuery);
    }

    const queryAttempts = Array.from(
      new Set(
        seedQueries
          .flatMap((q) => expandSugarAliases(q))
          .map((q) => q.replace(/\s+/g, ' ').trim())
          .filter((q) => q.length >= 2)
      )
    );

    const searchByText = async (q: string): Promise<DisplayProduct[]> => {
      if (q.length < 2) return [];
      const { data, error } = await withCatalogTimeout((signal) =>
        supabase
          .rpc('search_beavy_products_v2', {
            p_query: q,
            p_category_slug: null,
            p_brand: null,
            p_retailer_slug: null,
            p_sort: 'relevance',
            p_promo_only: false,
            p_limit: 40,
            p_offset: 0,
          })
          .abortSignal(signal)
      );
      if (error || !Array.isArray(data)) return [];
      return (data as Record<string, unknown>[]).map(mapV2RowToDisplayProduct);
    };

    const syntheticTarget: CatalogProductProfile = {
      id: `ean-${digits}`,
      canonical_name: fullLabel,
      brand: rawBrand || null,
      package_size: rawQty || null,
      quantity_value: null,
      quantity_unit: null,
      attributes: {},
      familyIds: [],
    };

    const candidateMap = new Map<string, DisplayProduct>();
    let compatibleOnes: { cand: DisplayProduct; score: number }[] = [];

    const scoreCandidateMap = (relaxOptions: { allowDifferentSize?: boolean } = {}) => {
      const scored = Array.from(candidateMap.values())
        .map((cand) => {
          const resMatch = computeProductMatchScore(
            syntheticTarget,
            {
              id: cand.id,
              canonical_name: cand.canonical_name,
              brand: cand.brand,
              package_size: cand.package_size,
              quantity_value: null,
              quantity_unit: null,
              category: cand.category_name ?? null,
              subcategory: cand.subcategory ?? null,
              attributes: {},
              familyIds: [],
            },
            {
              skipCategoryCheck: true,
              allowAsymmetricDomainTags: true,
              allowDifferentSize: relaxOptions.allowDifferentSize ?? false,
            }
          );
          return { cand, resMatch };
        })
        .filter((item) => item.resMatch.compatible)
        .sort((a, b) => {
          if (Math.abs(b.resMatch.score - a.resMatch.score) > 0.05) {
            return b.resMatch.score - a.resMatch.score;
          }
          return (b.cand.store_count ?? 0) - (a.cand.store_count ?? 0);
        });

      compatibleOnes = scored.map((item) => ({
        cand: item.cand,
        score: item.resMatch.score,
      }));
    };

    for (const attemptQuery of queryAttempts) {
      const batch = await searchByText(attemptQuery);
      if (batch.length === 0) continue;
      let added = false;
      for (const item of batch) {
        if (!candidateMap.has(item.id)) {
          candidateMap.set(item.id, item);
          added = true;
        }
      }
      if (added) {
        scoreCandidateMap();
        if (compatibleOnes.length > 0) break;
      }
    }

    let isSizeRelaxed = false;
    if (compatibleOnes.length === 0 && candidateMap.size > 0) {
      scoreCandidateMap({ allowDifferentSize: true });
      if (compatibleOnes.length > 0) {
        isSizeRelaxed = true;
      }
    }

    const cleanSuggest =
      (brandInName ? effectiveName : [rawBrand, effectiveName].filter(Boolean).join(' ')) ||
      rawBrand ||
      effectiveName ||
      null;
    const suggestedBrandQuery = rawBrand || cleanSuggest;

    if (candidateMap.size === 0 || compatibleOnes.length === 0) {
      const fallbackList = Array.from(candidateMap.values());
      let brandFallback =
        fallbackList.length > 0
          ? deduplicateCatalogProducts(fallbackList)
          : cleanSuggest
            ? await searchByText(cleanSuggest)
            : [];

      if (brandFallback.length === 0 && rawBrand) {
        brandFallback = await searchByText(rawBrand);
      }

      if (brandFallback.length > 0) {
        return {
          products: brandFallback,
          barcodeHint: `EAN ${digits} identificat ca „${fullLabel}”. Această variantă exactă nu are ofertă activă în magazinele partenere, dar îți afișăm produsele disponibile din gama ${rawBrand || 'acestui brand'}:`,
          suggestedQuery: suggestedBrandQuery,
          source: 'open_food_facts',
        };
      }

      return {
        products: [],
        barcodeHint:
          candidateMap.size === 0
            ? `EAN ${digits} identificat ca „${fullLabel}”, dar nu am găsit automat potrivirea în catalog.`
            : `EAN ${digits} identificat ca „${fullLabel}”, dar această variantă exactă${rawQty ? ` (${rawQty})` : ''} nu are ofertă activă în catalog.`,
        suggestedQuery: suggestedBrandQuery,
        source: 'open_food_facts',
      };
    }

    const ranked = deduplicateCatalogProducts(compatibleOnes.map((item) => item.cand));

    // Auto-persist: dacă am găsit o potrivire certă (scor >= 0.85) și nu este dimensiune relaxată, salvăm EAN-ul permanent în Supabase
    if (!isSizeRelaxed && compatibleOnes.length > 0 && compatibleOnes[0].score >= 0.85) {
      const best = compatibleOnes[0].cand;
      void (async () => {
        try {
          await supabase.rpc('beavy_bind_product_barcode', {
            p_product_id: best.id,
            p_barcode: digits,
          });
          best.barcode = digits;
          best.canonical_fingerprint = `ean:${digits}`;
        } catch {
          // ignore background persist failure
        }
      })();
    }

    const bannerText = isSizeRelaxed
      ? `EAN ${digits} identificat ca „${fullLabel}”. Varianta exactă${rawQty ? ` (${rawQty})` : ''} nu are ofertă activă, dar am găsit variantele disponibile ale mărcii în magazine:`
      : `EAN ${digits} identificat ca „${fullLabel}” · ${ranked.length === 1 ? 'potrivire exactă găsită' : 'potriviri compatibile găsite'} în catalog:`;

    return {
      products: ranked,
      barcodeHint: bannerText,
      suggestedQuery: suggestedBrandQuery,
      source: 'open_food_facts',
    };
  } catch {
    return {
      products: [],
      barcodeHint: `Codul EAN ${digits} nu este mapat încă în catalog. Încearcă căutarea după nume.`,
      suggestedQuery: null,
      source: 'not_found',
    };
  }
}

/**
 * Interoghează live Open Food Facts România pentru un produs din catalog fără cod de bare.
 * Dacă găsește un produs cu brand identic, gramaj compatibil și GS1 EAN valid (scor >= 85%),
 * salvează codul EAN în Supabase prin `beavy_bind_product_barcode` și îl returnează.
 */
export async function lookupAndBindEanFromOpenFoodFacts(product: {
  id: string;
  canonical_name: string;
  brand?: string | null;
  package_size?: string | null;
  category_name?: string | null;
  barcode?: string | null;
}): Promise<string | null> {
  if (product.barcode && product.barcode.trim().length >= 8) {
    return product.barcode.trim();
  }

  // Ignorăm produsele vrac proaspete fără brand (nu au EAN pe ambalaj)
  if (!product.brand || product.brand.trim().length < 2) {
    return null;
  }
  const cleanBrand = product.brand.trim();
  const cleanName = product.canonical_name.trim();

  try {
    const brandParam = encodeURIComponent(cleanBrand.toLowerCase());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const url = `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=romania&brands_tags=${brandParam}&fields=code,product_name,product_name_ro,generic_name,brands,quantity&page_size=6`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BeavyCatalogPipeline/1.0 (https://beavy.ro; contact@beavy.ro)' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;

    const data = (await res.json()) as {
      products?: {
        code?: string;
        product_name?: string;
        product_name_ro?: string;
        generic_name?: string;
        brands?: string;
        quantity?: string;
      }[];
    };

    const hits = data?.products ?? [];
    if (hits.length === 0) return null;

    const syntheticTarget: CatalogProductProfile = {
      id: product.id,
      canonical_name: cleanName,
      brand: cleanBrand,
      package_size: product.package_size || null,
      quantity_value: null,
      quantity_unit: null,
      category: product.category_name ?? null,
      attributes: {},
      familyIds: [],
    };

    let bestEan: string | null = null;
    let bestScore = 0;

    for (const hit of hits) {
      const code = String(hit.code ?? '').replace(/\D/g, '').trim();
      if (code.length < 8 || code.length > 14) continue;

      const hitTitle = String(hit.product_name_ro || hit.product_name || hit.generic_name || '').trim();
      if (!hitTitle) continue;

      const hitCandidate: CatalogProductProfile = {
        id: `off-${code}`,
        canonical_name: hitTitle,
        brand: String(hit.brands || cleanBrand).split(',')[0].trim(),
        package_size: hit.quantity || null,
        quantity_value: null,
        quantity_unit: null,
        category: product.category_name ?? null,
        attributes: {},
        familyIds: [],
      };

      const matchRes = computeProductMatchScore(syntheticTarget, hitCandidate, {
        skipCategoryCheck: true,
      });

      if (matchRes.compatible && matchRes.score >= 0.85 && matchRes.score > bestScore) {
        bestScore = matchRes.score;
        bestEan = code;
      }
    }

    if (bestEan && bestScore >= 0.85) {
      await supabase.rpc('beavy_bind_product_barcode', {
        p_product_id: product.id,
        p_barcode: bestEan,
      });
      return bestEan;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Returnează produsele dintr-o categorie specifică pe baza slug-ului din `beavy_categories`.
 */
export async function getProductsByCategorySlug(
  categorySlug: string,
  limit = 40
): Promise<DisplayProduct[]> {
  const res = await fetchCatalogProductsPage({
    categorySlug,
    limit,
    offset: 0,
  });
  return res.products;
}

/**
 * Returnează produsele populare implicite pentru afișarea rapidă în catalog.
 */
export async function getInitialPopularProducts(limit = 32): Promise<DisplayProduct[]> {
  const res = await fetchCatalogProductsPage({
    categorySlug: null,
    limit,
    offset: 0,
  });
  return res.products;
}

/**
 * Caută familii de produse în catalogul Beavy via RPC Supabase.
 */
export async function searchBeavyCatalog(
  query: string,
  options: { limit?: number; categorySlug?: string | null } = {}
): Promise<BeavyFamilySearchResult[]> {
  const cleanQuery = query.trim().replace(/\s+/g, ' ');
  if (cleanQuery.length < 2) return [];

  const { data, error } = await withCatalogTimeout((signal) =>
    supabase
      .rpc('search_beavy_catalog', {
        p_query: cleanQuery,
        p_limit: options.limit ?? 20,
        p_category_slug: options.categorySlug ?? null,
      })
      .abortSignal(signal)
  );

  if (error) throw new Error(`Căutarea Beavy a eșuat: ${error.message}`);
  return (data ?? []) as BeavyFamilySearchResult[];
}

/**
 * Caută și aplatizează toate produsele + variantele relevante pentru un termen și/sau o categorie.
 */
export async function searchFlatCatalogProducts(
  query: string,
  categorySlug: string | null = null
): Promise<DisplayProduct[]> {
  const res = await fetchCatalogProductsPage({
    query,
    categorySlug,
    limit: 36,
    offset: 0,
  });
  return res.products;
}

/**
 * Returnează toate variantele dintr-o familie de produse.
 */
export async function getBeavyFamilyProducts(
  familyId: string,
  options: { query?: string | null; limit?: number; offset?: number } = {}
): Promise<BeavyFamilyProduct[]> {
  const { data, error } = await withCatalogTimeout((signal) =>
    supabase
      .rpc('get_beavy_family_products', {
        p_family_id: familyId,
        p_query: options.query?.trim() || null,
        p_limit: options.limit ?? 30,
        p_offset: options.offset ?? 0,
      })
      .abortSignal(signal)
  );

  if (error) throw new Error(`Nu am putut încărca variantele: ${error.message}`);
  return (data ?? []) as BeavyFamilyProduct[];
}

export type ProductEquivalentsResult = {
  familyId: string | null;
  familyName: string | null;
  variants: DisplayProduct[];
};

/**
 * Găsește familiile unui produs și returnează strict produsele echivalente canonice compatibile
 * (același tip, gramaj compatibil, fără amestec între sortimente diferite).
 */
export async function getEquivalentProductsForProduct(
  productId: string,
  limit = 16
): Promise<ProductEquivalentsResult> {
  const { data: memberships, error: memErr } = await withCatalogTimeout((signal) =>
    supabase
      .from('beavy_product_family_members')
      .select('family_id')
      .eq('product_id', productId)
      .abortSignal(signal)
  );

  const familyIds = Array.from(
    new Set((memberships ?? []).map((m) => String(m.family_id)))
  );

  const primaryFamilyId = familyIds[0] ?? null;

  const [familyMetaRes, allMembers] =
    !memErr && familyIds.length > 0
      ? await Promise.all([
          withCatalogTimeout((signal) =>
            supabase
              .from('beavy_product_families')
              .select('canonical_name')
              .eq('id', primaryFamilyId!)
              .abortSignal(signal)
              .maybeSingle()
          ),
          fetchPaginatedByChunks<{ product_id: string; family_id: string }>(
            familyIds,
            FAMILY_IN_CHUNK_SIZE,
            (chunk, from, to) =>
              withCatalogTimeout((signal) =>
                supabase
                  .from('beavy_product_family_members')
                  .select('product_id, family_id')
                  .in('family_id', chunk)
                  .order('family_id', { ascending: true })
                  .order('product_id', { ascending: true })
                  .range(from, to)
                  .abortSignal(signal)
              )
          ).catch(() => []),
        ])
      : [{ data: null }, []];

  const familyMeta = familyMetaRes.data;
  const familyName = (familyMeta?.canonical_name as string | null) ?? null;
  const familyIdsByProduct = new Map<string, string[]>();
  const allProductIds = new Set<string>([productId]);

  for (const row of allMembers) {
    const pid = String(row.product_id);
    const fid = String(row.family_id);
    allProductIds.add(pid);
    const arr = familyIdsByProduct.get(pid) ?? [];
    arr.push(fid);
    familyIdsByProduct.set(pid, arr);
  }

  let productRows: Record<string, unknown>[] = [];
  try {
    productRows = await fetchPaginatedByChunks<Record<string, unknown>>(
      Array.from(allProductIds),
      UUID_IN_CHUNK_SIZE,
      (chunk, from, to) =>
        withCatalogTimeout((signal) =>
          supabase
            .from('beavy_products')
            .select(
              'id, canonical_name, brand, package_size, quantity_value, quantity_unit, image_url, category, subcategory, attributes'
            )
            .in('id', chunk)
            .eq('is_active', true)
            .order('id', { ascending: true })
            .range(from, to)
            .abortSignal(signal)
        )
    );
  } catch {
    return { familyId: primaryFamilyId, familyName, variants: [] };
  }

  if (productRows.length === 0) {
    return { familyId: primaryFamilyId, familyName, variants: [] };
  }

  // Suplimentăm membrii familiei cu o căutare semantică după tipul produsului (ex. „Fulgi de ovăz”, „Piept de pui dezosat”, „Ouă”)
  // astfel încât fereastra de variante să afișeze toate variantele compatibile din toate magazinele.
  const targetRow = productRows.find((r) => String(r.id) === productId);
  if (targetRow) {
    const rawTitle = String(targetRow.canonical_name ?? '');
    const rawBrand = String(targetRow.brand ?? '').trim();
    let coreQuery = rawTitle;
    if (rawBrand && coreQuery.toLowerCase().startsWith(rawBrand.toLowerCase())) {
      coreQuery = coreQuery.slice(rawBrand.length).trim();
    }
    coreQuery = coreQuery
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|buc|bucati|pcs)\b/gi, ' ')
      .replace(/[,()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 4)
      .join(' ');
    if (coreQuery.length >= 2) {
      try {
        const rpcRes = await withCatalogTimeout((signal) =>
          supabase
            .rpc('search_beavy_products_v2', {
              p_query: coreQuery,
              p_category_slug: null,
              p_brand: null,
              p_retailer_slug: null,
              p_sort: 'relevance',
              p_promo_only: false,
              p_limit: 40,
              p_offset: 0,
            })
            .abortSignal(signal)
        );
        if (!rpcRes.error && Array.isArray(rpcRes.data)) {
          const extraIds = rpcRes.data
            .map((row: Record<string, unknown>) => String(row.id ?? ''))
            .filter((id) => id && !allProductIds.has(id));
          if (extraIds.length > 0) {
            const extraRows = await fetchPaginatedByChunks<Record<string, unknown>>(
              extraIds,
              UUID_IN_CHUNK_SIZE,
              (chunk, from, to) =>
                withCatalogTimeout((signal) =>
                  supabase
                    .from('beavy_products')
                    .select(
                      'id, canonical_name, brand, package_size, quantity_value, quantity_unit, image_url, category, subcategory, attributes'
                    )
                    .in('id', chunk)
                    .eq('is_active', true)
                    .order('id', { ascending: true })
                    .range(from, to)
                    .abortSignal(signal)
                )
            );
            productRows.push(...extraRows);
          }
        }
      } catch {
        // Ignorăm erorile suplimentare de rețea și continuăm cu membrii familiei
      }
    }
  }

  const profilesById = new Map<
    string,
    {
      profile: CatalogProductProfile;
      image_url: string | null;
      category: string | null;
      subcategory: string | null;
    }
  >();

  for (const r of productRows) {
    const id = String(r.id);
    profilesById.set(id, {
      profile: {
        id,
        canonical_name: String(r.canonical_name ?? ''),
        brand: r.brand ? String(r.brand) : null,
        package_size: r.package_size ? String(r.package_size) : null,
        quantity_value: r.quantity_value != null ? Number(r.quantity_value) : null,
        quantity_unit: r.quantity_unit ? String(r.quantity_unit) : null,
        image_url: r.image_url ? String(r.image_url) : null,
        category: r.category ? String(r.category) : null,
        attributes:
          r.attributes && typeof r.attributes === 'object'
            ? (r.attributes as Record<string, unknown>)
            : {},
        familyIds: familyIdsByProduct.get(id) ?? [],
      },
      image_url: r.image_url ? String(r.image_url) : null,
      category: r.category ? String(r.category) : null,
      subcategory: r.subcategory ? String(r.subcategory) : null,
    });
  }

  const targetEntry = profilesById.get(productId);
  if (!targetEntry) {
    return { familyId: primaryFamilyId, familyName, variants: [] };
  }

  const compatEntries = Array.from(profilesById.values()).filter((entry) =>
    isCompatibleEquivalentProduct(targetEntry.profile, entry.profile, {
      allowDifferentSize: true,
    })
  );

  // Hidratăm ofertele active pentru a prioritiza produsele cu stoc/magazine reale și a evita variantele moarte
  const offerStatsByProduct = new Map<
    string,
    { minPrice: number; retailerSlugs: Set<string>; cheapestSlug: string | null }
  >();
  if (compatEntries.length > 0) {
    try {
      const observedAfter = new Date(Date.now() - MAX_VERIFIED_OFFER_AGE_MS).toISOString();
      const offerRows = await fetchPaginatedByChunks<{
        product_id: string;
        price: number;
        retailer_name: string;
        observed_at: string;
        valid_until: string | null;
      }>(
        compatEntries.map((e) => e.profile.id),
        UUID_IN_CHUNK_SIZE,
        (chunk, from, to) =>
          withCatalogTimeout((signal) =>
            supabase
              .from('beavy_product_offers')
              .select('product_id, price, retailer_name, observed_at, valid_until')
              .in('product_id', chunk)
              .eq('is_active', true)
              .neq('stock_status', 'out_of_stock')
              .gte('observed_at', observedAfter)
              .range(from, to)
              .abortSignal(signal)
          )
      );
      for (const o of offerRows) {
        if (!isFreshVerifiedOffer(o)) continue;
        const pid = String(o.product_id);
        const price = Number(o.price);
        const slug = String(o.retailer_name ?? '')
          .toLowerCase()
          .replace(/\s+/g, '-');
        const cur = offerStatsByProduct.get(pid);
        if (!cur) {
          offerStatsByProduct.set(pid, {
            minPrice: price,
            retailerSlugs: new Set(slug ? [slug] : []),
            cheapestSlug: slug || null,
          });
        } else {
          if (slug) cur.retailerSlugs.add(slug);
          if (Number.isFinite(price) && price < cur.minPrice) {
            cur.minPrice = price;
            if (slug) cur.cheapestSlug = slug;
          }
        }
      }
    } catch {
      // Dacă nu reușim să citim statisticile ofertelor, continuăm cu profilul canonic
    }
  }

  let rawVariants: DisplayProduct[] = compatEntries
    .filter((entry) =>
      offerStatsByProduct.size > 0 ? offerStatsByProduct.has(entry.profile.id) : true
    )
    .sort((a, b) => {
      const aStat = offerStatsByProduct.get(a.profile.id);
      const bStat = offerStatsByProduct.get(b.profile.id);
      const aStores = aStat?.retailerSlugs.size ?? 0;
      const bStores = bStat?.retailerSlugs.size ?? 0;
      if (bStores !== aStores) return bStores - aStores;
      const aHasImg = a.image_url ? 1 : 0;
      const bHasImg = b.image_url ? 1 : 0;
      if (bHasImg !== aHasImg) return bHasImg - aHasImg;
      return a.profile.canonical_name.localeCompare(b.profile.canonical_name, 'ro');
    })
    .map((entry) => {
      const stat = offerStatsByProduct.get(entry.profile.id);
      return {
        id: entry.profile.id,
        canonical_name: entry.profile.canonical_name,
        brand: entry.profile.brand,
        package_size: entry.profile.package_size,
        image_url: resolveProductImageUrl(
          entry.image_url,
          entry.profile.canonical_name,
          entry.category,
          familyName
        ),
        category_name: entry.category ?? undefined,
        family_name: familyName ?? undefined,
        subcategory: entry.subcategory,
        min_price: stat?.minPrice ?? null,
        store_count: stat?.retailerSlugs.size ?? 0,
        retailer_slugs: stat ? Array.from(stat.retailerSlugs) : [],
        cheapest_retailer_slug: stat?.cheapestSlug ?? null,
      };
    });

  // Fallback cross-categorie când produsul e încadrat greșit într-o familie (ex. Pepsi Zero -> „Zahăr și îndulcitori”)
  if (rawVariants.length === 0) {
    try {
      const cleanTokens = targetEntry.profile.canonical_name
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !/^(pet|fara|zahar|bautura|racoritoare|carbogazoasa)$/i.test(w))
        .slice(0, 3)
        .join(' ');
      const fallbackQueries = Array.from(
        new Set(
          [
            /\b(pepsi|cola)\b/i.test(targetEntry.profile.canonical_name) ? 'cola' : '',
            cleanTokens,
          ].filter((q) => q.length >= 3)
        )
      );
      for (const fq of fallbackQueries) {
        const { data: rpcFallback } = await withCatalogTimeout((signal) =>
          supabase
            .rpc('search_beavy_products_v2', {
              p_query: fq,
              p_category_slug: null,
              p_brand: null,
              p_retailer_slug: null,
              p_sort: 'store_count',
              p_promo_only: false,
              p_limit: 40,
              p_offset: 0,
            })
            .abortSignal(signal)
        );
        if (Array.isArray(rpcFallback)) {
          const matched = (rpcFallback as Record<string, unknown>[])
            .map(mapV2RowToDisplayProduct)
            .filter((cand) => {
              if (cand.id === productId) return false;
              const match = computeProductMatchScore(
                targetEntry.profile,
                toQuickMatchProfile(cand),
                { skipCategoryCheck: true }
              );
              return match.compatible;
            });
          if (matched.length > 0) {
            rawVariants = matched;
            break;
          }
        }
      }
    } catch {
      // Fallback opțional
    }
  }

  const variants = deduplicateCatalogProducts(rawVariants).slice(0, limit);

  return {
    familyId: primaryFamilyId,
    familyName,
    variants,
  };
}

/**
 * Găsește alte gramaje/ambalaje ale aceluiași brand și sortiment (fără a amesteca arome diferite),
 * utile când ambalajul exact există la un singur retailer (ex. Sezamo).
 */
export async function getSameLineOtherSizes(
  product: {
    id: string;
    canonical_name: string;
    brand?: string | null;
    package_size?: string | null;
    category_name?: string | null;
    subcategory?: string | null;
  },
  limit = 6
): Promise<DisplayProduct[]> {
  const brand = product.brand?.trim();
  const seedQuery =
    brand ||
    product.canonical_name
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .find((w) => w.length >= 3) ||
    '';

  if (seedQuery.length < 2) return [];

  const { data, error } = await withCatalogTimeout((signal) =>
    supabase
      .rpc('search_beavy_products_v2', {
        p_query: seedQuery,
        p_category_slug: null,
        p_brand: brand || null,
        p_retailer_slug: null,
        p_sort: 'store_count',
        p_promo_only: false,
        p_limit: 40,
        p_offset: 0,
      })
      .abortSignal(signal)
  );

  if (error || !Array.isArray(data)) return [];

  const targetProfile: CatalogProductProfile = {
    id: product.id,
    canonical_name: product.canonical_name,
    brand: product.brand ?? null,
    package_size: product.package_size ?? null,
    quantity_value: null,
    quantity_unit: null,
    category: product.category_name ?? null,
    subcategory: product.subcategory ?? null,
    attributes: {},
    familyIds: [],
  };

  const candidates = (data as Record<string, unknown>[])
    .map(mapV2RowToDisplayProduct)
    .filter((cand) => {
      if (cand.id === product.id || (cand.store_count ?? 0) <= 0) return false;
      return areSameLineDifferentSizes(targetProfile, toQuickMatchProfile(cand));
    });

  return deduplicateCatalogProducts(candidates)
    .sort((a, b) => {
      const sDiff = (b.store_count ?? 0) - (a.store_count ?? 0);
      if (sDiff !== 0) return sDiff;
      return (a.min_price ?? 9999) - (b.min_price ?? 9999);
    })
    .slice(0, limit);
}

const canonicalImagesMemoryCache = new Map<string, string | null>();

/**
 * Încarcă read-only URL-urile canonice `image_url` din `beavy_products`
 * pentru produsele salvate deja în listele utilizatorului, cu cache în memorie.
 */
export async function fetchCanonicalProductImages(
  productIds: string[]
): Promise<Record<string, string | null>> {
  const uniqueIds = Array.from(
    new Set(productIds.map((id) => id.trim()).filter(Boolean))
  );
  if (uniqueIds.length === 0) return {};

  const out: Record<string, string | null> = {};
  const missingIds: string[] = [];

  for (const id of uniqueIds) {
    if (canonicalImagesMemoryCache.has(id)) {
      out[id] = canonicalImagesMemoryCache.get(id) ?? null;
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length === 0) {
    return out;
  }

  let rows: { id: string; image_url: string | null }[] = [];
  try {
    rows = await fetchPaginatedByChunks<{ id: string; image_url: string | null }>(
      missingIds,
      UUID_IN_CHUNK_SIZE,
      (chunk, from, to) =>
        withCatalogTimeout((signal) =>
          supabase
            .from('beavy_products')
            .select('id, image_url')
            .in('id', chunk)
            .eq('is_active', true)
            .order('id', { ascending: true })
            .range(from, to)
            .abortSignal(signal)
        )
    );
  } catch {
    return out;
  }

  for (const row of rows) {
    const id = String(row.id ?? '');
    if (!id) continue;
    const resolved = resolveProductImageUrl(row.image_url ? String(row.image_url) : null);
    canonicalImagesMemoryCache.set(id, resolved);
    out[id] = resolved;
  }
  return out;
}
