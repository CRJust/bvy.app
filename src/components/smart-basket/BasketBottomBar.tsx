import { ArrowRight } from 'lucide-react';
import { PriceDisplay } from './PriceDisplay.tsx';

/**
 * Sticky decision bar above the mobile tab bar (same placement as the Coș bar). The screen
 * reserves space below its content so the bar never covers the last rows.
 */
export function BasketBottomBar({
  label,
  total,
  actionLabel,
  onAction,
}: {
  label: string;
  total: number;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-30 bg-buttermilk/85 backdrop-blur-xl border-t border-rule/70 px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted truncate">{label}</p>
          <PriceDisplay amount={total} size="lg" animated align="left" />
        </div>
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center justify-center gap-2 px-5 min-h-[50px] rounded-[14px] bg-cherry text-white text-[15px] font-bold hover:bg-cherry-soft active:scale-[0.98] transition-[background-color,transform] duration-150 whitespace-nowrap"
        >
          <span>{actionLabel}</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
