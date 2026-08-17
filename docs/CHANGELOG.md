# Changelog

## 2026-08-17 — Test-Session (3 Subagenten) + 4 Bugfixes + Gold raus aus der Optimierung

Drei parallele Test-Subagenten (Daten / Rechenkern / UI) mit RIns echtem
Portfolio (6 ETFs, 9 030 €, 255 €/Monat). Tests 44 → **127** (+30 Live-Tests
mit `RUN_LIVE`-Gate). Alle Befunde vom Orchestrator gegengeprüft.

### Bugfixes

- **projectSimplex (schwer):** `optimize.ts:145` — theta nutzte die Gesamtsumme
  statt der Teilsumme der rho größten Elemente (Duchi). Folgen: Σw=1.0023,
  +21 € Schieflage in der Umschichtungs-Tabelle, Sparplan „Lücken füllen"
  (GDP/PPP/Blend) Kauf-Liste nur 142 € statt 255 €. Gegenbeispiel im Test
  verankert (`[1, 0.5, -0.5] → [0.75, 0.25, 0]`).
- **ongoingCharges (TER) immer null:** extraETF liefert `ongoing_charges` als
  String (`'0.20'`), `num()` (extraetf.ts) akzeptierte nur numbers. Jetzt
  werden numerische Strings geparst. Relevant für TER-Tausch-Regeln.
- **Stale-Treppe:** `page.tsx selectView` rechnete beim Wechsel zurück zu
  „Bestand" nicht neu → Sparplan-Treppe blieb stale sichtbar. Jetzt rechnet
  der Wechsel in beide Richtungen neu.
