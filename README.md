# Kvitto-app – fritidshuset i Stavsnäs

En mobilapp (PWA) för att registrera alla kvitton för utgifter på fritidshuset:
renovering, reparation, underhåll och drift. Varje utgift klassas så att vi vid en
framtida försäljning enkelt kan ta fram underlag för avdrag för
**förbättringsutgifter** mot kapitalvinsten.

## Status

| Fas | Innehåll | Status |
|-----|----------|--------|
| 1 | Grundapp: registrera kvitto med foto, lista, sammanställning, CSV-export. Data sparas lokalt i telefonen. | Pågår |
| 2 | Delad databas (Supabase) så att två personer ser samma kvitton. Inloggning. | Planerad |
| 3 | AI-avläsning av kvittofoton (Claude API via Supabase Edge Function). | Planerad |
| 4 | Drift: keep-alive via GitHub Actions, finslipning. | Planerad |

## Klassning av utgifter

| Klass | Exempel | Avdrag vid försäljning |
|-------|---------|------------------------|
| **Grundförbättring** | Ny-, till- och ombyggnad. Nytt badrum där det inte fanns något, altan, tillbyggnad, bergvärme. Byte till *bättre* material (t.ex. parkett i stället för plastmatta) – prisskillnaden. | Ja, utan tidsgräns |
| **Reparation & underhåll** | Målning, tapetsering, byte av vitvaror, byte till *likvärdigt* material. | Ja, men bara om utgiften gjorts under försäljningsåret eller de fem föregående kalenderåren, och bara om huset är i bättre skick än vid köpet (”förbättrande” reparation) |
| **Driftskostnad** | El, försäkring, sotning, sophämtning, vatten, snöröjning, förbrukningsmaterial. | Nej |

### Regler som appen räknar med

1. **5 000-kronorsgränsen.** Förbättringsutgifter (grundförbättring + reparation/underhåll)
   är bara avdragsgilla för ett kalenderår om de **sammanlagt uppgår till minst 5 000 kr**
   det året. Når man gränsen räknas hela beloppet – inte bara delen över 5 000 kr.
2. **Tidsgräns för reparation & underhåll:** försäljningsåret + fem föregående kalenderår.
   Grundförbättringar har ingen tidsgräns.
3. **Eget arbete** är inte avdragsgillt – bara faktiska utgifter.
4. **ROT-avdrag:** bara det belopp ni själva faktiskt betalat räknas. Registrera därför
   beloppet *efter* ROT-avdrag.
5. **Försiktighetsprincip i appen:** reparationer som ligger utanför femårsfönstret räknas
   inte heller in när appen prövar 5 000-kronorsgränsen för det året.

> ⚠️ Appens beräkning är en **uppskattning**, inte skatterådgivning. Kontrollera alltid
> mot Skatteverket innan deklaration:
> [Avdrag för renoveringar och nybyggnad](https://skatteverket.se/f%C3%B6rb%C3%A4ttringsutgifter) ·
> [Grundförbättringar](https://www.skatteverket.se/privat/fastigheterbostad/forsaljningavprivatbostad/forbattringsutgifter/grundforbattringar.4.3f4496fd14864cc5ac9132ac.html)

**Spara alltid originalkvittot** (eller fotot) – Skatteverket kan begära underlag.

## Teknik

- Ren HTML, CSS och JavaScript – inget byggsteg, publiceras direkt via GitHub Pages.
- PWA: kan läggas till på hemskärmen och fungerar offline.
- Fas 1: data och foton sparas i telefonens webbläsare (IndexedDB).

### Filer

| Fil | Ansvar |
|-----|--------|
| `index.html` | Sidans struktur |
| `styles.css` | Utseende |
| `js/app.js` | Gränssnitt och navigering |
| `js/store.js` | Lagring av kvitton (byts mot Supabase i fas 2) |
| `js/tax.js` | Avdragsberäkning enligt reglerna ovan |
| `js/image.js` | Förminskning av foton före lagring |
| `js/csv.js` | Export till CSV (öppnas i Excel) |
| `sw.js`, `manifest.webmanifest` | PWA: offline och hemskärmsikon |

## Köra lokalt

```bash
python3 -m http.server 8000
```

Öppna sedan http://localhost:8000.
