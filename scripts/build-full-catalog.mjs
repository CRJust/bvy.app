import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SHELF_PATH = path.join(ROOT_DIR, 'public', 'data', 'shelf-prices.json');
const CATALOG_TS_PATH = path.join(ROOT_DIR, 'src', 'data', 'catalog.ts');

const shelfData = JSON.parse(fs.readFileSync(SHELF_PATH, 'utf8'));

// Store IDs matching src/types.ts
const STORES = [
  'lidl',
  'kaufland',
  'carrefour',
  'auchan',
  'mega_image',
  'penny',
  'profi',
  'freshful',
  'sezamo',
];

const CARD_META = {
  lidl: { cardId: 'lidl_plus', program: 'Lidl Plus' },
  kaufland: { cardId: 'kaufland_card', program: 'Kaufland Card' },
  carrefour: { cardId: 'card_connect', program: 'Card CONNECT' },
  mega_image: { cardId: 'card_connect', program: 'Card CONNECT' },
  auchan: { cardId: 'myclub', program: 'MyCLUB' },
  penny: { cardId: 'penny_card', program: 'PENNY Card' },
  sezamo: { cardId: 'sezamo_xtra', program: 'Sezamo Xtra' },
};

// Relative store price multipliers for missing store fallback
const STORE_PRICE_INDEX = {
  lidl: 0.94,
  penny: 0.95,
  kaufland: 0.96,
  carrefour: 1.00,
  auchan: 0.99,
  profi: 1.02,
  mega_image: 1.05,
  sezamo: 1.04,
  freshful: 1.06,
};

function mapCategory(cat) {
  if (!cat) return 'Cămară & Paste';
  const c = cat.toLowerCase();
  if (c.includes('lactate') || c.includes('oua') || c.includes('ouă') || c.includes('branz') || c.includes('unt')) {
    return 'Lactate & Ouă';
  }
  if (c.includes('carne') || c.includes('mezel') || c.includes('peste') || c.includes('pește') || c.includes('congelat')) {
    return 'Carne & Pește';
  }
  if (c.includes('legume') || c.includes('fructe')) {
    return 'Fructe & Legume';
  }
  if (c.includes('cafea') || c.includes('ceai') || c.includes('bautur') || c.includes('băutur')) {
    return 'Cafea & Băuturi';
  }
  return 'Cămară & Paste';
}

function parseSizeFilter(size) {
  if (!size) return 'Altele';
  const s = size.toLowerCase().replace(/\s+/g, '');
  if (s.includes('200g')) return '200g';
  if (s.includes('250g')) return '250g';
  if (s.includes('500g')) return '500g';
  if (s.includes('1kg') || s.includes('1000g')) return '1kg';
  if (s.includes('1l') || s.includes('1litru')) return '1L';
  if (s.includes('2l') || s.includes('2litri')) return '2L';
  return 'Altele';
}

function determineUnitType(size, cat) {
  const s = (size || '').toLowerCase();
  if (s.includes('l') || s.includes('ml')) return 'L';
  if (s.includes('buc') || s.includes('ou')) return 'buc';
  return 'kg';
}

