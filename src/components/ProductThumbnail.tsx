import { useState } from 'react';
import { Coffee, Fish, Milk, Package, Salad } from 'lucide-react';
import { CATEGORY_IMAGES } from '../data/stores.ts';
import type { ProductCategory } from '../types.ts';

interface ProductThumbnailProps {
  category: ProductCategory;
  name: string;
  /** Real product photo; falls back to the category image, then to an icon. */
  imageUrl?: string;
  size?: 'sm' | 'md';
}

function CategoryFallbackIcon({ category }: { category: ProductCategory }) {
  switch (category) {
    case 'Lactate & Ouă':
      return <Milk className="w-5 h-5 text-[#421726]/70" aria-hidden="true" />;
    case 'Carne & Pește':
      return <Fish className="w-5 h-5 text-[#421726]/70" aria-hidden="true" />;
    case 'Fructe & Legume':
      return <Salad className="w-5 h-5 text-[#421726]/70" aria-hidden="true" />;
    case 'Cafea & Băuturi':
      return <Coffee className="w-5 h-5 text-[#421726]/70" aria-hidden="true" />;
    default:
      return <Package className="w-5 h-5 text-[#421726]/70" aria-hidden="true" />;
  }
}

export function ProductThumbnail({ category, name, imageUrl, size = 'md' }: ProductThumbnailProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  // Order: direct photo -> same photo through our server -> category image -> icon
  const proxied = imageUrl ? `/api/img?u=${encodeURIComponent(imageUrl)}` : undefined;
  const src = [imageUrl, proxied, CATEGORY_IMAGES[category]].find(
    (candidate): candidate is string => Boolean(candidate) && !failedSources.includes(candidate!)
  );
  const isProductPhoto = Boolean(src) && (src === imageUrl || src === proxied);
  const dims = size === 'sm' ? 'w-11 h-11 rounded-[12px]' : 'w-14 h-14 rounded-[12px]';

  if (!src) {
    return (
      <div
        className={`${dims} shrink-0 bg-[#FCE2DB]/70 border border-[#EFE2D8] flex items-center justify-center`}
        aria-hidden="true"
      >
        <CategoryFallbackIcon category={category} />
      </div>
    );
  }

  return (
    <div
      className={`${dims} shrink-0 overflow-hidden border border-[#EFE2D8] ${
        isProductPhoto ? 'bg-white' : 'bg-[#FFF6EE]'
      }`}
    >
      <img
        key={src}
        src={src}
        alt={name}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedSources((prev) => (prev.includes(src) ? prev : [...prev, src]))}
        className={
          isProductPhoto ? 'w-full h-full object-contain p-1' : 'w-full h-full object-cover'
        }
      />
    </div>
  );
}
