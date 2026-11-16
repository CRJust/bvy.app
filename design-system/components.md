# Beavy Components Architecture & Anatomy

Fiecare componentă reutilizabilă are comportamente, dimensiuni și stări previzibile pe toate ecranele aplicației.

---

## 1. Top Header
* **Anatomie:**
  - Stânga: Logo origami Beavy (`38×38 px`) + `beavy.` wordmark (`20px`, `ExtraBold`, `cherry`).
  - Dreapta: Butoane de acțiune secundare (`34×34 px` circulare, border `rule`) + Avatar utilizator (`34×34 px`, fundal `grapefruit`, text `cherry`).
* **Regulă:** Antetul nu afișează titluri repetitive lungi sau redundante.

---

## 2. Checklist Item Row (`ChecklistItemRow`)
* **Anatomie:**
  - **Checkbox tactil:** Disc `26×26 px`.
    - *Nebifat:* Inel de `1.5px` `cherry`, fundal `buttermilk`.
    - *Bifat:* Umplutură `cherry`, simbol alb `checkmark`, animație de micro-bounce (`1.22x` la `1.0x` în `200ms`).
  - **Thumbnail produs (`ProductImageBox`):** Casetă de `44×44 px` cu fundal crem uniform și `objectFit: contain`.
  - **Coloană text:** Nume produs (`14px`, `Bold`), badge `În coș` (pe fundal `leek`) când este bifat, și metadate (`brand · gramaj`).
  - **Stepper cantitate (`QuantityStepper`):** Butoane `−` și `+` tactile cu feedback haptic la fiecare atingere.
  - **Long-Press:** Apăsarea lungă (350ms) declanșează un impuls haptic `medium` și confirmarea de eliminare a produsului.

---

## 3. Product Grid Card (`ProductCard`)
* **Anatomie:**
  - Card alb, bordură `1px` `rule`, colțuri rotunjite `20px` (`BeavyRadius.xl`).
  - Casetă imagine produs de înălțime fixă `112px`, fundal crem, `objectFit: contain`.
  - Nume produs pe maximum 2 rânduri, gramaj și brand.
  - Buton `+` sau stepper `[ − 1 + ]` în colțul inferior dreapta.

---

## 4. Modal & Bottom Sheets (`ListsSheetModal`, `AislePickerModal`)
* **Anatomie:**
  - Fundal întunecat discret: `rgba(66, 23, 38, 0.42)`.
  - Foaie glisantă de jos (Bottom Sheet): Colțuri sus rotunjite `24px`, bară de prindere (drag handle) de `36×4 px`.
  - Gesturi: Swipe-down fluid pentru închidere prin `PanResponder`.
  - Accesibilitate: Tap pe backdrop închide modalul; respectă `useReducedMotion()`.

---

## 5. Floating Bottom Cart Bar
* **Anatomie:**
  - Bară flotantă fixată deasupra tab bar-ului, fundal `cherry` (`#421726`), colțuri `20px`.
  - Cerc cu numărul de unități: fundal alb, text `cherry`, animație de puls la adăugare (`1.24x` în `90ms`).
  - Text: *„Din listă, în coș”* + CTA `Vezi coșul →`.
