# Finny · by vocina

Web app per le finanze personali. Carichi l'estratto conto (CSV, Excel o PDF) e Finny lo legge **dentro il browser**: categorie di spesa, abbonamenti, budget, previsioni e consigli della "vocina", ognuno con la sua fonte.

Non c'è un server: i movimenti restano nel database locale del browser (IndexedDB).

## Avvio

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # test di parser, categorie e analisi
npm run build      # build statica in dist/, pubblicabile su qualsiasi hosting
```

## Pubblicare su Netlify

`netlify.toml` imposta la build (`npm run build`, cartella `dist`, Node 22). Gli header di sicurezza stanno in `public/_headers`, che finisce dentro `dist`: valgono quindi con entrambi i metodi. La Content Security Policy impedisce alla pagina di caricare script esterni e di inviare dati a qualsiasi server (`connect-src 'self'`).

**Con GitHub (consigliato, si aggiorna a ogni push):** su Netlify, *Add new site → Import an existing project → GitHub*, scegli il repository e il branch da pubblicare. Build command e publish directory vengono letti da `netlify.toml`.

**Senza GitHub:** `npm install && npm run build`, poi trascina la cartella `dist` su [app.netlify.com/drop](https://app.netlify.com/drop).

## Cosa fa

| Sezione | Contenuto |
|---|---|
| **Panoramica** | Saldo totale (se l'estratto lo riporta), entrate/uscite/risparmio del mese con variazione, i consigli della vocina, flusso di cassa su 12 mesi, categorie, prossimi addebiti, ultimi movimenti |
| **Movimenti** | Ricerca, filtri per tipo/conto/categoria, dettaglio con causale originale, ricategorizzazione con regola ("applica a tutti i movimenti di…") |
| **Analisi** | Medie 3/6/12 mesi, ritmo di spesa del mese contro la media, ripartizione 50/30/20, variazione per categoria, giorno della settimana più caro, esercenti principali, tutti i consigli |
| **Ricorrenti** | Abbonamenti, spese fisse e risparmio automatico rilevati da soli, calendario dei prossimi 30 giorni, rincari |
| **Budget** | Budget mensili per categoria con anello di avanzamento, ritmo ideale del mese, proposte automatiche dalla media degli ultimi 3 mesi |
| **Importa** | Drag & drop, rilevamento automatico delle colonne (modificabile), anteprima, deduplica sui reimport |
| **Collega conto** | Spiega cosa richiede davvero l'open banking PSD2, con un diagramma e una simulazione |
| **Impostazioni** | Tema, backup/ripristino JSON, conti, regole apprese, cancellazione dati |

### Formati supportati

- **CSV**: separatore `;` `,` tab o `|`, codifica UTF-8 o Windows-1252, righe di preambolo prima dell'intestazione, importo unico con segno oppure colonne Dare/Avere (Addebiti/Accrediti, Uscite/Entrate), date `gg/mm/aaaa`, ISO, `gg mese aaaa`. Gli export in stile Revolut (colonne `State` e `Fee`) sono gestiti.
- **Excel `.xlsx`**: stesse regole del CSV. Il vecchio formato `.xls` non è supportato: salvalo come `.xlsx` o CSV.
- **PDF (beta)**: solo PDF con testo selezionabile (non scansioni). Il segno si ricava dalle colonne Dare/Avere se presenti, altrimenti dal segno scritto o dalle parole della causale; l'anteprima permette di correggerlo riga per riga.

## Architettura

```
src/
  lib/
    parse/        values.ts (date, importi) · table.ts (intestazione e colonne) · readers.ts (CSV/XLSX) · pdf.ts
    categorize.ts dizionario di esercenti italiani, pulizia dei nomi, regole utente
    analytics.ts  statistiche mensili, categorie, 50/30/20, ricorrenti, previsione
    insights.ts   i consigli della vocina, con fonte dove serve
    demo.ts       12 mesi di dati di esempio, generati in modo deterministico
  store/          stato (zustand) + persistenza IndexedDB
  components/     shell, grafici SVG animati, vocina, primitive UI
  pages/          una vista per sezione, caricate on demand
```

Stack: Vite, React 19, TypeScript, Tailwind CSS 4, Motion, pdf.js, read-excel-file, Papa Parse.

### Design

- Tema scuro "inchiostro" con accento ottone, tema chiaro e automatico. Tutti i colori sono token CSS in `src/index.css`.
- La palette dei grafici (verde acqua, rame, viola) è validata per daltonismo e contrasto su entrambe le superfici.
- Ogni grafico ha una vista "Tabella" equivalente. Legenda sempre presente con due o più serie, tooltip al passaggio del mouse e da tastiera.
- Animazioni: intro del marchio, transizioni tra pagine, numeri che contano, grafici che si disegnano, bordi che si illuminano sotto il puntatore, tilt 3D, pulsanti magnetici, palette comandi `⌘K`. Tutto si riduce da solo con "Riduci movimento" attivo nel sistema.

## Collegare il conto: stato attuale

Il collegamento automatico **non è attivo** e l'app lo dice chiaramente. Per leggere i conti di altre persone in UE serve un prestatore di servizi di informazione sui conti (AISP) autorizzato ai sensi della PSD2, oppure un contratto con un fornitore che lo è. Serve anche un piccolo backend, perché le chiavi API del fornitore non possono stare nel browser. Il consenso dell'utente va rinnovato ogni 180 giorni.

Per attivarlo servono:
1. un contratto con un fornitore AISP europeo;
2. una funzione serverless che crei la sessione di consenso e scarichi i movimenti;
3. un adattatore che trasformi la risposta nel tipo `DraftTx` (`src/lib/parse/table.ts`) e la passi a `importDrafts` dello store. Il resto dell'app (categorie, analisi, deduplica) funziona già così.

Nota: GoCardless Bank Account Data (ex Nordigen), l'opzione gratuita più usata dagli sviluppatori indipendenti, non accetta nuove iscrizioni da luglio 2025.

## Fonti

- Regola 50/30/20: E. Warren, A. Warren Tyagi, *All Your Worth: The Ultimate Lifetime Money Plan*, 2005.
- Fondo emergenza: Banca d'Italia, portale *Economia per tutti*, "Risparmiare e pianificare: l'importanza della prevenzione…".
- PSD2: [Direttiva (UE) 2015/2366](https://eur-lex.europa.eu/eli/dir/2015/2366/oj).
- Rinnovo del consenso a 180 giorni: [Regolamento delegato (UE) 2022/2360](https://eur-lex.europa.eu/eli/reg_del/2022/2360/oj/eng).
- GoCardless Bank Account Data, nuove iscrizioni sospese: [bankaccountdata.gocardless.com/new-signups-disabled](https://bankaccountdata.gocardless.com/new-signups-disabled).

## Limiti noti

- La categorizzazione è a regole e parole chiave: copre bene i grandi esercenti italiani, meno i negozi locali. Le correzioni diventano regole e valgono per i prossimi import.
- I movimenti in valuta estera vengono importati con il loro importo, senza conversione.
- I PDF hanno impaginazioni diverse per ogni banca: se l'anteprima non torna, CSV ed Excel sono più affidabili.
- I dati vivono in un solo browser. Per usarli su un altro dispositivo serve il backup JSON.