function buildEan13(prefix12) {
  const digits = prefix12.replace(/\D/g, '').slice(0, 12).padStart(12, '5');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${digits}${check}`;
}

function buildEan13FromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const prefix = '594' + String(hash).padStart(9, '0').slice(-9);
  return buildEan13(prefix);
}

// Read current catalog.ts to extract RAW_CATALOG seed
const currentCatalogTs = fs.readFileSync(CATALOG_TS_PATH, 'utf8');
const rawCatalogMatch = currentCatalogTs.match(
  /const RAW_CATALOG:\s*Array<Omit<CanonicalProduct,\s*'ean'>>\s*=\s*(\[[\s\S]*?\]);\n\nexport const CATALOG/
);

if (!rawCatalogMatch) {
  console.error('Could not find RAW_CATALOG in catalog.ts');
  process.exit(1);
}

const existingSeedCode = rawCatalogMatch[1];

// Now convert shelfData.items
const existingIds = new Set([
  'zuzu_lapte_1l',
  'lapte_marca_proprie_1l',
  'lapte_fara_lactoza_1l',
  'napolact_unt_200g',
  'unt_marca_proprie_200g',
  'oua_m_10buc',
  'danone_iaurt_400g',
  'iaurt_propriu_400g',
  'hochland_cascaval_250g',
  'cascaval_propriu_250g',
  'parmezan_150g',
  'somon_file_250g',
  'piept_pui_500g',
  'pulpe_pui_500g',
  'carne_tocata_500g',
  'bacon_pancetta_200g',
  'sunca_praga_200g',
  'banane_1kg',
  'rosii_cherry_500g',
  'cartofi_albi_2kg',
  'mere_golden_1kg',
  'ceapa_galbena_1kg',
  'avocado_2buc',
  'lamaie_500g',
  'barilla_spaghetti_500g',
  'spaghetti_propriu_500g',
  'barilla_penne_500g',
  'penne_propriu_500g',
  'monini_ulei_500ml',
  'ulei_masline_propriu_500ml',
  'bunica_ulei_1l',
  'ulei_floarea_propriu_1l',
  'mutti_passata_700g',
  'paine_vel_pitar_500g',
  'orez_basmati_500g',
  'jacobs_kronung_250g',
  'bellarom_cafea_250g',
  'dorna_apa_2l',
  'apa_plata_proprie_2l',
  'borsec_apa_15l',
  'coca_cola_2l',
  'pepsi_max_2l',
  'faina_000_1kg',
  'faina_proprie_1kg',
]);

const shelfItemsCode = [];

for (const it of shelfData.items) {
  const cleanId = String(it.id || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!cleanId || existingIds.has(cleanId)) continue;
  existingIds.add(cleanId);

  const prices = it.prices_by_retailer || {};
  // Collect actual known prices
  const knownPrices = [];
  for (const s of STORES) {
    const rawKey = s === 'mega_image' ? (prices['mega_image'] || prices['mega-image']) : prices[s];
    if (rawKey && typeof rawKey.price === 'number' && rawKey.price > 0) {
      knownPrices.push(rawKey.price);
    }
  }

  if (knownPrices.length === 0) continue;

  const avgPrice = knownPrices.reduce((a, b) => a + b, 0) / knownPrices.length;

  const seedsObj = {};
  for (const s of STORES) {
    const rawData = s === 'mega_image' ? (prices['mega_image'] || prices['mega-image']) : prices[s];
    if (rawData && typeof rawData.price === 'number' && rawData.price > 0) {
      const base = Math.round(rawData.price * 100) / 100;
      const card = CARD_META[s] && base > 5 ? Math.round((base * 0.9) * 100) / 100 : undefined;
      const promo = rawData.promo_label || (card ? CARD_META[s].program : undefined);
      const altLabel = rawData.name && rawData.name !== it.canonical_name ? rawData.name : undefined;
      const eqLevel = it.is_private_label ? 4 : (altLabel ? 3 : 1);
      seedsObj[s] = {
        base,
        ...(card !== undefined ? { card } : {}),
        ...(promo ? { promo } : {}),
        ...(altLabel ? { altLabel } : {}),
        eqLevel,
      };
    } else {
      // Intelligent fallback index
      const ratio = STORE_PRICE_INDEX[s] || 1.0;
      const base = Math.round(avgPrice * ratio * 100) / 100;
      const card = CARD_META[s] && base > 5 ? Math.round((base * 0.9) * 100) / 100 : undefined;
      seedsObj[s] = {
        base,
        ...(card !== undefined ? { card } : {}),
        eqLevel: it.is_private_label ? 4 : 3,
      };
    }
  }

  const category = mapCategory(it.category);
  const sizeFilter = parseSizeFilter(it.package_size);
  const unitType = determineUnitType(it.package_size, it.category);
  const isPrivateLabel = Boolean(it.is_private_label);
  const brand = it.brand || (isPrivateLabel ? 'Marcă proprie' : 'Brand național');
  const packageSize = it.package_size || '1 buc';

  shelfItemsCode.push(`  {
    id: ${JSON.stringify(cleanId)},
    canonicalName: ${JSON.stringify(it.canonical_name)},
    brand: ${JSON.stringify(brand)},
    packageSize: ${JSON.stringify(packageSize)},
    sizeFilter: ${JSON.stringify(sizeFilter)},
    category: ${JSON.stringify(category)},
    quantityBase: 1,
    unitType: ${JSON.stringify(unitType)},
    isPrivateLabel: ${isPrivateLabel},
    offers: buildOffers(${JSON.stringify(seedsObj, null, 6).replace(/\n/g, '\n    ')}, ${isPrivateLabel}),
  }`);
}

console.log(`Generated ${shelfItemsCode.length} shelf items from shelf-prices.json`);

// Read header from current catalog.ts
const headerIdx = currentCatalogTs.indexOf('const RAW_CATALOG');
const headerCode = currentCatalogTs.slice(0, headerIdx);

const footerCode = `
export const CATALOG: CanonicalProduct[] = RAW_CATALOG.map((item) => ({
  ...item,
  ean: buildEan13(EAN12_BY_PRODUCT_ID[item.id] ?? buildEan13FromId(item.id).slice(0, 12)),
}));

export const PRODUCT_MAP: Record<string, CanonicalProduct> = CATALOG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<string, CanonicalProduct>
);

export const DEFAULT_BASKET = [
  { productId: 'zuzu_lapte_1l', quantity: 2, checkedInStore: false },
  { productId: 'napolact_unt_200g', quantity: 1, checkedInStore: false },
  { productId: 'oua_m_10buc', quantity: 1, checkedInStore: false },
  { productId: 'barilla_spaghetti_500g', quantity: 2, checkedInStore: false },
  { productId: 'somon_file_250g', quantity: 1, checkedInStore: false },
  { productId: 'piept_pui_500g', quantity: 1, checkedInStore: false },
  { productId: 'banane_1kg', quantity: 1, checkedInStore: false },
  { productId: 'jacobs_kronung_250g', quantity: 1, checkedInStore: false },
];
`;

// Helper function buildEan13FromId added to header if not present
let updatedHeader = headerCode;
if (!updatedHeader.includes('function buildEan13FromId')) {
  updatedHeader = updatedHeader.replace(
    'function buildEan13(prefix12: string): string {',
    `function buildEan13FromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const prefix = '594' + String(hash).padStart(9, '0').slice(-9);
  return buildEan13(prefix);
}

function buildEan13(prefix12: string): string {`
  );
}

// Slice off the closing bracket of existingSeedCode
let trimmedSeed = existingSeedCode.trim();
if (trimmedSeed.endsWith(']')) trimmedSeed = trimmedSeed.slice(0, -1).trim();
if (trimmedSeed.endsWith(',')) trimmedSeed = trimmedSeed.slice(0, -1).trim();

const finalCatalogTs = `${updatedHeader}const RAW_CATALOG: Array<Omit<CanonicalProduct, 'ean'>> = ${trimmedSeed},
${shelfItemsCode.join(',\n')}
];
${footerCode}
`;

fs.writeFileSync(CATALOG_TS_PATH, finalCatalogTs, 'utf8');
console.log('Successfully written full catalog to src/data/catalog.ts');
