/**
 * Beavy Recipe Parser & Smart Ingredient Extractor.
 *
 * Transformă rețete copiate din bloguri culinare (Jamila Cuisine, Savori Urbane,
 * Laura Laurențiu), postări Instagram/TikTok sau link-uri web directe în
 * produse concrete de supermarket, scalate pe numărul de porții și curățate
 * de ingredientele de bază pe care utilizatorul le are deja în cămară.
 */

import type { ScannedRawItem } from './beavy-list-scanner-core';
import { isHaikuAvailable, parseRecipeWithHaiku } from './beavy-claude-haiku';

export type RecipeIngredient = {
  id: string;
  rawLine: string;
  cleanName: string;
  baseQuantity: number;
  unit: string | null;
  packageSizeHint?: string | null;
  isPantryStaple: boolean;
  stapleReason?: string;
  categoryHint?: string;
};

export type RecipeParseResult = {
  title: string;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  sourceDomain?: string | null;
  baseServings: number;
  ingredients: RecipeIngredient[];
  rawText: string;
  missingSuggestions?: string[];
  dietaryBadges?: string[];
  chefTip?: string;
  parsedWithAi?: boolean;
};

// Ingrediente de bază din cămară care nu trebuie cumpărate de fiecare dată
const PANTRY_STAPLES: Record<string, { pattern: RegExp; reason: string }> = {
  apa: {
    pattern: /\b(apa|apa calduta|apa rece|apa plata|cuburi de gheata)\b/i,
    reason: 'Apă de la robinet / plată',
  },
  sare: {
    pattern: /\b(sare|sare de mare|sare grunjoasa|sare fina|un praf de sare)\b/i,
    reason: 'Sare de bucătărie',
  },
  piper: {
    pattern: /\b(piper|piper negru|piper macinat|boabe de piper)\b/i,
    reason: 'Piper măcinat / boabe',
  },
  ulei: {
    pattern:
      /\b(ulei de floarea[- ]soarelui|ulei pentru prajit|ulei pentru calit|ulei de gatit|putin ulei)\b/i,
    reason: 'Ulei de gătit uzual',
  },
  otet: {
    pattern: /\b(otet de vin|otet alb|otet simplu)\b/i,
    reason: 'Oțet de cămară',
  },
  bicarbonat: {
    pattern: /\b(bicarbonat|bicarbonat de sodiu)\b/i,
    reason: 'Bicarbonat de sodiu',
  },
  dafin: {
    pattern: /\b(foi de dafin|frunze de dafin|dafin)\b/i,
    reason: 'Condimente de cămară',
  },
};

// Unități culinare românești și conversii spre supermarket
const CULINARY_UNITS: Record<string, { normUnit: string; multiplier?: number }> = {
  kg: { normUnit: 'kg' },
  kilogram: { normUnit: 'kg' },
  kilograme: { normUnit: 'kg' },
  g: { normUnit: 'g' },
  gr: { normUnit: 'g' },
  grame: { normUnit: 'g' },
  l: { normUnit: 'l' },
  litru: { normUnit: 'l' },
  litri: { normUnit: 'l' },
  ml: { normUnit: 'ml' },
  mililitri: { normUnit: 'ml' },
  cl: { normUnit: 'cl' },
  buc: { normUnit: 'buc' },
  bucata: { normUnit: 'buc' },
  bucati: { normUnit: 'buc' },
  bucăți: { normUnit: 'buc' },
  legatura: { normUnit: 'legătură' },
  legatură: { normUnit: 'legătură' },
  legaturi: { normUnit: 'legătură' },
  legături: { normUnit: 'legătură' },
  pachet: { normUnit: 'pachet' },
  pachete: { normUnit: 'pachet' },
  cutie: { normUnit: 'cutie' },
  cutii: { normUnit: 'cutie' },
  sticla: { normUnit: 'sticlă' },
  sticle: { normUnit: 'sticlă' },
  borcan: { normUnit: 'borcan' },
  borcane: { normUnit: 'borcan' },
  conserva: { normUnit: 'conservă' },
  conserve: { normUnit: 'conservă' },
  caserola: { normUnit: 'caserolă' },
  caserole: { normUnit: 'caserolă' },
  plic: { normUnit: 'plic' },
  plicuri: { normUnit: 'plic' },
  lingura: { normUnit: 'lingură' },
  linguri: { normUnit: 'lingură' },
  lingurita: { normUnit: 'linguriță' },
  lingurite: { normUnit: 'linguriță' },
  lingurițe: { normUnit: 'linguriță' },
  cana: { normUnit: 'cană' },
  cani: { normUnit: 'cană' },
  căni: { normUnit: 'cană' },
  catel: { normUnit: 'cățel' },
  catei: { normUnit: 'cățel' },
  căței: { normUnit: 'cățel' },
  capatana: { normUnit: 'căpățână' },
  căpățână: { normUnit: 'căpățână' },
  frunze: { normUnit: 'buc' },
  felii: { normUnit: 'buc' },
};

