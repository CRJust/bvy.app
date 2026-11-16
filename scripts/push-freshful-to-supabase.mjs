#!/usr/bin/env node
/**
 * Alias de compatibilitate — delegă la `scripts/push-canonical-catalog.mjs`.
 */
import { runPushCanonicalCatalog } from './push-canonical-catalog.mjs';

runPushCanonicalCatalog().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
