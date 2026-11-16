import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { ProductImageBox } from '@/components/product-image-box';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import { useProductPriceGrid } from '@/hooks/use-product-price-grid';
import type { DisplayProduct } from '@/services/beavy-catalog-search';
import {
  cheapestHeadline,
  formatPriceLei,
  type PriceCell,
  type PriceGridSummary,
} from '@/services/product-price-grid';

type GridProduct = Pick<DisplayProduct, 'id'> & Partial<DisplayProduct>;

const ANIM_MS = 150;

/** O celulă de magazin: logo, preț mare, preț unitar, tip potrivire, promoție / card. */
export const PriceCellView = React.memo(function PriceCellView({
  cell,
  onPress,
  selected,
}: {
  cell: PriceCell;
  onPress?: (cell: PriceCell) => void;
  selected?: boolean;
}) {
  const deltaText =
    !cell.isCheapest && cell.deltaVsCheapest > 0.04
      ? `+${cell.deltaVsCheapest.toFixed(2).replace('.', ',')} lei`
      : null;

  const body = (
    <>
      <View style={styles.cellTop}>
        <RetailerLogo retailerName={cell.retailerName} size={22} shape="circle" />
        <Text style={styles.cellStore} numberOfLines={1}>
          {cell.retailerName}
        </Text>
        {cell.isCheapest ? (
          <View style={styles.topBestTag}>
            <Text style={styles.topBestTagText}>#1</Text>
          </View>
        ) : deltaText ? (
          <Text style={styles.deltaTag}>{deltaText}</Text>
        ) : null}
      </View>

      <View style={styles.cellPriceRow}>
        <Text style={styles.cellPrice}>{formatPriceLei(cell.price)}</Text>
        {cell.packageSize ? (
          <Text style={styles.cellPkgSize} numberOfLines={1}>
            {cell.packageSize}
          </Text>
        ) : null}
      </View>

      {cell.unitPriceLabel ? <Text style={styles.cellUnit}>{cell.unitPriceLabel}</Text> : null}

      <View style={styles.badges}>
        {cell.isCheapest ? (
          <View style={[styles.badge, styles.badgeBest]}>
            <Text style={styles.badgeText}>Cel mai ieftin</Text>
          </View>
        ) : null}
        {cell.kind === 'exact' ? (
          <View style={[styles.badge, styles.badgeExact]}>
            <Text style={styles.badgeText}>Exact</Text>
          </View>
        ) : (
          <View style={[styles.badge, styles.badgeAlt]}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {cell.variantTier === 'private_label'
                ? 'Brand propriu'
                : cell.variantTier === 'cheaper'
                  ? 'Mai ieftin'
                  : cell.variantTier === 'premium'
                    ? 'Mai premium'
                    : 'Alternativă'}
              {cell.altLabel ? ` · ${cell.altLabel}` : ''}
            </Text>
          </View>
        )}
        {cell.discountPercent ? (
          <View style={[styles.badge, styles.badgePromo]}>
            <Text style={styles.badgeText}>−{cell.discountPercent}%</Text>
          </View>
        ) : null}
        {cell.cardProgram ? (
          <View style={[styles.badge, styles.badgePromo]}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {cell.cardProgram}
              {cell.loyaltyPrice ? ` ${formatPriceLei(cell.loyaltyPrice)}` : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );

  const a11y = `${cell.retailerName}, ${formatPriceLei(cell.price)}${
    cell.unitPriceLabel ? `, ${cell.unitPriceLabel}` : ''
  }${cell.isCheapest ? ', cel mai ieftin' : ''}${cell.kind === 'exact' ? ', potrivire exactă' : ', alternativă'}`;

  const style = [styles.cell, cell.isCheapest && styles.cellBest, selected && styles.cellSelected];
  if (!onPress) {
    return (
      <View style={style} accessible accessibilityLabel={a11y}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => {
        triggerHaptic('selection');
        onPress(cell);
      }}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
});

function GridStatus({ text }: { text: string }) {
  return <Text style={styles.status}>{text}</Text>;
}

/** Grila completă: antet canonic + matrice de magazine (2 coloane pe mobil). */
export function ProductPriceGrid({
  product,
  city,
  precomputedSummary,
  showHeader = true,
  onSelectCell,
}: {
  product: GridProduct;
  city?: string;
  precomputedSummary?: PriceGridSummary | null;
  showHeader?: boolean;
  onSelectCell?: (cell: PriceCell) => void;
}) {
  const hasPrecomputed = Boolean(precomputedSummary && precomputedSummary.cells.length > 0);
  const { status, summary: fetchedSummary } = useProductPriceGrid(product, city, !hasPrecomputed);
  const summary = fetchedSummary ?? precomputedSummary ?? null;
  return (
    <View style={styles.gridWrap}>
      {showHeader ? (
        <View style={styles.header}>
          <ProductImageBox
            imageUrl={product.image_url}
            productName={product.canonical_name ?? ''}
            brand={product.brand ?? null}
            variant="thumb"
          />
          <View style={styles.headerBody}>
            <Text style={styles.headerName} numberOfLines={2}>
              {product.canonical_name}
            </Text>
            {product.package_size ? <Text style={styles.headerSize}>{product.package_size}</Text> : null}
            {summary && cheapestHeadline(summary) ? (
              <View style={[styles.badge, styles.badgeBest, styles.headline]}>
                <Text style={styles.badgeText}>
                  {`${cheapestHeadline(summary)} · în ${summary.storeCount} ${
                    summary.storeCount === 1 ? 'magazin' : 'magazine'
                  }`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
      {!summary && status === 'loading' ? <GridStatus text="Compar prețurile din magazine…" /> : null}
      {!summary && status === 'error' ? <GridStatus text="Nu am putut încărca prețurile. Încearcă din nou." /> : null}
      {status === 'ready' && summary && summary.cells.length === 0 ? (
        <GridStatus text="Nicio ofertă activă pentru acest produs acum." />
      ) : null}
      {summary && summary.cells.length > 0 ? (
        <>
          <View style={styles.tierSummaryRow}>
            {summary.isCommonAcrossStores ? (
              <View style={[styles.badge, styles.badgeExact]}>
                <Text style={styles.badgeText}>
                  {`Aliment comun în ${summary.storeCount} magazine`}
                </Text>
              </View>
            ) : null}
            {summary.cheapestPrivateLabel ? (
              <View style={[styles.badge, styles.badgeAlt]}>
                <Text style={styles.badgeText} numberOfLines={1}>
                  {`Brand propriu: ${summary.cheapestPrivateLabel.retailerName} ${formatPriceLei(
                    summary.cheapestPrivateLabel.price
                  )}`}
                </Text>
              </View>
            ) : null}
            {summary.premiumOption ? (
              <View style={[styles.badge, styles.badgePromo]}>
                <Text style={styles.badgeText} numberOfLines={1}>
                  {`Mai premium: ${summary.premiumOption.retailerName} ${formatPriceLei(
                    summary.premiumOption.price
                  )}`}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.matrix}>
            {summary.cells.map((cell) => (
              <View key={cell.key} style={styles.matrixItem}>
                <PriceCellView cell={cell} onPress={onSelectCell} />
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function strip(summary: PriceGridSummary) {
  return summary.cells.slice(0, 4);
}

/**
 * Mini-bandă vizuală pentru rândurile din listă și cardurile din căutare:
 * - Dacă primește `precomputedSummary` (în Listă, din `DualBasketComparisonResult`), afișează instantaneu (0 ms, 0 rețea)
 *   pill-urile cu logo-urile primelor 3–4 cele mai ieftine magazine și extinde pe loc grila completă.
 * - `lazy=true` (în Căutare cu multe rezultate): afișează rezumatul instant cu logo-uri,
 *   și încarcă + extinde grila completă la apăsare pe „Grilă prețuri (N mag.)”.
 */
export function MiniPriceStrip({
  product,
  city,
  precomputedSummary,
  lazy = false,
  onSelectCell,
}: {
  product: GridProduct;
  city?: string;
  precomputedSummary?: PriceGridSummary | null;
  lazy?: boolean;
  onSelectCell?: (cell: PriceCell) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();
  const hasPrecomputed = Boolean(precomputedSummary && precomputedSummary.cells.length > 0);
  const shouldFetch = !hasPrecomputed && (!lazy || expanded);
  const { status, summary: fetchedSummary } = useProductPriceGrid(product, city, shouldFetch);
  const summary = fetchedSummary ?? precomputedSummary ?? null;

  if (!hasPrecomputed && lazy && !expanded) {
    const rpcCount = Math.max(product.store_count ?? 0, product.retailer_slugs?.length ?? 0);
    const minPrice = product.min_price;
    const cheapStore = product.cheapest_retailer_name;
    const cheapSlug = product.cheapest_retailer_slug;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        accessibilityLabel={`Vezi grila de prețuri pentru ${product.canonical_name ?? 'produs'}`}
        onPress={() => {
          triggerHaptic('selection');
          setExpanded(true);
        }}
        style={({ pressed }) => [styles.lazyTriggerBtn, pressed && styles.pressed]}
      >
        {(cheapStore || cheapSlug) && (
          <RetailerLogo
            retailerName={cheapStore || cheapSlug || 'Magazin'}
            slug={cheapSlug}
            size={15}
            shape="circle"
          />
        )}
        <Text style={styles.stripItemBest} numberOfLines={1}>
          {minPrice != null
            ? `De la ${formatPriceLei(minPrice)}${cheapStore ? ` la ${cheapStore}` : ''}`
            : 'Compară prețurile'}
        </Text>
        <View style={styles.expandPill}>
          <Text style={styles.expandPillText}>
            {rpcCount > 0 ? `Grilă (${rpcCount} mag.) ▾` : 'Vezi grila ▾'}
          </Text>
        </View>
      </Pressable>
    );
  }

  if (!summary && (status === 'loading' || status === 'idle')) {
    return <Text style={styles.stripMuted}>Compar magazinele…</Text>;
  }
  if (!summary || summary.cells.length === 0) return null;

  const top = strip(summary);
  const total = summary.storeCount;

  return (
    <Animated.View
      layout={reduced ? undefined : LinearTransition.duration(ANIM_MS)}
      style={styles.strip}
    >
      <View style={styles.stripRow}>
        {top.map((cell) => (
          <View
            key={cell.key}
            style={[styles.storeMiniPill, cell.isCheapest && styles.storeMiniPillBest]}
          >
            <RetailerLogo retailerName={cell.retailerName} size={14} shape="circle" />
            <Text
              style={[styles.stripItem, cell.isCheapest && styles.stripItemBest]}
              numberOfLines={1}
            >
              {`${cell.retailerName} ${formatPriceLei(cell.price)}`}
            </Text>
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded ? 'Restrânge grila de prețuri' : `Vezi toate cele ${total} magazine`
          }
          onPress={() => {
            triggerHaptic('selection');
            setExpanded((v) => !v);
          }}
          style={({ pressed }) => [styles.expandPill, pressed && styles.pressed]}
        >
          <Text style={styles.expandPillText}>
            {expanded ? 'Restrânge ▴' : `Vezi toate (${total} mag.) ▾`}
          </Text>
        </Pressable>
      </View>

      {expanded ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(ANIM_MS)}
          style={styles.matrix}
        >
          {summary.cells.map((cell) => (
            <View key={cell.key} style={styles.matrixItem}>
              <PriceCellView cell={cell} onPress={onSelectCell} />
            </View>
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gridWrap: { gap: 12 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  headerBody: { flex: 1, gap: 3 },
  headerName: {
    fontSize: 16,
    lineHeight: 21,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  headerSize: {
    fontSize: 13,
    color: C.muted,
    fontFamily: BeavyFonts.semiBold,
    fontVariant: ['tabular-nums'],
  },
  headline: { alignSelf: 'flex-start', marginTop: 2 },
  tierSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  matrix: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  matrixItem: { flexBasis: '48%', flexGrow: 1 },
  cell: {
    gap: 3,
    padding: 10,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    minHeight: 44,
  },
  cellBest: { backgroundColor: C.leek, borderColor: C.leekDark },
  cellSelected: { borderColor: C.cherry, borderWidth: 2 },
  cellTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellStore: {
    flex: 1,
    fontSize: 12.5,
    color: C.cherry,
    fontFamily: BeavyFonts.bold,
    fontWeight: '700',
  },
  topBestTag: {
    backgroundColor: C.cherry,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  topBestTagText: {
    fontSize: 9.5,
    color: C.white,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
  deltaTag: {
    fontSize: 10.5,
    color: C.muted,
    fontFamily: BeavyFonts.bold,
    fontVariant: ['tabular-nums'],
  },
  cellPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 6,
  },
  cellPrice: {
    fontSize: 19,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  cellPkgSize: {
    fontSize: 11,
    color: C.muted,
    fontFamily: BeavyFonts.semiBold,
    fontVariant: ['tabular-nums'],
  },
  cellUnit: {
    fontSize: 11.5,
    color: C.muted,
    fontFamily: BeavyFonts.medium,
    fontVariant: ['tabular-nums'],
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  badge: {
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: '100%',
  },
  badgeText: { fontSize: 10.5, color: C.cherry, fontFamily: BeavyFonts.bold, fontWeight: '700' },
  badgeBest: { backgroundColor: C.white, borderWidth: 1, borderColor: C.leekDark },
  badgeExact: { backgroundColor: 'rgba(219, 227, 198, 0.65)' },
  badgeAlt: { backgroundColor: C.sand },
  badgePromo: { backgroundColor: C.grapefruit },
  pressed: { opacity: 0.8 },
  status: { fontSize: 13, color: C.muted, fontFamily: BeavyFonts.medium, paddingVertical: 6 },
  strip: { gap: 6, marginTop: 4 },
  stripRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  storeMiniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
  },
  storeMiniPillBest: {
    backgroundColor: C.leek,
    borderColor: C.leekDark,
  },
  stripItem: {
    fontSize: 11.5,
    color: C.cherry,
    fontFamily: BeavyFonts.semiBold,
    fontVariant: ['tabular-nums'],
  },
  stripItemBest: { color: C.cherry, fontFamily: BeavyFonts.extraBold, fontWeight: '800' },
  stripMuted: { fontSize: 12, color: C.muted, fontFamily: BeavyFonts.medium },
  lazyTriggerBtn: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  expandPill: {
    minHeight: 28,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.grapefruit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandPillText: {
    fontSize: 11,
    color: C.cherry,
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
  },
});
