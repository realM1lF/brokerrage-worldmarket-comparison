# Methodik

Stand: 2026-08-17. Dieses Dokument beantwortet eine konkrete Frage:

> Ist „Marktkap ≈ MSCI ACWI IMI via SPDR-ETF-Proxy“ korrekt, oder machen wir es uns
> hier zu leicht?

Antwort vorweg: **Beides.** Die Free-Float-Entscheidung ist methodisch korrekt (Industriestandard).
Der Weg über den SPDR-ETF als Index-Proxy ist ein pragmatischer Shortcut mit messbaren, aber
kleinen Verzerrungen. Details und Größenordnungen unten.

Abschnitt 1 behandelt die Marktkapitalisierungs-Benchmark (`src/data/benchmarks/acwi-imi-marktkap.json`).
Abschnitt 1.8 GDP/PPP, Abschnitt 2 den Blend (50 % Marktkap + 50 % BIP nominal),
Abschnitt 3 das Säulen-Modell (vier Maße mit Investierbarkeits-Abschlag).

---

## 1. Marktkapitalisierungs-Benchmark

**Kurzdefinition:** Benchmark = MSCI ACWI IMI (Universum), gewichtet nach
Free-Float-Marktkapitalisierung (Schema). Datenquelle = Ländergewichte des SPDR MSCI ACWI IMI
UCITS ETF (IE00B3YLTY66) über extraETF, 56 Länder, auf 100 % skaliert, Stichtag 2026-07-31,
statisch in `src/data/benchmarks/acwi-imi-marktkap.json` abgelegt, geladen via
`src/lib/benchmark/index.ts`.

### 1.1 Free-Float vs. Full Market Cap — warum Free-Float richtig ist

- MSCI definiert Free Float als den Anteil der ausstehenden Aktien, der „available for purchase
  in the public equity markets by international investors“ ist — also den tatsächlich
  **investierbaren** Markt. Nicht-float-Anteile (Staatsbeteiligungen, Gründer, strategische
  Cross-Holdings) werden über den Foreign Inclusion Factor (FIF, 0–1) herausgerechnet.
  Quelle: MSCI GIMI Methodology, August 2026, Appendix VI.
- **Full Market Cap** (alle gelisteten Aktien, inkl. nicht handelbarer Blöcke) überschätzt
  Länder mit hohem Staats-/Strategieanteil (China A-Shares, Saudi Aramco) und unterschätzt
  die USA relativ. Das ist der Grund, warum Full-Cap US ≈ 47.6 % (World Bank, Plan-Tabelle)
  und Free-Float US ≈ 62–64 % (MSCI ACWI IMI) so weit auseinanderliegen.
- **Konsequenz für uns:** Die Plan-Tabelle „Referenzdaten (World Bank 2023)“ mit US 47.6 %
  war Full Market Cap und ist als Benchmark-Quelle unbrauchbar — im Plan korrekt markiert.
  Alle drei großen Indexfamilien (MSCI GIMI, FTSE Global Equity, S&P Global BMI) gewichten
  Free-Float-adjustiert. Unsere Entscheidung, Free-Float-Gewichte aus dem ETF zu nehmen
  (US 62.65 %), ist **kein Shortcut, sondern der Standard**.
- Cross-Check: US-Anteil im extraETF-Snapshot 62.65 % liegt im erwarteten MSCI-Korridor.

### 1.2 SPDR ACWI IMI als Index-Proxy: Tracking-Differenz und Sampling

Fakten zum Proxy (recherchiert 2026-08-17):

| Kennzahl | Wert | Quelle |
|---|---|---|
| Index | MSCI ACWI IMI (23 DM + 24 EM = 47 Märkte, Large+Mid+Small, ~9.000 Titel) | MSCI GIMI Methodology, justETF |
| ETF | SPDR MSCI ACWI IMI UCITS ETF (Acc), IE00B3YLTY66, Auflage 2011 | justETF |
| Fondsgröße | ~7.2 Mrd. € — größter und günstigster ACWI-IMI-ETF | justETF |
| TER | 0.17 % p.a. | TrackingDifferences / justETF |
| Replikation | **Physisch, Optimized Sampling** (4.975 Positionen statt ~9.000 Index-Titeln) | justETF |
| Tracking Difference | **Ø −0.05 % p.a. seit 2012** (ETF leicht besser als Index, u.a. Securities Lending) | TrackingDifferences.com |
| TD je Jahr (2015→2025) | −1.0, +0.7, +0.2, +0.5, +0.9, −0.1, −0.9, +0.5, +0.3, −0.1, +0.1 | TrackingDifferences.com |

