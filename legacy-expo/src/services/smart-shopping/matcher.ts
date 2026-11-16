import type {
  SmartProductInput,
  MatchQuality,
  NormalizedQuantity,
  ValidatedOffer,
} from './types';
import {
  type CatalogProductProfile,
  type BeavyProductOffer,
  extractFreshProduceGenericKey,
  isCompatibleEquivalentProduct,
  resolvePrivateLabelOwnerRetailer,
} from '@/services/beavy-comparison';

export interface MatchCandidate<TOffer extends BeavyProductOffer = ValidatedOffer> {
  offer: TOffer;
  canonicalProduct?: CatalogProductProfile | null;
  matchQuality: MatchQuality;
  isSubstitution: boolean;
  substitutionReason?: string | null;
  score: number; // Higher is better
}

/**
 * Normalizes input text for comparison (strips diacritics, lowercase, removes punctuation)
 */
export function normalizeProductText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes unit quantities into standard SI units:
 * - grams / kg -> standardizedValue in kg
 * - ml / litres -> standardizedValue in l
 * - units / buc -> standardizedValue in buc
 */
export function normalizeQuantity(
  value: number | null | undefined,
  unitStr: string | null | undefined,
  packageSizeStr?: string | null | undefined
): NormalizedQuantity | null {
  let val = value != null && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  let rawUnit = unitStr ? normalizeProductText(unitStr) : '';

  if ((!val || !rawUnit) && packageSizeStr) {
    const pkg = normalizeProductText(packageSizeStr).replace(/(\d),(\d)/g, '$1.$2');
    const match = pkg.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|l|litri|litru|ml|cl|buc)\b/);
    if (match) {
      val = Number(match[1]);
      rawUnit = match[2];
    }
  }

  if (!val || !rawUnit) return null;

  if (rawUnit === 'kg' || rawUnit === 'kilograme') {
    return { value: val, unit: 'kg', standardizedValue: val, standardizedUnit: 'kg' };
  }
  if (rawUnit === 'g' || rawUnit === 'gr' || rawUnit === 'grame') {
    return { value: val, unit: 'g', standardizedValue: val / 1000, standardizedUnit: 'kg' };
  }
  if (rawUnit === 'l' || rawUnit === 'litru' || rawUnit === 'litri') {
    return { value: val, unit: 'l', standardizedValue: val, standardizedUnit: 'l' };
  }
  if (rawUnit === 'ml' || rawUnit === 'mililitri') {
    return { value: val, unit: 'ml', standardizedValue: val / 1000, standardizedUnit: 'l' };
  }
  if (rawUnit === 'cl') {
    return { value: val, unit: 'ml', standardizedValue: val / 100, standardizedUnit: 'l' };
  }
  if (rawUnit === 'buc' || rawUnit === 'bucati' || rawUnit === 'cutie' || rawUnit === 'pachet') {
    return { value: val, unit: 'buc', standardizedValue: val, standardizedUnit: 'buc' };
  }

  return { value: val, unit: 'buc', standardizedValue: val, standardizedUnit: 'buc' };
}

/**
 * Match an item against an offer using the strict 4-tier hierarchy:
 * Tier 1: Exact EAN barcode match
 * Tier 2: Exact Canonical Product ID match
 * Tier 3: Equivalent Product (same family / strict attributes / private-label owner isolated)
 * Tier 4: Alternative substitution (only if substitutions permitted and same category)
 */
