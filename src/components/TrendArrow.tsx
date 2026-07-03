// Diagonal trend arrow (↗ up / ↘ down). Inherits the parent's text color.
export function TrendArrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block shrink-0">
      {up ? (
        <><line x1="7" y1="17" x2="17" y2="7" /><polyline points="8 7 17 7 17 16" /></>
      ) : (
        <><line x1="7" y1="7" x2="17" y2="17" /><polyline points="17 8 17 17 8 17" /></>
      )}
    </svg>
  );
}
