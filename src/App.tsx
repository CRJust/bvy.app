import { useEffect, useState } from 'react';
import {
  ChefHat,
  House,
  LayoutGrid,
  ShoppingBasket,
  User,
} from 'lucide-react';
import { AiChatTab } from './components/AiChatTab.tsx';
import { BasketTab } from './components/BasketTab.tsx';
import { HomeTab } from './components/HomeTab.tsx';
import { PlanScreen } from './components/PlanScreen.tsx';
import { ProfileTab } from './components/ProfileTab.tsx';
import { DEFAULT_BASKET, PRODUCT_MAP } from './data/catalog.ts';
import { STORES, STORE_MAP } from './data/stores.ts';
import type {
  AppliedPlanSnapshot,
  BasketItem,
  CanonicalProduct,
  LoyaltyCardId,
  StoreFilterMode,
  StoreId,
  UserProfile,
} from './types.ts';
import {
  computeSplitTwoStores,
  formatRon,
  getRankedStores,
  resolveProductForMode,
} from './utils/pricing.ts';
import {
  dropLegacyCache,
  fetchFreshProducts,
  isRemoteProductId,
  loadCachedProducts,
  markProductUnlisted,
  upsertCachedProducts,
} from './utils/productCache.ts';

type ActiveTab = 'home' | 'basket' | 'ai' | 'matrix' | 'profile';

export interface MissionConstraints {
  budgetRon: number | null;
  days: number | null;
  maxStores: 1 | 2;
}

interface PersistedState {
  basket: BasketItem[];
  activeStoreId: StoreId | 'split';
  hasChosenStore: boolean;
  economyMode: boolean;
  inStoreMode: boolean;
  activeCards: LoyaltyCardId[];
  channelMode: StoreFilterMode;
  missionConstraints: MissionConstraints;
  rejectedStoreIds: StoreId[];
  rejectedSwapIds: string[];
  appliedPlanSnapshot: AppliedPlanSnapshot | null;
  profile: UserProfile;
}

const STORAGE_KEY = 'beavy_pantry_state_v1';

const DEFAULT_CONSTRAINTS: MissionConstraints = {
  budgetRon: null,
  days: null,
  maxStores: 2,
};

const DEFAULT_PROFILE: UserProfile = {
  city: 'București & Ilfov',
  neighborhood: '',
  householdSize: 2,
  dietaryPreferences: [],
};

const DEFAULT_STATE: PersistedState = {
  basket: DEFAULT_BASKET,
  activeStoreId: 'lidl',
  hasChosenStore: false,
  economyMode: false,
  inStoreMode: false,
  activeCards: ['lidl_plus', 'kaufland_card'],
  channelMode: 'all',
  missionConstraints: DEFAULT_CONSTRAINTS,
  rejectedStoreIds: [],
  rejectedSwapIds: [],
  appliedPlanSnapshot: null,
  profile: DEFAULT_PROFILE,
};

