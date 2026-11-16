/**
 * Beavy AI List Composer Service
 *
 * Motor inteligent de compunere și rafinare conversațională a listei de cumpărături:
 * 1. Înțelege cereri în limbaj natural (meniuri, mese de weekend, ocazii, bugete, diete).
 * 2. Descompune intenția în produse reale de supermarket, scalate și verificate.
 * 3. Se bazează pe catalogul canonic Beavy și pe memoria de preferințe (Stratul 4).
 * 4. Funcționează hibrid: apel către Supabase Edge Function (când e disponibil) cu
 *    fallback complet offline pe ontologia culinară românească.
 */

import type { UserPreferences } from '@/context/shopping-context';
import {
  composeShoppingListWithHaiku,
  isBasketComparisonInquiry,
  isHaikuAvailable,
} from '@/services/beavy-claude-haiku';
import {
  type CatalogIndexProduct,
  type MatchCandidate,
  loadCanonicalCatalogIndex,
  matchExtractedItemsToCatalog,
  matchScannedItemAgainstCatalog,
  type ScannedRawItem,
  type ScannedReviewItem,
  type ScannedTierVariants,
} from '@/services/beavy-list-scanner';
import {
  type UserPreferenceMemory,
  parseShoppingIntent,
} from '@/services/beavy-intelligence';
import { identifyPantryStaple } from '@/services/beavy-recipe-parser';

export type AiComposerItem = {
  id: string;
  rawLine: string;
  name: string;
  quantity: number;
  unit: string | null;
  brandHint: string | null;
  packageSizeHint: string | null;
  isPantryStaple: boolean;
  stapleReason?: string;
  included: boolean;
  catalogProduct: CatalogIndexProduct | null;
  candidates: MatchCandidate[];
  tierVariants?: ScannedTierVariants;
};

export type MissionConstraints = {
  budgetRon: number | null;
  days: number | null;
  servings: number | null;
  maxStores: 1 | 2;
};

export type AiComposerMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  items?: AiComposerItem[];
  quickPrompts?: string[];
  timestamp: string;
  missionConstraints?: MissionConstraints;
};

export type AiComposerContext = {
  activeListName?: string;
  currentBasketItems?: { name: string; quantity: number }[];
  preferences?: UserPreferences | null;
  preferenceMemory?: UserPreferenceMemory | null;
  learnPreferencesEnabled?: boolean;
};

// Sugestii rapide inițiale pentru asistent (Google Studio Standard)
export const INITIAL_AI_PROMPTS = [
  '300 lei, 2 persoane, 5 zile',
  'Vreau să fac paste carbonara pentru 4 persoane',
  'Cină rapidă cu somon sub 60 lei',
  '2 lapte, unt 82%, 10 ouă și banane',
  'Mic dejun sănătos pentru toată săptămâna',
  'Ciorbă de perișoare ca la mama acasă',
];

// Ontologie de rețete și coșuri tematice românești
type PresetBasketTemplate = {
  title: string;
  reply: string;
  items: { name: string; quantity: number; unit?: string; packageHint?: string }[];
  quickPrompts: string[];
};

