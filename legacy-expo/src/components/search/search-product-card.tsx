import React from 'react';

import { BeavyCatalogProductCard } from '@/components/product/beavy-product-card';
import type { DisplayProduct } from '@/services/beavy-catalog-search';

type SearchProductCardProps = {
  product: DisplayProduct;
  quantity: number;
  onPressInspect: (product: DisplayProduct) => void;
  onStepQuantity: (product: DisplayProduct, nextQty: number) => void;
};

/**
 * Alias compatibil către componenta unificată BeavyCatalogProductCard (variantă catalog).
 */
export function SearchProductCard(props: SearchProductCardProps) {
  return <BeavyCatalogProductCard {...props} variant="catalog" />;
}
