import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { STORE_MAP } from '../../data/stores.ts';
import type { StoreId } from '../../types.ts';
import { formatRon } from '../../utils/pricing.ts';
import { RetailerLogo } from './RetailerLogo.tsx';

export function StoreHeader({
  storeId,
  index,
  productCount,
  subtotal,
  expanded,
  controlsId,
  onToggle,
}: {
  storeId: StoreId;
  /** 1-based stop number when the plan has several stores. */
  index: number | null;
  productCount: number;
  subtotal: number;
  expanded: boolean;
  controlsId: string;
  onToggle: () => void;
}) {
  const store = STORE_MAP[storeId];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      className="w-full min-h-[60px] px-4 sm:px-5 py-2.5 bg-buttermilk/70 flex items-center gap-3 text-left hover:bg-buttermilk transition-colors"
    >
      <RetailerLogo storeId={storeId} size="sm" />
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-extrabold text-cherry leading-tight truncate">
          {index !== null ? `${index}. ` : ''}
          {store.name}
        </span>
        <span className="block text-xs text-muted tabular-nums">
          {productCount === 1 ? '1 produs' : `${productCount} produse`}
        </span>
      </span>
      <span className="text-[15px] font-extrabold text-cherry tabular-nums whitespace-nowrap">
        {formatRon(subtotal)}
      </span>
      <ChevronDown
        className={`w-4 h-4 text-muted shrink-0 transition-transform duration-200 ease-beavy-out ${
          expanded ? 'rotate-180' : ''
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

/** Collapsible group of basket lines bought at one store. */
export function StoreGroup({
  storeId,
  index,
  productCount,
  subtotal,
  footer,
  children,
}: {
  storeId: StoreId;
  index: number | null;
  productCount: number;
  subtotal: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  return (
    <div className="border-b border-rule last:border-b-0">
      <StoreHeader
        storeId={storeId}
        index={index}
        productCount={productCount}
        subtotal={subtotal}
        expanded={expanded}
        controlsId={contentId}
        onToggle={() => setExpanded((prev) => !prev)}
      />
      {/* grid-rows 0fr↔1fr animates height without measuring the DOM */}
      <div
        id={contentId}
        className={`grid transition-[grid-template-rows] duration-200 ease-beavy-out ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        inert={!expanded}
      >
        <div className="overflow-hidden">
          <ul className="divide-y divide-rule">{children}</ul>
          {footer}
        </div>
      </div>
    </div>
  );
}
