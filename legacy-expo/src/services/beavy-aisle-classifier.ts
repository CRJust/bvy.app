import type { ShoppingItem } from '@/context/shopping-context';

export type AisleGroup = {
  id: string;
  name: string;
  step: number;
  iconSymbol: string;
  fallbackIcon: string;
  items: ShoppingItem[];
};

export type AisleDefinition = {
  id: string;
  name: string;
  step: number;
  iconSymbol: string;
  fallbackIcon: string;
  pattern: RegExp;
};

export const AISLE_DEFINITIONS: Record<string, AisleDefinition> = {
  'fructe-legume': {
    id: 'fructe-legume',
    name: 'Legume & Fructe',
    step: 1,
    iconSymbol: 'leaf.fill',
    fallbackIcon: '•',
    pattern:
      /\b(rosii|rosie|castravet\w*|ceap\w*|cepe\b|cartof\w*|morcov\w*|ardei\w*|salata|spanac|usturoi|varza|mere|mar\b|banan\w*|lamai\w*|portocal\w*|mandarin\w*|clementin\w*|capsun\w*|strugur\w*|ciuperc\w*|patrunjel|marar|leustean|avocado|dovlecel|dovlecei|vanata|vinete|broccoli|conopida|telina|praz|ridich\w*|sfecla|afine|zmeura|pere|para\b|piersic\w*|caise|caisa|pepene|pepeni|prune|pruna|grapefruit|pomelo|rodie|rodii|kiwi|mango|ananas|ghimbir|legume|fructe|verdeturi|ierburi)\b/i,
  },
  brutarie: {
    id: 'brutarie',
    name: 'Brutărie & Panificație',
    step: 2,
    iconSymbol: 'takeoutbag.and.cup.and.straw.fill',
    fallbackIcon: '•',
    pattern:
      /\b(paine|franzela|bagheta|chifla|chifle|toast|corn|cornuri|croissant\w*|lipie|lipii|covrig|covrigi|pesmet|feliata|cozonac|focaccia|panificatie|brutarie|ciabatta)\b/i,
  },
  'lactate-oua': {
    id: 'lactate-oua',
    name: 'Lactate & Ouă',
    step: 3,
    iconSymbol: 'cup.and.saucer.fill',
    fallbackIcon: '•',
    pattern:
      /\b(lapte|oua\b|ou\b|iaurt\w*|kefir|chefir|sana|smantana|unt\b|margarina|lactate|frisca|lapte batut|budinca|desert de lapte|actimel|danonino)\b/i,
  },
  branzeturi: {
    id: 'branzeturi',
    name: 'Brânzeturi & Specialități',
    step: 4,
    iconSymbol: 'circle.grid.cross.fill',
    fallbackIcon: '•',
    pattern:
      /\b(branza|branzeturi|telemea|cascaval|mozzarella|parmezan|urda|cas\b|ricotta|gorgonzola|feta|camembert|brie|halloumi|mascarpone|crema de branza|cottage|cheddar|gouda|emmentaler|branza topita)\b/i,
  },
  'carne-mezeluri': {
    id: 'carne-mezeluri',
    name: 'Carne, Mezeluri & Pește',
    step: 5,
    iconSymbol: 'fork.knife',
    fallbackIcon: '•',
    pattern:
      /\b(carne|pui|porc|vita|curcan|mici|sunca|salam|parizer|crenvurst\w*|bacon|muschi\w*|costita|carnat\w*|peste|somon|ton\b|pastrav|macrou|mezeluri|piept|pulpe|ceafa|cotlet|aripi|ficat|icre|fructe de mare|creveti|calamar|caracatita|antricot|fleica|kaizer)\b/i,
  },
  'camara-bacanie': {
    id: 'camara-bacanie',
    name: 'Cămară, Paste & Conserve',
    step: 6,
    iconSymbol: 'archivebox.fill',
    fallbackIcon: '•',
    pattern:
      /\b(orez|paste\b|spaghete|macaroane|penne|fusilli|faina|malai|gris|ulei|otet|zahar|sare\b|piper|condiment\w*|conserva|conserve|fasole|mazare|porumb|naut|linte|bulion|pasta de tomate|sos\b|sosuri|ketchup|mustar|maioneza|zacusca|muraturi|gogosari|castraveti murati|masline|miere|gem\b|dulceata|fidea|pesmet|foi de dafin|boia)\b/i,
  },
  'cafea-dulciuri': {
    id: 'cafea-dulciuri',
    name: 'Cafea, Ceai & Dulciuri',
    step: 7,
    iconSymbol: 'mug.fill',
    fallbackIcon: '•',
    pattern:
      /\b(cafea|ceai|capsule cafea|ness|cacao|ciocolat\w*|bomboan\w*|napolitan\w*|biscuit\w*|cereale|musli|granola|nutella|crema de ciocolata|prajitur\w*|pralin\w*|turta dulce|halva|batoane|baton|eugeni\w*|dropsuri|caramele|piscoturi)\b/i,
  },
  'bauturi-snacks': {
    id: 'bauturi-snacks',
    name: 'Băuturi & Snacks',
    step: 8,
    iconSymbol: 'waterbottle.fill',
    fallbackIcon: '•',
    pattern:
      /\b(apa\b|apa plata|apa minerala|carbogazoasa|suc\b|sucuri|cola|pepsi|fanta|sprite|schweppes|limonada|sirop|bere|vin\b|vinuri|prosecco|sampanie|cidru|energizant|red bull|monster|chipsuri|chips|pufuleti|alune|fistic|migdale|seminte|covrigei|popcorn|nachos|snack\w*|caju|bautura racoritoare)\b/i,
  },
  'curatenie-menaj': {
    id: 'curatenie-menaj',
    name: 'Curățenie & Menaj',
    step: 9,
    iconSymbol: 'sparkles',
    fallbackIcon: '•',
    pattern:
      /\b(detergent|balsam rufe|inalbitor|degresant|anticalcar|solutie geamuri|solutie vase|tablete masina|fairy|ariel|persil|lenor|domestos|cif|bureti|burete|lavete|laveta|mop|saci menajeri|sac menajer|folie aluminiu|folie alimentara|hartie copt|odorizant|punga gheata|clor|dezinfectant)\b/i,
  },
  'igiena-personala': {
    id: 'igiena-personala',
    name: 'Igienă & Îngrijire',
    step: 10,
    iconSymbol: 'hands.and.sparkles.fill',
    fallbackIcon: '•',
    pattern:
      /\b(hartie igienica|prosoape hartie|sampon|gel de dus|sapun|pasta de dinti|periuta de dinti|deodorant|antiperspirant|absorbante|tampoane|dischete|servetele umede|servetele|crema de maini|crema de fata|spuma de ras|aparat de ras|lame de ras|colgate|dove|nivea|palmolive|zewa|apa de gura|gel intim)\b/i,
  },
  'diverse-altele': {
    id: 'diverse-altele',
    name: 'Diverse & Casă',
    step: 11,
    iconSymbol: 'bag.fill',
    fallbackIcon: '•',
    pattern:
      /\b(baterii|baterie|chibrituri|bricheta|hrana caini|hrana pisici|whiskas|pedigree|purina|guma de mestecat|orbit|airwaves|punga cadou|pungi)\b/i,
  },
};