const TEMPLATE_KNOWLEDGE_BASE: Record<string, PresetBasketTemplate> = {
  carbonara: {
    title: 'Paste Carbonara',
    reply: 'Am pregătit ingredientele clasice pentru 4 porții de paste Carbonara:',
    items: [
      { name: 'Spaghete', quantity: 1, unit: 'pachet', packageHint: '500g' },
      { name: 'Bacon sau Pancetta', quantity: 2, unit: 'pachet', packageHint: '100g' },
      { name: 'Ouă de găină', quantity: 1, unit: 'cofraj', packageHint: '10 buc' },
      { name: 'Parmezan sau Parmigiano', quantity: 1, unit: 'buc', packageHint: '100g' },
      { name: 'Piper negru măcinat', quantity: 1, unit: 'plic', packageHint: '20g' },
      { name: 'Sare fină de bucătărie', quantity: 1, unit: 'cutie', packageHint: '500g' },
    ],
    quickPrompts: ['Fă porțiile pentru 6 persoane', 'Scoate sarea și piperul', 'Adaugă și un vin alb sec'],
  },
  mic_dejun: {
    title: 'Mic dejun sănătos',
    reply: 'Iată o selecție echilibrată pentru un mic dejun nutritiv de săptămână:',
    items: [
      { name: 'Ouă de găină', quantity: 1, unit: 'cofraj', packageHint: '10 buc' },
      { name: 'Iaurt grecesc 10%', quantity: 2, unit: 'buc', packageHint: '400g' },
      { name: 'Fulgi de ovăz', quantity: 1, unit: 'pachet', packageHint: '500g' },
      { name: 'Afine', quantity: 2, unit: 'caserolă', packageHint: '125g' },
      { name: 'Banane', quantity: 1, unit: 'kg', packageHint: '1kg' },
      { name: 'Miere polifloră', quantity: 1, unit: 'borcan', packageHint: '400g' },
      { name: 'Pâine toast', quantity: 1, unit: 'pachet', packageHint: '500g' },
      { name: 'Lapte 1.5%', quantity: 1, unit: 'sticlă', packageHint: '1L' },
    ],
    quickPrompts: ['Schimbă cu lapte fără lactoză', 'Vreau opțiuni fără gluten', 'Adaugă și cafea boabe'],
  },
  ciorba_perisoare: {
    title: 'Ciorbă de perișoare',
    reply: 'Ingrediente complete pentru o ciorbă de perișoare gustoasă (6 porții):',
    items: [
      { name: 'Carne tocată amestec', quantity: 1, unit: 'caserolă', packageHint: '500g' },
      { name: 'Orez bob rotund', quantity: 1, unit: 'pachet', packageHint: '1kg' },
      { name: 'Ouă de găină', quantity: 1, unit: 'cofraj', packageHint: '10 buc' },
      { name: 'Ceapă galbenă', quantity: 1, unit: 'plasă', packageHint: '1kg' },
      { name: 'Morcovi', quantity: 1, unit: 'plasă', packageHint: '1kg' },
      { name: 'Țelină', quantity: 1, unit: 'buc', packageHint: '500g' },
      { name: 'Borș proaspăt', quantity: 1, unit: 'sticlă', packageHint: '1L' },
      { name: 'Leuștean', quantity: 2, unit: 'legătură' },
      { name: 'Smântână 20%', quantity: 1, unit: 'cutie', packageHint: '400g' },
    ],
    quickPrompts: ['Scoate borșul că am deja', 'Adaugă și ardei iute', 'Vreau carne tocată doar de vită'],
  },
  gratar: {
    title: 'Grătar de weekend',
    reply: 'Coș generos de grătar pentru 6 persoane:',
    items: [
      { name: 'Mici tradiționali', quantity: 2, unit: 'caserolă', packageHint: '900g' },
      { name: 'Ceafă de porc feliată', quantity: 1, unit: 'kg', packageHint: '1kg' },
      { name: 'Piept de pui dezosat', quantity: 1, unit: 'caserolă', packageHint: '500g' },
      { name: 'Muștar clasic', quantity: 1, unit: 'borcan', packageHint: '300g' },
      { name: 'Pâine feliată', quantity: 2, unit: 'buc', packageHint: '500g' },
      { name: 'Cărbuni pentru grătar', quantity: 1, unit: 'sac', packageHint: '3kg' },
      { name: 'Roșii', quantity: 1, unit: 'kg', packageHint: '1kg' },
      { name: 'Castraveți', quantity: 1, unit: 'kg', packageHint: '1kg' },
      { name: 'Bere blondă', quantity: 6, unit: 'doză', packageHint: '500ml' },
      { name: 'Apă minerală carbogazoasă', quantity: 2, unit: 'sticlă', packageHint: '2L' },
    ],
    quickPrompts: ['Fără bere și alcool', 'Adaugă și sos de usturoi', 'Vreau și ciuperci pentru grătar'],
  },
  camara_esential: {
    title: 'Esențiale cămară',
    reply: 'Produsele de bază esențiale pentru aprovizionarea casei:',
    items: [
      { name: 'Ulei de floarea-soarelui', quantity: 1, unit: 'sticlă', packageHint: '1L' },
      { name: 'Făină albă superioară', quantity: 1, unit: 'pachet', packageHint: '1kg' },
      { name: 'Zahăr măcinat', quantity: 1, unit: 'pachet', packageHint: '1kg' },
      { name: 'Orez bob rotund', quantity: 1, unit: 'pachet', packageHint: '1kg' },
      { name: 'Mălai grisat', quantity: 1, unit: 'pachet', packageHint: '1kg' },
      { name: 'Paste penne rigate', quantity: 2, unit: 'pachet', packageHint: '500g' },
      { name: 'Sos de roșii passata', quantity: 2, unit: 'cutie', packageHint: '500g' },
      { name: 'Lapte 1.5%', quantity: 2, unit: 'cutie', packageHint: '1L' },
    ],
    quickPrompts: ['Vreau produse bio/organice', 'Adaugă și conserve de ton', 'Scoate zahărul'],
  },
  salata_caesar: {
    title: 'Salată Caesar',
    reply: 'Ingrediente proaspete pentru o salată Caesar completă (4 porții):',
    items: [
      { name: 'Salată verde', quantity: 2, unit: 'buc' },
      { name: 'Piept de pui dezosat', quantity: 1, unit: 'caserolă', packageHint: '500g' },
      { name: 'Sos Caesar', quantity: 1, unit: 'sticlă', packageHint: '250ml' },
      { name: 'Crutoane', quantity: 1, unit: 'pungă', packageHint: '150g' },
      { name: 'Parmezan', quantity: 1, unit: 'buc', packageHint: '100g' },
      { name: 'Roșii cherry', quantity: 1, unit: 'caserolă', packageHint: '250g' },
    ],
    quickPrompts: ['Fără carne / vegetariană', 'Adaugă și lămâie', 'Fă pentru 2 persoane'],
  },
  clatite: {
    title: 'Clătite pufoase',
    reply: 'Tot ce ai nevoie pentru un platou delicios de clătite (15-20 bucăți):',
    items: [
      { name: 'Făină albă superioară', quantity: 1, unit: 'pachet', packageHint: '1kg' },
      { name: 'Ouă de găină', quantity: 1, unit: 'cofraj', packageHint: '10 buc' },
      { name: 'Lapte 1.5%', quantity: 1, unit: 'sticlă', packageHint: '1L' },
      { name: 'Apă minerală carbogazoasă', quantity: 1, unit: 'sticlă', packageHint: '1.5L' },
      { name: 'Dulceață de vișine sau afine', quantity: 1, unit: 'borcan', packageHint: '350g' },
      { name: 'Cremă de ciocolată cu alune', quantity: 1, unit: 'borcan', packageHint: '400g' },
    ],
    quickPrompts: ['Vreau lapte vegetal', 'Fără zahăr adăugat', 'Adaugă și vanilie'],
  },
  ciorba_radauteana: {
    title: 'Ciorbă Rădăuțeană',
    reply: 'Ingrediente tradiționale pentru ciorbă Rădăuțeană (6 porții):',
    items: [
      { name: 'Piept de pui dezosat', quantity: 1, unit: 'caserolă', packageHint: '500g' },
      { name: 'Smântână grasă 20%', quantity: 1, unit: 'cutie', packageHint: '400g' },
      { name: 'Ouă de găină', quantity: 1, unit: 'cofraj', packageHint: '10 buc' },
      { name: 'Usturoi', quantity: 1, unit: 'căpățână' },
      { name: 'Oțet', quantity: 1, unit: 'sticlă', packageHint: '500ml' },
      { name: 'Morcovi', quantity: 1, unit: 'plasă', packageHint: '1kg' },
      { name: 'Țelină', quantity: 1, unit: 'buc', packageHint: '500g' },
      { name: 'Pătrunjel', quantity: 1, unit: 'legătură' },
    ],
    quickPrompts: ['Adaugă și ardei iute', 'Scoate oțetul', 'Scalează pentru 4 persoane'],
  },
  ciorba_vacuta: {
    title: 'Ciorbă de văcuță',
    reply: 'Ingrediente tradiționale pentru o ciorbă de văcuță bogată (6 porții):',
    items: [
      { name: 'Carne de vită pentru gătit', quantity: 1, unit: 'caserolă', packageHint: '500g' },
      { name: 'Morcovi', quantity: 1, unit: 'plasă', packageHint: '1kg' },
      { name: 'Țelină', quantity: 1, unit: 'buc', packageHint: '500g' },
      { name: 'Cartofi albi', quantity: 1, unit: 'plasă', packageHint: '1kg' },
      { name: 'Ceapă galbenă', quantity: 1, unit: 'plasă', packageHint: '1kg' },
      { name: 'Roșii în bulion', quantity: 1, unit: 'conservă', packageHint: '400g' },
      { name: 'Borș proaspăt', quantity: 1, unit: 'sticlă', packageHint: '1L' },
      { name: 'Leuștean', quantity: 1, unit: 'legătură' },
      { name: 'Smântână 20%', quantity: 1, unit: 'cutie', packageHint: '400g' },
    ],
    quickPrompts: ['Scalează pentru 4 persoane', 'Treci pe variantele de buget', 'Scoate borșul că am deja'],
  },
  somon_sparanghel: {
    title: 'Somon la cuptor cu sparanghel',
    reply: 'Ingrediente proaspete la gramaje reale de raft pentru somon la cuptor cu sparanghel:',
    items: [
      { name: 'Somon file proaspăt', quantity: 1, unit: 'caserolă', packageHint: '250g' },
      { name: 'Sparanghel verde', quantity: 1, unit: 'legătură', packageHint: '250g' },
      { name: 'Lămâi', quantity: 1, unit: 'buc' },
      { name: 'Unt 82%', quantity: 1, unit: 'pachet', packageHint: '200g' },
      { name: 'Usturoi', quantity: 1, unit: 'căpățână' },
    ],
    quickPrompts: ['Scalează pentru 4 persoane', 'Scoate untul și pune ulei de măsline', 'Treci pe variantele de buget'],
  },
  guacamole: {
    title: 'Guacamole proaspăt',
    reply: 'Ingrediente pentru guacamole cremos și aromat:',
    items: [
      { name: 'Avocado', quantity: 2, unit: 'buc' },
      { name: 'Roșii', quantity: 2, unit: 'buc' },
      { name: 'Ceapă roșie', quantity: 1, unit: 'buc' },
      { name: 'Lămâi', quantity: 2, unit: 'buc' },
      { name: 'Pătrunjel', quantity: 1, unit: 'legătură' },
      { name: 'Tortilla chips cu sare', quantity: 1, unit: 'pungă', packageHint: '200g' },
    ],
    quickPrompts: ['Adaugă ardei Jalapeno', 'Fă 4 avocado', 'Scoate ceapa'],
  },
  cina_rapida: {
    title: 'Cină rapidă cu somon și legume',
    reply: 'O masă de seară delicioasă, sănătoasă și sățioasă cu somon la tigaie sau cuptor:',
    items: [
      { name: 'Somon file proaspăt', quantity: 1, unit: 'caserolă', packageHint: '250g' },
      { name: 'Broccoli', quantity: 1, unit: 'buc', packageHint: '500g' },
      { name: 'Lămâi', quantity: 1, unit: 'buc' },
      { name: 'Unt 82%', quantity: 1, unit: 'pachet', packageHint: '200g' },
    ],
    quickPrompts: ['Schimbă peștele cu piept de pui', 'Adaugă și orez basmati', 'Fă pentru 4 persoane'],
  },
  plan_5_zile: {
    title: 'Plan 5 zile · 2 persoane',
    reply: 'Am pregătit un coș esențial complet pentru 2 persoane pe 5 zile, optimizat sub 300 lei:',
    items: [
      { name: 'Piept de pui dezosat', quantity: 2, unit: 'caserolă', packageHint: '500g' },
      { name: 'Ouă de găină', quantity: 1, unit: 'cofraj', packageHint: '10 buc' },
      { name: 'Lapte 1.5%', quantity: 2, unit: 'sticlă', packageHint: '1L' },
      { name: 'Iaurt grecesc 10%', quantity: 2, unit: 'cutie', packageHint: '400g' },
      { name: 'Paste făinoase penne', quantity: 1, unit: 'pachet', packageHint: '500g' },
      { name: 'Orez bob rotund', quantity: 1, unit: 'pachet', packageHint: '1kg' },
      { name: 'Sos de roșii passata', quantity: 2, unit: 'cutie', packageHint: '500g' },
      { name: 'Banane', quantity: 1, unit: 'kg', packageHint: '1kg' },
      { name: 'Mere', quantity: 1, unit: 'pungă', packageHint: '1kg' },
      { name: 'Pâine toast', quantity: 1, unit: 'pachet', packageHint: '500g' },
    ],
    quickPrompts: ['Treci pe branduri proprii de buget', 'Adaugă și legume congelate', 'Schimbă puiul cu somon'],
  },
};

