import crypto from 'node:crypto';
import {
  computeContentHash,
  computeNormalizedUnitPrice,
  extractFatPercentages,
  normalizeText,
  parseQuantity,
  scoreCanonicalCandidate,
  sqlLiteral,
  toBaseUnit,
  tokenize,
} from './catalog-normalization.mjs';

const FRESHFUL_BASE_URL = 'https://www.freshful.ro';

const MARKETING_STOP_WORDS = new Set([
  'din',
  'inima',
  'ardealului',
  'de',
  'la',
  'cu',
  'si',
  'grasime',
  'pachet',
  'promotional',
  'oferta',
  'nou',
  'pentru',
  'in',
  'pe',
]);

/**
 * Formatează inteligent numele de brand (ex: MĂCELĂRIA GHIȚĂ -> Măcelăria Ghiță),
 * ignorând placeholder-ul „No Brand”.
 */
export function normalizeBrandDisplay(rawBrand) {
  const trimmed = String(rawBrand ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed || /^no[\s_-]*brand$/i.test(trimmed)) return null;

  const lettersOnly = trimmed.replace(/[^a-zA-ZĂÂÎȘȚăâîșț]/g, '');
  if (lettersOnly.length >= 4 && trimmed === trimmed.toLocaleUpperCase('ro-RO')) {
    return trimmed
      .toLocaleLowerCase('ro-RO')
      .split(' ')
      .map((w) => (w.length > 0 ? w[0].toLocaleUpperCase('ro-RO') + w.slice(1) : w))
      .join(' ');
  }
  return trimmed;
}

/**
 * Extrage gramajul/volumul curat de afișat din titlul Freshful.
 */
export function extractPackageSize(name, fallback = null) {
  const raw = String(name ?? '').trim();
  if (raw) {
    const multi = raw.match(/(\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|ml|cl|buc\.?|bucăți|bucati))/i);
    if (multi) {
      return multi[1]
        .replace(/\s+/g, ' ')
        .replace(/(\d)(kg|g|ml|cl|l)\b/i, '$1 $2')
        .replace(/\b(l)\b/i, 'L')
        .trim();
    }
    const single = raw.match(/(\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|ml|cl|buc\.?|bucăți|bucati))(?=\b|\s|$|[,;)])/i);
    if (single) {
      return single[1]
        .replace(/\s+/g, ' ')
        .replace(/(\d)\s*(kg|g|gr|l|ml|cl)\b/i, '$1 $2')
        .replace(/\bl\b/i, 'L')
        .replace(/\bgr\b/i, 'g')
        .trim();
    }
  }
  return fallback ? String(fallback).trim() : null;
}

/**
 * Construiește denumirea canonică completă (incluzând brandul dacă nu e deja prefixat).
 */
export function buildCanonicalDisplayName(brandDisplay, rawName) {
  const name = String(rawName ?? '').replace(/\s+/g, ' ').trim();
  if (!brandDisplay) return name;

  const brandTokens = tokenize(brandDisplay);
  const nameNorm = normalizeText(name);
  const startsWithBrand =
    brandTokens.length > 0 &&
    (nameNorm.startsWith(brandTokens.join(' ')) ||
      nameNorm.startsWith(brandTokens.join('')) ||
      tokenize(name).slice(0, brandTokens.length).join(' ') === brandTokens.join(' '));

  return startsWithBrand ? name : `${brandDisplay} ${name}`;
}

/**
 * Parsează eticheta de preț unitar oferită de Freshful (ex: "31,97 Lei/kg").
 */
export function parseRetailerUnitPriceLabel(label) {
  const clean = String(label ?? '').trim();
  if (!clean) return { retailerUnitPrice: null, retailerUnitLabel: null };
  const m = clean.match(/(\d+(?:[.,]\d+)?)\s*Lei\s*\/\s*([a-zA-Zăâîșț]+)/i);
  if (!m) return { retailerUnitPrice: null, retailerUnitLabel: clean };
  const val = Number(m[1].replace(',', '.'));
  const unitRaw = m[2].toLowerCase() === 'l' ? 'L' : m[2].toLowerCase();
  return {
    retailerUnitPrice: Number.isFinite(val) ? Math.round(val * 100) / 100 : null,
    retailerUnitLabel: `RON/${unitRaw}`,
  };
}

/**
 * Extrage și normalizează complet un item brut din API-ul / DOM-ul Freshful.
 */
export function extractFreshfulRecord(raw, contextMeta = {}) {
  const sourceProductId = String(raw.sku ?? raw.code ?? raw.variantCode ?? '').trim();
  const slug = String(raw.slug ?? '').trim();
  const productUrl = raw.product_url
    ? String(raw.product_url)
    : slug
    ? `${FRESHFUL_BASE_URL}/p/${slug}`
    : null;

  const rawName = String(raw.name ?? '').replace(/\s+/g, ' ').trim();
  const brand = normalizeBrandDisplay(raw.brand);
  const canonicalCandidateName = buildCanonicalDisplayName(brand, rawName);

  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const tagTypes = rawTags.map((t) => String(t.type ?? '')).filter(Boolean);
  const tagTexts = rawTags.map((t) => String(t.text ?? '')).filter(Boolean);

  const normFull = normalizeText(`${canonicalCandidateName} ${tagTypes.join(' ')} ${tagTexts.join(' ')}`);
  const fatList = extractFatPercentages(rawName);
  const fatPercentageMin = fatList.length > 0 ? Math.min(...fatList) : null;
  const fatPercentageMax = fatList.length > 0 ? Math.max(...fatList) : null;
  const fatPercentage = fatList.length === 1 ? fatList[0] : fatPercentageMin;

  const isLactoseFree =
    /\b(fara lactoza|lactose free|delactozat)\b/.test(normFull) ||
    tagTypes.some((t) => /nolactose/i.test(t));
  const isBio =
    /\b(bio|ecologic|ecologica|organic|eco)\b/.test(normFull) ||
    tagTypes.some((t) => /^(eco|bio|organic)$/i.test(t));
  const isUht = /\buht\b/.test(normFull);
  const madeInRomania = tagTypes.some((t) => /MadeInRomania/i.test(t));

  const packageSize = extractPackageSize(rawName, raw.package_size ?? null);
  const parsedQty = parseQuantity(packageSize || rawName);
  const sellByMode = /\b(vrac|per kg|\/kg)\b/.test(normFull) ? 'kg' : 'unit';

  const includePrices = Boolean(contextMeta.includePrices);
  const effectivePrice = includePrices && raw.price != null && Number.isFinite(Number(raw.price))
    ? Math.round(Number(raw.price) * 100) / 100
    : null;
  const origNum = includePrices && raw.originalPrice != null && Number.isFinite(Number(raw.originalPrice))
    ? Math.round(Number(raw.originalPrice) * 100) / 100
    : null;
  const promoNum = includePrices && raw.promotionalPrice != null && Number.isFinite(Number(raw.promotionalPrice))
    ? Math.round(Number(raw.promotionalPrice) * 100) / 100
    : null;
  const geniusNum = includePrices && raw.geniusPrice != null && Number.isFinite(Number(raw.geniusPrice))
    ? Math.round(Number(raw.geniusPrice) * 100) / 100
    : null;

  const regularPrice = origNum !== null && effectivePrice !== null && origNum > effectivePrice
    ? origNum
    : null;
  const promoPrice = regularPrice !== null ? effectivePrice : promoNum;
  const loyaltyPrice = geniusNum !== null && (effectivePrice === null || geniusNum < effectivePrice)
    ? geniusNum
    : null;

  const promoLabel = includePrices
    ? String(raw.discountLabel ?? '').trim() ||
      String(raw.activePromotion?.name ?? '').trim() ||
      (regularPrice !== null && effectivePrice !== null
        ? `-${Math.round(((regularPrice - effectivePrice) / regularPrice) * 100)}%`
        : null)
    : null;

  const qtyForUnit = parsedQty ?? (sellByMode === 'kg' ? toBaseUnit(1, 'kg', 1) : null);
  const { normalizedUnitPrice, normalizedUnitLabel } = includePrices
    ? computeNormalizedUnitPrice(effectivePrice, qtyForUnit)
    : { normalizedUnitPrice: null, normalizedUnitLabel: null };
  const { retailerUnitPrice, retailerUnitLabel } = includePrices
    ? parseRetailerUnitPriceLabel(raw.unitPriceLabel)
    : { retailerUnitPrice: null, retailerUnitLabel: null };

  const imageUrl =
    raw.image?.extralarge?.default ||
    raw.image?.large?.default ||
    raw.image?.thumbnail?.default ||
    raw.image_url ||
    null;
  const thumbnailUrl = raw.image?.thumbnail?.default || raw.image?.large?.default || imageUrl;

  const breadcrumbs = Array.isArray(raw.breadcrumbs)
    ? raw.breadcrumbs.map((b) => String(b.name ?? '').trim()).filter(Boolean)
    : [];
  const externalCategoryPath =
    breadcrumbs.length > 0
      ? breadcrumbs.join(' > ')
      : contextMeta.externalCategoryPath || contextMeta.categoryName || null;

  const isAvailable = raw.isAvailable !== false;
  const stockStatus = !isAvailable
    ? 'out_of_stock'
    : raw.maxAvailableQuantity != null && Number(raw.maxAvailableQuantity) > 0 && Number(raw.maxAvailableQuantity) <= 3
    ? 'low_stock'
    : 'in_stock';

  const record = {
    source_product_id: sourceProductId,
    variant_code: raw.variantCode ? String(raw.variantCode).trim() : sourceProductId,
    slug,
    source_product_name: rawName,
    canonical_candidate_name: canonicalCandidateName,
    normalized_source_name: normalizeText(rawName),
    normalized_candidate_name: normalizeText(canonicalCandidateName),
    brand,
    brand_code: raw.brandCode ? String(raw.brandCode) : null,
    package_size: packageSize,
    quantity_value: parsedQty ? parsedQty.baseValue : null,
    quantity_unit: parsedQty ? parsedQty.baseUnit : null,
    pack_count: parsedQty ? parsedQty.packCount : 1,
    sell_by_mode: sellByMode,
    fat_percentage: fatPercentage,
    fat_percentage_min: fatPercentageMin,
    fat_percentage_max: fatPercentageMax,
    is_lactose_free: isLactoseFree,
    is_bio: isBio,
    is_uht: isUht,
    made_in_romania: madeInRomania,
    tags: tagTexts,
    tag_types: tagTypes,
    price: effectivePrice,
    regular_price: regularPrice,
    promo_price: promoPrice,
    loyalty_price: loyaltyPrice,
    promo_label: promoLabel,
    promo_requires_card: Boolean(loyaltyPrice !== null && promoPrice === null),
    retailer_unit_price_label: raw.unitPriceLabel || null,
    retailer_unit_price: retailerUnitPrice,
    retailer_unit_label: retailerUnitLabel,
    normalized_unit_price: normalizedUnitPrice ?? retailerUnitPrice,
    normalized_unit_label: normalizedUnitLabel ?? retailerUnitLabel,
    stock_status: stockStatus,
    availability: stockStatus === 'out_of_stock' ? 'out_of_stock' : 'in_stock',
    is_available: isAvailable,
    max_available_quantity: raw.maxAvailableQuantity ?? null,
    external_category_path: externalCategoryPath,
    category_slug_freshful: contextMeta.categorySlug ?? null,
    image_url: imageUrl,
    thumbnail_url: thumbnailUrl,
    product_url: productUrl,
    source_page: contextMeta.page ?? raw.source_page ?? null,
    sponsored: Boolean(raw.sponsored),
    observed_at: contextMeta.observedAt ?? new Date().toISOString(),
  };

  return {
    ...record,
    content_hash: computeContentHash({
      sku: record.source_product_id,
      name: record.normalized_source_name,
      brand: record.brand,
      qty: record.quantity_value,
      unit: record.quantity_unit,
      ...(includePrices
        ? {
            price: record.price,
            reg: record.regular_price,
            promo: record.promo_price,
            loyal: record.loyalty_price,
          }
        : {}),
      stock: record.stock_status,
      img: record.image_url,
    }),
  };
}

/**
 * Elimină toate câmpurile de preț / promoție dintr-un item extras (mod catalog canonic pur).
 */
export function stripFreshfulPrices(item) {
  const cleaned = {
    ...item,
    price: null,
    regular_price: null,
    promo_price: null,
    loyalty_price: null,
    promo_label: null,
    promo_requires_card: false,
    retailer_unit_price_label: null,
    retailer_unit_price: null,
    retailer_unit_label: null,
    normalized_unit_price: null,
    normalized_unit_label: null,
  };
  return {
    ...cleaned,
    content_hash: computeContentHash({
      sku: cleaned.source_product_id,
      name: cleaned.normalized_source_name,
      brand: cleaned.brand,
      qty: cleaned.quantity_value,
      unit: cleaned.quantity_unit,
      stock: cleaned.stock_status,
      img: cleaned.image_url,
    }),
  };
}

/**
 * Calculează semnătura canonică intra-lot pentru detectarea dublurilor sub SKU-uri diferite.
 */
/**
 * Categoriile Freshful de nivel 2 puse pe hold în MVP (non-alimentare).
 * Datele rămân colectate local; doar nu intră în catalogul canonic activ.
 */
