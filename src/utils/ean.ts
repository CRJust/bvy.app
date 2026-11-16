import type { CanonicalProduct } from '../types.ts';

export interface EanValidationResult {
  valid: boolean;
  normalized: string;
  format: 'EAN-13' | 'EAN-8' | 'UPC-A' | null;
  reason?: string;
}

export function normalizeEanInput(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function computeGs1CheckDigit(digitsWithoutCheck: string): number {
  const len = digitsWithoutCheck.length;
  let sum = 0;
  // GS1 weights alternate 3 and 1 starting from the rightmost payload digit
  for (let i = 0; i < len; i++) {
    const digit = Number(digitsWithoutCheck[len - 1 - i]);
    const weight = i % 2 === 0 ? 3 : 1;
    sum += digit * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export function validateEanCode(raw: string): EanValidationResult {
  const normalized = normalizeEanInput(raw);
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      format: null,
      reason: 'Introdu cele 8 sau 13 cifre ale codului de bare.',
    };
  }

  let format: EanValidationResult['format'] = null;
  if (normalized.length === 13) format = 'EAN-13';
  else if (normalized.length === 8) format = 'EAN-8';
  else if (normalized.length === 12) format = 'UPC-A';
  else {
    return {
      valid: false,
      normalized,
      format: null,
      reason: `Codul trebuie să aibă 13 cifre (EAN-13) sau 8 cifre (EAN-8) — ai introdus ${normalized.length}.`,
    };
  }

  const payload = normalized.slice(0, -1);
  const actualCheck = Number(normalized[normalized.length - 1]);
  const expectedCheck = computeGs1CheckDigit(payload);

  if (actualCheck !== expectedCheck) {
    return {
      valid: false,
      normalized,
      format,
      reason: `Cifra de control invalidă pentru ${format} (așteptat ${expectedCheck}, primit ${actualCheck}).`,
    };
  }

  return {
    valid: true,
    normalized,
    format,
  };
}

export function findCatalogProductByEan(
  rawEan: string,
  catalog: CanonicalProduct[]
): CanonicalProduct | null {
  const normalized = normalizeEanInput(rawEan);
  if (!normalized) return null;

  const exact = catalog.find((p) => p.ean === normalized);
  if (exact) return exact;

  // Support UPC-A (12 digits) matching EAN-13 with leading zero
  if (normalized.length === 12) {
    const asEan13 = `0${normalized}`;
    return catalog.find((p) => p.ean === asEan13) ?? null;
  }

  return null;
}
