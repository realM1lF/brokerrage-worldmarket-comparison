# Plan: UX-Klarheit (eine Geschichte von oben nach unten)

Stand: 2026-08-17. **Status: umgesetzt.**
Umsetzung: diese Session. Optik (RIn-Palette, Karten, Outfit) bleibt.
Dieses Dokument ist die Spezifikation plus Reihenfolge für die nächste Session.

> Für die Umsetzungs-Session: Rechnung nicht anfassen, außer wo unten
> explizit „Datenkonsistenz“ steht. Ziel ist Lesbarkeit, nicht neue Metriken.

**Ziel:** Eine Laiin versteht ohne Tooltip, *was* eine Zahl misst, *welche
Einheit* gilt, und *ob das der Ist-Zustand oder der Vorschlag ist*.
Von oben nach unten eine Geschichte, keine Collage.

**Ansatz:** Drei verbindliche Messgrößen. Die Seite in Kapitel mit sichtbarer
Gruppierung. Jedes Kapitel eine Messgröße, eine Einheit, ein Zeitpunkt.
Steuerung trennen: „welchen Weltmarkt?“ gilt überall; „darf ich neue ETFs?“
und „Lücken füllen?“ gehören nur in das Empfehlungs-Kapitel.

**Stack:** Next.js 16 App Router, bestehende Komponenten in
`src/components/*`, Layout in `src/app/page.tsx` + `page.module.css`.
Kein neues Chart-Library.

---

## 1. Warum es sich falsch anfühlt

Das Tool ist fachlich gewachsen (Bestand, Sparplan-Flow, Sparplan-Vorschlag,
Blend, Stufe B, Gold-Reserve). Die UI hat jede Schicht als weitere Karte
ins selbe Grid gelegt. Tooltips versuchen, die Collage zu erklären. RIn
liest die Karten trotzdem als *dieselbe* Welt.

Konkrete Kollisionen (2026-08-17, Blend, Sparplan, Testdepot):

| Was man sieht | Was man denkt | Was es wirklich ist |
|---|---|---|
| Ist-Analyse USA **−4,6 %** | Depot untergewichtet USA | nur die **255 € Käufe** vs. Blend |
| Länder-Drift nach 1 Monat USA **+13,5 %** | nach +21 € Sparplan-Tweak | **Depot** (6.000 € World) plus ein Tropfen 255 € |
| Nordamerika Weltmarkt **65,9 %** | Blend-Weltmarkt | Marktkap-Region (USA+Kanada), `acwi-imi-marktkap.json` 65,85 % |
| Hover USA Weltmarkt **~45,7 %** | Widerspruch zu 65,9 % | Blend-Land, korrekt. Region und Land nutzen **verschiedene Modelle** |

Copy-Fixes (CHANGELOG „drei Meter getrennt“) haben Labels verbessert.
Das Layout erzählt weiter dieselbe Lüge: zwei Drift-Karten untereinander,
gleiche Balkenoptik, verschiedene Zähler.

Zusätzlich in der **Bestand**-Ansicht: der Ring ist „heute“, Länder-Drift
und Regionen sind „nach Umschichtung“. Gleicher Grid, kein Kapitelbruch.

## 2. Drei Messgrößen (verbindlich)

Namen in der UI, nicht im Code. Im Code dürfen die alten Felder bleiben
(`currentCoverageScore`, `coverageScore`, `proposeSavings.countryDrift`).

| UI-Name | Einheit | Zeitpunkt | Code heute |
|---|---|---|---|
| **Depot heute** | Anteil am Aktien-Bestand | jetzt, ohne Käufe/Verkäufe | `optimize().current*` / Bestand-Länder |
| **Käufe diesen Monat** | Anteil an €/Monat (ohne Gold) | laufender Sparplan | `analyzeSavings` Flow |
| **Vorschlag** | dieselbe Einheit wie das Kapitel | nach der empfohlenen Aktion | Bestand: `optimize()` Ziel; Sparplan: vorgeschlagene Monats-Gewichte |

Verboten in der UI:

- Dieselbe Balkenoptik für Depot-Anteile und €/Monat-Anteile ohne Kapitelwand.
- „Nach 1 Monat“ als Überschrift über einer Länderkarte, die wie die
  Ist-Karte aussieht. Ein Monat 255 € auf ~9.000 € Depot ändert Länder um
  wenige Zehntelpunkte, nicht um 18 Prozentpunkte vs. der Flow-Karte.
