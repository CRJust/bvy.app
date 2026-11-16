---
name: beavy-ui-audit
description: >-
  Skill specializat pentru auditarea, evaluarea critică și identificarea problemelor vizuale
  sau de accesibilitate din ecranele și componentele aplicației Beavy.
---

# Beavy UI Audit Skill

Inspirat din principiile **Hallmark** (anti-AI-slop linter) și **Impeccable** (`/critique` și `/audit`), acest skill ghidează evaluarea obiectivă a oricărei interfețe Beavy.

## Criterii de Auditare

La inspectarea unui ecran, parcurge următoarele 6 puncte critice:

1. **Anti-AI-Slop Check:**
   - Există gradienturi purpurii/neon decorative inutile? (Dacă da, elimină-le).
   - Există titluri repetate sau etichete de umplutură? (Dacă da, simplifică).
   - Se folosesc emoji-uri pe post de iconițe? (Înlocuiește cu `SymbolView`).
   - Există carduri imbricate inutil (card-in-card)?

2. **Ierarhie & Densitate:**
   - Este acțiunea primară evidentă în primele 2 secunde?
   - Conținutul esențial se află deasupra pliului (above the fold)?

3. **Consistență Cromatică:**
   - Toate culorile provin exclusiv din `BeavyColors` (`@/constants/theme`)?
   - Textul principal este `cherry` (`#421726`) și fundalul este `buttermilk` (`#FFF6EE`)?

4. **Accesibilitate & Mărime Touch:**
   - Toate butoanele și rândurile interactive au minimum 44×44 pt zonă de atingere (`hitSlop={8}` sau mai mare)?
   - Contrastul textului pe fundal respectă standardul WCAG AA?

5. **Motion & Tactilitate:**
   - Animațiile apelează `useReducedMotion()`?
   - Există feedback haptic (`triggerHaptic`) la acțiuni majore?
   - Duratele de animație sunt rapide (120–220ms)?

6. **Stări Limitrofe (Edge Cases):**
   - Cum arată ecranul când datele sunt 0 (empty state)?
   - Cum arată când catalogul se încarcă (loading state)?
   - Cum se comportă tastatura la derulare (`keyboardDismissMode="on-drag"`)?