- **Gold raus aus der Optimierung (RIn-Entscheidung):** Gold + Einzelaktien
  (keine Länder-Exposure) werden NICHT mehr gegen den Aktien-Weltmarkt
  optimiert. Neu: `isEquityEtf()` in `optimize.ts`. Optimierung + Drift +
  Scores laufen nur über den Aktien-Teil (normalisiert); Nicht-Aktien-Werte
  bleiben unverändert (Ist = Ziel, Δ = 0). Sparplan: Gold-Flow bleibt fix
  (25 €), Aktien-Flows (230 €) werden verteilt; p(1)-Metrik nur Aktien-Teil.
  `suggestReplacement` tauscht nie Nicht-Aktien-Werte. Nur-Gold-Portfolio →
  klarer Fehler. Gold-Baustein mit Ziel-Gewicht (RIn: „wann anders").
  **Achtung Semantik-Änderung:** Deckungs-Scores messen jetzt den Aktien-Teil
  (Sparplan-Ist heute 74.2 % statt 69.4 % — ohne Gold-Flow im Score).
- **Solver-Plateau (Befund, kein Fix):** marketcap/gdp erreichen tol=1e-10
  bei RIns Portfolio nicht (fast identische ETFs World/Prime All Country →
  flache Zielfunktion, conv=false bei 10k Iter.). Werte sind trotzdem korrekt
  (Σw=1, ΔΣ=0, Gold 0); Grid-Search bestätigt. Kandidat für später: FISTA
  oder KKT-Stopp-Kriterium.

### Test-Befunde (Daten-Ebene)

- Alle 6 ISINs liefern saubere Daten (Länder/Sektoren/Regionen, Summen
  99.0–99.96 %). Stichtage aktuell außer Xtrackers EM (2026-05-31, 78 Tage
  alt — Quellen-Verzug, Transparenz-Thema).
- Gold-ETC: extraETF liefert 0 Exposures; `asset_allocation_exposure`
  (Gold 100 %) wird nicht gelesen; `asOfDate` 2014-11-30 = Fondsdatum, kein
  Exposure-Stichtag — fließt ungefiltert rein. Befund, kein Fix.
- Cache: TTL 7 Tage verifiziert, korrupte Datei selbstheilend, 400/404/502
  sauber.
- Neue Tests: `cache.test.ts` (12), `live-extraetf.test.ts` (30, RUN_LIVE),
  `benchmark-models.test.ts` (10), `portfolio-real.test.ts` (25),
  `savings-real.test.ts` (21), extraetf.test.ts 4 → 18.

### Verifikation

- `npm test` 127/127 grün, `npm run lint` sauber, `npx tsc --noEmit` grün.
- Keine Commits (wie immer ohne Aufforderung).

---

## 2026-08-17 — Stufe B (neue ETFs) + Finanzfluss-Styling

Review-Session mit RIn. Stufe B (fehlende ETFs vorschlagen) umgesetzt,
Entscheidungen delegiert (RIn: „bestmögliches Produkt, validierte Zahlen,
ehrliche Kommunikation"). Design auf Finanzfluss-Optik angepasst.

### Stufe B: Entscheidungen (docs/plan-stufe-b.md)

- **Switch „Nur meine ETFs | Mit neuen ETFs"** für beide Views. Default: mine.
- **Nur ergänzen** (add-only), plus separater Tausch-Hinweis.
- **Treppe:** gierige Selektion, max. 3 Stufen, Abbruch < 0,5 pp.
- **Katalog (5):** EM IMI (IE00BKM4GZ66), World Small Cap (IE00BF4RFH31),
  Vanguard FTSE All-World (IE00B3RBWM25), SPDR ACWI IMI (IE00B3YLTY66),
  Amundi Prime All Country World (IE0003XJA0J9). Kriterien: UCITS, TER ≤ 0,4 %,
  Fondsgröße ≥ 500 M€, Auflage ≥ 5 J., physisch bevorzugt.

### Rechenkern

- `src/lib/optimizer/candidates.ts` neu:
  - `suggestAdditions` / `suggestAdditionsSavings`: gierige Selektion über
    geteilten Kern `greedySteps`. Kandidaten gehen mit 0 € / 0 €/Monat ein,
    Optimierer entscheidet die Ziel-Gewichte.
  - `suggestReplacement`: bester Einzeltausch (1 vorhandener → 1 Kandidat).
    Angezeigt nur bei ΔScore ≥ 0,5 pp oder quasi-gleichem Score (Δ < 0,1 pp)
    mit TER-Vorteil ≥ 0,05 pp.
  - `withData`: Katalog + geladene Daten kombinieren (Live-TER bevorzugt).
- `src/data/candidates.ts` neu: statischer Katalog mit Rolle, TER, Index.
- API `GET /api/candidates` neu: alle Kandidaten über extraETF-Pipeline,
  gleicher 7-Tage-Cache. Einzelne Fehlschläge → `failed[]`, Rest wird geliefert.
- Tests: 34 → 44 grün (10 neue: Greedy-Reihenfolge, EM zuerst, max 3 Stufen,
  kein Vorschlag bei vollständigem Portfolio, Kandidat-Überspringen, Tausch-
  Hinweis ja/nein, Savings-Varianten, withData).

### UI

- Toolbar dritte Zeile „ETFs: Nur meine ETFs | Mit neuen ETFs" (localStorage
  `finance.universe.v1`). Kandidaten werden beim ersten Umschalten geladen.
- **Wichtig (Smoke-Test-Befund):** Nur die von der Treppe gewählten Kandidaten
  gehen ins erweiterte Universum, nicht alle 5. Sonst verteilt der PGD-Löser
  Geld redundant auf 3 All-World-ETFs (mehrere gleich gute Optima). Tabelle,
  Treppe und Score zeigen jetzt dieselbe Empfehlung.
- Tausch-Hinweis nur, wenn sein Ziel-ETF nicht eh in der Treppe steht
  (sonst redundant).
- Neue Komponente `StaircaseCard`: Basis-Chip + Stufen-Chips mit
  „+ ETF · TER x % = Score" + Tausch-Hinweis (orange Warn-Chip).
- Badge „neuer ETF" (grüner Chip) in Umschichtungs-Tabelle, Sparplan-Tabelle
  und Kauf-Liste (`RebalancingTable` bekommt `newIsins`-Prop).
- Ist-Analyse (Sparplan) bleibt IMMER ohne Kandidaten: Ist = Realität.
  Vorschlag nutzt erweitertes Universum. Tooltips unterscheiden die Modi.

### Styling (Finanzfluss-inspiriert)

- Palette extrahiert aus finanzfluss.de (CSS-Custom-Properties): Navy-Text
  `#15284b`, Akzent `#4d6bdd` (hover `#4560c7`), Karten weiß Radius 8px mit
  Doppel-Schatten `0 4px 24px rgba(0,0,0,.08), 0 0 2px rgba(0,0,0,.16)`,
  Chips (grün `#e7faf3`/`#b8f0dc`/`#0b8157`, blau `#dde3fc`, orange, rot),
  Drift-Balken indigo/coral, Gauge-Grün `#0b8157`.
- Font: **Outfit** (variabel, self-hosted via `@fontsource-variable/outfit` —
  bleibt hermetic/offlinefähig, kein Google-Fonts-CDN).
- Buttons mit Transitionen, Tabellen mit Zeilen-Hover, Tooltips Navy mit
  Soft-Shadow. Keine Chart-Lib, alles custom CSS/SVG.

### Verifikation

- `npm test` 44/44, `npm run lint`, `npx tsc --noEmit`, `npm run build` grün.
- Browser-Smoke-Test: IWDA-only → 88,1 %; „Mit neuen ETFs" → Treppe
  „+ SPDR ACWI IMI · TER 0.17 % = 99,8 %", Tabelle nur IWDA + SPDR mit
  „neuer ETF"-Badge, Tausch-Hinweis korrekt unterdrückt (Ziel in Treppe).

---

## 2026-08-17 — Sparplan (Stufe 1+2) + Ist-Score + Inline-Edit

Sparplan-Konzept (`docs/plan-sparplan.md`) umgesetzt: Rechenkern direkt, UI per Subagent,
Integration + ehrliche Score-Semantik danach.

### Rechenkern

- `src/lib/optimizer/savings.ts` neu:
  - `analyzeSavings()`: Ist-Analyse des Sparplans. Scores getrennt: `coverageScore`/`activeShare`
    = optimaler Sparplan, `currentCoverageScore`/`currentActiveShare` = Sparplan heute.
    Drift-Karten (Länder/Sektoren/Regionen, Top-Abweichungen, fehlende Länder) zeigen die
    AKTUELLE Aufteilung — ehrliche Ist-Analyse.
  - `proposeSavings()`: Vorschlag, zwei Modi. `benchmark` = Weltmarkt spiegeln
    (||A·w − b||²). `converge` = Lücken füllen, geschlossene Form
    b̂ = ((V+M)·b − V·w0)/M + Simplex-Projektion + Solver; kauft gezielt, was im Bestand
    fehlt. Fallback: ohne Bestand ≡ benchmark. Metriken = p(1), Portfolio nach 1 Monat.
  - Sparrate 0 → Fehler. Vorschlag kann ETFs empfehlen, die noch nicht bespart werden.
- `optimize.ts`: `PortfolioEtf` + optionales `monthlyEur`; `OptimizeResult` +
  `currentCoverageScore`/`currentActiveShare` (Ist-Zustand vor Umschichtung);
  `activeShareBetween` exportiert.
- Tests: 24 → 34 grün (Sparplan: Flow-Analyse, Konvergenz-Vorschlag, Fallback ohne Bestand,
  Projektion negativer b̂, Ist-Score, Ist-Drift).

### UI

- `page.tsx`: View-Toggle „Bestand | Sparplan" (localStorage), Sub-Toggle
  „Weltmarkt spiegeln | Lücken füllen" (Default: Lücken füllen). Sparplan-View =
  Ist-Analyse (gleiche Karten wie Bestand) + Vorschlag (Gauge „nach 1 Monat",
  „Diesen Monat kaufen"-Liste, Sparplan-Änderungs-Tabelle, Länder-Drift nach 1 Monat).
  Live-Reanalyse bei Modell-/View-/Sub-Modus-Wechsel ohne Extra-Klick
  (Klick-Handler-Pattern, kein setState im Effect — React-19-Lint-Regel).
- `PortfolioInput.tsx`: drittes Feld „€/Monat" + **inline editierbare Sparrate je Zeile**
  (`MonthlyCell`, Commit bei Enter/Blur, ungültig → Rücksetzen, Live-Reanalyse).
- Score-Semantik ehrlich gemacht (auf RIn-Frage): Gauge-Labels jetzt explizit
  „Deckungs-Score (nach Umschichtung)" / „Optimaler Sparplan" / „nach 1 Monat",
  neue Metrik „Deckungs-Score heute" / „Sparplan heute" (Ist-Zustand), Tooltips der
  Drift-Karten auf „NACH der Umschichtung" präzisiert.
- `CoverageGauge`: Label + Tooltip als Props konfigurierbar.

### Verifikation

- `npm test` 34/34, `npm run lint` sauber, `npx tsc --noEmit` sauber, `npm run build` grün.
- Browser-Smoke-Test: Toggle-Wechsel, Ist-Analyse (88,1 % → 98,4 % nach Sparraten-Edit),
  Vorschlag mit „neu im Sparplan"-Badge, Inline-Edit mit Live-Reanalyse verifiziert.

---

## 2026-08-17 — Blend-Benchmark + Methodik-Doku + UI-Dashboard

Drei parallele Subagenten (Methodik-Prüfung, Blend-Benchmark, UI-Überarbeitung).

### 4. Benchmark „Blend" (unser Modell)

- `src/data/benchmarks/acwi-imi-blend.json`: statisch generiert, 56 Länder, Summe exakt 1.0.
  Formel je Land: `w = 0.50·w_mc + 0.25·w_gdp_nom + 0.25·w_gdp_ppp`. US = 42.9 %.
- `src/lib/benchmark/index.ts`: `BenchmarkModel` + `'blend'`, `getBenchmark('blend')`,
  `benchmarkModels()` → 4 Modelle. Sektor-/Region-Maps vom Marktkap-Modell übernommen.
- Gewichtungs-Begründung: Marktkap bleibt Anker (einzig investierbar), GDP nom + PPP
  zusammen 50 % „Wirtschafts-Fußabdruck"; 50/25/25 statt ⅓-⅓-⅓ wegen Growth-Trap-Befund
  (Dimson/Marsh/Staunton). Details: `docs/methodology.md` Abschnitt 2.
- Tests: `optimize.test.ts` + 5 Blend-Tests (Modell registriert, Summe = 1, US zwischen
  Marktkap und GDP nominal, `optimize(..., 'blend')` läuft, SPDR vs. Blend > AS als Marktkap).

### Methodik-Doku

- `docs/methodology.md` neu: Abschnitt 1 „Marktkapitalisierungs-Benchmark" — ehrliche
  Prüfung der 6 Shortcut-Fragen (Free-Float korrekt, ETF-Proxy vertretbar mit
  <0.2 pp Verzerrung, 56-vs-47-Länder-Artefakte ≈0.072 %, Skalierung kosmetisch, Stichtag
  quartalsweise reviewen, Factsheet vs. Proxy). Gesamturteil: korrekt begründeter,
  transparenter Shortcut.

### UI-Dashboard (Optik/Interaktivität)

- `src/app/page.tsx` + `globals.css` + `page.module.css`: 2-3-spaltiges CSS-Grid-Dashboard
  statt langer Liste (Score + Top-Deltas oben, Länder/Sektor-Drift + Regionen-Donut Mitte,
  Ziel-Gewichtung + fehlende Länder, Umschichtungs-Tabelle unten), responsiv 1 Spalte mobil.
- Neue Komponenten: `SimpleTooltip` (Laien-Erklärung je Metrik), `RegionDrilldown`
  (Donut-Klick → Länder-Details der Region).
- Interaktivität: Live-Reanalyse bei Benchmark-Wechsel (kein extra Klick), Hover-Tooltips
  in DriftBars/AllocationChart, sortierbare Umschichtungs-Tabelle, klickbarer Donut
  (Segment + Legende, Tastatur).
- `Blend`-Toggle in `MODELS` + `isBenchmarkModel` ergänzt.

### Sparplan-Konzept

- `docs/plan-sparplan.md` neu: Konzept für Sparplan-Analyse + -Vorschlag (Flow vs. Bestand,
  gleiche Optimierung, Stufen 1-4). Kern-Entscheidungen mit RIn getroffen
  (beide Vorschlag-Modi, Default „Lücken füllen", erst getrennte Ansichten).

### Tests

- 19 → 24 grün (5 Blend-Tests). `npm test`, `npm run lint`, `npm run build` grün.

---

## 2026-08-17 — V1-Kern: Datenpipeline + Rechenkern + UI

Erste Umsetzungssession. Schritte 1-5 des Go-Befehls abgeschlossen.

### Scaffold

- Next.js 16.3.1 (App Router, Turbopack), TypeScript 5, ESLint 9, React 19.
- `src/`-Struktur, Import-Alias `@/*`. Kein Tailwind (Optik zuletzt, custom CSS).
- `netlify.toml` (`build`: `npm run build`, `publish`: `.next`). Next.js läuft auf Netlify
  über den automatisch installierten `@netlify/plugin-nextjs`; Route Handler werden zu
  Netlify Functions.
- System-Fonts statt Google-Fonts (Build bleibt hermetic/offlinefähig).

### Daten-Pipeline (extraETF)

- `src/lib/etf/extraetf.ts`: fetch + parse des server-rendered `<script id="frontend-state">`.
  Struktur: Top-Level-numerischer Key → `b.results[0]` → `portfolio_breakdown`.
  - Länder: `country_stocks_exposure_list` (Name, Wert in %, ISO-2-Code)
  - Sektoren: `global_stock_exposure_list` (11 GICS)
  - Regionen: `region_stock_exposure_list` (6-7)
  - Stichtag: `index_date_last_update`
- Endpoint: `GET /api/etf/[isin]` (Route Handler). Validiert ISIN, Fehler 400/404/502.
- **Befund:** Sektor- und Regionen-Codes sind über alle Anbieter konsistent
  (extraETF normalisiert selbst). Kein Mapping nötig.
- **Befund:** extraETF-IWDA-Daten enthalten China/Brasilien/Mexiko (abweichende
  Klassifizierung gegenüber MSCI World). Optimizer spiegelt die gelieferten Daten.
- Alle 5 Spike-ETFs verifiziert (32/54/56/32/32 Länder, Σ 99.5-99.96%).
- Amundi-Swap-ETF liefert trotz `swap=true` volle Exposure-Listen.

### Cache

- `src/lib/etf/cache.ts`: TTL 7 Tage (Env `ETF_CACHE_TTL_HOURS` override).
- Backends: Netlify Blobs (Prod) / lokales Dateisystem `.cache/etf/` (Dev).
- Grund: `@netlify/blobs` wirft im Dev ohne Netlify-Kontext
  `MissingBlobsEnvironmentError`. Cache-Fehler nie fatal, Fallback = Live-Abruf.

### Benchmark-Tabellen (statisch)

- `src/data/benchmarks/`:
  - `acwi-imi-marktkap.json` — SPDR ACWI IMI (IE00B3YLTY66), 56 Länder auf 100% skaliert,
    plus Sektoren + Regionen + MSCI-Split. Stichtag 2026-07-31.
  - `gdp-nominal-2023.json` / `gdp-ppp-2023.json` — World Bank 2023 (NY.GDP.MKTP.CD/.PP.CD),
    Gewichte über das ACWI-IMI-Universum (56 Länder).
- Taiwan fehlt bei World Bank → kuratiert aus IMF WEO April 2024 ergänzt (Notiz im JSON).
  Jersey (0.01%) = Gewicht 0.
- `src/lib/benchmark/index.ts`: Typen + `getBenchmark('marketcap'|'gdp'|'ppp')`.

### Rechenkern

- `src/lib/optimizer/optimize.ts`: konvexe Optimierung (min ||A·w−b||² s.t. Σw=1, w≥0)
  via Projected Gradient Descent + Simplex-Projektion (Duchi et al.), kein externes
  QP/NNLS-Paket.
- **Validierung:** Grid-Search bestätigt globales Optimum (IWDA+Vanguard-Blend
  12.6/87.4 exakt getroffen, Objektiv 6× besser als reines Vanguard).
- Restposten (Cash/Derivate) als explizite `_OTHER`-Position; wird in Zielfunktion
  bestraft (Benchmark-Gewicht 0), damit ein ETF mit großem Rest nicht gut scoret.
- Metriken: Active Share, Deckungs-Score (1−AS), Länder-/Sektor-Drift,
  Top Über-/Untergewichte, fehlende Länder, Regionen-Rollup, €-Umschichtung.
- Tests: Vitest. 19 Tests grün (Parser 4, Optimizer 15).

### UI (funktional, Optik offen)

- Eine Seite (`src/app/page.tsx`): ISIN+€-Input, Portfolio-Tabelle, Benchmark-Toggle,
  Analysieren-Button.
- V1-Katalog komplett: Deckungs-Score (Gauge), Ziel-Gewichtung (Ist→Ziel-Balken),
  Umschichtungs-Plan (Tabelle), Länder-Drift, Top Über/Untergewichte, fehlende Länder,
  Sektor-Drift, Regionen-Donut. Custom SVG/CSS, keine Chart-Lib.
- Persistenz: Portfolio + Benchmark-Modell in `localStorage`
  (`src/lib/hooks/useLocalStorageState.ts`, Mount-Pattern + `storage`-Event, tab-synchron).

### Offen (nächste Session)

1. **Preise für Anteile-Input** (Offener Punkt 5 im Plan): V1 arbeitet mit €-Werten.
   Anteile → € braucht Kursquelle (Yahoo/yfinance via `stock-market-pro`).
2. extraETF-Genehmigung (Mail-Entwurf `docs/anfrage-extraetf.md`) — läuft, blockiert nichts.
3. Design/Optik (bewusst zuletzt).
4. Stufe B: fehlende ETFs vorschlagen.
5. Benchmark-Aktualisierung automatisieren (Skript statt manuell).
