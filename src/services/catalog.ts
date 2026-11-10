
import { supabase } from '@/lib/supabase';

const CATALOG_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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
        'Cererea către catalog a expirat. Verifică internetul și încearcă din nou.'
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export type CatalogCategory = {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
};

export type CatalogProduct = {
  id: string;
  canonical_name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  category_id: string | null;
  package_size: string | null;
  quantity_value: number | null;
  quantity_unit: string | null;
  barcode: string | null;
  image_url: string | null;
};

function normalizeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[,%().*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLimit(limit?: number): number {
  return Math.min(
    Math.max(Math.floor(limit ?? DEFAULT_LIMIT), 1),
    MAX_LIMIT
  );
}

/**
 * Păstrăm funcția pentru compatibilitate.
 * Categoriile sunt momentan dezactivate în Supabase.
 */
export async function getCatalogCategories(): Promise<CatalogCategory[]> {
  const { data, error } = await withCatalogTimeout((signal) =>
    supabase
      .from('beavy_categories')
      .select('id, parent_id, slug, name, description, icon, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .abortSignal(signal)
  );

  if (error) {
    throw new Error(
      `Nu am putut încărca categoriile: ${error.message}`
    );
  }

  return (data ?? []) as CatalogCategory[];
}

/**
 * Căutare în catalogul canonic.
 * Nu depinde de categorii active.
 */
export async function getCatalogProducts(options: {
  searchTerm?: string;
  categoryId?: string | null;
  subcategory?: string | null;
  limit?: number;
} = {}): Promise<CatalogProduct[]> {
  const term = normalizeSearchTerm(options.searchTerm ?? '');
  const safeLimit = normalizeLimit(options.limit);

  let query = supabase
    .from('beavy_products')
    .select(
      'id, canonical_name, brand, category, subcategory, category_id, package_size, quantity_value, quantity_unit, barcode, image_url'
    )
    .eq('is_active', true);

  if (term) {
    query = query.or(
      `canonical_name.ilike.%${term}%,normalized_name.ilike.%${term}%,brand.ilike.%${term}%`
    );
  }

  if (options.categoryId) {
    query = query.eq('category_id', options.categoryId);
  }

  if (options.subcategory) {
    query = query.eq('subcategory', options.subcategory);
  }

  const { data, error } = await withCatalogTimeout((signal) =>
    query
      .order('canonical_name', { ascending: true })
      .limit(safeLimit)
      .abortSignal(signal)
  );

  if (error) {
    throw new Error(
      `Nu am putut încărca produsele din catalogul Beavy: ${error.message}`
    );
  }

  return (data ?? []) as CatalogProduct[];
}

/**
 * Funcție simplificată pentru selectorul cu sugestii dinamice.
 */
export async function searchCatalogProducts(
  searchTerm: string,
  limit = DEFAULT_LIMIT
): Promise<CatalogProduct[]> {
  if (!searchTerm.trim()) {
    return [];
  }

  return getCatalogProducts({
    searchTerm,
    limit,
  });
}

export async function getActiveCatalogProductCount(): Promise<number> {
  const { count, error } = await withCatalogTimeout((signal) =>
    supabase
      .from('beavy_products')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .abortSignal(signal)
  );

  if (error) {
    throw new Error(
      `Nu am putut verifica catalogul Beavy: ${error.message}`
    );
  }

  return count ?? 0;
}
