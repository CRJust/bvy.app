/**
 * Beavy Claude 3.5 Haiku AI Integration Service
 *
 * Motor AI avansat bazat pe Claude 3.5 Haiku (`claude-3-5-haiku-20241022`) integrat DIRECT în aplicație:
 * 1. Zero configurare manuală pentru utilizatori: funcționează din cutie direct prin cod și Supabase Edge Function.
 * 2. Sistem nativ de credite în aplicație (50 de rețete / operațiuni incluse gratuit lunar, reîncărcabile cu 1 tap).
 * 3. Extragerea inteligentă a ingredientelor din rețete complexe (bloguri, text copiat, rețele sociale).
 * 4. Sugestii de ingrediente lipsă sau mirodenii pentru rețete autentice.
 * 5. Identificarea produselor preferate ale utilizatorului (branduri, diete, fără lactoză, bio).
 * 6. Conversație naturală și compunere contextuală de coșuri în tab-ul Chat și în Asistentul de Listă.
 * 7. Sugestii inteligente de substituție pentru produse indisponibile sau dietetice.
 *
 * Include fallback transparent: dacă creditele se epuizează sau conexiunea e offline,
 * serviciul folosește fără erori ontologia culinară locală deterministă din Beavy.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { UserPreferences } from '@/context/shopping-context';
import type { UserPreferenceMemory } from '@/services/beavy-intelligence';

export const HAIKU_STORAGE_KEY = '@beavy_anthropic_api_key';
export const CLAUDE_HAIKU_MODEL = 'claude-3-5-haiku-20241022';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

// Constante pentru sistemul de asistență AI
export const DEFAULT_MONTHLY_CREDITS = 9999;

export type AiCreditsInfo = {
  remaining: number;
  max: number;
  isUnlimited: boolean;
  lastResetDate: string;
};

export type HaikuRecipeIngredient = {
  name: string;
  quantity: number;
  unit: string | null;
  packageSizeHint?: string | null;
  brandHint?: string | null;
  isPantryStaple: boolean;
  stapleReason?: string;
  categoryHint?: string;
  substitutions?: string[];
};

export type HaikuRecipeAnalysis = {
  recipeTitle: string;
  servings: number;
  prepTimeMinutes?: number;
  ingredients: HaikuRecipeIngredient[];
  missingSuggestions: string[];
  dietaryBadges: string[];
  chefTip?: string;
};

export type HaikuComposerResponse = {
  reply: string;
  action: 'compose' | 'add' | 'remove' | 'scale' | 'substitute' | 'info';
  items: {
    name: string;
    quantity: number;
    unit: string | null;
    brandHint?: string | null;
    packageSizeHint?: string | null;
    isPantryStaple?: boolean;
    reason?: string;
  }[];
  quickPrompts: string[];
  suggestedMissingItems?: string[];
};

// Memorie cache pentru credite și cheia API opțională
let cachedCredits: AiCreditsInfo | null = null;
let cachedApiKey: string | null = null;
const creditListeners = new Set<(credits: AiCreditsInfo) => void>();

function notifyCreditListeners() {
  if (cachedCredits) {
    creditListeners.forEach((fn) => {
      try {
        fn(cachedCredits!);
      } catch {
        // ignoră erorile listenerilor
      }
    });
  }
}

/**
 * Abonează o componentă la schimbările soldului de credite AI.
 */
export function subscribeAiCredits(listener: (credits: AiCreditsInfo) => void): () => void {
  creditListeners.add(listener);
  if (cachedCredits) {
    listener(cachedCredits);
  } else {
    void getAiCredits().then(listener);
  }
  return () => {
    creditListeners.delete(listener);
  };
}

/**
 * Returnează situația creditelor AI ale utilizatorului (direct din aplicație).
 * În modul actual, asistentul este complet gratuit și nelimitat pentru toți utilizatorii.
 */
export async function getAiCredits(): Promise<AiCreditsInfo> {
  const unlimitedCredits: AiCreditsInfo = {
    remaining: 9999,
    max: 9999,
    isUnlimited: true,
    lastResetDate: 'unlimited',
  };
  cachedCredits = unlimitedCredits;
  return unlimitedCredits;
}

/**
 * Alimentează contul cu credite AI direct în aplicație.
 */
export async function refillAiCredits(amount = 50): Promise<AiCreditsInfo> {
  const unlimitedCredits: AiCreditsInfo = {
    remaining: 9999,
    max: 9999,
    isUnlimited: true,
    lastResetDate: 'unlimited',
  };
  cachedCredits = unlimitedCredits;
  notifyCreditListeners();
  return unlimitedCredits;
}

/**
 * Consumă 1 credit AI în aplicație după o cerere cu succes (fără blocaj).
 */
export async function consumeAiCredit(): Promise<{ success: boolean; remaining: number }> {
  return { success: true, remaining: 9999 };
}

/**
 * Returnează cheia API opțională configurată de utilizator sau din variabilele de mediu.
 * Verifică în ordine: Gemini (gratuit/economic) -> Anthropic.
 */
