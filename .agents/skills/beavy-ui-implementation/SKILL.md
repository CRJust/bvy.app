---
name: beavy-ui-implementation
description: >-
  Ghid pas cu pas pentru implementarea, refactorizarea sau crearea unei componente
  noi în Beavy, garantând respectarea strictă a Design System-ului și a TypeScript-ului.
---

# Beavy UI Implementation Skill

Inspirat din ghidul **Anthropic Frontend Design** și comanda `/impeccable shape`, acest skill impune disciplina de implementare a componentelor Beavy.

## Procesul de Implementare în 4 Pași

### Pasul 1: Planifică înainte de a scrie cod
- Identifică scopul utilitar direct al componentei.
- Stabilește stările: *normală*, *apăsată (pressed)*, *selectată (active)*, *dezactivată (disabled)*, *încărcare (loading)*.
- Selectează token-urile exacte din `@/constants/theme` (`BeavyColors`, `BeavyFonts`, `BeavyRadius`, `BeavySpacing`).

### Pasul 2: Scrie componenta React Native
- Folosește `StyleSheet.create` cu tipare stricte TypeScript.
- Utilizează `Pressable` cu `style={({ pressed }) => [...]}` pentru stări apăsate tactile.
- Asigură suport `hitSlop` pentru ținte mici de atingere.
- Folosește `SymbolView` din `expo-symbols` cu fallback typographic discret.

### Pasul 3: Adaugă micro-interacțiunile & Haptics
- Integrează `triggerHaptic('light' | 'medium' | 'selection')`.
- Dacă folosești `react-native-reanimated`, verifică întotdeauna `useReducedMotion()`.
- Păstrează duratele scurte: 120–220ms.

### Pasul 4: Verificare & Compilare
- Rulează comanda obligatorie:
  ```bash
  npx tsc --noEmit
  ```
- Verifică absența erorilor de linting sau a warning-urilor în consolă.
- Testează scalarea pe ecrane înguste (iPhone SE / 375px).
