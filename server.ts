import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { CATALOG, PRODUCT_MAP } from './src/data/catalog.ts';
import { STORE_MAP } from './src/data/stores.ts';
import type {
  AiIntent,
  AiRecipeItem,
  AiStructuredCard,
  AiSwapItem,
  CanonicalProduct,
} from './src/types.ts';
import {
  matchKeywordsToProductIds,
  matchQueryToCanonicalProduct,
} from './src/utils/aiMatcher.ts';
import { resolveProductForMode } from './src/utils/pricing.ts';
import { refreshSupabaseProducts, searchSupabaseCatalog } from './src/services/supabaseCatalog.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const CATALOG_INDEX_TEXT = CATALOG.map(
  (p) =>
    `- id: "${p.id}" | nume: "${p.canonicalName}" | gramaj: "${p.packageSize}" | categorie: "${p.category}" | marcaProprie: ${p.isPrivateLabel}`
).join('\n');

const SYSTEM_INSTRUCTION = `Ești Beavy AI, asistentul culinar și de cumpărături inteligente din România, conectat la catalogul canonic al celor 9 mari retaileri (Lidl, Kaufland, Carrefour, Auchan, Mega Image, PENNY, Profi, Freshful, Sezamo).

Catalog Canonic Disponibil:
${CATALOG_INDEX_TEXT}

REGULI STRICTE DE COMPORTAMENT:
0. Produse din afara catalogului: dacă un produs cerut nu există în Catalogul Canonic, nu îl înlocui cu altceva. Pune în searchQuery și canonicalHint denumirea de raft (brand, produs, gramaj) și îl căutăm în catalogul extins al magazinelor. Produsele din coș marcate „catalog extins” își păstrează id-ul exact în searchQuery când le schimbi cantitatea.
1. Zero Produse Generice Nevalidate: Nu propune niciodată cantități ireale de casă (ex. „30g parmezan” sau „2 căței de usturoi”). Transformă orice ingredient în ambalaje reale de supermarket din catalog (ex. „Zanetti Parmigiano Reggiano DOP 150g”, „File de somon proaspăt Atlantic 250g”, „Unt de masă 82% 200g”, „Ouă proaspete M 10 buc”).
2. Separarea Ingredientelor din Cămară: Ingredientele de bază (sare, piper, ulei, zahăr, făină, oțet) trebuie marcate cu isPantryStaple: true pentru ca utilizatorul să le poată debifa cu 1 tap dacă le are deja acasă. Ingredientele principale primesc isPantryStaple: false.
3. Echivalare Matematică pe 4 Niveluri:
   - Nivel 1 (Exact): același brand, sortiment, gramaj și % grăsime.
   - Nivel 2 (Twin Canonic): același produs vândut sub denumiri ușor diferite între retaileri (ex. Pepsi Max 2 L <-> Pepsi Zero Zahăr 2 L).
   - Nivel 3 (Echivalent Funcțional): alt brand național cu același gramaj, % grăsime și modificatori simetrici (fără lactoză, fără zahăr, bio, integral, carbogazoasă vs plată). Nu amesteca niciodată lapte standard cu lapte fără lactoză sau penne cu spaghetti.
   - Nivel 4 (Substitut de Buget / Marcă Proprie): Pilos (Lidl), K-Classic (Kaufland), 365 (Mega Image), Simpl / Carrefour Classic (Carrefour), Pouce (Auchan), Hanul Boieresc / San Fabio (PENNY), Proxi (Profi), Miil / Dacello (Sezamo). Nu amesteca niciodată mărci proprii exclusive între magazine! Folosește produse cu marcaProprie: true EXCLUSIV când Mod Economie este activ sau când utilizatorul cere explicit produse de buget / marcă proprie; în Mod Fidel alege exclusiv branduri consacrate (marcaProprie: false).
4. Rafinări Conversaționale: Dacă utilizatorul spune „fă pentru 6 persoane”, „scoate untul”, „schimbă spaghetele cu penne” sau „varianta de buget la Lidl”, modifică lista activă sau coșul curent fără a o lua de la capăt. Returnează lista completă actualizată în items (cu cantitățile ajustate) și pune cuvintele-cheie ale produselor eliminate în removedKeywords.
5. Misiuni de cumpărături cu buget, zile și număr maxim de magazine (ex. „300 lei, două persoane, cinci zile, produse preferate și maximum două magazine”):
   - Extrage câmpurile budgetRon (ex: 300), days (ex: 5), servings (nr. persoane/porții, ex: 2) și maxStores (1 sau 2).
   - Construiește un coș realist pentru zilele și persoanele cerute folosind exclusiv id-uri reale din Catalogul Canonic, astfel încât costul total să se încadreze confortabil în bugetul cerut.
6. Format JSON Obligatoriu:
   - intent: "recipe" (rețetă cu porții), "list_add" (listă dictată, plan săptămânal/multi-zile sau adăugare produse), "list_refine" (modificare/scalare/buget pentru lista activă sau coșul curent) sau "price_query" (întrebare punctuală de preț).
   - title: Titlu clar în română (ex: "Paste Carbonara · 4 porții" sau "Plan 5 zile · 2 persoane").
   - servings: Număr întreg de porții sau persoane (0 dacă nu este specificat).
   - budgetRon: Bugetul maxim în lei (0 dacă nu este specificat).
   - days: Numărul de zile planificate (0 dacă nu este specificat).
   - maxStores: 1 sau 2 (număr maxim de magazine acceptat; implicit 2).
   - replyText: Răspuns scurt și prietenos în română, menționând costul estimat pe porție (pentru rețete) sau încadrarea în buget și cel mai ieftin supermarket.
   - items: Fiecare produs cu searchQuery (ideal id-ul exact sau termenul de căutare), canonicalHint (numele canonic real), quantity (număr de ambalaje întregi), packageSize (ex. "250g", "1 L", "10 buc"), isPantryStaple, budgetAlternativeHint (doar în Mod Economie, altfel "").
   - removedKeywords: listă de cuvinte-cheie pentru produsele eliminate în rafinări (ex. ["unt", "spaghetti"]), altfel [].`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      description: 'Una dintre valorile: "recipe", "list_add", "list_refine", "price_query".',
    },
    title: {
      type: Type.STRING,
      description: 'Denumire rețetă sau listă.',
    },
    servings: {
      type: Type.INTEGER,
      description: 'Numărul de porții sau persoane (0 dacă nu este specificat).',
    },
    budgetRon: {
      type: Type.NUMBER,
      description: 'Bugetul maxim în lei (0 dacă nu este specificat).',
    },
    days: {
      type: Type.INTEGER,
      description: 'Numărul de zile acoperit de listă (0 dacă nu este specificat).',
    },
    maxStores: {
      type: Type.INTEGER,
      description: 'Număr maxim de magazine: 1 sau 2.',
    },
    replyText: {
      type: Type.STRING,
      description: 'Răspuns concis în română cu prețul estimat pe porție și cel mai ieftin magazin.',
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          searchQuery: { type: Type.STRING },
          canonicalHint: { type: Type.STRING },
          quantity: { type: Type.INTEGER },
          packageSize: { type: Type.STRING },
          isPantryStaple: { type: Type.BOOLEAN },
          budgetAlternativeHint: { type: Type.STRING },
        },
        required: [
          'searchQuery',
          'canonicalHint',
          'quantity',
          'packageSize',
          'isPantryStaple',
        ],
      },
    },
    removedKeywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['intent', 'title', 'servings', 'replyText', 'items', 'removedKeywords'],
};

