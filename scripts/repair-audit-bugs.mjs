#!/usr/bin/env node
/**
 * Reparații automate și idempotente pentru bug-urile de date descoperite la audit:
 * 1) Populează `beavy_fulfillment_nodes` și `beavy_fulfillment_rules` pentru Sezamo și Freshful (București),
 *    astfel încât taxele de livrare și comanda minimă să nu mai fie 0 RON în comparații.
 * 2) Completează `normalized_unit_price` și `normalized_unit_label` pe ofertele active unde lipsesc
 *    și sunt calculabile din `package_size` sau produsul canonic (ex. Lidl `per kg`, `per caserolă`, etc.).
 * 3) Curăță eventualele `promo_label` goale (`""` -> `null`).
 */
import { computeNormalizedUnitPrice, parseQuantity } from './lib/catalog-normalization.mjs';
import { getSupabaseAdmin } from './lib/supabase-admin.mjs';

async function upsertFulfillmentSeed(supabase) {
  const { data: retailers, error: retErr } = await supabase
    .from('beavy_retailers')
    .select('id, slug, name')
    .in('slug', ['freshful', 'sezamo']);

  if (retErr) throw new Error(`Retailers lookup failed: ${retErr.message}`);
  const bySlug = Object.fromEntries((retailers || []).map((r) => [r.slug, r]));

  const seeds = [
    {
      slug: 'freshful',
      node: {
        node_key: 'freshful-bucuresti-delivery',
        name: 'Freshful Livrare București & Ilfov',
        node_type: 'delivery_area',
        fulfillment_channel: 'delivery',
        city: 'București',
        region: 'București-Ilfov',
        country_code: 'RO',
        is_active: true,
        source_url: 'https://www.freshful.ro/livrare',
      },
      rule: {
        currency: 'RON',
        delivery_fee: 9.99,
        service_fee: 0,
        packaging_fee: 0,
        small_order_fee: 19.99,
        small_order_fee_threshold: 150,
        minimum_order_value: null,
        free_delivery_threshold: 299,
        source: 'audit_policy_sync',
        source_url: 'https://www.freshful.ro/livrare',
        is_active: true,
      },
    },
    {
      slug: 'sezamo',
      node: {
        node_key: 'sezamo-bucuresti-online',
        name: 'Sezamo Livrare București & Ilfov',
        node_type: 'online_service',
        fulfillment_channel: 'online',
        city: 'București',
        region: 'București-Ilfov',
        country_code: 'RO',
        is_active: true,
        source_url: 'https://www.sezamo.ro/livrare',
      },
      rule: {
        currency: 'RON',
        delivery_fee: 12.9,
        service_fee: 0,
        packaging_fee: 0,
        small_order_fee: 0,
        small_order_fee_threshold: null,
        minimum_order_value: 150,
        free_delivery_threshold: 200,
        source: 'audit_policy_sync',
        source_url: 'https://www.sezamo.ro/livrare',
        is_active: true,
      },
    },
  ];

  let nodesSynced = 0;
  let rulesSynced = 0;

  for (const seed of seeds) {
    const ret = bySlug[seed.slug];
    if (!ret) continue;

    const { data: existingNode } = await supabase
      .from('beavy_fulfillment_nodes')
      .select('id')
      .eq('node_key', seed.node.node_key)
      .maybeSingle();

    let nodeId = existingNode?.id ?? null;
    if (!nodeId) {
      const { data: insertedNode, error: insErr } = await supabase
        .from('beavy_fulfillment_nodes')
        .insert({
          retailer_id: ret.id,
          ...seed.node,
        })
        .select('id')
        .single();
      if (insErr) throw new Error(`Insert node ${seed.node.node_key}: ${insErr.message}`);
      nodeId = insertedNode.id;
      nodesSynced++;
    }

    const { data: existingRule } = await supabase
      .from('beavy_fulfillment_rules')
      .select('id')
      .eq('fulfillment_node_id', nodeId)
      .eq('is_active', true)
      .maybeSingle();

    if (!existingRule) {
      const { error: ruleErr } = await supabase.from('beavy_fulfillment_rules').insert({
        fulfillment_node_id: nodeId,
        effective_from: new Date().toISOString(),
        observed_at: new Date().toISOString(),
        ...seed.rule,
      });
      if (ruleErr) throw new Error(`Insert rule for ${seed.slug}: ${ruleErr.message}`);
      rulesSynced++;
    }
  }

  return { nodesSynced, rulesSynced };
}

async function backfillMissingUnitPrices(supabase) {
  const { data: rows, error } = await supabase
    .from('beavy_product_offers')
    .select('id, product_id, price, package_size, beavy_products(canonical_name, package_size)')
    .eq('is_active', true)
    .is('normalized_unit_price', null)
    .limit(500);

  if (error) throw new Error(`Missing unit price lookup: ${error.message}`);

  let updated = 0;
  for (const row of rows || []) {
    const price = Number(row.price);
    if (!Number.isFinite(price) || price <= 0) continue;

    const prod = Array.isArray(row.beavy_products) ? row.beavy_products[0] : row.beavy_products;
    const pkg = String(row.package_size || prod?.package_size || '').trim();
    const pkgLow = pkg.toLowerCase();

    let normPrice = null;
    let normLabel = null;

    if (/^per\s*kg$/i.test(pkgLow)) {
      normPrice = Math.round(price * 100) / 100;
      normLabel = 'RON/kg';
    } else if (/^per\s*(buc\.?|caserol[aă]|pcs)$/i.test(pkgLow) || /^buc\.?$/i.test(pkgLow)) {
      normPrice = Math.round(price * 100) / 100;
      normLabel = 'RON/buc';
    } else {
      const parsed = parseQuantity(pkg || prod?.canonical_name || '');
      if (parsed) {
        const unitRes = computeNormalizedUnitPrice(price, parsed);
        if (unitRes) {
          normPrice = unitRes.normalizedUnitPrice;
          normLabel = unitRes.normalizedUnitLabel;
        }
      }
    }

    if (normPrice !== null && normLabel) {
      const { error: updErr } = await supabase
        .from('beavy_product_offers')
        .update({
          normalized_unit_price: normPrice,
          normalized_unit_label: normLabel,
        })
        .eq('id', row.id);
      if (!updErr) updated++;
    }
  }
  return { checked: (rows || []).length, updated };
}

async function run() {
  const supabase = await getSupabaseAdmin();
  const fulfillment = await upsertFulfillmentSeed(supabase);
  const unitBackfill = await backfillMissingUnitPrices(supabase);

  const { data: emptyPromos, error: emptyErr } = await supabase
    .from('beavy_product_offers')
    .update({ promo_label: null })
    .eq('promo_label', '')
    .select('id');

  if (emptyErr) throw new Error(`Promo label cleanup failed: ${emptyErr.message}`);

  console.log('✅ Repair summary:', {
    fulfillment,
    unitBackfill,
    cleanedEmptyPromoLabels: (emptyPromos || []).length,
  });
}

run().catch((err) => {
  console.error('Fatal repair error:', err);
  process.exit(1);
});
