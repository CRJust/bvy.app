import type { BeavyProductOffer } from '@/services/beavy-comparison';
import type { ValidatedOffer, SmartShoppingConfig } from './types';

/**
 * Validates an offer against all business and integrity constraints.
 * Returns null if offer is invalid, expired, out of stock, or has an invalid price.
 */
export function validateOffer(
  offer: BeavyProductOffer,
  config: Partial<SmartShoppingConfig> = {}
): ValidatedOffer | null {
  // 1. Price validation
  if (
    offer.price == null ||
    !Number.isFinite(Number(offer.price)) ||
    Number(offer.price) <= 0
  ) {
    return null;
  }

  // 2. Currency validation
  if (offer.currency && offer.currency.toUpperCase() !== 'RON') {
    return null;
  }

  // 3. Retailer validation
  if (!offer.retailer_name || offer.retailer_name.trim() === '') {
    return null;
  }

  // 4. Stock validation
  if (offer.stock_status === 'out_of_stock') {
    return null;
  }

  // 5. Expiration validation
  const now = new Date();
  let isExpired = false;
  if (offer.valid_until) {
    const validUntilDate = new Date(offer.valid_until);
    if (!Number.isNaN(validUntilDate.getTime()) && validUntilDate < now) {
      isExpired = true;
    }
  }

  // Strict rule: exclude expired offers from current-price optimization
  if (isExpired) {
    return null;
  }

  // 6. Channel matching if config specifies preferredChannel
  if (config.preferredChannel && config.preferredChannel !== 'all') {
    if (config.preferredChannel === 'delivery' && offer.fulfillment_channel === 'store') {
      return null;
    }
    if (config.preferredChannel === 'store' && offer.fulfillment_channel === 'delivery') {
      return null;
    }
  }

  // 7. Pricing calculation: regular vs promo vs loyalty
  const regularPrice =
    offer.regular_price != null && Number.isFinite(Number(offer.regular_price)) && Number(offer.regular_price) > 0
      ? Number(offer.regular_price)
      : Number(offer.price);

  const promoPrice =
    offer.promo_price != null && Number.isFinite(Number(offer.promo_price)) && Number(offer.promo_price) > 0
      ? Number(offer.promo_price)
      : null;

  const loyaltyPrice =
    offer.loyalty_price != null && Number.isFinite(Number(offer.loyalty_price)) && Number(offer.loyalty_price) > 0
      ? Number(offer.loyalty_price)
      : null;

  let effectivePrice = Number(offer.price);
  let isLoyaltyApplied = false;
  let isPromoApplied = false;

  const useLoyalty = config.useLoyaltyCards ?? true;

  if (useLoyalty && loyaltyPrice != null && loyaltyPrice < effectivePrice) {
    effectivePrice = loyaltyPrice;
    isLoyaltyApplied = true;
  } else if (promoPrice != null && promoPrice < effectivePrice) {
    effectivePrice = promoPrice;
    isPromoApplied = true;
  }

  // 8. Freshness assessment
  let isFresh = true;
  let freshnessLabel = 'Actualizat recent';
  if (offer.observed_at) {
    const observedDate = new Date(offer.observed_at);
    if (!Number.isNaN(observedDate.getTime())) {
      const diffHours = (now.getTime() - observedDate.getTime()) / (1000 * 60 * 60);
      if (diffHours > 72) {
        isFresh = false;
        freshnessLabel = `Observat acum ${Math.round(diffHours / 24)} zile`;
      } else if (diffHours > 24) {
        freshnessLabel = `Observat ieri`;
      } else if (diffHours >= 1) {
        freshnessLabel = `Observat acum ${Math.round(diffHours)}h`;
      } else {
        freshnessLabel = `Verificat recent`;
      }
    }
  }

  return {
    ...offer,
    price: Number(offer.price),
    regular_price: regularPrice,
    promo_price: promoPrice,
    loyalty_price: loyaltyPrice,
    effectiveUnitPrice: effectivePrice,
    isLoyaltyApplied,
    isPromoApplied,
    isExpired: false,
    isFresh,
    freshnessLabel,
  };
}
