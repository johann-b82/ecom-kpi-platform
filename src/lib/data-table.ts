// Reine Prädikate für die client-seitige DataTable-Filterung (ohne DOM/React,
// damit testbar). Sortierung nutzt weiterhin compareValues aus lib/client-sort.
export function matchesText(cell: string, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('de');
  if (!q) return true;
  return cell.toLocaleLowerCase('de').includes(q);
}

export function inNumberRange(value: number, min?: number, max?: number): boolean {
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}
