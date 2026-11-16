import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Minus,
  Plus,
  RotateCcw,
  ScanBarcode,
  Search,
  X,
} from 'lucide-react';
import { CATALOG, PRODUCT_MAP } from '../data/catalog.ts';
import type {
  BasketItem,
  CanonicalProduct,
  LoyaltyCardId,
  StoreId,
} from '../types.ts';
import {
  findCatalogProductByEan,
  normalizeEanInput,
  validateEanCode,
} from '../utils/ean.ts';
import { getEffectiveOffer, resolveProductForMode } from '../utils/pricing.ts';
import { ProductSummary } from './ProductSummary.tsx';

interface DetectedBarcode {
  rawValue?: string;
}

interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
}

interface EanScannerModalProps {
  open: boolean;
  onClose: () => void;
  basket: BasketItem[];
  resolvedStoreId: StoreId;
  hasChosenStore: boolean;
  economyMode: boolean;
  activeCards: LoyaltyCardId[];
  onAddProduct: (productId: string, product?: CanonicalProduct) => void;
  onUpdateQty: (productId: string, delta: number) => void;
}

const SAMPLE_EAN_IDS = [
  'zuzu_lapte_1l',
  'napolact_unt_200g',
  'jacobs_kronung_250g',
  'barilla_spaghetti_500g',
];