export function extractMissionConstraints(text: string): MissionConstraints | undefined {
  const norm = text.toLowerCase();
  const budgetMatch = norm.match(/(?:buget\s*(?:de)?\s*|sub\s*)?(\d+)\s*(?:lei|ron)/i);
  const daysMatch = norm.match(/(\d+)\s*(?:zile|zi)/i);
  const servingsMatch = norm.match(/(\d+)\s*(?:persoane|pers|portii|porții|oameni)/i);
  const maxStoresMatch = norm.match(/(?:max|maxim|cel mult)\s*(\d+)\s*magazine/i);

  if (!budgetMatch && !daysMatch && !servingsMatch && !maxStoresMatch) {
    return undefined;
  }

  const budgetRon = budgetMatch ? parseInt(budgetMatch[1], 10) : null;
  const days = daysMatch ? parseInt(daysMatch[1], 10) : null;
  const servings = servingsMatch ? parseInt(servingsMatch[1], 10) : null;
  const maxStores: 1 | 2 = maxStoresMatch && parseInt(maxStoresMatch[1], 10) === 1 ? 1 : 2;

  return {
    budgetRon,
    days,
    servings,
    maxStores,
  };
}

function normalizeQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[!?.,;:]+$/g, '')
    .trim();
}

/**
 * Rădăcina canonică a cuvintelor din supermarket în limba română
 * Tratează declinările cu articol hotărât și formele de plural:
 * sarea -> sare, piperul -> piper, laptele -> lapte, ouale -> ou, carnea -> carne
 */
export function stemRomanianGroceryWord(word: string): string {
  let w = normalizeQuery(word);
  w = w.replace(/^(?:de|din|cu|fara|fără|si|și|o|un|niste|niște)\s+/, '');

  if (w.endsWith('aua') && w.length > 4) {
    w = w.slice(0, -3) + 'a'; // cafeaua -> cafea
  } else if (w.endsWith('ea') && w.length > 3) {
    w = w.slice(0, -2) + 'e'; // carnea -> carne, berea -> bere
  } else if (w.endsWith('ul') && w.length > 3) {
    w = w.slice(0, -2); // piperul -> piper, untul -> unt, uleiul -> ulei, borsul -> bors
  } else if (w.endsWith('le') && w.length > 3) {
    w = w.slice(0, -2); // ouale -> oua, pastele -> paste, merele -> mere
  } else if (w.endsWith('ii') && w.length > 3) {
    w = w.slice(0, -1); // cartofii -> cartofi, morcovii -> morcovi
  } else if (w.endsWith('a') && w.length > 3 && !w.endsWith('ea')) {
    w = w.slice(0, -1); // ceapa -> ceap, faina -> fain, smantana -> smantan, sarea -> sare
  }
  return w.trim();
}

/**
 * Convertește un array de ScannedReviewItem în AiComposerItem cu recunoaștere staple.
 */
function toAiComposerItems(reviewItems: ScannedReviewItem[]): AiComposerItem[] {
  return reviewItems.map((r) => {
    const itemName = r.editedName || r.rawLine;
    const stapleInfo = identifyPantryStaple(itemName);
    // În chat AI, dacă potrivirea este ambiguă dar există un candidat valid (scor >= 0.52),
    // asociem automat cel mai bun produs din catalog pentru a afișa poză și preț real,
    // excluzând snacks-urile compuse și mărcile proprii exclusive ne-cerute.
    const topCandidate = r.candidates[0];
    const bestProduct =
      r.tierVariants?.common ??
      r.selectedProduct ??
      (topCandidate
        ? topCandidate.product
        : null);

    return {
      id: r.localId,
      rawLine: r.rawLine,
      name: itemName,
      quantity: r.quantity,
      unit: r.unit,
      brandHint: r.brandHint,
      packageSizeHint: r.packageSizeHint,
      isPantryStaple: stapleInfo.isStaple,
      stapleReason: stapleInfo.reason,
      included: !stapleInfo.isStaple, // alimentele de bază (sare, piper, apă) sunt debifate implicit
      catalogProduct: bestProduct,
      candidates: r.candidates,
      tierVariants: r.tierVariants,
    };
  });
}

