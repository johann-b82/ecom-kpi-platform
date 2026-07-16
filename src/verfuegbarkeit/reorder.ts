// Default-Meldebestand = erwarteter Absatz über `weeks` Wochen, geschätzt aus dem
// Absatz eines längeren Fensters (`windowDays`) und darauf hochgerechnet. Das
// längere Fenster glättet Ausreißer einzelner Wochen. Aufgerundet auf ganze Stück.
export function reorderBufferUnits(unitsInWindow: number, windowDays: number, weeks = 4): number {
  if (unitsInWindow <= 0 || windowDays <= 0) return 0;
  return Math.ceil((unitsInWindow * weeks * 7) / windowDays);
}