**Bewertung:**

- **Kein Full Replication, sondern Optimized Sampling.** Der ETF hält nur ~4.975 der ~9.000
  Index-Titel. Kleine Märkte und Small Caps können im Fonds minimal über-/unterrepräsentiert
  sein. Für Ländergewichte heißt das: einzelne Länder können im ETF-Snapshot um wenige
  Promille vom Index abweichen — nicht um Prozentpunkte.
- **Tracking-Differenz ist kein Länderfehler.** Eine TD von Ø −0.05 % p.a. (Jahreswerte
  −1.0 % bis +0.9 %) beschreibt Rendite-Abweichung über Zeit, nicht falsche
  Ländergewichte im Bestand. Für eine statische Länder-Gewichtstabelle ist der relevante
  Fehler das Sampling-Noise im Portfolio-Split, und das liegt deutlich unter 0.1–0.2 pp.
- **Verfälschungsrisiko gesamt: < 0.2 Prozentpunkte** je großem Land. Für die Optimierung
  (Zielfunktion quadratische Abweichung, Output = Umschichtungs-Empfehlungen in €) irrelevant;
  für eine exakte „US exakt 63.2 %“-Aussage wäre der Index nötig.
- Fazit: Als Proxy vertretbar. Es ist aber ein Proxy — zwei ETF-Artefakte (Sampling-Noise,
  0.15 % Cash/Derivate-Rest) sind in unseren Zahlen enthalten, die der Index nicht hat.

### 1.3 extraETF-Länderklassifizierung: 56 vs. 47 MSCI-Märkte

- MSCI ACWI IMI umfasst offiziell **47 Märkte** (23 Developed + 24 Emerging), bestätigt in
  der MSCI GIMI Methodology (August 2026, Appendix I) und justETF („23 Industrie- und
  24 Schwellenländer“).
- extraETF liefert für den SPDR-ETF **56 Länder**. Die 9 zusätzlichen „Länder“ und ihre
  Gewichte im Snapshot (2026-07-31):

| extraETF-Land | Gewicht | MSCI-Einordnung | Kategorie |
|---|---|---|---|
| Rumänien | 0.049 % | Frontier Market → nicht im ACWI IMI | Frontier-Artefakt |
| Island | 0.0003 % | Frontier Market → nicht im ACWI IMI | Frontier-Artefakt |
| Litauen | 0.0005 % | Frontier Market → nicht im ACWI IMI | Frontier-Artefakt |
| Macau | 0.0062 % | wird Hongkong zugerechnet | Domicile-Artefakt |
| Guatemala | 0.0084 % | kein MSCI-Markt (Domicile-Split) | Domicile-Artefakt |
| Luxemburg | 0.0047 % | kein MSCI-Markt (Domicile-Split) | Domicile-Artefakt |
| Puerto Rico | 0.001 % | wird USA zugerechnet | Domicile-Artefakt |
| Jersey | 0.0013 % | wird UK zugerechnet | Domicile-Artefakt |
| Zypern | 0.0003 % | kein MSCI-Markt (Domicile-Split) | Domicile-Artefakt |
| **Summe** | **≈ 0.072 %** | | |

- **Ursache:** extraETF übernimmt die Länderangaben aus Fund-Holdings-Daten (Sitzland/
  Emittenten-Land), während MSCI jedes Wertpapier nach eigenen Regeln genau einem Markt
  zuordnet („Country Classification of Securities“, GIMI Methodology Appendix III, jährlicher
  Review). Wo Sitzland ≠ MSCI-Markt ist (Macau→HK, Puerto Rico→US, Jersey→UK), entstehen
  Pseudoländer. Frontier-Märkte (Island, Litauen, Rumänien) liegen außerhalb des
  ACWI-IMI-Universums und tauchen nur durch Domicile-klassifizierte Holdings auf.
