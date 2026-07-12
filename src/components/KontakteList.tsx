'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Contact } from '@/kontakte/types';

type RoleFilter = '' | 'kunde' | 'lieferant';

export function KontakteList({ contacts }: { contacts: Contact[] }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState<RoleFilter>('');

  const rows = contacts.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (role === 'kunde' && !c.isCustomer) return false;
    if (role === 'lieferant' && !c.isSupplier) return false;
    return true;
  });

  const chip = (v: RoleFilter, label: string) => (
    <button
      onClick={() => setRole(v)}
      className={`rounded px-3 py-1 text-sm ${role === v
        ? 'bg-accent text-white'
        : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}
    >{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100"
        />
        {chip('', 'Alle')}{chip('kunde', 'Kunde')}{chip('lieferant', 'Lieferant')}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="anno text-left text-neutral-500">
            <th className="py-2">Name</th><th>Rolle</th><th>Ort</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">
                <Link href={`/kontakte/${c.id}`} className="text-brand hover:text-brand-dark">{c.name}</Link>
              </td>
              <td>{[c.isCustomer && 'Kunde', c.isSupplier && 'Lieferant'].filter(Boolean).join(' + ') || '—'}</td>
              <td className="text-neutral-500">—</td>
              <td>{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
