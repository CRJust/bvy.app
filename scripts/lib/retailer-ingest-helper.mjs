import crypto from 'node:crypto';
import {
  BRAND_ALIASES,
  buildBrandPhraseIndex,
  classifyBarcode,
  computeNormalizedUnitPrice,
  findBrandCandidatesForTitle,
  isValidEanCheckDigit,
  normalizeBrandKey,
  normalizeText,
  parseQuantity,
  scoreCanonicalCandidate,
  tokenize,
} from './catalog-normalization.mjs';

export const PRIVATE_LABEL_BRANDS = new Set([
  'auchan',
  'filiera auchan',
  'pouce',
  'cosmia',
  'actuel',
  '365',
  'mega',
  'mega image',
  'mega apetit',
  'mega grill',
  'delhaize',
  'albert',
  'gusturi romanesti',
  'gustona',
  'fine crunchy',
  'fish market',
  'gonuts',
  'emma',
  'excellent',
  'delicata',
  'kitbis',
  'caffe gondoliere',
  'ever-g',
  'mega-image',
  'carrefour',
  'simpl',
  'drag de romania',
  'reflets de france',
  'terre d italia',
  'miil',
  'ubena',
  'ubomi',
  'yutto',
  'pappudia',
  'fjoru',
  'sutte',
  'modilac',
  'pappamia',
  'dacello',
  'kitchin',
  'lambini',
  'delicatese sezamo',
  'marks spencer',
  'marks & spencer',
  'marks and spencer',
  'pilos',
  'sondey',
  'pikok',
  'cien',
  'dulano',
  'dulano selection',
  'solevita',
  'freeway',
  'milbona',
  'alesto',
  'deluxe',
  'favorina',
  'italiamo',
  'chef select',
  'culinea',
  'freshona',
  'nixe',
  'ocean sea',
  'kania',
  'gelatelli',
  'belbake',
  'castello',
  'bellarom',
  'k classic',
  'k-classic',
  'k favorites',
  'k-favorites',
  'k bio',
  'k-bio',
  'k free',
  'k-free',
  'penny',
  'san fabio',
  'hanul boieresc',
  'bunte',
  'boni',
  'gran mare',
  'my bio',
  'casa taraneasca',
  'proxi',
  'gradina bunicii',
  'grădina bunicii',
  'ferma din deal',
  'deli di',
  'al saptesprezecelea',
  'al șaptesprezecelea',
  'profi',
]);

const EXCLUDE_NON_FOOD_PATTERNS = [
  /\b(parkside|bormasina|surubelnita|ciocan|fierastrau|clete|polizor|set chei|cheie|bec led|prelungitor|cablu|baterii|acumulator)\b/,
  /\b(tricou|pantaloni|sosete|ciorapi|lenjerie|pijama|geaca|jacheta|hanorac|papuci|slapi|pantofi|adidasi|bluza|rochie)\b/,
  /\b(tigaie|craticioara|oala|ibric|capac|cutit bucatarie|tocator|farfurie|farfurii|cana|pahar|pahare|caserola|caserole|termo|cearceaf|perna|pilota|prosop|perie|lumanare|lumanari|perdea|mop|matura|burete|laveta)\b/,
  /\b(pungi gunoi|pungi menaj|pungi gheata|sac menaj|saci menaj|folie aluminiu|folie alimentara|hartie de copt|hartie copt|scobitori|tacamuri|vesela|cosmia|actuel|clean home|lovepet|babycute|cute baby|home kitchen)\b/,
  /\b(detergent|balsam rufe|balsam de rufe|ariel|persil|lenor|silan|coccolino|dero|savex|perwoll|vanish|calgon|ace |domestos|cif |ajax|fairy|pur |finish|somat|clor|dezinfectant|detartrant|odorizant)\b/,
  /\b(sampon|gel de dus|sapun|pasta de dinti|periuta|deodorant|antiperspirant|crema fata|crema corp|lotiune|parfum|apa de toaleta|tampoane|absorbante|scutece|pampers|servetele umede|servetele |hartie igienica|prosoape hartie|role bucatarie|dischete|betisoare|penseta|bandaj|plasturi)\b/,
  /\b(hrana caini|hrana pisici|hrana uscata|hrana umeda|nisip pisici|litiera|lesa|zgarda|whiskas|pedigree|friskies|purina|felix|kitekat|sheba)\b/,
  /\b(tigari|tutun|iqos|heets|terea|vape|bricheta|carbuni gratar|aprinzator)\b/,
  /\b(jucarie|joc|plus|lego|puzzle|rechizite|caiet|pix|marker|ghiveci|pamant flori|ingrasamant)\b/,
];

const EXCLUDE_CATEGORY_PATH_RE = /\b(curatenie|nealimentare|cosmetice|ingrijire personala|ingrijire casa|scutece|petshop|animale|accesorii petrecere|menaj|textile|electro|jucarii|petrecere|gradina|bricolaj|papetarie|carti|auto|home|dekor)\b/i;

