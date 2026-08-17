# Portfolio ↔ Weltmarkt

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Lokales Tool, das ein ETF-Depot und den Sparplan gegen einen Länder-Weltmarkt hält. Eingabe sind Bestände und €/Monat. Ausgabe ist ein Deckungs-Score, die Zielmischung und ein konkreter Umschichtungs- oder Kaufplan.

Kein Robo-Advisor. Keine Kurse, keine Prognose. Nur Look-through der ETF-Länder gegen festgelegte Benchmarks.

## Features

- **Bestand und Sparplan getrennt.** Oben steuern, dann Ist, Vorschlag, was das Depot merkt.
- **Fünf Weltmärkte.** Marktkap (ACWI IMI), BIP, PPP, Blend (50/50 Marktkap+BIP), Säulen (`0.50·MC + 0.25·GDP + 0.15·Energie + 0.10·Erwerb 15–64`).
- **Score und Drift.** Active Share als Deckungs-Score, Länderbalken, Regionen-Donut, fehlende Länder.
- **Vorschläge.** Nur eigene ETFs, Katalog dazu, oder kürzester Baukasten (gierig von leer, Stopp unter 0,5 pp).
- **Sparplan-Modi.** Weltmarkt spiegeln, Lücken füllen, Bestmögliches Depot.
- **Gold bleibt Reserve.** Zählt nicht in die Länder-Scores, Ist = Ziel.
- **Mehrere Depots.** SQLite unter `data/finance.db`, kein Account.

## Quick start

Node 20+.

```bash
git clone https://github.com/realM1lF/brokerrage-worldmarket-comparison.git
cd brokerrage-worldmarket-comparison
npm install
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

```bash
npm test          # Vitest
npm run build     # Production-Build
```

Optionale Umgebung:

| Variable | Default | Zweck |
|---|---|---|
| `FINANCE_DB_PATH` | `data/finance.db` | SQLite-Datei |
| `ETF_CACHE_TTL_HOURS` | intern | extraETF-Cache |

## Wie es rechnet

Jeder Aktien-ETF wird in Ländergewichte zerlegt (extraETF Look-through). Der Solver sucht Gewichte `w ≥ 0`, `Σw = 1`, die `‖A·w − b‖²` gegen den gewählten Weltmarkt `b` minimieren.

- **Bestand:** Umschichtung in € (Kauf und Verkauf).
- **Sparplan:** nur Käufe, dieselbe Monatsrate, andere Mischung.
- **Score:** `1 − Active Share`, Active Share = `½ · Σ |w_i − b_i|`.

Methodik, Proxy-Grenzen und Quellenlisten: [`docs/methodology.md`](docs/methodology.md).

## Datengrundlage

Universum ist **MSCI ACWI IMI** (Large/Mid/Small, Industrie- und Schwellenländer). Die Marktkap-Gewichte kommen nicht vom Indexlizenz-Feed, sondern vom **SPDR MSCI ACWI IMI** (`IE00B3YLTY66`) über extraETF. 56 Länder, auf 100 % skaliert, Stand **2026-07-31**. extraETF zählt Sitzländer, MSCI 47 Märkte. Die 9 Extra-Namen (u. a. Jersey, Macau, Puerto Rico) sind zusammen ~0,07 %.

Jeder gehaltene Aktien-ETF wird dieselbe extraETF-Strecke: Länder, Sektoren, Regionen, Look-through. Gold und Shorts haben kein Länder-Exposure und bleiben Reserve bzw. Warnung. Katalog-ISINs liegen in `src/data/candidates.ts`, Profile werden live nachgeladen und lokal gecacht.

Die Weltmarkt-Vektoren liegen statisch in `src/data/benchmarks/`:

| Datei / Modell | Was | Quelle | Stand |
|---|---|---|---|
| `acwi-imi-marktkap.json` | Free-Float-Marktkap, 56 Länder | SPDR ACWI IMI via extraETF | 2026-07-31 |
| `gdp-nominal-2023.json` | BIP in Dollar, nur ACWI-Länder | World Bank `NY.GDP.MKTP.CD`, Taiwan IMF WEO | 2023 |
| `gdp-ppp-2023.json` | BIP kaufkraftbereinigt, gleiches Universum | World Bank `NY.GDP.MKTP.PP.CD`, Taiwan IMF WEO | 2023 |
| `energy-primary-2024.json` | Primärenergie (TWh) | OWID, Energy Institute Statistical Review + EIA | 2024 |
| `working-age-2023.json` | Bevölkerung 15–64 | OWID, UN WPP 2024 Medium | 2023 |

Daraus gebaut, nicht als eigene JSON:

- **Blend:** 50 % Marktkap + 50 % BIP nominal.
- **Säulen:** `0.50·MC + 0.25·GDP + 0.15·Energie + 0.10·Erwerb 15–64`. These, kein Optimum.

Nicht drin: Konsum (SNA-Doppel mit BIP), Welt-BIP außerhalb des ACWI (Russland usw. fehlen und werden nicht umverteilt), Full-Market-Cap der World Bank, MSCI-Factsheet-Lizenzdaten.

## Stack

Next.js 16, React 19, TypeScript, Vitest, SQLite (`node:sqlite`). ETF-Holdings über extraETF (privat, gecacht). Benchmarks liegen statisch in `src/data/benchmarks/`.

## Docs

| Datei | Inhalt |
|---|---|
| [`docs/methodology.md`](docs/methodology.md) | Weltmarkt-Definition, Proxy, Säulen |
| [`docs/plan.md`](docs/plan.md) | Produktentscheidungen |
| [`docs/plan-sparplan.md`](docs/plan-sparplan.md) | Sparplan-Kern |
| [`docs/plan-ux.md`](docs/plan-ux.md) | Kapitel und Copy |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Verlauf |

## Disclaimer

Keine Anlageberatung. Zahlen sind Modell und Look-through, kein Indexlizenz-Feed. extraETF-Daten nur für privaten Gebrauch. Vergangene Abweichungen sagen nichts über künftige Rendite.

## License

[MIT](LICENSE) © 2026 Sebastian Schwerdhoefer