export function evaluateProductOfferMatch<TOffer extends BeavyProductOffer = ValidatedOffer>(params: {
  item: SmartProductInput;
  offer: TOffer;
  itemCanonical?: CatalogProductProfile | null;
  offerCanonical?: CatalogProductProfile | null;
  allowSubstitutions: boolean;
}): MatchCandidate<TOffer> | null {
  const { item, offer, itemCanonical, offerCanonical, allowSubstitutions } = params;

  // Private label ownership check: A private label belonging to retailer A can NEVER match retailer B
  const offerBrand = offerCanonical?.brand || offer.retailer_name;
  const privateLabelOwner = resolvePrivateLabelOwnerRetailer(
    offerCanonical || {
      brand: offerBrand,
      canonical_name: offer.product_url || '',
      attributes: {},
    }
  );
  if (privateLabelOwner && offer.retailer_name) {
    const normOfferRetailer = normalizeProductText(offer.retailer_name);
    const normOwner = normalizeProductText(privateLabelOwner);
    if (!normOfferRetailer.includes(normOwner) && !normOwner.includes(normOfferRetailer)) {
      // Discard invalid private label attribution
      return null;
    }
  }

  // Tier 1: Exact EAN Barcode match
  const rawData = (offer as unknown as { raw_data?: Record<string, unknown> }).raw_data;
  if (
    item.barcode &&
    item.barcode.length >= 8 &&
    rawData &&
    typeof rawData === 'object' &&
    'barcode' in rawData &&
    String(rawData.barcode).trim() === item.barcode.trim()
  ) {
    return {
      offer,
      canonicalProduct: offerCanonical,
      matchQuality: 'exact_ean',
      isSubstitution: false,
      score: 1.0,
    };
  }

  // Tier 2: Exact Canonical Product ID or Deterministic Canonical Fingerprint match
  if (
    (item.productId && offer.product_id && item.productId === offer.product_id) ||
    (itemCanonical?.id && offerCanonical?.id && itemCanonical.id === offerCanonical.id) ||
    (itemCanonical?.canonical_fingerprint &&
      offerCanonical?.canonical_fingerprint &&
      itemCanonical.canonical_fingerprint === offerCanonical.canonical_fingerprint)
  ) {
    return {
      offer,
      canonicalProduct: offerCanonical || itemCanonical,
      matchQuality: 'exact_id',
      isSubstitution: false,
      score: 0.95,
    };
  }

  // Tier 2.5: Brand-Agnostic Fresh Produce Generic Match (fructe și legume de bază între magazine)
  const itemProduceKey = extractFreshProduceGenericKey(
    itemCanonical ?? {
      canonical_name: item.name,
      brand: item.brand ?? null,
      package_size: item.packageSize ?? null,
      category: item.category ?? null,
      subcategory: item.subcategory ?? null,
    }
  );
  const offerProduceKey = offerCanonical
    ? extractFreshProduceGenericKey(offerCanonical)
    : null;
  if (itemProduceKey && offerProduceKey && itemProduceKey === offerProduceKey) {
    return {
      offer,
      canonicalProduct: offerCanonical,
      matchQuality: 'equivalent',
      isSubstitution: false,
      score: 0.92,
    };
  }

  // Tier 3: Equivalent Product match (family / attributes)
  if (itemCanonical && offerCanonical) {
    const isEquivalent = isCompatibleEquivalentProduct(itemCanonical, offerCanonical, {
      allowSameCategoryWithoutFamily: true,
      allowDifferentSize: false,
    });

    if (isEquivalent) {
      return {
        offer,
        canonicalProduct: offerCanonical,
        matchQuality: 'equivalent',
        isSubstitution: false,
        score: 0.85,
      };
    }
  }

  // Tier 4: Alternative substitution (only when substitutions allowed)
  const canSubstitute = allowSubstitutions || item.allowSubstitutionOverride === true;
  if (canSubstitute && itemCanonical && offerCanonical) {
    // Substitutions must strictly share category/subcategory
    const itemCat = normalizeProductText(itemCanonical.category || itemCanonical.subcategory);
    const offerCat = normalizeProductText(offerCanonical.category || offerCanonical.subcategory);

    if (itemCat && offerCat && itemCat === offerCat) {
      // Substitutions must strictly respect culinary domain isolation (no Bacon -> Șuncă, Boabe -> Capsule, Unt -> Margarină)
      const isDomainCompatible = isCompatibleEquivalentProduct(itemCanonical, offerCanonical, {
        allowSameCategoryWithoutFamily: true,
        allowDifferentSize: true,
      });
      if (!isDomainCompatible) {
        return null;
      }

      // Quantity ratio must be within reasonable bounds (0.70 - 1.30)
      const itemQ = normalizeQuantity(itemCanonical.quantity_value, itemCanonical.quantity_unit, itemCanonical.package_size);
      const offerQ = normalizeQuantity(offerCanonical.quantity_value, offerCanonical.quantity_unit, offerCanonical.package_size);

      let sizeCompatible = true;
      if (itemQ && offerQ) {
        if (itemQ.standardizedUnit !== offerQ.standardizedUnit) {
          sizeCompatible = false;
        } else {
          const ratio = offerQ.standardizedValue / itemQ.standardizedValue;
          if (ratio < 0.70 || ratio > 1.30) {
            sizeCompatible = false;
          }
        }
      }

      if (sizeCompatible) {
        return {
          offer,
          canonicalProduct: offerCanonical,
          matchQuality: 'substitution',
          isSubstitution: true,
          substitutionReason: `Alternativă din aceeași categorie (${offerCanonical.canonical_name})`,
          score: 0.65,
        };
      }
    }
  }

  return null;
}
