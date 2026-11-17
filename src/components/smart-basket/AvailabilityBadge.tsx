export type AvailabilityStatus = 'available' | 'out_of_stock' | 'unavailable';

const LABEL: Record<AvailabilityStatus, string> = {
  available: 'Disponibil',
  out_of_stock: 'Stoc epuizat',
  unavailable: 'Indisponibil',
};

const STYLE: Record<AvailabilityStatus, string> = {
  available: 'bg-leek text-leek-dark',
  out_of_stock: 'bg-grapefruit text-cherry',
  unavailable: 'bg-buttermilk border border-rule text-muted',
};

/** Offer status at a given store; mirrors EffectiveOffer.isUnavailable / isOutOfStock. */
export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  return (
    <span
      className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold whitespace-nowrap ${STYLE[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}