export const NON_FOOD_FRESHFUL_SLUGS = new Set([
  // Tutun & suplimente (nu sunt alimente de coș)
  '707-tutun',
  '1003-suplimente-alimentare',
  // Cosmetice & îngrijire personală
  '1101-deodorante-si-parfumuri',
  '1102-produse-pentru-barbierit-si-ingrijit-ten',
  '1103-creme-intretinere-si-demachiante',
  '1104-produse-cu-protectie-solara',
  '1105-ceara-benzi-si-creme-depliatoare',
  '1106-seturi-cadou',
  '1107-ingrijirea-parului',
  '1108-igienta-inima',
  '1109-igiena-dentara',
  '1110-sapunuri-si-geluri-de-dus',
  '1111-dermatocosmetice-si-parafarmacie',
  'repelent',
  // Mama & copilul — doar igienă/puericultură (alimentele bebe rămân)
  '1202-igiena-bebe',
  '1203-puericultura',
  // Detergenți & igienizare
  '1301-spalare-si-intretinere-rufe',
  '1302-igienizarea-casei',
  '1303-hartie-igienica-si-servetele',
  // Casă & agrement
  '1401-bricolaj-si-auto',
  '1402-gradina',
  '1403-articole-de-menaj',
  '1405-birotica-si-papetarie',
  '1408-hitech-audio-video',
  '1410-textile-basic',
  'articole-de-sezon',
  'electrocasnice-mici',
  // Pet shop
  '1501-pisici',
  '1502-caini',
  '1503-pasari-si-rozatoare',
  // Jucării
  '1801-lego-r',
  '1802-educative-creative-si-jocuri',
  '1803-constructie-vehicule-si-exterior',
  '1804-papusi-personaje-si-colectionabile',
  '1805-jucarii-bebe',
]);

/**
 * Slug-urile `beavy_categories` corespunzătoare zonei non-alimentare (dezactivate în MVP).
 */
export const NON_FOOD_BEAVY_CATEGORY_SLUGS = [
  'tutun',
  'suplimente-alimentare',
  'cosmetice-ingrijire',
  'deodorante-parfumuri',
  'ingrijire-ten-corp',
  'ingrijire-par',
  'igiena-personala',
  'igiena-dentara',
  'igiena-bebe',
  'puericultura',
  'detergenti-igienizare',
  'detergenti-rufe',
  'curatenie-casa',
  'hartie-servetele',
  'casa-agrement',
  'articole-menaj',
  'birotica-papetarie',
  'bricolaj-gradina-auto',
  'casa-textile-it-sezon',
  'pet-shop',
  'hrana-pisici',
  'hrana-caini',
  'pasari-rozatoare',
  'jucarii',
  'lego',
  'jucarii-jocuri',
];

/**
 * True dacă produsul aparține catalogului alimentar activ (MVP).
 * Un SKU listat în mai multe raioane e păstrat dacă oricare raion observat e alimentar.
 */
export function isFoodFreshfulItem(item) {
  const slugs = [
    item.category_slug_freshful,
    ...(Array.isArray(item.observed_categories) ? item.observed_categories : []),
  ].filter(Boolean);
  if (slugs.length === 0) return true;
  return slugs.some((s) => !NON_FOOD_FRESHFUL_SLUGS.has(s));
}

/**
 * Sub-raioane specializate puse pe hold în modul `core` (produse uzuale de supermarket).
 */
export const CORE_EXCLUDED_FRESHFUL_SLUGS = new Set([
  '1004-bucatarie-internationala',
  '1005-nutritie-sportiva',
  '505-ready-meal',
]);

/**
 * Branduri naționale și esențiale prezente constant în majoritatea supermarketurilor din România.
 * Cheile sunt normalizate cu `normalizeText(...)` (diacritice & punctuație eliminate).
 */
export const CORE_SUPERMARKET_BRANDS = new Set([
  // Lactate, ouă & brânzeturi uzuale
  'zuzu', 'zuzu barista', 'napolact', 'napolact bio', 'olympus', 'albalact', 'covalact',
  'ladorna', 'muller', 'danone', 'activia', 'actimel', 'danonino', 'danette', 'hochland',
  'delaco', 'president', 'philadelphia', 'almette', 'galbani', 'ile de france', 'meggle',
  'lurpak', 'kerrygold', 'babybel', 'la vache qui rit', 'leerdammer', 'unirea', 'hulala',
  'alpro', 'violife', 'inedit', 'toneli', 'regalina', 'oua de tara', 'agricola',
  'laptaria cu caimac', 'artesana', 'mirdatod', 'five continents',
  // Carne, pui, mezeluri & pește de supermarket
  'la provincia', 'fragedo', 'cocorico', 'copioso', 'ferma poiana', 'puiul fericit',
  'puiul gospodarului', 'bravito', 'diana', 'peris', 'samcom', 'romferm', 'kravys', 'chef de grill',
  'cris tim', 'cristim', 'caroli', 'meda', 'matache macelaru', 'aldis', 'fox', 'elit',
  'sissi', 'reinert', 'reinert martinel', 'campofrio', 'wudy', 'scandia sibiu',
  'bucegi', 'ardealul', 'mandy', 'patelina', 'rio mare', 'calvo', 'eva', 'ocean fish',
  'alfredo seafood', 'negro',
  // Brutărie, toast & patiserie uzuală
  'vel pitar', 'dobrogea', 'boromir', 'schulstad', 'roberto', 'pambac', 'titan',
  'kb', 'savoria', 'dijo', 'delisun', 'la boulangere', 'grewe',
  '7days', 'barni', 'magura', 'eugenia', 'albeni',
  // Băcănie, paste, orez, ulei, făină, conserve, sosuri, condimente, mic dejun
  'barilla', 'baneasa', 'monte banato', 'panzani', 'de cecco', 'rana', 'riso scotti', 'scotti',
  'deroni', 'atifco', 'bob cu bob', 'sapte spice', 'bunica', 'floriol', 'spornic', 'unisol',
  'costa d oro', 'monini', 'olitalia', 'borges', 'margaritar', 'diamant', 'coronita',
  'dr oetker', 'coseli', 'kamis', 'kotanyi', 'fuchs', 'cosmin', 'maggi', 'knorr',
  'delikat', 'vegeta', 'heinz', 'hellmann s', 'tomi', 'calve', 'univer', 'laminut',
  'mutti', 'cirio', 'bonduelle', 'daucy', 'raureni', 'topoloveni', 'olympia', 'home garden',
  'sanovita', 'nestle', 'fitness', 'cini minis', 'nesquik', 'nutella', 'fineti',
  'dole', 'eisberg', 'oliveris',
  // Dulciuri & snacks
  'milka', 'poiana', 'kandia', 'laura', 'heidi', 'lindt', 'schogetten', 'merci', 'kinder',
  'ferrero rocher', 'raffaello', 'after eight', 'toffifee', 'roshen', 'rom', 'fagaras',
  'oreo', 'belvita', 'mcvitie s', 'mc vitie s', 'dare', 'ulker', 'biskrem', 'loacker',
  'joe', 'knoppers', 'snickers', 'twix', 'mars', 'bounty', 'lion', 'kit kat', 'corny',
  'm m s', 'toblerone', 'africana', 'alka', 'ritter sport', 'lays', 'chio', 'pringles',
  'doritos', 'pom bar', 'tuc', 'croco', 'toortitzi', 'salatini', 'viva', 'lotto', 'gusto',
  'mogyi', 'nutline', 'orbit', 'airwaves', 'haribo', 'sugus', 'nimm2', 'mentos',
  // Congelate & înghețată
  'edenia', 'casa taraneasca', 'frosta', 'hortex', 'aviko', 'dr oetker guseppe',
  'magnum', 'corso', 'aloma', 'betty ice', 'betty blue', 'cornetto', 'carte d or', 'nirvana', 'nuii',
  // Apă, sucuri, răcoritoare, cafea, ceai
  'aqua carpatica', 'borsec', 'bucovina', 'dorna', 'biborteni', 'perla harghitei', 'zizin',
  'izvorul minunilor', 'tusnad', 'coca cola', 'pepsi', 'fanta', 'sprite', 'schweppes', '7up',
  'mirinda', 'lipton', 'fuzetea', 'nestea', 'cappy', 'prigat', 'santal',
  'tymbark', 'pfanner', 'granini', 'tedi', 'capri sun', 'red bull', 'hell', 'monster', 'burn',
  'jacobs', 'lavazza', 'tchibo', 'doncafe', 'nescafe', 'nescafe brasero',
  'nescafe dolce gusto', 'tassimo', 'julius meinl', 'l or', 'lor', 'illy',
  'davidoff', 'segafredo', 'amigo', 'fortuna', 'la festa', 'inka', 'fares',
  'plafar', 'celmar', 'teekanne', 'twinings',
  // Bere, vin & spirtoase clasice de supermarket
  'ursus', 'timisoreana', 'ciuc', 'ciuc radler', 'ciucas', 'bergenbier',
  'silva', 'neumarkt', 'skol', 'tuborg', 'heineken', 'stella artois', 'peroni',
  'birra moretti', 'carlsberg', 'beck s', 'kozel', 'staropramen', 'corona',
  'purcari 1827', 'jidvei', 'cotnari', 'recas', 'castel huniade', 'murfatlar', 'beciul domnesc',
  'budureasca clasic', 'zarea', 'martini',
  'jack daniel s', 'johnnie walker', 'ballantine s', 'jameson', 'absolut', 'finlandia',
  'stalinskaya', 'alexandrion', 'gordon s', 'tanqueray', 'bacardi', 'jagermeister', 'aperol', 'campari',
  // Bebe & dietetic uzual
  'hipp', 'gerber', 'aptamil', 'nan', 'milupa', 'nestum', 'schar', 'gullon',
]);

const CORE_PRODUCE_SLUGS = new Set([
  '301-fructe-proaspete',
  '302-legume-proaspete',
  '303-verdeturi-si-plante-aromatice',
]);

export function normalizeCoreBrand(rawBrand) {
  return normalizeText(rawBrand).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * True dacă produsul este unul uzual, regăsit în majoritatea supermarketurilor
 * (fără baxuri/promo-uri, fără vinuri/bere artizanală sau nișe boutique).
 */
export function isCoreSupermarketItem(item) {
  if (!isFoodFreshfulItem(item)) return false;
  if (CORE_EXCLUDED_FRESHFUL_SLUGS.has(item.category_slug_freshful)) return false;

  const fullText = `${item.canonical_candidate_name || item.source_product_name || ''} ${item.package_size || ''}`;
  // Excludem baxuri și pachete promoționale de volum (ex: 6x1.5L, 24x0.33L, 5+1, 1+1)
  if (/\b(?:[4-9]|[12]\d)\s*[x×]\s*\d|\bbax\b|\bpachet\s+\d+\s*buc|\b\d+\+\d+\b|\bpachet\s+promo/i.test(fullText)) {
    return false;
  }

  const normBrand = normalizeCoreBrand(item.brand || '');
  if (normBrand) {
    return CORE_SUPERMARKET_BRANDS.has(normBrand);
  }

  // Fructe/legume/verdeață/ciuperci fără brand: păstrăm variantele uzuale de supermarket
  if (CORE_PRODUCE_SLUGS.has(item.category_slug_freshful)) {
    const normName = normalizeText(item.canonical_candidate_name || item.source_product_name || '');
    if (
      /(\beco\b|\bbio\b|by air|ataulfo|siracusa|red moon|sweetie|kumquat|pitaya|rambutan|physalis|carambola|tamarind|kiwano|yuzu|microplante|livada boierescu|navel de messina|frumos de voinesti)/.test(
        normName
      )
    ) {
      return false;
    }
    return true;
  }

  return false;
}

const SECONDARY_FRESHFUL_SLUGS = new Set([
  'lapte-si-lactate-eco',
  '1001-produse-ecologice',
  '1002-produse-dietetice-si-naturiste',
  '1003-suplimente-alimentare',
  '1004-bucatarie-internationala',
  '1005-nutritie-sportiva',
]);

export function buildCanonicalSignature(item) {
  const brandKey = normalizeText(item.brand || 'nobrand').replace(/\s+/g, '');
  const nameWithoutUnits = String(item.source_product_name || '')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|ml|cl|buc\.?|bucati|pcs)(?=\b|\s|$)/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*%/g, ' ');
  const tokens = tokenize(nameWithoutUnits)
    .filter((t) => !MARKETING_STOP_WORDS.has(t))
    .filter((t) => !/^\d+([.,]\d+)?%$/.test(t))
    .filter((t) => !/^\d+([.,]\d+)?(kg|g|gr|l|ml|cl|buc)$/.test(t));
  const brandToks = new Set(tokenize(item.brand || ''));
  const coreTokens = Array.from(new Set(tokens.filter((t) => !brandToks.has(t)))).sort();

  const qtyKey = item.quantity_value && item.quantity_unit
    ? `${item.quantity_value}${item.quantity_unit}x${item.pack_count || 1}`
    : `noqty:${item.source_product_id || item.slug || 'unknown'}`;
  const fatKey = item.fat_percentage_min != null
    ? `${item.fat_percentage_min}-${item.fat_percentage_max}`
    : 'nofat';

  return [
    brandKey,
    coreTokens.join('+'),
    qtyKey,
    fatKey,
    item.is_lactose_free ? 'lf1' : 'lf0',
    item.is_bio ? 'bio1' : 'bio0',
    item.is_uht ? 'uht1' : 'uht0',
  ].join('|');
}

/**
 * Deduplicare multi-nivel:
 *   1. Pe SKU / slug (overlap paginare / slot sponsorizat / cross-categorie)
 *   2. Pe semnătură canonică intra-lot (două SKU-uri pentru același produs fizic)
 */
