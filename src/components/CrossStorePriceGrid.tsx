import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { STORE_MAP } from '../data/stores.ts';
import type { CanonicalProduct, LoyaltyCardId, StoreId } from '../types.ts';
import {
  formatRon,
  getEquivalenceLevelLabel,
  getSortedOffersForProduct,
} from '../utils/pricing.ts';
import { getOfferDealLabel, getStruckPrice } from '../utils/productDisplay.ts';

interface CrossStorePriceGridProps {
  product: CanonicalProduct;
  activeCards: LoyaltyCardId[];
  activeStoreId?: StoreId;
  onSelectStore?: (storeId: StoreId) => void;
  compact?: boolean;
  defaultExpanded?: boolean;
}

export function CrossStorePriceGrid({
  product,
  activeCards,
  activeStoreId,
  onSelectStore,
  compact = false,
  defaultExpanded = false,
}: CrossStorePriceGridProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sortedOffers = getSortedOffersForProduct(product, activeCards);
  // Only stores with a verified offer are priced; the rest are listed by name, never estimated
  const verifiedOffers = sortedOffers.filter((offer) => !offer.isUnavailable);
  const outOfStockStores = sortedOffers.filter((offer) => offer.isUnavailable && offer.isOutOfStock);
  const notListedStores = sortedOffers.filter((offer) => offer.isUnavailable && !offer.isOutOfStock);
  const cheapest = verifiedOffers[0];
  const second = verifiedOffers[1];
  const storeCountLabel =
    verifiedOffers.length === 1 ? '1 magazin' : `${verifiedOffers.length} magazine`;

  if (!cheapest) {
    return (
      <p className="mt-2 text-xs text-[#765B60]">
        Fără preț verificat la niciun magazin. Produsul nu intră în totalul coșului.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[#765B60] min-w-0">
          <span>
            Cel mai ieftin:{' '}
            <strong className="text-[#263B1D] font-bold tabular-nums">
              {STORE_MAP[cheapest.storeId].shortName} {formatRon(cheapest.price)}
            </strong>
          </span>
          {!compact && second && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {STORE_MAP[second.storeId].shortName} {formatRon(second.price)}
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-label={`Vezi prețurile verificate (${storeCountLabel}) pentru ${product.canonicalName}`}
          className="inline-flex items-center gap-1 py-1 min-h-[44px] text-xs font-semibold text-[#421726] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
        >
          <span>{expanded ? 'Ascunde prețurile' : `Compară ${storeCountLabel}`}</span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#EFE2D8] space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {verifiedOffers.map((offer) => {
              const store = STORE_MAP[offer.storeId];
              const isSelected = activeStoreId === offer.storeId;
              const struckPrice = getStruckPrice(offer);
              const dealLabel = getOfferDealLabel(offer);

              return (
                <button
                  key={offer.storeId}
                  type="button"
                  onClick={() => onSelectStore?.(offer.storeId)}
                  disabled={!onSelectStore}
                  className={`text-left p-3 rounded-[12px] border transition-colors ${
                    offer.isCheapest
                      ? 'bg-[#DBE3C6]/50 border-[#C5D3A3]'
                      : isSelected
                        ? 'bg-[#FCE2DB]/55 border-[#F78D79]'
                        : 'bg-[#FFF6EE]/60 border-[#EFE2D8] hover:bg-[#FFF6EE]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span className="text-xs font-bold text-[#421726] truncate">{store.name}</span>
                    {offer.isCheapest && (
                      <span className="text-[10px] font-bold text-[#263B1D] whitespace-nowrap shrink-0">
                        Cel mai ieftin
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex items-baseline gap-1.5 min-w-0">
                      <span className="text-sm font-extrabold text-[#421726] tabular-nums">
                        {formatRon(offer.price)}
                      </span>
                      {struckPrice !== null && (
                        <span className="text-[11px] text-[#765B60] line-through tabular-nums">
                          {formatRon(struckPrice)}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-[#765B60] tabular-nums whitespace-nowrap">
                      {offer.unitPriceLabel}
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] text-[#765B60] truncate">
                    {getEquivalenceLevelLabel(offer.equivalenceLevel)}
                  </p>
                  {dealLabel && (
                    <p
                      className={`mt-0.5 text-[11px] truncate ${
                        offer.promoIsInfoOnly ? 'text-[#765B60]' : 'font-semibold text-[#263B1D]'
                      }`}
                    >
                      {offer.promoIsInfoOnly ? `Ofertă: ${dealLabel}` : dealLabel}
                    </p>
                  )}
                  {offer.variantLabel && (
                    <p className="mt-0.5 text-[11px] text-[#765B60] truncate">
                      {offer.variantLabel}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {(notListedStores.length > 0 || outOfStockStores.length > 0) && (
            <div className="text-[11px] text-[#765B60] space-y-0.5">
              {outOfStockStores.length > 0 && (
                <p>
                  <span className="font-semibold text-[#421726]">Stoc epuizat:</span>{' '}
                  {outOfStockStores.map((o) => STORE_MAP[o.storeId].shortName).join(', ')}
                </p>
              )}
              {notListedStores.length > 0 && (
                <p>
                  <span className="font-semibold text-[#421726]">Fără ofertă verificată:</span>{' '}
                  {notListedStores.map((o) => STORE_MAP[o.storeId].shortName).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