- **Verzerrungsgröße:** ≈ 0.07 % Gesamtgewicht auf 9 Pseudoländer. Die Gegenrichtung
  (z.B. USA um 0.001 pp zu niedrig, weil Puerto Rico separat gezählt wird) ist im
  Promille-Bereich. Praktisch vernachlässigbar.
- **Konsistenz-Bonus:** ETF-Portfolios werden über dieselbe extraETF-Klassifizierung
  aufgelöst wie die Benchmark (gleiche Artefakt-Kette) — Fehler heben sich beim
  Ist/Soll-Vergleich teilweise auf. Ein MSCI-Factsheet als Benchmark bei extraETF-ETFs
  als Ist-Daten würde die Klassifizierungen *mischen* und die Vergleichbarkeit eher
  verschlechtern.
- Restrisiko: Falls extraETF bei großen Märkten strukturell anders klassifiziert (z.B.
  China/Hongkong-Split, in HK notierte Festland-Titel), wäre der Effekt größer. Nicht
  systematisch geprüft — ehrlicher offener Punkt.

### 1.4 Skalierung 99.85 % → 100 % (Cash/Derivate-Rest)

- Der SPDR-ETF hält 99.85 % in Aktien; die restlichen **0.15 % sind Cash, Futures-Reste und
  Derivate** (Rebalancing-Puffer, keine Länderallokation).
- Wir skalieren alle 56 Ländergewichte mit Faktor 1/0.9985 ≈ 1.0015 auf Σ = 100 %.
  Wirkung: US 62.55 % → 62.65 % (Δ ≈ +0.09 pp). Mathematisch trivial.
- **Konzeptionelle Schwäche:** Die 0.15 % sind in Wirklichkeit *keine* Aktien und gehören in
  kein Land. Die Skalierung unterstellt, der Restposten wäre pro-rata über alle Länder
  verteilt — er ist es nicht. Unskaliert wäre US 62.55 %, und der „wahre“ Index hat gar
  keinen Cash-Rest.
- Alternative (sauberer): Benchmark unskaliert lassen (Σ = 99.85 %) und die fehlenden 0.15 %
  als explizite Restposition `_OTHER` mit Soll-Gewicht 0 behandeln — genau das tut der
  Optimizer ohnehin für ETF-Restposten. Die Skalierung ist reine Kosmetik („Summe = 100 %“)
  und in der Konsequenz unschädlich (< 0.1 pp Fehler), aber sie ist eine bewusste
  Normalisierung, kein Abbild der Realität.

### 1.5 Stichtag 2026-07-31: Wie schnell altern die Zahlen?

- **MSCI Quarterly Index Reviews:** Februar, Mai, August, November (Feb/Aug = Standard-Review;
  Mai/Nov = Semi-Annual Review mit zusätzlichem Size-Segment-Review). Umsetzung zum
  Monatsultimo, Ankündigung ~2 Wochen vorher. Bei jedem Review werden FIFs (Free-Float-
  Faktoren) und Aktienanzahlen aktualisiert und das Universum aufgefrischt.
- **Dazwischen laufen Free-Float-Datenpflege und event-getriebene Änderungen laufend**
  (IPOs, Deletes „as they occur“). Free-Float-Änderungen einzelner Titel werden beim
  nächsten Review eingepreist.
- Unser Stichtag 2026-07-31 liegt **nach dem May-Review und ~4 Wochen vor dem
  August-Review** — also ein „aktueller Zwischenstand“, nicht direkt post-Review.
- **Drift ohne Review:** Ländergewichte verschieben sich auch zwischen Reviews allein durch
  relative Kursbewegungen. Bei US ≈ 63 % Anteil verschiebt eine 5 %-ige US-Outperformance
  das Gewicht um ~0.5–1 pp — im Quartal realistisch, im Jahr deutlich mehr.
- **Einschätzung:** Ein 4–8 Wochen alter Snapshot ist unkritisch. Nach einem Quartal wird er
  spürbar ungenau (aber für die Optimierung weiter brauchbar), nach 6–12 Monaten veraltet.
  Das Auto-Update der Benchmark ist im CHANGELOG korrekt als offener Punkt gelistet;
  sinnvoll wäre quartalsweise Aktualisierung kurz nach jedem Index Review.

