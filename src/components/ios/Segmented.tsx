interface SegmentedProps<T extends string | number> {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}

/** iOS segmented control: one rounded track, selected segment raised. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-full p-0.5 rounded-[10px] bg-[#EFE2D8]/80"
    >
      {options.map((opt) => {
        const selected = opt.id === value;
        return (
          <button
            key={String(opt.id)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.id)}
            className={`flex-1 min-h-[40px] px-3 rounded-[8px] text-sm font-bold whitespace-nowrap transition-all ${
              selected
                ? 'bg-white text-[#421726] shadow-[0_1px_3px_rgba(66,23,38,0.15)]'
                : 'text-[#765B60]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
