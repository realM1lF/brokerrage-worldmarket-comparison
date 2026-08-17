# Anfrage an extraETF (Isarvest GmbH)

**Empfänger:** support@extraETF.com
**Alternativ/Cc:** info@isarvest.de

---

**Betreff: Anfrage: Nutzung von extraETF-Daten für privates Analyse-Tool**

Sehr geehrte Damen und Herren,

ich habe ein privates Hobbyprojekt: ein kleines Tool, das mein eigenes ETF-Portfolio
mit dem Weltmarkt vergleicht. Dafür wertet es die Länder-, Sektor- und
Regionenaufteilung einzelner ETFs aus (die Daten, die auf Ihrer ETF-Profilseite
öffentlich sichtbar sind).

In Ihren AGB habe ich gelesen, dass eine automatisierte Abfrage ohne schriftliche
Genehmigung nicht zulässig ist. Deshalb frage ich hiermit an:

1. Wäre es in Ordnung, wenn ich die ETF-Profil-Daten (Länder-, Sektor- und
   Regionenaufteilung einzelner ETFs) automatisiert abfrage, ausschließlich für den
   privaten Eigengebrauch? Das Tool wird nicht veröffentlicht, und die Daten werden
   weder weitergegeben noch öffentlich dargestellt.

2. Und wäre es zukünftig, falls das Tool ausgereift ist, denkbar, es als öffentlich
   zugängliche Website anzubieten? Falls dafür eine Lizenz oder andere Konditionen
   nötig wären, wäre ich für Informationen dankbar.

Die Abfragen wären selten (wenige ETFs, mit Zwischenspeicherung), extraETF würde
selbstverständlich als Quelle genannt.

Vielen Dank für Ihre Zeit.

Mit freundlichen Grüßen

[Name]
[Ort, Datum]

---

## Kontext für uns (nicht mitsenden)

- AGB §4.4: Content nur privat, Weitergabe an Dritte/kommerziell nur mit Genehmigung.
- AGB §4.5: automatisierte Abfrage ohne schriftliche Genehmigung nicht zulässig.
- Technisch nötig: GET `extraetf.com/de/etf-profile/<ISIN>`, parsen des
  `<script id="frontend-state" type="application/json">`-Blocks (Länder/Sektoren/Regionen).
- Antwort-Fälle:
  - Nur privat erlaubt → privates Tool bauen, Website-Frage später neu klären.
  - Beides erlaubt → Ein-Quellen-Lösung bleibt.
  - Nur mit Lizenz → Konditionen einholen, gegen Lizenzdaten (Morningstar/Trackinsight) vergleichen.
  - Keine Antwort → Plan B: privates Tool mit geringer Frequenz + Caching (Risiko privat minimal),
    Website nur mit Lizenzdaten.
