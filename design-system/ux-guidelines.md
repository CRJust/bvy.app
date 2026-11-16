# Beavy UX Guidelines & State Management

Ghidul experienței utilizatorului pentru fluxurile esențiale Beavy: organizarea listei, compararea coșului și gestionarea contului.

---

## 1. Navigația Inferioară (Bottom Tab Bar)

Aplicația este structurată pe **3 taburi principale**:
1. **Listă:** Spațiul de lucru săptămânal al utilizatorului (produse de luat, cămară, raioane).
2. **Coș:** Punctul de decizie și transparență a prețurilor (magazine evaluate, prețuri confirmate, economii).
3. **Cont:** Spațiul de administrare a identității, securității, notificărilor și întrebărilor frecvente.

*Regulă:* Schimbarea taburilor este persistentă (`detachInactiveScreens={false}`), starea rămâne intactă și nu se resetează poziția de scroll.

---

## 2. Stări de Conținut (States)

### A. Empty States (Stări Goale)
* Nu se lasă ecrane albe sau mesaje tehnice tip `null`.
* Fiecare stare goală are:
  - O ilustrație sau iconiță nativă centrată în cerc pastel (`grapefruit`).
  - Un titlu scurt și cald (ex: *„Fă-ți lista, de restul se ocupă Beavy”*).
  - Un text explicativ (1–2 rânduri) despre pasul următor.
  - Un buton CTA direct care ghidează utilizatorul către acțiune.

### B. Loading States (Stări de Încărcare)
* Se folosește indicatorul nativ `ActivityIndicator` cu `color={BeavyColors.strawberry}` pe fundal `buttermilk`.
* Text asociat discret: *„Încărcăm produsele din cămară...”* sau *„Evaluăm ofertele magazinelor...”*.
* Timpii de căutare au debounce de `180ms` pentru a nu declanșa intermitențe vizuale agresive.

### C. Error States (Stări de Eroare)
* Erorile de rețea sau de catalog se afișează într-o casetă caldă cu fundal `grapefruit` și text `cherry`.
* Oferă întotdeauna o cale de revenire sau de reîncercare fără blocarea aplicației.

---

## 3. Gesturi & Interacțiuni Mobile

1. **Tap Simplu (Short Tap):**
   - Bifează/debifează produsul din checklist.
   - Deschide raionul sau selectează lista.
2. **Apăsare Lungă (Long Press, 350ms):**
   - Oferă feedback haptic ferm (`triggerHaptic('medium')`).
   - Deschide dialogul de ștergere a unei liste sau a unui produs individual.
3. **Swipe-Down pe Modale:**
   - Orice bottom sheet se poate trage în jos pentru închidere imediată.
4. **Keyboard Dismiss:**
   - La derularea listei de produse, tastatura se retrage automat (`keyboardDismissMode="on-drag"`).