const AISLE_EVALUATION_ORDER = [
  'igiena-personala',
  'curatenie-menaj',
  'cafea-dulciuri',
  'bauturi-snacks',
  'lactate-oua',
  'branzeturi',
  'carne-mezeluri',
  'brutarie',
  'camara-bacanie',
  'fructe-legume',
  'diverse-altele',
] as const;

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function classifyShoppingItemAisle(item: ShoppingItem): {
  id: string;
  name: string;
  step: number;
  iconSymbol: string;
  fallbackIcon: string;
} {
  const norm = normalizeText(`${item.name} ${item.brand ?? ''}`);

  // Excepții specifice pentru expresii compuse
  if (norm.includes('pasta de dinti') || norm.includes('periuta de dinti')) {
    const igiena = AISLE_DEFINITIONS['igiena-personala'];
    return {
      id: igiena.id,
      name: igiena.name,
      step: igiena.step,
      iconSymbol: igiena.iconSymbol,
      fallbackIcon: igiena.fallbackIcon,
    };
  }

  if (norm.includes('hartie de copt') || norm.includes('hartie copt')) {
    const curatenie = AISLE_DEFINITIONS['curatenie-menaj'];
    return {
      id: curatenie.id,
      name: curatenie.name,
      step: curatenie.step,
      iconSymbol: curatenie.iconSymbol,
      fallbackIcon: curatenie.fallbackIcon,
    };
  }

  if (norm.includes('ulei de masline')) {
    const camara = AISLE_DEFINITIONS['camara-bacanie'];
    return {
      id: camara.id,
      name: camara.name,
      step: camara.step,
      iconSymbol: camara.iconSymbol,
      fallbackIcon: camara.fallbackIcon,
    };
  }

  for (const key of AISLE_EVALUATION_ORDER) {
    if (key === 'diverse-altele') continue;
    const def = AISLE_DEFINITIONS[key];
    if (def.pattern.test(norm)) {
      return {
        id: def.id,
        name: def.name,
        step: def.step,
        iconSymbol: def.iconSymbol,
        fallbackIcon: def.fallbackIcon,
      };
    }
  }

  const fallback = AISLE_DEFINITIONS['diverse-altele'];
  return {
    id: fallback.id,
    name: fallback.name,
    step: fallback.step,
    iconSymbol: fallback.iconSymbol,
    fallbackIcon: fallback.fallbackIcon,
  };
}

