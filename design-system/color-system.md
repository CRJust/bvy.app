# Beavy Color System — „Culorile din Cămară”

Sistemul cromatic Beavy este derivat din elementele tactile ale cumpărăturilor alimentare tradiționale românești.  
Toate combinațiile respectă standardele de contrast **WCAG AA** pentru accesibilitate pe mobil în lumină naturală.

---

## 1. Paleta Fondatoare

| Denumire Brand | Valoare HEX | Rol Funcțional | Exemplu de Folosire |
| :--- | :--- | :--- | :--- |
| **Background (Buttermilk)** | `#FFF6EE` | Fundal principal cald | Toate ecranele (`SafeAreaView`, pagină întreagă) |
| **Surface (White)** | `#FFFFFF` | Suprafețe elevate | Carduri de produse, carduri fintech, bare de căutare |
| **Primary (Cherry)** | `#421726` | Text primar și acțiuni forte | Titluri, butoane principale, checkbox-uri bifate |
| **Primary Soft** | `#5F263B` | Stare activă / pressed | Stare apăsată pe butoane primare |
| **Accent (Strawberry)** | `#F78D79` | Accent cald și evidențieri | Indicatori, badge-uri de reducere (text `#421726`) |
| **Secondary (Sand)** | `#E8DCCF` | Suprafețe secundare calde | Track segmente, avatar, pilule neutre |
| **Grapefruit** | `#FCE2DB` | Atenționări calde | Indisponibil, fără preț verificat, prag minim |
| **Leek** | `#DBE3C6` | Stări pozitive & economii | Cel mai mic coș, marcă proprie, economii verificate |
| **Leek Dark** | `#3A542A` | Text pe fundal Leek | Contrast WCAG AA pe verde praz |
| **Muted** | `#765B60` | Text secundar cald | Subtitluri, metadate, iconițe pasive |
| **Rule** | `#EFE2D8` | Linii fine structurale | Separatoare de rânduri (1px) fără carduri imbricate |
| **Paper Rule** | `#DFD1C2` | Linii pe suprafață Secondary | Separatoare pe fundal `#E8DCCF` |

---

## 2. Reguli de Contrast & Semiotică

* **Text Principal:** `cherry` pe `buttermilk` sau `white` este combinația principală pentru text.
* **Text Secundar:** `muted` pe `buttermilk` oferă contrast WCAG AA.
* **Starea „Bifat”:** Folosește inelul `cherry` plin cu `checkmark` alb și badge-ul `leek` (`#DBE3C6`) cu text `cherry`.
* **Interdicții Stricte:**
  - Niciun gradient artificial de tip AI (violet spre neon, roz spre albastru).
  - Niciun text gri rece tip `#9CA3AF` sau `#6B7280` — se folosește doar `muted` (`#765B60`).
  - Niciun negru pur `#000000` — tot textul negru este înlocuit cu `cherry` (`#421726`).