export function deduplicateFreshfulItems(rawItems) {
  const bySku = new Map();
  const tier1Duplicates = [];

  for (const item of rawItems) {
    const skuKey = item.source_product_id || item.slug || item.product_url;
    if (!skuKey) continue;

    if (!bySku.has(skuKey)) {
      bySku.set(skuKey, {
        ...item,
        observed_pages: item.source_page ? [item.source_page] : [],
        observed_categories: item.category_slug_freshful ? [item.category_slug_freshful] : [],
      });
    } else {
      const existing = bySku.get(skuKey);
      if (item.source_page && !existing.observed_pages.includes(item.source_page)) {
        existing.observed_pages.push(item.source_page);
      }
      if (
        item.category_slug_freshful &&
        !existing.observed_categories.includes(item.category_slug_freshful)
      ) {
        existing.observed_categories.push(item.category_slug_freshful);
      }

      // Preferă varianta non-sponsored și categoria primară față de o categorie secundară (ex. eco/dietetic)
      const existingIsSec = SECONDARY_FRESHFUL_SLUGS.has(existing.category_slug_freshful);
      const candidateIsSec = SECONDARY_FRESHFUL_SLUGS.has(item.category_slug_freshful);
      const shouldReplace =
        (existing.sponsored && !item.sponsored) ||
        (Boolean(existing.sponsored) === Boolean(item.sponsored) && existingIsSec && !candidateIsSec);

      if (shouldReplace) {
        bySku.set(skuKey, {
          ...item,
          observed_pages: existing.observed_pages,
          observed_categories: existing.observed_categories,
        });
      }
      tier1Duplicates.push({
        sku: skuKey,
        name: item.canonical_candidate_name,
        reason: 'duplicate_sku_or_sponsored_overlap',
      });
    }
  }

  const skuUniqueItems = Array.from(bySku.values());
  const bySignature = new Map();
  const tier2Merges = [];

  for (const item of skuUniqueItems) {
    const sig = buildCanonicalSignature(item);
    if (!bySignature.has(sig)) {
      bySignature.set(sig, {
        ...item,
        canonical_signature: sig,
        merged_skus: [item.source_product_id],
      });
    } else {
      const primary = bySignature.get(sig);
      primary.merged_skus.push(item.source_product_id);
      // Preferă în stoc sau non-sponsored drept reprezentant principal
      const replacePrimary =
        (!primary.is_available && item.is_available) ||
        (primary.sponsored && !item.sponsored && item.is_available);
      if (replacePrimary) {
        const allSkus = primary.merged_skus;
        bySignature.set(sig, {
          ...item,
          canonical_signature: sig,
          merged_skus: allSkus,
        });
      }
      tier2Merges.push({
        canonical_signature: sig,
        primary_sku: bySignature.get(sig).source_product_id,
        merged_sku: item.source_product_id,
        merged_name: item.canonical_candidate_name,
      });
    }
  }

  return {
    items: Array.from(bySignature.values()),
    stats: {
      rawInputCount: rawItems.length,
      afterSkuDedupeCount: skuUniqueItems.length,
      tier1DuplicatesRemoved: tier1Duplicates.length,
      afterCanonicalDedupeCount: bySignature.size,
      tier2CanonicalMerges: tier2Merges.length,
    },
    tier1Duplicates,
    tier2Merges,
  };
}