### 1.6 Alternative: MSCI-Factsheet direkt vs. ETF-Proxy

| Kriterium | MSCI-Factsheet direkt | SPDR-ETF via extraETF (aktueller Weg) |
|---|---|---|
| Datengrundlage | Indexgewichte (FIF-basiert), keine ETF-Artefakte | ETF-Portfoliogewichte: Sampling-Noise, Cash-Rest, TD-Historie |
| Länder | offizielle 47 MSCI-Märkte, saubere Klassifizierung | 56 Länder, 9 Domicile-/Frontier-Artefakte (0.07 %) |
| Genauigkeit | Goldstandard | Abweichung < 0.2 pp je großem Land |
| Zugang | msci.com bot-geschützt (beim Review 2026-08-17 praktisch nicht abrufbar), PDF-Formate, Lizenzbedingungen für Weiterverwendung | extraETF-HTML, ein HTTP-GET, JSON im Markup, kein Key (AGB: privat zulässig) |
| Format | monatliches PDF, manueller Parse-Aufwand | strukturierte Werte inkl. Stichtag |
| Sektoren/Regionen | im Factsheet enthalten | vollständig (11 GICS + Regionen), konsistent zur ETF-Seite |

**Fazit:** Das MSCI-Factsheet wäre methodisch sauberer (Index statt Proxy, offizielle
Klassifizierung). Praktisch ist es schwerer zugänglich (Bot-Schutz, PDF, Lizenzfragen) und
liefert — Stand jetzt — keinen entscheidenden Genauigkeitsgewinn, solange die großen
Ländergewichte (US 62–64 %, Japan, UK) im erwarteten Korridor liegen. Der ETF-Proxy ist der
pragmatisch richtige Kompromiss für ein privates Tool. Upgrade-Pfad bei wachsenden
Ansprüchen: monatliches MSCI-Factsheet oder lizenzierte Daten (Trackinsight, Morningstar).

### 1.7 Wo wir uns es leicht machen — ehrliche Liste

1. **Benchmark aus ETF-Produktdaten statt aus Indexdaten.** Sampling-Noise + Cash-Rest
   landen in der Tabelle (≈ 0.1–0.2 pp bei großen Ländern). Die Tracking-Differenz
   (Ø −0.05 % p.a.) ist für Ländergewichte irrelevant, wird aber oft als „ETF ≠ Index“-
   Argument genannt — sie misst Renditedrift, keinen Länderfehler.
2. **extraETF-Klassifizierung statt MSCI-Klassifizierung.** 9 Pseudoländer mit zusammen
   0.07 % Gewicht; Domicile-basiert statt marktbasiert. Bei großen Märkten ungeprüft
   (China/HK-Split-Risiko offen).
3. **Skalierung 99.85 % → 100 %.** Kosmetik; verteilt den Cash-Rest pro-rata über Länder,
   die ihn nicht halten. Fehler < 0.1 pp, aber es ist eine Normalisierung, keine Wahrheit.
4. **Statischer Snapshot (2026-07-31).** Altert quartalsweise sichtbar; Auto-Update ist
   offener Punkt. Ein 4 Wochen alter Stand ist unkritisch, 6+ Monate wären es nicht.
5. **Kein zweiter Cross-Check der extraETF-Werte gegen ein MSCI-Factsheet zum Zeitpunkt der
   Erstellung** (nur Plausibilität: US 62.65 % im erwarteten Korridor). Einmalige
   Verifikation wäre wünschenswert.
6. **Sektor-/Regionsgewichte stammen aus derselben extraETF-Quelle** (gleiche Artefakt-Kette
   wie die Ländergewichte).

**Gesamturteil:** „Marktkap ≈ MSCI ACWI IMI via SPDR-ETF-Proxy“ ist ein korrekt begründeter,
transparenter Shortcut. Die methodische Grundentscheidung (Free-Float, ACWI-IMI-Universum)
ist richtig; die Verzerrungen des Proxys (≈ 0.1–0.2 pp) liegen deutlich unter der
Modellunsicherheit der Optimierung und unter dem Drift, den jedes statische Benchmark-Modell
zwischen zwei Updates hat. Für ein privates Analyse-Tool: vertretbar. Für Veröffentlichung
oder Kunden-Nutzung: MSCI-Factsheet oder Lizenzdaten nötig.

