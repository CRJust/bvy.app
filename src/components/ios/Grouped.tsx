import type { ReactNode } from 'react';

interface LargeTitleProps {
  title: string;
  /** Small line above the title, e.g. a greeting. */
  eyebrow?: string;
  subtitle?: string;
  trailing?: ReactNode;
}

/** iOS large title: big bold heading with a quiet subtitle underneath. */
export function LargeTitle({ title, eyebrow, subtitle, trailing }: LargeTitleProps) {
  return (
    <header className="flex items-end justify-between gap-3 pt-2">
      <div className="min-w-0">
        {eyebrow && <p className="text-[15px] font-semibold text-[#765B60]">{eyebrow}</p>}
        <h1 className="text-[34px] leading-[1.1] font-extrabold tracking-tight text-[#421726]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-[#765B60] tabular-nums">{subtitle}</p>}
      </div>
      {trailing}
    </header>
  );
}

interface GroupedSectionProps {
  title?: string;
  footer?: string;
  children: ReactNode;
  'aria-label'?: string;
}

/** Inset grouped list: small caps-free header, white rounded block, hairline separators. */
export function GroupedSection({ title, footer, children, ...rest }: GroupedSectionProps) {
  return (
    <section className="space-y-1.5" aria-label={rest['aria-label'] ?? title}>
      {title && (
        <h2 className="px-1 text-lg font-extrabold text-[#421726]">{title}</h2>
      )}
      <div className="bg-white rounded-[16px] overflow-hidden divide-y divide-[#EFE2D8]">
        {children}
      </div>
      {footer && <p className="px-4 text-xs text-[#765B60]">{footer}</p>}
    </section>
  );
}
