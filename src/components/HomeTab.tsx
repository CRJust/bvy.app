import { useMemo, useState } from 'react';
import { ArrowRight, Plus, ScanBarcode } from 'lucide-react';
import { CATALOG } from '../data/catalog.ts';
import { CATEGORY_IMAGES, STORE_MAP } from '../data/stores.ts';
import type { BasketItem, CanonicalProduct, LoyaltyCardId, StoreId } from '../types.ts';
import { formatRon } from '../utils/pricing.ts';
import { formatProductMeta, getBestVerifiedOffer, getStruckPrice } from '../utils/productDisplay.ts';
import { EanScannerModal } from './EanScannerModal.tsx';
import { BottomSheet } from './ios/BottomSheet.tsx';
import { ProductSearchPanel } from './ProductSearchPanel.tsx';
import { ProductSummary } from './ProductSummary.tsx';
import { ProductThumbnail } from './ProductThumbnail.tsx';

interface HomeTabProps {
  basket: BasketItem[];
  totalUnits: number;
  economyMode: boolean;
  activeCards: LoyaltyCardId[];
  storeId: StoreId;
  hasChosenStore: boolean;
  /** Best store for the current basket, when there is one. */
  bestStore: { storeId: StoreId; total: number } | null;
  onAddProduct: (productId: string, product?: CanonicalProduct) => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onNavigateTab: (tab: 'ai' | 'basket' | 'matrix') => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  'Fructe & Legume': 'Proaspete',
  'Lactate & Ouă': 'Lactate',
  'Carne & Pește': 'Carne',
  'Cămară & Paste': 'Cămară',
  'Cafea & Băuturi': 'Băuturi',
};
// Brand pastels only (leek, grapefruit, rule, buttermilk-strawberry wash)
const CATEGORY_TINTS = ['bg-[#DBE3C6]', 'bg-[#FCE2DB]', 'bg-[#EFE2D8]', 'bg-[#E9EDD9]', 'bg-[#FDECE6]'];
const CATEGORIES = Object.keys(CATEGORY_LABELS).filter((c) => CATEGORY_IMAGES[c]);

