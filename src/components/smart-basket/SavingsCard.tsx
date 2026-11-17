import { Check } from 'lucide-react';
import { formatRon, type OptimizationPlan } from '../../utils/pricing.ts';
import type { StrategyOption } from '../../utils/smartBasketView.ts';
import { PriceDisplay } from './PriceDisplay.tsx';
import { RetailerLogo } from './RetailerLogo.tsx';

/**
 * The answer for the chosen strategy: where to go, what it costs, and the saving against one
 * clearly named baseline (the market average computed by the engine).
 */
export function SavingsCard({
  plan,
  option,
}: {
  plan: OptimizationPlan;
  option: StrategyOption;
}) {
  const savings = option.savingsVsAverage;
  const pricedCount = plan.availableCount + plan.missingCount;
  const storeCount = option.storeIds.length;

  return (
    <div className="rounded-panel bg-cherry p-5 space-y-4 shadow-elevated" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-bold text-leek">
            {plan.isSplit ? 'Merită să mergi la 2 magazine' : 'Cel mai avantajos · 1 singur drum'}
          </p>
          <h2 className="text-[22px] sm:text-2xl font-extrabold text-white tracking-tight leading-tight">
            Mergi la {plan.storeLabel}
          </h2>
        </div>
        <span className="flex -space-x-2 shrink-0 pt-0.5">
          {option.storeIds.map((storeId) => (
            <RetailerLogo key={storeId} storeId={storeId} size="md" ring />
          ))}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <PriceDisplay
          amount={plan.totalWithDelivery}
          size="hero"
          tone="inverse"
          animated
          align="left"
          struckAmount={savings !== null ? plan.averageMarketTotal : null}
        />
        <span className="text-xs font-bold text-grapefruit tabular-nums pb-1">
          {storeCount === 1 ? '1 magazin' : `${storeCount} magazine`}
        </span>
      </div>

      {savings !== null ? (
        <p className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3 py-2 rounded-tile bg-leek text-leek-dark text-[13px] font-bold tabular-nums">
          Economisești {formatRon(savings)} față de media pieței
        </p>
      ) : (
        plan.missingCount > 0 && (
          <p className="text-[13px] text-grapefruit">
            Magazinul care acoperă cele mai multe produse din coș
          </p>
        )
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-3 border-t border-white/10">
        {pricedCount > 0 && (
          <span
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-bold tabular-nums ${
              plan.missingCount === 0 ? 'bg-leek text-leek-dark' : 'bg-grapefruit text-cherry'
            }`}
          >
            {plan.missingCount === 0 && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
            {plan.availableCount} din {pricedCount} produse disponibile
          </span>
        )}
        <span className="text-xs text-grapefruit tabular-nums">
          {plan.deliveryFee === 0
            ? 'Fără taxă livrare'
            : `Include livrare +${formatRon(plan.deliveryFee)}`}
          {plan.cardSavings > 0 && ` · Carduri -${formatRon(plan.cardSavings)}`}
        </span>
      </div>
    </div>
  );
}