/**
 * Potrivește în catalogul real Supabase, cu fallback complet garantat fără erori
 * dacă rețeaua sau baza de date nu este disponibilă.
 */
async function safeMatchExtractedItemsToCatalog(
  rawItems: ScannedRawItem[]
): Promise<AiComposerItem[]> {
  if (rawItems.length === 0) return [];

  try {
    const reviewItems = await matchExtractedItemsToCatalog(rawItems);
    return toAiComposerItems(reviewItems);
  } catch {
    // Fallback determinist garantat folosind indexul canonic local
    try {
      const catalog = await loadCanonicalCatalogIndex();
      const reviewItems = rawItems.map((r, idx) =>
        matchScannedItemAgainstCatalog(r, catalog.products, catalog.brands, idx)
      );
      return toAiComposerItems(reviewItems);
    } catch {
      return rawItems.map((r, idx) => {
        const stapleInfo = identifyPantryStaple(r.name);
        return {
          id: `offline-item-${Date.now()}-${idx}`,
          rawLine: r.rawLine,
          name: r.name,
          quantity: r.quantity || 1,
          unit: r.unit || null,
          brandHint: r.brandHint || null,
          packageSizeHint: r.packageSizeHint || null,
          isPantryStaple: stapleInfo.isStaple,
          stapleReason: stapleInfo.reason,
          included: !stapleInfo.isStaple,
          catalogProduct: null,
          candidates: [],
        };
      });
    }
  }
}

/**
 * Identifică șablonul cel mai apropiat din baza locală de cunoștințe
 */
function findTemplateForPrompt(prompt: string): PresetBasketTemplate | null {
  const norm = normalizeQuery(prompt);
  if (norm.includes('carbonara') || (norm.includes('paste') && norm.includes('bacon'))) {
    return TEMPLATE_KNOWLEDGE_BASE.carbonara;
  }
  if (norm.includes('mic dejun') || norm.includes('breakfast') || norm.includes('dimineata')) {
    return TEMPLATE_KNOWLEDGE_BASE.mic_dejun;
  }
  if (norm.includes('perisoare') || norm.includes('perisoara')) {
    return TEMPLATE_KNOWLEDGE_BASE.ciorba_perisoare;
  }
  if (norm.includes('radauteana') || norm.includes('radautiana')) {
    return TEMPLATE_KNOWLEDGE_BASE.ciorba_radauteana;
  }
  if (norm.includes('vacuta') || (norm.includes('ciorba') && norm.includes('vita'))) {
    return TEMPLATE_KNOWLEDGE_BASE.ciorba_vacuta;
  }
  if (norm.includes('somon') && norm.includes('sparanghel')) {
    return TEMPLATE_KNOWLEDGE_BASE.somon_sparanghel;
  }
  if (norm.includes('caesar') || (norm.includes('salata') && norm.includes('pui'))) {
    return TEMPLATE_KNOWLEDGE_BASE.salata_caesar;
  }
  if (norm.includes('clatite') || norm.includes('pancakes')) {
    return TEMPLATE_KNOWLEDGE_BASE.clatite;
  }
  if (norm.includes('guacamole') || norm.includes('avocado')) {
    return TEMPLATE_KNOWLEDGE_BASE.guacamole;
  }
  if (
    norm.includes('somon') ||
    (norm.includes('peste') && (norm.includes('seara') || norm.includes('cina') || norm.includes('masa'))) ||
    norm.includes('cina') ||
    norm.includes('rapid') ||
    norm.includes('sub 40') ||
    norm.includes('sub 50')
  ) {
    return TEMPLATE_KNOWLEDGE_BASE.cina_rapida;
  }
  if (
    norm.includes('5 zile') ||
    (norm.includes('zile') && (norm.includes('persoane') || norm.includes('buget') || norm.includes('lei'))) ||
    norm.includes('300 lei')
  ) {
    return TEMPLATE_KNOWLEDGE_BASE.plan_5_zile;
  }
  if (norm.includes('gratar') || norm.includes('barbeque') || norm.includes('bbq') || norm.includes('mici')) {
    return TEMPLATE_KNOWLEDGE_BASE.gratar;
  }
  if (norm.includes('camara') || norm.includes('baza') || norm.includes('esential') || norm.includes('sub 150')) {
    return TEMPLATE_KNOWLEDGE_BASE.camara_esential;
  }
  return null;
}

const NON_GROCERY_STOP_WORDS = new Set([
  'sterge',
  'șterge',
  'sterge toata lista',
  'șterge toată lista',
  'sterge lista',
  'șterge lista',
  'toata lista',
  'toată lista',
  'lista',
  'scoate',
  'elimina',
  'elimină',
  'curata',
  'curăță',
  'goleste',
  'golește',
  'tot',
  'multumesc',
  'mulțumesc',
  'mersi',
  'salut',
  'buna',
  'bună',
  'ok',
  'bine',
  'super',
  'nimic',
  'anuleaza',
  'anulează',
  'reseteaza',
  'resetează',
  'ce faci',
  'cine esti',
  'cine ești',
  'ajutor',
]);

/**
 * Extrage produse libere dintr-un text nestructurat (ex: "lapte, paine, 2 iaurturi, banane si cafea")
 */
function extractItemsFromFreeText(text: string): ScannedRawItem[] {
  let cleaned = text.trim();

  // Curățăm formulele conversaționale introductive
  cleaned = cleaned.replace(
    /^(?:te\s+rog\s+)?(?:vreau\s+(?:sa\s+iau\s+|sa\s+cumpar\s+)?|mai\s+(?:adauga|adaugă|pune|baga|vreau|ia)|adauga|adaugă|pune|baga|ia|cumpără|cumpara|trece|scrie|cumparam|avem\s+nevoie\s+de)\s+/i,
    ''
  );

  // Separă prin virgule, puncte, conjuncții "și", linii noi
  const parts = cleaned
    .split(/[,;\n\r]|(?:\s+(?:si|și|\+)\s+)/gi)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);

  const rawItems: ScannedRawItem[] = [];

  for (const part of parts) {
    const cleanPart = part
      .replace(/^(?:o\s+|un\s+|niste\s+|niște\s+|de\s+)?/i, '')
      .replace(/\s+(?:daca\s+se\s+poate|te\s+rog)$/i, '')
      .trim();

    const intent = parseShoppingIntent(cleanPart);
    if (!intent.coreQuery || intent.coreQuery.length < 2) continue;

    const normQuery = intent.coreQuery.toLowerCase().trim();
    if (NON_GROCERY_STOP_WORDS.has(normQuery)) continue;

    rawItems.push({
      rawLine: part,
      name: intent.coreQuery,
      quantity: intent.extractedQuantity || 1,
      unit: intent.constraints.packageSizeLabel || null,
      brandHint: intent.brandHint,
      packageSizeHint: intent.constraints.packageSizeLabel,
      confidence: 0.9,
    });
  }

  return rawItems;
}

