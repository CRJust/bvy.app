import { CATALOG, PRODUCT_MAP } from '../data/catalog.ts';
import type { CanonicalProduct } from '../types.ts';

function normalizeRo(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.%]+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'de',
  'cu',
  'din',
  'la',
  'in',
  'si',
  'sau',
  'pentru',
  'pe',
  'fara',
  'tip',
  'buc',
  'gr',
]);

function stripRomanianArticle(token: string): string {
  if (token.length <= 4) return token;
  if (token.endsWith('ului')) return token.slice(0, -4);
  if (token.endsWith('ele')) return token.slice(0, -2);
  if (token.endsWith('ul')) return token.slice(0, -2);
  if (token.endsWith('le')) return token.slice(0, -2);
  return token;
}

function hasPhrase(normalizedText: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(normalizedText);
}

const SYMMETRIC_MODIFIERS = [
  'fara lactoza',
  'fara zahar',
  'zero',
  'max',
  'bio',
  'integral',
  'carbogazoasa',
  'plata',
  'twist',
];

const PRIVATE_LABEL_HINTS = [
  'pilos',
  'k-classic',
  'k classic',
  '365',
  'simpl',
  'pouce',
  'hanul boieresc',
  'san fabio',
  'proxi',
  'miil',
  'dacello',
  'ocean sea',
  'combino',
  'bellarom',
  'primadonna',
  'saguaro',
  'marca proprie',
  'buget',
  'econom',
];

export function matchQueryToCanonicalProduct(
  searchQuery: string,
  canonicalHint = '',
  packageSize = '',
  preferBudget = false,
  catalog: CanonicalProduct[] = CATALOG
): CanonicalProduct | null {
  const combined = normalizeRo(`${searchQuery} ${canonicalHint} ${packageSize}`);
  if (!combined) return null;

  // Direct ID check
  if (PRODUCT_MAP[searchQuery]) {
    const direct = PRODUCT_MAP[searchQuery];
    if (preferBudget && direct.economyEquivalentId && PRODUCT_MAP[direct.economyEquivalentId]) {
      return PRODUCT_MAP[direct.economyEquivalentId];
    }
    return direct;
  }

  const tokens = combined
    .split(/\s+/)
    .map(stripRomanianArticle)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  const queryWantsBudget =
    preferBudget || PRIVATE_LABEL_HINTS.some((hint) => combined.includes(hint));

  let bestProduct: CanonicalProduct | null = null;
  let bestScore = -1;

  for (const product of catalog) {
    const prodText = normalizeRo(
      `${product.canonicalName} ${product.brand} ${product.packageSize} ${product.category}`
    );

    let score = 0;

    for (const token of tokens) {
      if (prodText.includes(token)) {
        score += token.length >= 4 ? 4 : 2;
      }
    }

    // Strict symmetric modifier alignment (Nivel 3 rule) with word boundaries
    for (const mod of SYMMETRIC_MODIFIERS) {
      const qHas = hasPhrase(combined, mod);
      const pHas = hasPhrase(prodText, mod);
      if (qHas && pHas) score += 8;
      if (qHas !== pHas) score -= 6;
    }

    // Package size match bonus
    const normPkg = normalizeRo(packageSize);
    const normProdPkg = normalizeRo(product.packageSize);
    if (normPkg && normProdPkg === normPkg) {
      score += 5;
    }

    // Private label vs national brand alignment
    if (queryWantsBudget && product.isPrivateLabel) {
      score += 6;
    } else if (!queryWantsBudget && !product.isPrivateLabel) {
      score += 2;
    }

    // Specific Italian pasta shape & oil type guards
    if (combined.includes('penne') && prodText.includes('spaghetti')) score -= 12;
    if (combined.includes('spaghetti') && prodText.includes('penne')) score -= 12;
    if (combined.includes('masline') && prodText.includes('floarea')) score -= 12;
    if (combined.includes('floarea') && prodText.includes('masline')) score -= 12;

    if (score > bestScore) {
      bestScore = score;
      bestProduct = product;
    }
  }

  if (!bestProduct || bestScore <= 1) return null;

  if (
    preferBudget &&
    bestProduct.economyEquivalentId &&
    PRODUCT_MAP[bestProduct.economyEquivalentId]
  ) {
    return PRODUCT_MAP[bestProduct.economyEquivalentId];
  }

  return bestProduct;
}

export function matchKeywordsToProductIds(
  keywords: string[],
  catalog: CanonicalProduct[] = CATALOG
): string[] {
  const matched = new Set<string>();
  for (const kw of keywords) {
    const normKw = normalizeRo(kw);
    if (!normKw) continue;

    // Direct ID support
    if (PRODUCT_MAP[kw]) {
      matched.add(kw);
      continue;
    }

    const meaningfulTokens = normKw
      .split(/\s+/)
      .map(stripRomanianArticle)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

    if (meaningfulTokens.length === 0) continue;

    for (const prod of catalog) {
      const prodText = normalizeRo(`${prod.canonicalName} ${prod.brand}`);

      // Respect symmetric modifiers when keyword specifies one (e.g. "lapte fara lactoza")
      let modifierMismatch = false;
      for (const mod of SYMMETRIC_MODIFIERS) {
        const kwHas = hasPhrase(normKw, mod);
        const prodHas = hasPhrase(prodText, mod);
        if (kwHas && !prodHas) {
          modifierMismatch = true;
          break;
        }
        // If user says e.g. "lapte fara lactoza" vs generic "unt", only block non-explicit lactose-free when modifier is in kw
        if (!kwHas && prodHas && (mod === 'fara lactoza' || mod === 'fara zahar')) {
          // If keyword mentions the base noun (e.g. "lapte"), don't remove specialized variant unless asked
          if (meaningfulTokens.length >= 1 && normKw !== prodText) {
            modifierMismatch = true;
            break;
          }
        }
      }
      if (modifierMismatch) continue;

      const allTokensMatch = meaningfulTokens.every((tok) => prodText.includes(tok));
      if (prodText.includes(normKw) || allTokensMatch) {
        matched.add(prod.id);
      }
    }
  }
  return Array.from(matched);
}
