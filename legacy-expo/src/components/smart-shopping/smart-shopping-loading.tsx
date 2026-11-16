import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BeavyColors as C, BeavyFonts, BeavyRadius } from '@/constants/theme';
import { BeavyOrigamiAnimation } from './beavy-origami-animation';

export interface SmartShoppingLoadingProps {
  currentStageMessage?: string;
  stageIndex?: number; // 0 to 5
  identifiedCount?: number;
  retailersCount?: number;
  offersCount?: number;
  combinationsCount?: number;
  isFinished?: boolean;
  onAnimationFinish?: () => void;
}

const STAGES = [
  'Analizăm lista ta…',
  'Identificăm produsele…',
  'Comparăm prețurile…',
  'Verificăm ofertele disponibile…',
  'Calculăm combinația optimă…',
  'Pregătim coșul recomandat…',
];

export function SmartShoppingLoading({
  currentStageMessage,
  stageIndex = 0,
  identifiedCount,
  retailersCount,
  offersCount,
  combinationsCount,
  isFinished = false,
  onAnimationFinish,
}: SmartShoppingLoadingProps) {
  const activeMessage = currentStageMessage || STAGES[Math.min(stageIndex, STAGES.length - 1)];
  const progressRatio = isFinished ? 1.0 : Math.min(1.0, (stageIndex + 1) / STAGES.length);

  return (
    <View style={styles.container}>
      {/* Signature Origami Brand Animation */}
      <View style={styles.animationContainer}>
        <BeavyOrigamiAnimation
          size={150}
          isComplete={isFinished}
          onAnimationFinish={onAnimationFinish}
        />
      </View>

      {/* Main Copy */}
      <Text style={styles.headline}>Pregătim cel mai inteligent coș pentru tine.</Text>
      <Text style={styles.supportingText}>
        Comparăm prețurile, verificăm magazinele și găsim combinația potrivită pentru cumpărăturile tale.
      </Text>

      {/* Progress Track */}
      <View style={styles.progressSection}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${Math.round(progressRatio * 100)}%` }]} />
        </View>
        <Text style={styles.stageLabel}>{activeMessage}</Text>
      </View>

      {/* Real Live Metrics Chips (Never fabricated, rendered only when available) */}
      <View style={styles.metricsRow}>
        {identifiedCount != null && identifiedCount > 0 && (
          <View style={styles.metricChip}>
            <Text style={styles.metricValue}>{identifiedCount}</Text>
            <Text style={styles.metricTitle}>produse</Text>
          </View>
        )}
        {retailersCount != null && retailersCount > 0 && (
          <View style={styles.metricChip}>
            <Text style={styles.metricValue}>{retailersCount}</Text>
            <Text style={styles.metricTitle}>magazine</Text>
          </View>
        )}
        {offersCount != null && offersCount > 0 && (
          <View style={styles.metricChip}>
            <Text style={styles.metricValue}>{offersCount}</Text>
            <Text style={styles.metricTitle}>oferte active</Text>
          </View>
        )}
        {combinationsCount != null && combinationsCount > 0 && (
          <View style={styles.metricChip}>
            <Text style={styles.metricValue}>{combinationsCount}</Text>
            <Text style={styles.metricTitle}>combinații</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
  },
  animationContainer: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontFamily: BeavyFonts.bold,
    fontSize: 20,
    color: C.primary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 8,
  },
  supportingText: {
    fontFamily: BeavyFonts.regular,
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: 26,
  },
  progressSection: {
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
    marginBottom: 22,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(66, 23, 38, 0.08)',
    borderRadius: BeavyRadius.pill,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: BeavyRadius.pill,
  },
  stageLabel: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 13,
    color: C.primary,
    textAlign: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BeavyRadius.pill,
    borderWidth: 1,
    borderColor: C.rule,
  },
  metricValue: {
    fontFamily: BeavyFonts.bold,
    fontSize: 12,
    color: C.primary,
  },
  metricTitle: {
    fontFamily: BeavyFonts.regular,
    fontSize: 11,
    color: C.muted,
  },
});
