// Geteilte Sortier-Logik für server-seitige Listen. Param-Format: `sort=name`
// (aufsteigend) bzw. `sort=-name` (absteigend). Die Spalte wird gegen eine
// Whitelist geprüft, bevor sie in ORDER BY landet — daher kein Injection-Vektor.
export type SortDir = 'asc' | 'desc';
export interface Sort { col: string; dir: SortDir; }

export function parseSort(param: string | undefined, allowed: readonly string[], fallback: Sort): Sort {
  if (!param) return fallback;
  const desc = param.startsWith('-');
  const col = desc ? param.slice(1) : param;
  if (!allowed.includes(col)) return fallback;
  return { col, dir: desc ? 'desc' : 'asc' };
}

// Header-Klick: gleiche Spalte kippt asc↔desc, eine neue Spalte startet aufsteigend.
export function toggleSortParam(current: Sort, col: string): string {
  return current.col === col && current.dir === 'asc' ? `-${col}` : col;
}
