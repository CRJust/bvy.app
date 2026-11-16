import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ProductImageBox } from '@/components/product-image-box';
import { BeavySegmentedControl } from '@/components/ui/beavy-segmented-control';
import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import { BeavySurface } from '@/components/ui/beavy-surface';
import { RetailerLogo } from '@/components/ui/retailer-logo';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import {
  openExternalStoreUrl,
  type TrackedOutboundClickPayload,
} from '@/lib/open-external-store';
import {
  type BasketItemInput,
  cleanDisplayPackageSize,
  cleanScraperProductName,
  deriveNormalizedUnitPrice,
  type ItemComparisonStatus,
  type RetailerComparisonSummary,
  resolveLoyaltyProgramName,
} from '@/services/beavy-comparison';

type RetailerBreakdownModalProps = {
  visible: boolean;
  summary: RetailerComparisonSummary | null;
  allSummaries?: RetailerComparisonSummary[];
  cheapestRetailerId?: string | null;
  onSelectRetailer?: (retailerId: string) => void;
  isBest: boolean;
  isPreferred: boolean;
  isBudgetVariant?: boolean;
  listName?: string;
  channelMode?: 'physical' | 'online' | 'all';
  itemStatusesById: Map<string, ItemComparisonStatus>;
  onClose: () => void;
  onStartStoreMode: (retailerName: string) => void;
  onInspectItem: (item: BasketItemInput) => void;
  onTrackOutboundClick?: (payload: TrackedOutboundClickPayload) => void;
};

type BreakdownTab = 'matched' | 'missing';

/**
 * Foaie editorială modernizată tip bon detaliat pentru un supermarket:
 * - Comutator rapid orizontal între toate supermarketurile comparate (Store Carousel).
 * - KPI Hero modern cu evidențierea transparentă a acoperirii reale (exacte vs alternative vs lipsă).
 * - Identificare clară și transparentă a produselor de marcă proprie / alternative.
 * - Uniformizarea taxei SGR și transparență completă a prețurilor unitare.
 * - Afișare informativă a disponibilității produselor lipsă în magazinele partenere.
 */
