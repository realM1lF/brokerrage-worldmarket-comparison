/** Texte der Treppe in Kapitel 2: Bestand = Umschichtung, Sparplan = Käufe. */

export function staircaseEmptyMessage(context: 'bestand' | 'sparplan' | 'bestDepot'): string {
  if (context === 'bestand') {
    return 'Ein weiterer ETF bringt unter 0,5 Prozentpunkte in der Umschichtung. Keine Ergänzung mit diesem Schwellenwert.';
  }
  if (context === 'bestDepot') {
    return 'Ein weiterer ETF hebt den Baukasten unter 0,5 Prozentpunkte. Start bei null, kurze Liste.';
  }
  return 'Kein weiterer Sparplan-ETF: die Monatsrate ist klein gegen den Bestand. Ein Extra-ETF verschiebt den Depot-Score nach einem Monat um weniger als 0,5 Prozentpunkte.';
}

export function staircaseBaseLabel(context: 'bestand' | 'sparplan' | 'bestDepot'): string {
  if (context === 'sparplan') return 'Nach 1 Monat mit deinen ETFs:';
  if (context === 'bestDepot') return 'Start (kein Aktien-ETF):';
  return 'Mit deinen ETFs (nach Umschichtung):';
}
