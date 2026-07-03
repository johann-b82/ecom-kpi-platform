// The lumeapps chart look, codified once so every chart stays consistent.
export const BRAND = 'var(--brand)';
export const MUTED = '#94a3b8';       // slate-400 — secondary series
export const AXIS_LABEL = '#737373';  // neutral-500 — reads on light + dark
export const TICK = { fontSize: 11 } as const;
export const TOOLTIP_LABEL_STYLE = { color: '#171717', fontWeight: 600 } as const;
// Distinct slices for the status donut (brand, slate, amber, emerald, red).
export const CATEGORICAL = ['var(--brand)', '#94a3b8', '#f59e0b', '#10b981', '#ef4444'];

const de = new Intl.NumberFormat('de-DE');
const de1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
export const num = (n: number) => de.format(n);
export const eur = (n: number) => `${de.format(n)} €`;
export const pct = (n: number) => `${de1.format(n)} %`;

// Rotated Y-axis caption in the shared muted style.
export function axisLabel(value: string) {
  return { value, angle: -90 as const, position: 'insideLeft' as const,
    style: { fontSize: 11, fill: AXIS_LABEL, textAnchor: 'middle' as const } };
}
