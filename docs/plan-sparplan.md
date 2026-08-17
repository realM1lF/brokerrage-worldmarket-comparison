# Plan: Sparplan-Analyse + Sparplan-Vorschlag

Stand: 2026-08-17. **Status: Stufe 1+2 umgesetzt** (Rechenkern + UI, 34 Tests grün).
Stufe 3 (Konvergenz-Prognose) offen. Details: `docs/CHANGELOG.md`.

## Ziel (O-Ton)

> Portfolio kann groß sein (Bestand), aber man bespart ja anders (Sparplan).
> (1) Aktuellen Sparplan angeben und analysieren.
> (2) Vorschlag für den perfekten Sparplan, je nach gewähltem Modus
>     (Marktkap / GDP / PPP / Blend).

## Grundsätze (mit RIn beschlossen)

- Der Nutzer ist Laie bei Finanzdaten: jede Ansicht muss ohne Jargon verständlich sein.
- Jede Empfehlung muss datenfundiert sein (keine Bauchentscheidungen — immer Rechnung dahinter).
- Priorität: Mehrwert für den Nutzer vor Features. Lieber eine klare Aussage als drei verwirrende.

## Konzept: Bestand vs. Flow

| | Bestand | Sparplan |
|---|---|---|
| Einheit | € (heute) | €/Monat (laufend) |
| Charakter | darf umgeschichtet werden (Kauf + Verkauf) | nur Käufe, kein Verkauf |
| Optimierung | Ziel-Gewichte + €-Umschichtung (existiert) | optimale monatliche Aufteilung |
| Perspektive | Momentaufnahme | Konvergenz über Zeit |

Beide Welten nutzen **dieselbe Optimierung**: `min ||A·w − b||² s.t. Σw=1, w≥0`.
Nur die Interpretation von `w` ändert sich (€-Gewichte → €/Monat-Gewichte).
Der bestehende PGD-Solver (`src/lib/optimizer/optimize.ts`) ist direkt wiederverwendbar.
Buy-only ist automatisch erfüllt: `w ≥ 0` ist Teil der Nebenbedingungen.

## Fundament (bottom-up)

1. **Daten:** keine neue Datenquelle. ETF-Länder/Sektoren/Regionen (extraETF, vorhanden)
   + Benchmark-Modelle (Marktkap/GDP/PPP/Blend, vorhanden). Sparplan-Input = €/Monat je ETF.
2. **Rechenkern:** keine neue Numerik. Zwei zusätzliche Problemstellungen, beide konvex:

   - **F2a (Sparplan benchmark-treu):** `w` = optimale Monats-Gewichte gegen Benchmark `b`.
     Identisch zur heutigen Ziel-Gewichtung, nur als €/Monat interpretiert.
     Antwort auf: „Wie würde ein perfekter Sparplan aussehen, wenn ich nur den Benchmark
     abbilden will?"
   - **F2b (Konvergenz mit Bestand):** Portfolio nach k Monaten:
     `p(k) = (V·w0 + k·M·s) / (V + k·M)`, mit V = Bestandswert, w0 = Ist-Gewichte,
     M = Monatsrate, s = Sparplan-Gewichte (gesucht).
     Minimiere `||p(k) − b||²` über s. Konvex in s, gleicher Solver.
     Geschlossene Form für den 1-Monats-Fall: `ŝ = ((V+M)·b − V·w0)/M` — Summe = 1;
     falls `ŝ ≥ 0` komponentenweise, ist `s* = ŝ` die exakte Lösung (Simplex-Projektion sonst).
     **Grenzfall k→∞: s* → b.** Der langfristig optimale Sparplan ist immer der
     Benchmark — deshalb sind (F2a) und (F2b) keine Konkurrenten, sondern dieselbe
     Antwort auf zwei Zeithorizonte.

3. **Metriken (alle mit vorhandener Metric-Stack-Mechanik umsetzbar):**
   - **F1 Sparplan-Drift (Ist):** Active Share / Deckungs-Score / Länder-/Sektor-/
     Regionen-Drift des Flows gegen Benchmark. `s/Σs` durch die bestehende
     Drift-/Active-Share-Logik jagen (neue Funktion, gleiche Helfer).
   - **F3 Konvergenz-Prognose:** Drift(t) = `½·Σ|p(k)_i − b_i|` für k = 1..N Monate.
     Deterministische lineare Algebra, keine Kurse, kein Zufall. „Monate bis Ziel" =
     erstes k, bei dem Drift < Toleranz (z.B. 1%). Monoton fallend, konvergiert gegen
     Drift(s vs. b).
   - **F4 Aktionsliste „diesen Monat":** gerankte Käufe aus den Untergewichten
     (betragsstärkste Untergewichte zuerst), in €/Monat.

