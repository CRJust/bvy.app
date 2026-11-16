# Beavy Motion & Microinteractions Guidelines

> **Inspirație:** Fluiditatea naturală și viteza aplicațiilor mature (stil Bolt / Apple iOS native).  
> **Principiu:** Animațiile au scop funcțional de orientare spațială și confirmare tactilă, nu decorație lentă.

---

## 1. Scara de Durate & Curbe de Easing

| Tip Mișcare | Durată Recomandată | Easing Reanimated | Scop Funcțional |
| :--- | :--- | :--- | :--- |
| **Micro-interacțiune** | `120 ms` – `150 ms` | `Easing.out(Easing.quad)` | Bifare checkbox, puls pe stepper la cantitate |
| **Tranziție Componentă** | `180 ms` – `220 ms` | `Easing.out(Easing.cubic)` | Comutare listă activă, expand/collapse secțiune |
| **Modal / Bottom Sheet** | `200 ms` – `240 ms` | `Easing.out(Easing.cubic)` | Glisare de jos în sus la deschidere modal |
| **Schimbare Ecran** | `190 ms` – `210 ms` | `Easing.out(Easing.cubic)` | Fade subtil + translare 6–8px între taburi |

---

## 2. Micro-interacțiuni Cheie

1. **Checkbox Bifare (`ChecklistItemRow`):**
   - La atingere: `withSequence(withTiming(1.22, { duration: 90 }), withTiming(1, { duration: 110 }))`.
   - Însoțită de `triggerHaptic('selection')`.

2. **Stepper Cantitate (`QuantityStepper`):**
   - Cifra numărului de bucăți pulsează scurt (`1.22x` în `60ms` urmat de revenire în `75ms`).
   - Însoțită de `triggerHaptic('light')`.

3. **Bila Roșie Coș Flotant:**
   - La adăugarea oricărui produs în listă: `withSequence(withTiming(1.24, { duration: 90 }), withTiming(1, { duration: 120 }))`.

---

## 3. Feedback Haptic (`expo-haptics`)

* `triggerHaptic('selection')`: Selectare tab, bifare produs, deschidere modal, schimbare raion.
* `triggerHaptic('light')`: Incrementare/decrementare cantitate pe produs.
* `triggerHaptic('medium')`: Adăugare manuală produs nou, confirmare ștergere, salvare setări, **apăsare lungă (long-press)**.
* `triggerHaptic('success')`: Bifarea ultimului produs din listă, golire coș.

---

## 4. Respectarea `prefers-reduced-motion`

Fiecare componentă animată cu `react-native-reanimated` **trebuie** să apeleze `useReducedMotion()`.  
Dacă `reducedMotion === true`:
* Se setează direct valorile finale (`opacity.value = 1`, `translateY.value = 0`).
* Nu se rulează secvențe de scalare sau translare amplă.
