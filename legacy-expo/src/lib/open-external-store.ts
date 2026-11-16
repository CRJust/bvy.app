import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

export type OutboundClickSource =
  | 'comparison_list'
  | 'store_breakdown'
  | 'store_mode'
  | 'other';

export type OutboundClickAttribution = {
  retailerName: string;
  retailerSlug?: string | null;
  source: OutboundClickSource;
  channelMode?: 'physical' | 'online' | 'all' | 'hybrid';
  listName?: string;
  itemsCount?: number;
  estimatedValueRon?: number | null;
};

export type TrackedOutboundClickPayload = OutboundClickAttribution & {
  targetUrl: string;
  itemsCount: number;
  estimatedValueRon: number | null;
};

export type OutboundClickRecordSummaryInput = {
  id: string;
  clickedAt: string;
  retailerName: string;
  retailerSlug?: string | null;
  source: OutboundClickSource;
  channelMode?: 'physical' | 'online' | 'all' | 'hybrid';
  listName?: string;
  itemsCount: number;
  estimatedValueRon: number | null;
  targetUrl: string;
};

export type RetailerClickBreakdown = {
  retailerName: string;
  retailerSlug: string | null;
  clicks: number;
  referredRon: number;
  lastClickedAt: string;
};

export type OutboundClicksSummary = {
  totalClicks: number;
  totalReferredRon: number;
  uniqueRetailersCount: number;
  byRetailer: RetailerClickBreakdown[];
};

function sanitizeUtmToken(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

/**
 * Adaugă parametri UTM standardizați de atribuire Beavy pe linkurile de ieșire către retaileri.
 */
export function appendBeavyAttributionParams(
  rawUrl: string,
  attribution?: Partial<OutboundClickAttribution>
): string {
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (!parsed.searchParams.has('utm_source')) {
      parsed.searchParams.set('utm_source', 'beavy');
    }
    if (!parsed.searchParams.has('utm_medium')) {
      parsed.searchParams.set('utm_medium', 'partner_demo');
    }
    if (!parsed.searchParams.has('utm_campaign')) {
      parsed.searchParams.set(
        'utm_campaign',
        sanitizeUtmToken(attribution?.source, 'basket_checkout')
      );
    }
    if (!parsed.searchParams.has('utm_content') && (attribution?.retailerSlug || attribution?.retailerName)) {
      parsed.searchParams.set(
        'utm_content',
        sanitizeUtmToken(attribution.retailerSlug ?? attribution.retailerName, 'retailer')
      );
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function summarizeOutboundClicks(
  clicks: readonly OutboundClickRecordSummaryInput[]
): OutboundClicksSummary {
  const retailerMap = new Map<string, RetailerClickBreakdown>();
  let totalReferredRon = 0;

  for (const entry of clicks) {
    const cleanRon =
      typeof entry.estimatedValueRon === 'number' &&
      Number.isFinite(entry.estimatedValueRon) &&
      entry.estimatedValueRon > 0
        ? entry.estimatedValueRon
        : 0;
    totalReferredRon += cleanRon;

    const key = (entry.retailerSlug || entry.retailerName).toLowerCase();
    const existing = retailerMap.get(key);
    if (existing) {
      existing.clicks += 1;
      existing.referredRon = Math.round((existing.referredRon + cleanRon) * 100) / 100;
      if (entry.clickedAt > existing.lastClickedAt) {
        existing.lastClickedAt = entry.clickedAt;
      }
    } else {
      retailerMap.set(key, {
        retailerName: entry.retailerName,
        retailerSlug: entry.retailerSlug ?? null,
        clicks: 1,
        referredRon: Math.round(cleanRon * 100) / 100,
        lastClickedAt: entry.clickedAt,
      });
    }
  }

  const byRetailer = Array.from(retailerMap.values()).sort(
    (a, b) => b.clicks - a.clicks || b.referredRon - a.referredRon
  );

  return {
    totalClicks: clicks.length,
    totalReferredRon: Math.round(totalReferredRon * 100) / 100,
    uniqueRetailersCount: byRetailer.length,
    byRetailer,
  };
}

export async function openExternalStoreUrl(
  rawUrl: string | null | undefined,
  attribution?: OutboundClickAttribution,
  onTrackedClick?: (payload: TrackedOutboundClickPayload) => void
): Promise<boolean> {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;

  const targetUrl = appendBeavyAttributionParams(trimmed, attribution);

  if (onTrackedClick && attribution) {
    try {
      onTrackedClick({
        ...attribution,
        itemsCount: Math.max(0, Math.floor(attribution.itemsCount ?? 0)),
        estimatedValueRon:
          typeof attribution.estimatedValueRon === 'number' &&
          Number.isFinite(attribution.estimatedValueRon)
            ? Math.round(attribution.estimatedValueRon * 100) / 100
            : null,
        targetUrl,
      });
    } catch {
      // Telemetria locală nu trebuie să blocheze navigarea către retailer
    }
  }

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      return true;
    }
    return false;
  }

  try {
    await WebBrowser.openBrowserAsync(targetUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
    });
    return true;
  } catch {
    try {
      await Linking.openURL(targetUrl);
      return true;
    } catch {
      return false;
    }
  }
}
