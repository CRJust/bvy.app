import { useEffect, useState } from 'react';

import type { DisplayProduct } from '@/services/beavy-catalog-search';
import { fetchProductPriceGrid } from '@/services/product-price-grid-api';
import type { PriceGridSummary } from '@/services/product-price-grid';

type State =
  | { key: string; status: 'ready'; summary: PriceGridSummary }
  | { key: string; status: 'error' };

/**
 * Încarcă grila de prețuri pe magazine pentru un produs canonic (cache 5 min în serviciu).
 * `enabled=false` amână cererea (ex. rânduri în afara ecranului sau grilă strânsă).
 */
export function useProductPriceGrid(
  product: (Pick<DisplayProduct, 'id'> & Partial<DisplayProduct>) | null,
  city?: string,
  enabled = true
): { status: 'idle' | 'loading' | 'ready' | 'error'; summary: PriceGridSummary | null } {
  const [state, setState] = useState<State | null>(null);
  const key = product ? `${product.id}|${(product.mergedProductIds ?? []).join(',')}|${city ?? ''}` : '';

  useEffect(() => {
    if (!product || !enabled) return;
    let cancelled = false;
    fetchProductPriceGrid(product, city)
      .then((summary) => {
        if (!cancelled) setState({ key, status: 'ready', summary });
      })
      .catch(() => {
        if (!cancelled) setState({ key, status: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // `product` e identificat prin `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, city]);

  if (!product || !enabled) return { status: 'idle', summary: null };
  if (!state || state.key !== key) return { status: 'loading', summary: null };
  if (state.status === 'error') return { status: 'error', summary: null };
  return { status: 'ready', summary: state.summary };
}
