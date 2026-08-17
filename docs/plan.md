# Plan: Portfolio ↔ Weltmarkt-Analyse

Stand: 2026-08-17. Konzeption abgeschlossen.
**Status: Umsetzung STARTET.** Go-Befehl am Ende des Dokuments.
**Design (Optik) noch NICHT definiert.** Funktional zuerst, Optik zuletzt.

## Ziel (korrigiert)

Nicht „wie gut bildet mein Portfolio ab" (reine Diagnose), sondern:

> Tool errechnet den aktuell besten Plan, um den Weltmarkt (unsere Definition) abzubilden.
> Input = Ist-Portfolio, Output = Ziel-Gewichtung + Delta (Umschichtung).

## Umfang (beschlossen)

- **Multi-ETF Pflicht.** Single war Spezialfall. Ganzes Portfolio, aggregiert.
- **Input:** ETFs + aktuelles Geld (€) ODER Anteile drin. Tool normalisiert zu Gewichten.
- **Output:** optimale Ziel-Gewichtung je ETF + Ist vs. Ziel + konkrete €-Umschichtung.
- **Stufen:** A = Umschichten vorhandener ETFs (V1-Kern). B = fehlende ETFs vorschlagen (später obendrauf).

## Fundament: Weltmarkt-Definition

Zwei orthogonale Dimensionen.

### Dimension A: Gewichtung (3 Modelle)

| Modell | Bedeutung | US-Gewicht |
|---|---|---|
| Free-Float-Marktkapitalisierung | investierbarer Markt (Standard, MSCI ACWI IMI) | ~62–64% |
| Nominal-GDP | Wirtschaftsleistung | 25.9% |
| GDP-PPP | kaufkraftbereinigt | 14.8% |

Default: **Marktkapitalisierung**. GDP + PPP als Toggle.

### Dimension B: Universum (Index-Umfang)

- MSCI World (nur Industrieländer) · MSCI ACWI (+Schwellenländer) · MSCI ACWI IMI (all-cap)
- Default: **MSCI ACWI IMI**.

## Rechenkern

Tool kennt Länder-Zusammensetzung jedes ETFs. Löst Gewichte `w_1..w_n`:

- Minimiere quadratische Abweichung: `Σ_i (Σ_j w_j · Länder_i(ETF_j) − Benchmark_i)²`
- Nebenbedingungen: `Σ w_j = 1`, `w_j ≥ 0` (kein Short).
- Konvexes Optimierungsproblem, sauber lösbar (`scipy.optimize`/`cvxpy`).

Ergänzende Metriken:
- **Active Share:** `AS = ½ · Σ|w_i^ETF − w_i^B|` → Deckungs-Score = 1 − AS.
- **Per-Land-Drift:** `Δ_i = w_i^ETF − w_i^B`.

## Info-Katalog (V1 vs. Stufe 2)

**V1-Pflicht (alle cheap, Daten in Holdings):**
1. Deckungs-Score (Ring/Gauge)
3. Ziel-Gewichtung je ETF, Ist vs. Ziel (divergierende Balken)
4. Umschichtungs-Plan in € (Tabelle + Wasserfall)
5. Länder-Drift Ist vs. Benchmark (divergierender Bar Chart)
6. Top Über-/Untergewichte (gerankte Liste)
7. Fehlende Länder (Tags/Liste)
8. Regionen-Rollup (Donut)
10. Sektor-Drift (Bar Chart)

**Stufe 2 (medium, extra Datenquelle):**
9. Weltkarte Choropleth · 12. Tracking Error · 13. Konzentration · 14. gewichtete TER · 15/16. Zeit-Verlauf.

## Daten-Pipeline

1. ISIN/WKN → ETF auflösen
2. Holdings + Länder-/Sektorgewichte ziehen
3. Benchmark-Ländergewichte (statisch, regelmäßig aktualisiert)
4. Optimierung → Ziel-Gewichtung
5. Vergleich → Tabelle/Chart

**Hürde (größtes Risiko):** ISIN → Ländergewichte. yfinance reicht für Preise, aber
Ländergewichte für globale ETFs nur grob. Kandidaten: iShares/BlackRock-API (kostenlos,
nur iShares), justETF (Scraping), SEC-NPORT (nur US, heavy).
**Geplant: Spike zuerst** an 3–5 Beispiel-ETFs (IWDA, EM, Small-Cap, All-World),
bevor UI investiert wird.

## Daten-Spike (Ergebnis, 2026-08-17)

Getestet: 8 ETFs (iShares×3, SPDR, Vanguard, Xtrackers, UBS), 4 Quellen, nur curl.

### extraETF (technisch ideal, rechtlich blockiert)

