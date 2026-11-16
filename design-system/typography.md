# Beavy Typography Scale — Manrope

Familia de fonturi oficială este **Manrope** (`@expo-google-fonts/manrope`).  
Oferă lizibilitate optimă pe ecrane mobile de dimensiuni mici (iPhone SE, 375px) până la ecrane mari, cu cifre clare pentru prețuri și cantități.

---

## 1. Nivele Tipografice

| Nivel | Dimensiune | Line Height | Greutate (FontWeight) | Utilizare principală |
| :--- | :--- | :--- | :--- | :--- |
| **Display / Hero** | `22px` – `24px` | `28px` | `ExtraBold` (800) | Salut ecran, titluri de secțiune mari în Cont |
| **Title / Heading** | `18px` – `20px` | `24px` | `ExtraBold` (800) | Titluri carduri, modal headers, brand wordmark |
| **Subtitle / Section** | `15px` – `16px` | `20px` | `Bold` (700) | Titluri secțiuni cămară, denumiri de liste |
| **Body Bold** | `14px` | `19px` | `Bold` (700) | Nume produse în checklist, etichete de setări |
| **Body Medium** | `13px` – `14px` | `18px` | `Medium` (500) | Text descriptiv, câmpuri de input, căutare |
| **Caption Bold** | `11px` – `12px` | `15px` | `Bold` (700) | Butoane compacte, badge-uri de statut, prețuri |
| **Caption Regular** | `11px` – `12px` | `16px` | `Regular` (400) | Metadate produs (brand, gramaj), subtitluri discrete |
| **Micro / Overline** | `10px` | `13px` | `Bold` (700) | Overline categorii (ALL CAPS + letterSpacing: 0.6) |

---

## 2. Reguli Tipografice Stricte

1. **Fără italic decorativ generic:** Nu folosim stiluri cursive artificiale. Ierarhia se realizează prin contrastul dintre `ExtraBold` (800) și `Medium` (500).
2. **Cifre și simboluri monetare:** Prețurile se scriu cu majusculă clară: `12.49 RON` (fără spații înainte de virgulă, `RON` cu font Bold).
3. **Produse bifate:** Textul tăiat folosește culoarea secundară `muted` (`#765B60`) cu `textDecorationLine: 'line-through'`, fără a deveni ilizibil.
4. **Letter-spacing:**
   - Titluri mari (Hero/Display): `letterSpacing: -0.4` (strânse, moderne, cu caracter tipografic).
   - Overlines / Etichete mici: `letterSpacing: 0.6` cu `textTransform: 'uppercase'`.
