import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChefHat,
  ChevronRight,
  LayoutGrid,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShoppingBasket,
  X,
} from 'lucide-react';
import { PRODUCT_MAP } from '../data/catalog.ts';
import type { MissionConstraints } from '../App.tsx';
import type {
  AiStructuredCard,
  BasketItem,
  ChatMessage,
  UserProfile,
} from '../types.ts';
import { formatRon, resolveProductForMode } from '../utils/pricing.ts';
import { upsertCachedProducts } from '../utils/productCache.ts';
import { getBestVerifiedOffer } from '../utils/productDisplay.ts';
import { STORE_MAP } from '../data/stores.ts';
import { ProductThumbnail } from './ProductThumbnail.tsx';
import { LargeTitle } from './ios/Grouped.tsx';

interface AiChatTabProps {
  basket: BasketItem[];
  economyMode: boolean;
  userProfile?: UserProfile;
  missionBudgetRon?: number | null;
  missionMaxStores?: 1 | 2;
  onAddItemsToBasket: (
    items: Array<{ productId: string; quantity: number }>,
    constraints?: Partial<MissionConstraints>
  ) => void;
  onReplaceBasketFromAi: (
    items: Array<{ productId: string; quantity: number }>,
    constraints?: Partial<MissionConstraints>
  ) => void;
  onApplyEditsToBasket: (
    removeIds: string[],
    swaps: Array<{ fromProductId: string; toProductId: string; quantity: number }>,
    addItems: Array<{ productId: string; quantity: number }>,
    replaceExistingQuantities?: boolean,
    constraints?: Partial<MissionConstraints>
  ) => void;
  onNavigateToBasket: () => void;
  onNavigateToCompare: () => void;
}

interface ActiveAiListContext {
  title: string;
  servings: number;
  items: Array<{ productId: string; quantity: number }>;
}

interface PersistedChatState {
  messages: ChatMessage[];
  appliedCardIds: Record<string, boolean>;
  activeAiList: ActiveAiListContext | null;
  introDismissed?: boolean;
}

const CHAT_STORAGE_KEY = 'beavy_ai_chat_v1';

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Spune-mi rețeta, bugetul, numărul de persoane sau produsele dorite. Transform totul în produse reale de pe raft, ajustezi cantitățile și le adaugi direct în coș.',
};

const STARTER_SUGGESTIONS = [
  '300 lei, 2 persoane, 5 zile',
  'Vreau să fac paste carbonara pentru 4 persoane',
  'Cină rapidă cu somon sub 60 lei',
  '2 lapte, unt 82%, 10 ouă și banane',
];

const REFINEMENT_SUGGESTIONS = [
  'Fă pentru 6 persoane',
  'Scoate untul din listă',
  'Schimbă spaghetele cu penne',
  'Adaugă 1 lapte fără lactoză și 1 făină 000',
];

function loadChatState(): PersistedChatState {
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) {
      return {
        messages: [INITIAL_WELCOME_MESSAGE],
        appliedCardIds: {},
        activeAiList: null,
        introDismissed: false,
      };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedChatState>;
    const msgs =
      Array.isArray(parsed.messages) && parsed.messages.length > 0
        ? parsed.messages
        : [INITIAL_WELCOME_MESSAGE];
    return {
      messages: msgs,
      appliedCardIds: parsed.appliedCardIds ?? {},
      activeAiList: parsed.activeAiList ?? null,
      introDismissed: Boolean(parsed.introDismissed),
    };
  } catch {
    return {
      messages: [INITIAL_WELCOME_MESSAGE],
      appliedCardIds: {},
      activeAiList: null,
      introDismissed: false,
    };
  }
}

