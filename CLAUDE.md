# Beavy — reguli de lucru

Regulile complete sunt în `AGENTS.md`. Aici e rezumatul operațional.

## Ce este proiectul
- Comparator de prețuri și optimizator de coș pentru 9 retaileri din România.
- UI-ul real este aplicația web React + Tailwind v4 + `lucide-react` din `src/` (`src/App.tsx`, `src/components/`).
- Expo (SDK 58, Expo Router) e doar învelișul: rutele sunt în `app/` (nu `src/app/`); `app/index.tsx` încarcă aplicația web direct (web) sau într-un WebView (nativ).
- `server.ts` (Express + Vite middleware): `/api/catalog/search` (Supabase) și `/api/ai-basket` (Gemini).

## Nu citi / nu atinge
- Ignoră `legacy-expo/`, `scripts/`, `supabase/`, `node_modules/` (și `dist/`, `bvy.app/`, care sunt excluse din build).
- Nu citi `src/data/catalog.ts` integral (e uriaș). Folosește `grep` / intervale mici de linii.
- Nu crea și nu edita manual `ios/` sau `android/`.

## Fișiere cheie
- `src/types.ts` — `CanonicalProduct`, `StoreOffer` (`isUnavailable` = fără ofertă verificată la acel magazin; nu are preț și nu intră în totaluri).
- `src/services/supabaseCatalog.ts` — căutare, deduplicare și mapare produse scrapate.
- `src/utils/pricing.ts` — oferte efective, Mod Fidel / Mod Economie, clasament, split, plan de optimizare.
- `src/data/stores.ts` — magazine, carduri, livrare.
- Convenție: `quantityBase` este în unitatea din `unitType` (kg / L / buc), ex. 200 g = `0.2` kg.

## Design system (strict)
- Documentație: `design-system/` (în special `design-tokens.css`, `color-system.md`, `components.md`, `ux-guidelines.md`).
- Tokeni: `@theme` din `src/index.css` și `design-system/design-tokens.css` (UI-ul e web). `src/constants/theme.ts` din `AGENTS.md` nu există în proiect.
- Paletă: buttermilk `#FFF6EE`, cherry `#421726`, strawberry `#F78D79`, grapefruit `#FCE2DB`, leek `#DBE3C6`, muted `#765B60`, rule `#EFE2D8`. Font Manrope. Raze 8 / 12 / 16 / 20 / 24 / pill.
- Fără gradiente mov/neon, fără emoji ca iconițe, fără card-în-card excesiv, ținte tactile de minimum 44×44 pt.
- Animații 120–220 ms, cu respectarea `prefers-reduced-motion`.

## Reguli de date
- Nu se inventează și nu se estimează prețuri: magazin fără ofertă = „Indisponibil”, `out_of_stock` = „Stoc epuizat”.
- Clasamentul și planurile sortează întâi după acoperirea coșului, apoi după total.
- Supabase: prețul de card e `loyalty_price` (cu `promo_requires_card`), prețul tăiat e `regular_price`, `quantity_value` e totalul ambalajului în `quantity_unit` (g / ml / pcs / L / kg).
- Mod Fidel = doar branduri consacrate; Mod Economie = permite mărci proprii echivalente.

## Comenzi
- `npx expo install <pachet>` pentru dependențe (nu `npm install <pachet>`).
- `npm run dev` — serverul Express + Vite; `npx expo start` — Expo.
- Înainte de a declara ceva gata: `npx tsc --noEmit` și `npm test` (plus `npx expo lint` când atingi UI).
- Pentru API-uri Expo / React Native: citește docs v58 (`https://docs.expo.dev/versions/v58.0.0/`), nu din memorie.

## UI structure (iOS style)
- 5 tab-uri: Acasă (`HomeTab`), Listă (`AiChatTab`), Coș (`BasketTab`), Compară (`PlanScreen`), Profil (`ProfileTab`).
- Coș: total mare + chip magazin/CTA, căutare live mereu vizibilă (`ProductSearchPanel inline`) cu scaner în input și comutator „În magazin", listă grupată pe raioane, `CrossStorePriceGrid` inline la tap, Undo 4s la ștergere, bifate colapsabile, verificare bon în spatele „Am ajuns la casă".
- Primitive iOS în `src/components/ios/`: `LargeTitle`, `GroupedSection`, `Segmented`, `BottomSheet`.
- `MatrixTab.tsx` e vechi și nefolosit.
