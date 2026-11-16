import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** iOS-style sheet: slides up from the bottom, dimmed backdrop, grab handle. */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <button
        type="button"
        aria-label="Închide"
        onClick={onClose}
        className="ios-backdrop absolute inset-0 bg-[#421726]/40 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ios-sheet relative w-full md:max-w-lg max-h-[88dvh] flex flex-col bg-[#FFF6EE] rounded-t-[24px] md:rounded-[24px] shadow-[0_-8px_32px_rgba(66,23,38,0.18)]"
      >
        <div className="md:hidden flex justify-center pt-2" aria-hidden="true">
          <span className="w-9 h-1 rounded-full bg-[#765B60]/30" />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
          <h2 className="text-lg font-extrabold text-[#421726]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-[#765B60] hover:text-[#421726]"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}
