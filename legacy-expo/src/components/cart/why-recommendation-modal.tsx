import { SymbolView } from 'expo-symbols';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BeavySheetModal } from '@/components/ui/beavy-sheet-modal';
import {
  BeavyColors as C,
  BeavyFonts,
  BeavyRadius,
  triggerHaptic,
} from '@/constants/theme';
import { formatLei } from '@/services/live-basket';

export type WhyRecommendationData = {
  storeName: string;
  totalWithDelivery: number;
  savingsVsAverage: number;
  isSplit: boolean;
  scoreBreakdown?: {
    pricePts: number;
    matchPts: number;
    conveniencePts: number;
    totalPts: number;
  };
  matchSummary?: {
    exactCount: number;
    twinCount: number;
    functionalCount: number;
    privateLabelCount: number;
    totalCount: number;
  };
  reasons: string[];
};

type WhyRecommendationModalProps = {
  visible: boolean;
  onClose: () => void;
  data: WhyRecommendationData | null;
};

export function WhyRecommendationModal({
  visible,
  onClose,
  data,
}: WhyRecommendationModalProps) {
  if (!data) return null;

  return (
    <BeavySheetModal visible={visible} onClose={onClose} maxHeightRatio="85%">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <SymbolView
              name="questionmark.circle.fill"
              size={20}
              tintColor={C.cherry}
              fallback={<Text style={styles.fallbackIcon}>?</Text>}
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.subtitleKicker}>TRANSPARENȚĂ ALGORITM</Text>
            <Text style={styles.title}>De ce recomandăm {data.storeName}?</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Formula Matematică Google Studio */}
          <View style={styles.formulaCard}>
            <Text style={styles.formulaTitle}>FORMULA MATEMATICĂ A SCORULUI BEAVY</Text>
            <View style={styles.formulaBox}>
              <Text style={styles.formulaText}>
                J = C_prod + λ·(K − 1) + C_travel + C_delivery
              </Text>
            </View>
            <Text style={styles.formulaDesc}>
              Minimizăm costul total al produselor (C_prod) ponderat cu penalizarea pentru drumuri multiple (λ) și taxele de livrare sau transport.
            </Text>
          </View>

          {/* Descompunerea Scorului pe 3 Axe */}
          {data.scoreBreakdown && (
            <View style={styles.scoreCard}>
              <Text style={styles.sectionTitle}>DESCOMPUNERE SCOR ECHILIBRAT</Text>
              <View style={styles.scoreRow}>
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>PREȚ</Text>
                  <Text style={styles.scoreValue}>
                    {`${data.scoreBreakdown.pricePts}/40`}
                  </Text>
                  <Text style={styles.scoreSub}>Economie piață</Text>
                </View>
                <View style={styles.scoreDivider} />
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>POTRIVIRE</Text>
                  <Text style={styles.scoreValue}>
                    {`${data.scoreBreakdown.matchPts}/40`}
                  </Text>
                  <Text style={styles.scoreSub}>Branduri exacte</Text>
                </View>
                <View style={styles.scoreDivider} />
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>COMODITATE</Text>
                  <Text style={styles.scoreValue}>
                    {`${data.scoreBreakdown.conveniencePts}/20`}
                  </Text>
                  <Text style={styles.scoreSub}>Număr drumuri</Text>
                </View>
              </View>
            </View>
          )}

          {/* Calitatea Potrivirii */}
          {data.matchSummary && (
            <View style={styles.matchCard}>
              <Text style={styles.sectionTitle}>CALITATEA PRODUSELOR GĂSITE</Text>
              <View style={styles.matchPillsRow}>
                <View style={styles.matchPillExact}>
                  <Text style={styles.matchPillExactText}>
                    {`${data.matchSummary.exactCount} Exact`}
                  </Text>
                </View>
                {data.matchSummary.twinCount > 0 && (
                  <View style={styles.matchPillNeutral}>
                    <Text style={styles.matchPillNeutralText}>
                      {`${data.matchSummary.twinCount} Twin`}
                    </Text>
                  </View>
                )}
                {data.matchSummary.functionalCount > 0 && (
                  <View style={styles.matchPillNeutral}>
                    <Text style={styles.matchPillNeutralText}>
                      {`${data.matchSummary.functionalCount} Echivalent`}
                    </Text>
                  </View>
                )}
                {data.matchSummary.privateLabelCount > 0 && (
                  <View style={styles.matchPillBudget}>
                    <Text style={styles.matchPillBudgetText}>
                      {`${data.matchSummary.privateLabelCount} Marcă proprie`}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Motive Concrete */}
          <View style={styles.reasonsCard}>
            <Text style={styles.sectionTitle}>MOTIVE PRINCIPALE</Text>
            <View style={styles.reasonsList}>
              {data.reasons.map((reason, idx) => (
                <View key={idx} style={styles.reasonRow}>
                  <SymbolView
                    name="checkmark.circle.fill"
                    size={16}
                    tintColor={C.primary}
                    fallback={<Text style={styles.checkGlyph}>✓</Text>}
                  />
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
              {data.savingsVsAverage > 0 && (
                <View style={styles.reasonRow}>
                  <SymbolView
                    name="checkmark.circle.fill"
                    size={16}
                    tintColor={C.primary}
                    fallback={<Text style={styles.checkGlyph}>✓</Text>}
                  />
                  <Text style={styles.reasonText}>
                    {`Economisești ${formatLei(data.savingsVsAverage)} față de media pieței din celelalte supermarketuri.`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              triggerHaptic('selection');
              onClose();
            }}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          >
            <Text style={styles.closeBtnText}>Am înțeles</Text>
          </Pressable>
        </View>
      </View>
    </BeavySheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.rule,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.leek,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    fontSize: 20,
    color: C.cherry,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  subtitleKicker: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 17,
    color: C.cherry,
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  formulaCard: {
    padding: 16,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    gap: 8,
  },
  formulaTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.5,
  },
  formulaBox: {
    padding: 12,
    borderRadius: BeavyRadius.md,
    backgroundColor: C.buttermilk,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: 'center',
  },
  formulaText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 13,
    color: C.cherry,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  formulaDesc: {
    fontFamily: BeavyFonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: C.muted,
  },
  scoreCard: {
    padding: 16,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    gap: 10,
  },
  sectionTitle: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 10,
    color: C.muted,
    letterSpacing: 0.5,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  scoreDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: C.rule,
  },
  scoreLabel: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 9.5,
    color: C.muted,
    letterSpacing: 0.5,
  },
  scoreValue: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 16,
    color: C.cherry,
    fontVariant: ['tabular-nums'],
  },
  scoreSub: {
    fontFamily: BeavyFonts.medium,
    fontSize: 10,
    color: C.muted,
  },
  matchCard: {
    padding: 16,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    gap: 10,
  },
  matchPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  matchPillExact: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.leek,
  },
  matchPillExactText: {
    fontFamily: BeavyFonts.extraBold,
    fontSize: 11,
    color: C.cherry,
  },
  matchPillNeutral: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.grapefruit,
  },
  matchPillNeutralText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.cherry,
  },
  matchPillBudget: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.buttermilk,
    borderWidth: 1,
    borderColor: C.rule,
  },
  matchPillBudgetText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 11,
    color: C.muted,
  },
  reasonsCard: {
    padding: 16,
    borderRadius: BeavyRadius.lg,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.rule,
    gap: 10,
  },
  reasonsList: {
    gap: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  checkGlyph: {
    fontSize: 13,
    color: C.primary,
    marginTop: 1,
  },
  reasonText: {
    flex: 1,
    fontFamily: BeavyFonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: C.cherry,
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.rule,
    backgroundColor: C.white,
  },
  closeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: BeavyRadius.pill,
    backgroundColor: C.cherry,
  },
  closeBtnText: {
    fontFamily: BeavyFonts.bold,
    fontSize: 14,
    color: C.white,
  },
  pressed: {
    opacity: 0.8,
  },
});