/**
 * Curăță textul și elimină diacriticele pentru potriviri regex relaxate.
 */
function normalizeRecipeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Verifică dacă textul furnizat este o adresă URL web validă.
 */
export function isRecipeUrl(text: string): boolean {
  const trimmed = text.trim();
  return /^https?:\/\/[^\s$.?#].[^\s]*$/i.test(trimmed);
}

/**
 * Extrage domeniul prietenos dintr-un URL (ex: jamilacuisine.ro).
 */
export function extractDomainFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return 'Web';
  }
}

/**
 * Identifică dacă un ingredient este un aliment de bază din cămară
 * (pe care cumpărătorul probabil îl are deja).
 */
export function identifyPantryStaple(name: string): {
  isStaple: boolean;
  reason?: string;
} {
  const norm = normalizeRecipeText(name);

  // Verificare excepții: ulei de măsline/trufe sau snacks-uri cu sare/piper nu sunt staples de cămară
  if (
    norm.includes('ulei de masline') ||
    norm.includes('ulei extravirgin') ||
    norm.includes('ulei de trufe') ||
    norm.includes('chips') ||
    norm.includes('popcorn') ||
    norm.includes('snack') ||
    norm.includes('arahide') ||
    norm.includes('alune') ||
    norm.includes('biscuit')
  ) {
    return { isStaple: false };
  }

  for (const staple of Object.values(PANTRY_STAPLES)) {
    if (staple.pattern.test(norm)) {
      return { isStaple: true, reason: staple.reason };
    }
  }

  return { isStaple: false };
}

/**
 * Normalizează denumirea culinară către denumiri canonice de supermarket.
 * Ex: „4 gălbenușuri” -> „Ouă proaspete”
 * Ex: „2 căței de usturoi” -> „Usturoi”
 * Ex: „piept de pui cubulețe” -> „Piept de pui dezosat”
 */