---

## 1.8 GDP- und PPP-Modelle

Zwei reine Wirtschafts-Benchmarks, unabhängig vom Blend.

- **GDP (BIP nominal):** World Bank `NY.GDP.MKTP.CD`, Jahr 2023, Taiwan via IMF WEO.
  Gewichte über das 56-Länder-ACWI-IMI-Universum, nicht über das Welt-BIP.
  US deshalb **28.6 %**, nicht die oft zitierten **25.9 %** (Welt-Anteil).
  Russland, Venezuela usw. fehlen — ihr BIP wird nicht umverteilt.
- **GDP PPP:** World Bank `NY.GDP.MKTP.PP.CD`, gleiches Universum, Taiwan via IMF.
  US **17.7 %**, China **22.6 %** (Kaufkraft zieht Schwellenländer hoch).

Beide haben **keine eigenen Sektor-/Regionengewichte**. Die UI zeigt deshalb keine
Sektor-Drift (die würde gegen Marktkap lügen). Länder-Optimierung nutzt die
jeweilige `countryMap`.

---

## 2. Blend-Benchmark

Der Blend-Benchmark („Weltmarkt nach unserer Ansicht") mischt **zwei** Schemata:
investierbare Börse und Wirtschaftskraft zu Markt-Wechselkursen.

**w_i = 0.50 · w_mc,i + 0.50 · w_gdp_nom,i**

Gewichte α = β = 0.50, Begründung:

- **Marktkapitalisierung (50 %)** ist das einzige direkt investierbare Abbild des
  Weltmarkts — ein GDP-gewichtetes Portfolio lässt sich real nicht 1:1 kaufen. Sie
  bleibt der Anker. MSCI GDP Weighted und Dimensional argumentieren jeweils nur
  für *eine* Seite; der Blend ist bewusst der Kompromiss.
- **BIP nominal (50 %)** ist das Wirtschaftsmaß, das zu Finanzströmen passt
  (IWF: Marktwechselkurse bei Finanzflüssen; MSCI GDP Weighted: nominales BIP in USD).
  PPP bleibt ein eigener Toggle, nicht Teil des Blend — Nominal und PPP sind dasselbe
  BIP mit zwei Umrechnungen, keine unabhängigen Infos.
- **Warum nicht ⅓-⅓-⅓ und warum nicht PPP im Blend:** Dimson/Marsh/Staunton
  (*Triumph of the Optimists*): Länder-BIP-Wachstum und Aktienrenditen sind
  länderübergreifend oft negativ korreliert. PPP würde Schwellenländer extra
  hochziehen, ohne dass das historisch höhere Renditen verspricht. Marktkap bleibt
  bei 50 %, nicht bei 33 %.

Beispiel USA: Marktkap 62.7 % · GDP nominal 28.6 % → **Blend 45.7 %**.
China: 2.3 % · 18.8 % → **10.5 %**.

### 2.1 Etablierte Ansätze (Einordnung)

- **RAFI Fundamental Indexation** (Arnott/Hsu/Moore 2005): gewichtet nach
  Fundamentaldaten (Umsatz, Dividenden, Buchwert, Cashflow) statt Marktkap — Vorläufer
  der Idee, Marktpreise aus der Gewichtung zu entfernen. Der Blend ist verwandt, nutzt
  aber BIP statt Unternehmens-Fundamentaldaten.
- **MSCI GDP Weighted Indices:** offizielle Indexfamilie, Länder nach *nominalem* BIP,
  Titel innerhalb des Landes weiter Marktkap.
- **FTSE All-World GDP Adjusted (2026):** analog, IMF-WEO-BIP in USD.
- **Dimson/Marsh/Staunton:** Langfrist-Daten (1900–heute), Quelle des Growth-Trap-Befunds.
- **IWF (PPP vs. Marktkurse):** Marktwechselkurse bei Finanzströmen; PPP für
  Lebensstandard / reale Güterkörbe.

### 2.2 Ehrliche Limits

- **Stichtags-Mix:** Marktkap-Anteil Stand 2026-07-31, GDP-Anteile Stand 2023. Zwei
  unterschiedliche Zeitpunkte fließen in eine Kennzahl. Die UI zeigt beide Daten.
- **GDP-Nenner:** Die GDP-Gewichte sind über das 56-Länder-ACWI-IMI-Universum
  normalisiert, nicht über das Welt-BIP. Deshalb liegt US nominal hier bei 28.6 % statt
  der oft zitierten 25.9 % (Welt-BIP-Anteil). Folge: Länder außerhalb des
  ACWI-IMI-Universums (z. B. Russland, Venezuela) fehlen komplett — ihr BIP wird nicht
  auf die übrigen Länder umverteilt.
- **Sektoren nicht geblendet, Regionen schon:** Der Blend mischt die Ländergewichte.
  GDP liefert keine Sektoren. Die UI blendet die Sektor-Drift bei GDP/PPP/Blend aus
  (Marktkap-Surrogat würde z. B. US-Tech weiter bei ~Marktkap zeigen, obwohl Blend
  die USA auf ~46 % drückt). Regionen-Weltmarkt ist die Summe der Ländergewichte
  des aktiven Modells (Blend-Nordamerika ≈ USA + Kanada, nicht Marktkap 65,9 %).
- **Kein „richtig":** Der Blend ist eine Meinung („Weltmarkt nach unserer Ansicht"),
  keine empirisch optimale Gewichtung. 50/50 ist die saubere Übersetzung von
  „Hälfte Börse, Hälfte Wirtschaft".