- Weltmarkt-Prozent aus Modell A neben Weltmarkt-Prozent aus Modell B
  (Marktkap-Region neben Blend-Land).

Gold bleibt Reserve: zählt nicht in Länder-Scores. Chip und Hinweis bleiben.

## 3. Kapitel-Architektur

Eine Seite, zwei Ansichten (Bestand | Sparplan), wie beschlossen
(`docs/plan-sparplan.md`). Innerhalb jeder Ansicht **drei Kapitel**,
visuell getrennt (Band, Nummer, eine Zeile „was du hier siehst“).

### 3.1 Steuerung (oben, gilt für alles)

Bleibt vor den Kapiteln, wird aber **entschlackt**.

Immer sichtbar:

- Depot-Wahl (`DepotSwitcher`)
- ETF-Tabelle (Bestand € und €/Monat)
- Ansicht: Bestand | Sparplan
- Benchmark: Marktkap | GDP | PPP | Blend
- Button Analysieren

**Raus aus dieser Leiste, rein ins Empfehlungs-Kapitel:**

- „Nur meine ETFs | Mit neuen ETFs“
- Sparplan-Submodus „Weltmarkt spiegeln | Lücken füllen“

Begründung: Benchmark ändert *jede* Zahl auf der Seite. Die anderen beiden
ändern nur den Vorschlag. Wer Blend klickt, soll nicht denken, der Donut
würde deshalb neue ETFs einbeziehen.

Default Sparplan-Submodus bleibt **Weltmarkt spiegeln** (2026-08-17).
`docs/plan-sparplan.md` Punkt 1 nannte noch Default Lücken füllen: überholt.

### 3.2 Ansicht Bestand

**Kapitel 1 — Dein Depot heute**

- Eine Zeile: „Anteile an deinem Aktien-Depot, Stand jetzt.“
- Ring: Deckungs-Score heute
- Länder-Drift **heute** (Ist vs. Weltmarkt des gewählten Benchmarks)
- Regionen-Donut **heute**, Drilldown mit **demselben** Weltmarkt
- Größte Abweichungen heute
- Fehlende Länder heute (optional hier, nicht erst ganz unten)

**Kapitel 2 — So würdest du umschichten**

- Eine Zeile: „Kauf und Verkauf in €, damit das Depot dem Weltmarkt näher kommt.“
- Umschichtungs-Tabelle (Ist € → Ziel €)
- Ziel-Gewichtung-Chart
- Treppe / Tausch nur hier, plus der Toggle „Mit neuen ETFs“
- Keine Länderkarte in diesem Kapitel

**Kapitel 3 — So sähe das Depot danach aus**

- Eine Zeile: „Dieselben Länder wie oben, aber nach der Umschichtung.“
- Ring oder Kennzahl: Deckungs-Score nach Umschichtung
- Länder-Drift danach
- Regionen danach
- Fehlende Länder danach nur wenn sie sich von Kapitel 1 unterscheiden,
  sonst weglassen (keine Doppelkarte)

Kapitel 1 und 3 dürfen gleich *aussehen* (gleiche DriftBars), weil sie
dieselbe Einheit teilen. Der Unterschied steht in der Kapitelzeile
(heute / danach), nicht im Tooltip.

### 3.3 Ansicht Sparplan

**Kapitel 1 — Deine Käufe diesen Monat**

- Eine Zeile: „Nur die Sparrate. Das Depot zählt hier nicht.“
- Ring: Sparplan heute (nur Käufe)
- Länder der **Käufe** vs. Weltmarkt
- Regionen der **Käufe**, Drilldown konsistent
- Größte Abweichungen der Käufe
- Monatsrate als Zahl

**Kapitel 2 — So würdest du die Käufe aufteilen**

- Eine Zeile: „Dieselbe Monatsrate, andere Verteilung. Weiterhin €/Monat.“
- Toggle Weltmarkt spiegeln | Lücken füllen | Bestmögliches Depot (Default: spiegeln).
  Bestmögliches Depot = Baukasten von leer, Stopp unter 0,5 Prozentpunkte.
- Toggle Mit neuen ETFs
- Tabelle Sparplan-Änderung Ist → Ziel
- Liste „Diesen Monat kaufen“
- Treppe nur hier
- Optional: Länder der **vorgeschlagenen Käufe** (gleiche Einheit wie Kapitel 1).
  Dann sieht man, ob Taiwan-Übergewicht in den Käufen verschwindet.

**Kapitel 3 — Was das Depot davon merkt**