const CATEGORY_MAP_RULES = [
  { slug: 'alternative-bauturi-vegetale', terms: ['bautura vegetala', 'lapte vegetal', 'lapte de ovaz', 'lapte de migdale', 'lapte de soia', 'lapte de cocos', 'alpro'] },
  { slug: 'alimente-bebelusi', terms: ['piure bebe', 'formula lapte', 'aptamil', 'nan ', 'hipp ', 'milupa', 'nestle bebe', 'cereale bebe'] },
  { slug: 'ciocolata', terms: ['ciocolata', 'ciocolată', 'ciocolta', 'praline', 'milka', 'lindt', 'ferrero', 'raffaello', 'kinder', 'mars', 'snickers', 'twix', 'bounty', 'lion', 'kit kat'] },
  { slug: 'biscuiti-napolitane', terms: ['biscuiti', 'biscuiți', 'napolitane', 'napolitana', 'piscoturi', 'oreo', 'belvita', 'leibniz', 'eugenia', 'joe ', 'albeni', 'fursecuri', 'tarte', 'rulada'] },
  { slug: 'patiserie-foietaje', terms: ['croissant', 'foietaj', 'covrig', 'strudel', 'placinta', 'bougatsa', 'pateuri', 'corn cu', 'briosa', 'brioșe'] },
  { slug: 'cozonac-prajituri', terms: ['cozonac', 'chec', 'panettone', 'pandoro', 'tarta', 'prajitura', 'profiterol', 'tiramisu', 'cheesecake', 'desert la pahar', 'turta dulce'] },
  { slug: 'inghetata', terms: ['inghetata', 'înghețată', 'magnum', 'cornetto', 'ben jerry', 'haagen', 'carte dor', 'gelatelli'] },
  { slug: 'cafea', terms: ['cafea', 'espresso', 'nescafe', 'jacobs', 'lavazza', 'illy', 'tchibo', 'davidoff', 'julius meinl', 'capsula', 'capsule cafea', '3 in 1', '3in1', 'cappuccino', 'latte macchiato'] },
  { slug: 'bomboane-guma', terms: ['bomboane', 'jeleuri', 'guma', 'gumă', 'dropsuri', 'orbit', 'haribo', 'skittles', 'caramele'] },
  { slug: 'iaurt-kefir', terms: ['iaurt', 'kefir', 'chefir', 'ayran', 'skyr', 'danonino', 'activia', 'actimel', 'sana ', 'lapte batut', 'lapte bătut'] },
  { slug: 'branzeturi', terms: ['branza', 'telemea', 'cascaval', 'mozzarella', 'parmezan', 'feta', 'halloumi', 'mascarpone', 'ricotta', 'cottage', 'crema de branza', 'cașcaval', 'cheddar', 'brie', 'camembert', 'emmental', 'burrata', 'urda'] },
  { slug: 'unt-smantana', terms: ['unt ', 'unt,', 'unt de masa', 'unt 82', 'unt 80', 'unt 65', 'smantana', 'smântână', 'margarina', 'rama ', 'untisor', 'frisca'] },
  { slug: 'lapte', terms: ['lapte uht', 'lapte proaspat', 'lapte de consum', 'lapte de vaca', 'lapte de capra', 'lapte integral', 'lapte semidegresat', 'lapte degresat', 'lapte 1.5', 'lapte 3.5', 'lapte 1,5', 'lapte 3,5', 'lapte bio', 'lapte fara lactoza', 'lapte '] },
  { slug: 'paste-orez', terms: ['paste', 'spaghetti', 'spaghete', 'penne', 'fusilli', 'farfalle', 'rigatoni', 'tagliatelle', 'lasagna', 'taitei', 'taietei', 'fidea', 'macaroane', 'couscous', 'orez', 'risotto'] },
  { slug: 'oua', terms: ['oua', 'oua de gaina', 'oua proaspete', 'carton oua'] },
  { slug: 'salam-carnati', terms: ['salam', 'carnati', 'cârnați', 'crenvursti', 'cabanoși', 'cabanosi', 'chorizo', 'fuet'] },
  { slug: 'sunca-specialitati', terms: ['sunca', 'șuncă', 'muschi', 'mușchi', 'bacon', 'kaizer', 'costita', 'pastrama', 'parizer', 'prosciutto', 'jamon', 'mortadella'] },
  { slug: 'pate-tartinabile', terms: ['pate ', 'pateu', 'pate de', 'toba', 'caltabos'] },
  { slug: 'paine', terms: ['paine', 'pâine', 'franzela', 'franzelă', 'bagheta', 'baghetă', 'lipie', 'focaccia'] },
  { slug: 'toast-chifle', terms: ['toast', 'chifla', 'chifle', 'burger bun', 'crutoane', 'pesmet'] },
  { slug: 'fructe-proaspete', terms: ['mere ', 'pere ', 'banane', 'portocale', 'mandarine', 'clementine', 'lamai', 'kiwi', 'avocado', 'struguri', 'capsuni', 'afine', 'zmeura', 'mango', 'ananas', 'pepene', 'prune ', 'caise', 'piersici', 'nectarine', 'rodie', 'grepfrut', 'pomelo'] },
  { slug: 'legume-proaspete', terms: ['rosii', 'roșii', 'castraveti', 'ardei', 'dovlecei', 'vinete', 'varza', 'broccoli', 'conopida', 'salata verde', 'rucola', 'spanac', 'fasole verde', 'sparanghel', 'porumb dulce', 'anghinare'] },
  { slug: 'cartofi-radacinoase', terms: ['cartofi', 'morcovi', 'ceapa', 'ceapă', 'usturoi', 'telina', 'țelină', 'pastarnac', 'sfecla', 'ridichi'] },
  { slug: 'verdeata-ierburi', terms: ['patrunjel', 'marar', 'leustean', 'busuioc', 'coriandru', 'menta proaspata', 'rozmarin', 'cimbru'] },
  { slug: 'ciuperci', terms: ['ciuperci', 'champignon', 'pleurotus', 'hribi'] },
  { slug: 'pasare', terms: ['piept de pui', 'pulpe de pui', 'aripi de pui', 'pui grill', 'pui fericit', 'curcan', 'piept de curcan', 'pui rotisat', 'pipote', 'ficat de pui'] },
  { slug: 'carne-porc', terms: ['ceafa de porc', 'cotlet de porc', 'spata de porc', 'pulpa de porc', 'carne tocata porc', 'mici porc', 'fleica'] },
  { slug: 'carne-vita', terms: ['carne de vita', 'antricot', 'vrabioara', 'muschi de vita', 'mici vita', 'carne tocata vita', 'miel'] },
  { slug: 'peste', terms: ['somon', 'pastrav', 'păstrăv', 'dorada', 'biban', 'macrou', 'hering', 'sardine', 'ton ', 'crap', 'salau', 'pangasius', 'merluciu', 'cod ', 'icre'] },
  { slug: 'fructe-de-mare', terms: ['creveti', 'creveți', 'calamar', 'midii', 'caracatita', 'fructe de mare'] },
  { slug: 'faina-malai-cereale', terms: ['faina', 'malai', 'gris', 'amidon'] },
  { slug: 'ulei-otet', terms: ['ulei ', 'ulei de', 'otet', 'oțet', 'balsamic'] },
  { slug: 'conserve', terms: ['conserva', 'porumb dulce conserva', 'mazare conserva', 'fasole conserva', 'masline', 'măsline', 'muraturi', 'castraveti murati', 'passata', 'pasta de tomate', 'bulion', 'rosii pasate', 'rosii decojite', 'compot', 'zacusca'] },
  { slug: 'sosuri-condimente', terms: ['ketchup', 'mustar', 'muștar', 'maioneza', 'maioneză', 'sos ', 'pesto', 'sare ', 'piper', 'boia', 'oregano', 'bors', 'borș', 'vegeta', 'delikat', 'cuburi supa'] },
  { slug: 'leguminoase', terms: ['linte', 'naut', 'năut', 'fasole boabe', 'seminte', 'semințe', 'chia', 'quinoa', 'hrisca'] },
  { slug: 'mic-dejun', terms: ['cereale', 'fulgi de ovaz', 'granola', 'musli', 'miere', 'gem ', 'dulceata', 'dulceață', 'nutella', 'crema de ciocolata', 'unt de arahide'] },
  { slug: 'zahar-indulcitori', terms: ['zahar', 'zahăr', 'indulcitor', 'stevia', 'eritritol'] },
  { slug: 'ingrediente-patiserie', terms: ['praf de copt', 'zahar vanilat', 'esenta', 'cacao', 'gelatina', 'drojdie', 'ciocolata menaj'] },
  { slug: 'chips-snacks', terms: ['chips', 'lays', 'pringles', 'chio', 'doritos', 'covrigei', 'pufuleti', 'popcorn', 'sticksuri', 'crackers', 'saratele', 'nachos'] },
  { slug: 'nuci-fructe-uscate', terms: ['nuci', 'migdale', 'caju', 'fistic', 'alune', 'arahide', 'merisoare', 'stafide', 'curmale', 'smochine', 'agrise deshidratate', 'deshidratat'] },
  { slug: 'batoane', terms: ['baton', 'batoane', 'corny', 'nesquik baton'] },
  { slug: 'apa', terms: ['apa plata', 'apă plată', 'apa minerala', 'apă minerală', 'dorna', 'borsec', 'aqua carpatica', 'bucovina', 'biborteni', 'perenna', 'perrier', 'izvorul minunilor', 'zizin'] },
  { slug: 'sucuri-nectaruri', terms: ['suc ', 'nectar', 'prigat', 'tymbark', 'cappy', 'santal', 'pfanner', 'granini', 'smoothie', 'sirop'] },
  { slug: 'racoritoare', terms: ['coca-cola', 'coca cola', 'pepsi', 'fanta', 'sprite', 'mirinda', '7up', 'schweppes', 'lipton', 'fuzetea', 'nestea', 'limonada', 'tonic', 'frutti fresh', 'adria', 'carbo cola'] },
  { slug: 'ceai-infuzii', terms: ['ceai', 'infuzie', 'fares', 'lipton ceai', 'ahmad', 'twinings'] },
  { slug: 'energizante-sport', terms: ['red bull', 'monster', 'hell ', 'burn', 'energizant', 'bautura energizanta', 'gatorade', 'powerade', 'vitamin aqua'] },
  { slug: 'bere', terms: ['bere ', 'cidru', 'ursus', 'timisoreana', 'ciuc', 'bergenbier', 'heineken', 'stella artois', 'corona', 'peroni', 'tuborg', 'carlsberg', 'becks', 'kozel', 'pilsner', 'somersby', 'radler'] },
  { slug: 'vinuri', terms: ['vin ', 'vinuri', 'purcari', 'jidvei', 'cotnari', 'recas', 'budureasca', 'prosecco', 'spumant', 'sampanie'] },
  { slug: 'bauturi-spirtoase', terms: ['whisky', 'whiskey', 'vodka', 'gin ', 'rom ', 'coniac', 'vinars', 'lichior', 'tequila', 'aperol', 'campari', 'martini', 'palinca', 'tuica', 'jack daniels', 'jagermeister'] },
  { slug: 'congelate-fructe-legume', terms: ['congelat', 'congelate', 'mazare congelata', 'spanac congelat', 'cartofi prajiti congelati', 'cartofi pai congelati'] },
  { slug: 'pizza-panificatie-congelata', terms: ['pizza congelata', 'pizza guseppe', 'pizza ristorante', 'pizza feliciana', 'aluat congelat'] },
];