export function mapCulinaryNameToGroceryItem(name: string): {
  cleanName: string;
  categoryHint?: string;
} {
  const norm = normalizeRecipeText(name);

  if (/\b(galbenus\w*|albus\w*|oua|ou)\b/.test(norm)) {
    return { cleanName: 'Ouă proaspete', categoryHint: 'Lactate & Ouă' };
  }

  if (norm.includes('usturoi')) {
    return { cleanName: 'Usturoi', categoryHint: 'Legume & Fructe' };
  }

  if (norm.includes('piept de pui')) {
    return { cleanName: 'Piept de pui dezosat', categoryHint: 'Carne & Pește' };
  }

  if (norm.includes('pulpe de pui')) {
    return { cleanName: 'Pulpe de pui', categoryHint: 'Carne & Pește' };
  }

  if (norm.includes('carne tocata')) {
    if (norm.includes('porc')) return { cleanName: 'Carne tocată porc', categoryHint: 'Carne & Pește' };
    if (norm.includes('vita')) return { cleanName: 'Carne tocată vită', categoryHint: 'Carne & Pește' };
    return { cleanName: 'Carne tocată amestec', categoryHint: 'Carne & Pește' };
  }

  if (norm.includes('smantana')) {
    if (norm.includes('gatit') || norm.includes('lichida') || norm.includes('dulce')) {
      return { cleanName: 'Smântână de gătit', categoryHint: 'Lactate & Ouă' };
    }
    return { cleanName: 'Smântână fermentată', categoryHint: 'Lactate & Ouă' };
  }

  if (norm.includes('parmezan') || norm.includes('parmigiano')) {
    return { cleanName: 'Parmezan ras', categoryHint: 'Brânzeturi' };
  }

  if (norm.includes('branza de vaci')) {
    return { cleanName: 'Brânză proaspătă de vaci', categoryHint: 'Lactate & Ouă' };
  }

  if (norm.includes('ciuperci')) {
    return { cleanName: 'Ciuperci Champignon', categoryHint: 'Legume & Fructe' };
  }

  if (/\b(spaghett?i|spaghete)\b/.test(norm)) {
    return { cleanName: 'Spaghete', categoryHint: 'Cămară' };
  }
  if (/\bpenne\b/.test(norm)) {
    return { cleanName: 'Paste penne', categoryHint: 'Cămară' };
  }
  if (/\bfusilli\b/.test(norm)) {
    return { cleanName: 'Paste fusilli', categoryHint: 'Cămară' };
  }
  if (/\btagliatelle\b/.test(norm)) {
    return { cleanName: 'Tagliatelle', categoryHint: 'Cămară' };
  }
  if (/\bpaste\b/.test(norm)) {
    return { cleanName: 'Paste făinoase', categoryHint: 'Cămară' };
  }

  if (norm.includes('patrunjel')) {
    return { cleanName: 'Pătrunjel proaspăt', categoryHint: 'Legume & Fructe' };
  }

  if (norm.includes('marar')) {
    return { cleanName: 'Mărar proaspăt', categoryHint: 'Legume & Fructe' };
  }

  // Capitalizare prima literă
  const clean = name.trim().replace(/^de\s+/i, '');
  return {
    cleanName: clean.charAt(0).toUpperCase() + clean.slice(1),
  };
}

/**
 * Parsează o singură linie de ingredient dintr-o rețetă.
 * Detectează cantitatea, unitatea de măsură și produsul curățat.
 */
export function parseSingleRecipeIngredient(
  rawLine: string,
  index: number
): RecipeIngredient | null {
  let line = rawLine
    .replace(/^[-•*▪◦✓✔☐☑–—[\]\s]+/, '')
    .replace(/^\d{1,2}[.)]\s+/, '')
    .trim();

  if (!line || line.length < 2) return null;

  // Liniile care sunt instrucțiuni, nu ingrediente
  const normLine = normalizeRecipeText(line);
  if (
    normLine.startsWith('mod de preparare') ||
    normLine.startsWith('instructiuni') ||
    normLine.startsWith('pasi') ||
    normLine.startsWith('fierbem') ||
    normLine.startsWith('calim') ||
    normLine.startsWith('spalam') ||
    normLine.startsWith('taiem') ||
    normLine.startsWith('preincalzim') ||
    normLine.startsWith('se amesteca') ||
    normLine.startsWith('pofta buna')
  ) {
    return null;
  }

  let quantity = 1;
  let unit: string | null = null;
  let namePart = line;

  // Căutare tipare cantitate + unitate:
  // Ex: "500g piept de pui", "2 cepe", "3 linguri de smantana", "1/2 legatura patrunjel"
  const fractionMatch = line.match(/^(\d+)\/(\d+)\s*([a-zăîșț]+)?\s+(?:de\s+)?(.+)$/i);
  if (fractionMatch) {
    const num = parseFloat(fractionMatch[1]) / parseFloat(fractionMatch[2]);
    quantity = Math.max(0.25, Math.round(num * 100) / 100);
    const rawUnit = fractionMatch[3]?.toLowerCase();
    if (rawUnit && CULINARY_UNITS[rawUnit]) {
      unit = CULINARY_UNITS[rawUnit].normUnit;
    }
    namePart = fractionMatch[4].trim();
  } else {
    // Ex: "500 g piept...", "500g piept...", "2 buc...", "2-3 cepe"
    const standardMatch = line.match(
      /^(\d+(?:[.,]\d+)?)(?:\s*-\s*\d+)?\s*([a-zăîșț]+)?\s+(?:de\s+)?(.+)$/i
    );

    if (standardMatch) {
      quantity = parseFloat(standardMatch[1].replace(',', '.'));
      const potentialUnit = standardMatch[2]?.toLowerCase();

      if (potentialUnit && CULINARY_UNITS[potentialUnit]) {
        unit = CULINARY_UNITS[potentialUnit].normUnit;
        namePart = standardMatch[3].trim();
      } else if (potentialUnit) {
        // Unitatea poate face parte din nume dacă nu e recunoscută
        namePart = `${standardMatch[2]} ${standardMatch[3]}`.trim();
        unit = 'buc';
      } else {
        unit = 'buc';
        namePart = standardMatch[3].trim();
      }
    } else {
      // Expresii fără număr explicit: "un praf de sare", "sare si piper dupa gust", "o legatura de marar"
      const vagueMatch = line.match(/^(o|un)\s+([a-zăîșț]+)\s+(?:de\s+)?(.+)$/i);
      if (vagueMatch) {
        quantity = 1;
        const u = vagueMatch[2].toLowerCase();
        if (CULINARY_UNITS[u]) {
          unit = CULINARY_UNITS[u].normUnit;
          namePart = vagueMatch[3].trim();
        } else {
          namePart = `${vagueMatch[2]} ${vagueMatch[3]}`.trim();
        }
      }
    }
  }

  // Curățare paranteze suplimentare din nume: "smântână grasă (20% sau 30%)" -> păstrăm sau curățăm opțional
  const cleanWorkingName = namePart
    .replace(/\s*\(după gust\)/i, '')
    .replace(/\s*\(opțional\)/i, '')
    .replace(/\s*după gust\b/i, '')
    .trim();

  const { isStaple, reason } = identifyPantryStaple(cleanWorkingName);
  const { cleanName, categoryHint } = mapCulinaryNameToGroceryItem(cleanWorkingName);

  return {
    id: `ing-${index + 1}-${Math.random().toString(36).slice(2, 6)}`,
    rawLine,
    cleanName: cleanName || cleanWorkingName,
    baseQuantity: Math.max(0.1, quantity),
    unit,
    isPantryStaple: isStaple,
    stapleReason: reason,
    categoryHint,
  };
}

