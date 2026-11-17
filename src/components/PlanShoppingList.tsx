import { STORE_MAP } from '../data/stores.ts';
import type { CanonicalProduct, StoreId } from '../types.ts';
import { formatRon, type EffectiveOffer } from '../utils/pricing.ts';
import { getStruckPrice } from '../utils/productDisplay.ts';
import { AvailabilityBadge } from './smart-basket/AvailabilityBadge.tsx';
import { BasketProductRow } from './smart-basket/BasketProductRow.tsx';
import { PriceDisplay } from './smart-basket/PriceDisplay.tsx';
import { StoreGroup } from './smart-basket/StoreGroup.tsx';

export interface PlanLine {
  productId: string;
  quantity: number;
  product: CanonicalProduct;
  /** Verified offer at the plan's store for this line; null when the plan does not cover it. */
  offer: EffectiveOffer | null;
  /** Cheapest verified offer elsewhere, for lines the plan does not cover. */
  alternative: EffectiveOffer | null;
  /** Why the plan's store has no offer for this line (from EffectiveOffer.isOutOfStock). */
  planStoreStatus?: 'out_of_stock' | 'unavailable';
}

export interface PlanStoreGroup {
  storeId: StoreId;
  lines: PlanLine[];
  subtotal: number;
  deliveryFee: number;
}

interface PlanShoppingListProps {
  groups: PlanStoreGroup[];
  /** Sold at another store, but not part of this plan. */
  missingLines: PlanLine[];
  /** No verified price at any store. */
  unpricedLines: PlanLine[];
}

/** "What you buy and where": the accepted plan as a shopping list grouped by store. */
export function PlanShoppingList({ groups, missingLines, unpricedLines }: PlanShoppingListProps) {
  const coveredGroups = groups.filter((group) => group.lines.length > 0);
  if (coveredGroups.length === 0 && missingLines.length === 0 && unpricedLines.length === 0) {
    return null;
  }

  return (
    <section
      className="bg-white rounded-card overflow-hidden border border-rule shadow-card"
      aria-label="Lista de cumpărături pe magazine"
    >
      <div className="px-4 sm:px-5 py-3.5 border-b border-rule">
        <h2 className="text-lg font-extrabold text-cherry">Ce iei și de unde</h2>
      </div>

      {coveredGroups.map((group, index) => (
        <StoreGroup
          key={group.storeId}
          storeId={group.storeId}
          index={coveredGroups.length > 1 ? index + 1 : null}
          productCount={group.lines.length}
          subtotal={group.subtotal + group.deliveryFee}
          footer={
            group.deliveryFee > 0 && (
              <p className="px-4 sm:px-5 py-2 text-[11px] text-muted tabular-nums border-t border-rule">
                Include livrare {formatRon(group.deliveryFee)}
              </p>
            )
          }
        >
          {group.lines.map((line) => {
            const offer = line.offer;
            const struck = offer ? getStruckPrice(offer) : null;
            return (
              <BasketProductRow
                key={line.productId}
                product={line.product}
                quantity={line.quantity}
                displayName={offer?.variantLabel}
                trailing={
                  offer && (
                    <span className="flex flex-col items-end">
                      <PriceDisplay
                        amount={offer.price * line.quantity}
                        struckAmount={struck !== null ? struck * line.quantity : null}
                      />
                      {struck === null && offer.usedCardProgram && (
                        <span className="text-[11px] font-semibold text-leek-ink truncate max-w-full">
                          {offer.usedCardProgram}
                        </span>
                      )}
                    </span>
                  )
                }
              />
            );
          })}
        </StoreGroup>
      ))}

      {missingLines.length > 0 && (
        <div className="border-b border-rule last:border-b-0">
          <div className="px-4 sm:px-5 py-2.5 bg-grapefruit/60">
            <p className="text-xs font-extrabold text-cherry">
              Nu sunt în acest plan ({missingLines.length})
            </p>
            <p className="text-[11px] text-muted">Le găsești în alt magazin, la prețul de mai jos.</p>
          </div>
          <ul className="divide-y divide-rule">
            {missingLines.map((line) => (
              <BasketProductRow
                key={line.productId}
                product={line.product}
                quantity={line.quantity}
                badge={<AvailabilityBadge status={line.planStoreStatus ?? 'unavailable'} />}
                trailing={
                  line.alternative && (
                    <span className="flex flex-col items-end">
                      <span className="text-xs font-bold text-cherry">
                        {STORE_MAP[line.alternative.storeId].shortName}
                      </span>
                      <span className="text-[11px] text-muted tabular-nums">
                        {formatRon(line.alternative.price * line.quantity)}
                      </span>
                    </span>
                  )
                }
              />
            ))}
          </ul>
        </div>
      )}

      {unpricedLines.length > 0 && (
        <div>
          <div className="px-4 sm:px-5 py-2.5 bg-buttermilk">
            <p className="text-xs font-extrabold text-cherry">
              Fără preț verificat ({unpricedLines.length})
            </p>
            <p className="text-[11px] text-muted">Nu intră în total. Caută-le la raft.</p>
          </div>
          <ul className="divide-y divide-rule">
            {unpricedLines.map((line) => (
              <BasketProductRow
                key={line.productId}
                product={line.product}
                quantity={line.quantity}
                trailing={<span className="text-xs text-muted">—</span>}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