export function RetailerBreakdownModal({
  visible,
  summary,
  allSummaries,
  cheapestRetailerId,
  onSelectRetailer,
  isBest,
  isPreferred,
  isBudgetVariant = false,
  listName,
  channelMode,
  itemStatusesById,
  onClose,
  onStartStoreMode,
  onInspectItem,
  onTrackOutboundClick,
}: RetailerBreakdownModalProps) {
  const [prevSummary, setPrevSummary] = useState<RetailerComparisonSummary | null>(
    summary
  );
  if (summary && summary !== prevSummary) {
    setPrevSummary(summary);
  }
  const activeSummary = summary ?? prevSummary;

  const [tab, setTab] = useState<BreakdownTab>('matched');

  if (!activeSummary) return null;

  const { retailer, matchedItems, unavailableItems, missingPriceItems } =
    activeSummary;
  const missingTotalCount = unavailableItems.length + missingPriceItems.length;
  const effectiveTab: BreakdownTab =
    tab === 'missing' && missingTotalCount === 0 ? 'matched' : tab;

  const formattedUpdated = activeSummary.lastObservedAt
    ? new Date(activeSummary.lastObservedAt).toLocaleDateString('ro-RO', {
        day: '2-digit',
        month: 'short',
      })
    : null;

  const isOnlineOnly = !retailer.supports_physical && retailer.supports_delivery;
  const modeLabel = isOnlineOnly ? 'Checklist comandă' : 'Mod Magazin';
  const storeModeCtaLabel =
    activeSummary.coveredCount === activeSummary.totalItemsCount &&
    activeSummary.coveredCount > 0
      ? `Începe ${modeLabel} · Toate produsele`
      : activeSummary.coveredCount > 0
        ? `${modeLabel} (${activeSummary.coveredCount}/${activeSummary.totalItemsCount} produse)`
        : `Checklist simplu · ${modeLabel}`;

  const hasEquivalentItems = (activeSummary.equivalentCoveredCount ?? 0) > 0;
  const isFullExactCoverage =
    activeSummary.exactCoveredCount === activeSummary.totalItemsCount &&
    activeSummary.totalItemsCount > 0;

  const getAlternativeStoresForItem = (itemId: string): string | null => {
    if (!allSummaries || allSummaries.length <= 1) return null;
    const found: string[] = [];
    for (const s of allSummaries) {
      if (s.retailer.id === activeSummary.retailer.id) continue;
      const m = s.matchedItems.find((it) => it.item.id === itemId);
      if (m) {
        found.push(`${s.retailer.name} (${m.lineTotal.toFixed(2)} RON)`);
      }
    }
    if (found.length === 0) return null;
    return `Disponibil la ${found.slice(0, 2).join(' · ')}`;
  };

  const exactMatchedItems = matchedItems.filter(
    (m) => !m.isBudgetSwap && (m.matchType !== 'equivalent' || !m.equivalentProductName)
  );
  const altMatchedItems = matchedItems.filter(
    (m) => m.isBudgetSwap || (m.matchType === 'equivalent' && Boolean(m.equivalentProductName))
  );

  const renderMatchedItemRow = (
    match: (typeof matchedItems)[number],
    idx: number,
    isLast: boolean
  ) => {
    const isEquivalent =
      match.matchType === 'equivalent' && Boolean(match.equivalentProductName);
    const rawDisplayName = isEquivalent
      ? match.equivalentProductName!
      : (itemStatusesById.get(match.item.id)?.canonicalName ?? match.item.name);
    const displayName = cleanScraperProductName(rawDisplayName);

    // Calcul uniform SGR pentru băuturi ambalate (apă, bere, suc etc.)
    const rawOfferData = (match.offer as { raw_data?: { catalog_name?: string } }).raw_data;
    const rawNameLower = (
      rawOfferData?.catalog_name
        ? String(rawOfferData.catalog_name)
        : `${displayName} ${match.item.name}`
    ).toLowerCase();
    const isBeverage =
      /\b(apa|apă|bere|suc|cola|pepsi|fanta|nectar|bautura|băutură|vin|cidru)\b/.test(rawNameLower) &&
      !/\b(ceai|sirop|cafea|lapte)\b/.test(rawNameLower);
    const sgrTotal =
      match.offer.sgr_fee !== null && match.offer.sgr_fee > 0
        ? match.offer.sgr_fee * match.item.quantity
        : isBeverage
          ? 0.5 * match.item.quantity
          : 0;

    const hasRegularDisc =
      match.offer.regular_price !== null &&
      match.offer.regular_price > match.offer.price;
    const regularLineTotal =
      hasRegularDisc && match.offer.regular_price !== null
        ? match.offer.regular_price * match.item.quantity
        : null;
    const loyaltyProgram = resolveLoyaltyProgramName(
      retailer.name,
      match.offer.promo_label
    );
    const isProducePerKg =
      match.produceMeta?.sellMode === 'per_kg' &&
      match.produceMeta.pricePerKg !== null;

    // Calcul matematic precis și transparent pentru unitatea facturată efectiv
    const effectiveUnitPrice =
      match.item.quantity > 0
        ? Math.round((match.lineTotal / match.item.quantity) * 100) / 100
        : match.offer.price;

    const hasCatalogDiscount =
      match.offer.price > effectiveUnitPrice + 0.01;

    const producePackNote =
      isProducePerKg && match.produceMeta?.packType !== 'vrac'
        ? `vândut la ${match.produceMeta?.packLabel.toLowerCase()} (${match.produceMeta?.packPrice.toFixed(2)} RON la casă)`
        : isProducePerKg && match.produceMeta?.packType === 'vrac'
          ? 'vrac'
          : null;
    const cleanSize = cleanDisplayPackageSize(
      match.offer.package_size || match.item.packageSize,
      displayName
    );
    const normalizedUnitStr = deriveNormalizedUnitPrice(
      effectiveUnitPrice,
      cleanSize,
      match.offer.normalized_unit_price ?? match.offer.unit_price,
      match.offer.normalized_unit_label,
      displayName
    );

    const unitMeta = isProducePerKg
      ? [
          `${match.item.quantity} kg × ${match.produceMeta!.pricePerKg!.toFixed(2)} RON/kg = ${match.lineTotal.toFixed(2)} RON`,
          producePackNote,
          sgrTotal > 0 ? `+SGR ${sgrTotal.toFixed(2)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : [
          `${match.item.quantity} × ${effectiveUnitPrice.toFixed(2)} RON = ${match.lineTotal.toFixed(2)} RON`,
          cleanSize && cleanSize !== '1 buc' && cleanSize !== 'buc' ? cleanSize : null,
          normalizedUnitStr,
          sgrTotal > 0 ? `+SGR ${sgrTotal.toFixed(2)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
    const displayImage = isEquivalent
      ? (match.equivalentImageUrl ??
        match.offer.image_url ??
        itemStatusesById.get(match.item.id)?.canonicalImageUrl ??
        match.item.imageUrl)
      : (itemStatusesById.get(match.item.id)?.canonicalImageUrl ??
        match.item.imageUrl ??
        match.offer.image_url);
    const displayBrand = isEquivalent
      ? (match.equivalentBrand ?? match.offer.retailer_name)
      : (itemStatusesById.get(match.item.id)?.canonicalBrand ?? match.item.brand);

    return (
      <Pressable
        key={match.item.id}
        onPress={() => {
          triggerHaptic('selection');
          onInspectItem(match.item);
        }}
        style={({ pressed }) => [
          styles.itemRow,
          !isLast && styles.itemRowBorder,
          pressed && styles.rowPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Vezi detalii preț pentru ${match.item.name}`}
      >
        <ProductImageBox
          imageUrl={displayImage}
          productName={displayName}
          brand={displayBrand}
          categoryName={
            itemStatusesById.get(match.item.id)?.canonicalCategoryName
          }
          variant="thumb"
        />

        <View style={styles.itemInfoCol}>
          <Text numberOfLines={2} style={styles.itemName}>
            {displayName}
          </Text>

          {/* Badge-uri clare dacă este o alternativă de marcă proprie */}
          {match.isBudgetSwap || isEquivalent ? (
            <View style={styles.plTagRow}>
              <View style={[styles.plPill, styles.equivPill]}>
                <Text style={[styles.plPillText, styles.equivPillText]}>
                  {match.isBudgetSwap ? 'Marcă proprie economică' : 'Alternativă'}
                </Text>
              </View>
              <Text numberOfLines={2} style={styles.plOriginText}>
                {`în loc de ${match.item.name}${
                  (match.budgetSavingsLine ?? 0) > 0
                    ? ` (economisești ${(match.budgetSavingsLine ?? 0).toFixed(2)} RON)`
                    : ''
                }`}
              </Text>
            </View>
          ) : null}

          <Text numberOfLines={1} style={styles.itemMeta}>
            {!match.hasLoyaltyOffer && match.offer.promo_label
              ? `${unitMeta} · ${match.offer.promo_label}`
              : unitMeta}
          </Text>

          {match.hasLoyaltyOffer && (
            <View style={styles.itemLoyaltyPill}>
              <Text numberOfLines={1} style={styles.itemLoyaltyText}>
                {match.loyaltyLineTotal !== null
                  ? activeSummary.appliedLoyaltyCards
                    ? `${loyaltyProgram}: -${match.loyaltySavings.toFixed(2)} RON inclus`
                    : `${loyaltyProgram}: ${match.loyaltyLineTotal.toFixed(2)} RON (-${match.loyaltySavings.toFixed(2)})`
                  : match.offer.promo_label
                    ? `${loyaltyProgram}: ${match.offer.promo_label}`
                    : loyaltyProgram}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.priceCol}>
          {Boolean(activeSummary.appliedLoyaltyCards) &&
          match.loyaltyLineTotal !== null &&
          match.standardLineTotal !== undefined &&
          match.standardLineTotal > match.lineTotal ? (
            <Text style={styles.regularStrikeText}>
              {`${match.standardLineTotal.toFixed(2)} RON`}
            </Text>
          ) : hasCatalogDiscount ? (
            <Text style={styles.regularStrikeText}>
              {`${(match.offer.price * match.item.quantity).toFixed(2)} RON`}
            </Text>
          ) : regularLineTotal !== null ? (
            <Text style={styles.regularStrikeText}>
              {`${regularLineTotal.toFixed(2)} RON`}
            </Text>
          ) : null}
          <Text style={styles.priceValue}>
            {`${match.lineTotal.toFixed(2)} RON`}
          </Text>
        </View>

        <SymbolView
          name="chevron.right"
          tintColor={C.muted}
          size={11}
          fallback={<Text style={styles.chevronFallback}>›</Text>}
        />
      </Pressable>
    );
  };

  return (
    <BeavySheetModal
      visible={visible}
      onClose={() => {
        setTab('matched');
        onClose();
      }}
      maxHeightRatio="92%"
    >
      <View style={styles.sheetInner}>
        {/* Carousel orizontal rapid pentru comutare instant între magazine */}
        {allSummaries && allSummaries.length > 1 && (
          <View style={styles.carouselContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storeCarouselContent}
            >
              {allSummaries.map((s) => {
                const isSelected = s.retailer.id === activeSummary.retailer.id;
                const isCurrentBest = Boolean(
                  cheapestRetailerId && s.retailer.id === cheapestRetailerId
                );
                return (
                  <Pressable
                    key={s.retailer.id}
                    onPress={() => {
                      if (!isSelected && onSelectRetailer) {
                        triggerHaptic('selection');
                        onSelectRetailer(s.retailer.id);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.storeChip,
                      isSelected && styles.storeChipSelected,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Selectează magazinul ${s.retailer.name}`}
                  >
                    <RetailerLogo
                      retailerName={s.retailer.name}
                      slug={s.retailer.slug}
                      logoUrl={s.retailer.logo_url}
                      size={18}
                      shape="circle"
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.storeChipName,
                        isSelected && styles.storeChipNameSelected,
                      ]}
                    >
                      {s.retailer.name}
                    </Text>
                    <Text
                      style={[
                        styles.storeChipPrice,
                        isSelected && styles.storeChipPriceSelected,
                      ]}
                    >
                      {s.coveredCount > 0
                        ? `${s.estimatedTotalWithFees.toFixed(0)} lei`
                        : '—'}
                    </Text>
                    {isCurrentBest && (
                      <View style={styles.storeChipOptimDot} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Antet magazin */}
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <RetailerLogo
              retailerName={retailer.name}
              slug={retailer.slug}
              logoUrl={retailer.logo_url}
              size={46}
              shape="rounded"
            />

            <View style={styles.headerTitleCol}>
              <View style={styles.titleRow}>
                <Text numberOfLines={1} style={styles.storeName}>
                  {retailer.name}
                </Text>
                {isBest && (
                  <View style={[styles.bestPill, hasEquivalentItems && styles.bestPillBudget]}>
                    <Text style={[styles.bestPillText, hasEquivalentItems && styles.bestPillBudgetText]}>
                      {hasEquivalentItems ? 'Optim · Cu alternative' : 'Optim · Coș exact'}
                    </Text>
                  </View>
                )}
                {!isBest && isPreferred && (
                  <View style={styles.preferredPill}>
                    <Text style={styles.preferredPillText}>Preferat</Text>
                  </View>
                )}
                {isBudgetVariant && !isBest && (
                  <View style={styles.budgetModePill}>
                    <Text style={styles.budgetModePillText}>Low Budget</Text>
                  </View>
                )}
              </View>
              <Text style={styles.storeMetaLine}>
                {activeSummary.channelLabel}
                {formattedUpdated ? ` · actualizat ${formattedUpdated}` : ''}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              onClose();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Închide defalcarea pentru ${retailer.name}`}
          >
            <SymbolView
              name="xmark"
              tintColor={C.primary}
              size={14}
              fallback={<Text style={styles.closeFallback}>✕</Text>}
            />
          </Pressable>
        </View>

        {/* Hero KPI modernizat conform Beavy Design System */}
        <BeavySurface variant="elevated" style={styles.modernKpiCard}>
          <View style={styles.kpiTopRow}>
            {/* Total / Subtotal */}
            <View style={styles.kpiMainCol}>
              <Text style={styles.kpiSubLabel}>SUBTOTAL COȘ</Text>
              <Text style={styles.kpiPriceValue}>
                {activeSummary.coveredCount > 0
                  ? `${activeSummary.confirmedSubtotal.toFixed(2)} RON`
                  : 'Indisponibil'}
              </Text>
              {activeSummary.potentialLoyaltySavings > 0 && (
                <View style={styles.kpiSavingsBadge}>
                  <Text style={styles.kpiSavingsText}>
                    {`-${activeSummary.potentialLoyaltySavings.toFixed(2)} RON fidelitate inclusă`}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.kpiDivider} />

            {/* Acoperire reală & cinstită */}
            <View style={styles.kpiCoverageCol}>
              <Text style={styles.kpiSubLabel}>ACOPERIRE LISTĂ</Text>
              {isFullExactCoverage ? (
                <View style={styles.coverageBadgeExact}>
                  <Text style={styles.coverageBadgeExactText}>
                    {`✓ ${activeSummary.totalItemsCount}/${activeSummary.totalItemsCount} exacte (100%)`}
                  </Text>
                </View>
              ) : hasEquivalentItems ? (
                <View style={styles.coverageBadgeHybrid}>
                  <Text style={styles.coverageBadgeHybridText}>
                    {`${activeSummary.exactCoveredCount} exacte · ${activeSummary.equivalentCoveredCount} alternative`}
                  </Text>
                </View>
              ) : (
                <View style={styles.coverageBadgeMissing}>
                  <Text style={styles.coverageBadgeMissingText}>
                    {`${activeSummary.coveredCount}/${activeSummary.totalItemsCount} găsite · ${missingTotalCount} lipsă`}
                  </Text>
                </View>
              )}
              <Text style={styles.coverageSubHint}>
                {isFullExactCoverage
                  ? 'Toate brandurile cerute disponibile'
                  : hasEquivalentItems
                    ? 'Include mărci proprii înlocuitoare'
                    : `${missingTotalCount} produse lipsesc din stoc`}
              </Text>
            </View>
          </View>

          {isBest && (
            <View style={styles.bestDealRow}>
              <SymbolView
                name="sparkles"
                tintColor={C.leekDark}
                size={13}
                fallback={<Text style={styles.bestDealGlyph}>★</Text>}
              />
              <Text style={styles.bestDealText}>
                Cel mai avantajos coș complet dintre toate supermarketurile verificate
              </Text>
            </View>
          )}
        </BeavySurface>

        {/* Notificare transparentă dacă magazinul include mărci proprii / alternative */}
        {hasEquivalentItems && (
          <View style={styles.alternativeDisclaimer}>
            <SymbolView
              name="info.circle.fill"
              tintColor={C.primary}
              size={13}
              fallback={<Text style={styles.infoGlyph}>ℹ</Text>}
            />
            <Text style={styles.alternativeDisclaimerText}>
              {`Unele branduri cerute nu sunt disponibile la ${retailer.name} și au fost înlocuite cu mărci proprii mai economice. Atinge orice produs pentru a vedea detaliile.`}
            </Text>
          </View>
        )}

        {/* Banner reduceri fidelitate card */}
        {activeSummary.loyaltyOfferCount > 0 &&
          activeSummary.loyaltyProgramName && (
            <View style={styles.loyaltyBanner}>
              <SymbolView
                name="creditcard.fill"
                tintColor={C.primary}
                size={13}
                fallback={<Text style={styles.loyaltyGlyph}>◈</Text>}
              />
              <Text style={styles.loyaltyBannerText}>
                {activeSummary.potentialLoyaltySavings > 0
                  ? activeSummary.appliedLoyaltyCards
                    ? `Reduceri aplicate prin ${activeSummary.loyaltyProgramName}: -${activeSummary.potentialLoyaltySavings.toFixed(2)} RON la ${activeSummary.loyaltyOfferCount} ${
                        activeSummary.loyaltyOfferCount === 1 ? 'produs' : 'produse'
                      }`
                    : `Cu ${activeSummary.loyaltyProgramName}: ${activeSummary.estimatedTotalWithLoyalty.toFixed(2)} RON (-${activeSummary.potentialLoyaltySavings.toFixed(2)} RON la ${activeSummary.loyaltyOfferCount} ${
                        activeSummary.loyaltyOfferCount === 1 ? 'produs' : 'produse'
                      })`
                  : `${activeSummary.loyaltyProgramName}: ${activeSummary.loyaltyOfferCount} ${
                      activeSummary.loyaltyOfferCount === 1 ? 'ofertă cu card' : 'oferte cu card'
                    } (condiționată de cantitate)`}
              </Text>
            </View>
          )}

        {/* Tab-uri Găsite vs Lipsă */}
        {missingTotalCount > 0 && (
          <BeavySegmentedControl
            options={[
              { id: 'matched', label: `Găsite (${matchedItems.length})` },
              { id: 'missing', label: `Lipsă la ${retailer.name} (${missingTotalCount})` },
            ]}
            value={effectiveTab}
            onChange={setTab}
          />
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {effectiveTab === 'matched' ? (
            <>
              {matchedItems.length === 0 ? (
                <BeavySurface variant="elevated" style={styles.emptyNoticeCard}>
                  <Text style={styles.emptyNoticeText}>
                    {`Momentan nu există oferte active încărcate la ${retailer.name} pentru produsele din coș.`}
                  </Text>
                </BeavySurface>
              ) : altMatchedItems.length > 0 ? (
                <View style={styles.matchedSectionsContainer}>
                  {exactMatchedItems.length > 0 && (
                    <View style={styles.sectionBlock}>
                      <View style={styles.sectionHeaderRow}>
                        <SymbolView
                          name="checkmark.circle.fill"
                          tintColor={C.leekDark}
                          size={13}
                          fallback={<Text style={styles.checkGlyph}>✓</Text>}
                        />
                        <Text style={styles.sectionHeaderTitle}>
                          {`PRODUSE EXACTE CERUTE (${exactMatchedItems.length})`}
                        </Text>
                      </View>
                      <BeavySurface variant="elevated" style={styles.listSheet}>
                        {exactMatchedItems.map((m, i) =>
                          renderMatchedItemRow(m, i, i === exactMatchedItems.length - 1)
                        )}
                      </BeavySurface>
                    </View>
                  )}

                  <View style={styles.sectionBlock}>
                    <View style={[styles.sectionHeaderRow, styles.alternativeSectionHeader]}>
                      <SymbolView
                        name="arrow.triangle.2.circlepath"
                        tintColor={C.cherry}
                        size={13}
                        fallback={<Text style={styles.swapGlyph}>⇄</Text>}
                      />
                      <Text style={[styles.sectionHeaderTitle, styles.alternativeSectionTitle]}>
                        {`ALTERNATIVE DE BUGET (${altMatchedItems.length})`}
                      </Text>
                    </View>
                    <BeavySurface variant="elevated" style={styles.listSheet}>
                      {altMatchedItems.map((m, i) =>
                        renderMatchedItemRow(m, i, i === altMatchedItems.length - 1)
                      )}
                    </BeavySurface>
                  </View>
                </View>
              ) : (
                <BeavySurface variant="elevated" style={styles.listSheet}>
                  {exactMatchedItems.map((m, i) =>
                    renderMatchedItemRow(m, i, i === exactMatchedItems.length - 1)
                  )}
                </BeavySurface>
              )}

              {(activeSummary.estimatedFeesTotal > 0 ||
                activeSummary.freeDeliveryThreshold !== null ||
                activeSummary.belowMinimumOrder) && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionTitle}>Livrare și cost total</Text>
                  <BeavySurface variant="elevated" style={styles.listSheet}>
                    {activeSummary.deliveryFee > 0 && (
                      <View style={[styles.feeRow, styles.itemRowBorder]}>
                        <Text style={styles.feeLabel}>Taxă livrare</Text>
                        <Text style={styles.feeVal}>
                          {`${activeSummary.deliveryFee.toFixed(2)} RON`}
                        </Text>
                      </View>
                    )}
                    {activeSummary.smallOrderFee > 0 && (
                      <View style={[styles.feeRow, styles.itemRowBorder]}>
                        <Text style={styles.feeLabel}>Taxă comandă mică</Text>
                        <Text style={styles.feeVal}>
                          {`${activeSummary.smallOrderFee.toFixed(2)} RON`}
                        </Text>
                      </View>
                    )}
                    {activeSummary.serviceFee + activeSummary.packagingFee > 0 && (
                      <View style={[styles.feeRow, styles.itemRowBorder]}>
                        <Text style={styles.feeLabel}>Serviciu și ambalare</Text>
                        <Text style={styles.feeVal}>
                          {`${(activeSummary.serviceFee + activeSummary.packagingFee).toFixed(2)} RON`}
                        </Text>
                      </View>
                    )}
                    <View style={styles.feeRow}>
                      <Text style={styles.feeTotalLabel}>Total estimat</Text>
                      <Text style={styles.feeTotalVal}>
                        {`${activeSummary.estimatedTotalWithFees.toFixed(2)} RON`}
                      </Text>
                    </View>
                  </BeavySurface>
                  {(activeSummary.freeDeliveryThreshold !== null ||
                    activeSummary.belowMinimumOrder) && (
                    <Text style={styles.feeNote}>
                      {[
                        activeSummary.belowMinimumOrder &&
                        activeSummary.minimumOrderValue !== null
                          ? `Sub comanda minimă (${activeSummary.minimumOrderValue.toFixed(0)} RON)`
                          : null,
                        activeSummary.freeDeliveryThreshold !== null
                          ? `Livrare gratuită de la ${activeSummary.freeDeliveryThreshold.toFixed(0)} RON`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  )}
                </View>
              )}
            </>
          ) : (
            <>
              {/* Tab Lipsă - Afișare informativă a disponibilității în alte supermarketuri */}
              {unavailableItems.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionTitle}>
                    {`Stoc epuizat la ${retailer.name} (${unavailableItems.length})`}
                  </Text>
                  <BeavySurface variant="elevated" style={styles.listSheet}>
                    {unavailableItems.map((entry, idx) => {
                      const isLast = idx === unavailableItems.length - 1;
                      const statusEntry = itemStatusesById.get(entry.item.id);
                      const hasOtherPrice = statusEntry?.lowestPrice != null;
                      const otherStoresHint = getAlternativeStoresForItem(entry.item.id);
                      const displayTitle = cleanScraperProductName(
                        statusEntry?.canonicalName ?? entry.item.name
                      );
                      return (
                        <Pressable
                          key={`oos-${entry.item.id}`}
                          onPress={() => {
                            triggerHaptic('selection');
                            onInspectItem(entry.item);
                          }}
                          style={({ pressed }) => [
                            styles.itemRow,
                            !isLast && styles.itemRowBorder,
                            pressed && styles.rowPressed,
                          ]}
                        >
                          <ProductImageBox
                            imageUrl={
                              statusEntry?.canonicalImageUrl ?? entry.item.imageUrl
                            }
                            productName={displayTitle}
                            brand={statusEntry?.canonicalBrand ?? entry.item.brand}
                            categoryName={statusEntry?.canonicalCategoryName}
                            variant="thumb"
                          />
                          <View style={styles.itemInfoCol}>
                            <Text numberOfLines={2} style={styles.itemName}>
                              {displayTitle}
                            </Text>
                            <Text numberOfLines={1} style={styles.missingHint}>
                              {otherStoresHint ??
                                (hasOtherPrice
                                  ? `Disponibil în alt magazin de la ${statusEntry!.lowestPrice!.toFixed(2)} RON`
                                  : `Momentan stoc epuizat la ${retailer.name}`)}
                            </Text>
                          </View>
                          <View style={styles.missingPill}>
                            <Text style={styles.missingPillText}>Vezi opțiuni</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </BeavySurface>
                </View>
              )}

              {missingPriceItems.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionTitle}>
                    {`Necomercializat la ${retailer.name} (${missingPriceItems.length})`}
                  </Text>
                  <BeavySurface variant="elevated" style={styles.listSheet}>
                    {missingPriceItems.map((item, idx) => {
                      const isLast = idx === missingPriceItems.length - 1;
                      const statusEntry = itemStatusesById.get(item.id);
                      const isManual = item.isCustom || !item.productId;
                      const otherStoresHint = getAlternativeStoresForItem(item.id);
                      const displayTitle = cleanScraperProductName(
                        statusEntry?.canonicalName ?? item.name
                      );
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            triggerHaptic('selection');
                            onInspectItem(item);
                          }}
                          style={({ pressed }) => [
                            styles.itemRow,
                            !isLast && styles.itemRowBorder,
                            pressed && styles.rowPressed,
                          ]}
                        >
                          <ProductImageBox
                            imageUrl={statusEntry?.canonicalImageUrl ?? item.imageUrl}
                            productName={displayTitle}
                            brand={statusEntry?.canonicalBrand ?? item.brand}
                            categoryName={statusEntry?.canonicalCategoryName}
                            variant="thumb"
                          />
                          <View style={styles.itemInfoCol}>
                            <Text numberOfLines={2} style={styles.itemName}>
                              {displayTitle}
                            </Text>
                            <Text numberOfLines={1} style={styles.missingHint}>
                              {isManual
                                ? 'Produs manual · Asociază cu catalogul'
                                : otherStoresHint ??
                                  (statusEntry?.lowestPrice != null
                                    ? `Disponibil în alte magazine de la ${statusEntry.lowestPrice.toFixed(2)} RON`
                                    : `Brandul nu se găsește la ${retailer.name}`)}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.missingPill,
                              isManual && styles.missingPillAccent,
                            ]}
                          >
                            <Text style={styles.missingPillText}>
                              {isManual ? 'Asociază' : 'Compară'}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </BeavySurface>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Butoane de acțiune jos */}
        <View style={styles.footerBtnsRow}>
          <Pressable
            onPress={() => {
              triggerHaptic('medium');
              onStartStoreMode(retailer.name);
            }}
            style={({ pressed }) => [
              styles.primaryFooterBtn,
              retailer.website_url ? styles.primaryFooterBtnFlex : null,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <SymbolView
              name="basket.fill"
              tintColor={C.surface}
              size={15}
              fallback={<Text style={styles.footerFallback}>✓</Text>}
            />
            <Text numberOfLines={1} style={styles.primaryFooterBtnText}>
              {storeModeCtaLabel}
            </Text>
          </Pressable>

          {!!retailer.website_url && (
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                void openExternalStoreUrl(
                  retailer.website_url,
                  {
                    retailerName: retailer.name,
                    retailerSlug: retailer.slug,
                    source: 'store_breakdown',
                    channelMode: channelMode ?? (isOnlineOnly ? 'online' : 'physical'),
                    listName,
                    itemsCount: activeSummary.coveredCount,
                    estimatedValueRon:
                      activeSummary.coveredCount > 0
                        ? activeSummary.estimatedTotalWithFees
                        : null,
                  },
                  onTrackOutboundClick
                );
              }}
              style={({ pressed }) => [
                styles.externalFooterBtn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="link"
            >
              <Text style={styles.externalFooterBtnText}>Site ↗</Text>
            </Pressable>
          )}
        </View>
      </View>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  sheetInner: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  carouselContainer: {
    marginHorizontal: -16,
    paddingBottom: 2,
  },
  storeCarouselContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  storeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
  },
  storeChipSelected: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  storeChipName: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  storeChipNameSelected: {
    color: C.surface,
  },
  storeChipPrice: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11.5,
    color: C.muted,
    fontVariant: ['tabular-nums'],
  },
  storeChipPriceSelected: {
    color: C.leek,
  },
  storeChipOptimDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.leek,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  storeName: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 19,
    color: C.primary,
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  bestPill: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  bestPillBudget: {
    backgroundColor: C.grapefruit,
  },
  bestPillText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10.5,
    color: C.leekDark,
  },
  bestPillBudgetText: {
    color: C.cherry,
  },
  preferredPill: {
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  preferredPillText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.primary,
  },
  budgetModePill: {
    backgroundColor: C.grapefruit,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  budgetModePillText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.cherry,
  },
  storeMetaLine: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.muted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.rule,
  },
  closeFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.primary,
  },
  modernKpiCard: {
    padding: 14,
    gap: 10,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  kpiMainCol: {
    flex: 1,
    gap: 2,
  },
  kpiDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: C.rule,
  },
  kpiCoverageCol: {
    flex: 1,
    gap: 4,
    alignItems: 'flex-start',
  },
  kpiSubLabel: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  kpiPriceValue: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 22,
    color: C.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  kpiSavingsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.grapefruit,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginTop: 2,
  },
  kpiSavingsText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.cherry,
  },
  coverageBadgeExact: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  coverageBadgeExactText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.leekDark,
  },
  coverageBadgeHybrid: {
    backgroundColor: C.grapefruit,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  coverageBadgeHybridText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.cherry,
  },
  coverageBadgeMissing: {
    backgroundColor: 'rgba(118, 91, 96, 0.12)',
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  coverageBadgeMissingText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.muted,
  },
  coverageSubHint: {
    fontFamily: BeavyFonts.regular,
    fontSize: 10.5,
    color: C.muted,
    marginTop: 1,
  },
  bestDealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 2,
  },
  bestDealGlyph: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.leekDark,
  },
  bestDealText: {
    flex: 1,
    fontFamily: BeavyFonts.bold,
    fontSize: 11.5,
    color: C.leekDark,
  },
  alternativeDisclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.grapefruit,
  },
  infoGlyph: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.cherry,
    marginTop: 1,
  },
  alternativeDisclaimerText: {
    flex: 1,
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.cherry,
    lineHeight: 16,
  },
  loyaltyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(247, 141, 121, 0.2)',
    borderRadius: BeavyRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  loyaltyGlyph: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.primary,
  },
  loyaltyBannerText: {
    flex: 1,
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
    lineHeight: 16,
  },
  plTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  plPill: {
    backgroundColor: C.leek,
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    flexShrink: 0,
  },
  plPillText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 10,
    color: C.leekDark,
  },
  equivPill: {
    backgroundColor: C.grapefruit,
  },
  equivPillText: {
    color: C.cherry,
  },
  plOriginText: {
    flex: 1,
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
  },
  scroll: {
    maxHeight: 460,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 6,
  },
  emptyNoticeCard: {
    padding: 18,
    alignItems: 'center',
  },
  emptyNoticeText: {
    fontFamily: BeavyFonts.regular,
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
  },
  listSheet: {
    paddingVertical: 2,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  itemInfoCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itemName: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13.5,
    color: C.primary,
    lineHeight: 18,
  },
  itemMeta: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11.5,
    color: C.muted,
  },
  itemLoyaltyPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(247, 141, 121, 0.2)',
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  itemLoyaltyText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.primary,
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 1,
  },
  priceValue: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 15,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  regularStrikeText: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11,
    color: C.muted,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  chevronFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.muted,
  },
  sectionBlock: {
    gap: 6,
  },
  sectionTitle: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12.5,
    color: C.primary,
    marginLeft: 2,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  feeLabel: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    color: C.muted,
  },
  feeVal: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  feeTotalLabel: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 13.5,
    color: C.primary,
  },
  feeTotalVal: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 14,
    color: C.primary,
    fontVariant: ['tabular-nums'],
  },
  feeNote: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
    marginLeft: 2,
  },
  missingHint: {
    fontFamily: BeavyFonts.medium,
    fontSize: 11.5,
    color: C.muted,
  },
  missingPill: {
    backgroundColor: 'rgba(118, 91, 96, 0.12)',
    borderRadius: BeavyRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  missingPillAccent: {
    backgroundColor: C.grapefruit,
  },
  missingPillText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 10.5,
    color: C.primary,
  },
  footerBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  primaryFooterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: BeavyRadius.pill,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  primaryFooterBtnFlex: {
    flex: 1,
  },
  primaryFooterBtnText: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 14,
    color: C.surface,
  },
  footerFallback: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.surface,
  },
  externalFooterBtn: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: BeavyRadius.pill,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  externalFooterBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 13,
    color: C.primary,
  },
  matchedSectionsContainer: {
    gap: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  sectionHeaderTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontWeight: '800',
    fontSize: 11,
    color: C.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  alternativeSectionHeader: {
    marginTop: 4,
  },
  alternativeSectionTitle: {
    color: C.cherry,
  },
  checkGlyph: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.leekDark,
  },
  swapGlyph: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.cherry,
  },
  pressed: {
    opacity: 0.75,
  },
  rowPressed: {
    backgroundColor: 'rgba(66, 23, 38, 0.04)',
  },
});