const FRESHFUL_D2_DIRECT_MAP = {
  // 2. Carne & pește (non-mixed)
  '201-carne-de-vita-si-oaie': { categorySlug: 'carne-vita', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Carne de vită și oaie', familyKey: 'carne-vita', familyName: 'Carne de vită și oaie' },
  '202-carne-de-porc': { categorySlug: 'carne-porc', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Carne de porc', familyKey: 'carne-porc', familyName: 'Carne de porc' },
  '203-carne-de-pasare': { categorySlug: 'pasare', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Pui și curcan', familyKey: 'carne-pasare', familyName: 'Carne de pasăre' },
  '204-alte-carnuri': { categorySlug: 'alte-tipuri-carne', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Alte cărnuri', familyKey: 'alte-tipuri-carne', familyName: 'Alte tipuri de carne' },
  '205-mici-si-specialitati': { categorySlug: 'marinate-bbq', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Mici și specialități', familyKey: 'mici-specialitati-carne', familyName: 'Mici și specialități din carne' },
  '207-peste-afumat': { categorySlug: 'peste', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Pește afumat', familyKey: 'peste-afumat', familyName: 'Pește afumat' },
  '208-peste-marinat': { categorySlug: 'peste', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Pește marinat', familyKey: 'peste-marinat', familyName: 'Pește marinat' },
  '209-icre-si-salata-de-icre': { categorySlug: 'peste', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Icre și salată de icre', familyKey: 'peste-icre', familyName: 'Icre și salată de icre' },
  '210-specialitati-de-peste': { categorySlug: 'peste', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Specialități de pește', familyKey: 'peste-specialitati', familyName: 'Specialități de pește' },
  // 3. Fructe & legume
  '301-fructe-proaspete': { categorySlug: 'fructe-proaspete', categoryName: 'Fructe și legume', subcategory: 'Fructe proaspete', familyKey: 'fructe-proaspete', familyName: 'Fructe proaspete' },
  '303-verdeturi-si-plante-aromatice': { categorySlug: 'verdeata-ierburi', categoryName: 'Fructe și legume', subcategory: 'Verdețuri și ierburi aromatice', familyKey: 'verdeata-ierburi', familyName: 'Verdețuri și ierburi aromatice' },
  '304-fructe-uscate-crude': { categorySlug: 'nuci-fructe-uscate', categoryName: 'Dulciuri și gustări', subcategory: 'Nuci și fructe uscate', familyKey: 'nuci-fructe-uscate', familyName: 'Nuci și fructe uscate' },
  '305-sucuri-naturale': { categorySlug: 'sucuri-nectaruri', categoryName: 'Băuturi', subcategory: 'Sucuri naturale', familyKey: 'bauturi-sucuri-naturale', familyName: 'Sucuri naturale' },
  // 4. Lactate (dedicate)
  '402-unt-si-margarina': { categorySlug: 'unt-smantana', categoryName: 'Lactate și ouă', subcategory: 'Unt și margarină', familyKey: 'unt-smantana-unt', familyName: 'Unt și margarină' },
  '405-oua': { categorySlug: 'oua', categoryName: 'Lactate și ouă', subcategory: 'Ouă', familyKey: 'lactate-oua', familyName: 'Ouă' },
  '406-branzeturi': { categorySlug: 'branzeturi', categoryName: 'Lactate și ouă', subcategory: 'Brânzeturi', familyKey: 'branzeturi-generale', familyName: 'Brânzeturi' },
  // 5. Ready & paste proaspete
  '503-pizza-si-aluat': { categorySlug: 'ready-to-cook', categoryName: 'Mâncare gata preparată', subcategory: 'Pizza și aluat', familyKey: 'pizza-aluat-proaspat', familyName: 'Pizza și aluat proaspăt' },
  '504-paste-proaspete': { categorySlug: 'paste-orez', categoryName: 'Băcănie', subcategory: 'Paste proaspete', familyKey: 'paste-proaspete', familyName: 'Paste proaspete' },
  // 6. Congelate
  '601-carne-si-peste-congelate': { categorySlug: 'congelate-carne-peste', categoryName: 'Produse congelate', subcategory: 'Carne și pește congelate', familyKey: 'congelate-carne-peste', familyName: 'Carne și pește congelate' },
  '602-legume-si-fructe-congelate': { categorySlug: 'congelate-fructe-legume', categoryName: 'Produse congelate', subcategory: 'Fructe și legume congelate', familyKey: 'congelate-fructe-legume', familyName: 'Fructe și legume congelate' },
  '604-inghetata-si-deserturi-congelate': { categorySlug: 'inghetata', categoryName: 'Produse congelate', subcategory: 'Înghețată și deserturi congelate', familyKey: 'congelate-inghetata', familyName: 'Înghețată și deserturi congelate' },
  // 7. Băuturi și tutun (dedicate)
  '702-apa': { categorySlug: 'apa', categoryName: 'Băuturi', subcategory: 'Apă', familyKey: 'bauturi-apa', familyName: 'Apă' },
  '704-bere': { categorySlug: 'bere', categoryName: 'Băuturi', subcategory: 'Bere și cidru', familyKey: 'bauturi-bere', familyName: 'Bere și cidru' },
  '705-vinuri': { categorySlug: 'vinuri', categoryName: 'Băuturi', subcategory: 'Vinuri', familyKey: 'bauturi-vinuri', familyName: 'Vinuri' },
  '706-bauturi-spirtoase': { categorySlug: 'bauturi-spirtoase', categoryName: 'Băuturi', subcategory: 'Băuturi spirtoase', familyKey: 'bauturi-spirtoase', familyName: 'Băuturi spirtoase' },
  '707-tutun': { categorySlug: 'tutun', categoryName: 'Băuturi', subcategory: 'Tutun și accesorii', familyKey: 'bauturi-tutun', familyName: 'Tutun și accesorii' },
  // 8. Băcănie (dedicate)
  '802-conserve': { categorySlug: 'conserve', categoryName: 'Băcănie', subcategory: 'Conserve', familyKey: 'bacanie-conserve', familyName: 'Conserve' },
  '803-condimente-si-sosuri': { categorySlug: 'sosuri-condimente', categoryName: 'Băcănie', subcategory: 'Condimente și sosuri', familyKey: 'bacanie-sosuri-condimente', familyName: 'Condimente și sosuri' },
  '804-ulei-si-otet': { categorySlug: 'ulei-otet', categoryName: 'Băcănie', subcategory: 'Ulei și oțet', familyKey: 'bacanie-ulei-otet', familyName: 'Ulei și oțet' },
  // 9. Mic dejun
  '903-cereale-si-mic-dejun': { categorySlug: 'mic-dejun', categoryName: 'Băcănie', subcategory: 'Cereale și mic dejun', familyKey: 'bacanie-mic-dejun', familyName: 'Cereale și mic dejun' },
  // 10. Dietetic, bio & internațional (dedicate)
  '1001-produse-ecologice': { categorySlug: 'produse-dietetice', categoryName: 'Dietetic, bio și internațional', subcategory: 'Produse ecologice', familyKey: 'dietetic-eco', familyName: 'Produse ecologice și bio' },
  '1003-suplimente-alimentare': { categorySlug: 'suplimente-alimentare', categoryName: 'Dietetic, bio și internațional', subcategory: 'Suplimente alimentare', familyKey: 'dietetic-suplimente', familyName: 'Suplimente alimentare' },
  '1004-bucatarie-internationala': { categorySlug: 'bucatarie-internationala', categoryName: 'Dietetic, bio și internațional', subcategory: 'Bucătărie internațională', familyKey: 'dietetic-international', familyName: 'Bucătărie internațională' },
  '1005-nutritie-sportiva': { categorySlug: 'nutritie-sportiva', categoryName: 'Dietetic, bio și internațional', subcategory: 'Nutriție sportivă', familyKey: 'dietetic-nutritie-sportiva', familyName: 'Nutriție sportivă' },
  // 11. Cosmetice & îngrijire personală
  '1101-deodorante-si-parfumuri': { categorySlug: 'deodorante-parfumuri', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Deodorante și parfumuri', familyKey: 'cosmetice-deodorante-parfumuri', familyName: 'Deodorante și parfumuri' },
  '1102-produse-pentru-barbierit-si-ingrijit-ten': { categorySlug: 'ingrijire-ten-corp', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Bărbierit și îngrijire ten', familyKey: 'cosmetice-barbierit-ten', familyName: 'Bărbierit și îngrijire ten' },
  '1103-creme-intretinere-si-demachiante': { categorySlug: 'ingrijire-ten-corp', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Demachiante și creme', familyKey: 'cosmetice-creme-ten', familyName: 'Demachiante și creme' },
  '1104-produse-cu-protectie-solara': { categorySlug: 'ingrijire-ten-corp', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Protecție solară', familyKey: 'cosmetice-protectie-solara', familyName: 'Protecție solară' },
  '1105-ceara-benzi-si-creme-depliatoare': { categorySlug: 'ingrijire-ten-corp', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Epilare', familyKey: 'cosmetice-epilare', familyName: 'Produse epilare' },
  '1106-seturi-cadou': { categorySlug: 'deodorante-parfumuri', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Seturi cadou', familyKey: 'cosmetice-seturi-cadou', familyName: 'Seturi cadou cosmetice' },
  '1107-ingrijirea-parului': { categorySlug: 'ingrijire-par', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Îngrijirea părului', familyKey: 'cosmetice-par', familyName: 'Îngrijirea părului' },
  '1108-igienta-inima': { categorySlug: 'igiena-personala', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Igienă intimă', familyKey: 'cosmetice-igiena-intima', familyName: 'Igienă intimă' },
  '1109-igiena-dentara': { categorySlug: 'igiena-dentara', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Igienă dentară', familyKey: 'cosmetice-igiena-dentara', familyName: 'Igienă dentară' },
  '1110-sapunuri-si-geluri-de-dus': { categorySlug: 'igiena-personala', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Săpunuri și geluri de duș', familyKey: 'cosmetice-sapunuri-geluri', familyName: 'Săpunuri și geluri de duș' },
  '1111-dermatocosmetice-si-parafarmacie': { categorySlug: 'ingrijire-ten-corp', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Dermatocosmetice și parafarmacie', familyKey: 'cosmetice-parafarmacie', familyName: 'Dermatocosmetice și parafarmacie' },
  repelent: { categorySlug: 'ingrijire-ten-corp', categoryName: 'Cosmetice și îngrijire personală', subcategory: 'Repelent', familyKey: 'cosmetice-repelent', familyName: 'Protecție insecte' },
  // 12. Mama și copilul
  '1201-alimente-bebelusi': { categorySlug: 'alimente-bebelusi', categoryName: 'Mama și copilul', subcategory: 'Alimente bebe', familyKey: 'bebe-alimente', familyName: 'Alimente bebeluși' },
  '1202-igiena-bebe': { categorySlug: 'igiena-bebe', categoryName: 'Mama și copilul', subcategory: 'Igienă bebe', familyKey: 'bebe-igiena', familyName: 'Igienă bebe și scutece' },
  '1203-puericultura': { categorySlug: 'puericultura', categoryName: 'Mama și copilul', subcategory: 'Puericultură', familyKey: 'bebe-puericultura', familyName: 'Puericultură' },
  // 13. Detergenți și igienizare
  '1301-spalare-si-intretinere-rufe': { categorySlug: 'detergenti-rufe', categoryName: 'Detergenți și igienizare', subcategory: 'Spălare și întreținere rufe', familyKey: 'detergenti-rufe', familyName: 'Detergenți și îngrijire rufe' },
  '1302-igienizarea-casei': { categorySlug: 'curatenie-casa', categoryName: 'Detergenți și igienizare', subcategory: 'Curățenie și întreținerea casei', familyKey: 'detergenti-curatenie-casa', familyName: 'Curățenie și igienizare casă' },
  '1303-hartie-igienica-si-servetele': { categorySlug: 'hartie-servetele', categoryName: 'Detergenți și igienizare', subcategory: 'Hârtie igienică și șervețele', familyKey: 'hartie-igienica-servetele', familyName: 'Hârtie igienică și șervețele' },
  // 14. Casă și agrement
  '1401-bricolaj-si-auto': { categorySlug: 'bricolaj-gradina-auto', categoryName: 'Casă și agrement', subcategory: 'Bricolaj și auto', familyKey: 'casa-bricolaj-auto', familyName: 'Bricolaj și auto' },
  '1402-gradina': { categorySlug: 'bricolaj-gradina-auto', categoryName: 'Casă și agrement', subcategory: 'Grădină', familyKey: 'casa-gradina', familyName: 'Grădină' },
  '1403-articole-de-menaj': { categorySlug: 'articole-menaj', categoryName: 'Casă și agrement', subcategory: 'Articole de menaj', familyKey: 'casa-menaj', familyName: 'Articole de menaj' },
  '1405-birotica-si-papetarie': { categorySlug: 'birotica-papetarie', categoryName: 'Casă și agrement', subcategory: 'Birotică și papetărie', familyKey: 'casa-birotica', familyName: 'Birotică și papetărie' },
  '1408-hitech-audio-video': { categorySlug: 'casa-textile-it-sezon', categoryName: 'Casă și agrement', subcategory: 'Accesorii IT&C', familyKey: 'casa-it', familyName: 'Accesorii IT și electronice' },
  '1410-textile-basic': { categorySlug: 'casa-textile-it-sezon', categoryName: 'Casă și agrement', subcategory: 'Textile și accesorii', familyKey: 'casa-textile', familyName: 'Textile și accesorii' },
  'articole-de-sezon': { categorySlug: 'casa-textile-it-sezon', categoryName: 'Casă și agrement', subcategory: 'Articole de sezon', familyKey: 'casa-sezon', familyName: 'Articole de sezon' },
  'electrocasnice-mici': { categorySlug: 'casa-textile-it-sezon', categoryName: 'Casă și agrement', subcategory: 'Electrocasnice mici', familyKey: 'casa-electrocasnice', familyName: 'Electrocasnice mici' },
  // 15. Pet shop
  '1501-pisici': { categorySlug: 'hrana-pisici', categoryName: 'Pet Shop', subcategory: 'Pisici', familyKey: 'pet-pisici', familyName: 'Hrană și accesorii pisici' },
  '1502-caini': { categorySlug: 'hrana-caini', categoryName: 'Pet Shop', subcategory: 'Câini', familyKey: 'pet-caini', familyName: 'Hrană și accesorii câini' },
  '1503-pasari-si-rozatoare': { categorySlug: 'pasari-rozatoare', categoryName: 'Pet Shop', subcategory: 'Păsări și rozătoare', familyKey: 'pet-pasari-rozatoare', familyName: 'Păsări și rozătoare' },
  // 18. Jucării
  '1801-lego-r': { categorySlug: 'lego', categoryName: 'Jucării', subcategory: 'LEGO®', familyKey: 'jucarii-lego', familyName: 'Seturi LEGO®' },
  '1802-educative-creative-si-jocuri': { categorySlug: 'jucarii-jocuri', categoryName: 'Jucării', subcategory: 'Educative, creative și jocuri', familyKey: 'jucarii-educative', familyName: 'Jocuri educative și creative' },
  '1803-constructie-vehicule-si-exterior': { categorySlug: 'jucarii-jocuri', categoryName: 'Jucării', subcategory: 'Construcție și vehicule', familyKey: 'jucarii-vehicule', familyName: 'Jucării construcție și vehicule' },
  '1804-papusi-personaje-si-colectionabile': { categorySlug: 'jucarii-jocuri', categoryName: 'Jucării', subcategory: 'Păpuși și colecționabile', familyKey: 'jucarii-papusi', familyName: 'Păpuși și personaje' },
  '1805-jucarii-bebe': { categorySlug: 'jucarii-jocuri', categoryName: 'Jucării', subcategory: 'Jucării bebe', familyKey: 'jucarii-bebe', familyName: 'Jucării bebe' },
};

function inferDairySubcategory(item, titleNorm) {
  // 1. Cafea gata preparată (ex: Starbucks Caffe Latte)
  if (/\b(caffe latte|cafea latte|macchiato|cappuccino|espresso)\b/.test(titleNorm)) {
    return {
      categorySlug: 'cafea',
      categoryName: 'Băuturi',
      subcategory: 'Cafea rece',
      familyKey: 'cafea-cafea-rece',
      familyName: 'Cafea rece',
    };
  }

  // 2. Brânzeturi proaspete, cottage, fagaras, mascarpone, ricotta, creme de brânză
  if (
    /\b(margele de branza|margelute de branza|bulgarasi de branza|cottage|fagaras|branza cu smantana|branza proaspata|branza de vaci|branza grasa|branza slaba|branza degresata|branza dulce|branza de capra|ricotta|mascarpone|crema de branza|urda|telemea|cascaval|mozzarella|halloumi|feta|branza perlata|perle de branza)\b/.test(
      titleNorm
    )
  ) {
    let familyKey = 'branzeturi-branza de vaci proaspata';
    let familyName = 'Brânză de vaci proaspătă';
    let subcategory = 'Brânză proaspătă de vaci';

    if (/\b(cottage|margele de branza|margelute de branza|bulgarasi de branza|perlata|perle de branza)\b/.test(titleNorm)) {
      familyKey = 'branzeturi-branza cottage';
      familyName = 'Brânză cottage';
      subcategory = 'Brânză cottage';
    } else if (/\bfagaras\b/.test(titleNorm)) {
      familyKey = 'branzeturi-branza fagaras';
      familyName = 'Brânză Făgăraș';
      subcategory = 'Brânză Făgăraș';
    } else if (/\bcrema de branza\b/.test(titleNorm)) {
      familyKey = 'branzeturi-crema-de-branza';
      familyName = 'Cremă de brânză';
      subcategory = 'Cremă de brânză';
    } else if (/\b(mascarpone|ricotta)\b/.test(titleNorm)) {
      familyKey = 'branzeturi-mascarpone-ricotta';
      familyName = 'Mascarpone și ricotta';
      subcategory = 'Mascarpone și ricotta';
    } else if (/\burda\b/.test(titleNorm)) {
      familyKey = 'branzeturi-urda';
      familyName = 'Urdă';
      subcategory = 'Urdă';
    } else if (/\btelemea\b/.test(titleNorm)) {
      familyKey = /\boaie\b/.test(titleNorm) ? 'branzeturi-telemea de oaie' : 'branzeturi-telemea-de-vaca';
      familyName = /\boaie\b/.test(titleNorm) ? 'Telemea de oaie' : 'Telemea de vacă';
      subcategory = familyName;
    } else if (/\bcascaval\b/.test(titleNorm)) {
      familyKey = 'branzeturi-cascaval';
      familyName = 'Cașcaval';
      subcategory = 'Cașcaval';
    }

    return {
      categorySlug: 'branzeturi',
      categoryName: 'Lactate și ouă',
      subcategory,
      familyKey,
      familyName,
    };
  }

  // 3. Smântână / Unt
  if (/\bsmantana\b/.test(titleNorm) || /\b(frisca|unt )\b/.test(titleNorm)) {
    const isCookingOrWhip = /\b(gatit|frisca|lichida|dulce pentru)\b/.test(titleNorm);
    return {
      categorySlug: 'unt-smantana',
      categoryName: 'Lactate și ouă',
      subcategory: isCookingOrWhip ? 'Smântână pentru gătit' : 'Smântână',
      familyKey: 'unt-smantana-smantana',
      familyName: 'Smântână',
    };
  }

  // 4. Produse lactate fermentate
  if (/\b(chefir|kefir|sana|lapte batut|ayran|iaurt)\b/.test(titleNorm)) {
    if (/\b(chefir|kefir)\b/.test(titleNorm)) {
      return {
        categorySlug: 'iaurt-kefir',
        categoryName: 'Lactate și ouă',
        subcategory: 'Chefir',
        familyKey: 'iaurt-kefir-chefir',
        familyName: 'Chefir',
      };
    }
    if (/\bsana\b/.test(titleNorm)) {
      return {
        categorySlug: 'iaurt-kefir',
        categoryName: 'Lactate și ouă',
        subcategory: 'Sana',
        familyKey: 'iaurt-kefir-sana',
        familyName: 'Sana',
      };
    }
    if (/\blapte batut\b/.test(titleNorm)) {
      return {
        categorySlug: 'iaurt-kefir',
        categoryName: 'Lactate și ouă',
        subcategory: 'Lapte bătut',
        familyKey: 'iaurt-kefir-lapte batut',
        familyName: 'Lapte bătut',
      };
    }
    return {
      categorySlug: 'iaurt-kefir',
      categoryName: 'Lactate și ouă',
      subcategory: 'Iaurt natural',
      familyKey: 'iaurt-kefir-iaurt-natural',
      familyName: 'Iaurt natural',
    };
  }

  // 5. Lapte & băuturi lactate
  if (/\b(lapte|bautura proteica|bautura pe baza de lapte)\b/.test(titleNorm)) {
    if (
      /\b(ciocolata|cacao|vanilie|capsuni|banane|fistic|fursecuri|zmeura|bautura proteica|bautura pe baza de lapte|high protein)\b/.test(
        titleNorm
      )
    ) {
      return {
        categorySlug: 'lapte',
        categoryName: 'Lactate și ouă',
        subcategory: /\b(proteica|protein)\b/.test(titleNorm) ? 'Lapte proteic' : 'Lapte aromatizat',
        familyKey: 'lapte-bauturi-lactate',
        familyName: 'Băuturi lactate și proteice',
      };
    }
    if (/\bcapra\b/.test(titleNorm)) {
      return {
        categorySlug: 'lapte',
        categoryName: 'Lactate și ouă',
        subcategory: 'Lapte de capră',
        familyKey: 'lapte-de-capra',
        familyName: 'Lapte de capră',
      };
    }
    if (/\bbarista\b/.test(titleNorm)) {
      return {
        categorySlug: 'lapte',
        categoryName: 'Lactate și ouă',
        subcategory: 'Lapte Barista',
        familyKey: 'lapte-barista',
        familyName: 'Lapte Barista',
      };
    }
    return {
      categorySlug: 'lapte',
      categoryName: 'Lactate și ouă',
      subcategory: item.is_uht
        ? 'Lapte UHT'
        : item.is_lactose_free
        ? 'Lapte fără lactoză'
        : 'Lapte pasteurizat',
      familyKey: 'lapte-lapte',
      familyName: 'Lapte',
    };
  }

  return null;
}

/**
 * Mapează un produs Freshful într-un slug de categorie frunză + familie din catalogul Beavy.
 * Prioritizează categoriile dedicate non-food/specializate înaintea regulilor de titlu,
 * și aplică dezambiguizare precisă pe titlu în categoriile alimentare mixte.
 */
export function inferBeavyCategoryAndFamily(item) {
  const titleNorm = normalizeText(item.canonical_candidate_name || item.source_product_name);
  const pathNorm = normalizeText(`${item.external_category_path || ''} ${item.category_slug_freshful || ''}`);
  const d2Slug = item.category_slug_freshful || null;

  // Stage 1: Categorii dedicate neambiguu (protejează non-food/pet/cosmetice/băuturi alcoolice de coliziuni lexicale)
  if (d2Slug && FRESHFUL_D2_DIRECT_MAP[d2Slug]) {
    return FRESHFUL_D2_DIRECT_MAP[d2Slug];
  }

  // Stage 2: Categorii mixte Freshful cu sub-clasificare fină pe titlu
  if (d2Slug === '101-paine') {
    if (/\b(toast|chifle|chifla|burger|hot dog|lipie|lipii|tortilla|bagheta|baghete|crispbread)\b/.test(titleNorm)) {
      return { categorySlug: 'toast-chifle', categoryName: 'Brutărie și patiserie', subcategory: 'Toast și chifle', familyKey: 'brutarie-toast-chifle', familyName: 'Toast și chifle' };
    }
    return { categorySlug: 'paine', categoryName: 'Brutărie și patiserie', subcategory: 'Pâine', familyKey: 'brutarie-paine', familyName: 'Pâine' };
  }

  if (d2Slug === '102-patiserie') {
    if (/\b(cozonac|chec|panettone|tort|prajitura|briosa|briose|ecler|eclere|gogoasa|gogosi|tarta|tiramisu|savarina|amandina)\b/.test(titleNorm)) {
      return { categorySlug: 'cozonac-prajituri', categoryName: 'Brutărie și patiserie', subcategory: 'Cozonac și prăjituri', familyKey: 'brutarie-cozonac-prajituri', familyName: 'Cozonac și prăjituri' };
    }
    return { categorySlug: 'patiserie-foietaje', categoryName: 'Brutărie și patiserie', subcategory: 'Patiserie și foietaje', familyKey: 'brutarie-patiserie-foietaje', familyName: 'Patiserie și foietaje' };
  }

  if (d2Slug === '206-peste-si-sushi') {
    if (/\b(creveti|midii|caracatita|calamar|calamari|scoici|surimi|homar|fructe de mare)\b/.test(titleNorm)) {
      return { categorySlug: 'fructe-de-mare', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Fructe de mare', familyKey: 'fructe-de-mare', familyName: 'Fructe de mare' };
    }
    if (/\bsushi\b/.test(titleNorm)) {
      return { categorySlug: 'ready-to-eat', categoryName: 'Mâncare gata preparată', subcategory: 'Sushi', familyKey: 'ready-sushi', familyName: 'Sushi și platouri' };
    }
    return { categorySlug: 'peste', categoryName: 'Carne, pește și fructe de mare', subcategory: 'Pește proaspăt', familyKey: 'peste-proaspat', familyName: 'Pește proaspăt' };
  }

  if (d2Slug === '302-legume-proaspete') {
    if (/\b(cartofi|cartof|morcov|morcovi|sfecla|telina|pastarnac|patrunjel radacina|ridichi|ghimbir|ceapa|usturoi)\b/.test(titleNorm)) {
      return { categorySlug: 'cartofi-radacinoase', categoryName: 'Fructe și legume', subcategory: 'Cartofi și rădăcinoase', familyKey: 'legume-cartofi-radacinoase', familyName: 'Cartofi și rădăcinoase' };
    }
    if (/\b(ciuperci|champignon|pleurotus|hribi|galbiori)\b/.test(titleNorm)) {
      return { categorySlug: 'ciuperci', categoryName: 'Fructe și legume', subcategory: 'Ciuperci', familyKey: 'legume-ciuperci', familyName: 'Ciuperci' };
    }
    return { categorySlug: 'legume-proaspete', categoryName: 'Fructe și legume', subcategory: 'Legume proaspete', familyKey: 'legume-proaspete', familyName: 'Legume proaspete' };
  }

  if (
    d2Slug === '401-lapte-smantana-si-branza-proaspata' ||
    d2Slug === '403-lactate-uht' ||
    d2Slug === '404-iaurt-desert-si-sana' ||
    d2Slug === 'lapte-si-lactate-eco' ||
    d2Slug === 'amestecuri-lactate-si-grasimi-vegetale'
  ) {
    const dairyHit = inferDairySubcategory(item, titleNorm);
    if (dairyHit) return dairyHit;
    if (d2Slug === '403-lactate-uht') {
      return { categorySlug: 'lapte', categoryName: 'Lactate și ouă', subcategory: 'Lapte UHT', familyKey: 'lapte-lapte', familyName: 'Lapte' };
    }
    if (d2Slug === '404-iaurt-desert-si-sana') {
      return { categorySlug: 'iaurt-kefir', categoryName: 'Lactate și ouă', subcategory: 'Iaurt și desert lactat', familyKey: 'iaurt-kefir-iaurt-natural', familyName: 'Iaurt și deserturi lactate' };
    }
    if (d2Slug === 'amestecuri-lactate-si-grasimi-vegetale') {
      return { categorySlug: 'unt-smantana', categoryName: 'Lactate și ouă', subcategory: 'Amestecuri și creme de gătit', familyKey: 'unt-smantana-smantana', familyName: 'Smântână și creme de gătit' };
    }
    return { categorySlug: 'branzeturi', categoryName: 'Lactate și ouă', subcategory: 'Brânzeturi proaspete', familyKey: 'branzeturi-branza de vaci proaspata', familyName: 'Brânză de vaci proaspătă' };
  }

  if (d2Slug === '501-mezeluri' || d2Slug === '502-mezeluri-feliate') {
    if (/\bpate\b/.test(titleNorm)) {
      return { categorySlug: 'pate-tartinabile', categoryName: 'Mezeluri și specialități', subcategory: 'Pate', familyKey: 'mezeluri-pate', familyName: 'Pate și tartinabile' };
    }
    if (/\b(salam|carnat|carnaciori|crenvursti|parizer|cabanos)\b/.test(titleNorm)) {
      return { categorySlug: 'salam-carnati', categoryName: 'Mezeluri și specialități', subcategory: 'Salam și cârnați', familyKey: 'mezeluri-salam-carnati', familyName: 'Salam și cârnați' };
    }
    return { categorySlug: 'sunca-specialitati', categoryName: 'Mezeluri și specialități', subcategory: 'Șuncă și specialități', familyKey: 'mezeluri-sunca-specialitati', familyName: 'Șuncă și specialități' };
  }

  if (d2Slug === '505-ready-meal') {
    if (/\b(salata|supa|ciorba|bors)\b/.test(titleNorm)) {
      return { categorySlug: 'salate-supe', categoryName: 'Mâncare gata preparată', subcategory: 'Salate și supe', familyKey: 'ready-salate-supe', familyName: 'Salate și supe' };
    }
    if (/\b(sandvis|sandwich|wrap|panini|bagheta umpluta|hummus|salata boeuf|icre)\b/.test(titleNorm)) {
      return { categorySlug: 'ready-to-eat', categoryName: 'Mâncare gata preparată', subcategory: 'Gata de consum', familyKey: 'ready-to-eat', familyName: 'Gata de consum' };
    }
    return { categorySlug: 'mancare-gatita', categoryName: 'Mâncare gata preparată', subcategory: 'Mâncare gătită', familyKey: 'ready-mancare-gatita', familyName: 'Mâncare gătită' };
  }

  if (d2Slug === 'carne-si-specialitati-vegetale') {
    if (/\b(tofu|tempeh|seitan)\b/.test(titleNorm)) {
      return { categorySlug: 'tofu-tempeh', categoryName: 'Băcănie', subcategory: 'Tofu și tempeh', familyKey: 'vegetal-tofu-tempeh', familyName: 'Tofu și tempeh' };
    }
    if (/\b(hummus|pate|tartinabil|zacusca|icre vegetale)\b/.test(titleNorm)) {
      return { categorySlug: 'tartinabile-vegetale', categoryName: 'Băcănie', subcategory: 'Tartinabile vegetale', familyKey: 'vegetal-tartinabile', familyName: 'Tartinabile vegetale' };
    }
    return { categorySlug: 'alternative-vegetale-carne', categoryName: 'Băcănie', subcategory: 'Alternative vegetale la carne', familyKey: 'vegetal-carne', familyName: 'Alternative vegetale la carne' };
  }

  if (d2Slug === 'bauturi-creme-si-grasimi-vegetale') {
    if (/\b(tofu|tempeh)\b/.test(titleNorm)) {
      return { categorySlug: 'tofu-tempeh', categoryName: 'Băcănie', subcategory: 'Tofu și tempeh', familyKey: 'vegetal-tofu-tempeh', familyName: 'Tofu și tempeh' };
    }
    if (/\b(iaurt|desert|budinca|alternative iaurt)\b/.test(titleNorm)) {
      return { categorySlug: 'alternative-iaurturi-vegetale', categoryName: 'Lactate și ouă', subcategory: 'Iaurturi vegetale', familyKey: 'vegetal-iaurt', familyName: 'Iaurturi și deserturi vegetale' };
    }
    if (/\b(branza|cascaval|mozzarella|crema tartinabila|margarina|unt vegetal)\b/.test(titleNorm)) {
      return { categorySlug: 'tartinabile-vegetale', categoryName: 'Băcănie', subcategory: 'Brânzeturi și tartinabile vegetale', familyKey: 'vegetal-tartinabile', familyName: 'Tartinabile vegetale' };
    }
    return { categorySlug: 'alternative-bauturi-vegetale', categoryName: 'Băuturi', subcategory: 'Băuturi vegetale', familyKey: 'vegetal-bauturi', familyName: 'Băuturi vegetale' };
  }

  if (d2Slug === '603-semipreparate-congelate') {
    if (/\b(pizza|aluat|foietaj|foi de placinta|strudel|croissant|pain|bagheta|chifle)\b/.test(titleNorm)) {
      return { categorySlug: 'pizza-panificatie-congelata', categoryName: 'Produse congelate', subcategory: 'Pizza și panificație congelată', familyKey: 'congelate-pizza-panificatie', familyName: 'Pizza și panificație congelată' };
    }
    return { categorySlug: 'preparate-congelate', categoryName: 'Produse congelate', subcategory: 'Semipreparate congelate', familyKey: 'congelate-preparate', familyName: 'Semipreparate congelate' };
  }

  if (d2Slug === '701-bauturi-necarbogazoase-si-siropuri' || d2Slug === '703-bauturi-carbogazoase') {
    if (/\b(energizant|energy|izotonic|isotonic|red bull|monster|hell|burn)\b/.test(titleNorm)) {
      return { categorySlug: 'energizante-sport', categoryName: 'Băuturi', subcategory: 'Băuturi energizante și sport', familyKey: 'bauturi-energizante', familyName: 'Băuturi energizante și sport' };
    }
    if (d2Slug === '703-bauturi-carbogazoase') {
      return { categorySlug: 'racoritoare', categoryName: 'Băuturi', subcategory: 'Băuturi carbogazoase', familyKey: 'bauturi-racoritoare', familyName: 'Băuturi răcoritoare' };
    }
    if (/\b(ice tea|ceai rece)\b/.test(titleNorm)) {
      return { categorySlug: 'racoritoare', categoryName: 'Băuturi', subcategory: 'Ice tea și răcoritoare', familyKey: 'bauturi-racoritoare', familyName: 'Băuturi răcoritoare' };
    }
    return { categorySlug: 'sucuri-nectaruri', categoryName: 'Băuturi', subcategory: 'Sucuri și siropuri', familyKey: 'bauturi-sucuri-siropuri', familyName: 'Sucuri și nectaruri' };
  }

  if (d2Slug === '801-paste-orez-si-legume-uscate') {
    if (/\b(linte|naut|fasole|mazare|seminte|chia|quinoa|hrisca|mei|susan|dovleac)\b/.test(titleNorm)) {
      return { categorySlug: 'leguminoase', categoryName: 'Băcănie', subcategory: 'Leguminoase și semințe', familyKey: 'bacanie-leguminoase', familyName: 'Leguminoase și semințe' };
    }
    return { categorySlug: 'paste-orez', categoryName: 'Băcănie', subcategory: 'Paste și orez', familyKey: 'bacanie-paste-orez', familyName: 'Paste și orez' };
  }

  if (d2Slug === '805-aperitive-sarate') {
    if (/\b(nuci|fistic|caju|migdale|alune|arahide|nuci pecan|seminte|copt)\b/.test(titleNorm)) {
      return { categorySlug: 'nuci-fructe-uscate', categoryName: 'Dulciuri și gustări', subcategory: 'Nuci și semințe aperitiv', familyKey: 'nuci-fructe-uscate', familyName: 'Nuci și fructe uscate' };
    }
    return { categorySlug: 'chips-snacks', categoryName: 'Dulciuri și gustări', subcategory: 'Chipsuri și snacks', familyKey: 'gustari-chips-snacks', familyName: 'Chipsuri și snacks' };
  }

  if (d2Slug === 'faina-zahar-si-produse-gourmet') {
    if (/\b(zahar|indulcitor|stevia|eritritol|sirop de agave|sirop de artar)\b/.test(titleNorm)) {
      return { categorySlug: 'zahar-indulcitori', categoryName: 'Băcănie', subcategory: 'Zahăr și îndulcitori', familyKey: 'bacanie-zahar-indulcitori', familyName: 'Zahăr și îndulcitori' };
    }
    if (/\b(drojdie|praf de copt|esenta|aroma|glazura|cacao|frisca praf|gelatina|amidon|bicarbonat|ciocolata menaj)\b/.test(titleNorm)) {
      return { categorySlug: 'ingrediente-patiserie', categoryName: 'Băcănie', subcategory: 'Ingrediente pentru gătit și patiserie', familyKey: 'bacanie-ingrediente-patiserie', familyName: 'Ingrediente pentru gătit și patiserie' };
    }
    return { categorySlug: 'faina-malai-cereale', categoryName: 'Băcănie', subcategory: 'Făină, mălai și griș', familyKey: 'bacanie-faina-malai', familyName: 'Făină, mălai și cereale' };
  }

  if (d2Slug === '902-biscuiti-napolitane-si-prajituri') {
    if (/\b(baton|batoane)\b/.test(titleNorm)) {
      return { categorySlug: 'batoane', categoryName: 'Dulciuri și gustări', subcategory: 'Batoane', familyKey: 'dulciuri-batoane', familyName: 'Batoane și gustări rapide' };
    }
    return { categorySlug: 'biscuiti-napolitane', categoryName: 'Dulciuri și gustări', subcategory: 'Biscuiți, napolitane și prăjituri', familyKey: 'dulciuri-biscuiti-napolitane', familyName: 'Biscuiți și napolitane' };
  }

  if (d2Slug === '904-cafea-si-ceai') {
    if (/\b(ceai|infuzie|musetel|menta|tei|ceai verde|ceai negru|hibiscus|matcha)\b/.test(titleNorm) && !/\bcafea\b/.test(titleNorm)) {
      return { categorySlug: 'ceai-infuzii', categoryName: 'Băuturi', subcategory: 'Ceai și infuzii', familyKey: 'bauturi-ceai-infuzii', familyName: 'Ceai și infuzii' };
    }
    return { categorySlug: 'cafea', categoryName: 'Băuturi', subcategory: 'Cafea', familyKey: 'bauturi-cafea', familyName: 'Cafea' };
  }

  if (d2Slug === '905-bomboane-si-ciocolata') {
    if (/\b(baton|batoane)\b/.test(titleNorm)) {
      return { categorySlug: 'batoane', categoryName: 'Dulciuri și gustări', subcategory: 'Batoane de ciocolată', familyKey: 'dulciuri-batoane', familyName: 'Batoane și gustări rapide' };
    }
    if (/\b(bomboane|jeleu|jeleuri|guma|acadea|acadele|drops|dropsuri|caramele|drajeuri)\b/.test(titleNorm)) {
      return { categorySlug: 'bomboane-guma', categoryName: 'Dulciuri și gustări', subcategory: 'Bomboane și gumă', familyKey: 'dulciuri-bomboane-guma', familyName: 'Bomboane și gumă' };
    }
    return { categorySlug: 'ciocolata', categoryName: 'Dulciuri și gustări', subcategory: 'Ciocolată și praline', familyKey: 'dulciuri-ciocolata', familyName: 'Ciocolată și praline' };
  }

  if (d2Slug === '1002-produse-dietetice-si-naturiste') {
    return { categorySlug: 'produse-dietetice', categoryName: 'Dietetic, bio și internațional', subcategory: 'Produse dietetice și naturiste', familyKey: 'dietetic-naturiste', familyName: 'Produse dietetice și naturiste' };
  }

  // Stage 3: Fallback pe titlu fără slug Freshful (compatibil cu teste unitare sau payload-uri parțiale)
  const fallbackDairy = inferDairySubcategory(item, titleNorm);
  if (fallbackDairy) return fallbackDairy;

  if (/\bpate\b/.test(titleNorm)) {
    return { categorySlug: 'pate-tartinabile', categoryName: 'Mezeluri și specialități', subcategory: 'Pate', familyKey: 'mezeluri-pate', familyName: 'Pate și tartinabile' };
  }
  if (/\b(salam|carnat|crenvursti|parizer|cabanos)\b/.test(titleNorm)) {
    return { categorySlug: 'salam-carnati', categoryName: 'Mezeluri și specialități', subcategory: 'Salam și cârnați', familyKey: 'mezeluri-salam-carnati', familyName: 'Salam și cârnați' };
  }
  if (/\b(sunca|jambon|muschi|cotlet|bacon|pastrama)\b/.test(titleNorm) || /\bmezeluri\b/.test(pathNorm)) {
    return { categorySlug: 'sunca-specialitati', categoryName: 'Mezeluri și specialități', subcategory: 'Șuncă și specialități', familyKey: 'mezeluri-sunca-specialitati', familyName: 'Șuncă și specialități' };
  }

  return {
    categorySlug: 'branzeturi',
    categoryName: 'Lactate și ouă',
    subcategory: 'Brânzeturi proaspete',
    familyKey: 'branzeturi-branza de vaci proaspata',
    familyName: 'Brânză de vaci proaspătă',
  };
}

/**
 * Returnează cantitatea de afișat a ambalajului (ex: `1 L`, `1.5 kg`, `500 ml`, `200 g`)
 * pentru compatibilitate cu filtrarea `search_beavy_catalog` din `beavy_products`.
 */
export function parseDisplayQuantity(raw) {
  const norm = normalizeText(raw).replace(/,/g, '.');
  if (!norm) return null;
  const multi = norm.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|l|ml|cl|buc\.?|bucati|pcs)(?=\b|\s|$|[,;)])/);
  if (multi) {
    const count = Number(multi[1]);
    const val = Number(multi[2]);
    let u = multi[3].replace('.', '');
    if (u === 'gr') u = 'g';
    if (u === 'l') u = 'L';
    if (u.startsWith('buc')) u = 'buc';
    return { value: Math.round(count * val * 1000) / 1000, unit: u };
  }
  const single = norm.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|l|ml|cl|buc\.?|bucati|pcs)(?=\b|\s|$|[,;)])/);
  if (single) {
    let u = single[2].replace('.', '');
    if (u === 'gr') u = 'g';
    if (u === 'l') u = 'L';
    if (u.startsWith('buc')) u = 'buc';
    return { value: Number(single[1]), unit: u };
  }
  return null;
}

/**
 * Generează un `canonical_key` unic ASCII din numele produsului + SKU.
 */
export function buildCanonicalKey(displayName, sku) {
  const base = normalizeText(displayName)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 68);
  return `${base}-frf-${sku}`;
}

/**
 * Reconciliază lotul deduplicat Freshful cu catalogul canonic existent în Beavy (`beavy_products`).
 */
export function reconcileFreshfulWithCatalog({
  dedupedItems,
  canonicalProducts = [],
  existingSourceLinks = new Map(),
  existingCategoriesBySlug = new Map(),
  existingFamiliesByKey = new Map(),
  catalogBatch = 'freshful_test_batch',
}) {
  const matchedExisting = [];
  const reviewNeeded = [];
  const newCanonical = [];
  const usedCanonicalKeys = new Set(canonicalProducts.map((p) => p.canonical_key).filter(Boolean));
  const usedCanonicalCodes = new Set(canonicalProducts.map((p) => p.canonical_code).filter(Boolean));
  const productsById = new Map(canonicalProducts.map((p) => [p.id, p]));
  const claimedTargetIds = new Map();

  for (const item of dedupedItems) {
    // 1. Link deja aprobat/existent în beavy_source_catalog
    const knownProdId = existingSourceLinks.get(item.source_product_id);
    if (knownProdId && productsById.has(knownProdId)) {
      const target = productsById.get(knownProdId);
      claimedTargetIds.set(target.id, item.source_product_id);
      matchedExisting.push({
        item,
        canonicalProduct: target,
        confidence: 1.0,
        method: 'source_catalog_linked',
        reasons: ['Legătură existentă verificată în beavy_source_catalog'],
        shouldBackfillImage: !target.image_url && Boolean(item.image_url),
      });
      continue;
    }

    // 2. Potrivire strictă semantică + gramaj + grăsime contra catalogului canonic existent
    const labelsTags = [];
    if (item.is_bio) labelsTags.push('eu organic');
    if (item.is_lactose_free) labelsTags.push('lactose free');

    const hitPayload = {
      code: item.source_product_id,
      product_name: item.canonical_candidate_name,
      product_name_ro: item.source_product_name,
      brands: item.brand || '',
      quantity: item.package_size || item.source_product_name,
      categories: item.external_category_path || '',
      labels_tags: labelsTags,
      image_url: item.image_url || '',
      requireImage: false,
    };

    const mapping = inferBeavyCategoryAndFamily(item);
    const categoryRow = existingCategoriesBySlug.get(mapping.categorySlug) ?? null;

    const scoredCandidates = [];
    for (const prod of canonicalProducts) {
      if (prod.category_id && categoryRow?.id && prod.category_id !== categoryRow.id) {
        continue;
      }
      const scored = scoreCanonicalCandidate(prod, hitPayload);
      if (scored.confidence >= 0.45) {
        scoredCandidates.push({ prod, ...scored });
      }
    }
    scoredCandidates.sort((a, b) => b.confidence - a.confidence);
    const best = scoredCandidates[0] ?? null;
    const second = scoredCandidates[1] ?? null;
    const margin = best && second ? best.confidence - second.confidence : 0.25;

    if (best && best.confidence >= 0.85 && best.quantityExact && margin >= 0.08) {
      if (claimedTargetIds.has(best.prod.id)) {
        reviewNeeded.push({
          item,
          candidateProduct: best.prod,
          confidence: Math.min(best.confidence, 0.82),
          runnerUpConfidence: second ? second.confidence : null,
          reasons: [
            `Coliziune N:1 cu SKU ${claimedTargetIds.get(best.prod.id)} pe același produs canonic`,
            ...best.reasons,
          ],
        });
        continue;
      }
      claimedTargetIds.set(best.prod.id, item.source_product_id);
      matchedExisting.push({
        item,
        canonicalProduct: best.prod,
        confidence: best.confidence,
        runnerUpConfidence: second ? second.confidence : null,
        method: 'freshful_canonical_strict',
        reasons: best.reasons,
        shouldBackfillImage: !best.prod.image_url && Boolean(item.image_url),
      });
      continue;
    }

    if (best && best.confidence >= 0.62) {
      reviewNeeded.push({
        item,
        candidateProduct: best.prod,
        confidence: best.confidence,
        runnerUpConfidence: second ? second.confidence : null,
        reasons: best.reasons,
      });
      continue;
    }

    // 3. Produs nou veritabil pentru extinderea catalogului canonic
    const existingFamily = existingFamiliesByKey.get(mapping.familyKey) ?? null;

    let canonicalCode = `BEV-FRF-${item.source_product_id}`;
    if (usedCanonicalCodes.has(canonicalCode)) {
      canonicalCode = `BEV-FRF-${item.source_product_id}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    }
    usedCanonicalCodes.add(canonicalCode);

    let canonicalKey = buildCanonicalKey(item.canonical_candidate_name, item.source_product_id);
    if (usedCanonicalKeys.has(canonicalKey)) {
      canonicalKey = `${canonicalKey}-${usedCanonicalKeys.size}`;
    }
    usedCanonicalKeys.add(canonicalKey);

    const searchAliases = Array.from(
      new Set(
        [
          item.brand,
          mapping.subcategory,
          item.package_size,
          item.fat_percentage != null ? `${item.fat_percentage}%` : null,
          item.is_bio ? 'bio ecologic' : null,
          item.is_lactose_free ? 'fara lactoza' : null,
          ...item.tags,
        ]
          .filter(Boolean)
          .map((s) => String(s).trim())
      )
    );

    const displayQty = parseDisplayQuantity(item.package_size || item.source_product_name);

    newCanonical.push({
      item,
      canonical_name: item.canonical_candidate_name,
      normalized_name: normalizeText(item.canonical_candidate_name),
      brand: item.brand,
      category: mapping.categoryName,
      subcategory: mapping.subcategory,
      category_slug: mapping.categorySlug,
      category_id: categoryRow?.id ?? null,
      family_id: existingFamily?.id ?? null,
      family_key: mapping.familyKey,
      family_name: mapping.familyName,
      package_size: item.package_size,
      quantity_value: displayQty?.value ?? item.quantity_value,
      quantity_unit: displayQty?.unit ?? item.quantity_unit,
      canonical_code: canonicalCode,
      canonical_key: canonicalKey,
      image_url: item.image_url,
      search_aliases: searchAliases,
      attributes: {
        catalog_batch: catalogBatch,
        retailer_source: 'freshful',
        freshful_sku: item.source_product_id,
        freshful_url: item.product_url,
        source_url: item.product_url,
        verification_status: 'retailer_playwright_verified',
        image_status: item.image_url ? 'verified_retailer_cdn' : 'not_added',
        ...(item.fat_percentage != null ? { fat_percentage: item.fat_percentage } : {}),
        ...(item.fat_percentage_min != null && item.fat_percentage_min !== item.fat_percentage_max
          ? { fat_percentage_min: item.fat_percentage_min, fat_percentage_max: item.fat_percentage_max }
          : {}),
        ...(item.is_lactose_free ? { lactose_free: true } : {}),
        ...(item.is_bio ? { is_bio: true } : {}),
        ...(item.is_uht ? { is_uht: true } : {}),
        ...(item.tags.length > 0 ? { tags: item.tags } : {}),
      },
    });
  }

  return {
    matchedExisting,
    reviewNeeded,
    newCanonical,
    summary: {
      totalDedupedInput: dedupedItems.length,
      matchedExistingCount: matchedExisting.length,
      matchedImageBackfillCount: matchedExisting.filter((m) => m.shouldBackfillImage).length,
      reviewNeededCount: reviewNeeded.length,
      newCanonicalCount: newCanonical.length,
    },
  };
}

/**
 * Restrânge câmpurile unui item Freshful la strictul necesar pentru tranzacția SQL.
 */
function compactItemForSql(item, includePrices = false) {
  return {
    source_product_id: item.source_product_id,
    source_product_name: item.source_product_name,
    normalized_source_name: item.normalized_source_name,
    canonical_candidate_name: item.canonical_candidate_name,
    brand: item.brand,
    package_size: item.package_size,
    quantity_value: item.quantity_value,
    quantity_unit: item.quantity_unit,
    sell_by_mode: item.sell_by_mode,
    external_category_path: item.external_category_path,
    product_url: item.product_url,
    image_url: item.image_url,
    content_hash: item.content_hash,
    ...(includePrices
      ? {
          price: item.price,
          regular_price: item.regular_price,
          promo_price: item.promo_price,
          loyalty_price: item.loyalty_price,
          promo_label: item.promo_label,
          promo_requires_card: item.promo_requires_card,
          normalized_unit_price: item.normalized_unit_price,
          normalized_unit_label: item.normalized_unit_label,
        }
      : {}),
    availability: item.availability,
    stock_status: item.stock_status,
  };
}

/**
 * Generează tranzacția SQL idempotentă pentru construirea catalogului canonic Freshful (fără prețuri implicit).
 */
export function buildCanonicalSyncSql({
  reconciliation,
  dedupeStats,
  collectorMeta,
  city = 'București',
  channel = 'delivery',
  observedAt = new Date().toISOString(),
  catalogBatch = 'freshful_test_batch',
  includeRunsAndMatched = true,
  newFamiliesOverride = null,
  includePrices = false,
}) {
  const newFamiliesMap = new Map();
  if (Array.isArray(newFamiliesOverride)) {
    for (const f of newFamiliesOverride) {
      newFamiliesMap.set(f.family_key, f);
    }
  } else if (includeRunsAndMatched) {
    for (const nc of reconciliation.newCanonical) {
      if (!nc.family_id && nc.category_id && !newFamiliesMap.has(nc.family_key)) {
        newFamiliesMap.set(nc.family_key, {
          family_key: nc.family_key,
          canonical_name: nc.family_name,
          category_id: nc.category_id,
        });
      }
    }
  }

  const offersRows = [];
  if (includeRunsAndMatched) {
    for (const m of reconciliation.matchedExisting) {
      offersRows.push({
        mode: 'matched_existing',
        product_id: m.canonicalProduct.id,
        backfill_image: m.shouldBackfillImage ? m.item.image_url : null,
        confidence: m.confidence,
        runner_up_confidence: m.runnerUpConfidence ?? null,
        match_method: m.method,
        match_reasons: m.reasons,
        review_status: 'not_required',
        match_status: 'matched',
        item: compactItemForSql(m.item, includePrices),
      });
    }
    for (const r of reconciliation.reviewNeeded) {
      offersRows.push({
        mode: 'review_needed',
        product_id: r.candidateProduct.id,
        backfill_image: null,
        confidence: r.confidence,
        runner_up_confidence: r.runnerUpConfidence ?? null,
        match_method: 'freshful_canonical_suggested',
        match_reasons: r.reasons,
        review_status: 'pending',
        match_status: 'suggested',
        item: compactItemForSql(r.item, includePrices),
      });
    }
  }

  const newCanonicalPayload = reconciliation.newCanonical.map((nc) => ({
    canonical_name: nc.canonical_name,
    brand: nc.brand,
    category: nc.category,
    subcategory: nc.subcategory,
    category_id: nc.category_id,
    family_id: nc.family_id,
    family_key: nc.family_key,
    package_size: nc.package_size,
    quantity_value: nc.quantity_value,
    quantity_unit: nc.quantity_unit,
    canonical_code: nc.canonical_code,
    canonical_key: nc.canonical_key,
    image_url: nc.image_url,
    search_aliases: nc.search_aliases,
    attributes: nc.attributes,
    item: {
      source_product_id: nc.item.source_product_id,
      source_product_name: nc.item.source_product_name,
      normalized_source_name: nc.item.normalized_source_name,
      sell_by_mode: nc.item.sell_by_mode,
      external_category_path: nc.item.external_category_path,
      product_url: nc.item.product_url,
      content_hash: nc.item.content_hash,
      ...(includePrices
        ? {
            price: nc.item.price,
            regular_price: nc.item.regular_price,
            promo_price: nc.item.promo_price,
            loyalty_price: nc.item.loyalty_price,
            promo_label: nc.item.promo_label,
            promo_requires_card: nc.item.promo_requires_card,
            normalized_unit_price: nc.item.normalized_unit_price,
            normalized_unit_label: nc.item.normalized_unit_label,
          }
        : {}),
      availability: nc.item.availability,
      stock_status: nc.item.stock_status,
    },
  }));

  const runMeta = {
    categoryUrl: collectorMeta?.categoryUrl ?? null,
    categorySlug: collectorMeta?.categorySlug ?? null,
    dedupeStats,
    reconciliationSummary: reconciliation.summary,
    catalogBatch,
  };

  return [
    `-- Auto-generated Freshful Playwright -> Beavy Canonical Catalog Sync`,
    `-- Category: ${collectorMeta?.categorySlug || 'custom'} | Batch: ${catalogBatch}`,
    `-- Matched existing: ${reconciliation.summary.matchedExistingCount} | Review queue: ${reconciliation.summary.reviewNeededCount} | New canonical: ${newCanonicalPayload.length}`,
    'do $freshful_sync$',
    'declare',
    '  v_retailer_id uuid;',
    '  v_retailer_name text;',
    '  v_feed_run_id uuid;',
    '  v_enrich_run_id uuid;',
    `  v_source text := 'freshful_playwright_collector';`,
    `  v_city text := ${sqlLiteral(city)};`,
    `  v_channel text := ${sqlLiteral(channel)};`,
    `  v_observed_at timestamptz := ${sqlLiteral(observedAt)}::timestamptz;`,
    `  v_new_families jsonb := ${sqlLiteral(JSON.stringify(Array.from(newFamiliesMap.values())))}::jsonb;`,
    `  v_matched_rows jsonb := ${sqlLiteral(JSON.stringify(offersRows))}::jsonb;`,
    `  v_new_products jsonb := ${sqlLiteral(JSON.stringify(newCanonicalPayload))}::jsonb;`,
    '  r jsonb;',
    '  it jsonb;',
    '  v_pid uuid;',
    '  v_fam_id uuid;',
    '  v_src_id uuid;',
    '  v_prev_price numeric;',
    'begin',
    `  select id, name into v_retailer_id, v_retailer_name from public.beavy_retailers where slug = 'freshful' limit 1;`,
    `  if v_retailer_id is null then raise exception 'Freshful lipsește din beavy_retailers'; end if;`,
    '',
    '  -- 1. Log feed run & enrichment run',
    ...(includeRunsAndMatched
      ? [
          '  insert into public.beavy_feed_runs (source, retailer_id, status, started_at, finished_at, products_found, offers_saved, metadata)',
          `  values (v_source, v_retailer_id, 'success', now(), now(), ${dedupeStats.afterCanonicalDedupeCount}, ${includePrices ? reconciliation.summary.matchedExistingCount + reconciliation.summary.newCanonicalCount : 0}, ${sqlLiteral(JSON.stringify(runMeta))}::jsonb)`,
          '  returning id into v_feed_run_id;',
          '',
          '  insert into public.beavy_product_enrichment_runs (source, mode, status, input_count, matched_count, review_count, unmatched_count, metadata, finished_at)',
          `  values ('freshful_playwright', 'commit', 'success', ${dedupeStats.afterCanonicalDedupeCount}, ${reconciliation.summary.matchedExistingCount}, ${reconciliation.summary.reviewNeededCount}, ${reconciliation.summary.newCanonicalCount}, ${sqlLiteral(JSON.stringify(runMeta))}::jsonb, now())`,
          '  returning id into v_enrich_run_id;',
        ]
      : [
          '  select id into v_feed_run_id from public.beavy_feed_runs where source = v_source order by created_at desc limit 1;',
        ]),
    '',
    '  -- 2. Ensure missing canonical families & family_name aliases exist (if any)',
    '  for r in select * from jsonb_array_elements(v_new_families) loop',
    '    insert into public.beavy_product_families (family_key, canonical_name, normalized_name, category_id, is_active, sort_order)',
    "    values (r->>'family_key', r->>'canonical_name', public.beavy_normalize_search_text(r->>'canonical_name'), (r->>'category_id')::uuid, true, 50)",
    '    on conflict (family_key) do update set is_active = true',
    '    returning id into v_fam_id;',
    '',
    '    insert into public.beavy_product_family_aliases (family_id, alias, normalized_alias, alias_type, weight, locale)',
    "    values (v_fam_id, r->>'canonical_name', public.beavy_normalize_search_text(r->>'canonical_name'), 'family_name', 1.0, 'ro')",
    '    on conflict (family_id, normalized_alias, alias_type) do nothing;',
    '  end loop;',
    '',
    '  -- 3. Process matched & review items against existing canonical beavy_products',
    '  for r in select * from jsonb_array_elements(v_matched_rows) loop',
    "    it := r->'item';",
    "    v_pid := (r->>'product_id')::uuid;",
    '',
    '    insert into public.beavy_source_catalog (',
    '      source, retailer_id, source_product_id, source_product_name, normalized_source_name,',
    '      brand, package_size, quantity_value, quantity_unit, sell_by_mode, external_category_path,',
    '      image_url, source_image_url, product_url, canonical_product_id, match_status,',
    '      match_confidence, match_method, match_reasons, review_status, content_hash,',
    '      last_seen_run_id, last_seen_at, observed_at, raw_data',
    '    ) values (',
    "      v_source, v_retailer_id, it->>'source_product_id', it->>'source_product_name', it->>'normalized_source_name',",
    "      nullif(it->>'brand', ''), nullif(it->>'package_size', ''), nullif(it->>'quantity_value', '')::numeric,",
    "      nullif(it->>'quantity_unit', ''), it->>'sell_by_mode', nullif(it->>'external_category_path', ''),",
    "      nullif(it->>'image_url', ''), nullif(it->>'image_url', ''), nullif(it->>'product_url', ''),",
    "      case when (r->>'mode') = 'matched_existing' then v_pid else null end,",
    "      r->>'match_status', (r->>'confidence')::numeric, r->>'match_method', coalesce(r->'match_reasons', '[]'::jsonb),",
    "      r->>'review_status', it->>'content_hash', v_feed_run_id, v_observed_at, v_observed_at, it",
    '    )',
    '    on conflict (source, source_product_id) do update set',
    '      source_product_name = excluded.source_product_name,',
    '      package_size = excluded.package_size,',
    '      image_url = excluded.image_url,',
    '      content_hash = excluded.content_hash,',
    '      last_seen_run_id = v_feed_run_id,',
    '      last_seen_at = v_observed_at,',
    '      observed_at = v_observed_at,',
    '      is_active = true,',
    '      updated_at = now()',
    '    returning id into v_src_id;',
    '',
    "    if (r->>'backfill_image') is not null and (r->>'mode') = 'matched_existing' then",
    '      update public.beavy_products set',
    "        image_url = r->>'backfill_image',",
    "        image_source = 'Freshful Catalog',",
    "        image_source_url = nullif(it->>'product_url', ''),",
    "        attributes = attributes || jsonb_build_object('image_status', 'verified_retailer_cdn', 'freshful_sku', it->>'source_product_id'),",
    '        updated_at = now()',
    "      where id = v_pid and (image_url is null or btrim(image_url) = '');",
    '',
    '      insert into public.beavy_product_field_provenance (product_id, field_name, source, source_record_id, source_url, observed_value)',
    "      values (v_pid, 'image_url', 'freshful_playwright', v_src_id, nullif(it->>'product_url', ''), jsonb_build_object('image_url', r->>'backfill_image'))",
    '      on conflict (product_id, field_name, source, source_record_id) do nothing;',
    '    end if;',
    '',
    "    if (r->>'mode') = 'review_needed' then",
    '      insert into public.beavy_product_match_reviews (source_catalog_id, candidate_barcode, candidate_payload, confidence, runner_up_confidence, reasons, status)',
    '      select',
    '        v_src_id,',
    '        null,',
    "        jsonb_build_object('canonical_product_id', v_pid, 'source_product_name', it->>'canonical_candidate_name', 'package_size', it->>'package_size'),",
    "        (r->>'confidence')::numeric,",
    "        nullif(r->>'runner_up_confidence', '')::numeric,",
    "        coalesce(r->'match_reasons', '[]'::jsonb),",
    "        'pending'",
    '      where not exists (',
    "        select 1 from public.beavy_product_match_reviews mr where mr.source_catalog_id = v_src_id and mr.status = 'pending'",
    '      );',
    '    end if;',
    '',
    ...(includePrices
      ? [
          "    if (r->>'mode') = 'matched_existing' and (it->>'price') is not null then",
          '      select price into v_prev_price from public.beavy_product_offers',
          '      where retailer_id = v_retailer_id and fulfillment_node_id is null and product_id = v_pid and fulfillment_channel = v_channel and is_active = true;',
          '',
          '      insert into public.beavy_product_offers (',
          '        product_id, source_catalog_id, retailer_id, retailer_name, source,',
          '        price, regular_price, promo_price, loyalty_price, promo_label, promo_requires_card,',
          '        currency, unit_price, normalized_unit_price, normalized_unit_label, sell_by_mode,',
          '        quantity_value, quantity_unit, package_size, product_url, image_url, fulfillment_channel,',
          '        city, availability, stock_status, observed_at, is_active, last_seen_run_id, content_hash',
          '      ) values (',
          '        v_pid, v_src_id, v_retailer_id, v_retailer_name, v_source,',
          "        (it->>'price')::numeric, nullif(it->>'regular_price', '')::numeric, nullif(it->>'promo_price', '')::numeric,",
          "        nullif(it->>'loyalty_price', '')::numeric, nullif(it->>'promo_label', ''), coalesce((it->>'promo_requires_card')::boolean, false),",
          "        'RON', nullif(it->>'normalized_unit_price', '')::numeric, nullif(it->>'normalized_unit_price', '')::numeric,",
          "        nullif(it->>'normalized_unit_label', ''), it->>'sell_by_mode', nullif(it->>'quantity_value', '')::numeric,",
          "        nullif(it->>'quantity_unit', ''), nullif(it->>'package_size', ''), nullif(it->>'product_url', ''), nullif(it->>'image_url', ''),",
          "        v_channel, v_city, it->>'availability', it->>'stock_status', v_observed_at, true, v_feed_run_id, it->>'content_hash'",
          '      )',
          "      on conflict (retailer_id, coalesce(fulfillment_node_id, '00000000-0000-0000-0000-000000000000'::uuid), product_id, fulfillment_channel) where (is_active is true and product_id is not null and retailer_id is not null)",
          '      do update set',
          '        price = excluded.price, regular_price = excluded.regular_price, promo_price = excluded.promo_price,',
          '        loyalty_price = excluded.loyalty_price, promo_label = excluded.promo_label, promo_requires_card = excluded.promo_requires_card,',
          '        normalized_unit_price = excluded.normalized_unit_price, normalized_unit_label = excluded.normalized_unit_label,',
          '        availability = excluded.availability, stock_status = excluded.stock_status, observed_at = excluded.observed_at,',
          '        last_seen_run_id = v_feed_run_id, content_hash = excluded.content_hash;',
          '',
          "      if v_prev_price is distinct from (it->>'price')::numeric then",
          '        insert into public.beavy_product_price_history (product_id, retailer_id, fulfillment_channel, price, regular_price, promo_price, loyalty_price, currency, observed_at, run_id)',
          "        values (v_pid, v_retailer_id, v_channel, (it->>'price')::numeric, nullif(it->>'regular_price', '')::numeric, nullif(it->>'promo_price', '')::numeric, nullif(it->>'loyalty_price', '')::numeric, 'RON', v_observed_at, v_feed_run_id);",
          '      end if;',
          '    end if;',
        ]
      : []),
    '  end loop;',
    '',
    '  -- 4. Promote unmatched new canonical SKUs into beavy_products + family members + provenance + offers',
    '  for r in select * from jsonb_array_elements(v_new_products) loop',
    "    it := r->'item';",
    '',
    '    insert into public.beavy_products (',
    '      canonical_name, normalized_name, brand, category, subcategory, package_size,',
    '      quantity_value, quantity_unit, image_url, search_aliases, is_active, category_id,',
    '      image_source, image_source_url, attributes, canonical_code, canonical_key',
    '    ) values (',
    "      r->>'canonical_name', public.beavy_normalize_search_text(r->>'canonical_name'), nullif(r->>'brand', ''), r->>'category',",
    "      r->>'subcategory', nullif(r->>'package_size', ''), nullif(r->>'quantity_value', '')::numeric,",
    "      nullif(r->>'quantity_unit', ''), nullif(r->>'image_url', ''),",
    "      array(select jsonb_array_elements_text(coalesce(r->'search_aliases', '[]'::jsonb))),",
    "      true, nullif(r->>'category_id', '')::uuid, 'Freshful Catalog', nullif(it->>'product_url', ''),",
    "      coalesce(r->'attributes', '{}'::jsonb), r->>'canonical_code', r->>'canonical_key'",
    '    )',
    '    on conflict (canonical_key) do update set',
    '      image_url = coalesce(public.beavy_products.image_url, excluded.image_url),',
    '      updated_at = now()',
    '    returning id into v_pid;',
    '',
    '    -- Resolve family_id & link family member',
    "    v_fam_id := nullif(r->>'family_id', '')::uuid;",
    '    if v_fam_id is null then',
    "      select id into v_fam_id from public.beavy_product_families where family_key = r->>'family_key' limit 1;",
    '    end if;',
    '    if v_fam_id is not null then',
    '      insert into public.beavy_product_family_members (family_id, product_id, sort_order, is_featured)',
    '      values (v_fam_id, v_pid, 100, false)',
    '      on conflict (product_id) do nothing;',
    '',
    '      insert into public.beavy_product_family_aliases (family_id, alias, normalized_alias, alias_type, weight, locale)',
    "      values (v_fam_id, r->>'canonical_name', public.beavy_normalize_search_text(r->>'canonical_name'), 'catalog_alias', 0.85, 'ro')",
    '      on conflict (family_id, normalized_alias, alias_type) do nothing;',
    '    end if;',
    '',
    '    insert into public.beavy_source_catalog (',
    '      source, retailer_id, source_product_id, source_product_name, normalized_source_name,',
    '      brand, package_size, quantity_value, quantity_unit, sell_by_mode, external_category_path,',
    '      image_url, source_image_url, product_url, canonical_product_id, match_status,',
    '      match_confidence, match_method, match_reasons, review_status, content_hash,',
    '      last_seen_run_id, last_seen_at, observed_at, raw_data',
    '    ) values (',
    "      v_source, v_retailer_id, it->>'source_product_id', it->>'source_product_name', it->>'normalized_source_name',",
    "      nullif(r->>'brand', ''), nullif(r->>'package_size', ''), nullif(r->>'quantity_value', '')::numeric,",
    "      nullif(r->>'quantity_unit', ''), it->>'sell_by_mode', nullif(it->>'external_category_path', ''),",
    "      nullif(r->>'image_url', ''), nullif(r->>'image_url', ''), nullif(it->>'product_url', ''),",
    "      v_pid, 'matched', 1.0, 'freshful_canonical_promoted', '[\"Produs canonic creat din colectorul Freshful\"]'::jsonb,",
    "      'approved', it->>'content_hash', v_feed_run_id, v_observed_at, v_observed_at, it",
    '    )',
    '    on conflict (source, source_product_id) do update set',
    '      canonical_product_id = v_pid, content_hash = excluded.content_hash, last_seen_run_id = v_feed_run_id, last_seen_at = v_observed_at, observed_at = v_observed_at, is_active = true, updated_at = now()',
    '    returning id into v_src_id;',
    '',
    '    insert into public.beavy_product_field_provenance (product_id, field_name, source, source_record_id, source_url, observed_value)',
    "    values (v_pid, 'canonical_record', 'freshful_playwright', v_src_id, nullif(it->>'product_url', ''), jsonb_build_object('sku', it->>'source_product_id', 'canonical_code', r->>'canonical_code'))",
    '    on conflict (product_id, field_name, source, source_record_id) do nothing;',
    '',
    ...(includePrices
      ? [
          "    if (it->>'price') is not null then",
          '      select price into v_prev_price from public.beavy_product_offers',
          '      where retailer_id = v_retailer_id and fulfillment_node_id is null and product_id = v_pid and fulfillment_channel = v_channel and is_active = true;',
          '',
          '      insert into public.beavy_product_offers (',
          '        product_id, source_catalog_id, retailer_id, retailer_name, source,',
          '        price, regular_price, promo_price, loyalty_price, promo_label, promo_requires_card,',
          '        currency, unit_price, normalized_unit_price, normalized_unit_label, sell_by_mode,',
          '        quantity_value, quantity_unit, package_size, product_url, image_url, fulfillment_channel,',
          '        city, availability, stock_status, observed_at, is_active, last_seen_run_id, content_hash',
          '      ) values (',
          '        v_pid, v_src_id, v_retailer_id, v_retailer_name, v_source,',
          "        (it->>'price')::numeric, nullif(it->>'regular_price', '')::numeric, nullif(it->>'promo_price', '')::numeric,",
          "        nullif(it->>'loyalty_price', '')::numeric, nullif(it->>'promo_label', ''), coalesce((it->>'promo_requires_card')::boolean, false),",
          "        'RON', nullif(it->>'normalized_unit_price', '')::numeric, nullif(it->>'normalized_unit_price', '')::numeric,",
          "        nullif(it->>'normalized_unit_label', ''), it->>'sell_by_mode', nullif(r->>'quantity_value', '')::numeric,",
          "        nullif(r->>'quantity_unit', ''), nullif(r->>'package_size', ''), nullif(it->>'product_url', ''), nullif(r->>'image_url', ''),",
          "        v_channel, v_city, it->>'availability', it->>'stock_status', v_observed_at, true, v_feed_run_id, it->>'content_hash'",
          '      )',
          "      on conflict (retailer_id, coalesce(fulfillment_node_id, '00000000-0000-0000-0000-000000000000'::uuid), product_id, fulfillment_channel) where (is_active is true and product_id is not null and retailer_id is not null)",
          '      do update set',
          '        price = excluded.price, regular_price = excluded.regular_price, promo_price = excluded.promo_price,',
          '        loyalty_price = excluded.loyalty_price, promo_label = excluded.promo_label, observed_at = excluded.observed_at,',
          '        last_seen_run_id = v_feed_run_id, content_hash = excluded.content_hash;',
          '',
          "      if v_prev_price is distinct from (it->>'price')::numeric then",
          '        insert into public.beavy_product_price_history (product_id, retailer_id, fulfillment_channel, price, regular_price, promo_price, loyalty_price, currency, observed_at, run_id)',
          "        values (v_pid, v_retailer_id, v_channel, (it->>'price')::numeric, nullif(it->>'regular_price', '')::numeric, nullif(it->>'promo_price', '')::numeric, nullif(it->>'loyalty_price', '')::numeric, 'RON', v_observed_at, v_feed_run_id);",
          '      end if;',
          '    end if;',
        ]
      : []),
    '  end loop;',
    'end $freshful_sync$;',
  ].join('\n');
}

/**
 * Împarte tranzacția SQL în chunk-uri mici (~15-20KB fiecare) pentru execuție sigură în batch-uri.
 */
export function buildChunkedCanonicalSyncSqls(options, chunkSize = 12) {
  const chunks = [];
  const { reconciliation } = options;

  const newFamilies = Array.from(
    new Map(
      reconciliation.newCanonical
        .filter((nc) => !nc.family_id && nc.category_id)
        .map((nc) => [
          nc.family_key,
          { family_key: nc.family_key, canonical_name: nc.family_name, category_id: nc.category_id },
        ])
    ).values()
  );

  chunks.push({
    name: '00_families_and_matched.sql',
    sql: buildCanonicalSyncSql({
      ...options,
      reconciliation: {
        ...reconciliation,
        newCanonical: [],
      },
      includeRunsAndMatched: true,
      newFamiliesOverride: newFamilies,
    }),
  });

  const totalNew = reconciliation.newCanonical.length;
  for (let start = 0; start < totalNew; start += chunkSize) {
    const slice = reconciliation.newCanonical.slice(start, start + chunkSize);
    const idx = Math.floor(start / chunkSize) + 1;
    chunks.push({
      name: `${String(idx).padStart(2, '0')}_new_canonical_${start + 1}_to_${start + slice.length}.sql`,
      sql: buildCanonicalSyncSql({
        ...options,
        reconciliation: {
          matchedExisting: [],
          reviewNeeded: [],
          newCanonical: slice,
          summary: reconciliation.summary,
        },
        includeRunsAndMatched: false,
        newFamiliesOverride: [],
      }),
    });
  }

  return chunks;
}

const FRESHFUL_CDN_PREFIX = 'https://cdn.freshful.ro/media/cache/sylius_shop_product_original/';
const FRESHFUL_PROD_PREFIX = 'https://www.freshful.ro/p/';

/**
 * Construiește tuplul compact (array ordonat 0..30) pentru funcția PL/pgSQL `beavy_ingest_freshful_tuples`.
 */
export function buildCompactFreshfulTuple(item, usedCanonicalKeys = new Set(), catalogBatch = 'freshful_full') {
  const mapping = inferBeavyCategoryAndFamily(item);
  const displayQty = parseDisplayQuantity(item.package_size || item.source_product_name);

  let canonicalKey = buildCanonicalKey(item.canonical_candidate_name, item.source_product_id);
  if (usedCanonicalKeys.has(canonicalKey)) {
    canonicalKey = `${canonicalKey}-${item.source_product_id}`;
  }
  usedCanonicalKeys.add(canonicalKey);

  const searchAliases = Array.from(
    new Set(
      [
        item.brand,
        mapping.subcategory,
        item.package_size,
        item.fat_percentage != null ? `${item.fat_percentage}%` : null,
        item.is_bio ? 'bio ecologic' : null,
        item.is_lactose_free ? 'fara lactoza' : null,
        ...(Array.isArray(item.tags) ? item.tags : []),
      ]
        .filter(Boolean)
        .map((s) => String(s).trim())
    )
  );

  const attrsExtra = {
    ...(item.fat_percentage != null ? { fat_percentage: item.fat_percentage } : {}),
    ...(item.fat_percentage_min != null && item.fat_percentage_min !== item.fat_percentage_max
      ? { fat_percentage_min: item.fat_percentage_min, fat_percentage_max: item.fat_percentage_max }
      : {}),
    ...(item.is_lactose_free ? { lactose_free: true } : {}),
    ...(item.is_bio ? { is_bio: true } : {}),
    ...(item.is_uht ? { is_uht: true } : {}),
    ...(Array.isArray(item.tags) && item.tags.length > 0 ? { tags: item.tags } : {}),
    ...(item.category_slug_freshful ? { freshful_category_slug: item.category_slug_freshful } : {}),
  };

  const imgSuffix =
    item.image_url && item.image_url.startsWith(FRESHFUL_CDN_PREFIX)
      ? item.image_url.slice(FRESHFUL_CDN_PREFIX.length)
      : item.image_url || null;
  const urlSuffix =
    item.product_url && item.product_url.startsWith(FRESHFUL_PROD_PREFIX)
      ? item.product_url.slice(FRESHFUL_PROD_PREFIX.length)
      : item.product_url || null;

  const qtyVal = displayQty?.value ?? item.quantity_value ?? null;
  const offerQtyVal = item.quantity_value ?? null;

  return {
    categorySlug: mapping.categorySlug,
    familyKey: mapping.familyKey,
    catalogBatch,
    tuple: [
      String(item.source_product_id),
      item.canonical_candidate_name,
      item.source_product_name,
      item.brand || null,
      mapping.categorySlug,
      mapping.categoryName,
      mapping.subcategory,
      mapping.familyKey,
      mapping.familyName,
      item.package_size || null,
      qtyVal != null && Number(qtyVal) > 0 ? Number(qtyVal) : null,
      qtyVal != null && Number(qtyVal) > 0 ? displayQty?.unit ?? item.quantity_unit ?? null : null,
      offerQtyVal != null && Number(offerQtyVal) > 0 ? Number(offerQtyVal) : null,
      offerQtyVal != null && Number(offerQtyVal) > 0 ? item.quantity_unit ?? null : null,
      imgSuffix,
      urlSuffix,
      null,
      null,
      null,
      null,
      null,
      0,
      null,
      null,
      item.stock_status || 'in_stock',
      item.sell_by_mode || 'unit',
      item.external_category_path || null,
      attrsExtra,
      searchAliases,
      item.content_hash,
      canonicalKey,
    ],
  };
}

/**
 * Generează chunk-uri SQL ultra-compacte (`beavy_ingest_freshful_tuples`) pentru sincronizarea întregului catalog.
 */
export function buildCompactIngestBatches({
  dedupedItems,
  dedupeStats = {},
  city = 'București',
  channel = 'delivery',
  observedAt = new Date().toISOString(),
  catalogBatch = 'freshful_full',
  batchSize = 250,
}) {
  const feedRunId = crypto.randomUUID();
  const usedCanonicalKeys = new Set();
  const tuples = [];
  const categoryHistogram = {};

  for (const item of dedupedItems) {
    const built = buildCompactFreshfulTuple(item, usedCanonicalKeys, catalogBatch);
    tuples.push(built.tuple);
    categoryHistogram[built.categorySlug] = (categoryHistogram[built.categorySlug] || 0) + 1;
  }

  const runMeta = {
    catalogBatch,
    dedupeStats,
    totalProducts: tuples.length,
    categoriesCount: Object.keys(categoryHistogram).length,
  };

  const setupSql = [
    `-- Setup Feed & Enrichment Runs for ${catalogBatch} (${tuples.length} produse)`,
    'do $$',
    'declare',
    '  v_retailer_id uuid;',
    'begin',
    `  select id into v_retailer_id from public.beavy_retailers where slug = 'freshful' limit 1;`,
    `  if v_retailer_id is null then raise exception 'Freshful lipsește din beavy_retailers'; end if;`,
    '',
    '  insert into public.beavy_feed_runs (id, source, retailer_id, status, started_at, finished_at, products_found, offers_saved, metadata)',
    `  values (${sqlLiteral(feedRunId)}::uuid, 'freshful_playwright_collector', v_retailer_id, 'success', ${sqlLiteral(observedAt)}::timestamptz, now(), ${tuples.length}, 0, ${sqlLiteral(JSON.stringify(runMeta))}::jsonb)`,
    '  on conflict (id) do nothing;',
    '',
    '  insert into public.beavy_product_enrichment_runs (source, mode, status, input_count, matched_count, review_count, unmatched_count, metadata, finished_at)',
    `  values ('freshful_playwright', 'commit', 'success', ${tuples.length}, 0, 0, ${tuples.length}, ${sqlLiteral(JSON.stringify(runMeta))}::jsonb, now());`,
    'end $$;',
  ].join('\n');

  const chunks = [{ name: '00_setup_runs.sql', sql: setupSql, count: 0 }];

  for (let start = 0; start < tuples.length; start += batchSize) {
    const slice = tuples.slice(start, start + batchSize);
    const idx = Math.floor(start / batchSize) + 1;
    const sql = [
      `-- Batch ${idx}: items ${start + 1}..${start + slice.length} of ${tuples.length}`,
      'select public.beavy_ingest_freshful_tuples(',
      `  ${sqlLiteral(feedRunId)}::uuid,`,
      `  ${sqlLiteral(observedAt)}::timestamptz,`,
      `  ${sqlLiteral(city)},`,
      `  ${sqlLiteral(channel)},`,
      `  ${sqlLiteral(catalogBatch)},`,
      `  ${sqlLiteral(JSON.stringify(slice))}::jsonb`,
      ');',
    ].join('\n');

    chunks.push({
      name: `${String(idx).padStart(3, '0')}_batch_${start + 1}_to_${start + slice.length}.sql`,
      sql,
      count: slice.length,
    });
  }

  return {
    feedRunId,
    totalProducts: tuples.length,
    categoryHistogram,
    chunks,
  };
}