/**
 * Aplică comenzi conversaționale asupra unei liste existente de produse
 * Ex: "scoate sarea", "dublează cantitățile", "fă pentru 6 persoane", "schimbă X cu Y"
 */
async function applyConversationalRefinement(
  currentItems: AiComposerItem[],
  prompt: string
): Promise<{ updatedItems: AiComposerItem[]; reply: string } | null> {
  const norm = normalizeQuery(prompt);

  // 0. Comandă de golire / curățare completă: "sterge toata lista", "goleste lista", "sterge tot"
  const isClearAll =
    /^(?:sterge|șterge|goleste|golește|curata|curăță|elimina|elimină|anuleaza|anulează)\s+(?:tot|toata\s+lista|toată\s+lista|lista)$/i.test(norm) ||
    /^(?:sterge|șterge|elimina|elimină)\s+tot$/i.test(norm) ||
    /^(?:nu\s+mai\s+vreau\s+nimic|reseteaza|resetează|reset)$/i.test(norm);

  if (isClearAll) {
    return {
      updatedItems: [],
      reply: 'Am șters toate produsele propuse din conversație. Ce altă rețetă sau listă ai dori să compunem?',
    };
  }

  // 0.5 Comandă compusă: "scoate X și pune/adaugă Y" (ex: "Scoate untul și pune ulei de măsline")
  const removeAndAddMatch = norm.match(
    /(?:scoate|sterge|elimina|fara|fără)\s+(.+?)\s+(?:si|și)\s+(?:pune|adauga|adaugă|baga|inlocuieste\s+cu|înlocuiește\s+cu)\s+([^.]+)/i
  );
  if (removeAndAddMatch?.[1] && removeAndAddMatch?.[2]) {
    const oldStem = stemRomanianGroceryWord(removeAndAddMatch[1].trim());
    const newTargetRaw = removeAndAddMatch[2].trim();
    const removedNames: string[] = [];
    const remaining = currentItems.filter((item) => {
      const itemNorm = normalizeQuery(item.name);
      const itemStem = stemRomanianGroceryWord(item.name);
      if (itemNorm.includes(oldStem) || oldStem.includes(itemNorm) || itemStem.includes(oldStem)) {
        removedNames.push(item.name);
        return false;
      }
      return true;
    });
    const addedItems = await safeMatchExtractedItemsToCatalog(
      extractItemsFromFreeText(newTargetRaw)
    );
    const combined = [...remaining, ...addedItems];
    return {
      updatedItems: combined,
      reply: `Am scos ${removedNames.join(', ') || removeAndAddMatch[1].trim()} și am adăugat ${
        addedItems.map((i) => i.name).join(', ') || newTargetRaw
      }:`,
    };
  }

  // 1. Comandă de eliminare: "scoate X", "fara Y", "sterge Z", "scoate sarea și piperul", "scoate borșul că am deja"
  const removeMatch = norm.match(/(?:scoate|sterge|elimina|fara|fără|da\s+la\s+o\s+parte|nu\s+mai\s+pune)\s+([^.]+)/i);
  if (removeMatch?.[1]) {
    const rawTargetsText = removeMatch[1]
      .replace(/\b(?:ca\s+am|deja\s+am|am\s+deja|in\s+casa|din\s+camara|te\s+rog)\b.*/i, '')
      .trim();

    const targetWords = rawTargetsText
      .split(/[,;\n\r]|(?:\s+(?:si|și|\+)\s+)/gi)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2);

    if (targetWords.length > 0) {
      const targetStems = targetWords.map((w) => stemRomanianGroceryWord(w));
      const removedNames: string[] = [];

      const next = currentItems.filter((item) => {
        const itemNorm = normalizeQuery(item.name);
        const itemStem = stemRomanianGroceryWord(item.name);

        const matchesAnyTarget = targetStems.some((stem, idx) => {
          const rawTarget = normalizeQuery(targetWords[idx]);
          return (
            itemNorm.includes(stem) ||
            stem.includes(itemNorm) ||
            itemStem.includes(stem) ||
            stem.includes(itemStem) ||
            itemNorm.includes(rawTarget) ||
            rawTarget.includes(itemNorm)
          );
        });

        if (matchesAnyTarget) {
          removedNames.push(item.name);
          return false;
        }
        return true;
      });

      if (removedNames.length > 0) {
        return {
          updatedItems: next,
          reply: `Am scos ${removedNames.join(', ')} din propunere. Lista conține acum ${next.length} produse:`,
        };
      }
    }
  }

  // 2. Comandă de scalare / porții: "dublează", "înjumătățește", "pentru 6 persoane"
  if (norm.includes('dubleaza') || norm.includes('dublu') || norm.includes('inmulteste cu 2') || norm.includes('de 2 ori')) {
    const next = currentItems.map((item) => ({
      ...item,
      quantity: item.quantity * 2,
    }));
    return {
      updatedItems: next,
      reply: 'Am dublat toate cantitățile pentru o masă mai mare:',
    };
  }

  if (norm.includes('injumatateste') || norm.includes('pe jumatate') || norm.includes('la jumatate')) {
    const next = currentItems.map((item) => ({
      ...item,
      quantity: Math.max(1, Math.round(item.quantity / 2)),
    }));
    return {
      updatedItems: next,
      reply: 'Am înjumătățit cantitățile:',
    };
  }

  const personsMatch = norm.match(
    /(?:scaleaza\s+pentru|scalează\s+pentru|pentru|fa\s+pentru|fă\s+pentru)\s+(\d+)\s*(?:persoane|portii|porții|pers)/i
  );
  if (personsMatch?.[1]) {
    const targetPersons = parseInt(personsMatch[1], 10);
    if (targetPersons > 0 && targetPersons <= 30) {
      const factor = targetPersons / 4;
      const next = currentItems.map((item) => ({
        ...item,
        quantity: Math.max(1, Math.round(item.quantity * factor)),
      }));
      return {
        updatedItems: next,
        reply: `Am recalculat cantitățile pentru ${targetPersons} ${targetPersons === 1 ? 'persoană' : 'persoane'}:`,
      };
    }
  }

  // 2.5 Comandă de optimizare buget / marcă proprie / premium / comun:
  if (
    /(?:treci\s+pe\s+)?variante(?:le)?\s+de\s+buget|varianta\s+economica|mai\s+ieftin\w*|marc[aăi]\s+propri[ei]/i.test(
      norm
    )
  ) {
    const wantPrivateLabel = /marc[aăi]\s+propri[ei]/i.test(norm);
    const next = currentItems.map((item) => {
      if (wantPrivateLabel && item.tierVariants?.privateLabel) {
        return { ...item, catalogProduct: item.tierVariants.privateLabel };
      }
      if (item.tierVariants?.cheaper) {
        return { ...item, catalogProduct: item.tierVariants.cheaper };
      }
      if (item.tierVariants?.privateLabel) {
        return { ...item, catalogProduct: item.tierVariants.privateLabel };
      }
      const candidates = item.candidates ?? [];
      if (candidates.length === 0) return item;
      const sortedByPrice = [...candidates].sort((a, b) => {
        const pa = a.product.min_price ?? Infinity;
        const pb = b.product.min_price ?? Infinity;
        return pa - pb;
      });
      const cheapest = sortedByPrice[0]?.product ?? item.catalogProduct;
      return cheapest ? { ...item, catalogProduct: cheapest } : item;
    });
    return {
      updatedItems: next,
      reply:
        'Am selectat variantele de brand propriu / mai ieftine pentru ingredientele propuse (poți apăsa pe orice produs pentru grila completă de prețuri pe magazine):',
    };
  }

  if (/(?:treci\s+pe\s+)?variante(?:le)?\s+premium|mai\s+premium|calitate\s+superioara/i.test(norm)) {
    const next = currentItems.map((item) => {
      if (item.tierVariants?.premium) {
        return { ...item, catalogProduct: item.tierVariants.premium };
      }
      const candidates = item.candidates ?? [];
      if (candidates.length === 0) return item;
      const sortedByPriceDesc = [...candidates]
        .filter((c) => !c.isUnrequestedPrivateLabel)
        .sort((a, b) => (b.product.min_price ?? 0) - (a.product.min_price ?? 0));
      const prem = sortedByPriceDesc[0]?.product ?? item.catalogProduct;
      return prem ? { ...item, catalogProduct: prem } : item;
    });
    return {
      updatedItems: next,
      reply: 'Am selectat variantele mai premium disponibile în supermarketuri:',
    };
  }

  if (/(?:alimentul\s+comun|varianta\s+comuna|comun\s+in\s+magazine)/i.test(norm)) {
    const next = currentItems.map((item) =>
      item.tierVariants?.common ? { ...item, catalogProduct: item.tierVariants.common } : item
    );
    return {
      updatedItems: next,
      reply: 'Am revenit la alimentele comune prezente în cele mai multe supermarketuri:',
    };
  }

  // 3. Comandă de înlocuire: "schimbă spaghetele cu penne"
  const swapMatch = norm.match(/(?:schimba|schimbă|inlocuieste|înlocuiește)\s+([a-z0-9\s]+?)\s+(?:cu|în|in)\s+([a-z0-9\s]+)/i);
  if (swapMatch?.[1] && swapMatch?.[2]) {
    const oldTarget = stemRomanianGroceryWord(swapMatch[1].trim());
    const newTarget = swapMatch[2].trim();

    let swapped = false;
    let replacementCandidate: AiComposerItem | null = null;
    try {
      const matched = await safeMatchExtractedItemsToCatalog([
        {
          rawLine: newTarget,
          name: newTarget,
          quantity: 1,
          unit: 'buc',
          brandHint: null,
          packageSizeHint: null,
          confidence: 0.9,
        },
      ]);
      replacementCandidate = matched[0] ?? null;
    } catch {
      // fallback silent
    }

    const next = currentItems.map((item) => {
      const itemNorm = normalizeQuery(item.name);
      const itemStem = stemRomanianGroceryWord(item.name);
      if (!swapped && (itemNorm.includes(oldTarget) || itemStem.includes(oldTarget))) {
        swapped = true;
        return {
          ...item,
          name: replacementCandidate?.name ?? (newTarget.charAt(0).toUpperCase() + newTarget.slice(1)),
          catalogProduct: replacementCandidate?.catalogProduct ?? item.catalogProduct,
          candidates: replacementCandidate?.candidates ?? item.candidates,
        };
      }
      return item;
    });

    if (swapped) {
      return {
        updatedItems: next,
        reply: `Am înlocuit ${swapMatch[1].trim()} cu ${newTarget}:`,
      };
    }
  }

  return null;
}

