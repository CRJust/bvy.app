import { formatRon } from '../../utils/pricing.ts';
import { useAnimatedNumber } from './useAnimatedNumber.ts';

type PriceSize = 'sm' | 'md' | 'lg' | 'hero';

interface PriceDisplayProps {
  amount: number;
  /** Shelf price before promo / card, shown struck through. */
  struckAmount?: number | null;
  size?: PriceSize;
  /** Tween between values when the amount changes (totals only). */
  animated?: boolean;
  tone?: 'ink' | 'inverse';
  align?: 'left' | 'right';
}

const AMOUNT_CLASS: Record<PriceSize, string> = {
  sm: 'text-sm font-extrabold',
  md: 'text-base font-extrabold',
  lg: 'text-xl font-extrabold tracking-tight',
  hero: 'text-[34px] sm:text-[40px] leading-none font-extrabold tracking-[-0.02em]',
};

const STRUCK_CLASS: Record<PriceSize, string> = {
  sm: 'text-[11px]',
  md: 'text-xs',
  lg: 'text-xs',
  hero: 'text-sm',
};

function AnimatedRon({ amount }: { amount: number }) {
  const shown = useAnimatedNumber(amount);
  return <>{formatRon(Math.round(shown * 100) / 100)}</>;
}

/** Romanian-formatted price with tabular figures and an optional struck reference price. */
export function PriceDisplay({
  amount,
  struckAmount = null,
  size = 'sm',
  animated = false,
  tone = 'ink',
  align = 'right',
}: PriceDisplayProps) {
  const ink = tone === 'inverse' ? 'text-white' : 'text-cherry';
  const muted = tone === 'inverse' ? 'text-grapefruit/80' : 'text-muted';
  return (
    <span className={`flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start'}`}>
      <span className={`${AMOUNT_CLASS[size]} ${ink} tabular-nums whitespace-nowrap`}>
        {/* Screen readers get the exact value, never an intermediate tween frame */}
        <span className="sr-only">{formatRon(amount)}</span>
        <span aria-hidden="true">{animated ? <AnimatedRon amount={amount} /> : formatRon(amount)}</span>
      </span>
      {struckAmount !== null && struckAmount > amount + 0.004 && (
        <span className={`${STRUCK_CLASS[size]} ${muted} line-through tabular-nums whitespace-nowrap`}>
          {formatRon(struckAmount)}
        </span>
      )}
    </span>
  );
}
