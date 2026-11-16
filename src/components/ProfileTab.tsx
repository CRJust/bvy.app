import { useMemo, useState } from 'react';
import {
  Check,
  CreditCard,
  MapPin,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Store,
} from 'lucide-react';
import { PRODUCT_MAP } from '../data/catalog.ts';
import { LOYALTY_CARDS, STORE_MAP, STORES } from '../data/stores.ts';
import type {
  BasketItem,
  LoyaltyCardId,
  StoreFilterMode,
  StoreId,
  UserProfile,
} from '../types.ts';
import { calculateStoreBasketSummary, formatRon, getRankedStores } from '../utils/pricing.ts';
import { LargeTitle } from './ios/Grouped.tsx';

interface ProfileTabProps {
  profile: UserProfile;
  basket: BasketItem[];
  activeCards: LoyaltyCardId[];
  activeStoreId: StoreId | 'split';
  economyMode: boolean;
  channelMode: StoreFilterMode;
  maxStores: 1 | 2;
  budgetRon: number | null;
  excludedStoreIds: StoreId[];
  onUpdateProfile: (patch: Partial<UserProfile>) => void;
  onChangeCity: (city: string) => void;
  onToggleStoreExcluded: (storeId: StoreId) => void;
  onToggleCard: (cardId: LoyaltyCardId) => void;
  onChangeChannelMode: (mode: StoreFilterMode) => void;
  onChangeMaxStores: (maxStores: 1 | 2) => void;
  onChangeBudgetRon: (budget: number | null) => void;
  onToggleEconomyMode: (enabled: boolean) => void;
  onResetAllPreferences: () => void;
}

const CITIES = [
  'București & Ilfov',
  'Cluj-Napoca',
  'Timișoara',
  'Iași',
  'Brașov',
  'Constanța',
  'Alt oraș',
] as const;

const DIETARY_OPTIONS = [
  { id: 'fara_lactoza', label: 'Fără lactoză' },
  { id: 'fara_zahar', label: 'Fără zahăr adăugat' },
  { id: 'bio', label: 'Prefer produse Bio' },
  { id: 'fara_carne', label: 'Fără carne' },
] as const;

const BUDGET_PRESETS = [
  { label: 'Fără limită', value: null },
  { label: '150 lei', value: 150 },
  { label: '250 lei', value: 250 },
  { label: '300 lei', value: 300 },
  { label: '450 lei', value: 450 },
] as const;