export function HomeTab({
  basket,
  totalUnits,
  economyMode,
  activeCards,
  storeId,
  hasChosenStore,
  bestStore,
  onAddProduct,
  onUpdateQty,
  onNavigateTab,
}: HomeTabProps) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const visibleCatalog = useMemo(
    () => CATALOG.filter((p) => economyMode || !p.isPrivateLabel),
    [economyMode]
  );

  // Products with a real discount first; never more than a handful on the home screen
  const deals = useMemo(() => {
    const withOffer = visibleCatalog.flatMap((product) => {
      const offer = getBestVerifiedOffer(product, activeCards);
      if (!offer) return [];
      const struck = getStruckPrice(offer);
      return [{ product, offer, struck, saving: struck !== null ? struck - offer.price : 0 }];
    });
    return withOffer.sort((a, b) => b.saving - a.saving).slice(0, 8);
  }, [visibleCatalog, activeCards]);

  const categoryProducts = openCategory
    ? visibleCatalog.filter((p) => p.category === openCategory).slice(0, 40)
    : [];

  return (
    <div className="relative isolate max-w-3xl mx-auto space-y-7">
      {/* One soft warm wash behind the greeting and search */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-4 -top-4 h-72 bg-gradient-to-b from-[#FCE2DB]/70 to-transparent -z-10"
      />
      <header className="pt-4">
        <p className="text-[16px] font-semibold text-[#765B60]">Bună,</p>
        <h1 className="mt-1 text-[36px] leading-[1.08] font-extrabold tracking-[-0.03em] text-[#421726] text-balance">
          Ce punem azi în coș?
        </h1>
      </header>

      <ProductSearchPanel
        inline
        basket={basket}
        economyMode={economyMode}
        activeCards={activeCards}
        storeId={storeId}
        hasChosenStore={hasChosenStore}
        onAddProduct={onAddProduct}
        onUpdateQty={onUpdateQty}
        trailing={
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            aria-label="Scanează un cod de bare"
            className="w-11 h-11 flex items-center justify-center text-[#421726]"
          >
            <ScanBarcode className="w-5 h-5" aria-hidden="true" />
          </button>
        }
      />

      <section className="space-y-3" aria-label="Raioane">
        <h2 className="text-lg font-extrabold text-[#421726]">Raioane</h2>
        <div className="-mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((category, idx) => (
            <button
              key={category}
              type="button"
              onClick={() => setOpenCategory(category)}
              className="shrink-0 w-[92px] text-center group"
            >
              <span
                className={`block w-[92px] h-[100px] rounded-t-[30px] rounded-b-[18px] overflow-hidden transition-transform duration-150 group-active:scale-[0.97] ${CATEGORY_TINTS[idx % CATEGORY_TINTS.length]}`}
              >
                <img
                  src={CATEGORY_IMAGES[category]}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover mix-blend-multiply"
                />
              </span>
              <span className="mt-2 block text-[13px] font-bold text-[#421726]">
                {CATEGORY_LABELS[category]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => onNavigateTab(totalUnits > 0 ? 'matrix' : 'ai')}
        className="relative w-full overflow-hidden rounded-[22px] bg-[#421726] text-left p-5 min-h-[148px] flex items-center shadow-[0_8px_18px_rgba(66,23,38,0.12)]"
      >
        {/* Food imagery on the right, fading into cherry so the text stays readable */}
        <img
          src={CATEGORY_IMAGES['Fructe & Legume']}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute right-0 top-0 h-full w-[46%] object-cover"
        />
        <span
          aria-hidden="true"
          className="absolute right-0 top-0 h-full w-[46%] bg-gradient-to-r from-[#421726] via-[#421726]/40 to-transparent"
        />
        <span className="relative min-w-0 max-w-[62%]">
          <span className="block text-xl font-extrabold text-white leading-snug text-balance tabular-nums">
            {totalUnits > 0 && bestStore
              ? `Coșul tău iese cel mai ieftin la ${STORE_MAP[bestStore.storeId].shortName}`
              : 'Spune ce gătești, primești lista gata'}
          </span>
          <span className="mt-3 inline-flex items-center gap-1.5 min-h-[36px] px-4 rounded-full bg-[#F78D79] text-[#421726] text-sm font-extrabold tabular-nums">
            {totalUnits > 0 && bestStore ? `${formatRon(bestStore.total)} · Compară` : 'Cere o listă'}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </span>
        </span>
      </button>

      {deals.length > 0 && (
        <section className="space-y-3" aria-label="Prețuri bune acum">
          <h2 className="text-lg font-extrabold text-[#421726]">Prețuri bune acum</h2>
          <div className="-mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar">
            {deals.map(({ product, offer, struck }) => {
              const inBasket = basket.find((b) => b.productId === product.id);
              return (
                <article
                  key={product.id}
                  className="shrink-0 w-[156px] bg-white rounded-[18px] p-2.5 flex flex-col shadow-[0_4px_14px_rgba(66,23,38,0.06)]"
                >
                  <ProductThumbnail
                    category={product.category}
                    name={product.canonicalName}
                    imageUrl={product.imageUrl}
                    size="lg"
                  />
                  <h3 className="mt-2 text-sm font-bold text-[#421726] leading-snug line-clamp-2 min-h-[2.5rem]">
                    {product.canonicalName}
                  </h3>
                  <p className="text-xs text-[#765B60] truncate tabular-nums">
                    {formatProductMeta(product)}
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div className="min-w-0 tabular-nums">
                      <p className="text-base font-extrabold text-[#421726]">
                        {formatRon(offer.price)}
                      </p>
                      <p className="text-[11px] text-[#765B60] truncate">
                        {struck !== null && <span className="line-through">{formatRon(struck)}</span>}
                        {struck !== null ? ' · ' : ''}
                        {STORE_MAP[offer.storeId].shortName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        inBasket ? onUpdateQty(product.id, 1) : onAddProduct(product.id, product)
                      }
                      aria-label={`Adaugă ${product.canonicalName} în coș`}
                      className="w-11 h-11 shrink-0 rounded-full bg-[#421726] text-white flex items-center justify-center text-sm font-extrabold tabular-nums"
                    >
                      {inBasket ? inBasket.quantity : <Plus className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <BottomSheet
        open={Boolean(openCategory)}
        onClose={() => setOpenCategory(null)}
        title={openCategory ?? ''}
      >
        <div className="bg-white rounded-[12px] overflow-hidden divide-y divide-[#EFE2D8]">
          {categoryProducts.map((product) => {
            const inBasket = basket.find((b) => b.productId === product.id);
            return (
              <div key={product.id} className="px-3 py-2.5 flex items-center gap-2.5">
                <ProductSummary
                  product={product}
                  activeCards={activeCards}
                  storeId={storeId}
                  hasChosenStore={hasChosenStore}
                />
                <button
                  type="button"
                  onClick={() =>
                    inBasket ? onUpdateQty(product.id, 1) : onAddProduct(product.id, product)
                  }
                  aria-label={`Adaugă ${product.canonicalName} în coș`}
                  className="w-11 h-11 shrink-0 rounded-full bg-[#421726] text-white flex items-center justify-center text-sm font-extrabold tabular-nums"
                >
                  {inBasket ? inBasket.quantity : <Plus className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
          {categoryProducts.length === 0 && (
            <p className="p-4 text-sm text-[#765B60]">Niciun produs în acest raion încă.</p>
          )}
        </div>
      </BottomSheet>

      <EanScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        basket={basket}
        resolvedStoreId={storeId}
        hasChosenStore={hasChosenStore}
        economyMode={economyMode}
        activeCards={activeCards}
        onAddProduct={onAddProduct}
        onUpdateQty={onUpdateQty}
      />
    </div>
  );
}