export function groupShoppingItemsByAisle(items: ShoppingItem[]): AisleGroup[] {
  const groupsMap = new Map<string, AisleGroup>();

  for (const key of Object.keys(AISLE_DEFINITIONS)) {
    const def = AISLE_DEFINITIONS[key];
    groupsMap.set(def.id, {
      id: def.id,
      name: def.name,
      step: def.step,
      iconSymbol: def.iconSymbol,
      fallbackIcon: def.fallbackIcon,
      items: [],
    });
  }

  for (const item of items) {
    const aisle = classifyShoppingItemAisle(item);
    const existing = groupsMap.get(aisle.id);
    if (existing) {
      existing.items.push(item);
    }
  }

  return Array.from(groupsMap.values())
    .filter((g) => g.items.length > 0)
    .sort((a, b) => a.step - b.step);
}

export type ListSortMode = 'aisle' | 'recent' | 'alphabetical';

/**
 * Sortează produsele din listă în funcție de modul ales:
 * - 'aisle': ordinea fizică a raioanelor din supermarket (1..11)
 * - 'recent': ordinea adăugării în listă (păstrează poziția curentă)
 * - 'alphabetical': A-Z după numele produsului
 */
export function sortShoppingItems(
  items: ShoppingItem[],
  mode: ListSortMode = 'aisle'
): ShoppingItem[] {
  if (mode === 'recent') {
    return items;
  }

  if (mode === 'alphabetical') {
    return [...items].sort((a, b) =>
      a.name.localeCompare(b.name, 'ro', { sensitivity: 'base' })
    );
  }

  // Mod 'aisle' (Traseu supermarket)
  return [...items].sort((a, b) => {
    const aisleA = classifyShoppingItemAisle(a);
    const aisleB = classifyShoppingItemAisle(b);
    if (aisleA.step !== aisleB.step) {
      return aisleA.step - aisleB.step;
    }
    return a.name.localeCompare(b.name, 'ro', { sensitivity: 'base' });
  });
}
