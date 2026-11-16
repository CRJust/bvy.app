# Product Requirements Document (PRD) — Beavy

**Versiune:** 1.0  
**Platforme:** Web (React + Vite), iOS & Android (Expo SDK 58 / React Native WebView)  
**Backend & Date:** Express (`server.ts`) + Supabase (`beavy_products`, `beavy_product_offers`, `beavy_retailers`) + Gemini AI

---

## 1. Viziune și Problemă Rezolvată

**Beavy** este un comparator inteligent de coșuri de cumpărături pentru supermarketurile din România.  
Spre deosebire de aplicațiile care compară produse izolate sau afișează doar cataloage PDF, Beavy optimizează **întregul coș de cumpărături**: calculează unde ieși cel mai ieftin pe total (inclusiv livrare și carduri de fidelitate), când merită să împarți cumpărăturile în 2 magazine și unde poți economisi prin mărci proprii echivalente.

### Obiective principale
1. **Transparență totală a prețurilor:** combină ofertele reale colectate din scrapere (`beavy_product_offers`) cu marcarea explicită a oricărei estimări (`isEstimated`), fără a permite estimărilor să câștige artificial în fața prețurilor reale.
2. **De la idee la casă în 4 pași:** Listă AI → Coș → Compară → În magazin & Verificare bon.
3. **Economii reale, fără efort:** aplicarea automată a cardurilor de loialitate, pragurilor de livrare gratuită și recomandărilor de split doar când economia netă depășește pragul de rentabilitate.

---

## 2. Supermarketuri, Canale și Programe de Fidelitate

Beavy acoperă **9 retaileri** din România:

| Retailer | Canal | Card Fidelitate | Livrare | Livrare gratuită | Comandă minimă |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Lidl** | Fizic | `Lidl Plus` | — | — | — |
| **Kaufland** | Fizic | `Kaufland Card` | — | — | — |
| **PENNY** | Fizic | `PENNY Card` | — | — | — |
| **Profi** | Fizic | — | — | — | — |
| **Carrefour** | Hibrid (Fizic + Online) | `Card CONNECT / Act for Good` | `14,99 lei` | `≥ 200 lei` | `70 lei` |
| **Auchan** | Hibrid (Fizic + Online) | `MyCLUB` | `14,90 lei` | `≥ 199 lei` | `75 lei` |
| **Mega Image** | Hibrid (Fizic + Online) | `Card CONNECT` | `12,90 lei` | `≥ 150 lei` | `50 lei` |
| **Freshful** | Online (București & Ilfov) | — | `15,00 lei` | `≥ 220 lei` | `100 lei` |
| **Sezamo** | Online (București & Ilfov) | `Sezamo Xtra` | `14,90 lei` | Gratuit cu `Sezamo Xtra` / `≥ 200 lei` | `100 lei` |

---

## 3. Arhitectura Informației și Navigația (4 Tab-uri)

Aplicația folosește o bară de navigație cu **4 tab-uri** mobile-first (și header corespondent pe desktop):

1. **Listă (`ai`)** — Asistentul AI pentru generarea listei din limbaj natural și misiuni rapide.
2. **Coș (`basket`)** — Lista activă, căutare în catalogul de ~64.8k produse, scanare EAN, mod *În magazin* și verificare bon.
3. **Compară (`matrix`)** — Clasamentul celor 9 magazine, recomandarea **Split 2 magazine**, matricea produs × magazin și comutatorul **Mod Fidel / Mod Economie**.
4. **Profil (`profile`)** — Oraș, carduri de fidelitate active, magazine excluse și preferințe alimentare.

---

## 4. Cerințe Funcționale Detaliate

### 4.1. Listă (`AiChatTab`)
- **Input natural:** utilizatorul scrie ce vrea să gătească sau să cumpere (ex: *„coș săptămânal pentru 2 persoane sub 250 lei”*, *„cină rapidă”*).
- **Șabloane rapide:** misiuni predefinite cu un singur tap.
- **Constrângeri de misiune:** extragere/setare pentru buget maxim (`budgetRon`), număr de zile (`days`) și număr maxim de magazine (`1` sau `2`).
- **Acțiune directă:** produsele potrivite sunt adăugate în coș cu un singur click (`Adaugă în coș`).

### 4.2. Catalog Live, Căutare și Deduplicare (`supabaseCatalog.ts` + `/api/catalog/search`)
- **Sursa de date:** baza Supabase (`64.849` produse în `beavy_products` și `73.710+` oferte reale în `beavy_product_offers`).
- **Căutare debounced (~250ms):** după `canonical_name`, `brand` sau `barcode` (cu sanitizarea caracterelor speciale).
- **Deduplicare & fuzionare la căutare:** produsele duplicate între retaileri (diferențe de majuscule, diacritice, `3,5%` vs `3.5%`, `pt` vs `pentru`, `g` vs `ml` pentru același produs) trebuie grupate într-un singur `CanonicalProduct`, fără a fuziona greutăți/volume diferite (`450ml` != `1L`) sau concentrații diferite (`1.5%` != `3.5%`).
- **Ordonare rezultate:** produsele cu cele mai multe oferte reale din scrapere apar primele; căutarea exactă după cod de bare returnează produsul indiferent de numărul de oferte.
- **Persistență locală:** produsele adăugate dinamic din Supabase se salvează în `localStorage` (`beavy_cached_products_v1`, limitat la cele mai recente 100, cu actualizarea prețurilor la fiecare căutare).

