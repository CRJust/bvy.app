import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BeavyColors as C, BeavyFonts, BeavyRadius, triggerHaptic } from '@/constants/theme';
import type { ScenarioBasket } from '@/services/smart-shopping';

export type ScenarioType = 'smart_basket' | 'cheapest_basket' | 'single_store' | 'online_basket';

export interface ScenarioSwitcherProps {
  selectedScenario: ScenarioType;
  availableScenarios: {
    smartBasket: ScenarioBasket;
    cheapestBasket: ScenarioBasket;
    singleStoreBasket: ScenarioBasket | null;
    onlineBasket: ScenarioBasket | null;
  };
  onSelectScenario: (scenario: ScenarioType) => void;
}

export function ScenarioSwitcher({
  selectedScenario,
  availableScenarios,
  onSelectScenario,
}: ScenarioSwitcherProps) {
  const options: { id: ScenarioType; label: string; sub?: string }[] = [
    {
      id: 'smart_basket',
      label: 'Inteligent',
      sub: `${availableScenarios.smartBasket.totalToPay.toFixed(2)} lei`,
    },
    {
      id: 'cheapest_basket',
      label: 'Cel mai ieftin',
      sub: `${availableScenarios.cheapestBasket.totalToPay.toFixed(2)} lei`,
    },
    ...(availableScenarios.singleStoreBasket
      ? [
          {
            id: 'single_store' as ScenarioType,
            label: '1 Magazin',
            sub: `${availableScenarios.singleStoreBasket.totalToPay.toFixed(2)} lei`,
          },
        ]
      : []),
    ...(availableScenarios.onlineBasket
      ? [
          {
            id: 'online_basket' as ScenarioType,
            label: 'Online',
            sub: `${availableScenarios.onlineBasket.totalToPay.toFixed(2)} lei`,
          },
        ]
      : []),
  ];

  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const active = selectedScenario === opt.id;
        return (
          <Pressable
            key={opt.id}
            hitSlop={6}
            style={({ pressed }) => [
              styles.pill,
              active && styles.pillActive,
              pressed && styles.pillPressed,
            ]}
            onPress={() => {
              triggerHaptic('selection');
              onSelectScenario(opt.id);
            }}
          >
            <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>
              {opt.label}
            </Text>
            {opt.sub ? (
              <Text style={[styles.pillSub, active && styles.pillSubActive]}>
                {opt.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: C.secondary,
    borderRadius: BeavyRadius.pill,
    padding: 3,
    marginBottom: 16,
  },
  pill: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: BeavyRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pillActive: {
    backgroundColor: C.surface,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  pillPressed: {
    opacity: 0.78,
  },
  pillLabel: {
    fontFamily: BeavyFonts.semiBold,
    fontSize: 12,
    color: C.muted,
  },
  pillLabelActive: {
    fontFamily: BeavyFonts.bold,
    color: C.primary,
  },
  pillSub: {
    fontFamily: BeavyFonts.regular,
    fontSize: 10,
    color: C.muted,
    marginTop: 1,
  },
  pillSubActive: {
    fontFamily: BeavyFonts.semiBold,
    color: C.primary,
  },
});
