import type { SupabaseClient } from "@supabase/supabase-js";

export type BeavySearchProduct = {
  id: string;
  canonical_name: string;
  brand: string | null;
  package_size: string | null;
  image_url: string | null;
  barcode: string | null;
  relevance: number;
};

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

export async function searchBeavyCatalog(
  supabase: SupabaseClient,
  query: string,
  options: { limit?: number; categorySlug?: string | null } = {},
): Promise<BeavyFamilySearchResult[]> {
  const cleanQuery = query.trim().replace(/\s+/g, " ");
  if (cleanQuery.length < 2) return [];

  const { data, error } = await supabase.rpc("search_beavy_catalog", {
    p_query: cleanQuery,
    p_limit: options.limit ?? 12,
    p_category_slug: options.categorySlug ?? null,
  });

  if (error) throw new Error(`Căutarea Beavy a eșuat: ${error.message}`);
  return (data ?? []) as BeavyFamilySearchResult[];
}

export async function getBeavyFamilyProducts(
  supabase: SupabaseClient,
  familyId: string,
  options: { query?: string | null; limit?: number; offset?: number } = {},
): Promise<BeavyFamilyProduct[]> {
  const { data, error } = await supabase.rpc("get_beavy_family_products", {
    p_family_id: familyId,
    p_query: options.query?.trim() || null,
    p_limit: options.limit ?? 30,
    p_offset: options.offset ?? 0,
  });

  if (error) throw new Error(`Nu am putut încărca variantele: ${error.message}`);
  return (data ?? []) as BeavyFamilyProduct[];
}
