import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, Minus, Plus, RotateCcw, Search, X } from 'lucide-react';
import { CATALOG, PRODUCT_MAP } from '../data/catalog.ts';
import type { BasketItem, CanonicalProduct, LoyaltyCardId, StoreId } from '../types.ts';
import { ProductSummary } from './ProductSummary.tsx';

interface ProductSearchPanelProps {
  basket: BasketItem[];
  economyMode: boolean;
  activeCards: LoyaltyCardId[];
  storeId: StoreId;
  hasChosenStore: boolean;
  onAddProduct: (productId: string, product?: CanonicalProduct) => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onClose?: () => void;
  /** Render without the card chrome (used inside a bottom sheet). */
  bare?: boolean;
  /** Always-visible search bar: no card, results only appear once the shopper types. */
  inline?: boolean;
  /** Rendered inside the right edge of the input (e.g. a scan button). */
  trailing?: ReactNode;
  /** Rendered next to the input on the same row (e.g. a mode switch). */
  rowEnd?: ReactNode;
}

type SearchStatus = 'idle' | 'loading' | 'error';

function matchesLocally(product: CanonicalProduct, q: string): boolean {
  return (
    product.canonicalName.toLowerCase().includes(q) ||
    product.brand.toLowerCase().includes(q) ||
    product.category.toLowerCase().includes(q) ||
    product.ean.includes(q)
  );
}

/** Live catalog search with real photos, clean sizes and verified prices only. */
export function ProductSearchPanel({
  basket,
  economyMode,
  activeCards,
  storeId,
  hasChosenStore,
  onAddProduct,
  onUpdateQty,
  onClose,
  bare = false,
  inline = false,
  trailing,
  rowEnd,
}: ProductSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [liveResults, setLiveResults] = useState<CanonicalProduct[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setLiveResults([]);
      setStatus('idle');
      return;
    }

    setStatus('loading');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}&limit=25`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        const products: CanonicalProduct[] = Array.isArray(data.products) ? data.products : [];
        // Always refresh: a product seen earlier may carry older prices
        products.forEach((p) => {
          PRODUCT_MAP[p.id] = p;
        });
        setLiveResults(products);
        setStatus('idle');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLiveResults([]);
        setStatus('error');
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, retryTick]);

  const q = query.trim().toLowerCase();
  const useLive = q.length >= 2 && liveResults.length > 0;
  const hiddenPrivateLabels =
    useLive && !economyMode ? liveResults.filter((p) => p.isPrivateLabel).length : 0;
  const items: CanonicalProduct[] = useLive
    ? liveResults.filter((p) => economyMode || !p.isPrivateLabel)
    : CATALOG.filter((p) => {
        if (!economyMode && p.isPrivateLabel) return false;
        return !q || matchesLocally(p, q);
      }).slice(0, q ? 15 : 6);

  return (
    <section
      className={bare || inline ? 'space-y-3 text-left' : 'bg-white border border-[#EFE2D8] rounded-[16px] p-4 space-y-3 text-left'}
      aria-label="Caută produse în catalog"
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-[#765B60] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Caută lapte, unt, ouă, cafea…"
            aria-label="Caută produs de adăugat"
            autoComplete="off"
            autoFocus={bare}
            className={`w-full min-h-[44px] pl-10 ${trailing ? 'pr-20' : 'pr-10'} py-2 text-[15px] text-[#421726] focus:outline-none ${
              inline
                ? 'rounded-[12px] bg-[#EFE2D8]/70 border border-transparent focus:border-[#421726]'
                : 'rounded-full bg-[#FFF6EE] border border-[#EFE2D8] focus:border-[#421726]'
            }`}
          />
          {status === 'loading' && (
            <Loader2
              className={`w-4 h-4 animate-spin text-[#F78D79] absolute ${trailing ? 'right-14' : 'right-3.5'} top-1/2 -translate-y-1/2`}
              aria-hidden="true"
            />
          )}
          {trailing && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">{trailing}</div>
          )}
        </div>
        {rowEnd}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide căutarea"
            className="w-11 h-11 shrink-0 rounded-full border border-[#EFE2D8] flex items-center justify-center text-[#765B60] hover:text-[#421726] hover:bg-[#FFF6EE] transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {inline && q.length < 2 ? null : (<>
      <p className="text-[11px] text-[#765B60]" aria-live="polite">
        {status === 'loading'
          ? 'Căutăm în catalog…'
          : q.length < 2
            ? 'Scrie cel puțin două litere. Până atunci, câteva produse des cumpărate:'
            : useLive
              ? 'Prețuri reale, verificate la magazinele indicate.'
              : status === 'error'
                ? ''
                : 'Rezultate din produsele de bază Beavy.'}
      </p>

      {status === 'error' && (
        <div
          className="rounded-[12px] bg-[#FCE2DB] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#421726]"
          role="alert"
        >
          <span>Nu am putut căuta în tot catalogul acum. Îți arătăm produsele de bază.</span>
          <button
            type="button"
            onClick={() => setRetryTick((tick) => tick + 1)}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-2 font-bold underline underline-offset-4"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reîncearcă
          </button>
        </div>
      )}

      <div className="max-h-[22rem] overflow-y-auto divide-y divide-[#EFE2D8] rounded-[12px] border border-[#EFE2D8]">
        {items.length === 0 && status !== 'loading' && (
          <p className="p-4 text-center text-xs text-[#765B60]">
            {hiddenPrivateLabels > 0
              ? `Pentru „${query.trim()}” am găsit doar mărci proprii, ascunse în Mod Fidel.`
              : `Niciun produs găsit pentru „${query.trim()}”.`}
          </p>
        )}

        {items.map((p) => {
          const existing = basket.find((b) => b.productId === p.id);
          return (
            <div key={p.id} className="px-3 py-2.5 flex items-center gap-2.5 bg-white">
              <ProductSummary
                product={p}
                activeCards={activeCards}
                storeId={storeId}
                hasChosenStore={hasChosenStore}
              />
              {existing ? (
                <div className="inline-flex items-center rounded-full border border-[#EFE2D8] bg-[#FFF6EE] shrink-0">
                  <button
                    type="button"
                    onClick={() => onUpdateQty(p.id, -1)}
                    aria-label={`Scade ${p.canonicalName}`}
                    className="w-11 h-11 flex items-center justify-center text-[#421726]"
                  >
                    <Minus className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-[20px] text-center text-sm font-extrabold text-[#421726] tabular-nums">
                    {existing.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateQty(p.id, 1)}
                    aria-label={`Crește ${p.canonicalName}`}
                    className="w-11 h-11 flex items-center justify-center text-[#421726]"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddProduct(p.id, p)}
                  aria-label={`Adaugă ${p.canonicalName} în coș`}
                  className="w-11 h-11 shrink-0 rounded-full bg-[#421726] text-white flex items-center justify-center hover:bg-[#5A2236] transition-colors"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}

        {hiddenPrivateLabels > 0 && items.length > 0 && (
          <p className="px-3.5 py-2.5 text-[11px] text-[#765B60] bg-[#FFF6EE]/70">
            {hiddenPrivateLabels === 1
              ? 'O marcă proprie este ascunsă în Mod Fidel.'
              : `${hiddenPrivateLabels} mărci proprii sunt ascunse în Mod Fidel.`}{' '}
            Le vezi în Mod Economie, din Compară.
          </p>
        )}
      </div>
      </>)}
    </section>
  );
}