export function normalizeCanonicalUrlSlug(str) {
  return normalizeText(str)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const TITLE_SAFE_PRIVATE_BRANDS = [
  'k-classic',
  'k classic',
  'k-bio',
  'k bio',
  'k-free',
  'k-favorites',
  'k favorites',
  'pilos',
  'milbona',
  'pikok',
  'dulano',
  'favorina',
  'sondey',
  'kania',
  'freshona',
  'ocean sea',
  'italiamo',
  'chef select',
  'gelatelli',
  'solevita',
  'freeway',
  'alesto',
  'belbake',
  'bellarom',
  'miil',
  'yutto',
  'kitchin',
  'dacello',
  'pappudia',
  'ubomi',
  'fjoru',
  'lambini',
  'modilac',
  'delicatese sezamo',
  'marks & spencer',
  'marks and spencer',
  'mega image',
  'mega apetit',
  'gusturi romanesti',
  'drag de romania',
  'reflets de france',
  'carrefour',
  'auchan',
  'pouce',
  'hanul boieresc',
  'san fabio',
  'gran mare',
  'boni',
  'proxi',
  'gradina bunicii',
  'ferma din deal',
  'deli di',
  'profi',
];

export function isRetailerPrivateBrand(brand, name = '') {
  const bNorm = normalizeBrandKey(brand || '');
  const nNorm = normalizeBrandKey(name || '');
  if (bNorm && PRIVATE_LABEL_BRANDS.has(bNorm)) return true;
  if (bNorm) {
    for (const pb of PRIVATE_LABEL_BRANDS) {
      if (pb.length >= 4 && bNorm === pb) return true;
    }
  }
  for (const pb of TITLE_SAFE_PRIVATE_BRANDS) {
    if (new RegExp(`\\b${pb}\\b`).test(nNorm)) {
      return true;
    }
  }
  return false;
}

export function inferGroceryCategory(name, hintPath, brand, categoriesBySlug) {
  const hintNorm = normalizeText(hintPath || '');
  if (hintNorm && EXCLUDE_CATEGORY_PATH_RE.test(hintNorm)) {
    return { eligible: false, categoryRow: null };
  }
  const fullNorm = ` ${normalizeText(`${name || ''} ${hintPath || ''} ${brand || ''}`)} `;
  for (const re of EXCLUDE_NON_FOOD_PATTERNS) {
    if (re.test(fullNorm)) {
      return { eligible: false, categoryRow: null };
    }
  }

  for (const rule of CATEGORY_MAP_RULES) {
    for (const term of rule.terms) {
      const nTerm = normalizeText(term);
      if (nTerm && fullNorm.includes(` ${nTerm} `)) {
        const cat = categoriesBySlug.get(rule.slug);
        if (cat) return { eligible: true, categoryRow: cat };
      }
    }
  }

  // Category path fallback hints for grocery feeds
  if (/(lactate|branzeturi|oua)/.test(fullNorm)) {
    return { eligible: true, categoryRow: categoriesBySlug.get('branzeturi') || categoriesBySlug.get('lapte') || null };
  }
  if (/(fructe)/.test(fullNorm)) {
    return { eligible: true, categoryRow: categoriesBySlug.get('fructe-proaspete') || null };
  }
  if (/(legume)/.test(fullNorm)) {
    return { eligible: true, categoryRow: categoriesBySlug.get('legume-proaspete') || null };
  }
  if (/(mezeluri)/.test(fullNorm)) {
    return { eligible: true, categoryRow: categoriesBySlug.get('salam-carnati') || null };
  }
  if (/(brutarie|patiserie|paine)/.test(fullNorm)) {
    return { eligible: true, categoryRow: categoriesBySlug.get('paine') || null };
  }
  if (/(dulciuri|biscuiti|snacks)/.test(fullNorm)) {
    return { eligible: true, categoryRow: categoriesBySlug.get('biscuiti-napolitane') || null };
  }
  if (/(bauturi|suc)/.test(fullNorm)) {
    return { eligible: true, categoryRow: categoriesBySlug.get('racoritoare') || null };
  }
  if (/(bacanie|conserve|condimente|alimente de baza)/.test(fullNorm)) {
    return { eligible: true, categoryRow: categoriesBySlug.get('conserve') || null };
  }
  if (/(congelate)/.test(fullNorm)) {
    return { eligible: true, categoryRow: categoriesBySlug.get('preparate-congelate') || null };
  }
  if (/(bio|vegan|dietetic|plant based|plant-based)/.test(fullNorm)) {
    return { eligible: true, categoryRow: categoriesBySlug.get('produse-dietetice') || null };
  }

  return { eligible: false, categoryRow: null };
}

async function fetchAllRows(supabase, table, select, orderCol = 'id', filterFn = null) {
  const rows = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    let q = supabase.from(table).select(select).order(orderCol, { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw new Error(`Error fetching ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    page++;
  }
  return rows;
}

/**
 * Identity key for "the same listing seen again": identical cleaned name + identical pack size.
 * Bolt / Wolt list one item id per store venue, so without this every venue creates its own product.
 */
export function exactNameKey(name, qty) {
  const norm = normalizeText(name || '');
  if (!norm) return null;
  const value = qty ? Number(qty.value) : NaN;
  const unit = qty?.unit ? String(qty.unit).toLowerCase() : '';
  return `${norm}|${Number.isFinite(value) && unit ? `${value}_${unit}` : 'noqty'}`;
}

function canonicalExactKey(prod) {
  if (prod.quantity_value != null && prod.quantity_unit) {
    return exactNameKey(prod.canonical_name, { value: prod.quantity_value, unit: prod.quantity_unit });
  }
  const parsed = parseQuantity(prod.canonical_name);
  return exactNameKey(
    prod.canonical_name,
    parsed ? { value: parsed.baseValue, unit: parsed.baseUnit } : null
  );
}

function indexCanonicalExactName(exactNameIndex, prod) {
  const key = canonicalExactKey(prod);
  if (!key) return;
  if (!exactNameIndex.has(key)) exactNameIndex.set(key, []);
  exactNameIndex.get(key).push(prod);
}

export async function createIngestionContext(supabase) {
  const [allProducts, categories, families, existingSourceBarcodes] = await Promise.all([
    fetchAllRows(
      supabase,
      'beavy_products',
      'id, canonical_name, normalized_name, canonical_key, canonical_code, brand, category, subcategory, category_id, package_size, quantity_value, quantity_unit, barcode, attributes, search_aliases, is_active'
    ),
    fetchAllRows(supabase, 'beavy_categories', 'id, parent_id, slug, name, is_active'),
    fetchAllRows(supabase, 'beavy_product_families', 'id, family_key, canonical_name, normalized_name, category_id, is_active'),
    fetchAllRows(
      supabase,
      'beavy_source_catalog',
      'barcode, canonical_product_id, match_confidence',
      'barcode',
      (q) => q.not('barcode', 'is', null).not('canonical_product_id', 'is', null)
    ),
  ]);

  const activeProducts = allProducts.filter((p) => p.is_active);
  const productsById = new Map(allProducts.map((p) => [p.id, p]));
  const usedCanonicalKeys = new Set(allProducts.map((p) => p.canonical_key).filter(Boolean));
  const usedCanonicalCodes = new Set(allProducts.map((p) => p.canonical_code).filter(Boolean));
  const usedBarcodes = new Set(allProducts.map((p) => p.barcode).filter(Boolean));

  const activeLeafCategories = categories.filter((c) => c.is_active && c.parent_id !== null);
  const activeRootCategories = categories.filter((c) => c.is_active && c.parent_id === null);
  const rootById = new Map(activeRootCategories.map((c) => [c.id, c]));
  const categoriesBySlug = new Map(activeLeafCategories.map((c) => [c.slug, c]));

  const defaultFamilyByCategoryId = new Map();
  const familiesByNormalized = new Map();
  const familiesByCategoryId = new Map();
  for (const fam of families) {
    if (!fam.is_active) continue;
    familiesByNormalized.set(fam.normalized_name, fam);
    if (!familiesByCategoryId.has(fam.category_id)) {
      familiesByCategoryId.set(fam.category_id, []);
    }
    familiesByCategoryId.get(fam.category_id).push(fam);
  }
  for (const [catId, list] of familiesByCategoryId.entries()) {
    const cat = activeLeafCategories.find((c) => c.id === catId);
    const catNorm = cat ? normalizeText(cat.name) : '';
    const best =
      list.find((f) => f.normalized_name === catNorm) ||
      list.find((f) => f.family_key === cat?.slug) ||
      list.find((f) => /generale$/.test(f.family_key || '')) ||
      [...list].sort((a, b) => a.canonical_name.length - b.canonical_name.length)[0];
    if (best) defaultFamilyByCategoryId.set(catId, best);
  }

  const brandIndex = buildBrandPhraseIndex(activeProducts);

  // Unbranded / core-token inverted index for staples without explicit brand matching
  const coreTokenIndex = new Map();
  for (const p of activeProducts) {
    const tokens = tokenize(p.canonical_name).filter((t) => t.length >= 4 && !/^\d/.test(t));
    for (const tok of tokens) {
      if (!coreTokenIndex.has(tok)) coreTokenIndex.set(tok, []);
      const list = coreTokenIndex.get(tok);
      if (list.length < 180) list.push(p);
    }
  }

  // Exact name + pack size -> canonicals (re-listings of one product across venues / sources)
  const exactNameIndex = new Map();
  for (const p of activeProducts) indexCanonicalExactName(exactNameIndex, p);

  // Exact EAN -> canonical mapping (direct beavy_products.barcode + high-confidence unambiguous source_catalog EANs)
  const eanToCanonical = new Map();
  for (const p of activeProducts) {
    if (p.barcode && isValidEanCheckDigit(p.barcode)) {
      eanToCanonical.set(p.barcode.trim(), p);
    }
  }

  const sourceEanMap = new Map();
  for (const row of existingSourceBarcodes) {
    const ean = String(row.barcode || '').trim();
    const cls = classifyBarcode(ean);
    if (!cls || !cls.isGlobalGtin || !cls.validCheckDigit) continue;
    if (Number(row.match_confidence ?? 0) < 0.85) continue;
    const prod = productsById.get(row.canonical_product_id);
    if (!prod || !prod.is_active) continue;
    if (!sourceEanMap.has(ean)) sourceEanMap.set(ean, new Set());
    sourceEanMap.get(ean).add(prod);
  }
  for (const [ean, prodSet] of sourceEanMap.entries()) {
    if (prodSet.size === 1 && !eanToCanonical.has(ean)) {
      eanToCanonical.set(ean, [...prodSet][0]);
    }
  }

  return {
    supabase,
    activeProducts,
    productsById,
    usedCanonicalKeys,
    usedCanonicalCodes,
    usedBarcodes,
    categoriesBySlug,
    rootById,
    defaultFamilyByCategoryId,
    familiesByCategoryId,
    familiesByNormalized,
    brandIndex,
    coreTokenIndex,
    exactNameIndex,
    eanToCanonical,
    pendingBarcodeBackfills: new Map(), // productId -> { ean, source }
    pendingNewProducts: [],
    pendingFamilyLinks: [],
  };
}

export function registerCanonicalIntoContext(ctx, newProd) {
  ctx.activeProducts.push(newProd);
  ctx.productsById.set(newProd.id, newProd);
  if (newProd.canonical_key) ctx.usedCanonicalKeys.add(newProd.canonical_key);
  if (newProd.canonical_code) ctx.usedCanonicalCodes.add(newProd.canonical_code);
  // Products created earlier in this run must be matchable by the next venue / next collector item
  if (ctx.exactNameIndex) indexCanonicalExactName(ctx.exactNameIndex, newProd);
  if (ctx.coreTokenIndex) {
    const tokens = tokenize(newProd.canonical_name).filter((t) => t.length >= 4 && !/^\d/.test(t));
    for (const tok of tokens) {
      if (!ctx.coreTokenIndex.has(tok)) ctx.coreTokenIndex.set(tok, []);
      ctx.coreTokenIndex.get(tok).unshift(newProd);
    }
  }
  if (newProd.barcode) {
    ctx.usedBarcodes.add(newProd.barcode);
    ctx.eanToCanonical.set(newProd.barcode, newProd);
  }
  if (newProd.brand) {
    const norm = normalizeBrandKey(newProd.brand);
    if (norm) {
      if (!ctx.brandIndex.phraseToCanonicals.has(norm)) {
        ctx.brandIndex.phraseToCanonicals.set(norm, new Set());
      }
      ctx.brandIndex.phraseToCanonicals.get(norm).add(newProd);
      const fw = norm.split(' ')[0];
      if (!ctx.brandIndex.firstWordToPhrases.has(fw)) {
        ctx.brandIndex.firstWordToPhrases.set(fw, new Set());
      }
      ctx.brandIndex.firstWordToPhrases.get(fw).add(norm);
    }
  }
}

export function matchExternalProduct(ctx, item) {
  const eanRaw = String(item.barcode || '').trim();
  const cls = eanRaw ? classifyBarcode(eanRaw) : null;
  const validGtin = cls && cls.isGlobalGtin && cls.validCheckDigit ? eanRaw : null;

  const itemQtyStr =
    item.packageSize ||
    (() => {
      const pq = parseQuantity(item.name);
      return pq ? `${pq.baseValue} ${pq.baseUnit}` : '';
    })();
  const extQty = parseQuantity(itemQtyStr || item.name);

  // 1. Exact EAN match FIRST
  if (validGtin && ctx.eanToCanonical.has(validGtin)) {
    const cand = ctx.eanToCanonical.get(validGtin);
    const candQty = parseQuantity(cand.package_size || cand.canonical_name);
    const samePack =
      !candQty ||
      !extQty ||
      (candQty.packCount || 1) === (extQty.packCount || 1);
    if (samePack) {
      return {
        canonical: cand,
        confidence: 0.99,
        method: 'exact_ean',
        reasons: [`Cod de bare identic (${validGtin})`],
      };
    }
  }

  // 1b. Exact same name + same pack size: the same listing from another venue or source.
  // Without a pack size the name alone only identifies a product inside one retailer.
  const exactKey = exactNameKey(
    item.name,
    extQty ? { value: extQty.baseValue, unit: extQty.baseUnit } : null
  );
  const exactHits = exactKey ? ctx.exactNameIndex?.get(exactKey) : null;
  if (exactHits && exactHits.length > 0) {
    const cand = exactHits.find((c) => {
      const exclusive = c.attributes?.is_private_label ? c.attributes?.exclusive_retailer_slug : null;
      if (exclusive && exclusive !== item.retailerSlug) return false;
      if (!extQty) {
        return Boolean(item.retailerSlug) && c.attributes?.retailer_source === item.retailerSlug;
      }
      return true;
    });
    if (cand) {
      return {
        canonical: cand,
        confidence: 0.97,
        method: 'exact_name',
        reasons: ['Denumire și gramaj identice'],
      };
    }
  }

  // 2. Canonical brand + core token candidate scoring
  const lookupTitle = `${item.brand || ''} ${item.name || ''}`.trim();
  const candidateSet = new Set(findBrandCandidatesForTitle(lookupTitle, ctx.brandIndex));

  // Add core token candidates for unbranded items or hyphenated brand variants
  if (candidateSet.size === 0 || !item.brand) {
    const itemTokens = tokenize(item.name).filter((t) => t.length >= 4 && !/^\d/.test(t));
    for (const tok of itemTokens.slice(0, 3)) {
      const hits = ctx.coreTokenIndex.get(tok);
      if (hits) {
        for (const h of hits) candidateSet.add(h);
      }
    }
  }

  let bestMatch = null;
  let highestScore = 0;

  for (const cand of candidateSet) {
    // Respect private label isolation across different retailers
    if (
      cand.attributes?.is_private_label &&
      cand.attributes?.exclusive_retailer_slug &&
      item.retailerSlug &&
      cand.attributes.exclusive_retailer_slug !== item.retailerSlug
    ) {
      continue;
    }

    const scoreResult = scoreCanonicalCandidate(cand, {
      code: validGtin,
      product_name: item.name,
      brands: item.brand || '',
      image_url: item.imageUrl,
      quantity: itemQtyStr,
      requireImage: false,
    });

    const isBulkProduce =
      extQty?.kind === 'mass' &&
      extQty.baseValue === 1000 &&
      cand.quantity_unit === 'kg' &&
      Number(cand.quantity_value) === 1;
    const passesThreshold =
      scoreResult.confidence >= 0.74 &&
      (scoreResult.quantityExact === true || isBulkProduce);

    if (passesThreshold && scoreResult.confidence > highestScore) {
      highestScore = scoreResult.confidence;
      bestMatch = {
        canonical: cand,
        confidence: scoreResult.confidence,
        method: item.brand ? 'brand_and_token_heuristic' : 'unbranded_staple_match',
        reasons: scoreResult.reasons,
      };
    }
  }

  if (bestMatch) {
    const cand = bestMatch.canonical;
    if (
      validGtin &&
      !cand.barcode &&
      !ctx.usedBarcodes.has(validGtin) &&
      bestMatch.confidence >= 0.85
    ) {
      ctx.usedBarcodes.add(validGtin);
      ctx.eanToCanonical.set(validGtin, cand);
      ctx.pendingBarcodeBackfills.set(cand.id, {
        ean: validGtin,
        source: item.source || 'retailer_collector',
      });
    }
    return bestMatch;
  }

  return null;
}

export function pickFamilyForProduct(ctx, categoryRow, cleanName) {
  if (!categoryRow) return null;
  const list = ctx.familiesByCategoryId?.get(categoryRow.id) || [];
  if (list.length > 0) {
    const titleNorm = ` ${normalizeText(cleanName || '')} `;
    let bestSpecific = null;
    let bestSpecificLen = 0;
    for (const fam of list) {
      const fNorm = fam.normalized_name || normalizeText(fam.canonical_name);
      if (!fNorm || fNorm.length < 4) continue;
      if (fNorm === normalizeText(categoryRow.name)) continue;
      if (titleNorm.includes(` ${fNorm} `) && fNorm.length > bestSpecificLen) {
        bestSpecific = fam;
        bestSpecificLen = fNorm.length;
      }
    }
    if (bestSpecific) return bestSpecific;
  }
  return ctx.defaultFamilyByCategoryId.get(categoryRow.id) || null;
}

export function buildNewCanonicalCandidate(ctx, {
  retailerSlug,
  retailerCodePrefix,
  sourceProductId,
  name,
  brand,
  packageSize,
  imageUrl,
  barcode,
  hintCategoryPath,
  isPrivateLabel,
}) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  if (cleanName.length < 4) return null;

  const { eligible, categoryRow } = inferGroceryCategory(
    cleanName,
    hintCategoryPath,
    brand,
    ctx.categoriesBySlug
  );
  if (!eligible || !categoryRow) return null;

  const parsedQty = parseQuantity(packageSize || cleanName);
  const qVal = parsedQty?.baseValue ?? null;
  const qUnit = parsedQty?.baseUnit ?? null;
  const displayPkg = packageSize || (parsedQty ? `${parsedQty.baseValue} ${parsedQty.baseUnit}` : null);
  if (!displayPkg && !/\b(vrac|per kg|kg)\b/i.test(cleanName)) {
    return null;
  }

  const cls = barcode ? classifyBarcode(String(barcode).trim()) : null;
  const validGtin =
    cls && cls.isGlobalGtin && cls.validCheckDigit && !ctx.usedBarcodes.has(String(barcode).trim())
      ? String(barcode).trim()
      : null;

  const slugBase = normalizeCanonicalUrlSlug(`${brand || ''} ${cleanName}`);
  const canonicalKey = `${slugBase}-${retailerCodePrefix.toLowerCase()}-${String(sourceProductId).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const canonicalCode = `BEV-${retailerCodePrefix.toUpperCase()}-${String(sourceProductId).replace(/[^a-zA-Z0-9_-]/g, '')}`;

  if (ctx.usedCanonicalKeys.has(canonicalKey) || ctx.usedCanonicalCodes.has(canonicalCode)) {
    return null;
  }

  const rootCat = ctx.rootById.get(categoryRow.parent_id);
  const categoryDisplayName = rootCat ? rootCat.name : categoryRow.name;
  const subcategoryDisplayName = categoryRow.name;

  const newCanonical = {
    id: crypto.randomUUID(),
    canonical_name: cleanName,
    normalized_name: normalizeText(cleanName),
    canonical_key: canonicalKey,
    canonical_code: canonicalCode,
    canonical_fingerprint: validGtin
      ? `ean:${validGtin}`
      : `${normalizeBrandKey(brand || 'unbranded')}:${normalizeText(cleanName).split(' ').slice(0, 4).join('-')}:${qVal ?? 'noqty'}_${qUnit ?? 'nounit'}`,
    brand: brand ? String(brand).trim() : null,
    category: categoryDisplayName,
    subcategory: subcategoryDisplayName,
    category_id: categoryRow.id,
    package_size: displayPkg,
    quantity_value: qVal,
    quantity_unit: qUnit,
    barcode: validGtin,
    barcode_source: validGtin ? retailerSlug : null,
    image_url: imageUrl || null,
    image_source: imageUrl ? retailerSlug : null,
    search_aliases: [brand, subcategoryDisplayName, displayPkg].filter(Boolean),
    is_active: true,
    attributes: {
      retailer_source: retailerSlug,
      is_private_label: Boolean(isPrivateLabel),
      exclusive_retailer_slug: isPrivateLabel ? retailerSlug : null,
      promoted_from_collector: true,
    },
  };

  registerCanonicalIntoContext(ctx, newCanonical);
  ctx.pendingNewProducts.push(newCanonical);

  const fam = pickFamilyForProduct(ctx, categoryRow, cleanName);
  if (fam) {
    ctx.pendingFamilyLinks.push({
      family_id: fam.id,
      product_id: newCanonical.id,
      sort_order: 99,
      is_featured: false,
    });
  }

  return newCanonical;
}

export async function flushContextAndOffers(ctx, {
  retailerId,
  retailerSlug,
  retailerName,
  source,
  sourceCatalogRows,
  offerRows,
}) {
  const { supabase } = ctx;

  // Never replace a retailer snapshot with an empty or unexpectedly tiny scrape.
  // This catches blocked pages and parser regressions before any existing data is deleted.
  if (!Array.isArray(offerRows) || offerRows.length < 20) {
    throw new Error(
      `Refusing to replace ${retailerName} offers: scrape produced ${offerRows?.length ?? 0} offers (minimum 20).`
    );
  }

  // Încercare ingestie de mare viteză prin RPC SECURITY DEFINER (funcționează și cu anon și cu service_role)
  if (ctx.pendingNewProducts.length > 0 || sourceCatalogRows.length > 0 || offerRows.length > 0) {
    try {
      const totalNew = ctx.pendingNewProducts.length;
      const totalFam = ctx.pendingFamilyLinks.length;
      const dedupSourceRows = Array.from(
        new Map(sourceCatalogRows.map((r) => [String(r.source_product_id), r])).values()
      );

      // Pasul 1: Inserare produse canonice noi în loturi de câte 50
      for (let i = 0; i < ctx.pendingNewProducts.length; i += 50) {
        const chunk = ctx.pendingNewProducts.slice(i, i + 50);
        const { error } = await supabase.rpc('beavy_ingest_retailer_batch', {
          p_retailer_id: retailerId,
          p_delete_existing_offers: false,
          p_new_products: chunk,
          p_family_links: [],
          p_source_rows: [],
          p_offer_rows: [],
        });
        if (error) throw new Error(`Eroare inserare produse noi chunk ${i}: ${error.message}`);
      }
      if (totalNew > 0) {
        console.log(`  ✨ [RPC] Promovate ${totalNew} produse canonice noi din ${retailerName}.`);
        ctx.pendingNewProducts = [];
      }

      // Pasul 2: Legături de familie pentru produsele existente
      for (let i = 0; i < ctx.pendingFamilyLinks.length; i += 100) {
        const chunk = ctx.pendingFamilyLinks.slice(i, i + 100);
        const { error } = await supabase.rpc('beavy_ingest_retailer_batch', {
          p_retailer_id: retailerId,
          p_delete_existing_offers: false,
          p_new_products: [],
          p_family_links: chunk,
          p_source_rows: [],
          p_offer_rows: [],
        });
        if (error) throw new Error(`Eroare legături familie chunk ${i}: ${error.message}`);
      }
      if (totalFam > 0) {
        console.log(`  🔗 [RPC] Înregistrate ${totalFam} legături de familie.`);
        ctx.pendingFamilyLinks = [];
      }

      // Pasul 3: Actualizare catalog sursă
      for (let i = 0; i < dedupSourceRows.length; i += 100) {
        const chunk = dedupSourceRows.slice(i, i + 100);
        const { error } = await supabase.rpc('beavy_ingest_retailer_batch', {
          p_retailer_id: retailerId,
          p_delete_existing_offers: false,
          p_new_products: [],
          p_family_links: [],
          p_source_rows: chunk,
          p_offer_rows: [],
        });
        if (error) throw new Error(`Eroare source catalog chunk ${i}: ${error.message}`);
      }
      console.log(`  📦 [RPC] Salvate ${dedupSourceRows.length} rânduri în beavy_source_catalog (${source}).`);

      // Pasul 4: Înlocuire oferte vechi și inserare oferte noi
      for (let i = 0; i < offerRows.length; i += 100) {
        const chunk = offerRows.slice(i, i + 100);
        const isFirst = i === 0;
        const { error } = await supabase.rpc('beavy_ingest_retailer_batch', {
          p_retailer_id: retailerId,
          p_delete_existing_offers: isFirst,
          p_new_products: [],
          p_family_links: [],
          p_source_rows: [],
          p_offer_rows: chunk,
        });
        if (error) throw new Error(`Eroare oferte chunk ${i}: ${error.message}`);
      }
      console.log(`  ✅ [RPC] Inserate ${offerRows.length} oferte active în beavy_product_offers (${retailerName}).`);

      return {
        sourceCount: dedupSourceRows.length,
        offersCount: offerRows.length,
      };
    } catch (rpcErr) {
      console.log(`  ⚠️ RPC ingestie indisponibil (${rpcErr.message}), continuăm cu operațiuni directe...`);
    }
  }

  // 1. Insert any newly promoted canonical products
  if (ctx.pendingNewProducts.length > 0) {
    for (let i = 0; i < ctx.pendingNewProducts.length; i += 100) {
      const chunk = ctx.pendingNewProducts.slice(i, i + 100);
      const { error } = await supabase.from('beavy_products').insert(chunk);
      if (error) {
        console.error(`  ⚠️ Insert promoted canonical chunk ${i} error:`, error.message);
      }
    }
    console.log(`  ✨ Promovate ${ctx.pendingNewProducts.length} produse canonice noi din ${retailerName}.`);
    ctx.pendingNewProducts = [];
  }

  if (ctx.pendingFamilyLinks.length > 0) {
    for (let i = 0; i < ctx.pendingFamilyLinks.length; i += 200) {
      const chunk = ctx.pendingFamilyLinks.slice(i, i + 200);
      const { error } = await supabase
        .from('beavy_product_family_members')
        .upsert(chunk, { onConflict: 'family_id,product_id', ignoreDuplicates: true });
      if (error) {
        console.error(`  ⚠️ Upsert family members chunk ${i} error:`, error.message);
      }
    }
    ctx.pendingFamilyLinks = [];
  }

  // 2. Backfill missing barcodes onto existing canonical products
  if (ctx.pendingBarcodeBackfills.size > 0) {
    let okCount = 0;
    const entries = [...ctx.pendingBarcodeBackfills.entries()];
    for (const [productId, { ean, source: bcSource }] of entries) {
      const { error } = await supabase
        .from('beavy_products')
        .update({ barcode: ean, barcode_source: bcSource })
        .eq('id', productId)
        .is('barcode', null);
      if (!error) okCount++;
    }
    console.log(`  🏷️ Actualizate ${okCount}/${entries.length} coduri de bare EAN pe produse canonice.`);
    ctx.pendingBarcodeBackfills.clear();
  }

  // 3. Save source_catalog cleanly for this retailer (deduplicated by source_product_id)
  if (sourceCatalogRows.length > 0) {
    const dedupSourceRows = Array.from(
      new Map(sourceCatalogRows.map((r) => [String(r.source_product_id), r])).values()
    );
    const { error: sourceDeleteError } = await supabase
      .from('beavy_source_catalog')
      .delete()
      .eq('retailer_id', retailerId);
    if (sourceDeleteError) {
      throw new Error(`Could not replace ${retailerName} source catalog: ${sourceDeleteError.message}`);
    }
    for (let i = 0; i < dedupSourceRows.length; i += 200) {
      const chunk = dedupSourceRows.slice(i, i + 200);
      const { error } = await supabase
        .from('beavy_source_catalog')
        .upsert(chunk, { onConflict: 'source,source_product_id' });
      if (error) {
        throw new Error(`Could not save ${retailerName} source catalog chunk ${i}: ${error.message}`);
      }
    }
    console.log(`  📦 Salvate ${dedupSourceRows.length} rânduri în beavy_source_catalog (${source}).`);
  }

  // 4. Replace active snapshot offers for retailer cleanly
  const { error: offersDeleteError } = await supabase
    .from('beavy_product_offers')
    .delete()
    .eq('retailer_id', retailerId);
  if (offersDeleteError) {
    throw new Error(`Could not replace ${retailerName} offers: ${offersDeleteError.message}`);
  }
  let inserted = 0;
  for (let i = 0; i < offerRows.length; i += 100) {
    const chunk = offerRows.slice(i, i + 100);
    const { error } = await supabase.from('beavy_product_offers').insert(chunk);
    if (error) {
      throw new Error(`Could not save ${retailerName} offers chunk ${i}: ${error.message}`);
    }
    inserted += chunk.length;
  }
  console.log(`  ✅ Inserate ${inserted} oferte active în beavy_product_offers (${retailerName}).`);

  return {
    sourceCount: sourceCatalogRows.length,
    offersCount: offerRows.length,
  };
}

export function buildStandardOffer({
  productId,
  retailerId,
  retailerName,
  source,
  price,
  regularPrice,
  promoPrice,
  loyaltyPrice,
  promoLabel,
  promoRequiresCard,
  packageSize,
  quantityValue,
  quantityUnit,
  productUrl,
  imageUrl,
  fulfillmentChannel,
  city = 'București',
  isAvailable = true,
  rawData = {},
}) {
  const parsedQty = parseQuantity(packageSize || (quantityValue && quantityUnit ? `${quantityValue} ${quantityUnit}` : ''));
  const effectiveForUnit = promoPrice ?? price;
  const { normalizedUnitPrice, normalizedUnitLabel } = computeNormalizedUnitPrice(
    effectiveForUnit,
    parsedQty
  );

  return {
    product_id: productId,
    retailer_id: retailerId,
    retailer_name: retailerName,
    source,
    price,
    regular_price: regularPrice ?? price,
    promo_price: promoPrice ?? null,
    loyalty_price: loyaltyPrice ?? null,
    promo_label: promoLabel ?? null,
    promo_requires_card: Boolean(promoRequiresCard),
    currency: 'RON',
    unit_price: normalizedUnitPrice,
    normalized_unit_price: normalizedUnitPrice,
    normalized_unit_label: normalizedUnitLabel,
    quantity_value: quantityValue ?? parsedQty?.baseValue ?? null,
    quantity_unit: quantityUnit ?? parsedQty?.baseUnit ?? null,
    package_size: packageSize ?? (parsedQty ? `${parsedQty.baseValue} ${parsedQty.baseUnit}` : null),
    product_url: productUrl || null,
    image_url: imageUrl || null,
    fulfillment_channel: fulfillmentChannel,
    city,
    stock_status: isAvailable ? 'in_stock' : 'out_of_stock',
    availability: isAvailable ? 'in_stock' : 'out_of_stock',
    is_active: true,
    observed_at: new Date().toISOString(),
    raw_data: rawData,
  };
}
