# Plan: Stufe B — Fehlende ETFs vorschlagen

Stand: 2026-08-17. Status: in Umsetzung.

## Ziel

Wenn das aktuelle ETF-Set den Weltmarkt nicht vollständig abbilden kann
(„Optimaler Sparplan" / „Deckungs-Score nach Umschichtung" < 100 %), soll das
Tool ergänzende ETFs vorschlagen — mit validierten Zahlen und ohne Jargon.

## Entscheidungen (Agent, validiert mit RIn-Auftrag „bestmögliches Produkt")

### 1. Modus: Switch „Mit meinen ETFs" / „Mit neuen ETFs"

Ein Schalter für beide Views (Bestand + Sparplan):

- **„Mit meinen ETFs"** (Default): nur vorhandene ETFs. Optimierer arbeitet wie bisher.
- **„Mit neuen ETFs"**: erweitertes Universum inkl. Kandidaten-ETFs. Optimierer
  verteilt €/€-Monat auf vorhandene + neue ETFs. Neue ETFs zeigen „neuer ETF"-Badge.

### 2. Ergänzen vs. Tauschen

**Nur ergänzen** (add-only) in der Optimierung. Ein separater **Tausch-Hinweis**
unter den Ergebnissen zeigt, wenn ein Einzeltausch eines vorhandenen ETFs den
Score gleich oder besser macht bei weniger ETFs. Tausch ist kein eigener Modus,
sondern eine ehrliche Ergänzung.

### 3. Treppe (Staircase)

Statt alle Kandidaten auf einmal anzubieten: **gierige Selektion** mit bis zu 3
Stufen. Jede Stufe wählt den Kandidaten, der den Deckungs-Score am stärksten
erhöht (z.B. „+ EM IMI → 98.3 %, + Small Cap → 99.1 %").

Abbruch bei Verbesserung < 0,5 Prozentpunkte (diminishing returns).

### 4. Kandidaten-Auswahl

**Kriterien:** UCITS, TER ≤ 0,4 %, physisch bevorzugt, **thesaurierend (Acc)**,
Fondsgröße ≥ 500 M€, Auflage ≥ 5 Jahre. Dist nur, wenn keine Acc-Klasse
unter 0,4 % TER existiert. Bei fast gleichem Deckungs-Zugewinn gewinnt
die niedrigere TER.

**Katalog (23 ETFs):** Ursprung 5 plus Acc-Bausteine in
`src/data/candidates.ts`. Dist-Anteilsklassen durch Acc ersetzt
(VWCE, VFEA, iShares Europe Acc, FTSE 100 Acc). Kanada bleibt Dist.

### 5. Kandidaten-Daten

Existierende extraETF-Pipeline (`/api/etf/[isin]`) mit Cache (7 Tage).
API-Route `/api/candidates` liefert alle Kandidaten-Daten als JSON.
Die Route cached pro ISIN wie der normale ETF-Endpoint.

## Rechenkern

`src/lib/optimizer/candidates.ts`:

- `suggestAdditions(etfs, candidates, model)` → `{ baseScore, steps: {isIn, name, ter, score}[] }`
  Greedy, ≤ 3 Schritte, Abbruch bei Δ < 0,005.
- `suggestReplacement(etfs, candidates, model)` → `{ fromIsin, fromName, toIsin, toInfo, scoreAfter } | null`
  Prüft jeden vorhandenen ETF gegen alle Kandidaten. Zeigt nur, wenn ΔScore ≥ 0 bei
  gleicher oder geringerer ETF-Anzahl.

## UI-Integration

- Switch in der Toolbar (Segmented Control, analog Benchmark-Toggle). Zustand:
  `useLocalStorageState('universe', 'mine')`.
- Bestand-View: erweiterte Allokation in `allocations` + neue ETFs als Zeilen mit
  Badge „neuer ETF". Treppen-Karte unter dem Score. Tausch-Hinweis-Karte (wenn zutreffend).
- Sparplan-View: analog in Vorschlag-Sektion (extends `proposeSavings` mit Kandidaten).
  Kauf-Liste zeigt neue ETFs mit Badge. Treppen-Karte + Tausch-Hinweis.

## Styling (Finanzfluss-inspiriert)

Siehe separater Styling-Pass. Badges als farbige Chips (grüner Hintergrund
`#e7faf3`, grüner Text `#0b8157`, Rand `#b8f0dc` für „neuer ETF").

## Tests

- Greedy-Selektion: korrekte Reihenfolge, Abbruch bei Δ < 0,005, Max 3 Schritte.
- Tausch-Hinweis: kein Vorschlag wenn Score gleich, korrekte ISIN-Paare.
- Integration: `optimize` mit Kandidaten im erweiterten Set liefert höheren Score.
- Smoke: SPDR via extraETF am Marktkap-Benchmark → kein Additions-Vorschlag (Δ ≈ 0).