function RecipeListCard({
  card,
  basket,
  economyMode,
  applied,
  onReplaceAndBasket,
  onApplyAndContinue,
  onApplyOnly,
  onNavigateToBasket,
}: {
  card: AiStructuredCard;
  basket: BasketItem[];
  economyMode: boolean;
  applied: boolean;
  onReplaceAndBasket: (selectedItems: Array<{ productId: string; quantity: number }>) => void;
  onApplyAndContinue: (selectedItems: Array<{ productId: string; quantity: number }>) => void;
  onApplyOnly: (selectedItems: Array<{ productId: string; quantity: number }>) => void;
  onNavigateToBasket: () => void;
}) {
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    card.items.forEach((it) => {
      init[it.productId] = true;
    });
    return init;
  });

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    card.items.forEach((it) => {
      init[it.productId] = it.quantity;
    });
    return init;
  });

  const adjustItemQty = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] ?? 1;
      const next = Math.max(1, Math.min(24, current + delta));
      return { ...prev, [productId]: next };
    });
  };

  const selectedItems = card.items
    .filter((it) => checkedIds[it.productId])
    .map((it) => ({
      ...it,
      quantity: quantities[it.productId] ?? it.quantity,
    }));

  const toggleItem = (productId: string) => {
    setCheckedIds((prev) => ({ ...prev, [productId]: !prev[productId] }));
  };

  const swappedToIds = new Set(card.swapItems.map((s) => s.toProductId));
  const basketMap = new Map(basket.map((b) => [b.productId, b.quantity]));
  const quantityUpdates =
    card.cardType === 'edit'
      ? selectedItems
          .filter((it) => {
            if (swappedToIds.has(it.productId)) return false;
            const prevQty = basketMap.get(it.productId);
            return prevQty !== undefined && prevQty !== it.quantity;
          })
          .map((it) => ({
            productId: it.productId,
            fromQty: basketMap.get(it.productId)!,
            toQty: it.quantity,
          }))
      : [];
  const newItemsCount = selectedItems.filter(
    (it) => !swappedToIds.has(it.productId) && !basketMap.has(it.productId)
  ).length;
  const hasEdits =
    card.removeProductIds.length > 0 || card.swapItems.length > 0 || quantityUpdates.length > 0;

  return (
    <div className="mt-4 bg-white rounded-[16px] overflow-hidden">
      {/* Calm Recipe Header */}
      <div className="px-5 py-4 border-b border-[#EFE2D8] flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-extrabold text-[#421726]">
            {card.title}
          </h3>
          {selectedItems.length > 0 && (
            <p className="mt-0.5 text-xs sm:text-sm text-[#765B60] tabular-nums">
              {selectedItems.length} {selectedItems.length === 1 ? 'produs selectat' : 'produse selectate'}
              {card.servings > 0 && ` · ${card.servings} persoane/porții`}
              {card.days && card.days > 0 && ` · ${card.days} zile`}
              {card.budgetRon && card.budgetRon > 0 && ` · Buget țintă ${card.budgetRon} lei`}
            </p>
          )}
        </div>
      </div>

      {/* Edit preview for removes, swaps & quantity updates */}
      {hasEdits && (
        <div className="px-5 py-3 bg-[#FFF6EE]/70 border-b border-[#EFE2D8] space-y-1 text-xs text-[#421726]">
          {card.swapItems.map((sw) => {
            const fromP = PRODUCT_MAP[sw.fromProductId];
            const toP = PRODUCT_MAP[sw.toProductId];
            if (!fromP || !toP) return null;
            return (
              <p key={`${sw.fromProductId}-${sw.toProductId}`}>
                Înlocuire în coș: {fromP.canonicalName} → <strong>{toP.canonicalName}</strong>
              </p>
            );
          })}
          {quantityUpdates.map((upd) => {
            const p = PRODUCT_MAP[upd.productId];
            if (!p) return null;
            return (
              <p key={upd.productId} className="tabular-nums">
                Actualizare cantitate: <strong>{p.canonicalName}</strong> ({upd.fromQty} →{' '}
                {upd.toQty})
              </p>
            );
          })}
          {card.removeProductIds.map((rid) => {
            const remP = PRODUCT_MAP[rid];
            if (!remP) return null;
            return (
              <p key={rid} className="text-[#765B60]">
                Se elimină din coș: <strong className="text-[#421726]">{remP.canonicalName}</strong>
              </p>
            );
          })}
        </div>
      )}

      {/* Hairline-divided Canonical Ingredient Rows (Pasul 2: ajustare cantități + Pasul 3: EAN & gramaj) */}
      {card.items.length > 0 && (
        <div className="divide-y divide-[#EFE2D8]">
          {card.items.map((item) => {
            const baseProd = PRODUCT_MAP[item.productId];
            if (!baseProd) return null;
            const { resolvedProduct } = resolveProductForMode(
              baseProd,
              economyMode,
              PRODUCT_MAP
            );
            const currentQty = quantities[item.productId] ?? item.quantity;
            const isChecked = Boolean(checkedIds[item.productId]);
            const bestOffer = getBestVerifiedOffer(resolvedProduct, []);
            const sizeLabel = item.packageSize || resolvedProduct.packageSize;
            const metaLine = [
              sizeLabel,
              bestOffer
                ? `de la ${formatRon(bestOffer.price)} · ${STORE_MAP[bestOffer.storeId].shortName}`
                : 'fără preț verificat',
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <div
                key={item.productId}
                className={`px-5 py-4 transition-opacity ${
                  isChecked ? 'opacity-100' : 'opacity-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleItem(item.productId)}
                    aria-pressed={isChecked}
                    aria-label={
                      isChecked
                        ? `Am deja ${resolvedProduct.canonicalName} în cămară`
                        : `Include ${resolvedProduct.canonicalName}`
                    }
                    className={`relative before:absolute before:-inset-1.5 before:content-[''] mt-0.5 w-8 h-8 rounded-[10px] border shrink-0 flex items-center justify-center transition-colors ${
                      isChecked
                        ? 'bg-[#421726] border-[#421726] text-white'
                        : 'bg-[#FFF6EE] border-[#EFE2D8] text-transparent hover:border-[#421726]'
                    }`}
                  >
                    <Check className="w-4 h-4" aria-hidden="true" />
                  </button>

                  <ProductThumbnail
                    category={resolvedProduct.category}
                    name={resolvedProduct.canonicalName}
                    imageUrl={resolvedProduct.imageUrl}
                    size="sm"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1 basis-[9rem]">
                        <p className="text-sm font-bold text-[#421726] leading-snug">
                          {currentQty}× {resolvedProduct.canonicalName}
                        </p>
                        {item.fromLiveCatalog && (
                          <p className="mt-0.5 text-[11px] font-semibold text-[#765B60]">
                            Din catalogul extins · verifică dacă e produsul dorit
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-[#765B60] tabular-nums">
                          <span>{metaLine}</span>
                          {item.isPantryStaple && (
                            <>
                              <span className="mx-1.5" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-semibold text-[#421726]">
                                De bază în cămară (debifează dacă ai)
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-col items-end shrink-0">
                        <div className="inline-flex items-center rounded-full border border-[#EFE2D8] bg-[#FFF6EE]">
                          <button
                            type="button"
                            onClick={() => adjustItemQty(item.productId, -1)}
                            disabled={currentQty <= 1}
                            aria-label={`Scade cantitatea pentru ${resolvedProduct.canonicalName}`}
                            className="w-11 h-11 flex items-center justify-center text-[#421726] hover:bg-[#FCE2DB]/60 rounded-l-full disabled:opacity-35"
                          >
                            <Minus className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <span className="px-1.5 text-xs font-bold text-[#421726] tabular-nums min-w-[20px] text-center">
                            {currentQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustItemQty(item.productId, 1)}
                            aria-label={`Crește cantitatea pentru ${resolvedProduct.canonicalName}`}
                            className="w-11 h-11 flex items-center justify-center text-[#421726] hover:bg-[#FCE2DB]/60 rounded-r-full"
                          >
                            <Plus className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Journey Forward Footer */}
      <div className="px-5 py-4 bg-[#FFF6EE]/65 border-t border-[#EFE2D8] flex flex-wrap items-center justify-between gap-3">
        {!applied ? (
          card.cardType === 'edit' ? (
            <>
              <button
                type="button"
                disabled={selectedItems.length === 0 && card.removeProductIds.length === 0 && card.swapItems.length === 0}
                onClick={() =>
                  onApplyAndContinue(
                    selectedItems.map((it) => ({
                      productId: it.productId,
                      quantity: it.quantity,
                    }))
                  )
                }
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-full bg-[#421726] text-white text-sm font-bold hover:bg-[#5A2236] disabled:opacity-45 transition-colors"
              >
                <span>
                  Aplică în coș și continuă
                  {newItemsCount > 0 ? ` (+${newItemsCount})` : ''}
                </span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() =>
                  onApplyOnly(
                    selectedItems.map((it) => ({
                      productId: it.productId,
                      quantity: it.quantity,
                    }))
                  )
                }
                className="text-xs font-semibold text-[#765B60] hover:text-[#421726] underline underline-offset-4"
              >
                Actualizează și rămâi aici
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={selectedItems.length === 0}
                onClick={() =>
                  onApplyAndContinue(
                    selectedItems.map((it) => ({
                      productId: it.productId,
                      quantity: it.quantity,
                    }))
                  )
                }
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-full bg-[#421726] text-white text-sm font-bold hover:bg-[#5A2236] disabled:opacity-45 transition-colors"
              >
                <span className="tabular-nums">
                  {basket.length > 0
                    ? `Adaugă în coș (${selectedItems.length} ${selectedItems.length === 1 ? 'produs' : 'produse'})`
                    : `Creează coșul (${selectedItems.length} ${selectedItems.length === 1 ? 'produs' : 'produse'})`}
                </span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>

              <div className="flex flex-wrap items-center gap-4">
                {basket.length > 0 && (
                  <button
                    type="button"
                    disabled={selectedItems.length === 0}
                    onClick={() =>
                      onReplaceAndBasket(
                        selectedItems.map((it) => ({
                          productId: it.productId,
                          quantity: it.quantity,
                        }))
                      )
                    }
                    className="text-xs font-semibold text-[#421726] hover:underline underline-offset-4 disabled:opacity-45"
                  >
                    Înlocuiește coșul curent
                  </button>
                )}
                <button
                  type="button"
                  disabled={selectedItems.length === 0}
                  onClick={() =>
                    onApplyOnly(
                      selectedItems.map((it) => ({
                        productId: it.productId,
                        quantity: it.quantity,
                      }))
                    )
                  }
                  className="text-xs font-semibold text-[#765B60] hover:text-[#421726] underline underline-offset-4 disabled:opacity-45"
                >
                  Salvează și rămâi să rafinezi
                </button>
              </div>
            </>
          )
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#263B1D]">
              <Check className="w-4 h-4" aria-hidden="true" />
              Adăugat în Coșul meu
            </span>
            <button
              type="button"
              onClick={onNavigateToBasket}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-full bg-[#421726] text-white text-xs font-bold hover:bg-[#5A2236] transition-colors"
            >
              <span>Continuă la Coșul meu</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AiChatTab({
  basket,
  economyMode,
  userProfile,
  missionBudgetRon,
  missionMaxStores,
  onAddItemsToBasket,
  onReplaceBasketFromAi,
  onApplyEditsToBasket,
  onNavigateToBasket,
  onNavigateToCompare,
}: AiChatTabProps) {
  const [chatState, setChatState] = useState<PersistedChatState>(() => loadChatState());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatState));
    } catch {
      // Ignore storage errors
    }
  }, [chatState]);

  useEffect(() => {
    if (chatState.messages.length > 1 || loading) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [chatState.messages.length, loading]);

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const nextMessages = [...chatState.messages, userMsg];
    setChatState((prev) => ({ ...prev, messages: nextMessages }));
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/ai-basket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: nextMessages
            .filter((m) => !m.error)
            .map((m) => ({ role: m.role, text: m.text })),
          // Names travel with the ids so the assistant also sees live-catalog products
          currentBasket: basket.map((b) => ({
            productId: b.productId,
            quantity: b.quantity,
            name: PRODUCT_MAP[b.productId]?.canonicalName,
            packageSize: PRODUCT_MAP[b.productId]?.packageSize,
          })),
          activeAiList: chatState.activeAiList
            ? {
                ...chatState.activeAiList,
                items: chatState.activeAiList.items.map((it) => ({
                  ...it,
                  name: PRODUCT_MAP[it.productId]?.canonicalName,
                })),
              }
            : null,
          userProfile: {
            ...(userProfile ?? {}),
            budgetRon: missionBudgetRon ?? null,
            maxStores: missionMaxStores ?? 2,
            economyMode,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Eroare de comunicare cu serverul.');
      }

      const rawCard = data.card as AiStructuredCard | undefined;
      // Live-catalog products are registered once, then dropped from the saved chat message
      const liveProducts = rawCard?.liveProducts ?? [];
      for (const product of liveProducts) PRODUCT_MAP[product.id] = product;
      upsertCachedProducts(liveProducts);
      const returnedCard: AiStructuredCard | undefined = rawCard
        ? { ...rawCard, liveProducts: undefined }
        : undefined;
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data.replyText,
        card: returnedCard,
      };

      setChatState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMsg],
        activeAiList:
          returnedCard &&
          returnedCard.items.length > 0 &&
          returnedCard.intent !== 'price_query'
            ? {
                title: returnedCard.title,
                servings: returnedCard.servings,
                items: returnedCard.items.map((it) => ({
                  productId: it.productId,
                  quantity: it.quantity,
                })),
              }
            : prev.activeAiList,
      }));
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Nu am putut contacta asistentul AI.';
      setChatState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            text: '',
            error: errMsg,
          },
        ],
      }));
    } finally {
      setLoading(false);
    }
  };

  const extractConstraintsFromCard = (card: AiStructuredCard): Partial<MissionConstraints> => ({
    budgetRon: card.budgetRon && card.budgetRon > 0 ? card.budgetRon : null,
    days: card.days && card.days > 0 ? card.days : null,
    maxStores: card.maxStores === 1 ? 1 : 2,
  });

  const handleApplyCard = (
    msgId: string,
    card: AiStructuredCard,
    selectedItems: Array<{ productId: string; quantity: number }>,
    mode: 'replace_and_basket' | 'merge_and_basket' | 'merge_stay'
  ) => {
    const constraints = extractConstraintsFromCard(card);
    if (mode === 'replace_and_basket') {
      onReplaceBasketFromAi(selectedItems, constraints);
      setChatState((prev) => ({
        ...prev,
        appliedCardIds: { ...prev.appliedCardIds, [msgId]: true },
        activeAiList: {
          title: card.title,
          servings: card.servings,
          items: selectedItems,
        },
      }));
      onNavigateToBasket();
      return;
    }

    if (card.cardType === 'edit' || card.replaceExistingQuantities) {
      const swappedToIds = new Set(card.swapItems.map((s) => s.toProductId));
      const nonSwappedAdds = selectedItems.filter(
        (it) => !swappedToIds.has(it.productId)
      );
      onApplyEditsToBasket(
        card.removeProductIds,
        card.swapItems,
        nonSwappedAdds,
        Boolean(card.replaceExistingQuantities ?? card.intent === 'list_refine'),
        constraints
      );
    } else {
      onAddItemsToBasket(selectedItems, constraints);
    }
    setChatState((prev) => ({
      ...prev,
      appliedCardIds: { ...prev.appliedCardIds, [msgId]: true },
    }));
    if (mode === 'merge_and_basket') {
      onNavigateToBasket();
    }
  };

  const handleResetChat = () => {
    setChatState({
      messages: [INITIAL_WELCOME_MESSAGE],
      appliedCardIds: {},
      activeAiList: null,
      introDismissed: false,
    });
  };

  const activeSuggestions = chatState.activeAiList
    ? REFINEMENT_SUGGESTIONS
    : STARTER_SUGGESTIONS;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <LargeTitle
        eyebrow="Asistentul Beavy"
        title="Ce gătim azi?"
        subtitle="Scrie o rețetă, un buget sau o listă. Produsele ajung în coș."
        trailing={
          chatState.messages.length > 1 ? (
            <button
              type="button"
              onClick={handleResetChat}
              className="inline-flex items-center gap-1.5 min-h-[44px] text-[15px] font-bold text-[#421726] shrink-0"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Nouă
            </button>
          ) : undefined
        }
      />

      {/* How it works: three tappable rows, dismissible */}
      {!chatState.introDismissed && (
        <section className="space-y-1.5" aria-label="Cum funcționează Beavy">
          <div className="px-1 flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-[#421726]">
              Cum funcționează
            </h2>
            <button
              type="button"
              onClick={() => setChatState((prev) => ({ ...prev, introDismissed: true }))}
              aria-label="Ascunde ghidul introductiv"
              className="min-h-[44px] -my-3 text-[15px] font-semibold text-[#421726]"
            >
              Ascunde
            </button>
          </div>
          <div className="bg-white rounded-[12px] overflow-hidden">
            {[
              {
                key: 'list',
                icon: ChefHat,
                tint: 'bg-[#FCE2DB]',
                title: 'Cere o rețetă sau o listă',
                text: 'Scrie ce gătești sau bugetul și primești produse reale, cu prețuri verificate.',
                onClick: () => inputRef.current?.focus(),
              },
              {
                key: 'basket',
                icon: ShoppingBasket,
                tint: 'bg-[#FFF6EE] border border-[#EFE2D8]',
                title: 'Ajustează coșul',
                text: 'Schimbi cantitățile și scoți ce ai deja acasă.',
                onClick: onNavigateToBasket,
              },
              {
                key: 'compare',
                icon: LayoutGrid,
                tint: 'bg-[#DBE3C6]',
                title: 'Compară magazinele',
                text: 'Vezi unde ieși cel mai ieftin, fără să lipsească produse.',
                onClick: onNavigateToCompare,
              },
            ].map(({ key, icon: Icon, tint, title, text, onClick }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className="relative w-full min-h-[64px] px-4 py-3 flex items-center gap-3 text-left active:bg-[#EFE2D8]/50 after:content-[''] after:absolute after:bottom-0 after:left-[68px] after:right-0 after:h-px after:bg-[#EFE2D8] last:after:hidden"
              >
                <span className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-[#421726] ${tint}`}>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-[#421726]">{title}</span>
                  <span className="block text-[13px] text-[#765B60] leading-snug">{text}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-[#765B60]/60 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Open Editorial Conversation Flow (no cramped box container) */}
      <div className="space-y-6">
        {chatState.messages.map((msg) => (
          <div key={msg.id}>
            {msg.error ? (
              <div className="rounded-[16px] p-4 bg-[#FCE2DB]/70 border border-[#F78D79] text-sm text-[#421726]">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-2">
                    <p className="font-semibold">{msg.error}</p>
                    <button
                      type="button"
                      onClick={() => {
                        const lastUser = [...chatState.messages]
                          .reverse()
                          .find((m) => m.role === 'user');
                        if (lastUser) sendPrompt(lastUser.text);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#421726] text-white text-xs font-bold"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      Reîncearcă
                    </button>
                  </div>
                </div>
              </div>
            ) : msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-[20px] rounded-br-[6px] px-4 py-2.5 bg-[#421726] text-white text-[15px] font-medium leading-relaxed">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm sm:text-base text-[#421726] leading-relaxed max-w-2xl">
                  {msg.text}
                </p>
                {msg.card &&
                  (msg.card.items.length > 0 ||
                    msg.card.removeProductIds.length > 0 ||
                    msg.card.swapItems.length > 0) && (
                    <RecipeListCard
                      card={msg.card}
                      basket={basket}
                      economyMode={economyMode}
                      applied={Boolean(chatState.appliedCardIds[msg.id])}
                      onReplaceAndBasket={(selectedItems) =>
                        handleApplyCard(msg.id, msg.card!, selectedItems, 'replace_and_basket')
                      }
                      onApplyAndContinue={(selectedItems) =>
                        handleApplyCard(msg.id, msg.card!, selectedItems, 'merge_and_basket')
                      }
                      onApplyOnly={(selectedItems) =>
                        handleApplyCard(msg.id, msg.card!, selectedItems, 'merge_stay')
                      }
                      onNavigateToBasket={onNavigateToBasket}
                    />
                  )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <p className="text-sm font-medium text-[#765B60]">
            Beavy generează lista cu ambalajele potrivite...
          </p>
        )}
        <div ref={bottomAnchorRef} />
      </div>

      {/* Calm Composer Surface */}
      <div className="sticky bottom-[4.5rem] md:bottom-4 z-20 -mx-4 px-4 py-3 bg-[#FFF6EE]/85 backdrop-blur-xl border-t border-[#EFE2D8]/70 md:border-0 space-y-3">
        <div className="flex items-center md:flex-wrap gap-2 overflow-x-auto md:overflow-visible no-scrollbar">
          {activeSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={loading}
              onClick={() => sendPrompt(suggestion)}
              className="px-3.5 py-1.5 min-h-[44px] rounded-full bg-white text-[13px] font-semibold text-[#421726] hover:bg-[#FCE2DB]/60 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(input);
          }}
          className="flex items-center gap-2"
        >
          <label htmlFor="ai-basket-input" className="sr-only">
            Scrie rețeta, bugetul sau rafinarea listei
          </label>
          <input
            ref={inputRef}
            id="ai-basket-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              chatState.activeAiList
                ? 'Rafinează: ex. „fă pentru 6 persoane” sau „scoate untul”...'
                : 'Ex: Paste carbonara pentru 4 persoane...'
            }
            className="flex-1 min-h-[44px] px-4 py-2 rounded-full bg-white border border-transparent text-[15px] text-[#421726] placeholder:text-[#765B60] focus:outline-none focus:border-[#421726]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Trimite cererea către asistentul AI"
            className="w-11 h-11 rounded-full bg-[#421726] text-white flex items-center justify-center hover:bg-[#5A2236] disabled:opacity-40 transition-colors shrink-0"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