### 2.3 Technische Umsetzung

- Live in `src/lib/benchmark/index.ts` (`buildBlend`): kein statisches JSON.
  Formel je Land `0.50·MC + 0.50·GDP_nom`. Tests prüfen Land für Land gegen die
  Quell-Maps — MC- oder GDP-Update zieht Blend automatisch nach.
- `getBenchmark('blend')`, Label `Blend (MC+GDP)`, `asOf` = „MC 2026-07-31 / GDP 2023".
- Sektor-Maps intern vom Marktkap-Modell. Regionen je Modell aus dessen Ländern
  (`COUNTRY_TO_REGION`). UI zeigt keine Sektor-Drift bei GDP/PPP/Blend/Säulen.

---

## 3. Säulen-Benchmark

Zweiter eigener Weltmarkt neben dem Blend. These: die Welt ist nicht nur
Börse plus BIP. Vier Größen, jedes Land zuerst auf das 56er-ACWI-IMI-Universum
normiert, dann gewichtet nach Investierbarkeit (5-Punkte-Raster).

**w_i = 0.50·w_mc,i + 0.25·w_gdp,i + 0.15·w_en,i + 0.10·w_pop,i**

| Säule | α | Was sie misst | Quelle | Stichtag |
|---|---|---|---|---|
| Listed Equity (MC) | 50 % | investierbare Free-Float-Börse | SPDR ACWI IMI, wie Abschnitt 1 | 2026-07-31 |
| BIP nominal | 25 % | Dollar-Output | World Bank NY.GDP.MKTP.CD, wie 1.8 | 2023 |
| Primärenergie | 15 % | physischer Durchsatz, FX-frei | OWID / Energy Institute Statistical Review + EIA, TWh | 2024 (GT/MO/PR: 2023) |
| Erwerbsbevölkerung 15–64 | 10 % | Arbeitseinsatz, kein Claim | OWID, UN WPP 2024 Medium; 15–64 = 15–24 + 25–64 | 2023 (letztes Schätzjahr) |

α in 5-Prozent-Schritten. Literatur schätzt α nicht (RAFI mittelt grob gleich,
IWF-Quote in 5-Punkte-Schritten, Black-Litterman mixt Renditen nicht Größen).
Deshalb Raster, kein Optimizer.

- **MC 50 %:** einziger kaufbarer Claim, Bayes-Prior. Indexanbieter liefern 100 % MC
  *oder* 100 % BIP, nicht 30 % MC. Dimensional bleibt bei MC. Haircut-Logik:
  alles andere ist View und wird geschrumpft.