/**
 * Trimite promptul către Supabase Edge Function sau folosește motorul local.
 */
export async function composeShoppingListWithAi(params: {
  prompt: string;
  existingItems?: AiComposerItem[];
  context?: AiComposerContext;
}): Promise<AiComposerMessage> {
  const { prompt, existingItems = [], context } = params;
  const cleanPrompt = prompt.trim();
  const now = new Date().toISOString();

  // Verificăm dacă este o comandă de rafinare asupra listei existente
  if (existingItems.length > 0) {
    const refinement = await applyConversationalRefinement(existingItems, cleanPrompt);
    if (refinement) {
      return {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text: refinement.reply,
        items: refinement.updatedItems,
        quickPrompts: refinement.updatedItems.length > 0
          ? ['Scalează pentru 4 persoane', 'Treci pe variantele de buget', 'Gata, adaugă în listă']
          : INITIAL_AI_PROMPTS.slice(0, 4),
        timestamp: now,
      };
    }
  }

  const normPrompt = normalizeQuery(cleanPrompt);

  // 1. Verificăm dacă este o comandă de ștergere/resetare totală
  const isClearAllIntent =
    /^(?:sterge|șterge|goleste|golește|curata|curăță|elimina|elimină|anuleaza|anulează)\s+(?:tot|toata\s+lista|toată\s+lista|lista)$/i.test(normPrompt) ||
    /^(?:sterge|șterge|elimina|elimină)\s+tot$/i.test(normPrompt) ||
    /^(?:nu\s+mai\s+vreau\s+nimic|reseteaza|resetează|reset)$/i.test(normPrompt);

  if (isClearAllIntent) {
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text:
        existingItems.length > 0
          ? 'Am șters toate produsele propuse din conversație. Ce altă rețetă sau listă ai dori să compunem?'
          : 'Lista de propuneri este deja goală. Ce vrei să gătești sau să cumperi astăzi?',
      items: [],
      quickPrompts: INITIAL_AI_PROMPTS.slice(0, 4),
      timestamp: now,
    };
  }

  // 2. Verificăm dacă utilizatorul adresează formule de politețe (Small Talk)
  const isThanksIntent =
    /^(?:multumesc|mulțumesc|mersi|multam|mulțam|super\s+mersi|multumesc\s+frumos|multumesc\s+mult|ok\s+mersi)$/i.test(normPrompt);

  if (isThanksIntent) {
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: 'Cu mare plăcere! Dacă mai vrei să adaugi ceva sau vrei să compari prețurile din coș, sunt aici.',
      items: existingItems,
      quickPrompts: ['Ce am în listă?', 'Meniu rapid de seară sub 50 lei', 'Mergi la Coș'],
      timestamp: now,
    };
  }

  const isGreetingIntent =
    /^(?:buna|bună|salut|hei|hey|buna\s+ziua|bună\s+ziua|buna\s+dimineata|bună\s+dimineața|buna\s+seara|bună\s+seara|servus|ciao)$/i.test(normPrompt);

  if (isGreetingIntent) {
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: 'Bună! Sunt pregătit să compunem lista de cumpărături. Îmi poți spune o rețetă (ex: „Paste Carbonara”), un meniu sau poți scrie direct produsele de care ai nevoie.',
      items: existingItems,
      quickPrompts: INITIAL_AI_PROMPTS.slice(0, 4),
      timestamp: now,
    };
  }

  const isHelpIntent =
    /^(?:cine\s+esti|cine\s+ești|ce\s+poti\s+sa\s+faci|ce\s+știi\s+să\s+faci|ce\s+stii\s+sa\s+faci|cum\s+functionezi|cum\s+funcționezi|ajutor|help|ce\s+faci)$/i.test(normPrompt);

  if (isHelpIntent) {
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: 'Sunt asistentul inteligent Beavy pentru cumpărături.\n\nPot compune ingrediente complete pentru orice rețetă, optimizez cantitățile, scot automat ce ai deja în cămară și compar prețurile în timp real între supermarketurile partenere (Lidl, Kaufland, Carrefour, Penny, Mega Image, Auchan).',
      items: existingItems,
      quickPrompts: INITIAL_AI_PROMPTS.slice(0, 4),
      timestamp: now,
    };
  }

  // Verificăm dacă utilizatorul cere comparația coșului sau cel mai ieftin coș
  if (isBasketComparisonInquiry(cleanPrompt)) {
    const basket = context?.currentBasketItems ?? [];
    const count = basket.length;
    const reply =
      count > 0
        ? `Pentru lista ta curentă de ${count} produse, poți vedea comparația optimă și cel mai ieftin coș între supermarketuri (Kaufland, Auchan, Mega Image, Lidl, Penny, Carrefour) direct în tab-ul Coș.`
        : `Lista ta de cumpărături este momentan goală. Adaugă câteva produse pentru a afla ce supermarket are cel mai ieftin coș total.`;
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: reply,
      items: [],
      quickPrompts:
        count > 0
          ? ['Deschide Coșul', 'Meniu rapid de seară sub 50 lei', 'Adaugă și pâine']
          : INITIAL_AI_PROMPTS.slice(0, 3),
      timestamp: now,
    };
  }

  // Verificăm dacă utilizatorul întreabă despre lista curentă
  if (
    normPrompt.includes('ce am in lista') ||
    normPrompt.includes('ce este in lista') ||
    normPrompt.includes('arata-mi lista') ||
    normPrompt.includes('ce produse am') ||
    normPrompt.includes('arata lista')
  ) {
    const basket = context?.currentBasketItems ?? [];
    if (basket.length === 0) {
      return {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text: `Lista curentă „${context?.activeListName ?? 'Lista de cumpărături'}” este goală. Ce vrei să gătești sau să cumperi astăzi?`,
        quickPrompts: INITIAL_AI_PROMPTS.slice(0, 3),
        timestamp: now,
      };
    }
    const lines = basket.map((b) => `• ${b.name} (${b.quantity} buc.)`).join('\n');
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: `În lista „${context?.activeListName ?? 'Lista de cumpărături'}” ai ${basket.length} produse active:\n\n${lines}`,
      quickPrompts: [
        'Ce rețetă pot găti cu ce am?',
        'Adaugă și pâine și lapte',
        'Mergi la Coș pentru prețuri',
      ],
      timestamp: now,
    };
  }

  // Verificăm dacă utilizatorul cere comparația coșului sau cel mai ieftin coș
  if (isBasketComparisonInquiry(cleanPrompt)) {
    const basket = context?.currentBasketItems ?? [];
    const count = basket.length;
    const reply =
      count > 0
        ? `Pentru lista ta curentă de ${count} produse, poți vedea comparația optimă și cel mai ieftin coș între supermarketuri (Kaufland, Auchan, Mega Image, Lidl, Penny, Carrefour) direct în tab-ul Coș.`
        : `Lista ta de cumpărături este momentan goală. Adaugă câteva produse pentru a afla ce supermarket are cel mai ieftin coș total.`;
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: reply,
      items: [],
      quickPrompts:
        count > 0
          ? ['Deschide Coșul', 'Meniu rapid de seară sub 50 lei', 'Adaugă și pâine']
          : INITIAL_AI_PROMPTS.slice(0, 3),
      timestamp: now,
    };
  }

  // 0.8 Întrebare directă de preț pe un produs („Unde e cel mai ieftin piept de pui azi?”, „Cât costă somonul?”)
  const productPriceInquiry = normPrompt.match(
    /^(?:unde\s+(?:e|este|gasesc|găsesc)\s+cel\s+mai\s+ieftin[aă]?|cat\s+costa|cât\s+costă|ce\s+pret\s+are|ce\s+preț\s+are)\s+(.+)$/i
  );
  if (productPriceInquiry?.[1] && !isBasketComparisonInquiry(cleanPrompt)) {
    const rawTarget = productPriceInquiry[1]
      .replace(/\b(?:azi|acum|astazi|astăzi|in\s+magazine|la\s+supermarket)\b/gi, '')
      .trim();
    if (rawTarget.length >= 2) {
      const rawExtracted = extractItemsFromFreeText(rawTarget);
      const matched = await safeMatchExtractedItemsToCatalog(
        rawExtracted.length > 0
          ? rawExtracted
          : [
              {
                rawLine: rawTarget,
                name: rawTarget,
                quantity: 1,
                unit: 'buc',
                brandHint: null,
                packageSizeHint: /somon/i.test(rawTarget)
                  ? '250g'
                  : /pui|carne|vita|porc/i.test(rawTarget)
                    ? '500g'
                    : null,
                confidence: 0.92,
              },
            ]
      );
      if (matched.length > 0) {
        return {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          text: `Am găsit ${matched[0].catalogProduct?.canonical_name ?? rawTarget} în catalogul canonic. Apasă pe rândul de mai jos pentru a deschide grila completă de prețuri pe magazine:`,
          items: matched,
          quickPrompts: [
            'Adaugă în listă',
            'Treci pe variantele de buget',
            'Compară coșul în magazine',
          ],
          timestamp: now,
        };
      }
    }
  }

  // 1. Verificăm întâi dacă este o rețetă sau un coș din ontologia locală Beavy (Instant 0-latency execution)
  const template = findTemplateForPrompt(cleanPrompt);
  if (template) {
    // Calculăm scalarea automată a porțiilor dacă utilizatorul a cerut explicit (ex: "pentru 6 persoane")
    const personsMatch = normPrompt.match(
      /(?:pentru|\(|\b)(\d+)\s*(?:persoane|portii|porții|pers)\b/i
    );
    let scaleFactor = 1;
    if (personsMatch?.[1]) {
      const pCount = parseInt(personsMatch[1], 10);
      if (pCount > 0 && pCount <= 30) {
        scaleFactor = pCount / 4; // Baza prestabilită este de 4 porții
      }
    }

    const rawItems: ScannedRawItem[] = template.items.map((it) => ({
      rawLine: it.name,
      name: it.name,
      quantity: Math.max(1, Math.round(it.quantity * scaleFactor)),
      unit: it.unit ?? null,
      brandHint: null,
      packageSizeHint: it.packageHint ?? null,
      confidence: 0.95,
    }));

    const newItems = await safeMatchExtractedItemsToCatalog(rawItems);
    const isAdditionIntent =
      /(?:^|\s)(?:mai\s+)?(?:adauga|adaugă|pune|mai\s+pune|ia\s+si)\b/i.test(normPrompt);
    const shouldCombine = existingItems.length > 0 && isAdditionIntent;
    const combined = shouldCombine ? [...existingItems, ...newItems] : newItems;

    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: template.reply,
      items: combined,
      quickPrompts: template.quickPrompts,
      timestamp: now,
      missionConstraints: extractMissionConstraints(cleanPrompt),
    };
  }

  // Verificăm dacă utilizatorul cere comparația coșului sau cel mai ieftin coș
  if (isBasketComparisonInquiry(cleanPrompt)) {
    const basket = context?.currentBasketItems ?? [];
    const count = basket.length;
    const reply =
      count > 0
        ? `Pentru lista ta curentă de ${count} produse, poți vedea comparația optimă și cel mai ieftin coș între supermarketuri (Kaufland, Auchan, Mega Image, Lidl, Penny, Carrefour) direct în tab-ul Coș.`
        : `Lista ta de cumpărături este momentan goală. Adaugă câteva produse pentru a afla ce supermarket are cel mai ieftin coș total.`;
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: reply,
      items: [],
      quickPrompts:
        count > 0
          ? ['Deschide Coșul', 'Meniu rapid de seară sub 50 lei', 'Adaugă și pâine']
          : INITIAL_AI_PROMPTS.slice(0, 3),
      timestamp: now,
    };
  }

  // 2. Pentru rețete și cereri personalizate noi, apelăm Claude 3.5 Haiku / Gemini cu timeout rapid (5s)
  const haikuOk = await isHaikuAvailable().catch(() => false);
  if (haikuOk) {
    try {
      const haikuRes = await composeShoppingListWithHaiku({
        prompt: cleanPrompt,
        existingItems: existingItems.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
        })),
        activeListName: context?.activeListName,
        preferences: context?.preferences,
        preferenceMemory: context?.preferenceMemory,
      });

      if (haikuRes) {
        if (haikuRes.action === 'info' && Array.isArray(haikuRes.items) && haikuRes.items.length > 0) {
          // Răspuns informativ de preț / magazin ultra-rapid garantat canonic
          const rawItems: ScannedRawItem[] = haikuRes.items.map((it) => ({
            rawLine: it.name,
            name: it.name,
            quantity: it.quantity || 1,
            unit: it.unit || 'buc',
            brandHint: it.brandHint || null,
            packageSizeHint: it.packageSizeHint || null,
            confidence: 0.9,
          }));
          const matchedItems = await safeMatchExtractedItemsToCatalog(rawItems);

          return {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            text: haikuRes.reply || 'Am verificat prețurile din supermarketuri:',
            items: matchedItems,
            quickPrompts: haikuRes.quickPrompts || [
              'Adaugă în listă',
              'Vezi cel mai ieftin coș',
              'Caută alte oferte',
            ],
            timestamp: now,
          };
        }

        if (Array.isArray(haikuRes.items) && haikuRes.items.length > 0) {
          const rawItems: ScannedRawItem[] = haikuRes.items.map((it) => ({
            rawLine: `${it.quantity} ${it.unit || ''} ${it.name}`.trim(),
            name: it.name,
            quantity: it.quantity || 1,
            unit: it.unit || null,
            brandHint: it.brandHint || null,
            packageSizeHint: it.packageSizeHint || null,
            confidence: 0.96,
          }));

          const newItems = await safeMatchExtractedItemsToCatalog(rawItems);
          const shouldCombine =
            existingItems.length > 0 &&
            (haikuRes.action === 'add' ||
              /(?:mai\s+)?(?:adauga|adaugă|pune|mai\s+pune|ia\s+si)\b/i.test(normPrompt));

          const combined = shouldCombine ? [...existingItems, ...newItems] : newItems;

          return {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            text: haikuRes.reply || 'Am structurat produsele conform cererii tale:',
            items: combined,
            quickPrompts: haikuRes.quickPrompts || [
              'Dublează cantitățile',
              'Scoate alimentele de bază',
              'Vezi cel mai ieftin coș',
            ],
            timestamp: now,
          };
        } else if (haikuRes.reply && haikuRes.reply.trim().length > 0) {
          // Răspuns conversațional direct de la asistent
          return {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            text: haikuRes.reply.trim(),
            items: existingItems,
            quickPrompts: haikuRes.quickPrompts || [
              'Compune o listă de cumpărături',
              'Ce pot găti rapid?',
              'Vezi cel mai ieftin coș',
            ],
            timestamp: now,
          };
        }
      }
    } catch (err) {
      console.warn('Fallback de la asistentul AI la motorul local:', err);
    }
  }

  // 3. Fallback determinist local prin extragere liberă de produse din text
  const rawItems = extractItemsFromFreeText(cleanPrompt);
  let assistantReply = '';
  let quickPrompts: string[] = [];

  if (rawItems.length > 0) {
    const count = rawItems.length;
    const productLabel = count === 1 ? '1 produs' : `${count} produse`;
    assistantReply = `Am identificat ${productLabel} din cererea ta:`;
    quickPrompts = ['Dublează cantitățile', 'Adaugă și pâine', 'Scoate alimentele de bază'];
  } else {
    assistantReply =
      'Nu am putut identifica ingrediente exacte. Încearcă să menționezi o rețetă (ex: „Paste Carbonara”) sau o listă de produse separate prin virgulă.';
    quickPrompts = INITIAL_AI_PROMPTS.slice(0, 3);
  }

  // Corelăm cu produsele din catalogul real Supabase (cu fallback sigur offline)
  const newItems = await safeMatchExtractedItemsToCatalog(rawItems);

  // Verificăm dacă utilizatorul a vrut să adauge la lista existentă
  const isAdditionIntent =
    /(?:^|\s)(?:mai\s+)?(?:adauga|adaugă|pune|mai\s+pune|mai\s+vrem|mai\s+vreau|vreau\s+si|ia\s+si|si\s+inca|mai\s+ia)\b/i.test(normPrompt) ||
    (existingItems.length > 0 && /^(?:si|și|\+)\s+/i.test(normPrompt));

  const shouldCombineWithExisting =
    existingItems.length > 0 &&
    (isAdditionIntent || (!template && newItems.length > 0));

  let combinedItems = newItems;
  if (shouldCombineWithExisting) {
    combinedItems = [...existingItems, ...newItems];
    if (isAdditionIntent && newItems.length > 0) {
      assistantReply = `Am adăugat ${newItems.map((i) => i.name).join(', ')} la propunere. Lista conține acum ${combinedItems.length} produse:`;
    }
  }

  return {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    text: assistantReply,
    items: combinedItems,
    quickPrompts,
    timestamp: now,
    missionConstraints: extractMissionConstraints(cleanPrompt),
  };
}
