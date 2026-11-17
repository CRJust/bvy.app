import auchanLogo from '../../../assets/retailers/auchan.png';
import carrefourLogo from '../../../assets/retailers/carrefour.png';
import freshfulLogo from '../../../assets/retailers/freshful.png';
import kauflandLogo from '../../../assets/retailers/kaufland.png';
import lidlLogo from '../../../assets/retailers/lidl.png';
import megaImageLogo from '../../../assets/retailers/mega-image.png';
import pennyLogo from '../../../assets/retailers/penny.png';
import sezamoLogo from '../../../assets/retailers/sezamo.png';
import { STORE_MAP } from '../../data/stores.ts';
import type { StoreId } from '../../types.ts';

/** Official retailer logos from assets/retailers. Profi has no asset: it uses its brand colour. */
const LOGOS: Partial<Record<StoreId, string>> = {
  auchan: auchanLogo,
  carrefour: carrefourLogo,
  freshful: freshfulLogo,
  kaufland: kauflandLogo,
  lidl: lidlLogo,
  mega_image: megaImageLogo,
  penny: pennyLogo,
  sezamo: sezamoLogo,
};

const SIZE = {
  xs: 'w-5 h-5 rounded-[6px] text-[8px]',
  sm: 'w-8 h-8 rounded-[8px] text-[10px]',
  md: 'w-10 h-10 rounded-[12px] text-xs',
} as const;

export function RetailerLogo({
  storeId,
  size = 'sm',
  ring = false,
}: {
  storeId: StoreId;
  size?: keyof typeof SIZE;
  /** Thin buttermilk ring, used when logos overlap. */
  ring?: boolean;
}) {
  const store = STORE_MAP[storeId];
  const logo = LOGOS[storeId];
  const ringClass = ring ? 'ring-2 ring-white' : 'border border-rule';

  if (logo) {
    return (
      <span className={`${SIZE[size]} ${ringClass} shrink-0 overflow-hidden bg-white inline-flex`}>
        <img src={logo} alt={store.name} className="w-full h-full object-contain" loading="lazy" />
      </span>
    );
  }

  const initials = store.shortName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      role="img"
      aria-label={store.name}
      className={`${SIZE[size]} ${ringClass} shrink-0 inline-flex items-center justify-center font-extrabold`}
      style={{ backgroundColor: store.accentHex, color: store.badgeTextHex }}
    >
      {initials}
    </span>
  );
}
