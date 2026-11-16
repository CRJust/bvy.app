import { STORE_MAP } from '../data/stores.ts';
import type { CanonicalProduct, LoyaltyCardId, StoreId } from '../types.ts';
import { countVerifiedStores, formatRon, getEffectiveOffer } from '../utils/pricing.ts';
import {
  formatProductMeta,
  formatStoreCoverage,
  getBestVerifiedOffer,
  getStruckPrice,
} from '../utils/productDisplay.ts';
import { ProductThumbnail } from './ProductThumbnail.tsx';

interface ProductSummaryProps {
  product: CanonicalProduct;
  activeCards: LoyaltyCardId[];
  /** Store the shopper already chose; its price is shown when the product is sold there. */
  storeId?: StoreId;
  hasChosenStore?: boolean;
  showEan?: boolean;
}

/**
 * The one product card used by search, the scanner and suggestions:
 * photo, name, brand · size · unit price, then the best real price and how many stores have it.
 */
export function ProductSummary({
  product,
  activeCards,
  storeId,
  hasChosenStore = false,
  showEan = false,
}: ProductSummaryProps) {
  const storeOffer =
    hasChosenStore && storeId ? getEffectiveOffer(product, storeId, activeCards) : null;
  const usesStorePrice = Boolean(storeOffer && !storeOffer.isUnavailable);
  const shownOffer = usesStorePrice ? storeOffer : getBestVerifiedOffer(product, activeCards);
  const storeCount = countVerifiedStores(product);
  const struckPrice = shownOffer ? getStruckPrice(shownOffer) : null;
  const meta = [
    formatProductMeta(product, { showEan }),
    shownOffer && product.packageSize ? shownOffer.unitPriceLabel : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex items-start gap-3 min-w-0 flex-1">
      <ProductThumbnail
        category={product.category}
        name={product.canonicalName}
        imageUrl={product.imageUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-[#421726] leading-snug line-clamp-2">
          {product.canonicalName}
        </p>
        {meta && <p className="mt-0.5 text-[11px] text-[#765B60] tabular-nums truncate">{meta}</p>}

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {shownOffer ? (
            <span className="inline-flex items-baseline gap-1.5 tabular-nums">
              <span className="font-extrabold text-[#421726]">
                {usesStorePrice ? '' : 'de la '}
                {formatRon(shownOffer.price)}
              </span>
              {struckPrice !== null && (
                <span className="text-[11px] text-[#765B60] line-through">
                  {formatRon(struckPrice)}
                </span>
              )}
              <span className="text-[11px] text-[#765B60]">
                {STORE_MAP[shownOffer.storeId].shortName}
              </span>
            </span>
          ) : (
            <span className="font-semibold text-[#765B60]">Fără preț verificat</span>
          )}
          {storeCount > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#DBE3C6]/60 text-[#263B1D] whitespace-nowrap">
              {formatStoreCoverage(storeCount)}
            </span>
          )}
        </div>

        {storeOffer?.isUnavailable && storeId && shownOffer && (
          <p className="mt-1 text-[11px] text-[#765B60]">
            {storeOffer.isOutOfStock ? 'Stoc epuizat la ' : 'Nu se găsește la '}
            {STORE_MAP[storeId].shortName}
          </p>
        )}
      </div>
    </div>
  );
}
