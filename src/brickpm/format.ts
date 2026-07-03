export const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
export const pct = (n: number) => `${(n * 100).toFixed(1).replace('.', ',')} %`;
export const deviation = (own: number, comp: number) => (comp === 0 ? 0 : (own - comp) / comp);

export const STATUS_TONE: Record<string, 'red' | 'amber' | 'green' | 'neutral'> = {
  kritisch: 'red', hoch: 'amber', mittel: 'neutral', niedrig: 'neutral',
  offen: 'amber', 'in Prüfung': 'amber', 'Aktion gestartet': 'green', erledigt: 'green', verworfen: 'neutral',
  aktiv: 'green', geplant: 'neutral', preorder: 'amber', ausgelaufen: 'neutral', ausverkauft: 'red',
  bereit: 'green', konfiguriert: 'neutral',
};
