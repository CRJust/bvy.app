import { formatRon } from '../../utils/pricing.ts';
import type { BasketStrategyId, StrategyOption } from '../../utils/smartBasketView.ts';
import { RetailerLogo } from './RetailerLogo.tsx';

const TITLES: Record<BasketStrategyId, string> = {
  single: 'Un magazin',
  two: 'Două magazine',
  lowest: 'Cel mai mic total',
};

const ORDER: BasketStrategyId[] = ['single', 'two', 'lowest'];

function storeCountLabel(count: number): string {
  return count === 1 ? '1 magazin' : `${count} magazine`;
}

function StrategyCard({
  option,
  selected,
  recommended,
  showCoverage,
  onSelect,
}: {
  option: StrategyOption;
  selected: boolean;
  recommended: boolean;
  /** Options cover different numbers of products, so totals alone are not comparable. */
  showCoverage: boolean;
  onSelect: () => void;
}) {
  const disabled = !option.selectable;
  const partialCoverage =
    option.selectable &&
    option.pricedCount > 0 &&
    (showCoverage || option.availableCount < option.pricedCount);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onSelect}
      className={`relative min-h-[132px] w-full rounded-card px-3 pt-3 pb-2.5 text-left flex flex-col gap-2 border transition-[background-color,border-color,box-shadow,transform] duration-200 ease-beavy-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-strawberry ${
        selected
          ? 'bg-white border-cherry shadow-[inset_0_0_0_1px_var(--color-cherry)]'
          : disabled
            ? 'bg-buttermilk border-rule cursor-not-allowed'
            : 'bg-white/70 border-rule hover:bg-white hover:border-paper-rule'
      }`}
    >
      {recommended && (
        <span className="absolute -top-2 right-2 h-[18px] px-1.5 rounded-full bg-grapefruit text-cherry text-[10px] font-extrabold inline-flex items-center">
          Recomandat
        </span>
      )}

      {/* Two-line slot so every total sits on the same baseline */}
      <span
        className={`block min-h-[30px] text-[12px] font-bold leading-[15px] ${selected ? 'text-cherry' : 'text-muted'}`}
      >
        {TITLES[option.id]}
      </span>

      <span
        className={`block text-[15px] sm:text-base font-extrabold tabular-nums whitespace-nowrap leading-none ${
          disabled ? 'text-muted' : 'text-cherry'
        }`}
      >
        {option.total !== null ? formatRon(option.total) : '—'}
      </span>

      <span className="flex flex-col gap-1 mt-auto">
        <span className={`flex -space-x-1.5 min-h-[20px] ${disabled ? 'opacity-50' : ''}`}>
          {option.storeIds.map((storeId) => (
            <RetailerLogo key={storeId} storeId={storeId} size="xs" ring />
          ))}
        </span>
        <span className="text-[11px] font-semibold leading-[14px] text-muted tabular-nums line-clamp-2">
          {disabled
            ? option.unavailableReason === 'split_not_worthwhile'
              ? '1 drum merită mai mult'
              : 'Indisponibil'
            : partialCoverage
              ? `${option.availableCount} din ${option.pricedCount} produse`
              : option.savingsVsAverage !== null
                ? <span className="font-bold text-leek-dark">-{formatRon(option.savingsVsAverage)}</span>
                : storeCountLabel(option.storeIds.length)}
        </span>
      </span>
    </button>
  );
}

/** Three shopping strategies computed by the existing optimizer, shown side by side. */
export function StrategySelector({
  options,
  value,
  recommended,
  onChange,
}: {
  options: Record<BasketStrategyId, StrategyOption>;
  value: BasketStrategyId;
  recommended: BasketStrategyId;
  onChange: (id: BasketStrategyId) => void;
}) {
  const coverageCounts = new Set(
    ORDER.filter((id) => options[id].selectable).map((id) => options[id].availableCount)
  );
  const showCoverage = coverageCounts.size > 1;
  return (
    <div role="radiogroup" aria-label="Compară și alege varianta de optimizare" className="grid grid-cols-3 gap-2 pt-2">
      {ORDER.map((id) => (
        <StrategyCard
          key={id}
          option={options[id]}
          selected={value === id}
          recommended={recommended === id && options[id].selectable}
          showCoverage={showCoverage}
          onSelect={() => onChange(id)}
        />
      ))}
    </div>
  );
}