/**
 * Extrage secțiunea de ingrediente dintr-un text brut de rețetă.
 */
export function extractIngredientsBlock(rawText: string): {
  title: string;
  servings: number;
  ingredientLines: string[];
} {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let title = 'Rețetă importată';
  let servings = 4;
  let inIngredients = false;
  const ingredientLines: string[] = [];

  // Încercare de a găsi titlul pe prima linie dacă este scurtă
  if (lines.length > 0 && lines[0].length < 80 && !lines[0].toLowerCase().includes('ingrediente')) {
    title = lines[0].replace(/[🍝🥘🍲🥗🍰🍕🍔❤️🔥✨]/g, '').trim();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const norm = normalizeRecipeText(line);

    // Detectare număr de porții
    const servingsMatch = norm.match(/(\d+)\s*(portii|porții|persoane|portie|porție)/i);
    if (servingsMatch) {
      servings = parseInt(servingsMatch[1], 10) || 4;
    }

    // Marcator de start pentru ingrediente
    if (
      norm.startsWith('ingrediente') ||
      norm.startsWith('ai nevoie de') ||
      norm.startsWith('ce ne trebuie') ||
      norm.startsWith('avem nevoie de') ||
      norm.startsWith('lista ingrediente')
    ) {
      inIngredients = true;
      continue;
    }

    // Marcator de stop pentru ingrediente
    if (
      inIngredients &&
      (norm.startsWith('mod de preparare') ||
        norm.startsWith('instructiuni') ||
        norm.startsWith('preparare') ||
        norm.startsWith('pasi de urmat') ||
        norm.startsWith('metoda') ||
        norm.startsWith('cum se prepara') ||
        norm.startsWith('observatii'))
    ) {
      break;
    }

    if (inIngredients) {
      ingredientLines.push(line);
    } else {
      // Dacă nu există header explicit „Ingrediente”, dar linia are format tipic de listă (bullet sau cantitate la început)
      const isBulletOrCount = /^[-•*▪◦\d]/.test(line);
      if (isBulletOrCount && lines.length <= 30) {
        ingredientLines.push(line);
      }
    }
  }

  // Dacă nu am detectat headerul dar avem linii
  if (ingredientLines.length === 0 && lines.length > 0) {
    for (const line of lines) {
      if (line !== title && !line.toLowerCase().startsWith('mod de preparare')) {
        ingredientLines.push(line);
      }
    }
  }

  return { title, servings, ingredientLines };
}

