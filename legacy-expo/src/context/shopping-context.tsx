import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  buildDemoShoppingLists,
  CURRENT_DEMO_SEED_VERSION,
  DEMO_WEEKLY_LIST_ID,
  mergeDemoListsIntoSavedLists,
} from '@/constants/demo-baskets';
import type { TrackedOutboundClickPayload } from '@/lib/open-external-store';
import {
  fetchCatalogProductsPage,
  type DisplayProduct,
} from '@/services/beavy-catalog-search';
import {
  type DualBasketComparisonResult,
  compareShoppingBasketWithVariants,
} from '@/services/beavy-comparison';
import {
  EMPTY_PREFERENCE_MEMORY,
  type UserPreferenceMemory,
  parseShoppingIntent,
  recordLearnedProductSelection,
  recordRejectedProduct,
} from '@/services/beavy-intelligence';
import type { ConfirmedScanBatch } from '@/services/beavy-list-scanner-core';

const MVP_STORAGE_KEY = '@beavy/mvp-state-v2';
const LEGACY_STORAGE_KEY = '@beavy/app-state-v1';

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  productId?: string | null;
  brand?: string | null;
  packageSize?: string | null;
  imageUrl?: string | null;
  isCustom?: boolean;
};

export type ShoppingList = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: ShoppingItem[];
};

export type ShoppingSessionRecord = {
  id: string;
  completedAt: string;
  listName: string;
  retailerName: string;
  retailerSlug?: string | null;
  channelMode: 'physical' | 'online';
  itemsCount: number;
  verifiedTotal: number | null;
  verifiedSavings: number;
};

export type OutboundClickRecord = TrackedOutboundClickPayload & {
  id: string;
  clickedAt: string;
};

export type UserPreferences = {
  userName: string;
  userEmail?: string;
  city: string;
  sector?: 1 | 2 | 3 | 4 | 5 | 6 | null;
  preferredChannel: 'all' | 'physical' | 'online';
  preferredRetailerSlugs: string[];
  deliveryPreference?: 'lowest_fee' | 'fastest' | 'pickup';
  preferredDeliverySlot?: 'flexible' | 'morning' | 'evening';
  notificationsEnabled?: boolean;
  priceAlertsEnabled?: boolean;
  applyLoyaltyCards?: boolean;
  ownedLoyaltyPrograms?: string[];
  appAppearance?: 'system' | 'light' | 'warm';
  listSortMode?: 'aisle' | 'recent' | 'alphabetical';
  hasCompletedOnboarding?: boolean;
  learnPreferencesEnabled?: boolean;
  minSplitSavingsRon?: number;
};

type ShoppingContextValue = {
  ready: boolean;
  lists: ShoppingList[];
  activeList: ShoppingList | null;
  activeListId: string;
  shoppingItems: ShoppingItem[];
  basketItems: ShoppingItem[];
  purchasedItems: ShoppingItem[];
  activeStoreCheckedIds: string[];
  shoppingHistory: ShoppingSessionRecord[];
  outboundClicks: OutboundClickRecord[];
  preferences: UserPreferences;
  preferenceMemory: UserPreferenceMemory;
  // Precomputed background basket comparison for instant Coș tab loading
  precomputedComparison: DualBasketComparisonResult | null;
  isComparing: boolean;
  refreshComparison: (force?: boolean) => Promise<void>;
  // List management
  createList: (name?: string, switchToIt?: boolean) => string;
  selectList: (listId: string) => void;
  renameList: (listId: string, newName: string) => void;
  deleteList: (listId: string) => void;
  loadDemoBaskets: () => void;
  // Item management
  addCatalogProduct: (product: DisplayProduct, quantity?: number) => void;
  addGenericItem: (term: string, quantity?: number) => void;
  updateCatalogProductQuantity: (product: DisplayProduct, newQuantity: number) => void;
  addScannedItemsBatch: (batch: ConfirmedScanBatch) => { addedDistinct: number; addedUnits: number };
  replaceItemWithProduct: (targetItemId: string, product: DisplayProduct) => void;
  toggleItemChecked: (itemId: string) => void;
  setItemsChecked: (itemIds: string[], checked: boolean) => void;
  changeItemQuantity: (itemId: string, delta: number) => void;
  removeItem: (itemId: string) => void;
  clearCheckedItems: () => void;
  clearBasketItems: () => void;
  getProductQuantity: (productId: string, canonicalName?: string) => number;
  // Shopping Mode session state (single source of truth per list)
  toggleStoreCheckedItem: (itemId: string) => void;
  clearStoreCheckedItems: () => void;
  restoreStoreCheckedItems: (itemIds: string[]) => void;
  commitStoreCheckedItems: (itemIds: string[]) => string[];
  // History & verified savings
  recordShoppingSession: (
    entry: Omit<ShoppingSessionRecord, 'id' | 'completedAt'>
  ) => void;
  clearShoppingHistory: () => void;
  // Outbound partner click measurement
  recordOutboundClick: (entry: TrackedOutboundClickPayload) => void;
  clearOutboundClicks: () => void;
  // Preferences
  updatePreferences: (patch: Partial<UserPreferences>) => void;
  clearPreferenceMemory: () => void;
  resetAllData: () => Promise<void>;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  userName: '',
  city: 'București',
  sector: null,
  preferredChannel: 'all',
  preferredRetailerSlugs: ['freshful'],
  deliveryPreference: 'lowest_fee',
  preferredDeliverySlot: 'flexible',
  notificationsEnabled: true,
  priceAlertsEnabled: true,
  applyLoyaltyCards: true,
  appAppearance: 'system',
  listSortMode: 'aisle',
  hasCompletedOnboarding: false,
  learnPreferencesEnabled: true,
};