- **BIP 25 %:** MSCI/FTSE-Standard für Ländergröße. Halber Blend-Anteil, weil
  Energie denselben Wirtschaftsraum zusätzlich trägt.
- **Energie 15 %:** RAFI-Länderfaktor #4 (Arnott/Hsu/Li/Shepherd 2010: GDP,
  Bevölkerung, Energie, √Fläche). China ~33 % dieser Säule, USA ~18 %.
  Nicht 20 %, weil partiell kollinear mit BIP. Fläche durch CWON Natural Capital
  ersetzt gedacht, aber CWON 2020 fehlt TW/HK.
- **Erwerb 10 %:** Arbeit, Haircut wegen Growth Trap (Ritter 2005, DMS).
  15–64 (World Bank/ILO), nicht Total, nicht Humankapital (CWON kapitalisiert
  denselben Lohnstrom). Indien und China je ~27 % dieser Säule.

**Bewusst nicht:** PPP (Doppel mit Nominal). Konsum und GNI (SNA-Umschichtung
von BIP, OECD-Korrelation Konsum/BIP > 0,90). Humankapital, Labor Force,
Total-Bevölkerung (Doppel mit Erwerb). Anleihen (Bums Problem, Japan-Bias).
CWON Produced/Natural Capital (Stichtag 2020, Lücken TW/HK). Equal Weight,
Risiko-Parität.

Beispiel USA: **41,9 %** (Blend 45,7 %, Marktkap 62,7 %, GDP 28,6 %).
China: **13,6 %** (Blend 10,6 %). Indien: **5,6 %** (Blend 2,6 %).

### 3.1 Bekannte Unsauberkeiten

- **Stichtags-Mix:** vier Datenstände in einer Zahl. UI zeigt alle.
- **Universum, nicht Welt:** wie GDP/Blend, nur ACWI-IMI-Länder.
- **Jersey-Energie = 0:** keine EI/EIA-Reihe, analog GDP-Jersey.
- **Energie vs. BIP:** nicht orthogonal. Deshalb Energie 15 %, nicht 25 %.
- **Sektoren nicht gemischt:** wie Blend. UI blendet Sektor-Drift aus.

### 3.2 Technische Umsetzung

- Live in `src/lib/benchmark/index.ts` (`buildPillars`, `PILLAR_WEIGHTS`).
  Tests prüfen Land für Land gegen MC-, GDP-, Energie- und Erwerbs-Maps.
- `getBenchmark('pillars')`, Label `Säulen`,
  `asOf` = „MC 2026-07-31 / GDP 2023 / EN 2024 / POP 2023".
- Toggle in der UI neben Blend.

---

## Quellen

- MSCI: *Global Investable Market Indexes (GIMI) Methodology*, August 2026 (PDF) —
  Free-Float-Definition Appendix VI, Märktelisten Appendix I (47 Märkte: 23 DM + 24 EM),
  Review-Zyklus §3.1 —
  <https://www.msci.com/eqb/methodology/meth_docs/MSCI_GIMIMethodology_Aug2026.pdf> (abgerufen 2026-08-17)
- TrackingDifferences.com: *State Street SPDR MSCI All Country World Investable Market UCITS
  ETF (Acc)* — TER, TD Ø seit 2012, Jahres-TDs, Replikationsart —
  <https://www.trackingdifferences.com/ETF/IE00B3YLTY66> (abgerufen 2026-08-17)
- justETF: *SPDR MSCI ACWI IMI UCITS ETF (IE00B3YLTY66)* — Replikation (Sampling),
  4.975 Positionen, Fondsgröße, Indexbeschreibung 23+24 Länder —
  <https://www.justetf.com/de/etf-profile.html?isin=IE00B3YLTY66> (abgerufen 2026-08-17)
- extraETF: *SPDR MSCI ACWI IMI Profil* — Datenquelle der Benchmark-Tabelle, Stand
  2026-07-31 — <https://extraetf.com/de/etf-profile/IE00B3YLTY66> (abgerufen 2026-08-17)