/**
 * Parsează un text brut de rețetă în ingrediente structurate.
 */
export function parseRecipeFromText(rawText: string): RecipeParseResult {
  const { title, servings, ingredientLines } = extractIngredientsBlock(rawText);

  const ingredients: RecipeIngredient[] = [];
  let index = 0;

  for (const line of ingredientLines) {
    const parsed = parseSingleRecipeIngredient(line, index);
    if (parsed) {
      ingredients.push(parsed);
      index++;
    }
  }

  return {
    title,
    baseServings: servings,
    ingredients,
    rawText,
  };
}

/**
 * Parsează o rețetă folosind Claude 3.5 Haiku (dacă este disponibil),
 * cu fallback automat garantat pe analizatorul local bazat pe reguli.
 */
export async function parseRecipeSmart(
  rawText: string,
  servings = 4
): Promise<RecipeParseResult> {
  const haikuOk = await isHaikuAvailable().catch(() => false);

  if (haikuOk) {
    try {
      const haikuRes = await parseRecipeWithHaiku(rawText, servings);
      if (haikuRes && haikuRes.ingredients.length > 0) {
        const ingredients: RecipeIngredient[] = haikuRes.ingredients.map(
          (ing, idx) => ({
            id: `haiku-ing-${Date.now()}-${idx}`,
            rawLine: `${ing.quantity} ${ing.unit || ''} ${ing.name}`.trim(),
            cleanName: ing.name,
            baseQuantity: ing.quantity,
            unit: ing.unit,
            packageSizeHint: ing.packageSizeHint,
            isPantryStaple: ing.isPantryStaple,
            stapleReason: ing.stapleReason,
            categoryHint: ing.categoryHint,
          })
        );

        return {
          title: haikuRes.recipeTitle || 'Rețetă analizată',
          baseServings: haikuRes.servings || servings,
          ingredients,
          rawText,
          missingSuggestions: haikuRes.missingSuggestions || [],
          dietaryBadges: haikuRes.dietaryBadges || [],
          chefTip: haikuRes.chefTip,
          parsedWithAi: true,
        };
      }
    } catch (err) {
      console.warn('Fallback la parserul local de rețete:', err);
    }
  }

  // Fallback local determinist
  return parseRecipeFromText(rawText);
}

/**
 * Scalează ingredientele în funcție de numărul dorit de porții.
 */
export function scaleRecipeIngredients(
  ingredients: RecipeIngredient[],
  baseServings: number,
  targetServings: number
): RecipeIngredient[] {
  if (baseServings <= 0 || targetServings <= 0 || baseServings === targetServings) {
    return ingredients;
  }

  const factor = targetServings / baseServings;

  return ingredients.map((ing) => {
    let scaledQty = ing.baseQuantity * factor;
    // Rotunjire inteligentă
    if (scaledQty >= 10) {
      scaledQty = Math.round(scaledQty);
    } else if (scaledQty >= 1) {
      scaledQty = Math.round(scaledQty * 2) / 2; // la jumătăți (ex: 1.5, 2.0)
    } else {
      scaledQty = Math.round(scaledQty * 10) / 10;
    }

    return {
      ...ing,
      baseQuantity: Math.max(0.1, scaledQty),
    };
  });
}

/**
 * Convertește ingredientele din rețetă în format ScannedRawItem compatibil
 * cu motorul existent de scanare și potrivire de produse din catalog.
 */
