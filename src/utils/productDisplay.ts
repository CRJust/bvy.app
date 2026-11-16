import type { CanonicalProduct, LoyaltyCardId } from '../types.ts';
import { getSortedOffersForProduct, type EffectiveOffer } from './pricing.ts';

interface ProductMetaOptions {
  showEan?: boolean;
  showCategory?: boolean;
}

/**
 * "Brand · 500 g · EAN … · Categorie" with every missing part skipped, so scraped products
 * without a brand, a clean size or a real barcode never show placeholders or invented codes.
 */
export function formatProductMeta(
  product: CanonicalProduct,
  options: ProductMetaOptions = {}
): string {
  const parts: string[] = [];
  const brand = product.brand.trim();
  if (brand && !product.canonicalName.toLowerCase().startsWith(brand.toLowerCase())) {
    parts.push(brand);
  }
  if (product.packageSize.trim()) parts.push(product.packageSize.trim());
  if (options.showEan && !product.eanIsSynthetic) parts.push(`EAN ${product.ean}`);
  if (options.showCategory) parts.push(product.category);
  return parts.join(' · ');
}

/** Cheapest verified offer across all stores, or null when nobody has a verified price. */
export function getBestVerifiedOffer(
  product: CanonicalProduct,
  activeCards: LoyaltyCardId[]
): EffectiveOffer | null {
  const first = getSortedOffersForProduct(product, activeCards)[0];
  return first && !first.isUnavailable ? first : null;
}

export function formatStoreCoverage(storeCount: number): string {
  if (storeCount <= 0) return 'Fără preț verificat';
  return storeCount === 1 ? '1 magazin cu preț real' : `${storeCount} magazine cu preț real`;
}

/** Price to strike through next to the paid price: shelf price before promo / card discount. */
export function getStruckPrice(offer: EffectiveOffer): number | null {
  if (offer.isUnavailable) return null;
  const reference = Math.max(offer.regularPrice ?? 0, offer.basePrice);
  return reference > offer.price + 0.004 ? reference : null;
}

/** Short discount label for an available offer (card program, promo text, or nothing). */
export function getOfferDealLabel(offer: EffectiveOffer): string | null {
  if (offer.isUnavailable) return null;
  if (offer.usedCardProgram) return offer.usedCardProgram;
  return offer.promoLabel;
}

export function getUnavailableLabel(offer: EffectiveOffer): string {
  return offer.isOutOfStock ? 'Stoc epuizat' : 'Indisponibil';
}