### 4.3. Scanner Cod de Bare EAN (`EanScannerModal`)
- **Scanare live prin cameră** (unde `BarcodeDetector` este disponibil) + **introducere manuală** cu validare GS1 (EAN-13, EAN-8, UPC-A).
- **Fallback în Supabase:** dacă codul nu este în catalogul local, caută în `/api/catalog/search` și acceptă exclusiv potrivirea exactă a codului.

### 4.4. Coș (`BasketTab`)
- **Header editorial:** totalul coșului (`tabular-nums`), numărul de produse/bucăți, progres față de buget (dacă este setat) și magazinul ales / economia obținută.
- **Search bar + EAN integrat:** acces direct la căutarea în ~64.8k produse, cu badge clar pentru numărul de `oferte reale` și marcaj `(est.)` sau `Preț indisponibil` unde nu există oferte reale.
- **Grupare pe raioane (`category`):** *Fructe & Legume*, *Lactate & Ouă*, *Carne & Pește*, *Cămară & Paste* etc.
- **Rând de produs:** thumbnail, nume, brand & gramaj, preț efectiv (cu preț de raft tăiat la promoție + badge card/`Estimat`), stepper `− qty +`, ștergere cu **Undo (4s)** și expandare inline a grilei de prețuri (`CrossStorePriceGrid`).
- **Mod „În magazin”:**
  - Checklist la raft cu bară de progres (*În coșul fizic* vs *Rămas*).
  - Produsele bifate se strâng jos într-o secțiune colapsabilă.
  - **Verificare bon (`appliedPlanSnapshot`):** compararea totalului estimat cu bonul real de la casă.

### 4.5. Motorul de Prețuri și Optimizare (`pricing.ts` + `MatrixTab`)
- **4 Nivele de Echivalență:**
  1. `Exact` (același produs, același gramaj)
  2. `Twin canonic` (echivalent funcțional direct, ex. variante zero zahăr)
  3. `Echivalent funcțional / estimat`
  4. `Marcă proprie / Alternativă`
- **Mod Fidel vs. Mod Economie:**
  - **Mod Fidel:** păstrează strict brandurile naționale cerute; sugerează marcă proprie doar informativ dacă economia depășește `20%`.
  - **Mod Economie:** înlocuiește automat produsele care au echivalent marcă proprie (`economyEquivalentId`) cu economii reale, cu posibilitatea de a respinge individual un swap (`rejectedSwapIds`).
- **Carduri de fidelitate & Promoții:**
  - La magazinele cu card (`Lidl`, `Kaufland`, `PENNY`, `Carrefour`, `Auchan`, `Mega Image`, `Sezamo`), `promo_price < price` se aplică ca `cardPrice` dacă programul are card; la magazinele fără card (`Profi`, `Freshful`), promoția scade direct `basePrice`.
  - Dacă un card inactiv ar aduce economii, planul semnalează oportunitatea (`cardOpportunity`).
- **Regula anti-distorsiune pentru prețuri estimate (`isEstimated`):**
  - Magazinele fără ofertă reală primesc o estimare neutră (`avg * 1.05`), **fără** reduceri artificiale și **fără** `cardPrice` inventat.
  - `getRankedStores` sortează întâi după numărul de produse estimate (`estimatedCount` crescător), apoi după `totalWithDelivery` — un magazin cu prețuri estimate nu poate bate un magazin cu prețuri reale.
  - În `CrossStorePriceGrid` și `MatrixTab`, „Cel mai ieftin” și diferențele de preț se calculează exclusiv din oferte reale, iar celulele estimate sunt marcate `Estimat`.
- **Regula Split 2 Magazine (`computeSplitTwoStores`):**
  - Se recomandă doar dacă `maxStores === 2`, ambele sub-coșuri respectă pragul de `minOrder` online, economia netă (inclusiv livrările) este `> 10 lei` ȘI `> 8%`, și split-ul nu se bazează pe mai multe estimări decât magazinul unic câștigător.

### 4.6. Profil & Reguli Geografice (`ProfileTab`)
- **Oraș:** în afara `București & Ilfov`, retailerii exclusiv online (`freshful`, `sezamo`) sunt dezactivați automat.
- **Carduri de fidelitate:** activare/dezactivare individuală pentru cele 6 programe.
- **Excludere magazine:** utilizatorul poate exclude manual magazine pe care nu le frecventează.

---

## 5. Cerințe Non-Funcționale și Design

1. **Design System ([DESIGN.md](file:///Users/iustin/Documents/beavy-expo/DESIGN.md)):**
   - Paletă: `#FFF6EE` (fundal), `#FFFFFF` (suprafețe), `#421726` (text/CTA primar), `#F78D79` (accent), `#DBE3C6` / `#3A542A` (cel mai ieftin/succes), `#FCE2DB` (atenționări), `#765B60` (text secundar), `#EFE2D8` (linii `1px`).
   - Font: `Manrope`, cifre cu `tabular-nums`, format `12,49 lei`.
   - Contrast WCAG AA, touch targets minim `44×44 pt`, fără gradiente neon, fără emoji-uri ca iconițe UI.
2. **Compatibilitate Mobile (Expo SDK 58):**
   - `app/index.tsx` încarcă aplicația nativ prin `react-native-webview` către `EXPO_PUBLIC_WEB_APP_URL` / IP-ul Metro pe portul `3000`, cu `SafeAreaView` (`react-native-safe-area-context`), `domStorageEnabled`, suport hardware Back pe Android și ecran de eroare cu retry.
3. **Calitate & Testare:**
   - `npx tsc --noEmit`: 0 erori.
   - `npm test`: toate testele unitare de pricing, echivalențe și validare EAN (`23/23+`) trebuie să treacă înainte de orice release.
   - `npx expo-doctor`: `20/20` verificări trecute.
