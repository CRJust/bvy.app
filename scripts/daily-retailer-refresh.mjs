#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSupabaseAdmin, resolveRetailerBySlug } from './lib/supabase-admin.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN_FRESH_OFFERS = 20;
const COLLECTORS = [
  { slug: 'kaufland', source: 'monitorul_preturilor', script: 'monitorul-preturilor-collector.mjs' },
  { slug: 'kaufland', source: 'retailer_assortment_sync', script: 'retailer-assortment-collector.mjs' },
  { slug: 'kaufland', source: 'bolt_retailer_sync', script: 'bolt-retailer-collector.mjs' },
  { slug: 'auchan', source: 'auchan_api', script: 'auchan-api-collector.mjs' },
  { slug: 'carrefour', source: 'carrefour_catalog', script: 'carrefour-collector.mjs' },
  { slug: 'freshful', source: 'freshful_api_temp', script: 'freshful-temp-prices-collector.mjs' },
  { slug: 'kaufland', source: 'kaufland_offers', script: 'kaufland-collector.mjs' },
  { slug: 'lidl', source: 'lidl_sitemap', script: 'lidl-collector.mjs' },
  { slug: 'mega-image', source: 'mega_image_api', script: 'mega-image-api-collector.mjs' },
  { slug: 'penny', source: 'penny_discovery_api', script: 'penny-collector.mjs' },
  { slug: 'sezamo', source: 'sezamo_api', script: 'sezamo-collector.mjs' },
];

function runCollector(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT_DIR, 'scripts', script)], {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${signal || `code ${code}`}`));
    });
  });
}

async function countFreshOffers(supabase, retailerId, startedAt) {
  const { count, error } = await supabase
    .from('beavy_product_offers')
    .select('id', { count: 'exact', head: true })
    .eq('retailer_id', retailerId)
    .eq('is_active', true)
    .gte('observed_at', startedAt);
  if (error) throw new Error(`Could not verify fresh offers: ${error.message}`);
  return count ?? 0;
}

async function updateRun(supabase, runId, values) {
  const { error } = await supabase
    .from('beavy_feed_runs')
    .update(values)
    .eq('id', runId);
  if (error) throw new Error(`Could not update feed run: ${error.message}`);
}

async function main() {
  const supabase = await getSupabaseAdmin();
  const failures = [];

  for (const collector of COLLECTORS) {
    const startedAt = new Date().toISOString();
    let runId = null;

    try {
      const retailer = await resolveRetailerBySlug(supabase, collector.slug);
      const { data: run, error: runError } = await supabase
        .from('beavy_feed_runs')
        .insert({
          source: `daily_${collector.source}`,
          retailer_id: retailer.id,
          status: 'running',
          started_at: startedAt,
          metadata: { script: collector.script, trigger: process.env.GITHUB_EVENT_NAME || 'manual' },
        })
        .select('id')
        .single();
      if (runError || !run) {
        throw new Error(`Could not create feed run: ${runError?.message || 'missing run id'}`);
      }
      runId = run.id;

      console.log(`\n=== Daily refresh: ${retailer.name} (${collector.script}) ===`);
      await runCollector(collector.script);

      const offersSaved = await countFreshOffers(supabase, retailer.id, startedAt);
      if (offersSaved < MIN_FRESH_OFFERS) {
        throw new Error(
          `Only ${offersSaved} fresh active offers were saved; expected at least ${MIN_FRESH_OFFERS}.`
        );
      }

      await updateRun(supabase, runId, {
        status: 'success',
        finished_at: new Date().toISOString(),
        products_found: offersSaved,
        offers_saved: offersSaved,
      });
      console.log(`Verified ${offersSaved} fresh active offers for ${retailer.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${collector.slug}: ${message}`);
      console.error(`Daily refresh failed for ${collector.slug}: ${message}`);
      if (runId) {
        try {
          await updateRun(supabase, runId, {
            status: 'failed',
            finished_at: new Date().toISOString(),
            error_message: message.slice(0, 2000),
          });
        } catch (updateError) {
          console.error(updateError);
        }
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Daily retailer refresh had ${failures.length} failure(s):\n${failures.join('\n')}`);
  }
  console.log('\nAll eight retailer snapshots were refreshed and verified.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