export function recipeIngredientsToScanItems(
  ingredients: RecipeIngredient[]
): ScannedRawItem[] {
  return ingredients.map((ing) => {
    const norm = normalizeRecipeText(ing.cleanName);
    let pkgHint: string | null = ing.packageSizeHint ?? null;
    let qty = 1;

    const grams =
      ing.unit === 'kg'
        ? ing.baseQuantity * 1000
        : ing.unit === 'g'
          ? ing.baseQuantity
          : null;
    const ml =
      ing.unit === 'l'
        ? ing.baseQuantity * 1000
        : ing.unit === 'ml'
          ? ing.baseQuantity
          : null;

    if (/\b(faina|zahar|malai|orez)\b/.test(norm) && !/\bvanil/.test(norm)) {
      pkgHint = '1kg';
      qty = grams && grams > 1000 ? Math.ceil(grams / 1000) : 1;
    } else if (/\b(parmezan|parmigiano|grana|pecorino)\b/.test(norm)) {
      pkgHint = '100g';
      qty = grams && grams > 160 ? Math.ceil(grams / 125) : 1;
    } else if (/\b(spaghete|spaghetti|penne|fusilli|tagliatelle|paste)\b/.test(norm)) {
      pkgHint = '500g';
      qty = grams && grams > 550 ? Math.ceil(grams / 500) : 1;
    } else if (/\bsmantana\b/.test(norm)) {
      if (/\bgatit\b/.test(norm)) {
        pkgHint = ml && ml > 300 ? '500ml' : '200ml';
        qty = ml && ml > 500 ? Math.ceil(ml / 500) : 1;
      } else {
        pkgHint = grams && grams <= 220 ? '200g' : '400g';
        qty = grams && grams > 450 ? Math.ceil(grams / 400) : 1;
      }
    } else if (/\bunt\b/.test(norm) && !/\barahide\b/.test(norm)) {
      pkgHint = '200g';
      qty = grams && grams > 250 ? Math.ceil(grams / 200) : 1;
    } else if (/\botet\b/.test(norm)) {
      pkgHint = '500ml';
      qty = 1;
    } else if (/\bulei\b/.test(norm)) {
      pkgHint = /\bmasline\b/.test(norm) ? '500ml' : '1l';
      qty = 1;
    } else if (/\b(pui|porc|vita|curcan|carne)\b/.test(norm)) {
      pkgHint = '500g';
      qty = grams && grams > 650 ? Math.ceil(grams / 500) : 1;
    } else if (/\bsomon\b/.test(norm)) {
      pkgHint = '250g';
      qty = grams && grams > 300 ? Math.ceil(grams / 250) : 1;
    } else if (/\b(oua|ou)\b/.test(norm)) {
      pkgHint = '10 buc';
      qty = ing.baseQuantity > 10 ? Math.ceil(ing.baseQuantity / 10) : 1;
    } else if (!pkgHint && ing.unit && ['g', 'kg', 'ml', 'l'].includes(ing.unit)) {
      pkgHint = `${ing.baseQuantity} ${ing.unit}`;
    } else if (
      ing.unit === 'buc' ||
      ing.unit === 'legătură' ||
      ing.unit === 'caserolă' ||
      ing.unit === 'cutie'
    ) {
      qty = Math.max(1, Math.round(ing.baseQuantity));
    }

    return {
      rawLine: ing.rawLine,
      name: ing.cleanName,
      quantity: qty,
      unit: ing.unit,
      brandHint: null,
      packageSizeHint: pkgHint,
      confidence: 0.95,
    };
  });
}

/**
 * Extrage informații de rețetă din HTML (folosind Schema.org JSON-LD sau OpenGraph).
 */