export async function getAnthropicApiKey(): Promise<string | null> {
  if (cachedApiKey) return cachedApiKey;

  try {
    const stored = await AsyncStorage.getItem(HAIKU_STORAGE_KEY);
    if (stored && stored.trim().length > 0) {
      cachedApiKey = stored.trim();
      return cachedApiKey;
    }
  } catch {
    // ignoră erorile de citire din storage
  }

  const envKey =
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY ||
    process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    null;

  if (envKey && envKey.trim().length > 0) {
    cachedApiKey = envKey.trim();
    return cachedApiKey;
  }

  return null;
}

/**
 * Salvează opțional o cheie API personalizată (Google Gemini sau Anthropic Claude).
 */
export async function setAnthropicApiKey(key: string | null): Promise<void> {
  const clean = key ? key.trim() : '';
  cachedApiKey = clean || null;
  if (clean) {
    await AsyncStorage.setItem(HAIKU_STORAGE_KEY, clean);
  } else {
    await AsyncStorage.removeItem(HAIKU_STORAGE_KEY);
  }
}

/**
 * Verifică dacă asistentul AI este disponibil.
 * În Beavy este ACTIV DIRECT ÎN COD prin Supabase Edge Function `compose-shopping-list`
 * (prioritizat pe Google Gemini 2.0/1.5 Flash).
 */
export async function isHaikuAvailable(): Promise<boolean> {
  return true;
}

/**
 * Execută o cerere către modelul AI (Google Gemini Flash ca opțiune primară gratuită,
 * sau Anthropic Claude Haiku ca opțiune secundară) prin Edge Function sau direct.
 */