export function ProfileTab({
  profile,
  basket,
  activeCards,
  activeStoreId,
  economyMode,
  channelMode,
  maxStores,
  budgetRon,
  excludedStoreIds,
  onUpdateProfile,
  onChangeCity,
  onToggleStoreExcluded,
  onToggleCard,
  onChangeChannelMode,
  onChangeMaxStores,
  onChangeBudgetRon,
  onToggleEconomyMode,
  onResetAllPreferences,
}: ProfileTabProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  // With a 2-store plan there is no single "active" store: use the one that covers most of the basket
  const resolvedStore: StoreId =
    activeStoreId === 'split'
      ? (getRankedStores(basket, activeCards, economyMode, channelMode, PRODUCT_MAP, excludedStoreIds)[0]
          ?.storeId ?? 'lidl')
      : activeStoreId;

  // What each card is really worth on today's basket, at the store where it helps most
  const cardImpacts = useMemo(() => {
    const impacts: Partial<Record<LoyaltyCardId, { savings: number; storeId: StoreId }>> = {};
    if (basket.length === 0) return impacts;
    for (const card of LOYALTY_CARDS) {
      for (const storeId of card.storeIds) {
        const without = calculateStoreBasketSummary(basket, storeId, [], economyMode, channelMode, PRODUCT_MAP);
        const withCard = calculateStoreBasketSummary(basket, storeId, [card.id], economyMode, channelMode, PRODUCT_MAP);
        const savings =
          Math.round((without.totalWithDelivery - withCard.totalWithDelivery) * 100) / 100;
        if (savings > (impacts[card.id]?.savings ?? 0)) impacts[card.id] = { savings, storeId };
      }
    }
    return impacts;
  }, [basket, economyMode, channelMode]);
  const isBucharest = profile.city === 'București & Ilfov';

  const loyaltyImpact = useMemo(() => {
    if (basket.length === 0) return 0;
    const withoutCards = calculateStoreBasketSummary(
      basket,
      resolvedStore,
      [],
      economyMode,
      'all',
      PRODUCT_MAP
    );
    const withCards = calculateStoreBasketSummary(
      basket,
      resolvedStore,
      activeCards,
      economyMode,
      'all',
      PRODUCT_MAP
    );
    return Math.max(0, Math.round((withoutCards.totalWithDelivery - withCards.totalWithDelivery) * 100) / 100);
  }, [basket, resolvedStore, activeCards, economyMode]);

  const enabledStoreCount = STORES.length - excludedStoreIds.length;

  const toggleDietary = (id: string) => {
    const exists = profile.dietaryPreferences.includes(id);
    onUpdateProfile({
      dietaryPreferences: exists
        ? profile.dietaryPreferences.filter((p) => p !== id)
        : [...profile.dietaryPreferences, id],
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <LargeTitle
        eyebrow="Setările tale"
        title="Profil"
        subtitle="Cardurile, zona și preferințele tale se aplică automat în coș și plan."
      />

      {/* 1. Carduri de fidelitate */}
      <section className="bg-white rounded-[16px] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <CreditCard className="w-5 h-5 text-[#421726] mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-base font-extrabold text-[#421726]">
                Carduri de fidelitate ({activeCards.length} / {LOYALTY_CARDS.length} active)
              </h2>
              <p className="text-xs text-[#765B60] mt-0.5">
                Reducerile cardurilor bifate se aplică imediat în coș și în Compară.
              </p>
            </div>
          </div>

          {loyaltyImpact > 0 && (
            <span className="px-3 py-1 rounded-full bg-[#DBE3C6] text-[#263B1D] text-xs font-extrabold tabular-nums">
              -{formatRon(loyaltyImpact)} la {STORE_MAP[resolvedStore].shortName}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {LOYALTY_CARDS.map((card) => {
            const isActive = activeCards.includes(card.id);
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onToggleCard(card.id)}
                aria-pressed={isActive}
                className={`text-left p-3.5 rounded-[12px] border transition-colors flex items-start justify-between gap-3 ${
                  isActive
                    ? 'bg-[#FCE2DB]/55 border-[#F78D79]'
                    : 'bg-[#FFF6EE]/60 border-[#EFE2D8] hover:bg-[#FFF6EE]'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-[#421726]">{card.name}</p>
                  <p className="text-[11px] font-semibold text-[#765B60]">{card.storeNames}</p>
                  <p className="mt-1 text-[11px] text-[#765B60] leading-snug">
                    {card.benefitSummary}
                  </p>
                  {basket.length > 0 && (
                    <p
                      className={`mt-1.5 text-[11px] tabular-nums ${
                        cardImpacts[card.id] ? 'font-extrabold text-[#263B1D]' : 'text-[#765B60]'
                      }`}
                    >
                      {cardImpacts[card.id]
                        ? `−${formatRon(cardImpacts[card.id]!.savings)} la coșul tău (${STORE_MAP[cardImpacts[card.id]!.storeId].shortName})`
                        : 'Nicio reducere pe coșul de acum'}
                    </p>
                  )}
                </div>

                <span
                  className={`mt-0.5 w-6 h-6 rounded-full shrink-0 flex items-center justify-center border transition-colors ${
                    isActive
                      ? 'bg-[#421726] border-[#421726] text-white'
                      : 'bg-white border-[#EFE2D8] text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  <Check className="w-3.5 h-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Locație & Magazine lângă tine */}
      <section className="bg-white rounded-[16px] p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-2.5">
          <MapPin className="w-5 h-5 text-[#421726] mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-base font-extrabold text-[#421726]">
              Locație și magazine disponibile
            </h2>
            <p className="text-xs text-[#765B60] mt-0.5">
              Alege orașul și dezactivează magazinele la care nu mergi sau care nu livrează la tine.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="profile-city-select"
              className="block text-xs font-bold text-[#421726] mb-1.5"
            >
              Oraș / Zonă
            </label>
            <select
              id="profile-city-select"
              value={profile.city}
              onChange={(e) => onChangeCity(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-[12px] bg-[#FFF6EE] border border-[#EFE2D8] text-sm font-semibold text-[#421726] focus:outline-none focus:border-[#421726]"
            >
              {CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="profile-neighborhood-input"
              className="block text-xs font-bold text-[#421726] mb-1.5"
            >
              Cartier / Sector (opțional)
            </label>
            <input
              id="profile-neighborhood-input"
              type="text"
              value={profile.neighborhood}
              onChange={(e) => onUpdateProfile({ neighborhood: e.target.value })}
              placeholder="Ex: Sector 3, Titan sau Mănăștur"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-[12px] bg-[#FFF6EE] border border-[#EFE2D8] text-sm text-[#421726] placeholder:text-[#765B60]/80 focus:outline-none focus:border-[#421726]"
            />
          </div>
        </div>

        {!isBucharest && (
          <p className="rounded-[12px] bg-[#FFF6EE] border border-[#EFE2D8] px-3.5 py-2.5 text-xs text-[#765B60]">
            În <strong className="text-[#421726]">{profile.city}</strong>, Freshful și Sezamo sunt dezactivate implicit (livrează doar în București & Ilfov). Le poți reactiva manual oricând mai jos.
          </p>
        )}

        <div className="pt-1 space-y-2">
          <p className="text-xs font-bold text-[#765B60]">
            Magazine incluse în comparație ({enabledStoreCount} / {STORES.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {STORES.map((store) => {
              const isEnabled = !excludedStoreIds.includes(store.id);
              return (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => onToggleStoreExcluded(store.id)}
                  aria-pressed={isEnabled}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-full text-xs font-bold border transition-colors ${
                    isEnabled
                      ? 'bg-[#421726] border-[#421726] text-white'
                      : 'bg-[#FFF6EE]/60 border-[#EFE2D8] text-[#765B60] hover:text-[#421726]'
                  }`}
                >
                  <Store className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{store.shortName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Preferințe de cumpărare & Buget */}
      <section className="bg-white rounded-[16px] p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-2.5">
          <SlidersHorizontal
            className="w-5 h-5 text-[#421726] mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-base font-extrabold text-[#421726]">
              Gospodărie, buget și mod de cumpărături
            </h2>
            <p className="text-xs text-[#765B60] mt-0.5">
              Folosite ca valori implicite în Asistentul AI, Coș și Optimizare.
            </p>
          </div>
        </div>

        {/* Household Size */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-[#421726]">Persoane în gospodărie</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onUpdateProfile({ householdSize: n })}
                aria-pressed={profile.householdSize === n}
                className={`px-4 py-2 min-h-[44px] rounded-full text-xs font-bold border transition-colors tabular-nums ${
                  profile.householdSize === n
                    ? 'bg-[#421726] border-[#421726] text-white'
                    : 'bg-[#FFF6EE] border-[#EFE2D8] text-[#421726] hover:bg-[#FCE2DB]/60'
                }`}
              >
                {n === 1 ? '1 persoană' : `${n} persoane`}
              </button>
            ))}
          </div>
        </div>

        {/* Budget */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-[#421726]">Buget orientativ per cumpărătură</p>
          <div className="flex flex-wrap items-center gap-2">
            {BUDGET_PRESETS.map((preset) => {
              const active = budgetRon === preset.value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChangeBudgetRon(preset.value)}
                  aria-pressed={active}
                  className={`px-3.5 py-2 min-h-[44px] rounded-full text-xs font-bold border transition-colors tabular-nums ${
                    active
                      ? 'bg-[#421726] border-[#421726] text-white'
                      : 'bg-[#FFF6EE] border-[#EFE2D8] text-[#421726] hover:bg-[#FCE2DB]/60'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
            <div className="inline-flex items-center gap-1.5">
              <label htmlFor="profile-custom-budget" className="sr-only">
                Buget personalizat în lei
              </label>
              <input
                id="profile-custom-budget"
                type="number"
                min={20}
                max={5000}
                step={10}
                value={budgetRon ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (!raw) {
                    onChangeBudgetRon(null);
                    return;
                  }
                  const val = Number(raw);
                  if (Number.isFinite(val) && val > 0) {
                    onChangeBudgetRon(Math.round(val));
                  }
                }}
                placeholder="Alt buget (lei)"
                className="w-32 min-h-[44px] px-3 py-1.5 rounded-full bg-[#FFF6EE] border border-[#EFE2D8] text-xs font-bold text-[#421726] tabular-nums placeholder:text-[#765B60] focus:outline-none focus:border-[#421726]"
              />
            </div>
          </div>
        </div>

        {/* Channel & Max Stores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-bold text-[#421726]">Cum preferi să cumperi</p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'Fizic & Online' },
                  { id: 'physical', label: 'Magazin fizic' },
                  { id: 'online', label: 'Livrare acasă' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeChannelMode(opt.id)}
                  aria-pressed={channelMode === opt.id}
                  className={`px-3.5 py-2 min-h-[44px] rounded-full text-xs font-bold border transition-colors ${
                    channelMode === opt.id
                      ? 'bg-[#421726] border-[#421726] text-white'
                      : 'bg-[#FFF6EE] border-[#EFE2D8] text-[#421726] hover:bg-[#FCE2DB]/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-[#421726]">Număr maxim de magazine</p>
            <div className="flex flex-wrap gap-1.5">
              {([1, 2] as const).map((limit) => (
                <button
                  key={limit}
                  type="button"
                  onClick={() => onChangeMaxStores(limit)}
                  aria-pressed={maxStores === limit}
                  className={`px-3.5 py-2 min-h-[44px] rounded-full text-xs font-bold border transition-colors ${
                    maxStores === limit
                      ? 'bg-[#421726] border-[#421726] text-white'
                      : 'bg-[#FFF6EE] border-[#EFE2D8] text-[#421726] hover:bg-[#FCE2DB]/60'
                  }`}
                >
                  {limit === 1 ? '1 singur magazin' : 'Max 2 magazine'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Private-label toggle */}
        <div className="pt-2 border-t border-[#EFE2D8]">
          <button
            type="button"
            onClick={() => onToggleEconomyMode(!economyMode)}
            aria-pressed={economyMode}
            className="w-full flex items-center justify-between gap-4 text-left py-1"
          >
            <div>
              <p className="text-sm font-bold text-[#421726]">
                Prefer produse marcă proprie la comparare
              </p>
              <p className="text-xs text-[#765B60]">
                Activează implicit Mod Economie în Compară (Pilos, K-Classic, 365, Simpl, Hanul Boieresc).
              </p>
            </div>
            <span
              className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                economyMode ? 'bg-[#421726] justify-end' : 'bg-[#EFE2D8] justify-start'
              }`}
              aria-hidden="true"
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
            </span>
          </button>
        </div>
      </section>

      {/* 4. Preferințe alimentare pentru AI */}
      <section className="bg-white rounded-[16px] p-5 sm:p-6 space-y-3">
        <div className="flex items-start gap-2.5">
          <Sparkles className="w-5 h-5 text-[#421726] mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-base font-extrabold text-[#421726]">
              Preferințe alimentare pentru Rețete & Liste AI
            </h2>
            <p className="text-xs text-[#765B60] mt-0.5">
              Beavy AI ține cont automat de aceste opțiuni când îți propune produse.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {DIETARY_OPTIONS.map((opt) => {
            const active = profile.dietaryPreferences.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleDietary(opt.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-full text-xs font-bold border transition-colors ${
                  active
                    ? 'bg-[#DBE3C6] border-[#C5D3A3] text-[#263B1D]'
                    : 'bg-[#FFF6EE] border-[#EFE2D8] text-[#421726] hover:bg-[#FCE2DB]/50'
                }`}
              >
                {active && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Footer: Reset Local Preferences */}
      <footer className="pt-1 flex flex-wrap items-center justify-between gap-3">
        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#765B60] hover:text-[#421726]"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Resetează profilul la valorile implicite</span>
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-[#421726]">Confirmi resetarea preferințelor?</span>
            <button
              type="button"
              onClick={() => {
                onResetAllPreferences();
                setConfirmReset(false);
              }}
              className="px-3 py-1.5 rounded-full bg-[#421726] text-white font-bold"
            >
              Da, resetează
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="px-3 py-1.5 rounded-full bg-white border border-[#EFE2D8] text-[#765B60] font-bold"
            >
              Anulează
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
