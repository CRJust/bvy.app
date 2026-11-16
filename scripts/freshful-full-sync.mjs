#!/usr/bin/env node
/**
 * Alias de compatibilitate — delegă la `scripts/sync-canonical-catalog.mjs`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanonicalCatalogSync } from './sync-canonical-catalog.mjs';

const __filename = fileURLToPath(import.meta.url);

export { buildCanonicalCatalogSync as buildFullFreshfulSync };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  import('./sync-canonical-catalog.mjs').catch((err) => {
    console.error('Eroare sync canonical catalog:', err);
    process.exit(1);
  });
}
