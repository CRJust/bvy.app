# Beavy UI & UX Rules — Antigravity Workspace Rule

> **Scope:** Toate modificările și fișierele de interfață din `src/app/`, `src/components/`, `src/constants/`.

---

## 1. Reguli Stricte Anti-AI-Slop

1. **Fără gradienturi decorative generice:** Nu introduce gradienturi violet/neon/roz generice de AI. Folosește fundalul cald `buttermilk` (`#FFF6EE`) și suprafețe curate `white` (`#FFFFFF`).
2. **Fără emoji-uri de chat ca iconițe:** Nu folosi emoji-uri (ex: 🛒, 📝, 🔒, 🗑️) în text sau pe butoane. Folosește exclusiv `SymbolView` din `expo-symbols` (cu glife tipografice discrete ca fallback).
3. **Fără carduri imbricate excesiv:** Nu crea carduri în carduri în carduri. Păstrează separarea prin spațiere aerisită și linii fine `rule` (`#EFE2D8`).
4. **Fără titluri repetitive:** Nu repeta numele listei sau al ecranului de 3 ori pe aceeași pagină. Fiecare zonă are o ierarhie clară.
5. **Fără texte de umplutură:** Nu folosi formulări artificiale de tip asistent virtual („Sunt aici să te ajut”). Folosește formulările concise și reale din brandbook-ul Beavy.

---

## 2. Paleta Oficială „Culorile din Cămară”

Importă întotdeauna din `@/constants/theme`:
- Fundal: `BeavyColors.buttermilk` (`#FFF6EE`)
- Carduri: `BeavyColors.white` (`#FFFFFF`)
- Text primar & acțiuni: `BeavyColors.cherry` (`#421726`)
- Accente & diferențiat: `BeavyColors.strawberry` (`#F78D79`)
- Suprafață secundară: `BeavyColors.grapefruit` (`#FCE2DB`)
- Succes / Bifare: `BeavyColors.leek` (`#DBE3C6`)
- Text secundar: `BeavyColors.muted` (`#765B60`)
- Borduri fine: `BeavyColors.rule` (`#EFE2D8`)

---

## 3. Feedback Haptic & Accesibilitate

* Fiecare atingere pe un buton important, stepper sau checkbox trebuie să apeleze `triggerHaptic()`.
* Orice animație creată cu Reanimated trebuie să verifice `useReducedMotion()`.
* Touch targets trebuie să aibă minimum 44×44 pt (folosește `hitSlop` când elementul vizual este mai compact).
* Verifică întotdeauna `npx tsc --noEmit` înainte de a declara o modificare terminată.
