'use client';

type Row = Record<string, unknown>;

function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = Array.isArray(v) ? v.join('|') : v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n');
}

export function BpmExport({ data }: { data: Record<string, Row[]> }) {
  const btn = 'rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">JSON</p>
        <button type="button" className={btn} onClick={() => download('brickpm-export.json', JSON.stringify(data, null, 2), 'application/json')}>
          Gesamt-Export (JSON)
        </button>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">CSV</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data).map(([name, rows]) => (
            <button key={name} type="button" className={btn} onClick={() => download(`brickpm-${name}.csv`, toCsv(rows), 'text/csv')}>
              {name}.csv
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