export function EanScannerModal({
  open,
  onClose,
  basket,
  resolvedStoreId,
  hasChosenStore,
  economyMode,
  activeCards,
  onAddProduct,
  onUpdateQty,
}: EanScannerModalProps) {
  const [manualEan, setManualEan] = useState('');
  const [scannedEan, setScannedEan] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<
    'idle' | 'starting' | 'scanning' | 'unsupported' | 'denied'
  >('idle');
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const [fallbackSearch, setFallbackSearch] = useState('');
  const [asyncMatchedProduct, setAsyncMatchedProduct] = useState<CanonicalProduct | null>(null);
  const [isLookingUpEan, setIsLookingUpEan] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleDetectedEan = useCallback(
    (rawValue: string) => {
      const normalized = normalizeEanInput(rawValue);
      if (!normalized) return;
      setManualEan(normalized);
      setScannedEan(normalized);
      stopCamera();
      setCameraStatus('idle');
    },
    [stopCamera]
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraMessage(null);

    const BarcodeDetectorCtor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;

    const hasCamera =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    if (!hasCamera || !BarcodeDetectorCtor) {
      setCameraStatus('unsupported');
      setCameraMessage(
        !hasCamera
          ? 'Camera nu este disponibilă în acest browser — introdu manual codul de bare de pe ambalaj.'
          : 'Scanarea live prin cameră nu este suportată pe acest dispozitiv — introdu codul EAN manual sau alege un exemplu rapid.'
      );
      return;
    }

    setCameraStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }

      const detector = new BarcodeDetectorCtor({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
      });
      setCameraStatus('scanning');

      timerRef.current = window.setInterval(async () => {
        const currentVideo = videoRef.current;
        if (!currentVideo || currentVideo.readyState < 2) return;
        try {
          const codes = await detector.detect(currentVideo);
          const hit = codes.find((c) => typeof c.rawValue === 'string' && c.rawValue.trim());
          if (hit?.rawValue) {
            handleDetectedEan(hit.rawValue);
          }
        } catch {
          // Frame decode error; continue next interval
        }
      }, 220);
    } catch {
      stopCamera();
      setCameraStatus('denied');
      setCameraMessage(
        'Accesul la cameră nu este permis sau nu există cameră activă — introdu codul EAN manual mai jos.'
      );
    }
  }, [handleDetectedEan, stopCamera]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setCameraStatus('idle');
      return;
    }

    void startCamera();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      stopCamera();
    };
  }, [open, onClose, startCamera, stopCamera]);

  if (!open) return null;

  const activeCode = scannedEan ?? '';
  const validation = activeCode ? validateEanCode(activeCode) : null;

  useEffect(() => {
    if (!activeCode || !validation?.valid) {
      setAsyncMatchedProduct(null);
      return;
    }
    const local = findCatalogProductByEan(activeCode, CATALOG);
    if (local) {
      setAsyncMatchedProduct(null);
      return;
    }

    setIsLookingUpEan(true);
    fetch(`/api/catalog/search?q=${encodeURIComponent(activeCode)}&limit=5`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (data && Array.isArray(data.products) && data.products.length > 0) {
          // Search is ilike on name/brand/barcode: accept only an exact GTIN match
          const digits = (v: string) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
          // A synthesized code is never a real barcode, so it can never match a scan
          const p = (data.products as CanonicalProduct[]).find(
            (cand) => !cand.eanIsSynthetic && digits(cand.ean) === digits(activeCode)
          );
          if (p) {
            PRODUCT_MAP[p.id] = p;
            setAsyncMatchedProduct(p);
          } else {
            setAsyncMatchedProduct(null);
          }
        } else {
          setAsyncMatchedProduct(null);
        }
      })
      .catch(() => setAsyncMatchedProduct(null))
      .finally(() => setIsLookingUpEan(false));
  }, [activeCode, validation?.valid]);

  const rawMatchedProduct =
    (activeCode && validation?.valid ? findCatalogProductByEan(activeCode, CATALOG) : null) ??
    asyncMatchedProduct;

  const resolvedMatch: CanonicalProduct | null = rawMatchedProduct
    ? resolveProductForMode(rawMatchedProduct, economyMode, PRODUCT_MAP).resolvedProduct
    : null;

  const basketEntry = resolvedMatch
    ? basket.find((b) => b.productId === resolvedMatch.id)
    : undefined;

  const storeOffer = resolvedMatch
    ? getEffectiveOffer(resolvedMatch, resolvedStoreId, activeCards)
    : null;

  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeEanInput(manualEan);
    if (!cleaned) return;
    setScannedEan(cleaned);
    stopCamera();
    setCameraStatus('idle');
  };

  const handleResetScan = () => {
    setScannedEan(null);
    setManualEan('');
    setFallbackSearch('');
    void startCamera();
    window.setTimeout(() => inputRef.current?.focus(), 60);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#421726]/45 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ean-scanner-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ios-sheet w-full sm:max-w-lg bg-[#FFF6EE] rounded-t-[24px] sm:rounded-[24px] max-h-[90vh] overflow-y-auto shadow-[0_-8px_32px_rgba(66,23,38,0.18)]">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-[#EFE2D8] flex items-center justify-between gap-3 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-[#FCE2DB] text-[#421726] flex items-center justify-center shrink-0">
              <ScanBarcode className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="ean-scanner-title" className="text-base font-extrabold text-[#421726]">
                Scanează cod EAN
              </h2>
              <p className="text-xs text-[#765B60]">
                Identifică produsul după codul de bare și adaugă-l în coș
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Închide scanerul EAN"
            className="w-11 h-11 rounded-full flex items-center justify-center text-[#765B60] hover:text-[#421726] hover:bg-[#FFF6EE] transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Live Camera Viewfinder (when no scanned code selected yet) */}
          {!scannedEan && (
            <div className="bg-white border border-[#EFE2D8] rounded-[16px] overflow-hidden">
              {cameraStatus === 'scanning' || cameraStatus === 'starting' ? (
                <div className="relative aspect-[16/10] bg-[#421726] flex items-center justify-center overflow-hidden">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute inset-x-10 inset-y-6 border-2 border-[#F78D79] rounded-[14px] pointer-events-none flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <div className="w-full h-0.5 bg-[#F78D79]/85" />
                  </div>
                  <p className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#421726]/85 text-white text-[11px] font-bold whitespace-nowrap">
                    {cameraStatus === 'starting'
                      ? 'Se pornește camera...'
                      : 'Încadrează codul de bare EAN-13'}
                  </p>
                </div>
              ) : (
                <div className="p-4 flex items-start gap-3">
                  <span className="w-9 h-9 rounded-full bg-[#FFF6EE] border border-[#EFE2D8] text-[#421726] flex items-center justify-center shrink-0">
                    <Camera className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div className="space-y-1.5 text-xs">
                    <p className="font-bold text-[#421726]">Scanare manuală / rapidă</p>
                    <p className="text-[#765B60] leading-relaxed">
                      {cameraMessage ??
                        'Îndreaptă camera spre codul de bare sau introdu cele 13 cifre de pe etichetă.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual EAN Entry Form */}
          <form onSubmit={handleSubmitManual} className="space-y-2">
            <label
              htmlFor="ean-manual-input"
              className="block text-xs font-bold text-[#421726]"
            >
              Cod de bare EAN (13 cifre)
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                id="ean-manual-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={13}
                value={manualEan}
                onChange={(e) => {
                  const cleaned = normalizeEanInput(e.target.value);
                  setManualEan(cleaned);
                  if (cleaned.length === 13 || cleaned.length === 8) {
                    setScannedEan(cleaned);
                    stopCamera();
                    setCameraStatus('idle');
                  } else if (scannedEan) {
                    setScannedEan(null);
                  }
                }}
                placeholder="Ex: 5941201001012"
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-full bg-white border border-[#EFE2D8] text-sm font-bold text-[#421726] placeholder:text-[#765B60]/70 tabular-nums focus:outline-none focus:border-[#421726]"
              />
              <button
                type="submit"
                disabled={manualEan.length === 0}
                className="px-5 py-2.5 min-h-[44px] rounded-full bg-[#421726] text-white text-xs font-bold hover:bg-[#5A2236] disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                Verifică
              </button>
            </div>
          </form>

          {/* Scanned Result Panel */}
          {scannedEan && validation && (
            <div className="bg-white border border-[#EFE2D8] rounded-[16px] p-4 space-y-3">
              {!validation.valid ? (
                <div className="space-y-2">
                  <p className="text-xs font-extrabold text-[#421726]">
                    Cod EAN invalid ({validation.normalized})
                  </p>
                  <p className="text-xs text-[#765B60]">{validation.reason}</p>
                  <button
                    type="button"
                    onClick={handleResetScan}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#421726] underline underline-offset-4"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Încearcă din nou</span>
                  </button>
                </div>
              ) : resolvedMatch && storeOffer ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#263B1D]">
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Produs identificat · {validation.format}</span>
                    </span>
                    {/* Same product card as in search: real photo, clean size, verified prices only */}
                    <ProductSummary
                      product={resolvedMatch}
                      activeCards={activeCards}
                      storeId={resolvedStoreId}
                      hasChosenStore={hasChosenStore}
                      showEan
                    />
                  </div>

                  <div className="pt-2 border-t border-[#EFE2D8] flex flex-wrap items-center justify-between gap-2">
                    {basketEntry ? (
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center rounded-full border border-[#EFE2D8] bg-[#FFF6EE]">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(resolvedMatch.id, -1)}
                            aria-label={`Scade cantitatea pentru ${resolvedMatch.canonicalName}`}
                            className="w-11 h-11 flex items-center justify-center text-[#421726]"
                          >
                            <Minus className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <span className="px-2.5 text-sm font-extrabold text-[#421726] tabular-nums">
                            {basketEntry.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(resolvedMatch.id, 1)}
                            aria-label={`Crește cantitatea pentru ${resolvedMatch.canonicalName}`}
                            className="w-11 h-11 flex items-center justify-center text-[#421726]"
                          >
                            <Plus className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                        <span className="text-xs font-bold text-[#263B1D]">În coș</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAddProduct(resolvedMatch.id, resolvedMatch)}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-full bg-[#421726] text-white text-xs font-bold hover:bg-[#5A2236] transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Adaugă în coș</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleResetScan}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#765B60] hover:text-[#421726] py-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Scanează alt cod</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-extrabold text-[#421726]">
                      Cod valid ({validation.format}: {validation.normalized}) — nu l-am găsit încă în catalog
                    </p>
                    <p className="text-xs text-[#765B60] mt-0.5">
                      Caută echivalentul din catalog ca să îl adaugi direct în coș:
                    </p>
                  </div>
                  <div className="relative">
                    <Search
                      className="w-4 h-4 text-[#765B60] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={fallbackSearch}
                      onChange={(e) => setFallbackSearch(e.target.value)}
                      placeholder="Ex: lapte, unt, cafea, ulei..."
                      aria-label="Caută produs echivalent în catalog"
                      className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-full bg-[#FFF6EE] border border-[#EFE2D8] text-xs text-[#421726] focus:outline-none focus:border-[#421726]"
                    />
                  </div>
                  {fallbackSearch.trim().length > 0 && (
                    <div className="max-h-40 overflow-y-auto divide-y divide-[#EFE2D8] rounded-[12px] border border-[#EFE2D8]">
                      {CATALOG.filter((p) => {
                        if (!economyMode && p.isPrivateLabel) return false;
                        const q = fallbackSearch.trim().toLowerCase();
                        return (
                          p.canonicalName.toLowerCase().includes(q) ||
                          p.brand.toLowerCase().includes(q) ||
                          p.category.toLowerCase().includes(q)
                        );
                      })
                        .slice(0, 5)
                        .map((p) => (
                          <div
                            key={p.id}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-bold text-[#421726] truncate">
                              {p.canonicalName} ({p.packageSize})
                            </span>
                            <button
                              type="button"
                              onClick={() => onAddProduct(p.id)}
                              className="px-3 py-1 rounded-full bg-[#421726] text-white font-bold shrink-0"
                            >
                              + Adaugă
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleResetScan}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#765B60] hover:text-[#421726]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Încearcă alt cod EAN</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick Sample EANs from Catalog */}
          <div className="pt-1 space-y-2">
            <p className="text-[11px] font-bold text-[#765B60]">
              Testează rapid cu coduri EAN din catalog:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_EAN_IDS.map((pid) => {
                const prod = PRODUCT_MAP[pid];
                if (!prod) return null;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => handleDetectedEan(prod.ean)}
                    className="px-3 py-1.5 rounded-full bg-white border border-[#EFE2D8] text-[11px] font-semibold text-[#421726] hover:bg-[#FCE2DB]/60 transition-colors tabular-nums"
                  >
                    {prod.canonicalName.split(' ').slice(0, 2).join(' ')} · {prod.ean}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
