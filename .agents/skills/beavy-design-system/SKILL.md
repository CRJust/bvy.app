---
name: beavy-design-system
description: >-
  Ghidul complet și referința Beavy Design System. Folosește acest skill când creezi,
  modifici sau stilizezi orice ecran, componentă sau token UI pentru Beavy.
---

# Beavy Design System Skill

Acest skill oferă ghidarea completă a sistemului de design Beavy pentru agenții AI și inginerii de interfață.

## Documentație de Bază
Înainte de orice intervenție UI, consultă documentele relevante din directorul `/design-system`:
- [`brand-foundations.md`](file:///Users/iustin/Documents/beavy-expo/design-system/brand-foundations.md) — Filosofia și tonul de voce Beavy.
- [`color-system.md`](file:///Users/iustin/Documents/beavy-expo/design-system/color-system.md) — Paleta „Culorile din cămară” și contrastele WCAG AA.
- [`typography.md`](file:///Users/iustin/Documents/beavy-expo/design-system/typography.md) — Scara tipografică Manrope.
- [`components.md`](file:///Users/iustin/Documents/beavy-expo/design-system/components.md) — Anatomia și stările fiecărei componente.
- [`motion-guidelines.md`](file:///Users/iustin/Documents/beavy-expo/design-system/motion-guidelines.md) — Durate de animație (120–220ms) și haptic feedback.
- [`ux-guidelines.md`](file:///Users/iustin/Documents/beavy-expo/design-system/ux-guidelines.md) — Gestionarea stărilor (empty, loading, error).

## Reguli Cheie de Respectat
1. **Paleta cromatică:** Nu inventa culori noi. Folosește `BeavyColors` din `@/constants/theme`.
2. **Iconițe:** Folosește doar `SymbolView` din `expo-symbols`. Fără emoji-uri chat ca iconițe.
3. **Mobile-first:** Verifică întotdeauna pe iPhone (viewport 375px/390px) și Android.
4. **Validare:** Rulează `npx tsc --noEmit` pentru a garanta absența erorilor de TypeScript.
