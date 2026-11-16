import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './catalog-normalization.mjs';

const FALLBACK_URL = 'https://igjjuivtgrhjxwdsgiaz.supabase.co';

export async function getSupabaseAdmin() {
  let env = {};
  try {
    env = await loadEnv(process.cwd());
  } catch {
    // ignore missing .env
  }
  const url =
    process.env.SUPABASE_URL ||
    env.SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    env.EXPO_PUBLIC_SUPABASE_URL ||
    FALLBACK_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Set SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY before running this script.');
  }

  return createClient(url, key);
}

export async function resolveRetailerBySlug(supabase, slug) {
  const { data, error } = await supabase
    .from('beavy_retailers')
    .select('id, slug, name, supports_physical, supports_delivery, is_active')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Retailer '${slug}' not found in beavy_retailers: ${error?.message || 'missing'}`);
  }
  return data;
}