- Eine Quelle für ALLE Anbieter: iShares, Vanguard, SPDR, Xtrackers, Amundi (u.v.m.).
- Volle Länderliste (32-56 Länder je ETF), nicht Top-N.
- Volle Sektorliste (11 GICS-Sektoren) + Regionen-Rollup (6 Regionen).
- Deutsche Namen + ISO-Codes + präzise Werte (z.B. 71.79333%).
- Zugriff: `GET extraetf.com/de/etf-profile/<ISIN>` → `<script id="frontend-state" type="application/json">` parsen.
- Kein Key, keine Session, kein AJAX. Server-rendered.
- Daten-Datum verfügbar (`index_date_last_update`).
- Interne API `/api-v2/detail/?isin=<ISIN>` liefert Metadaten (TER, NAV, Anbieter), aber NICHT die Exposure-Daten. Länder/Sektoren nur im HTML-`frontend-state`.

| ETF | Länder | Sektoren | Σ |
|---|---|---|---|
| IWDA (iShares) | 32 | 11 | 99.50% |
| Vanguard FTSE All-World | 54 | 11 | 99.95% |
| SPDR ACWI IMI | 56 | 11 | 99.85% |
| Xtrackers MSCI World | 32 | 11 | 99.68% |
| Amundi MSCI World Swap | geprüft | - | - |

- ⚠ **RECHTLICH BLOCKIERT (AGB geprüft, 2026-08-17):** extraETF = Isarvest GmbH, München. AGB §4.4: Content nur für private Zwecke, Weitergabe an Dritte/kommerzielle Nutzung nur mit schriftlicher Genehmigung. AGB §4.5 wörtlich: „Insbesondere ist eine automatisierte Abfrage der von extraETF bereitgestellten Inhalte ohne ausdrückliche schriftliche Genehmigung in jeglicher Form nicht zulässig."
- Technisch ideal, rechtlich ohne Genehmigung nicht nutzbar.

### justETF (Scraping)

- Breite UCITS-Abdeckung: alle 5 getesteten ETFs (iShares/SPDR/Vanguard/UBS) vorhanden.
- Server-rendert: Top-5 Länder + Top-4 Sektoren + „Sonstige", Top-10 Holdings, Stichtag.
- „Mehr anzeigen" (Wicket-AJAX, braucht Session+Referer) erweitert nur auf Top-10 Länder + „Sonstige".
- Zu grob für Optimierung: Benchmark ACWI IMI hat 26,5% „Sonstige" (Top-5). Residuum zu groß.
- Wert: liefert iShares-PortfolioId (Issuer-Link `/produkte/<id>`) → Schlüssel für iShares-API.

### iShares/BlackRock API v2 (Backup, Cross-Check)

- Endpoint: `GET /varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data?component=holdings.all&portfolioId=<id>&locale=en_GB&asOfDate=<YYYYMMDD>`
- Öffentlich, kein API-Key, JSON, expliziter asOfDate.
- Volle Einzelwerte pro Position: `countryOfRisk`, `sectorName`, `holdingPercent`.
- Aggregation = exakte volle Länder-/Sektorgewichte.

| ETF | Holdings | Länder | Σ |
|---|---|---|---|
| IWDA (MSCI World) | 1313 | 23 | 100.01% |
| EM IMI | 3371 | 35 | 98.13% |
| World Small Cap | 3575 | 27 | 100.21% |

- Limitation: nur iShares-Fonds. Non-iShares → Fallback justETF (Top-10) oder Issuer-API.
- ⚠ **BlackRock-ToS geprüft (2026-08-17):** „Diese Website ist nur für Ihren persönlichen und internen Gebrauch bestimmt und darf nicht zu kommerziellen Zwecken benutzt werden." + „Jegliche Vervielfältigung von Informationen oder Daten ... erfordert die vorherige Genehmigung." Gleiches Muster wie extraETF: privat okay, kommerziell nur mit Genehmigung.

### fundinfo.com Factsheet

- Nur Regionen + Sektoren + Top-10. Keine Ländergewichte. Unbrauchbar.

### ISIN → portfolioId

- justETF-Profilseite → Issuer-Link enthält PortfolioId.
- Verifiziert: IWDA 251882, EM IMI 264659, World Small Cap 296576.

### Benchmark-Quelle (offen, Empfehlung)

- Benchmark statisch kuratiert (wie Plan vorsieht).
- Empfehlung: iShares-MSCI-ACWI(-IMI)-Proxy-ETF via derselben API einmal ziehen + speichern. Alternative: MSCI-Factsheet (PDF/Excel).
- GDP/PPP-Toggles = statische World-Bank-Tabellen (unabhängig, im Plan).

### Kleinkram (aus Spike, offen)