- Eine Zeile: „Dein Depot ist groß, ein Monat ist klein. Deshalb bewegen
  sich die Länder hier kaum.“
- Zwei Zahlen nebeneinander: Depot-Score heute | Depot-Score nach 1 Monat
- **Keine** große Länder-Drift-Karte in der Optik von Kapitel 1.
  Wenn überhaupt Drift: Mini-Hinweis „USA im Depot bleibt ~X %, ein Monat
  ändert das um ~Y Prozentpunkte.“
- Lücken füllen: hier darf stehen, dass dieser Modus *absichtlich* das
  Depot nach 1 Monat optimiert und die Käufe deshalb extrem werden können.
  Nicht als gleichwertige Länderkarte zur Ist-Analyse.

Stufe 3 aus `docs/plan-sparplan.md` (Kurve „Monate bis Ziel“) gehört später
in Kapitel 3, nicht in Kapitel 1.

## 4. Optik / Gruppierung

Palette, Font, Kartenschatten, Gauge-Weiß: unverändert
(CHANGELOG Style-Overhaul).

Neu:

- Jedes Kapitel = ein Block mit Hintergrundband (z. B. sehr leichtes Grau
  vs. Seite) und linker Akzentkante in `--accent`.
- Kapitelkopf: `1 · Dein Depot heute` plus die eine Erklärzeile in
  `.muted`, ohne Jargon, ohne „Active Share“ in der Zeile.
- Innerhalb eines Kapitels darf das bestehende 12er-Grid bleiben.
- Zwischen Kapitel 1 und 2 mehr vertikaler Abstand als zwischen zwei
  Karten desselben Kapitels.
- Steuerung (Depot, Input, Toggles) optisch als „Werkzeugkasten“, nicht
  als erste Ergebniskarte.

Mobile: Kapitel untereinander. Keine neuen Breakpoint-Spielereien über
das vorhandene Grid hinaus.

## 5. Datenkonsistenz (einzige Rechen-Änderung)

GDP, PPP und Blend leihen sich Sektoren **und Regionen** von Marktkap
(`src/lib/benchmark/index.ts` `buildGdp` / `buildBlend`,
`sectorsFromMarketcap: true`). Deshalb Donut-Kopf „Nordamerika 65,9 %“
bei Blend, Hover USA 45,7 %.

**Regionen-Weltmarkt** für jedes Modell = Summe der **Ländergewichte
dieses Modells**, gruppiert über `COUNTRY_TO_REGION` in
`src/components/RegionDrilldown.tsx`.

- Marktkap: Nordamerika ≈ 65,9 % (wie heute, Check gegen JSON).
- Blend: Nordamerika ≈ USA 45,7 % + Kanada ≈ 48–49 %, nicht 65,9 %.
- Drilldown-Kopfzeile nutzt dieselbe Regionssumme wie der Donut.
- Hover-Land nutzt weiter `countryDrift.benchmark`.

Sektor-Drift bleibt bei GDP/PPP/Blend ausgeblendet (kein eigenes
Sektor-Modell). Nicht still Marktkap-Sektoren als Blend verkaufen.

Test `src/lib/benchmark/benchmark-models.test.ts` „GDP/PPP/Blend nutzen
exakt die Marktkap-…-Region-Maps“ wird **ersetzt**: Regionen dürfen nicht
mehr referenzgleich zu Marktkap sein, außer beim Modell `marketcap`.
Neuer Test: Blend-Nordamerika = Summe Blend-US + Blend-CA (± Rundung).

`sectorsFromMarketcap` bleibt für Sektoren true. Regionen bekommen eine
eigene Ableitung.

## 6. Copy-Regeln

- Überschrift trägt die Messgröße. Tooltip nur fürs Feindetail.
- Kein „Active Share“ als erstes sichtbares Wort. Nachrangig oder
  „Abstand zum Weltmarkt“.
- „Optimierung / 63 Iter.“ nicht in Laien-Karten. Dev-only oder hinter
  Klick.
- Verbotene Paarung in einer Überschrift: „nach 1 Monat“ + Länderbalken,
  solange die Balken Depot-Anteile sind.
- Einheit einmal pro Kapitel in der Erklärzeile, nicht in jedem Tooltip
  neu.

Bestehende Texte in `src/components/staircaseCopy.ts` an die Kapitel
anpassen (Treppe nur in Kapitel 2).

## 7. Dateien (nächste Session)