interface RawAiItem {
  searchQuery?: string;
  canonicalHint?: string;
  quantity?: number;
  packageSize?: string;
  isPantryStaple?: boolean;
  budgetAlternativeHint?: string;
}

interface RawAiResponse {
  intent?: string;
  title?: string;
  servings?: number;
  budgetRon?: number;
  days?: number;
  maxStores?: number;
  replyText?: string;
  items?: RawAiItem[];
  removedKeywords?: string[];
}

interface BasketLineInput {
  productId: string;
  quantity: number;
  /** Sent by the app for live-catalog products the server does not know by id. */
  name?: string;
  packageSize?: string;
}

interface ActiveListContextInput {
  title?: string;
  servings?: number;
  items?: Array<{ productId: string; quantity: number; name?: string }>;
}

/** AI items that are not in the everyday catalog and still need a real product. */
interface UnmatchedAiItem {
  searchQuery: string;
  canonicalHint: string;
  packageSize: string;
  quantity: number;
  isPantryStaple: boolean;
}

const MAX_LIVE_LOOKUPS = 6;
const LIVE_LOOKUP_TIMEOUT_MS = 6000;

/** Names typed elsewhere end up inside the prompt: keep them short and free of quotes/newlines. */
function cleanPromptText(value: unknown, maxLength = 120): string {
  return String(value ?? '')
    .replace(/[\r\n"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeForKeyword(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "scoate cheetos" => every meaningful word of the keyword appears in the product name. */
function keywordMatchesName(keyword: string, name: string): boolean {
  const words = normalizeForKeyword(keyword)
    .split(' ')
    .filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  const haystack = normalizeForKeyword(name);
  return words.every((w) => haystack.includes(w));
}

/**
 * Finds real products in the stores' live catalog for AI items the everyday catalog lacks.
 * Only products with at least one verified price are accepted; Mod Fidel skips private labels.
 */
async function resolveUnmatchedFromLiveCatalog(
  unmatched: UnmatchedAiItem[],
  allowPrivateLabel: boolean,
  takenIds: Set<string>
): Promise<{ items: AiRecipeItem[]; products: CanonicalProduct[] }> {
  const items: AiRecipeItem[] = [];
  const products: CanonicalProduct[] = [];
  const seenQueries = new Set<string>();

  const lookups = unmatched.slice(0, MAX_LIVE_LOOKUPS).map(async (raw) => {
    const base = (raw.canonicalHint || raw.searchQuery).trim();
    const key = normalizeForKeyword(base);
    if (!key || seenQueries.has(key)) return null;
    seenQueries.add(key);

    // Full name first, then progressively shorter: AI names are longer than shelf names
    const words = key.split(' ').filter((w) => w.length >= 2);
    const attempts = Array.from(
      new Set([base, words.slice(0, 3).join(' '), words.slice(0, 2).join(' ')].filter(Boolean))
    );
    for (const attempt of attempts) {
      try {
        const results = await searchSupabaseCatalog(attempt, 8);
        const pick = results.find(
          (p) => (p.realOfferCount ?? 0) > 0 && (allowPrivateLabel || !p.isPrivateLabel)
        );
        if (pick) return { raw, pick };
      } catch {
        // Try the next, shorter query
      }
    }
    return null;
  });

  const timeout = new Promise<null[]>((resolve) =>
    setTimeout(() => resolve([]), LIVE_LOOKUP_TIMEOUT_MS)
  );
  const settled = await Promise.race([Promise.all(lookups), timeout]);

  for (const found of settled) {
    if (!found || takenIds.has(found.pick.id)) continue;
    takenIds.add(found.pick.id);
    products.push(found.pick);
    items.push({
      productId: found.pick.id,
      searchQuery: found.raw.searchQuery || found.pick.canonicalName,
      canonicalHint: found.pick.canonicalName,
      quantity: found.raw.quantity,
      packageSize: found.pick.packageSize,
      isPantryStaple: found.raw.isPantryStaple,
      fromLiveCatalog: true,
    });
  }
  return { items, products };
}

function normalizeIntent(val: unknown): AiIntent {
  if (val === 'recipe' || val === 'list_add' || val === 'list_refine' || val === 'price_query') {
    return val;
  }
  return 'list_add';
}

function detectsBudgetPreference(userMessage: string): boolean {
  return /\b(buget|econom|ieftin|marca proprie|marcă proprie|pilos|k-classic|365|simpl|pouce|hanul boieresc|san fabio|proxi|miil|dacello)\b/i.test(
    userMessage
  );
}

function parseRomanianSmallNumber(token: string): number | null {
  const clean = token
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const numeric = Number(clean);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
  const words: Record<string, number> = {
    un: 1,
    una: 1,
    o: 1,
    doi: 2,
    doua: 2,
    trei: 3,
    patru: 4,
    cinci: 5,
    sase: 6,
    sapte: 7,
    opt: 8,
    noua: 9,
    zece: 10,
  };
  return words[clean] ?? null;
}

function extractMissionConstraints(
  raw: RawAiResponse,
  userMessage: string
): {
  budgetRon?: number;
  days?: number;
  maxStores?: 1 | 2;
  inferredServings?: number;
} {
  const rawBudget = Number(raw.budgetRon);
  let budgetRon = Number.isFinite(rawBudget) && rawBudget > 0 ? Math.round(rawBudget * 100) / 100 : undefined;
  if (!budgetRon) {
    const mBudget = userMessage.match(/\b(\d{2,4}(?:[.,]\d{1,2})?)\s*(?:lei|ron)\b/i);
    if (mBudget) {
      const parsed = Number(mBudget[1].replace(',', '.'));
      if (Number.isFinite(parsed) && parsed > 0) budgetRon = parsed;
    }
  }

  const rawDays = Number(raw.days);
  let days = Number.isFinite(rawDays) && rawDays > 0 ? Math.round(rawDays) : undefined;
  if (!days) {
    const mDays = userMessage.match(
      /\b(\d{1,2}|un|o|dou[aă]|doi|trei|patru|cinci|[șs]ase|[șs]apte|opt|nou[aă]|zece)\s*zil[ea]\b/i
    );
    if (mDays) {
      const parsed = parseRomanianSmallNumber(mDays[1]);
      if (parsed) days = parsed;
    }
  }

  let maxStores: 1 | 2 | undefined;
  if (raw.maxStores === 1 || raw.maxStores === 2) {
    maxStores = raw.maxStores;
  }
  if (/\b(?:max(?:im|imum)?|cel\s*mult|doar|intr-?un\s*singur)\s*(?:1|un|o|singur)\s*magazin\b/i.test(userMessage)) {
    maxStores = 1;
  } else if (/\b(?:max(?:im|imum)?|cel\s*mult)\s*(?:2|dou[aă])\s*magazine\b/i.test(userMessage)) {
    maxStores = 2;
  }

  let inferredServings: number | undefined;
  const mPers = userMessage.match(
    /\b(\d{1,2}|dou[aă]|doi|trei|patru|cinci|[șs]ase|[șs]apte)\s*(?:persoane|por[țt]ii|oameni)\b/i
  );
  if (mPers) {
    const parsed = parseRomanianSmallNumber(mPers[1]);
    if (parsed) inferredServings = parsed;
  }

  return { budgetRon, days, maxStores, inferredServings };
}

function buildStructuredCard(
  raw: RawAiResponse,
  userMessage: string,
  currentBasket: BasketLineInput[],
  economyModeFromProfile = false,
  unmatched: UnmatchedAiItem[] = []
): AiStructuredCard {
  const intent = normalizeIntent(raw.intent);
  const preferBudget = economyModeFromProfile || detectsBudgetPreference(userMessage);
  const constraints = extractMissionConstraints(raw, userMessage);

  // Map every item deterministically to a canonical product in CATALOG
  const deduped = new Map<string, AiRecipeItem>();
  const rawItems = Array.isArray(raw.items) ? raw.items : [];

  for (const rawItem of rawItems) {
    if (!rawItem) continue;
    const searchQuery = String(rawItem.searchQuery || '').trim();
    const canonicalHint = String(rawItem.canonicalHint || '').trim();
    const packageSize = String(rawItem.packageSize || '').trim();
    if (!searchQuery && !canonicalHint) continue;
    const requestedQty = Math.max(1, Math.min(24, Math.round(Number(rawItem.quantity) || 1)));

    // A live-catalog product already in the basket, referenced by its exact id
    const liveLine = currentBasket.find(
      (b) =>
        !PRODUCT_MAP[b.productId] &&
        (b.productId === searchQuery || b.productId === canonicalHint)
    );
    if (liveLine) {
      if (!deduped.has(liveLine.productId)) {
        deduped.set(liveLine.productId, {
          productId: liveLine.productId,
          searchQuery: liveLine.productId,
          canonicalHint: liveLine.name || canonicalHint,
          quantity: requestedQty,
          packageSize: liveLine.packageSize || packageSize,
          isPantryStaple: Boolean(rawItem.isPantryStaple),
          fromLiveCatalog: true,
        });
      }
      continue;
    }

    const rawMatched: CanonicalProduct | null = matchQueryToCanonicalProduct(
      searchQuery,
      canonicalHint,
      packageSize,
      preferBudget,
      CATALOG
    );
    if (!rawMatched) {
      // Not an everyday product: looked up afterwards in the stores' live catalog
      unmatched.push({
        searchQuery,
        canonicalHint,
        packageSize,
        quantity: requestedQty,
        isPantryStaple: Boolean(rawItem.isPantryStaple),
      });
      continue;
    }

    // In Mod Fidel (unless user explicitly requested budget/private labels), normalize to consecrated brand
    const matched = preferBudget
      ? rawMatched
      : resolveProductForMode(rawMatched, false, PRODUCT_MAP).resolvedProduct;

    const qty = requestedQty;
    const existing = deduped.get(matched.id);

    if (existing) {
      existing.quantity = Math.min(24, existing.quantity + qty);
    } else {
      deduped.set(matched.id, {
        productId: matched.id,
        searchQuery: searchQuery || matched.id,
        canonicalHint: canonicalHint || matched.canonicalName,
        quantity: qty,
        packageSize: packageSize || matched.packageSize,
        isPantryStaple: Boolean(rawItem.isPantryStaple),
        budgetAlternativeHint: preferBudget
          ? rawItem.budgetAlternativeHint
            ? String(rawItem.budgetAlternativeHint)
            : matched.economyEquivalentId && PRODUCT_MAP[matched.economyEquivalentId]
              ? PRODUCT_MAP[matched.economyEquivalentId].canonicalName
              : undefined
          : undefined,
        reason: packageSize || matched.packageSize,
      });
    }
  }

  const mappedItems = Array.from(deduped.values());
  const mappedItemIds = new Set(mappedItems.map((i) => i.productId));

  const removedKeywords = Array.isArray(raw.removedKeywords)
    ? raw.removedKeywords.map((k) => String(k).trim()).filter(Boolean)
    : [];

  // Removals also reach live-catalog products in the basket, matched by their name
  const liveRemoveIds = currentBasket
    .filter(
      (b) =>
        !PRODUCT_MAP[b.productId] &&
        Boolean(b.name) &&
        removedKeywords.some((k) => keywordMatchesName(k, b.name as string))
    )
    .map((b) => b.productId);
  const matchedRemoveIds = Array.from(
    new Set([...matchKeywordsToProductIds(removedKeywords, CATALOG), ...liveRemoveIds])
  ).filter((id) => !mappedItemIds.has(id));

  // When refining, detect items present in currentBasket that are removed, budget-swapped, or quantity-updated
  const basketIdSet = new Set(currentBasket.map((b) => b.productId));
  const basketMatchedRemovals = matchedRemoveIds.filter((id) => basketIdSet.has(id));
  const swapItems: AiSwapItem[] = [];
  const consumedRemovalIds = new Set<string>();

  if (intent === 'list_refine') {
    // 1. Explicit removals paired with same-category additions become swaps
    if (basketMatchedRemovals.length > 0 && mappedItems.length > 0) {
      for (const remId of basketMatchedRemovals) {
        const remProd = PRODUCT_MAP[remId];
        if (!remProd) continue;

        const candidateTarget = mappedItems.find(
          (m) =>
            !basketIdSet.has(m.productId) &&
            PRODUCT_MAP[m.productId]?.category === remProd.category
        );

        if (candidateTarget && !swapItems.some((s) => s.toProductId === candidateTarget.productId)) {
          const basketLine = currentBasket.find((b) => b.productId === remId);
          swapItems.push({
            fromProductId: remId,
            toProductId: candidateTarget.productId,
            quantity: candidateTarget.quantity || basketLine?.quantity || 1,
          });
          consumedRemovalIds.add(remId);
        }
      }
    }

    // 2. Budget refinements: automatically swap national brand in basket -> its private-label equivalent in mappedItems
    if (preferBudget && mappedItems.length > 0) {
      for (const m of mappedItems) {
        const targetProd = PRODUCT_MAP[m.productId];
        if (!targetProd || !targetProd.isPrivateLabel) continue;
        if (swapItems.some((s) => s.toProductId === m.productId)) continue;

        const nationalInBasket = currentBasket.find((b) => {
          const bProd = PRODUCT_MAP[b.productId];
          return (
            bProd &&
            bProd.economyEquivalentId === m.productId &&
            !consumedRemovalIds.has(b.productId)
          );
        });

        if (nationalInBasket) {
          swapItems.push({
            fromProductId: nationalInBasket.productId,
            toProductId: m.productId,
            quantity: m.quantity || nationalInBasket.quantity,
          });
          consumedRemovalIds.add(nationalInBasket.productId);
        }
      }
    }
  }

  const finalRemoveProductIds = matchedRemoveIds.filter((id) => !consumedRemovalIds.has(id));

  const hasQuantityChangeInBasket =
    intent === 'list_refine' &&
    mappedItems.some((m) => {
      const existing = currentBasket.find((b) => b.productId === m.productId);
      return existing !== undefined && existing.quantity !== m.quantity;
    });

  const hasBasketEdit =
    intent === 'list_refine' &&
    (swapItems.length > 0 ||
      hasQuantityChangeInBasket ||
      finalRemoveProductIds.some((id) => basketIdSet.has(id)));

  const cardType: AiStructuredCard['cardType'] =
    intent === 'recipe' ? 'recipe' : hasBasketEdit ? 'edit' : 'list';

  const rawServings = Math.max(0, Math.round(Number(raw.servings) || 0));

  return {
    intent,
    cardType,
    title: String(raw.title || 'Listă recomandată'),
    servings: rawServings > 0 ? rawServings : (constraints.inferredServings ?? 0),
    budgetRon: constraints.budgetRon,
    days: constraints.days,
    maxStores: constraints.maxStores,
    items: mappedItems,
    removedKeywords,
    removeProductIds: finalRemoveProductIds,
    swapItems,
    replaceExistingQuantities: intent === 'list_refine',
  };
}

function buildSanitizedChatHistory(
  history: Array<{ role: string; text: string }>
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const cleaned: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const turn of history.slice(-10)) {
    if (!turn || typeof turn.text !== 'string' || !turn.text.trim()) continue;
    const role: 'user' | 'model' = turn.role === 'user' ? 'user' : 'model';

    // Gemini multi-turn history must start with a user turn and alternate user/model
    if (cleaned.length === 0 && role !== 'user') continue;

    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === role) {
      prev.parts[0].text += `\n${turn.text.trim()}`;
    } else {
      cleaned.push({ role, parts: [{ text: turn.text.trim() }] });
    }
  }

  // Ensure history ends on a 'model' turn so the upcoming sendMessage('user') alternates cleanly
  if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === 'user') {
    cleaned.pop();
  }

  return cleaned;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, catalogCount: CATALOG.length, storeCount: Object.keys(STORE_MAP).length });
  });

  app.get('/api/catalog/search', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      if (!q) {
        res.json({ products: [], total: 0 });
        return;
      }
      const products = await searchSupabaseCatalog(q, limit);
      res.json({ products, total: products.length });
    } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ error: 'Eroare la căutarea în catalog' });
    }
  });

  // Product photos from retailer CDNs: fallback when the browser cannot load them directly
  // (hotlink protection, blocked referrers). Allow-listed hosts only, https only, images only.
  const IMAGE_HOST_SUFFIXES = [
    'bolt.eu',
    'freshful.ro',
    'wolt.com',
    'sezamo.ro',
    'mega-image.ro',
    'vteximg.com.br',
    'carrefour.ro',
    'schwarz',
    'kaufland.com',
    'lidl.ro',
    'commercetools.com',
  ];
  app.get('/api/img', async (req, res) => {
    try {
      const raw = String(req.query.u || '');
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      const allowed =
        url.protocol === 'https:' &&
        IMAGE_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
      if (!allowed) {
        res.status(400).end();
        return;
      }
      const upstream = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        },
      });
      const type = upstream.headers.get('content-type') || '';
      if (!upstream.ok || !type.startsWith('image/')) {
        res.status(404).end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length > 5 * 1024 * 1024) {
        res.status(413).end();
        return;
      }
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch {
      res.status(404).end();
    }
  });

  // Fresh offers for live-catalog products already saved in a basket
  app.post('/api/catalog/refresh', async (req, res) => {
    try {
      const rawIds: unknown = req.body?.ids;
      const ids = Array.isArray(rawIds)
        ? rawIds.filter((id): id is string => typeof id === 'string').slice(0, 60)
        : [];
      const products = ids.length > 0 ? await refreshSupabaseProducts(ids) : [];
      res.json({ products, total: products.length });
    } catch (err) {
      console.error('Refresh error:', err);
      res.status(500).json({ error: 'Eroare la actualizarea prețurilor' });
    }
  });

  app.post('/api/ai-basket', async (req, res) => {
    const {
      message,
      history = [],
      currentBasket = [],
      activeAiList = null,
      userProfile = null,
    }: {
      message?: string;
      history?: Array<{ role: string; text: string }>;
      currentBasket?: BasketLineInput[];
      activeAiList?: ActiveListContextInput | null;
      userProfile?: {
        city?: string;
        householdSize?: number;
        dietaryPreferences?: string[];
        budgetRon?: number | null;
        maxStores?: 1 | 2;
        economyMode?: boolean;
      } | null;
    } = req.body ?? {};

    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'Te rugăm să introduci un mesaj pentru asistent.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error:
          'Cheia GEMINI_API_KEY nu este configurată pe server. Configureaz-o în panoul Secrets pentru a activa asistentul AI.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Everyday products are known by id; live-catalog products come with the name the app shows
    const sanitizedBasket: BasketLineInput[] = Array.isArray(currentBasket)
      ? currentBasket
          .filter(
            (item) =>
              item &&
              typeof item.productId === 'string' &&
              Number(item.quantity) > 0 &&
              (Boolean(PRODUCT_MAP[item.productId]) || cleanPromptText(item.name).length > 0)
          )
          .slice(0, 80)
          .map((item) => ({
            productId: cleanPromptText(item.productId, 64),
            quantity: Number(item.quantity),
            name: cleanPromptText(item.name) || undefined,
            packageSize: cleanPromptText(item.packageSize, 24) || undefined,
          }))
      : [];

    const basketContext =
      sanitizedBasket.length > 0
        ? sanitizedBasket
            .map((item) => {
              const prod = PRODUCT_MAP[item.productId];
              if (prod) return `${item.quantity}x ${prod.canonicalName} (id: ${prod.id})`;
              return `${item.quantity}x ${item.name}${item.packageSize ? ` ${item.packageSize}` : ''} (id: ${item.productId}, catalog extins)`;
            })
            .join(', ')
        : 'Coș gol momentan';

    const activeListContext =
      activeAiList && Array.isArray(activeAiList.items) && activeAiList.items.length > 0
        ? `${activeAiList.title || 'Listă activă'} (${activeAiList.servings || 0} porții): ` +
          activeAiList.items
            .map((it) => {
              const prod = PRODUCT_MAP[it.productId];
              if (prod) return `${it.quantity}x ${prod.canonicalName} (id: ${prod.id})`;
              const liveName = cleanPromptText(it.name);
              return liveName
                ? `${it.quantity}x ${liveName} (id: ${cleanPromptText(it.productId, 64)}, catalog extins)`
                : null;
            })
            .filter(Boolean)
            .join(', ')
        : 'Nicio listă AI anterioară activă';

    const chatHistory = Array.isArray(history) ? buildSanitizedChatHistory(history) : [];

    const profileParts: string[] = [];
    if (userProfile) {
      if (userProfile.city) profileParts.push(`Oraș: ${userProfile.city}`);
      if (typeof userProfile.householdSize === 'number' && userProfile.householdSize > 0) {
        profileParts.push(`Gospodărie: ${userProfile.householdSize} persoane`);
      }
      if (typeof userProfile.budgetRon === 'number' && userProfile.budgetRon > 0) {
        profileParts.push(`Buget implicit: ${userProfile.budgetRon} lei`);
      }
      if (userProfile.maxStores === 1 || userProfile.maxStores === 2) {
        profileParts.push(`Max magazine: ${userProfile.maxStores}`);
      }
      if (typeof userProfile.economyMode === 'boolean') {
        profileParts.push(
          `Mod cumpărături: ${
            userProfile.economyMode
              ? 'Mod Economie (permite mărci proprii echivalente)'
              : 'Mod Fidel (exclusiv branduri consacrate, fără mărci proprii)'
          }`
        );
      }
      if (Array.isArray(userProfile.dietaryPreferences) && userProfile.dietaryPreferences.length > 0) {
        profileParts.push(`Preferințe alimentare: ${userProfile.dietaryPreferences.join(', ')}`);
      }
    }
    const profileContext = profileParts.length > 0 ? profileParts.join(' | ') : 'Standard';

    const turnPrompt = `Preferințe profil utilizator: ${profileContext}
Context coș live al utilizatorului: ${basketContext}
Lista AI activă din conversație: ${activeListContext}
Cererea curentă a utilizatorului: "${message.trim()}"`;

    try {
      const chat = ai.chats.create({
        model: 'gemini-4-hydrogen',
        history: chatHistory,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      const response = await chat.sendMessage({
        message: turnPrompt,
      });

      const rawText = (response.text ?? '{}')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '');

      const parsed = JSON.parse(rawText) as RawAiResponse;
      const unmatched: UnmatchedAiItem[] = [];
      const card = buildStructuredCard(
        parsed,
        message.trim(),
        sanitizedBasket,
        Boolean(userProfile?.economyMode),
        unmatched
      );

      // Ingredients outside the everyday catalog: find a real, priced product in the live catalog
      if (unmatched.length > 0) {
        const allowPrivateLabel =
          Boolean(userProfile?.economyMode) || detectsBudgetPreference(message);
        const live = await resolveUnmatchedFromLiveCatalog(
          unmatched,
          allowPrivateLabel,
          new Set(card.items.map((item) => item.productId))
        );
        if (live.items.length > 0) {
          card.items.push(...live.items);
          card.liveProducts = live.products;
        }
      }

      res.json({
        replyText: String(
          parsed.replyText ||
            'Am pregătit propunerea de cumpărături cu produsele potrivite din catalogul canonic Beavy.'
        ),
        card,
      });
    } catch (err: unknown) {
      const messageText = err instanceof Error ? err.message : String(err);
      console.error('Gemini API error in /api/ai-basket:', messageText);

      if (
        messageText.includes('PERMISSION_DENIED') ||
        messageText.includes('API_KEY_INVALID') ||
        messageText.includes('API key')
      ) {
        res.status(403).json({
          error:
            'Cheia GEMINI_API_KEY nu are permisiuni valide. Verifică configurarea din Settings > Secrets.',
        });
        return;
      }
      if (messageText.includes('RESOURCE_EXHAUSTED') || messageText.includes('429')) {
        res.status(429).json({
          error:
            'Limita de solicitări Gemini API a fost atinsă temporar. Reîncearcă în câteva secunde.',
        });
        return;
      }
      res.status(502).json({
        error: 'Asistentul AI nu a putut procesa cererea momentan. Reîncearcă în câteva secunde.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Beavy server listening on http://localhost:${PORT}`);
  });
}

createServer();