- Restposten normalisieren („-", Cash; EM IMI Σ98.13%).
- Deutsche Länder-/Sektornamen: API `locale=de_DE` + `targetSite=ishares-de` prüfen.
- asOfDate: neuesten Stichtag automatisch ermitteln (ohne festes Datum).
- Exakte iShares-ACWI-IMI-ISIN für Benchmark-Proxy festlegen (IE00BDQZMX67 ist UBS, nicht iShares).

## Tech-Stack (beschlossen, tentativ)

**Next.js (Frontend) + TypeScript (Rechenkern + Serverless Functions).**

Deployment (b): alles auf Netlify. Rechenkern (kleines NNLS/QP + Metriken) wird in
TypeScript portiert. Datenzugriff über Netlify Functions (fetch + cheerio).

**Fallback:** zwingt der Daten-Spike Python (z.B. justETF-Anti-Scraping), wechseln
wir auf (a): FastAPI-Service separat (Railway/Render/Fly), Netlify nur Frontend.

## Deployment (beschlossen, tentativ)

**Netlify, alles TypeScript** (Serverless Functions + statisch). Ein Deployment.
Fallback (a): separater Python-Service, falls Spike Python erzwingt.
Kein Deploy vor V1-Funktion.

## Referenzdaten (World Bank 2023)

| Land | Nominal-GDP | GDP-PPP | Marktkap. (gelistet) |
|---|---|---|---|
| USA | 25.9% | 14.8% | 47.6% |
| China | 17.0% | 18.9% | 10.6% |
| Japan | 4.1% | 3.5% | 6.0% |
| Deutschland | 4.3% | 3.2% | 2.1% |
| Indien | 3.3% | 7.5% | 4.2% |
| UK | 3.2% | 2.2% | ~2.5% |

⚠ **Inkonsistenz:** „Marktkap. (gelistet)" = Full Market Cap, nicht Free-Float.
Default (MSCI ACWI IMI) nutzt Free-Float, US ≈ 62-64%. Tabelle als Benchmark-Quelle
unbrauchbar. Freifloat-Gewichte kommen aus dem Daten-Spike (MSCI-Factsheet oder Proxy-ETF).

## Offen

1. Design/Optik (bewusst offen, zuletzt)
2. **Datenquelle-Entscheidung:** extraETF-Genehmigung anfragen (Mail-Entwurf: docs/anfrage-extraetf.md) vs. Lizenzdaten
3. Benchmark-Quelle finalisieren (SPDR-ACWI-IMI via extraETF vs. MSCI-Factsheet)
4. ToS-Ergebnis (geprüft): extraETF UND BlackRock: privat okay, kommerziell nur mit Genehmigung. Keine freie öffentliche API für markenübergreifende Ländergewichte.
5. ETF-Preise (€-Umschichtung): separate Quelle (Yahoo/yfinance)

## Skills

- `stock-market-pro` — installiert + gefixt. Yahoo-Finance-Daten (Preise), kein API-Key.
- `llmquant-portfolio-lab` — Stub ohne Daten-API, nutzlos. Rechenlogik selbst bauen.

## Go-Befehl (neue Session)

```
Projekt: /home/rin/Work/_private/finance (Portfolio ↔ Weltmarkt-Analyse-App). Umsetzung startet jetzt.

1. Lies docs/plan.md KOMPLETT. Vollständige Quelle: Umfang, V1-Katalog, Rechenkern,
   Daten-Spike-Ergebnisse, Deployment-Entscheidung, ToS-Lage.
2. Was gilt:
   - Multi-ETF. Input €/Anteile. Output Ziel-Gewichtung + Delta + €-Umschichtung.
     Stufe A zuerst (vorhandene ETFs umschichten), Stufe B (fehlende ETFs vorschlagen) später.
   - Datenquelle primär: extraETF (privat nutzbar, alle Anbieter, volle Länder/Sektoren/
     Regionen, Zugriffsdetails im Spike-Abschnitt). Backup: iShares-API.
   - Benchmark: MSCI ACWI IMI Default, Toggle Marktkap/GDP/PPP. Benchmark statisch cachen.
   - Deployment: Netlify, alles TypeScript (Next.js + Netlify Functions). Rechenkern in TS.
3. Privates Tool, KEINE öffentliche Website geplant. extraETF-Anfrage läuft, blockiert nichts.
4. Arbeitsweise: bottom-up, plan-driven. Erst Datenpipeline + Rechenkern + Tests, dann UI.
   Optik bewusst offen (Design zuletzt). Keine Commits ohne explizite Aufforderung.
   Kleinste Diffs, bestehende Konventionen. Kommunikation Deutsch, Caveman.
5. V1-Reihenfolge:
   (1) Projekt-Scaffold (Next.js + TS, Netlify-ready)
   (2) Daten-Pipeline: extraETF ISIN → Länder/Sektoren/Regionen als Serverless Function
       + Caching. Kurz verifizieren, dass Endpoints noch funktionieren (Spike-ETFs).
   (3) Benchmark-Tabelle generieren + statisch ablegen (SPDR ACWI IMI, Marktkap-Modell;
       GDP/PPP-Tabellen aus World-Bank-Daten vorbereiten)
   (4) Rechenkern in TS: konvexe Optimierung (Σw=1, w≥0) + Active Share, Länder-Drift,
       Sektor-Drift. Tests gegen die 5 Spike-ETFs mit bekannten Werten.
   (5) Minimale UI mit V1-Katalog (Deckungs-Score, Ziel-Gewichtung, Umschichtungs-Plan,
       Länder-Drift, Top Über/Untergewichte, fehlende Länder, Regionen, Sektoren).
   (6) Handoff-Notizen in docs/CHANGELOG.md, Zwischenstand in docs/plan.md.
6. Starte mit Schritt 1 + 2. Nicht neu nachfragen, direkt umsetzen.
```