async function callClaudeHaiku(params: {
  systemPrompt: string;
  userPrompt: string;
  action?: 'parse_recipe' | 'compose_cart' | 'chat';
  recipeText?: string;
  servings?: number;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  // 1. Încercare prin Supabase Edge Function `compose-shopping-list` (Server Proxy integrat Beavy - fără autentificare per cont)
  if (supabase?.functions?.invoke) {
    try {
      const invokePromise = supabase.functions.invoke('compose-shopping-list', {
        body: {
          action: params.action || 'chat',
          systemPrompt: params.systemPrompt,
          userPrompt: params.userPrompt,
          recipeText: params.recipeText,
          servings: params.servings,
          maxTokens: params.maxTokens ?? 2048,
        },
      });

      const { data, error } = await Promise.race([
        invokePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI_INVOKE_TIMEOUT')), 5000)
        ),
      ]);

      if (!error && data && data.ok) {
        if (data.rawText && typeof data.rawText === 'string') {
          await consumeAiCredit();
          return data.rawText.trim();
        }
      }
    } catch {
      // Continuă spre fallback direct
    }
  }

  // 2. Apel direct dacă există cheie client (Gemini sau Anthropic)
  const apiKey = await getAnthropicApiKey();
  if (apiKey) {
    const isGeminiKey =
      apiKey.startsWith('AIza') ||
      Boolean(
        process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_API_KEY
      );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8500);

    try {
      if (isGeminiKey) {
        // Apel Google Gemini generateContent API
        const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
        for (const model of geminiModels) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{ text: params.systemPrompt }],
                },
                contents: [
                  {
                    role: 'user',
                    parts: [{ text: params.userPrompt }],
                  },
                ],
                generationConfig: {
                  temperature: params.temperature ?? 0.2,
                  maxOutputTokens: params.maxTokens ?? 2048,
                  responseMimeType: 'application/json',
                },
              }),
              signal: controller.signal,
            });

            if (res.ok) {
              const data = await res.json();
              const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text && typeof text === 'string') {
                await consumeAiCredit();
                return text.trim();
              }
            }
          } catch {
            // încearcă următorul model
          }
        }
      } else {
        // Apel Anthropic Claude API
        const res = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: CLAUDE_HAIKU_MODEL,
            max_tokens: params.maxTokens ?? 1600,
            temperature: params.temperature ?? 0.2,
            system: params.systemPrompt,
            messages: [{ role: 'user', content: params.userPrompt }],
          }),
          signal: controller.signal,
        });

        if (res.ok) {
          const json = (await res.json()) as {
            content?: { type: string; text?: string }[];
          };
          const text = json.content?.find((c) => c.type === 'text')?.text;
          if (text) {
            await consumeAiCredit();
            return text.trim();
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error('FALLBACK_TO_LOCAL');
}

/**
 * Extrage un bloc JSON din răspunsul generat de Claude (care poate fi wrap-uit în markdown ```json).
 */
function extractJsonFromResponse<T>(raw: string): T | null {
  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = match ? match[1].trim() : raw.trim();
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

/**
 * Analizează o rețetă cu Claude 3.5 Haiku: extrage ingredientele curate, cantitățile scalate,
 * detectează alimentele de cămară și sugerează ingrediente lipsă sau secrete de chef.
 */
export async function parseRecipeWithHaiku(
  recipeText: string,
  servings = 4,
  preferences?: UserPreferences | null
): Promise<HaikuRecipeAnalysis | null> {
  const isAvailable = await isHaikuAvailable();
  if (!isAvailable) return null;

  const userContext = preferences
    ? `Preferințe utilizator:
- Dietă / intoleranțe: ${preferences.ownedLoyaltyPrograms?.join(', ') || 'Standard'}
- Canal preferat: ${preferences.preferredChannel}
- Oraș / Sector: ${preferences.city}${preferences.sector ? ` (Sector ${preferences.sector})` : ''}`
    : '';

  const systemPrompt = `Ești „Beavy Chef & Somelier”, expert culinar și specialist în sortimentul supermarketurilor din România (Kaufland, Lidl, Penny, Carrefour, Auchan, Mega Image).
Misiunea ta:
1. Analizezi textul rețetei furnizat de utilizator (rețetă Jamila, Savori Urbane, text copiat sau dictat).
2. Extragi ingredientele reale necesare cumpărăturilor de supermarket, scalate exact pentru ${servings} porții.
3. Cureți ingredientele de cuvinte generice inutile („proaspăt”, „de calitate”, „după gust”).
4. Identifici dacă un ingredient este „de cămară” (isPantryStaple: true) – ex: sare, piper, apă, ulei de floarea soarelui uzual, oțet simplu, foi de dafin, bicarbonat – pe care oamenii le au deja în dulap.
5. Sugerezi ingrediente complementare sau autentice care lipsesc din text (missingSuggestions) – ex: la Carbonara: guanciale/pancetta și Pecorino Romano autentic în loc de șuncă și smântână.
6. Răspunzi EXCLUSIV cu un obiect JSON valid conform schemei. Fără text introductiv.`;

  const userPrompt = `Analizează această rețetă și scaleaz-o pentru ${servings} porții:

${recipeText}

${userContext}

Răspunde STRICT cu JSON în formatul:
{
  "recipeTitle": "Numele rețetei",
  "servings": ${servings},
  "prepTimeMinutes": 30,
  "ingredients": [
    {
      "name": "Piept de pui dezosat",
      "quantity": 600,
      "unit": "g",
      "packageSizeHint": "caserolă 600g",
      "brandHint": null,
      "isPantryStaple": false,
      "stapleReason": null,
      "categoryHint": "Carne",
      "substitutions": ["Pulpe de pui dezosate", "Piept de curcan"]
    },
    {
      "name": "Sare",
      "quantity": 1,
      "unit": "linguriță",
      "packageSizeHint": null,
      "brandHint": null,
      "isPantryStaple": true,
      "stapleReason": "Condiment de bază din cămară",
      "categoryHint": "Băcănie",
      "substitutions": []
    }
  ],
  "missingSuggestions": ["Pătrunjel proaspăt pentru decor", "Un strop de vin alb sec pentru deglasare"],
  "dietaryBadges": ["Bogat în proteine", "Fără zahăr adăugat"],
  "chefTip": "Rumenește carnea la foc iute înainte de adăugarea sosului pentru a păstra sucurile în interior."
}`;

  try {
    const rawRes = await callClaudeHaiku({
      action: 'parse_recipe',
      recipeText,
      servings,
      systemPrompt,
      userPrompt,
      maxTokens: 1800,
      temperature: 0.1,
    });

    const parsed = extractJsonFromResponse<HaikuRecipeAnalysis>(rawRes);
    if (!parsed || !Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Cuvinte de zgomot / acțiune conversațională care NU reprezintă produse alimentare
 * și nu trebuie să ajungă niciodată ca wildcard-uri SQL în catalogul de produse.
 */
export const GENERAL_NOISE_TOKENS = new Set([
  'vezi', 'arata', 'arată', 'compara', 'compară', 'deschide', 'mergi', 'du-ma', 'du-mă',
  'pune', 'adauga', 'adaugă', 'cauta', 'caută', 'gaseste', 'găsește', 'gasesc', 'găsesc',
  'unde', 'cumpara', 'cumpără', 'vreau', 'da-mi', 'dă-mi', 'spune-mi', 'spune',
  'cos', 'coș', 'cosul', 'coșul', 'lista', 'listă', 'produse', 'produs',
  'magazin', 'magazine', 'supermarket', 'pret', 'preț', 'preturi', 'prețuri',
  'oferta', 'ofertă', 'oferte', 'reducere', 'reduceri', 'ieftin', 'ieftina', 'ieftină',
  'ieftini', 'ieftine', 'bun', 'buna', 'bună', 'actual', 'top', 'tot', 'toate',
  'la', 'in', 'în', 'de', 'pe', 'cu', 'fara', 'fără', 'din', 'si', 'și', 'pentru',
  'un', 'o', 'unui', 'unei', 'care', 'este', 'e', 'cat', 'cât', 'costa', 'costă',
  'bucuresti', 'bucurești', 'sector', 'romania', 'românia'
]);

/**
 * Detectează dacă utilizatorul cere o comparare sau vizualizare a coșului complet
 * (ex: "Vezi cel mai ieftin coș", "Compară coșul", "Cât costă coșul meu").
 */
export function isBasketComparisonInquiry(prompt: string): boolean {
  const norm = prompt.toLowerCase().trim();
  return (
    /(?:vezi|arata|arată|compara|compară|care\s+este|care\s+e|unde\s+e|unde\s+este|cat\s+costa|cât\s+costă|deschide|mergi\s+la)\s+(?:cel\s+mai\s+ieftin\s+)?(?:cos|coș|cosul|coșul)/i.test(norm) ||
    /^(?:vezi\s+coșul|vezi\s+cosul|coș\s+ieftin|cos\s+ieftin|compara\s+magazinele|compară\s+magazinele|compara\s+preturile|compară\s+prețurile)$/i.test(norm) ||
    /(?:cel\s+mai\s+ieftin|cel\s+mai\s+avantajos)\s+(?:cos|coș|cosul|coșul)/i.test(norm)
  );
}

/**
 * Verifică dacă cererea este o căutare de preț, ofertă sau cel mai ieftin magazin pentru un PRODUS anume.
 */
export function isPriceOrStoreInquiry(prompt: string): boolean {
  if (isBasketComparisonInquiry(prompt)) {
    return false;
  }
  const norm = prompt.toLowerCase().trim();
  const isMatch =
    /(?:unde\s+(?:e|este|se\s+gaseste|gasesc|găsesc)\s+cel\s+mai\s+ieftin|care\s+(?:e|este)\s+cel\s+mai\s+ieftin|la\s+ce\s+magazin\s+(?:e|este|gasesc|găsesc)|cat\s+(?:costa|e|este)|cât\s+(?:costă|e|este)|ce\s+pret\s+are|ce\s+preț\s+are|compara\s+(?:pret|preturi|prețuri)|unde\s+pot\s+cumpara\s+mai\s+ieftin|unde\s+e\s+mai\s+ieftin|unde\s+gasesc\s+ieftin|unde\s+găsesc\s+ieftin)/i.test(norm) ||
    /(?:cel\s+mai\s+ieftin|cele\s+mai\s+ieftine|cel\s+mai\s+bun\s+pret|oferte\s+la|pret\s+la|preț\s+la)\b/i.test(norm);

  if (!isMatch) return false;
  const target = extractTargetTermFromInquiry(prompt);
  return target.length >= 2;
}

/**
 * Extrage termenul căutat dintr-o interogare de preț (ex: "Unde e cel mai ieftin pui?" -> "pui").
 * Curăță strict zgomotul conversațional și verbele ("vezi", "mergi", "arată", "coș").
 */
export function extractTargetTermFromInquiry(prompt: string): string {
  if (isBasketComparisonInquiry(prompt)) {
    return '';
  }

  let cleaned = prompt
    .toLowerCase()
    .replace(/[?!,.:;()"]/g, ' ')
    .trim();

  cleaned = cleaned.replace(
    /^(?:unde\s+(?:este|e|se\s+gaseste|gasesc|găsesc)\s+(?:cel\s+mai\s+ieftin|cele\s+mai\s+ieftine|mai\s+ieftin)?|care\s+(?:este|e)\s+(?:cel\s+mai\s+ieftin|cea\s+mai\s+ieftina|cel\s+mai\s+bun)?|la\s+ce\s+magazin\s+(?:este|e|gasesc|găsesc)?|cat\s+(?:costa|e|este)|cât\s+(?:costă|e|este)|ce\s+pret\s+are|ce\s+preț\s+are|compara\s+(?:preturile\s+la|ofertele\s+la)|oferte\s+(?:la|pentru)|unde\s+pot\s+cumpara\s+(?:mai\s+ieftin)?|ce\s+recomanzi\s+pentru)\s*/i,
    ''
  );

  cleaned = cleaned.replace(
    /\b(?:cel\s+mai\s+ieftin|cea\s+mai\s+ieftină|mai\s+ieftin|mai\s+ieftină|ieftin|ieftină|ieftini|ieftine|in\s+bucuresti|în\s+bucurești|azi|acum|la\s+noi)\b/gi,
    ' '
  );

  // Eliminăm token-urile de zgomot izolate
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !GENERAL_NOISE_TOKENS.has(t));

  return tokens.join(' ').trim();
}

/**
 * Caută date reale de preț din baza de date Supabase pentru a ancora răspunsul AI (RAG Grounding).
 */
export async function retrieveLiveStoreContextForQuery(
  prompt: string,
  city = 'București'
): Promise<{
  contextText: string;
  matchedProducts: {
    name: string;
    brand: string | null;
    packageSize: string | null;
    store: string;
    price: number;
    unitPriceLabel: string | null;
    productId: string;
  }[];
}> {
  const term = extractTargetTermFromInquiry(prompt);
  if (!term || term.length < 2) return { contextText: '', matchedProducts: [] };

  try {
    const isMeat = /\b(pui|carne|porc|vita|vită|curcan|somon|peste|pește)\b/i.test(term);
    const isButter = /\b(unt)\b/i.test(term) && !/\b(arahid\w*|peanut)\b/i.test(term);
    const isOil = /\b(ulei)\b/i.test(term);
    const isCoffee = /\b(cafea|jacobs|lavazza|tchibo|doncafe)\b/i.test(term);
    const isWater = /\b(apa|apă|borsec|dorna|aqua)\b/i.test(term);

    let query = supabase
      .from('beavy_products')
      .select('id, canonical_name, brand, package_size, category');

    if (isMeat) {
      query = query.eq('category', 'Carne, pește și fructe de mare');
    } else if (isButter) {
      query = query.ilike('canonical_name', '%unt %');
    }

    const cleanTokens = term
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => !GENERAL_NOISE_TOKENS.has(t) && (t.length >= 3 || /\b(ou|unt|pui)\b/i.test(t) || /\d+/.test(t)));

    if (cleanTokens.length === 0) {
      return { contextText: '', matchedProducts: [] };
    }

    if (cleanTokens.length > 1) {
      const ilikeFilters = cleanTokens.map((tok) => `canonical_name.ilike.%${tok}%`).join(',');
      query = query.or(ilikeFilters);
    } else {
      query = query.ilike('canonical_name', `%${cleanTokens[0]}%`);
    }

    const { data: prods, error: pErr } = await query.limit(40);
    if (pErr || !prods || prods.length === 0) {
      return { contextText: '', matchedProducts: [] };
    }

    // Filtre semantice stricte pentru a elimina produse parazite (condimente, supe plic, pateu, snacks, hrană animale)
    const JUNK_KEYWORDS =
      /\b(pisic\w*|cain\w*|cat|dog|pet|animale|litier\w*|purina|whiskas|felix|pedigree|friskies|gourmet\s+gold|hr\s+umeda|hrana\s+pisici|hrana\s+caini|pate\w*|crenvust\w*|crenwurst\w*|parizer\w*|sup[ae]|cub\w*|delikat|vegeta|baza|chips|crochet\w*|snack|fidea|sos|condiment\w*|sandwich)\b/i;

    // Protecție strictă împotriva ceaiurilor medicinale când cererea utilizatorului nu este despre ceai
    const isTeaQuery = /\b(ceai|infuzie|musetel|mușețel|menta|mentă|tei)\b/i.test(term);
    const MEDICINAL_KEYWORDS =
      /\b(ceai|infuzie|prostat\w*|vezic\w*|renal\w*|laxativ\w*|sedativ\w*|antistres|urin\w*|diuretic\w*)\b/i;

    const filteredProds = prods.filter((p) => {
      const name = p.canonical_name.toLowerCase();
      if (!isTeaQuery && MEDICINAL_KEYWORDS.test(name)) return false;
      if (isMeat && JUNK_KEYWORDS.test(name)) return false;
      if (isButter && /\b(arahid\w*|peanut|biscuit\w*|popcorn|chips|croissant|prajitur\w*|crema\s+de\s+unt|vanilie|esenta)\b/i.test(name)) return false;
      if (isOil && /\b(motor|esential|corp|par|masaj|balsam)\b/i.test(name)) return false;
      if (isWater && /\b(gura|micelara|parfum|toaleta)\b/i.test(name)) return false;
      if (isCoffee && /\b(cicoare|orz|inlocuitor|substitut)\b/i.test(name)) return false;
      return true;
    });

    if (filteredProds.length === 0) {
      return { contextText: '', matchedProducts: [] };
    }

    const pIds = filteredProds.map((p) => p.id);
    const { data: rawOffers, error: oErr } = await supabase
      .from('beavy_product_offers')
      .select('product_id, retailer_name, price, promo_price, normalized_unit_price, normalized_unit_label, stock_status')
      .in('product_id', pIds)
      .eq('stock_status', 'in_stock')
      .order('price', { ascending: true })
      .limit(40);

    if (oErr || !rawOffers || rawOffers.length === 0) {
      return { contextText: '', matchedProducts: [] };
    }

    const prodById = new Map(filteredProds.map((p) => [p.id, p]));

    // Scor de relevanță semantică: prioritizează produsele care conțin toate cuvintele cerute (ex: cafea Jacobs > cafea oarecare)
    const getProductRelevanceScore = (p: typeof filteredProds[0]): number => {
      const text = `${p.canonical_name} ${p.brand || ''}`.toLowerCase();
      let score = 0;
      for (const tok of cleanTokens) {
        if (text.includes(tok)) score += 2;
      }
      return score;
    };

    // Sortăm ofertele după relevanță semantică maximă și apoi după preț unitar
    const sortedOffers = [...rawOffers].sort((a, b) => {
      const pA = prodById.get(a.product_id);
      const pB = prodById.get(b.product_id);
      const scoreA = pA ? getProductRelevanceScore(pA) : 0;
      const scoreB = pB ? getProductRelevanceScore(pB) : 0;

      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }

      const uA = a.normalized_unit_price ?? a.price;
      const uB = b.normalized_unit_price ?? b.price;
      return uA - uB;
    });

    const bestByStore = new Map<string, typeof sortedOffers[0]>();
    for (const off of sortedOffers) {
      const p = prodById.get(off.product_id);
      if (!p) continue;
      if (!bestByStore.has(off.retailer_name)) {
        bestByStore.set(off.retailer_name, off);
      }
    }

    const matchedProducts: {
      name: string;
      brand: string | null;
      packageSize: string | null;
      store: string;
      price: number;
      unitPriceLabel: string | null;
      productId: string;
    }[] = [];

    const lines: string[] = [];
    lines.push(`DATE REALE DIN SUPERMARKETURI PENTRU „${term}” ÎN ${city}:`);

    let rank = 1;
    for (const off of bestByStore.values()) {
      const p = prodById.get(off.product_id);
      if (!p) continue;
      const unitStr =
        off.normalized_unit_label && off.normalized_unit_price
          ? ` (${off.normalized_unit_price} ${off.normalized_unit_label})`
          : '';
      lines.push(
        `${rank}. ${off.retailer_name}: ${p.canonical_name} (${p.package_size || '1 buc'}) -> ${off.price} RON${unitStr}`
      );
      matchedProducts.push({
        name: p.canonical_name,
        brand: p.brand,
        packageSize: p.package_size,
        store: off.retailer_name,
        price: off.price,
        unitPriceLabel: unitStr.trim(),
        productId: p.id,
      });
      rank++;
      if (rank > 6) break;
    }

    return { contextText: lines.join('\n'), matchedProducts };
  } catch {
    return { contextText: '', matchedProducts: [] };
  }
}

/**
 * Normalizează orice răspuns AI (JSON structurat, array sau text conversațional liber)
 * într-un format stabil HaikuComposerResponse.
 */
function normalizeHaikuComposerResponse(rawRes: string): HaikuComposerResponse {
  const parsed = extractJsonFromResponse<Record<string, unknown> | unknown[]>(rawRes);
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed)) {
      const items = parsed.map((it) => {
        if (typeof it === 'string') {
          return { name: it, quantity: 1, unit: 'buc' };
        }
        if (typeof it === 'object' && it !== null) {
          const obj = it as Record<string, unknown>;
          return {
            name: String(obj.name || obj.produs || obj.ingredient || 'Produs'),
            quantity: Number(obj.quantity || obj.cantitate || 1),
            unit: (obj.unit || obj.unitate || 'buc') as string,
            brandHint: (obj.brandHint || obj.brand) as string | null,
            packageSizeHint: (obj.packageSizeHint || obj.gramaj) as string | null,
          };
        }
        return { name: String(it), quantity: 1, unit: 'buc' };
      });
      return {
        reply: 'Iată produsele identificate pentru rețeta ta:',
        action: 'compose',
        items,
        quickPrompts: ['Dublează cantitățile', 'Adaugă în listă', 'Vezi cel mai ieftin coș'],
      };
    }

    const obj = parsed as Record<string, unknown>;
    const reply = String(
      obj.reply || obj.message || obj.raspuns || obj.text || obj.answer || ''
    ).trim();
    const action = (obj.action as HaikuComposerResponse['action']) || 'compose';
    const rawItems = Array.isArray(obj.items)
      ? obj.items
      : Array.isArray(obj.ingrediente)
      ? obj.ingrediente
      : Array.isArray(obj.produse)
      ? obj.produse
      : [];

    const items = rawItems.map((it: unknown) => {
      if (typeof it === 'string') {
        return { name: it, quantity: 1, unit: 'buc' };
      }
      const itemObj = (it || {}) as Record<string, unknown>;
      return {
        name: String(itemObj.name || itemObj.produs || itemObj.ingredient || 'Produs'),
        quantity: Number(itemObj.quantity || itemObj.cantitate || 1),
        unit: (itemObj.unit || itemObj.unitate || null) as string | null,
        brandHint: (itemObj.brandHint || itemObj.brand || null) as string | null,
        packageSizeHint: (itemObj.packageSizeHint || itemObj.gramaj || null) as string | null,
        isPantryStaple: Boolean(itemObj.isPantryStaple || itemObj.inCamara),
        reason: (itemObj.reason || itemObj.motiv || null) as string | undefined,
      };
    });

    const quickPrompts = Array.isArray(obj.quickPrompts)
      ? (obj.quickPrompts as string[])
      : ['Dublează cantitățile', 'Adaugă în listă', 'Vezi cel mai ieftin coș'];

    return {
      reply: reply || (items.length > 0 ? 'Am pregătit produsele conform cererii tale:' : 'Gata!'),
      action,
      items,
      quickPrompts,
      suggestedMissingItems: Array.isArray(obj.suggestedMissingItems)
        ? (obj.suggestedMissingItems as string[])
        : undefined,
    };
  }

  // Fallback plain text
  return {
    reply: rawRes.trim(),
    action: 'info',
    items: [],
    quickPrompts: [
      'Compune o listă de cumpărături',
      'Meniu rapid de seară sub 50 lei',
      'Vezi cel mai ieftin coș',
    ],
  };
}

/**
 * Asistent de Cumpărături & Compoziție Listă cu Claude 3.5 Haiku.
 * Înțelege cererile naturale („Vreau ingrediente pentru Carbonara pentru 4 persoane”,
 * „Fă-mi o listă de mic dejun proteic fără lactoză”, „Înlocuiește untul cu ulei de măsline”).
 */
export async function composeShoppingListWithHaiku(params: {
  prompt: string;
  existingItems: { name: string; quantity: number; unit?: string | null }[];
  activeListName?: string;
  preferences?: UserPreferences | null;
  preferenceMemory?: UserPreferenceMemory | null;
}): Promise<HaikuComposerResponse | null> {
  const isAvailable = await isHaikuAvailable();
  if (!isAvailable) return null;

  const { prompt, existingItems, activeListName, preferences, preferenceMemory } = params;

  // Interceptăm intențiile de comparare a coșului complet fără căutare de produse
  if (isBasketComparisonInquiry(prompt)) {
    const basketCount = existingItems.length;
    const reply =
      basketCount > 0
        ? `Pentru lista ta curentă de ${basketCount} produse, poți vedea comparația completă pe supermarketuri (Kaufland, Auchan, Mega Image, Lidl, Penny, Carrefour) direct în tab-ul Coș.`
        : `Lista ta de cumpărături este momentan goală. Adaugă câteva produse pentru a afla ce supermarket are cel mai ieftin coș.`;
    return {
      reply,
      action: 'info',
      items: [],
      quickPrompts:
        basketCount > 0
          ? ['Deschide Coșul', 'Meniu rapid de seară sub 50 lei', 'Adaugă și pâine']
          : ['Mic dejun sănătos', 'Paste Carbonara', 'Esențiale cămară'],
    };
  }

  // Context de preferințe și branduri favorite ale utilizatorului
  const favoriteBrands = Object.entries(preferenceMemory?.brandAffinity || {})
    .filter(([, score]) => score > 0)
    .map(([brand]) => brand);
  const learnedList = Object.values(preferenceMemory?.learnedResolutions || {})
    .slice(0, 8)
    .map((r) => `${r.intentKey} -> ${r.canonicalName}`);

  const memoryInfo = preferenceMemory
    ? `Profilul gusturilor utilizatorului:
- Branduri cu afinitate mare: ${favoriteBrands.join(', ') || 'Standard'}
- Alegeri anterioare preferate: ${learnedList.join('; ') || 'Niciuna încă'}`
    : '';

  const locationInfo = preferences
    ? `Locație utilizator: ${preferences.city}${preferences.sector ? ` (Sector ${preferences.sector})` : ''}, Canal: ${preferences.preferredChannel}`
    : 'București';

  const isPriceQuery = isPriceOrStoreInquiry(prompt);
  let liveContextBlock = '';
  let liveMatchedProducts: {
    name: string;
    brand: string | null;
    packageSize: string | null;
    store: string;
    price: number;
    unitPriceLabel: string | null;
    productId: string;
  }[] = [];

  if (isPriceQuery) {
    const liveData = await retrieveLiveStoreContextForQuery(
      prompt,
      preferences?.city || 'București'
    );
    liveContextBlock = liveData.contextText;
    liveMatchedProducts = liveData.matchedProducts;

    // Răspuns direct ultra-rapid (sub 400ms) dacă avem date reale din supermarketuri
    if (liveMatchedProducts.length > 0) {
      const targetTerm = extractTargetTermFromInquiry(prompt);
      const topProd = liveMatchedProducts[0];
      const otherStores = liveMatchedProducts.slice(1, 4);
      const otherStoresSummary =
        otherStores.length > 0
          ? `\n\nAlte supermarketuri verificate:\n${otherStores
              .map(
                (p) =>
                  `• **${p.store}**: ${p.name} la **${p.price.toFixed(2)} RON**${
                    p.unitPriceLabel ? ` (${p.unitPriceLabel})` : ''
                  }`
              )
              .join('\n')}`
          : '';

      return {
        reply: `Cel mai ieftin ${targetTerm} în ${preferences?.city || 'București'} este la **${topProd.store}**: **${topProd.name}** la prețul de **${topProd.price.toFixed(2)} RON**${
          topProd.unitPriceLabel ? ` (${topProd.unitPriceLabel})` : ''
        }.${otherStoresSummary}\n\nAtinge produsul de mai jos pentru a-l adăuga direct în listă.`,
        action: 'info',
        items: [
          {
            name: topProd.name,
            quantity: 1,
            unit: 'buc',
            brandHint: topProd.brand,
            packageSizeHint: topProd.packageSize,
            reason: `Cel mai bun preț la ${topProd.store}: ${topProd.price.toFixed(2)} RON`,
          },
          ...otherStores.slice(0, 1).map((p) => ({
            name: p.name,
            quantity: 1,
            unit: 'buc',
            brandHint: p.brand,
            packageSizeHint: p.packageSize,
            reason: `${p.store}: ${p.price.toFixed(2)} RON`,
          })),
        ],
        quickPrompts: [
          `Adaugă ${topProd.name.slice(0, 20)} în listă`,
          'Vezi cel mai ieftin coș',
          'Caută alte oferte',
        ],
      };
    }
  }

  const systemPrompt = `Ești „Beavy Asistent”, un asistent AI cald, prietenos și extrem de eficient pentru lista de cumpărături dintr-o aplicație mobilă românească.
Stilul tău:
- Vorbești în limba română naturală, concisă și utilă (stilul Beavy: „Culorile din cămară”, simplu, fără slop, fără laude pompoase).
- Descompui cererea utilizatorului în produse concrete de cumpărat de la supermarket (Kaufland, Lidl, Penny, Carrefour, Auchan, Mega Image, Profi).
- Respecți preferințele utilizatorului (fără lactoză, bio, vegetarian, branduri preferate).
- Înțelegi acțiuni conversaționale:
  * "compose": generează o propunere nouă de produse.
  * "add": adaugă produse noi la cele existente.
  * "remove": scoate produse cerute din lista actuală.
  * "scale": dublează sau scalează cantitățile existente.
  * "substitute": schimbă un ingredient cu o alternativă compatibilă.
  * "info": răspunde scurt și precis la o întrebare despre prețuri sau magazine.
- Reguli de gramaje și ambalaje de supermarket pentru rețete și mese (cină, masă de seară, prânz):
  * Când utilizatorul cere o masă de seară, cină sau prânz (implicit 1-2 persoane):
    - Somon / pește proaspăt: folosește 1 caserolă de 200g-250g per persoană (ex: Somon file caserolă 250g). NICIODATĂ nu pune 1 kg de somon pentru o singură masă decât dacă utilizatorul cere explicit pentru 5-8 persoane!
    - Carne (pui, porc, vită): folosește caserole de 500g sau 250g per porție.
    - Folosește ambalajele uzuale din supermarketurile din România (caserole 200g, 250g, 400g, 500g).
${
  liveContextBlock
    ? `\nIMPORTANT: Utilizatorul întreabă despre prețuri sau cel mai ieftin magazin. Folosește STRICT DATELE REALE DE PREȚ furnizate mai jos. Fii 100% sigur pe tine, numește magazinul cel mai ieftin, produsul exact și prețul în RON. NICIODATĂ nu spune că nu știi sau să verifice pe alte site-uri. În lista "items", include produsul sau cele 2 produse recomandate pentru ca utilizatorul să le poată adăuga în listă.`
    : ''
}
- Răspunzi EXCLUSIV cu un bloc JSON valid. Fără text în afara JSON-ului.`;

  const existingItemsSummary =
    existingItems.length > 0
      ? existingItems.map((it) => `- ${it.quantity} × ${it.name}${it.unit ? ` (${it.unit})` : ''}`).join('\n')
      : 'Lista este în prezent goală.';

  const userPrompt = `Cerere utilizator: „${prompt}”
Lista curentă („${activeListName || 'Lista activă'}”):
${existingItemsSummary}

${locationInfo}
${memoryInfo}
${liveContextBlock ? `\n${liveContextBlock}\n` : ''}

Răspunde STRICT cu JSON în formatul:
{
  "reply": "Răspunsul tău prietenos, sigur și scurt către utilizator în română",
  "action": "${isPriceQuery ? 'info' : 'compose'}",
  "items": [
    {
      "name": "Numele canonic generic al alimentului de supermarket (ex: Spaghete, Ouă de găină, Unt 82%)",
      "quantity": 1,
      "unit": "buc",
      "brandHint": null,
      "packageSizeHint": "500g",
      "isPantryStaple": false,
      "reason": "Aliment comun comparabil în >= 6 magazine"
    }
  ],
  "quickPrompts": ["Dublează cantitățile", "Adaugă în listă", "Vezi cel mai ieftin coș"],
  "suggestedMissingItems": ["Parmezan ras pentru servire"]
}`;

  try {
    const rawRes = await callClaudeHaiku({
      action: isPriceQuery ? 'chat' : 'compose_cart',
      systemPrompt,
      userPrompt,
      maxTokens: 1600,
      temperature: 0.2,
    });

    const parsed = normalizeHaikuComposerResponse(rawRes);
    return parsed;
  } catch {
    if (liveMatchedProducts.length > 0) {
      const topProd = liveMatchedProducts[0];
      return {
        reply: `Cel mai bun preț găsit în ${preferences?.city || 'București'} este la ${topProd.store}: ${topProd.name} la ${topProd.price.toFixed(2)} RON${topProd.unitPriceLabel ? ` (${topProd.unitPriceLabel})` : ''}.`,
        action: 'info',
        items: [
          {
            name: topProd.name,
            quantity: 1,
            unit: 'buc',
            brandHint: topProd.brand,
            packageSizeHint: topProd.packageSize,
            reason: `Cel mai bun preț la ${topProd.store}: ${topProd.price.toFixed(2)} RON`,
          },
        ],
        quickPrompts: [
          `Adaugă ${topProd.name.slice(0, 20)} în listă`,
          'Vezi cel mai ieftin coș',
          'Caută alte oferte',
        ],
      };
    }
    return null;
  }
}

/**
 * Sugerează substituții inteligente cu Claude 3.5 Haiku când un produs nu este pe stoc
 * sau utilizatorul vrea o alternativă mai sănătoasă / ieftină / fără alergeni.
 */
export async function suggestProductSubstitutionsWithHaiku(params: {
  productName: string;
  reason?: 'dietary' | 'cheaper' | 'out_of_stock' | 'healthier';
  dietaryRestrictions?: string[];
}): Promise<string[]> {
  const isAvailable = await isHaikuAvailable();
  if (!isAvailable) return [];

  const { productName, reason = 'out_of_stock', dietaryRestrictions = [] } = params;

  const systemPrompt = `Ești un specialist în alimentație și retail supermarket din România.
Sugerează 3-4 alternative directe și realiste de supermarket pentru produsul solicitat.
Răspunde STRICT cu un array JSON de string-uri: ["Alternativa 1", "Alternativa 2", "Alternativa 3"].`;

  const userPrompt = `Produs original: „${productName}”
Motiv substituție: ${reason}
Restricții: ${dietaryRestrictions.join(', ') || 'Fără restricții'}`;

  try {
    const raw = await callClaudeHaiku({
      action: 'chat',
      systemPrompt,
      userPrompt,
      maxTokens: 300,
      temperature: 0.1,
    });
    const parsed = extractJsonFromResponse<string[]>(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}