function loadInitialState(): PersistedState {
  // Live-catalog products saved earlier; their prices are refreshed right after mount
  for (const p of loadCachedProducts()) {
    if (!PRODUCT_MAP[p.id]) PRODUCT_MAP[p.id] = p;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const validBasket = Array.isArray(parsed.basket)
      ? parsed.basket.filter(
          (item) =>
            item &&
            typeof item.productId === 'string' &&
            Boolean(PRODUCT_MAP[item.productId]) &&
            Number(item.quantity) > 0
        )
      : DEFAULT_BASKET;

    const channelMode: StoreFilterMode =
      parsed.channelMode === 'physical' || parsed.channelMode === 'online'
        ? parsed.channelMode
        : 'all';

    const mc = parsed.missionConstraints;
    const missionConstraints: MissionConstraints = {
      budgetRon:
        mc && typeof mc.budgetRon === 'number' && mc.budgetRon > 0 ? mc.budgetRon : null,
      days: mc && typeof mc.days === 'number' && mc.days > 0 ? mc.days : null,
      maxStores: mc && mc.maxStores === 1 ? 1 : 2,
    };

    const rejectedStoreIds = Array.isArray(parsed.rejectedStoreIds)
      ? parsed.rejectedStoreIds.filter((id): id is StoreId => Boolean(STORE_MAP[id as StoreId]))
      : [];

    const rejectedSwapIds = Array.isArray(parsed.rejectedSwapIds)
      ? parsed.rejectedSwapIds.filter((id): id is string => typeof id === 'string')
      : [];

    const appliedPlanSnapshot =
      parsed.appliedPlanSnapshot && typeof parsed.appliedPlanSnapshot === 'object'
        ? parsed.appliedPlanSnapshot
        : null;

    const rawProfile = parsed.profile;
    const profile: UserProfile = {
      city:
        rawProfile && typeof rawProfile.city === 'string' && rawProfile.city.trim()
          ? rawProfile.city
          : DEFAULT_PROFILE.city,
      neighborhood:
        rawProfile && typeof rawProfile.neighborhood === 'string'
          ? rawProfile.neighborhood
          : '',
      householdSize:
        rawProfile &&
        typeof rawProfile.householdSize === 'number' &&
        rawProfile.householdSize >= 1
          ? Math.round(rawProfile.householdSize)
          : DEFAULT_PROFILE.householdSize,
      dietaryPreferences:
        rawProfile && Array.isArray(rawProfile.dietaryPreferences)
          ? rawProfile.dietaryPreferences.filter((d): d is string => typeof d === 'string')
          : [],
    };

    return {
      basket: validBasket,
      activeStoreId: parsed.activeStoreId ?? 'lidl',
      hasChosenStore: Boolean(parsed.hasChosenStore || parsed.appliedPlanSnapshot),
      economyMode: Boolean(parsed.economyMode),
      inStoreMode: Boolean(parsed.inStoreMode),
      activeCards: Array.isArray(parsed.activeCards)
        ? parsed.activeCards
        : DEFAULT_STATE.activeCards,
      channelMode,
      missionConstraints,
      rejectedStoreIds,
      rejectedSwapIds,
      appliedPlanSnapshot,
      profile,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [state, setState] = useState<PersistedState>(() => loadInitialState());
  // Bumped when live-catalog products are refreshed, so every tab re-reads PRODUCT_MAP
  const [, setCatalogVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ids = state.basket.map((item) => item.productId);
    fetchFreshProducts(ids)
      .then((fresh) => {
        if (cancelled) return;
        const freshIds = new Set(fresh.map((product) => product.id));
        // Saved lines the catalog no longer lists stay in the basket, without any price
        const unlisted = ids
          .filter((id) => isRemoteProductId(id) && !freshIds.has(id) && PRODUCT_MAP[id])
          .map((id) => markProductUnlisted(PRODUCT_MAP[id]));
        const updated = [...fresh, ...unlisted];
        for (const product of updated) PRODUCT_MAP[product.id] = product;
        upsertCachedProducts(updated);
        dropLegacyCache();
        if (updated.length > 0) setCatalogVersion((v) => v + 1);
      })
      .catch(() => {
        // Offline or server down: keep showing the cached products
      });
    return () => {
      cancelled = true;
    };
    // Refresh once per app start; later additions already carry fresh prices
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  const activeRejectedSwaps = state.economyMode ? state.rejectedSwapIds : [];
  const rankedStores = getRankedStores(
    state.basket,
    state.activeCards,
    state.economyMode,
    state.channelMode,
    PRODUCT_MAP,
    state.rejectedStoreIds,
    activeRejectedSwaps
  );
  const splitResult =
    state.missionConstraints.maxStores === 2
      ? computeSplitTwoStores(
          state.basket,
          state.activeCards,
          state.economyMode,
          state.channelMode,
          PRODUCT_MAP,
          state.rejectedStoreIds,
          activeRejectedSwaps
        )
      : null;

  // If split was active but is no longer worthwhile or maxStores === 1, fall back cleanly
  const effectiveStoreId: StoreId | 'split' =
    state.activeStoreId === 'split' && (!splitResult || !splitResult.isWorthwhile)
      ? (rankedStores[0]?.storeId ?? 'lidl')
      : state.activeStoreId;

  const activeTotal =
    effectiveStoreId === 'split' && splitResult
      ? splitResult.totalWithDelivery
      : (rankedStores.find((s) => s.storeId === effectiveStoreId)?.totalWithDelivery ?? 0);

  const totalUnits = state.basket.reduce((sum, item) => sum + item.quantity, 0);

  const handleUpdateQty = (productId: string, delta: number) => {
    setState((prev) => ({
      ...prev,
      basket: prev.basket
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0),
    }));
  };

  const handleRemoveItem = (productId: string) => {
    setState((prev) => ({
      ...prev,
      basket: prev.basket.filter((item) => item.productId !== productId),
    }));
  };

  const handleAddProduct = (productId: string, qty = 1, product?: CanonicalProduct) => {
    if (product) {
      PRODUCT_MAP[product.id] = product;
      upsertCachedProducts([product]);
    }
    if (!PRODUCT_MAP[productId]) return;
    setState((prev) => {
      const exists = prev.basket.find((b) => b.productId === productId);
      if (exists) {
        return {
          ...prev,
          basket: prev.basket.map((b) =>
            b.productId === productId ? { ...b, quantity: b.quantity + qty } : b
          ),
        };
      }
      return {
        ...prev,
        basket: [
          ...prev.basket,
          { productId, quantity: qty, checkedInStore: false },
        ],
      };
    });
  };

  const handleAddMany = (
    items: { productId: string; quantity: number }[],
    constraints?: Partial<MissionConstraints>
  ) => {
    setState((prev) => {
      const next = [...prev.basket];
      for (const incoming of items) {
        if (!PRODUCT_MAP[incoming.productId]) continue;
        const idx = next.findIndex((b) => b.productId === incoming.productId);
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            quantity: next[idx].quantity + incoming.quantity,
          };
        } else {
          next.push({
            productId: incoming.productId,
            quantity: incoming.quantity,
            checkedInStore: false,
          });
        }
      }
      return {
        ...prev,
        basket: next,
        missionConstraints: constraints
          ? {
              budgetRon:
                constraints.budgetRon !== undefined
                  ? constraints.budgetRon
                  : prev.missionConstraints.budgetRon,
              days: constraints.days !== undefined ? constraints.days : prev.missionConstraints.days,
              maxStores:
                constraints.maxStores !== undefined
                  ? constraints.maxStores
                  : prev.missionConstraints.maxStores,
            }
          : prev.missionConstraints,
      };
    });
  };

  const handleReplaceBasketFromAi = (
    items: { productId: string; quantity: number }[],
    constraints?: Partial<MissionConstraints>
  ) => {
    const cleanBasket: BasketItem[] = items
      .filter((it) => Boolean(PRODUCT_MAP[it.productId]) && it.quantity > 0)
      .map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        checkedInStore: false,
      }));

    setState((prev) => ({
      ...prev,
      basket: cleanBasket,
      hasChosenStore: false,
      inStoreMode: false,
      rejectedStoreIds: [],
      rejectedSwapIds: [],
      appliedPlanSnapshot: null,
      missionConstraints: {
        budgetRon: constraints?.budgetRon ?? null,
        days: constraints?.days ?? null,
        maxStores: constraints?.maxStores ?? 2,
      },
    }));
  };

  const handleApplyEdits = (
    removeIds: string[],
    swaps: { fromProductId: string; toProductId: string; quantity: number }[],
    addItems: { productId: string; quantity: number }[],
    replaceExistingQuantities = false,
    constraints?: Partial<MissionConstraints>
  ) => {
    setState((prev) => {
      let next = prev.basket.filter((b) => !removeIds.includes(b.productId));

      for (const sw of swaps) {
        if (!PRODUCT_MAP[sw.toProductId]) continue;
        const existingIdx = next.findIndex((b) => b.productId === sw.fromProductId);
        if (existingIdx >= 0) {
          const oldQty = next[existingIdx].quantity;
          const wasChecked = next[existingIdx].checkedInStore;
          const nextQty = sw.quantity > 0 ? sw.quantity : oldQty;
          next = next.filter((b) => b.productId !== sw.fromProductId);
          const targetIdx = next.findIndex((b) => b.productId === sw.toProductId);
          if (targetIdx >= 0) {
            next[targetIdx] = {
              ...next[targetIdx],
              quantity: replaceExistingQuantities
                ? nextQty
                : next[targetIdx].quantity + nextQty,
            };
          } else {
            next.push({
              productId: sw.toProductId,
              quantity: nextQty,
              checkedInStore: wasChecked,
            });
          }
        }
      }

      for (const add of addItems) {
        if (!PRODUCT_MAP[add.productId]) continue;
        const idx = next.findIndex((b) => b.productId === add.productId);
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            quantity: replaceExistingQuantities
              ? add.quantity
              : next[idx].quantity + add.quantity,
          };
        } else {
          next.push({
            productId: add.productId,
            quantity: add.quantity,
            checkedInStore: false,
          });
        }
      }

      return {
        ...prev,
        basket: next,
        missionConstraints: constraints
          ? {
              budgetRon:
                constraints.budgetRon !== undefined
                  ? constraints.budgetRon
                  : prev.missionConstraints.budgetRon,
              days: constraints.days !== undefined ? constraints.days : prev.missionConstraints.days,
              maxStores:
                constraints.maxStores !== undefined
                  ? constraints.maxStores
                  : prev.missionConstraints.maxStores,
            }
          : prev.missionConstraints,
      };
    });
  };

  const handleToggleEconomyMode = (enabled: boolean) => {
    setState((prev) => {
      if (enabled) {
        return {
          ...prev,
          economyMode: true,
          rejectedSwapIds: [],
        };
      }

      // Mod Fidel: normalize any private-label basket items back to consecrated national brands
      const normalizedBasket: BasketItem[] = [];
      for (const item of prev.basket) {
        const prod = PRODUCT_MAP[item.productId];
        if (!prod) continue;
        const { resolvedProduct } = resolveProductForMode(prod, false, PRODUCT_MAP);
        const existing = normalizedBasket.find((b) => b.productId === resolvedProduct.id);
        if (existing) {
          existing.quantity += item.quantity;
          existing.checkedInStore = existing.checkedInStore || item.checkedInStore;
        } else {
          normalizedBasket.push({
            productId: resolvedProduct.id,
            quantity: item.quantity,
            checkedInStore: item.checkedInStore,
          });
        }
      }

      return {
        ...prev,
        basket: normalizedBasket,
        economyMode: false,
        rejectedSwapIds: [],
      };
    });
  };

  const handleToggleChecked = (productId: string) => {
    setState((prev) => ({
      ...prev,
      basket: prev.basket.map((item) =>
        item.productId === productId
          ? { ...item, checkedInStore: !item.checkedInStore }
          : item
      ),
    }));
  };

  const handleToggleCard = (cardId: LoyaltyCardId) => {
    setState((prev) => {
      const exists = prev.activeCards.includes(cardId);
      return {
        ...prev,
        activeCards: exists
          ? prev.activeCards.filter((id) => id !== cardId)
          : [...prev.activeCards, cardId],
      };
    });
  };

  const handleApplyOptimizationPlan = (
    targetStoreId: StoreId | 'split',
    swaps: { fromProductId: string; toProductId: string }[],
    enableEconomyMode: boolean,
    snapshot: AppliedPlanSnapshot
  ) => {
    setState((prev) => {
      let nextBasket = [...prev.basket];

      for (const sw of swaps) {
        if (!PRODUCT_MAP[sw.toProductId]) continue;
        const fromIdx = nextBasket.findIndex((b) => b.productId === sw.fromProductId);
        if (fromIdx < 0) continue;

        const fromItem = nextBasket[fromIdx];
        nextBasket = nextBasket.filter((b) => b.productId !== sw.fromProductId);
        const toIdx = nextBasket.findIndex((b) => b.productId === sw.toProductId);

        if (toIdx >= 0) {
          nextBasket[toIdx] = {
            ...nextBasket[toIdx],
            quantity: nextBasket[toIdx].quantity + fromItem.quantity,
          };
        } else {
          nextBasket.push({
            productId: sw.toProductId,
            quantity: fromItem.quantity,
            checkedInStore: fromItem.checkedInStore,
          });
        }
      }

      if (!enableEconomyMode) {
        const normalized: BasketItem[] = [];
        for (const item of nextBasket) {
          const prod = PRODUCT_MAP[item.productId];
          if (!prod) continue;
          const { resolvedProduct } = resolveProductForMode(prod, false, PRODUCT_MAP);
          const existing = normalized.find((b) => b.productId === resolvedProduct.id);
          if (existing) {
            existing.quantity += item.quantity;
            existing.checkedInStore = existing.checkedInStore || item.checkedInStore;
          } else {
            normalized.push({
              productId: resolvedProduct.id,
              quantity: item.quantity,
              checkedInStore: item.checkedInStore,
            });
          }
        }
        nextBasket = normalized;
      }

      return {
        ...prev,
        basket: nextBasket,
        activeStoreId: targetStoreId,
        hasChosenStore: true,
        economyMode: enableEconomyMode,
        rejectedSwapIds: enableEconomyMode ? prev.rejectedSwapIds : [],
        inStoreMode: true,
        appliedPlanSnapshot: snapshot,
      };
    });
    setActiveTab('basket');
  };

  const handleSetMaxStores = (maxStores: 1 | 2) => {
    setState((prev) => ({
      ...prev,
      missionConstraints: {
        ...prev.missionConstraints,
        maxStores,
      },
      activeStoreId:
        maxStores === 1 && prev.activeStoreId === 'split'
          ? (rankedStores[0]?.storeId ?? 'lidl')
          : prev.activeStoreId,
    }));
  };

  const handleToggleRejectedSwap = (fromProductId: string) => {
    setState((prev) => {
      const exists = prev.rejectedSwapIds.includes(fromProductId);
      return {
        ...prev,
        rejectedSwapIds: exists
          ? prev.rejectedSwapIds.filter((id) => id !== fromProductId)
          : [...prev.rejectedSwapIds, fromProductId],
      };
    });
  };

  const handleRejectRecommendedStore = (storeId: StoreId | 'split', splitStoreA?: StoreId) => {
    const targetToReject = storeId === 'split' ? splitStoreA : storeId;
    if (!targetToReject) return;
    setState((prev) => {
      if (prev.rejectedStoreIds.includes(targetToReject)) return prev;
      if (prev.rejectedStoreIds.length >= 8) return prev;
      return {
        ...prev,
        rejectedStoreIds: [...prev.rejectedStoreIds, targetToReject],
      };
    });
  };

  const handleResetRejections = () => {
    setState((prev) => ({
      ...prev,
      rejectedStoreIds: [],
      rejectedSwapIds: [],
    }));
  };

  const handleUpdateReceiptVerification = (
    updater: (prev: AppliedPlanSnapshot) => AppliedPlanSnapshot
  ) => {
    setState((prev) => {
      if (!prev.appliedPlanSnapshot) return prev;
      return {
        ...prev,
        appliedPlanSnapshot: updater(prev.appliedPlanSnapshot),
      };
    });
  };

  const handleUpdateProfile = (patch: Partial<UserProfile>) => {
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        ...patch,
      },
    }));
  };

  const handleChangeCity = (city: string) => {
    const onlineOnlyBucharest: StoreId[] = ['freshful', 'sezamo'];
    setState((prev) => {
      let nextRejected = [...prev.rejectedStoreIds];
      if (city !== 'București & Ilfov') {
        for (const sid of onlineOnlyBucharest) {
          if (!nextRejected.includes(sid) && STORES.length - nextRejected.length > 1) {
            nextRejected.push(sid);
          }
        }
      } else {
        nextRejected = nextRejected.filter((id) => !onlineOnlyBucharest.includes(id));
      }
      return {
        ...prev,
        rejectedStoreIds: nextRejected,
        profile: {
          ...prev.profile,
          city,
        },
      };
    });
  };

  const handleToggleStoreExcluded = (storeId: StoreId) => {
    setState((prev) => {
      const isExcluded = prev.rejectedStoreIds.includes(storeId);
      if (isExcluded) {
        return {
          ...prev,
          rejectedStoreIds: prev.rejectedStoreIds.filter((id) => id !== storeId),
        };
      }
      if (STORES.length - prev.rejectedStoreIds.length <= 1) return prev;
      return {
        ...prev,
        rejectedStoreIds: [...prev.rejectedStoreIds, storeId],
      };
    });
  };

  const handleResetAllPreferences = () => {
    setState((prev) => ({
      ...DEFAULT_STATE,
      basket: prev.basket,
    }));
  };

  const navItems: {
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: typeof ShoppingBasket;
  }[] = [
    { id: 'home', label: 'Acasă', shortLabel: 'Acasă', icon: House },
    { id: 'ai', label: 'Listă', shortLabel: 'Listă', icon: ChefHat },
    { id: 'basket', label: 'Coș', shortLabel: 'Coș', icon: ShoppingBasket },
    { id: 'matrix', label: 'Compară', shortLabel: 'Compară', icon: LayoutGrid },
    { id: 'profile', label: 'Profil', shortLabel: 'Profil', icon: User },
  ];

  return (
    <div className="min-h-dvh bg-[#FFF6EE] text-[#421726] flex flex-col">
      {/* Unified Responsive Header (renders logo in a single place) */}
      <header className="hidden md:block md:sticky md:top-0 md:z-30 md:bg-[#FFF6EE]/95 md:backdrop-blur-sm md:border-b md:border-[#EFE2D8]">
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-3 pb-1.5 md:py-0 md:h-[64px] flex items-center justify-between gap-4 md:gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="text-xl font-extrabold tracking-tight text-[#421726] whitespace-nowrap shrink-0"
          >
            Beavy
          </button>

          <nav
            className="hidden md:flex items-center gap-6"
            aria-label="Parcurs de cumpărături"
          >
            {navItems.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`py-2 text-sm font-bold whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? 'text-[#421726] border-[#421726]'
                      : 'text-[#765B60] border-transparent hover:text-[#421726]'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'basket' && totalUnits > 0 ? ` (${totalUnits})` : ''}
                </button>
              );
            })}
          </nav>

          {activeTab !== 'ai' ? (
            <button
              type="button"
              onClick={() =>
                setActiveTab(state.hasChosenStore ? 'basket' : 'matrix')
              }
              className="text-xs font-extrabold text-[#421726] md:hover:underline underline-offset-4 whitespace-nowrap shrink-0 tabular-nums"
            >
              {!state.hasChosenStore ? (
                <>
                  <span className="text-[#765B60] font-bold">{totalUnits} buc</span>
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  <span>Compară magazine</span>
                </>
              ) : (
                <>
                  <span className="md:hidden text-[#765B60] font-bold">
                    {totalUnits} buc
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                  </span>
                  {effectiveStoreId === 'split'
                    ? `2 magazine · ${formatRon(activeTotal)}`
                    : `${STORE_MAP[effectiveStoreId].shortName} · ${formatRon(activeTotal)}`}
                </>
              )}
            </button>
          ) : (
            <div className="hidden md:block w-24 shrink-0" aria-hidden="true" />
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 md:px-6 pt-4 pb-36 md:py-10">
        {activeTab === 'home' && (
          <HomeTab
            basket={state.basket}
            totalUnits={totalUnits}
            economyMode={state.economyMode}
            activeCards={state.activeCards}
            storeId={effectiveStoreId === 'split' ? (rankedStores[0]?.storeId ?? 'lidl') : effectiveStoreId}
            hasChosenStore={state.hasChosenStore}
            bestStore={
              rankedStores[0]
                ? { storeId: rankedStores[0].storeId, total: rankedStores[0].totalWithDelivery }
                : null
            }
            onAddProduct={(pid, prod) => handleAddProduct(pid, 1, prod)}
            onUpdateQty={handleUpdateQty}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'basket' && (
          <BasketTab
            basket={state.basket}
            activeStoreId={effectiveStoreId}
            hasChosenStore={state.hasChosenStore}
            channelMode={state.channelMode}
            economyMode={state.economyMode}
            rejectedSwapIds={state.rejectedSwapIds}
            onToggleRejectedSwap={handleToggleRejectedSwap}
            inStoreMode={state.inStoreMode}
            onToggleInStoreMode={() =>
              setState((prev) => ({ ...prev, inStoreMode: !prev.inStoreMode }))
            }
            activeCards={state.activeCards}
            appliedPlanSnapshot={state.appliedPlanSnapshot}
            missionBudgetRon={state.missionConstraints.budgetRon}
            onUpdateReceiptVerification={handleUpdateReceiptVerification}
            onUpdateQty={handleUpdateQty}
            onRemoveItem={handleRemoveItem}
            onToggleChecked={handleToggleChecked}
            onAddProduct={(pid, prod) => handleAddProduct(pid, 1, prod)}
            onNavigateTab={setActiveTab}
            onSelectStore={(storeId, nextEconomyMode) =>
              setState((prev) => ({
                ...prev,
                activeStoreId: storeId,
                hasChosenStore: true,
                economyMode: nextEconomyMode ?? prev.economyMode,
              }))
            }
          />
        )}

        {activeTab === 'ai' && (
          <AiChatTab
            basket={state.basket}
            economyMode={state.economyMode}
            userProfile={state.profile}
            missionBudgetRon={state.missionConstraints.budgetRon}
            missionMaxStores={state.missionConstraints.maxStores}
            onAddItemsToBasket={handleAddMany}
            onReplaceBasketFromAi={handleReplaceBasketFromAi}
            onApplyEditsToBasket={handleApplyEdits}
            onNavigateToBasket={() => setActiveTab('basket')}
            onNavigateToCompare={() => setActiveTab('matrix')}
          />
        )}

        {activeTab === 'matrix' && (
          <PlanScreen
            basket={state.basket}
            activeCards={state.activeCards}
            economyMode={state.economyMode}
            activeStoreId={effectiveStoreId}
            hasChosenStore={state.hasChosenStore}
            filterMode={state.channelMode}
            missionConstraints={state.missionConstraints}
            rejectedStoreIds={state.rejectedStoreIds}
            rejectedSwapIds={state.rejectedSwapIds}
            onToggleEconomyMode={handleToggleEconomyMode}
            onChangeFilterMode={(mode) =>
              setState((prev) => ({ ...prev, channelMode: mode }))
            }
            onChangeMaxStores={handleSetMaxStores}
            onToggleRejectedSwap={handleToggleRejectedSwap}
            onRejectRecommendedStore={handleRejectRecommendedStore}
            onResetRejections={handleResetRejections}
            onSelectStore={(storeId, nextEconomyMode) =>
              setState((prev) => ({
                ...prev,
                activeStoreId: storeId,
                hasChosenStore: true,
                economyMode: nextEconomyMode ?? prev.economyMode,
              }))
            }
            onApplyPlan={handleApplyOptimizationPlan}
            onToggleCard={handleToggleCard}
            onNavigateToBasket={() => setActiveTab('basket')}
            onNavigateToAi={() => setActiveTab('ai')}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileTab
            profile={state.profile}
            basket={state.basket}
            activeCards={state.activeCards}
            activeStoreId={effectiveStoreId}
            economyMode={state.economyMode}
            channelMode={state.channelMode}
            maxStores={state.missionConstraints.maxStores}
            budgetRon={state.missionConstraints.budgetRon}
            excludedStoreIds={state.rejectedStoreIds}
            onUpdateProfile={handleUpdateProfile}
            onChangeCity={handleChangeCity}
            onToggleStoreExcluded={handleToggleStoreExcluded}
            onToggleCard={handleToggleCard}
            onChangeChannelMode={(mode) =>
              setState((prev) => ({ ...prev, channelMode: mode }))
            }
            onChangeMaxStores={handleSetMaxStores}
            onChangeBudgetRon={(budget) =>
              setState((prev) => ({
                ...prev,
                missionConstraints: {
                  ...prev.missionConstraints,
                  budgetRon: budget,
                },
              }))
            }
            onToggleEconomyMode={handleToggleEconomyMode}
            onResetAllPreferences={handleResetAllPreferences}
          />
        )}
      </main>

      {/* Mobile floating tab bar: dark pill, active tab shows its label */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 px-3 pb-2 bg-[#FFF6EE]"
        aria-label="Navigare mobilă"
      >
        <div className="h-14 px-1.5 rounded-full bg-[#421726]/95 backdrop-blur-xl shadow-[0_8px_24px_rgba(66,23,38,0.25)] flex items-center justify-between">
          {navItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
                className={`relative h-11 min-w-[44px] rounded-full flex items-center justify-center gap-1.5 transition-all ${
                  isActive ? 'px-4 bg-[#FFF6EE] text-[#421726]' : 'px-2.5 text-[#FCE2DB]'
                }`}
              >
                <span className="relative">
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.3 : 1.9} aria-hidden="true" />
                  {tab.id === 'basket' && totalUnits > 0 && (
                    <span className="absolute -top-2 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#F78D79] text-[#421726] text-[10px] font-extrabold flex items-center justify-center tabular-nums">
                      {totalUnits}
                    </span>
                  )}
                </span>
                {isActive && (
                  <span className="text-[13px] font-extrabold whitespace-nowrap">{tab.shortLabel}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