## Modi (UI-Konzept, grob — Optik zuletzt)

- **Modus-Toggle „Bestand | Sparplan"** zusätzlich zum vorhandenen Benchmark-Toggle.
  Benchmark-Toggle gilt für beide Modi (Marktkap / GDP / PPP / Blend).
- **Input:** PortfolioInput um Spalte „€/Monat" erweitern (optional je ETF).
  Persistenz in localStorage (vorhandenes Pattern `useLocalStorageState`).
- **Sparplan-Ansicht:**
  - Ist-Analyse: Sparplan-Drift (F1), Karten wie Bestand-Analyse.
  - Vorschlag (F2): optimale Monats-Aufteilung in €, je nach Sub-Modus (a/b).
  - Prognose (F3): kleine Zeitachse „Drift über Monate" + „Monate bis Ziel".
  - Aktionsliste (F4): „Diesen Monat: 400 € in X, 100 € in Y".

## Stufen (bottom-up, kleinste Diffs)

- **Stufe 1 — Flow-Analyse (F1):** €/Monat-Eingabe + Flow-Gewichte gegen Benchmark
  (Active Share, Länder-/Sektor-/Regionen-Drift). Tests: Flow-Gewichte normalisiert,
  Drift gegen Marktkap-Blend plausibel.
- **Stufe 2 — Vorschlag (F2a + F2b):** benchmark-treuer Sparplan + konvergenz-optimaler
  Sparplan (1 Monat, geschlossene Form; Solver als Fallback) + Aktionsliste (F4).
  Tests: leeres Portfolio → F2a = F2b = Benchmark-Gewichte; SPDR-only-Bestand +
  IWDA/EM-Sparplan → EM-Länder werden bevorzugt gekauft.
- **Stufe 3 — Prognose (F3):** Drift-Kurve über k Monate, „Monate bis Ziel",
  optional Sparraten-Eingabe variabel (Slider). Tests: monoton fallend, konvergiert
  gegen Drift(s vs. b), Toleranz-Grenze korrekt.
- **Stufe 4 — später:** Anteile statt € (hängt an offenem Punkt 5, Kursquelle),
  Sparplan-Historie, dynamischer Vorschlag bei Kursänderungen.

## Entscheidungen (mit RIn getroffen, 2026-08-17)

1. **Vorschlag-Modus: beide.** (a) benchmark-treu und (b) konvergenz-optimal
   (Lücken füllen) als Sub-Toggle. Default: (b). (a) ist Grenzfall von (b) für
   k→∞ bzw. leeres Portfolio — rechnerisch fast kostenlos.
2. **Ansichten: erst getrennt.** Schalter „Bestand / Sparplan" mit jeweils eigener
   Analyse. Die gemeinsame Prognose-Karte (F3, „so entwickelt sich dein Portfolio
   in 3/6/12 Monaten") kommt in Stufe 3 obendrauf.
3. **Sparrate: €/Monat je ETF** (wie heute bei €). Gesamt-Sparrate mit
   automatischer Aufteilung später als Komfort-Feature.
4. **Scope:** Stufe 1+2 = Kern, Stufe 3 = Follow-up.

## Umsetzung

- **Erst nach** Abschluss der laufenden Arbeiten (Blend-Benchmark, Methodik-Doku,
  UI-Überarbeitung): der Blend-Modus („unseres") wird als vierter Benchmark im
  Toggle gebraucht, die UI-Komponenten werden erweitert statt ersetzt.
- Struktur dieses Plans ist subagent-tauglich: Stufen haben klare Files, Tests und
  Verifikation — eine Session kann direkt per Subagent umsetzen (Muster:
  Go-Befehl in `docs/plan.md`).

## Nicht im Scope

- Anteile/Kurse (offener Punkt 5 im Haupt-Plan), Depot-Tracking, Ausführungslogik.
- Stufe B (fehlende ETFs vorschlagen): **UMSETZT** (2026-08-17), eigenes Plan-Dokument
  `docs/plan-stufe-b.md`. Analog für Sparpläne implementiert (Treppe + „neuer ETF"-Badge
  in Kauf-Liste und Tabelle; Ist-Analyse bleibt ohne Kandidaten).

## Bezug zu bestehenden Plänen

- `docs/plan.md` — Haupt-Plan (V1-Kern, Rechenkern, Daten-Pipeline).
- `docs/methodology.md` — Benchmark-Methodik (Marktkap + Blend).
- Wiederverwendet: `src/lib/optimizer/optimize.ts` (Solver + Metriken),
  `src/lib/benchmark/index.ts` (4 Modelle), `src/components/*` (Karten, DriftBars).
