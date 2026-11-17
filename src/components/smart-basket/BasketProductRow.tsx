import type { ReactNode } from 'react';
import type { CanonicalProduct } from '../../types.ts';
import { formatProductMeta } from '../../utils/productDisplay.ts';
import { ProductThumbnail } from '../ProductThumbnail.tsx';

/** One basket line: existing photo, canonical (or store variant) name, quantity and size. */
export function BasketProductRow({
  product,
  quantity,
  displayName,
  trailing,
  badge,
}: {
  product: CanonicalProduct;
  quantity: number;
  /** Store-specific variant label when the offer has one, else the canonical name. */
  displayName?: string | null;
  trailing?: ReactNode;
  badge?: ReactNode;
}) {
  const meta = formatProductMeta(product);
  return (
    <li className="px-4 sm:px-5 py-3 flex items-center gap-3 min-h-[68px]">
      <ProductThumbnail
        category={product.category}
        name={product.canonicalName}
        imageUrl={product.imageUrl}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-cherry leading-[19px] line-clamp-2">
          {displayName ?? product.canonicalName}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted tabular-nums min-w-0">
          <span className="shrink-0 font-bold text-cherry">{quantity}×</span>
          {meta && <span className="truncate">{meta}</span>}
          {badge}
        </p>
      </div>
      {trailing && <div className="shrink-0 max-w-[40%]">{trailing}</div>}
    </li>
  );
}