export function parseRecipeFromHtml(
  html: string,
  url: string
): RecipeParseResult {
  const domain = extractDomainFromUrl(url);
  let title = `Rețetă de pe ${domain}`;
  let imageUrl: string | null = null;
  let servings = 4;
  const rawIngredients: string[] = [];

  // 1. Căutare JSON-LD Schema: <script type="application/ld+json">...</script>
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const content = match[1].trim();
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];

      for (const item of items) {
        const type = String(item['@type'] ?? '');
        if (type.toLowerCase().includes('recipe')) {
          if (item.name) title = String(item.name).trim();
          if (item.image) {
            if (typeof item.image === 'string') imageUrl = item.image;
            else if (Array.isArray(item.image) && item.image[0]) imageUrl = String(item.image[0]);
            else if (item.image.url) imageUrl = String(item.image.url);
          }
          if (item.recipeYield) {
            const y = String(item.recipeYield);
            const num = parseInt(y, 10);
            if (num > 0) servings = num;
          }
          if (Array.isArray(item.recipeIngredient)) {
            for (const ing of item.recipeIngredient) {
              if (typeof ing === 'string') rawIngredients.push(ing);
            }
          }
          break;
        }
      }
    } catch {
      // Ignoră erorile JSON-LD malformat
    }
  }

  // 2. Fallback la OpenGraph title & image dacă JSON-LD nu a furnizat totul
  if (title.startsWith('Rețetă de pe')) {
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogTitle?.[1]) {
      title = ogTitle[1].replace(/\s*[-|–]\s*(JamilaCuisine|Savori Urbane|Laura Laurentiu).*$/i, '').trim();
    } else {
      const titleTag = html.match(/<title>([^<]+)<\/title>/i);
      if (titleTag?.[1]) {
        title = titleTag[1].replace(/\s*[-|–]\s*(JamilaCuisine|Savori Urbane|Laura Laurentiu).*$/i, '').trim();
      }
    }
  }

  if (!imageUrl) {
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (ogImage?.[1]) {
      imageUrl = ogImage[1];
    }
  }

  // 3. Dacă JSON-LD nu a avut ingrediente, încercăm parsarea textului din HTML
  if (rawIngredients.length === 0) {
    // Curățăm tagurile de script, style etc.
    const textOnly = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');

    const textResult = parseRecipeFromText(textOnly);
    return {
      ...textResult,
      title: title || textResult.title,
      imageUrl,
      sourceUrl: url,
      sourceDomain: domain,
      baseServings: servings || textResult.baseServings,
    };
  }

  const ingredients: RecipeIngredient[] = [];
  rawIngredients.forEach((line, idx) => {
    const ing = parseSingleRecipeIngredient(line, idx);
    if (ing) ingredients.push(ing);
  });

  return {
    title,
    imageUrl,
    sourceUrl: url,
    sourceDomain: domain,
    baseServings: servings,
    ingredients,
    rawText: rawIngredients.join('\n'),
  };
}

/**
 * Preia conținutul rețetei dintr-un URL web și o parsează automat.
 */
export async function fetchAndParseRecipeFromUrl(
  url: string
): Promise<RecipeParseResult> {
  const cleanUrl = url.trim();
  const domain = extractDomainFromUrl(cleanUrl);

  const response = await fetch(cleanUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 BeavyApp/2.0',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Nu am putut accesa pagina rețetei de pe ${domain} (cod HTTP ${response.status}).`
    );
  }

  const html = await response.text();
  const result = parseRecipeFromHtml(html, cleanUrl);

  if (result.ingredients.length === 0) {
    throw new Error(
      `Nu am găsit ingrediente structurate în pagina de pe ${domain}. Poți copia și lipi direct textul ingredientelor!`
    );
  }

  return result;
}

/**
 * Rețete românești predefinite pentru testare și inspirație rapidă cu 1 tap.
 */
export const POPULAR_ROMANIAN_RECIPES = [
  {
    id: 'ciorba-radauteana',
    title: 'Ciorbă Rădăuțeană tradițională',
    servings: 6,
    symbol: 'fork.knife',
    text: `Ingrediente pentru 6 porții:
- 700g piept de pui dezosat
- 2 cepe mari
- 3 morcovi
- 1 rădăcină de țelină
- 400g smântână grasă 20%
- 4 gălbenușuri
- 1 căpățână de usturoi
- 50ml oțet de vin
- 1 legătură de pătrunjel proaspăt
- 2 foi de dafin
- sare și piper după gust
- 3 litri de apă`,
  },
  {
    id: 'paste-pui-ciuperci',
    title: 'Paste cremoase cu pui și ciuperci',
    servings: 4,
    symbol: 'takeoutbag.and.cup.and.straw.fill',
    text: `Ingrediente pentru 4 porții:
- 400g paste penne
- 500g piept de pui
- 300g ciuperci Champignon
- 250ml smântână de gătit
- 80g parmezan ras
- 2 căței de usturoi
- 2 linguri ulei de gătit
- sare și piper după gust`,
  },
  {
    id: 'papanasi-moldovenesti',
    title: 'Papanași moldovenești cu smântână și afine',
    servings: 4,
    symbol: 'cup.and.saucer.fill',
    text: `Ingrediente pentru 4 porții:
- 500g brânză de vaci bine scursă
- 2 ouă mari
- 250g făină albă
- 1 plic zahăr vanilat
- 1 linguriță bicarbonat de sodiu
- 300g smântână fermentată
- 1 borcan dulceață de afine
- ulei pentru prăjit
- un praf de sare`,
  },
];
