import type { ReactNode } from 'react';
import { STORE_MAP } from '../data/stores.ts';
import type { CanonicalProduct, StoreId } from '../types.ts';
import { formatRon, type EffectiveOffer } from '../utils/pricing.ts';
import { formatProductMeta, getStruckPrice } from '../utils/productDisplay.ts';
import { ProductThumbnail } from './ProductThumbnail.tsx';

export interface PlanLine {
  productId: string;
  quantity: number;
  product: CanonicalProduct;
  /** Verified offer at the plan's store for this line; null when the plan does not cover it. */
  offer: EffectiveOffer | null;
  /** Cheapest verified offer elsewhere, for lines the plan does not cover. */
  alternative: EffectiveOffer | null;
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

function LineRow({ line, trailing }: { line: PlanLine; trailing: ReactNode }) {
  const meta = formatProductMeta(line.product);
  return (
    <li className="px-4 py-3 flex items-center gap-3">
      <ProductThumbnail
        category={line.product.category}
        name={line.product.canonicalName}
        imageUrl={line.product.imageUrl}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-[#421726] leading-snug line-clamp-2">
          <span className="tabular-nums">{line.quantity}× </span>
          {line.offer?.variantLabel ?? line.product.canonicalName}
        </p>
        {meta && <p className="mt-0.5 text-[11px] text-[#765B60] tabular-nums truncate">{meta}</p>}
      </div>
      <div className="text-right shrink-0 max-w-[40%]">{trailing}</div>
    </li>
  );
}

/** "What you buy and where": the accepted plan as a shopping list grouped by store. */
export function PlanShoppingList({ groups, missingLines, unpricedLines }: PlanShoppingListProps) {
  const coveredGroups = groups.filter((group) => group.lines.length > 0);
  if (coveredGroups.length === 0 && missingLines.length === 0 && unpricedLines.length === 0) {
    return null;
  }

  return (
    <section
      className="bg-white rounded-[16px] overflow-hidden"
      aria-label="Lista de cumpărături pe magazine"
    >
      <div className="px-4 sm:px-5 py-3.5 border-b border-[#EFE2D8]">
        <h2 className="text-lg font-extrabold text-[#421726]">Ce iei și de unde</h2>
      </div>

      {coveredGroups.map((group, index) => (
        <div key={group.storeId} className="border-b border-[#EFE2D8] last:border-b-0">
          <div className="px-4 sm:px-5 py-2.5 bg-[#FFF6EE] flex items-center justify-between gap-3">
            <p className="text-xs font-extrabold text-[#421726]">
              {coveredGroups.length > 1 ? `${index + 1}. ` : ''}
              {STORE_MAP[group.storeId].name}
              <span className="font-semibold text-[#765B60]">
                {' '}
                · {group.lines.length === 1 ? '1 produs' : `${group.lines.length} produse`}
              </span>
            </p>
            <p className="text-xs font-extrabold text-[#421726] tabular-nums whitespace-nowrap">
              {formatRon(group.subtotal + group.deliveryFee)}
            </p>
          </div>
          <ul className="divide-y divide-[#EFE2D8]">
            {group.lines.map((line) => {
              const struck = line.offer ? getStruckPrice(line.offer) : null;
              return (
                <LineRow
                  key={line.productId}
                  line={line}
                  trailing={
                    line.offer && (
                      <>
                        <p className="text-sm font-extrabold text-[#421726] tabular-nums">
                          {formatRon(line.offer.price * line.quantity)}
                        </p>
                        {struck !== null ? (
                          <p className="text-[11px] text-[#765B60] line-through tabular-nums">
                            {formatRon(struck * line.quantity)}
                          </p>
                        ) : (
                          line.offer.usedCardProgram && (
                            <p className="text-[11px] font-semibold text-[#263B1D] truncate">
                              {line.offer.usedCardProgram}
                            </p>
                          )
                        )}
                      </>
                    )
                  }
                />
              );
            })}
          </ul>
          {group.deliveryFee > 0 && (
            <p className="px-4 sm:px-5 py-2 text-[11px] text-[#765B60] tabular-nums border-t border-[#EFE2D8]">
              Include livrare {formatRon(group.deliveryFee)}
            </p>
          )}
        </div>
      ))}

      {missingLines.length > 0 && (
        <div className="border-b border-[#EFE2D8] last:border-b-0">
          <div className="px-4 sm:px-5 py-2.5 bg-[#FCE2DB]/60">
            <p className="text-xs font-extrabold text-[#421726]">
              Nu sunt în acest plan ({missingLines.length})
            </p>
            <p className="text-[11px] text-[#765B60]">Le găsești în alt magazin, la prețul de mai jos.</p>
          </div>
          <ul className="divide-y divide-[#EFE2D8]">
            {missingLines.map((line) => (
              <LineRow
                key={line.productId}
                line={line}
                trailing={
                  line.alternative && (
                    <>
                      <p className="text-xs font-bold text-[#421726]">
                        {STORE_MAP[line.alternative.storeId].shortName}
                      </p>
                      <p className="text-[11px] text-[#765B60] tabular-nums">
                        {formatRon(line.alternative.price * line.quantity)}
                      </p>
                    </>
                  )
                }
              />
            ))}
          </ul>
        </div>
      )}

      {unpricedLines.length > 0 && (
        <div>
          <div className="px-4 sm:px-5 py-2.5 bg-[#FFF6EE]">
            <p className="text-xs font-extrabold text-[#421726]">
              Fără preț verificat ({unpricedLines.length})
            </p>
            <p className="text-[11px] text-[#765B60]">Nu intră în total. Caută-le la raft.</p>
          </div>
          <ul className="divide-y divide-[#EFE2D8]">
            {unpricedLines.map((line) => (
              <LineRow
                key={line.productId}
                line={line}
                trailing={<p className="text-xs text-[#765B60]">—</p>}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