- MSCI: *Index Review Kalender* — <https://www.msci.com/index-review> (Zugriff 2026-08-17
  bot-geschützt; Review-Termine aus der GIMI-Methodik zitiert)
- Projektdatei: `src/data/benchmarks/acwi-imi-marktkap.json` (Stichtag 2026-07-31, 56 Länder,
  auf 100 % skaliert)

### Blend (Abschnitt 2)

- Arnott, Hsu, Moore: *Fundamental Indexation*, Financial Analysts Journal 61(2), 2005 —
  via Wikipedia <https://en.wikipedia.org/wiki/Fundamental_indexation> (abgerufen 2026-08-17)
- Dimson, Marsh, Staunton: *Triumph of the Optimists* — Growth-Trap-Befund (BIP-Wachstum
  vs. Aktienrendite negativ korreliert)
- MSCI: *Real Indexes / GDP Weighted Indices* — <https://www.msci.com/real-indexes>
  (abgerufen 2026-08-17)
- MSCI Research: *Economic Weighting* (nominales BIP in USD) —
  <https://www.msci.com/research-and-insights/blog-post/economic-weighting-an-alternative-approach-to-country-allocation>
  (abgerufen 2026-08-17)
- IWF: *Purchasing Power Parity: Weights Matter* — Marktwechselkurse bei Finanzströmen —
  <https://www.imf.org/en/publications/fandd/issues/series/back-to-basics/purchasing-power-parity-ppp>
  (abgerufen 2026-08-17)
- Projektdateien: `src/lib/benchmark/index.ts` (`buildBlend`, live),
  `gdp-nominal-2023.json` (World Bank NY.GDP.MKTP.CD, Taiwan IMF WEO 04/2024),
  `gdp-ppp-2023.json` (World Bank NY.GDP.MKTP.PP.CD, Taiwan IMF WEO 04/2024)

### Säulen (Abschnitt 3)

- Arnott, Hsu, Li, Shepherd: *Valuation-Indifferent Weighting for Bonds*, JPM 36(3),
  2010 — Länder-RAFI: GDP, Bevölkerung, Energie, √Fläche —
  <https://www.top1000funds.com/wp-content/uploads/2011/06/Valuation-indifferent-weighting-for-bonds.pdf>
- Ritter: *Economic Growth and Equity Returns*, Pacific-Basin Finance Journal 13(5),
  2005 — Growth Trap, Korrelation Rendite vs. BIP-pro-Kopf negativ —
  <https://site.warrington.ufl.edu/ritter/files/2015/04/Economic-growth-and-equity-returns-2005.pdf>
- Dimensional: *Unintended Consequences of GDP-Weighted Portfolios* (2025) —
  Investierbarkeit, China 3 % MC vs. ~19 % GDP —
  <https://www.dimensional.com/au-en/insights/unintended-consequences-of-gdp-weighted-portfolios>
- UN DESA Population Division: *World Population Prospects 2024* — Medium-Variante,
  Kalenderjahr 2023 als letztes Schätzjahr. Über OWID „Population by age group"
  (15–64 = Ages 15–24 + Ages 25–64), alle 56 Codes inkl. Taiwan und Jersey —
  <https://ourworldindata.org/grapher/population-by-age-group> (abgerufen 2026-08-17)
- Energy Institute: *Statistical Review of World Energy* plus EIA International
  Energy Data, über OWID `primary_energy_consumption` (TWh) —
  <https://github.com/owid/energy-data> (abgerufen 2026-08-17)
- World Bank: *Changing Wealth of Nations 2024* — produced/human/natural capital
  geprüft, nicht verwendet (Stichtag 2020, Lücken TW/HK) —
  <https://www.worldbank.org/en/publication/the-changing-wealth-of-nations>
- Doeswijk, Lam, Swinkels: *The Global Multi-Asset Market Portfolio* (FAJ 2014 /
  RAPS 2020) — Assetklassen-Mix, keine Ländergewichte. Nur als Abgrenzung:
  unser Modell bleibt Länder-Säulen, kein Multi-Asset-Marktportfolio.
- Projektdateien: `src/lib/benchmark/index.ts` (`buildPillars`, live),
  `working-age-2023.json`, `energy-primary-2024.json`