| Datei | Rolle |
|---|---|
| `src/app/page.tsx` | Kapitel-Reihenfolge, Toggles verschieben, keine Logik-Erfindung |
| `src/app/page.module.css` | Kapitel-Bänder, Abstände; Grid innerhalb Kapitel behalten |
| `src/lib/benchmark/index.ts` | Regionen aus Ländern aggregieren |
| `src/lib/benchmark/benchmark-models.test.ts` | alte Region-Identität raus, Blend-NA-Summe rein |
| `src/components/RegionDrilldown.tsx` | Kopfzeile bleibt, Zahlen kommen dann konsistent |
| `src/components/staircaseCopy.ts` | Treppe = Kapitel 2 |
| `src/lib/optimizer/optimize.ts` | nur falls Region-Aggregation besser dort landet (ein Helper, kein Solver-Umbau) |
| `docs/plan-sparplan.md` | Default-Modus-Hinweis auf diesen Plan |
| `docs/CHANGELOG.md` | nach Umsetzung, nicht vorher |

`page.tsx` ist zu groß. Nächste Session darf Kapitel in Komponenten ziehen
(`BestandHeute.tsx`, `SparplanKaeufe.tsx`, …), ohne die Rechnung zu
duplizieren. Props = schon berechnete `OptimizeResult` /
`SavingsProposalResult`.

## 8. Umsetzungsschritte (nächste Session)

Reihenfolge einhalten. Nach jedem Schritt: `npm test`, Seite klicken
(Bestand + Sparplan, Marktkap + Blend).

1. **Regionen aus Ländern** (kleiner Diff, hoher Glaubwürdigkeitsgewinn).
   TDD: Test Blend-NA ≠ Marktkap-NA, Summe US+CA. Dann Loader.
2. **Kapitel-Chrome** in CSS + drei H2-Blöcke in beiden Ansichten, Inhalt
   erst nur umsortieren, noch nicht weglassen.
3. **Bestand umsortieren** auf heute → umschichten → danach. Länder-Drift
   heute braucht `current`-Gewichte. Falls `optimize()` nur Drift *nach*
   Ziel liefert: Ist-Drift aus denselben Helfern bauen (`countryWeights`
   über Ist-Gewichte), kein neuer Solver.
4. **Sparplan:** große „Länder-Drift nach 1 Monat“ aus Kapitel 1/2 nehmen.
   Stattdessen in Kapitel 2 die Drift der *vorgeschlagenen Käufe*
   (`analyzeSavings` auf dem Vorschlags-Flow, oder Allokationen als
   Pseudo-Portfolio mit `amountEur = suggestedMonthlyEur`). Kapitel 3 nur
   Score-Paar plus Warnung bei Lücken füllen.
5. **Toggles** „neue ETFs“ und Sparplan-Modus nach Kapitel 2.
6. **Copy-Pass:** Kapitelzeilen, staircaseCopy, Active Share / Iterationen
   zurückstufen.
7. **Browser-Check** Testdepot, Blend, Sparplan, Donut Nordamerika:
   Kopfzeile und USA-Hover dasselbe Modell. Flow-USA und Depot-USA stehen
   in verschiedenen Kapiteln.

Nicht in dieser UX-Session: extraETF-Live-Suche, China-Katalog, Stufe 3
Konvergenz-Kurve, Anteile/Kurse, Farb-Redesign.

## 9. Akzeptanz (RIn)

Fertig, wenn ohne Tooltip klar ist:

1. Oben Steuerung, dann „heute“, dann „was tun“, dann „danach“.
2. Sparplan-Länder oben sind Käufe, nicht das Depot.
3. Donut-Weltmarkt und Land-Hover-Weltmarkt gehören zum gleichen Benchmark.
4. Ein Monat Sparplan erzeugt keine 13-Prozent-USA-Karte direkt unter
   einer −4,6-Prozent-USA-Karte derselben Optik.
5. Optik bleibt erkennbar RIn (Farben, Karten, Gauge).

## 10. Bezug

- `docs/plan.md` — Produktziel, Rechenkern.
- `docs/plan-sparplan.md` — Flow vs. Bestand (fachlich richtig, UI hat es
  vermischt). Default-Modus dort veraltet.
- `docs/plan-stufe-b.md` — Treppe bleibt, nur Ort: Kapitel 2.
- `docs/methodology.md` — Blend-Formel, nicht UI.
- `docs/CHANGELOG.md` — Copy-Pflaster 2026-08-17, Gold-Reserve, SQLite.
