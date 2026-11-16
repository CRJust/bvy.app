# DESIGN.md — Beavy Design System

> Specificație vizuală unificată pentru **Beavy** (comparator românesc de prețuri la supermarketuri: Lidl, Kaufland, Carrefour, Auchan, Mega Image, PENNY, Profi, Freshful, Sezamo). Format optimizat pentru **Google Stitch**, **Claude Code**, **v0** și implementare React / Expo.

---

## 1. Visual Identity & Atmosphere

Beavy are o estetică **editorială, caldă și clară**, cu aspect de listă modernă pe hârtie — NU o interfață rece de dashboard SaaS.
- **Senzație:** calmă, aerisită, lizibilă în lumină naturală (în magazin, cu telefonul într-o mână).
- **Structură de suprafață:** fundal crem cald (`#FFF6EE`), cu suprafețe albe (`#FFFFFF`) delimitate de linii fine (`1px` `#EFE2D8`), fără umbre grele și fără carduri imbricate în alte carduri.

---

## 2. Color Palette

| Token | HEX | Role | Usage |
| :--- | :--- | :--- | :--- |
| **Buttermilk** | `#FFF6EE` | App Background | Fundal principal pe toate ecranele |
| **White** | `#FFFFFF` | Elevated Surface | Carduri de produse, panouri de căutare, foi de listă |
| **Cherry** | `#421726` | Primary Ink & CTA | Titluri, text principal, butoane primare, checkbox-uri bifate |
| **Cherry Soft** | `#5F263B` | Pressed / Hover | Stare activă pe butoane primare |
| **Strawberry** | `#F78D79` | Warm Accent | Accente, indicatori de selecție, badge-uri de reducere |
| **Sand** | `#E8DCCF` | Secondary Surface | Track segmente, pilule neutre, avatar |
| **Grapefruit** | `#FCE2DB` | Warm Warning | Indisponibil, fără preț verificat, prag minim neîndeplinit |
| **Leek** | `#DBE3C6` | Success & Savings | Cel mai ieftin magazin, marcă proprie, economii verificate |
| **Leek Dark** | `#3A542A` | Text on Leek | Text cu contrast WCAG AA pe fundal `#DBE3C6` |
| **Muted** | `#765B60` | Secondary Ink | Subtitluri, brand, gramaj, etichete „Estimat” |
| **Rule** | `#EFE2D8` | Hairline Divider | Separatoare `1px` între rânduri |
| **Paper Rule** | `#DFD1C2` | Secondary Divider | Separatoare pe suprafață `#E8DCCF` |

### Interdicții cromatice stricte
- **Fără** gradiente violet/neon/albastru-roz („AI slop”).
- **Fără** negru pur (`#000000`) — folosește `#421726`.
- **Fără** gri rece (`#9CA3AF`, `#6B7280`) — folosește `#765B60`.

---

## 3. Typography & Numbers

- **Font Family:** `Manrope` (weights: `400`, `500`, `600`, `700`, `800`).
- **Hierarchy:**
  - **Display / Hero:** `22px–24px`, weight `800`, `letter-spacing: -0.4px`, line-height `28px`.
  - **Title / Heading:** `18px–20px`, weight `800`, line-height `24px`.
  - **Section / Subtitle:** `15px–16px`, weight `700`, line-height `20px`.
  - **Body Bold (Item name):** `14px`, weight `700`, line-height `19px`.
  - **Body Medium (Inputs):** `13px–14px`, weight `500`, line-height `18px`.
  - **Caption / Price Badge:** `11px–12px`, weight `700`, line-height `15px`.
  - **Micro Overline (Raion / Category):** `10px`, weight `700`, `UPPERCASE`, `letter-spacing: 0.6px`.
- **Numere & Prețuri:** Întotdeauna `tabular-nums`, format românesc cu virgulă (`12,49 lei`). Prețul redus arată prețul vechi tăiat în `#765B60`.

---

## 4. Geometry, Layout & Touch Targets

- **Border Radius:** `sm: 8px`, `md: 12px`, `lg: 16px`, `xl: 20px`, `2xl: 24px`, `pill: 999px` (butoane, search bar, badge-uri).
- **Touch Targets:** Minim `44×44 pt` pentru orice element interactiv (steppers `− / +`, checkbox-uri, tab-uri).
- **Navigation (4 Tab-uri Mobile-First):**
  1. **Listă** (Asistent AI + șabloane rapide de coș)
  2. **Coș** (Căutare 64k+ produse, scanare EAN, listă grupată pe raioane, mod *În magazin* + verificare bon)
  3. **Compară** (Clasament 9 magazine, Split 2 magazine, matrice produs × magazin, *Mod Fidel* vs *Mod Economie*)
  4. **Profil** (Oraș, carduri de fidelitate, magazine excluse)

---

## 5. UX & Data Integrity Rules

- **Fără emoji-uri ca iconițe UI:** folosește iconițe vectoriale curate (`lucide-react` pe web, `expo-symbols` pe native).
- **Transparență prețuri din scrapere:**
  - Ofertele reale din scrapere sunt prioritare și pot primi eticheta **„Cel mai ieftin”** (`#DBE3C6` / `#3A542A`).
  - Magazinele fără ofertă reală afișează clar eticheta **`Estimat`** (`#765B60`, opacitate redusă) și nu pot câștiga artificial clasamentul în fața ofertelor reale.
- **Motion:** Animații scurte și discrete (`120–220 ms`), respectând `prefers-reduced-motion`.
