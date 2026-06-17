export type Phase = 'see' | 'think' | 'do' | 'care';
export type KpiUnit = 'number' | 'currency' | 'percent' | 'ratio';

export interface Kpi {
  key: string;
  label: string;
  phase: Phase;
  value: number | null;   // null => nicht verfügbar
  unit: KpiUnit;
  available: boolean;
  deltaPct: number | null; // Veränderung vs. Vorperiode in Prozentpunkten der Differenz
}

export interface PhaseKpis {
  phase: Phase;
  title: string;     // 'SEE'
  subtitle: string;  // 'Awareness'
  kpis: Kpi[];
}