function createDefaultList(items: ShoppingItem[] = []): ShoppingList {
  const now = new Date().toISOString();
  return {
    id: `list-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Lista de cumpărături',
    createdAt: now,
    updatedAt: now,
    items,
  };
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro-RO')
    .trim();
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeShoppingItem(item: ShoppingItem): ShoppingItem {
  const cleanBrand =
    item.brand && !/(orice\s+(firm[aă]|brand)|produs\s+propriu|generic)/i.test(item.brand.trim())
      ? item.brand.trim()
      : null;
  const cleanPackageSize =
    item.packageSize &&
    !/(toate(\s+magazinele)?|orice\s+gramaj|potrivire\s+generic[aă])/i.test(
      item.packageSize.trim()
    )
      ? item.packageSize.trim()
      : null;

  return {
    ...item,
    brand: cleanBrand,
    packageSize: cleanPackageSize,
  };
}

function parseLegacyItems(rawLegacy: string | null): ShoppingItem[] {
  if (!rawLegacy) return [];
  try {
    const parsedLegacy = JSON.parse(rawLegacy) as {
      shoppingItems?: Partial<ShoppingItem>[];
    };
    if (!Array.isArray(parsedLegacy.shoppingItems)) return [];
    return parsedLegacy.shoppingItems
      .filter((it) => typeof it?.id === 'string' && typeof it?.name === 'string')
      .map((it) => {
        const id = it.id as string;
        const isCatalogUuid = UUID_REGEX.test(id);
        const item: ShoppingItem = {
          id,
          name: it.name as string,
          quantity:
            typeof it.quantity === 'number' && it.quantity >= 1
              ? Math.floor(it.quantity)
              : 1,
          checked: it.checked === true,
          productId: isCatalogUuid ? id : (it.productId ?? null),
          brand: it.brand ?? null,
          packageSize: it.packageSize ?? null,
          imageUrl: it.imageUrl ?? null,
          isCustom: typeof it.isCustom === 'boolean' ? it.isCustom : !isCatalogUuid,
        };
        return sanitizeShoppingItem(item);
      });
  } catch {
    return [];
  }
}

function applyItemCheckedState(
  current: ShoppingItem[],
  itemId: string,
  nextChecked: boolean
): ShoppingItem[] {
  const target = current.find((it) => it.id === itemId);
  if (!target || target.checked === nextChecked) return current;

  // Dacă readucem un produs achiziționat înapoi în listă/coș și există deja un rând activ pentru același produs,
  // le unim curat fără să creăm dubluri sau să pierdem cantitatea.
  if (target.checked && !nextChecked) {
    const activeDuplicate = current.find(
      (it) =>
        !it.checked &&
        it.id !== itemId &&
        ((target.productId && it.productId === target.productId) ||
          (!target.productId &&
            !it.productId &&
            normalizeText(it.name) === normalizeText(target.name)))
    );
    if (activeDuplicate) {
      return current
        .filter((it) => it.id !== itemId)
        .map((it) =>
          it.id === activeDuplicate.id
            ? { ...it, quantity: it.quantity + target.quantity }
            : it
        );
    }
  }

  return current.map((item) =>
    item.id === itemId ? { ...item, checked: nextChecked } : item
  );
}

function pruneStoreCheckedMap(
  prev: Record<string, string[]>,
  listId: string,
  idsToRemove: Set<string>
): Record<string, string[]> {
  const existing = prev[listId];
  if (!existing || existing.length === 0) return prev;
  const remaining = existing.filter((id) => !idsToRemove.has(id));
  if (remaining.length === existing.length) return prev;
  if (remaining.length === 0) {
    const next = { ...prev };
    delete next[listId];
    return next;
  }
  return { ...prev, [listId]: remaining };
}

function sanitizeStoreCheckedMap(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, string[]> = {};
  for (const [listId, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue;
    const clean = Array.from(
      new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))
    );
    if (clean.length > 0) {
      result[listId] = clean;
    }
  }
  return result;
}

function upsertCatalogItemInList(
  current: ShoppingItem[],
  product: Pick<
    DisplayProduct,
    'id' | 'canonical_name' | 'brand' | 'package_size' | 'image_url'
  >,
  quantity: number
): ShoppingItem[] {
  const safeQty = Math.max(1, Math.floor(quantity));
  const existing = current.find(
    (item) =>
      !item.checked && (item.productId === product.id || item.id === product.id)
  );
  if (existing) {
    return current.map((item) =>
      item.id === existing.id
        ? { ...item, quantity: item.quantity + safeQty, checked: false }
        : item
    );
  }

  const hasSameRowId = current.some((item) => item.id === product.id);
  const rowId = hasSameRowId
    ? `${product.id}::${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
    : product.id;

  return [
    ...current,
    {
      id: rowId,
      name: product.canonical_name,
      quantity: safeQty,
      checked: false,
      productId: product.id,
      brand: product.brand,
      packageSize: product.package_size,
      imageUrl: product.image_url,
      isCustom: false,
    },
  ];
}

const ShoppingContext = createContext<ShoppingContextValue | null>(null);

export function ShoppingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string>('');
  const [storeCheckedByListId, setStoreCheckedByListId] = useState<
    Record<string, string[]>
  >({});
  const [shoppingHistory, setShoppingHistory] = useState<ShoppingSessionRecord[]>([]);
  const [outboundClicks, setOutboundClicks] = useState<OutboundClickRecord[]>([]);
  const [demoSeedVersion, setDemoSeedVersion] = useState<number>(
    CURRENT_DEMO_SEED_VERSION
  );
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [preferenceMemory, setPreferenceMemory] = useState<UserPreferenceMemory>(
    EMPTY_PREFERENCE_MEMORY
  );

  // Load state & migrate legacy state even if v2 was initialized empty
  useEffect(() => {
    let isMounted = true;

    const loadState = async () => {
      try {
        const [savedV2, savedLegacy] = await Promise.all([
          AsyncStorage.getItem(MVP_STORAGE_KEY),
          AsyncStorage.getItem(LEGACY_STORAGE_KEY),
        ]);

        const legacyItems = parseLegacyItems(savedLegacy);

        if (savedV2) {
          const parsed = JSON.parse(savedV2) as {
            lists?: ShoppingList[];
            activeListId?: string;
            storeCheckedByListId?: unknown;
            shoppingHistory?: ShoppingSessionRecord[];
            outboundClicks?: OutboundClickRecord[];
            demoSeedVersion?: number;
            preferences?: Partial<UserPreferences>;
            preferenceMemory?: Partial<UserPreferenceMemory>;
          };

          if (Array.isArray(parsed.lists)) {
            let loadedLists = parsed.lists.map((l) => ({
              ...l,
              items: Array.isArray(l.items) ? l.items.map(sanitizeShoppingItem) : [],
            }));

            const totalV2Items = loadedLists.reduce(
              (acc, l) => acc + l.items.length,
              0
            );

            // Dacă v2 a fost salvat gol (0 produse), dar există produse în cheia veche v1, le recuperăm în lista activă
            if (totalV2Items === 0 && legacyItems.length > 0 && loadedLists.length > 0) {
              const targetId = loadedLists.some((l) => l.id === parsed.activeListId)
                ? (parsed.activeListId as string)
                : loadedLists[0].id;

              loadedLists = loadedLists.map((l) =>
                l.id === targetId
                  ? {
                      ...l,
                      updatedAt: new Date().toISOString(),
                      items: legacyItems,
                    }
                  : l
              );
              await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
            }

            const mergedDemo = mergeDemoListsIntoSavedLists(
              loadedLists,
              parsed.demoSeedVersion
            );
            loadedLists = mergedDemo.lists;

            if (isMounted) {
              setLists(loadedLists);
              setDemoSeedVersion(CURRENT_DEMO_SEED_VERSION);
              const activeStillValid = loadedLists.some(
                (l) => l.id === parsed.activeListId
              );
              const validActive = activeStillValid
                ? (parsed.activeListId as string)
                : (loadedLists[0]?.id ?? '');
              setActiveListId(validActive);
              setStoreCheckedByListId(sanitizeStoreCheckedMap(parsed.storeCheckedByListId));
            }
          } else if (legacyItems.length > 0 && isMounted) {
            const initialList = createDefaultList(legacyItems);
            setLists([initialList]);
            setActiveListId(initialList.id);
            setDemoSeedVersion(CURRENT_DEMO_SEED_VERSION);
            await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
          }

          if (Array.isArray(parsed.shoppingHistory) && isMounted) {
            setShoppingHistory(
              parsed.shoppingHistory.filter(
                (rec) =>
                  typeof rec?.id === 'string' &&
                  typeof rec?.completedAt === 'string' &&
                  typeof rec?.retailerName === 'string'
              )
            );
          }
          if (Array.isArray(parsed.outboundClicks) && isMounted) {
            setOutboundClicks(
              parsed.outboundClicks.filter(
                (click) =>
                  typeof click?.id === 'string' &&
                  typeof click?.clickedAt === 'string' &&
                  typeof click?.retailerName === 'string' &&
                  typeof click?.targetUrl === 'string'
              )
            );
          }
          if (parsed.preferences && isMounted) {
            const migratedPreferences = { ...parsed.preferences };
            if (migratedPreferences.userName?.trim() === 'Andrei Popescu') {
              migratedPreferences.userName = '';
            }
            if (migratedPreferences.userEmail?.trim() === 'andrei.popescu@gmail.com') {
              migratedPreferences.userEmail = '';
            }
            setPreferences((prev) => ({ ...prev, ...migratedPreferences }));
          }
          if (parsed.preferenceMemory && typeof parsed.preferenceMemory === 'object' && isMounted) {
            setPreferenceMemory({
              learnedResolutions:
                parsed.preferenceMemory.learnedResolutions &&
                typeof parsed.preferenceMemory.learnedResolutions === 'object'
                  ? parsed.preferenceMemory.learnedResolutions
                  : {},
              brandAffinity:
                parsed.preferenceMemory.brandAffinity &&
                typeof parsed.preferenceMemory.brandAffinity === 'object'
                  ? parsed.preferenceMemory.brandAffinity
                  : {},
              rejectedProductIds: Array.isArray(parsed.preferenceMemory.rejectedProductIds)
                ? parsed.preferenceMemory.rejectedProductIds.filter(
                    (id): id is string => typeof id === 'string'
                  )
                : [],
            });
          }
          return;
        }

        // Dacă nu există deloc v2, dar există v1
        if (legacyItems.length > 0 && isMounted) {
          const initialList = createDefaultList(legacyItems);
          setLists([initialList]);
          setActiveListId(initialList.id);
          setDemoSeedVersion(CURRENT_DEMO_SEED_VERSION);
          await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
        } else if (isMounted) {
          // Utilizator nou: creăm lista inițială gata de utilizare
          const initialList = createDefaultList([]);
          setLists([initialList]);
          setActiveListId(initialList.id);
          setDemoSeedVersion(CURRENT_DEMO_SEED_VERSION);
        }
      } catch (err) {
        console.warn('Beavy: nu am putut încărca starea salvată:', err);
      } finally {
        if (isMounted) setReady(true);
      }
    };

    void loadState();
    return () => {
      isMounted = false;
    };
  }, []);

  // Save state automatically cu debounce pentru a evita serializarea la fiecare milisecundă
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(
          MVP_STORAGE_KEY,
          JSON.stringify({
            lists,
            activeListId,
            storeCheckedByListId,
            shoppingHistory,
            outboundClicks,
            demoSeedVersion,
            preferences,
            preferenceMemory,
          })
        );
      } catch (err) {
        console.warn('Beavy: nu am putut salva starea:', err);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [
    lists,
    activeListId,
    storeCheckedByListId,
    shoppingHistory,
    outboundClicks,
    demoSeedVersion,
    preferences,
    preferenceMemory,
    ready,
  ]);

  // Auto-heal: Elimină complet produsele manuale (isCustom / productId: null) din stocarea locală
  useEffect(() => {
    if (!ready) return;
    const manualItems = lists.flatMap((l) =>
      l.items.filter((it) => it.isCustom === true || !it.productId)
    );
    if (manualItems.length === 0) return;

    let cancelled = false;
    const heal = async () => {
      try {
        const uniqueNames = Array.from(
          new Set(manualItems.map((m) => m.name.trim()))
        );
        const results = await Promise.all(
          uniqueNames.map(async (name) => {
            const res = await fetchCatalogProductsPage({
              query: name,
              limit: 1,
            }).catch(() => null);
            return { name, product: res?.products?.[0] ?? null };
          })
        );
        if (cancelled) return;

        const resolvedByName = new Map<string, DisplayProduct>();
        for (const r of results) {
          if (r.product) resolvedByName.set(r.name.toLowerCase(), r.product);
        }

        if (resolvedByName.size === 0) return;

        setLists((prev) =>
          prev.map((l) => ({
            ...l,
            items: l.items.map((it) => {
              if (!it.isCustom && it.productId) return it;
              const p = resolvedByName.get(it.name.trim().toLowerCase());
              if (!p) return it;
              return {
                ...it,
                productId: p.id,
                name: p.canonical_name || it.name,
                brand: p.brand || it.brand,
                packageSize: p.package_size || it.packageSize,
                imageUrl: p.image_url || it.imageUrl,
                isCustom: false,
              };
            }),
          }))
        );
      } catch {
        // ignore
      }
    };
    void heal();
    return () => {
      cancelled = true;
    };
  }, [ready, lists]);

  // Asigurăm că activeList este un obiect din `lists` sau null dacă nu există nicio listă
  const activeList = useMemo(() => {
    return lists.find((l) => l.id === activeListId) ?? lists[0] ?? null;
  }, [lists, activeListId]);

  const shoppingItems = useMemo(() => activeList?.items ?? [], [activeList]);
  const basketItems = useMemo(
    () => shoppingItems.filter((it) => !it.checked),
    [shoppingItems]
  );
  const purchasedItems = useMemo(
    () => shoppingItems.filter((it) => it.checked),
    [shoppingItems]
  );

  const resolvedActiveListId = activeList?.id ?? '';

  const activeStoreCheckedIds = useMemo(() => {
    if (!resolvedActiveListId) return [];
    const stored = storeCheckedByListId[resolvedActiveListId];
    if (!stored || stored.length === 0) return [];
    const activeIds = new Set(basketItems.map((it) => it.id));
    return stored.filter((id) => activeIds.has(id));
  }, [resolvedActiveListId, storeCheckedByListId, basketItems]);

  const [precomputedComparison, setPrecomputedComparison] =
    useState<DualBasketComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const comparisonReqSeqRef = useRef(0);
  const lastPrecomputedFingerprintRef = useRef('');

  const preferredChannel = preferences.preferredChannel;
  const prefCity = preferences.city;
  const prefRetailerSlugs = preferences.preferredRetailerSlugs;
  const applyLoyalty = preferences.applyLoyaltyCards ?? true;
  const ownedLoyalty = preferences.ownedLoyaltyPrograms ?? null;
  const learnPreferencesEnabled = preferences.learnPreferencesEnabled ?? true;
  const minSplitSavingsRon = preferences.minSplitSavingsRon;

  const basketFingerprint = useMemo(() => {
    const itemSlices = basketItems
      .map((it) => `${it.id}:${it.quantity}:${it.productId ?? it.name}`)
      .sort()
      .join('|');
    const learnedCount = Object.keys(preferenceMemory.learnedResolutions).length;
    return `${itemSlices}#${preferredChannel ?? ''}#${prefCity ?? ''}#${applyLoyalty}#${(ownedLoyalty ?? []).sort().join(',')}#${learnPreferencesEnabled}#${learnedCount}`;
  }, [
    basketItems,
    preferredChannel,
    prefCity,
    applyLoyalty,
    ownedLoyalty,
    learnPreferencesEnabled,
    preferenceMemory.learnedResolutions,
  ]);

  const refreshComparison = useCallback(
    async (force = false) => {
      if (
        !force &&
        basketFingerprint === lastPrecomputedFingerprintRef.current &&
        precomputedComparison !== null
      ) {
        return;
      }
      const seq = ++comparisonReqSeqRef.current;
      if (basketItems.length === 0) {
        lastPrecomputedFingerprintRef.current = basketFingerprint;
        setPrecomputedComparison(null);
        setIsComparing(false);
        return;
      }

      setIsComparing(true);
      try {
        let res = await compareShoppingBasketWithVariants(basketItems, {
          channelFilter: preferredChannel,
          city: prefCity,
          preferredRetailerSlugs: prefRetailerSlugs,
          useLoyaltyCards: applyLoyalty,
          allowedLoyaltyPrograms: ownedLoyalty,
          preferenceMemory,
          learnPreferencesEnabled,
          minSplitSavingsRon,
        });
        if (seq !== comparisonReqSeqRef.current) return;

        if (
          res.standard.retailerSummaries.length === 0 &&
          preferredChannel !== 'all'
        ) {
          res = await compareShoppingBasketWithVariants(basketItems, {
            channelFilter: 'all',
            city: prefCity,
            preferredRetailerSlugs: prefRetailerSlugs,
            useLoyaltyCards: applyLoyalty,
            allowedLoyaltyPrograms: ownedLoyalty,
            preferenceMemory,
            learnPreferencesEnabled,
            minSplitSavingsRon,
          });
          if (seq !== comparisonReqSeqRef.current) return;
        }

        lastPrecomputedFingerprintRef.current = basketFingerprint;
        setPrecomputedComparison(res);
      } catch {
        // Erorile de rețea pasagere în background sunt tăcute
      } finally {
        if (seq === comparisonReqSeqRef.current) {
          setIsComparing(false);
        }
      }
    },
    [
      basketFingerprint,
      precomputedComparison,
      basketItems,
      preferredChannel,
      prefCity,
      prefRetailerSlugs,
      applyLoyalty,
      ownedLoyalty,
      preferenceMemory,
      learnPreferencesEnabled,
      minSplitSavingsRon,
    ]
  );

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void refreshComparison();
    }, 350);
    return () => clearTimeout(timer);
  }, [ready, basketFingerprint, refreshComparison]);

  const updateActiveListItems = useCallback(
    (updater: (current: ShoppingItem[]) => ShoppingItem[]) => {
      const now = new Date().toISOString();
      setLists((prevLists) => {
        if (prevLists.length === 0) {
          const fresh = createDefaultList(updater([]));
          setActiveListId(fresh.id);
          return [fresh];
        }
        const targetId = prevLists.some((l) => l.id === activeListId)
          ? activeListId
          : prevLists[0].id;

        return prevLists.map((list) => {
          if (list.id !== targetId) return list;
          return {
            ...list,
            updatedAt: now,
            items: updater(list.items),
          };
        });
      });
    },
    [activeListId]
  );

  const createList = useCallback((name?: string, switchToIt = true): string => {
    const now = new Date().toISOString();
    const newId = `list-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cleanName =
      name?.trim() || `Listă nouă (${new Date().toLocaleDateString('ro-RO')})`;
    const newList: ShoppingList = {
      id: newId,
      name: cleanName,
      createdAt: now,
      updatedAt: now,
      items: [],
    };

    setLists((prev) => [newList, ...prev]);
    if (switchToIt) {
      setActiveListId(newId);
    }
    return newId;
  }, []);

  const selectList = useCallback((listId: string) => {
    setActiveListId(listId);
  }, []);

  const renameList = useCallback((listId: string, newName: string) => {
    const clean = newName.trim();
    if (!clean) return;
    const now = new Date().toISOString();
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, name: clean, updatedAt: now } : l))
    );
  }, []);

  const deleteList = useCallback(
    (listId: string) => {
      setLists((prev) => {
        const remaining = prev.filter((l) => l.id !== listId);
        if (remaining.length === 0) {
          setActiveListId('');
          return [];
        }
        if (activeListId === listId) {
          setActiveListId(remaining[0].id);
        }
        return remaining;
      });
      setStoreCheckedByListId((prev) => {
        if (!(listId in prev)) return prev;
        const next = { ...prev };
        delete next[listId];
        return next;
      });
    },
    [activeListId]
  );

  const updateCatalogProductQuantity = useCallback(
    (product: DisplayProduct, newQuantity: number) => {
      updateActiveListItems((current) => {
        // Căutăm exclusiv produsul activ (neachiziționat) ca să nu alterăm istoricul achiziționat.
        const existing = current.find(
          (item) =>
            !item.checked && (item.productId === product.id || item.id === product.id)
        );

        if (newQuantity <= 0) {
          if (!existing) return current;
          return current.filter((item) => item.id !== existing.id);
        }

        if (existing) {
          return current.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  quantity: newQuantity,
                  productId: product.id,
                  brand: product.brand,
                  packageSize: product.package_size,
                  imageUrl: product.image_url,
                  isCustom: false,
                }
              : item
          );
        }

        const hasSameRowId = current.some((item) => item.id === product.id);
        const rowId = hasSameRowId
          ? `${product.id}::${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
          : product.id;

        return [
          ...current,
          {
            id: rowId,
            name: product.canonical_name,
            quantity: newQuantity,
            checked: false,
            productId: product.id,
            brand: product.brand,
            packageSize: product.package_size,
            imageUrl: product.image_url,
            isCustom: false,
          },
        ];
      });
    },
    [updateActiveListItems]
  );

  const addCatalogProduct = useCallback(
    (product: DisplayProduct, quantity = 1) => {
      updateActiveListItems((current) =>
        upsertCatalogItemInList(current, product, quantity)
      );
      if (preferences.learnPreferencesEnabled !== false) {
        setPreferenceMemory((prev) =>
          recordLearnedProductSelection(prev, product.canonical_name, product)
        );
      }
    },
    [updateActiveListItems, preferences.learnPreferencesEnabled]
  );

  const addGenericItem = useCallback(
    (rawTerm: string, quantity = 1) => {
      const clean = rawTerm.trim().replace(/\s+/g, ' ');
      if (clean.length < 2) return;
      const intent = parseShoppingIntent(clean);
      const strippedMultiplierTitle = clean
        .replace(/^\s*\d{1,2}\s*(?:x|×|buc(?:ati|ăți|\.)?)\s+/i, '')
        .trim();
      const effectiveTitleSource =
        quantity === 1 && intent.extractedQuantity > 1 && strippedMultiplierTitle.length >= 2
          ? strippedMultiplierTitle
          : clean;
      const effectiveQty =
        quantity === 1 && intent.extractedQuantity > 1
          ? intent.extractedQuantity
          : quantity;
      const safeQty = Math.max(1, Math.floor(effectiveQty));

      // Regula Zero Manual Items: orice termen se rezolvă determinist la un CatalogProduct cu productId real
      fetchCatalogProductsPage({ query: effectiveTitleSource, limit: 1 })
        .then((res) => {
          const top = res.products?.[0];
          if (!top) return;
          updateActiveListItems((current) =>
            upsertCatalogItemInList(
              current,
              {
                id: top.id,
                canonical_name: top.canonical_name,
                brand: top.brand,
                package_size: top.package_size,
                image_url: top.image_url,
              },
              safeQty
            )
          );
        })
        .catch(() => {});
    },
    [updateActiveListItems]
  );

  const addScannedItemsBatch = useCallback(
    (batch: ConfirmedScanBatch) => {
      let addedDistinct = 0;
      let addedUnits = 0;
      for (const c of batch.canonicalItems) {
        addedDistinct++;
        addedUnits += Math.max(1, Math.floor(c.quantity));
      }
      for (const m of batch.manualItems ?? []) {
        addedDistinct++;
        addedUnits += Math.max(1, Math.floor(m.quantity));
      }

      if (addedDistinct === 0) {
        return { addedDistinct: 0, addedUnits: 0 };
      }

      updateActiveListItems((current) => {
        let next = current;
        for (const c of batch.canonicalItems) {
          next = upsertCatalogItemInList(next, c.product, c.quantity);
        }
        return next;
      });

      // Rezolvăm automat orice manualItems către produse canonice
      if (batch.manualItems && batch.manualItems.length > 0) {
        for (const m of batch.manualItems) {
          fetchCatalogProductsPage({ query: m.name, limit: 1 })
            .then((res) => {
              const top = res.products?.[0];
              if (!top) return;
              updateActiveListItems((current) =>
                upsertCatalogItemInList(
                  current,
                  {
                    id: top.id,
                    canonical_name: top.canonical_name,
                    brand: top.brand,
                    package_size: top.package_size,
                    image_url: top.image_url,
                  },
                  m.quantity
                )
              );
            })
            .catch(() => {});
        }
      }

      return { addedDistinct, addedUnits };
    },
    [updateActiveListItems]
  );

  const replaceItemWithProduct = useCallback(
    (targetItemId: string, product: DisplayProduct) => {
      let remappedId: string = product.id;
      let previousItemName: string | null = null;
      let previousProductId: string | null = null;

      updateActiveListItems((current) => {
        const target = current.find((it) => it.id === targetItemId);
        if (!target) return current;
        previousItemName = target.name;
        previousProductId = target.productId ?? null;

        const duplicate = current.find(
          (it) =>
            it.id !== targetItemId &&
            (it.productId === product.id || it.id === product.id)
        );

        if (duplicate) {
          remappedId = duplicate.id;
          return current
            .filter((it) => it.id !== targetItemId)
            .map((it) =>
              it.id === duplicate.id
                ? {
                    ...it,
                    quantity: it.quantity + target.quantity,
                    checked: it.checked && target.checked,
                  }
                : it
            );
        }

        return current.map((it) =>
          it.id === targetItemId
            ? {
                ...it,
                id: product.id,
                name: product.canonical_name,
                productId: product.id,
                brand: product.brand,
                packageSize: product.package_size,
                imageUrl: product.image_url,
                isCustom: false,
              }
            : it
        );
      });

      if (preferences.learnPreferencesEnabled !== false) {
        setPreferenceMemory((prev) => {
          let next = recordLearnedProductSelection(
            prev,
            previousItemName ?? product.canonical_name,
            product
          );
          if (previousProductId && previousProductId !== product.id) {
            next = recordRejectedProduct(next, previousProductId);
          }
          return next;
        });
      }

      if (resolvedActiveListId && targetItemId !== remappedId) {
        setStoreCheckedByListId((prev) => {
          const existing = prev[resolvedActiveListId];
          if (!existing || !existing.includes(targetItemId)) return prev;
          const nextIds = Array.from(
            new Set(
              existing.map((id) => (id === targetItemId ? remappedId : id))
            )
          );
          return { ...prev, [resolvedActiveListId]: nextIds };
        });
      }
    },
    [updateActiveListItems, resolvedActiveListId, preferences.learnPreferencesEnabled]
  );

  const toggleItemChecked = useCallback(
    (itemId: string) => {
      updateActiveListItems((current) => {
        const target = current.find((it) => it.id === itemId);
        if (!target) return current;
        return applyItemCheckedState(current, itemId, !target.checked);
      });
      if (resolvedActiveListId) {
        setStoreCheckedByListId((prev) =>
          pruneStoreCheckedMap(prev, resolvedActiveListId, new Set([itemId]))
        );
      }
    },
    [updateActiveListItems, resolvedActiveListId]
  );

  const setItemsChecked = useCallback(
    (itemIds: string[], checked: boolean) => {
      if (itemIds.length === 0) return;
      updateActiveListItems((current) => {
        let next = current;
        for (const id of itemIds) {
          next = applyItemCheckedState(next, id, checked);
        }
        return next;
      });
      if (checked && resolvedActiveListId) {
        setStoreCheckedByListId((prev) =>
          pruneStoreCheckedMap(prev, resolvedActiveListId, new Set(itemIds))
        );
      }
    },
    [updateActiveListItems, resolvedActiveListId]
  );

  const changeItemQuantity = useCallback(
    (itemId: string, delta: number) => {
      updateActiveListItems((current) =>
        current.map((item) => {
          if (item.id !== itemId) return item;
          return { ...item, quantity: Math.max(1, item.quantity + delta) };
        })
      );
    },
    [updateActiveListItems]
  );

  const removeItem = useCallback(
    (itemId: string) => {
      updateActiveListItems((current) => current.filter((item) => item.id !== itemId));
      if (resolvedActiveListId) {
        setStoreCheckedByListId((prev) =>
          pruneStoreCheckedMap(prev, resolvedActiveListId, new Set([itemId]))
        );
      }
    },
    [updateActiveListItems, resolvedActiveListId]
  );

  const clearCheckedItems = useCallback(() => {
    updateActiveListItems((current) => current.filter((item) => !item.checked));
  }, [updateActiveListItems]);

  const clearBasketItems = useCallback(() => {
    updateActiveListItems((current) => current.filter((item) => item.checked));
    if (resolvedActiveListId) {
      setStoreCheckedByListId((prev) => {
        if (!(resolvedActiveListId in prev)) return prev;
        const next = { ...prev };
        delete next[resolvedActiveListId];
        return next;
      });
    }
  }, [updateActiveListItems, resolvedActiveListId]);

  const toggleStoreCheckedItem = useCallback(
    (itemId: string) => {
      if (!resolvedActiveListId) return;
      const validIds = new Set(basketItems.map((it) => it.id));
      if (!validIds.has(itemId)) return;

      setStoreCheckedByListId((prev) => {
        const current = (prev[resolvedActiveListId] ?? []).filter((id) =>
          validIds.has(id)
        );
        const exists = current.includes(itemId);
        const updated = exists
          ? current.filter((id) => id !== itemId)
          : [...current, itemId];
        if (updated.length === 0) {
          if (!(resolvedActiveListId in prev)) return prev;
          const next = { ...prev };
          delete next[resolvedActiveListId];
          return next;
        }
        return { ...prev, [resolvedActiveListId]: updated };
      });
    },
    [resolvedActiveListId, basketItems]
  );

  const clearStoreCheckedItems = useCallback(() => {
    if (!resolvedActiveListId) return;
    setStoreCheckedByListId((prev) => {
      if (!(resolvedActiveListId in prev)) return prev;
      const next = { ...prev };
      delete next[resolvedActiveListId];
      return next;
    });
  }, [resolvedActiveListId]);

  const restoreStoreCheckedItems = useCallback(
    (itemIds: string[]) => {
      if (!resolvedActiveListId || itemIds.length === 0) return;
      const validIds = new Set(basketItems.map((it) => it.id));
      const clean = Array.from(new Set(itemIds.filter((id) => validIds.has(id))));
      if (clean.length === 0) return;
      setStoreCheckedByListId((prev) => ({
        ...prev,
        [resolvedActiveListId]: clean,
      }));
    },
    [resolvedActiveListId, basketItems]
  );

  const commitStoreCheckedItems = useCallback(
    (itemIds: string[]): string[] => {
      const idSet = new Set(itemIds);
      const validIds = basketItems
        .filter((it) => idSet.has(it.id))
        .map((it) => it.id);
      if (validIds.length === 0) return [];
      setItemsChecked(validIds, true);
      if (resolvedActiveListId) {
        setStoreCheckedByListId((prev) => {
          const current = prev[resolvedActiveListId];
          if (!current || current.length === 0) return prev;
          const remaining = current.filter((id) => !idSet.has(id));
          if (remaining.length === 0) {
            const next = { ...prev };
            delete next[resolvedActiveListId];
            return next;
          }
          return { ...prev, [resolvedActiveListId]: remaining };
        });
      }
      return validIds;
    },
    [basketItems, setItemsChecked, resolvedActiveListId]
  );

  const itemsQuantityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of shoppingItems) {
      // Produsele achiziționate nu trebuie numărate ca active în coș / în lista de cumpărat.
      if (item.checked) continue;
      if (item.productId) {
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
      } else if (item.id) {
        map.set(item.id, (map.get(item.id) ?? 0) + item.quantity);
      }
      if (item.name) {
        const norm = normalizeText(item.name);
        map.set(`norm:${norm}`, (map.get(`norm:${norm}`) ?? 0) + item.quantity);
      }
    }
    return map;
  }, [shoppingItems]);

  const getProductQuantity = useCallback(
    (productId: string, canonicalName?: string) => {
      if (itemsQuantityMap.has(productId)) {
        return itemsQuantityMap.get(productId) ?? 0;
      }
      if (canonicalName) {
        const norm = normalizeText(canonicalName);
        if (itemsQuantityMap.has(`norm:${norm}`)) {
          return itemsQuantityMap.get(`norm:${norm}`) ?? 0;
        }
      }
      return 0;
    },
    [itemsQuantityMap]
  );

  const recordShoppingSession = useCallback(
    (entry: Omit<ShoppingSessionRecord, 'id' | 'completedAt'>) => {
      const cleanRecord: ShoppingSessionRecord = {
        ...entry,
        id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        completedAt: new Date().toISOString(),
        verifiedSavings: Math.max(0, Math.round(entry.verifiedSavings * 100) / 100),
      };
      setShoppingHistory((prev) => [cleanRecord, ...prev].slice(0, 60));
    },
    []
  );

  const clearShoppingHistory = useCallback(() => {
    setShoppingHistory([]);
  }, []);

  const recordOutboundClick = useCallback((entry: TrackedOutboundClickPayload) => {
    const cleanClick: OutboundClickRecord = {
      ...entry,
      id: `click-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      clickedAt: new Date().toISOString(),
    };
    setOutboundClicks((prev) => [cleanClick, ...prev].slice(0, 200));
  }, []);

  const clearOutboundClicks = useCallback(() => {
    setOutboundClicks([]);
  }, []);

  const loadDemoBaskets = useCallback(() => {
    const demoLists = buildDemoShoppingLists();
    const demoIds = new Set(demoLists.map((l) => l.id));
    setLists((prev) => {
      const customLists = prev.filter((l) => !demoIds.has(l.id));
      return [...demoLists, ...customLists];
    });
    setActiveListId(DEMO_WEEKLY_LIST_ID);
  }, []);

  const updatePreferences = useCallback((patch: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearPreferenceMemory = useCallback(() => {
    setPreferenceMemory(EMPTY_PREFERENCE_MEMORY);
  }, []);

  const resetAllData = useCallback(async () => {
    const emptyList = createDefaultList();
    setLists([emptyList]);
    setActiveListId(emptyList.id);
    setStoreCheckedByListId({});
    setShoppingHistory([]);
    setOutboundClicks([]);
    setPreferences(DEFAULT_PREFERENCES);
    setPreferenceMemory(EMPTY_PREFERENCE_MEMORY);
    await AsyncStorage.multiRemove([MVP_STORAGE_KEY, LEGACY_STORAGE_KEY]);
  }, []);

  const value = useMemo<ShoppingContextValue>(
    () => ({
      ready,
      lists,
      activeList,
      activeListId: resolvedActiveListId,
      shoppingItems,
      basketItems,
      purchasedItems,
      activeStoreCheckedIds,
      shoppingHistory,
      outboundClicks,
      preferences,
      preferenceMemory,
      precomputedComparison,
      isComparing,
      refreshComparison,
      createList,
      selectList,
      renameList,
      deleteList,
      loadDemoBaskets,
      addCatalogProduct,
      addGenericItem,
      updateCatalogProductQuantity,
      addScannedItemsBatch,
      replaceItemWithProduct,
      toggleItemChecked,
      setItemsChecked,
      changeItemQuantity,
      removeItem,
      clearCheckedItems,
      clearBasketItems,
      getProductQuantity,
      toggleStoreCheckedItem,
      clearStoreCheckedItems,
      restoreStoreCheckedItems,
      commitStoreCheckedItems,
      recordShoppingSession,
      clearShoppingHistory,
      recordOutboundClick,
      clearOutboundClicks,
      updatePreferences,
      clearPreferenceMemory,
      resetAllData,
    }),
    [
      ready,
      lists,
      activeList,
      resolvedActiveListId,
      shoppingItems,
      basketItems,
      purchasedItems,
      activeStoreCheckedIds,
      shoppingHistory,
      outboundClicks,
      preferences,
      preferenceMemory,
      precomputedComparison,
      isComparing,
      refreshComparison,
      createList,
      selectList,
      renameList,
      deleteList,
      loadDemoBaskets,
      addCatalogProduct,
      addGenericItem,
      updateCatalogProductQuantity,
      addScannedItemsBatch,
      replaceItemWithProduct,
      toggleItemChecked,
      setItemsChecked,
      changeItemQuantity,
      removeItem,
      clearCheckedItems,
      clearBasketItems,
      getProductQuantity,
      toggleStoreCheckedItem,
      clearStoreCheckedItems,
      restoreStoreCheckedItems,
      commitStoreCheckedItems,
      recordShoppingSession,
      clearShoppingHistory,
      recordOutboundClick,
      clearOutboundClicks,
      updatePreferences,
      clearPreferenceMemory,
      resetAllData,
    ]
  );

  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>;
}

export function useShopping() {
  const ctx = useContext(ShoppingContext);
  if (!ctx) {
    throw new Error('useShopping trebuie folosit în interiorul ShoppingProvider');
  }
  return ctx;
}
