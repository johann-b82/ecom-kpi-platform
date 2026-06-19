'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Branding } from '@/lib/settings';

const inputClass =
  'w-full rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function BrandingForm({ initial }: { initial: Branding }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [tagline, setTagline] = useState(initial.tagline);
  const [logo, setLogo] = useState<string | null>(initial.logo);
  const [color, setColor] = useState(initial.color);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setMsg('Logo zu groß — bitte unter 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, tagline, logo, color }),
    });
    setBusy(false);
    setMsg('Branding gespeichert.');
    router.refresh();
  }

  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Branding</h2>
      <div className="grid grid-cols-[14rem_1fr] items-center gap-x-3 gap-y-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        {/* Logo */}
        <label className="text-sm text-neutral-700 dark:text-neutral-300">Logo</label>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo || '/bryx-logo.svg'} alt="Logo" className="h-9 w-auto rounded bg-neutral-100 p-1 dark:bg-neutral-800" />
          <input type="file" accept="image/*" onChange={onFile} className="text-sm text-neutral-600 file:mr-3 file:rounded file:border-0 file:bg-neutral-200 file:px-2 file:py-1 file:text-sm dark:text-neutral-400 dark:file:bg-neutral-700 dark:file:text-neutral-100" />
          {logo && (
            <button type="button" className="text-xs text-red-600 dark:text-red-400" onClick={() => setLogo(null)}>
              Standard-Logo
            </button>
          )}
        </div>
        {/* Headline */}
        <label className="text-sm text-neutral-700 dark:text-neutral-300">Headline</label>
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        {/* Subline */}
        <label className="text-sm text-neutral-700 dark:text-neutral-300">Subline</label>
        <input className={inputClass} value={tagline} onChange={(e) => setTagline(e.target.value)} />
        {/* Akzentfarbe */}
        <label className="text-sm text-neutral-700 dark:text-neutral-300">Akzentfarbe</label>
        <div className="flex items-center gap-3">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-neutral-300 bg-transparent dark:border-neutral-700" />
          <span className="text-sm text-neutral-600 dark:text-neutral-400">{color}</span>
        </div>
        {/* Save */}
        <div />
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={busy} className="rounded bg-brand px-3 py-1 text-sm text-white disabled:opacity-50">
            Speichern
          </button>
          {msg && <span className="text-sm text-neutral-600 dark:text-neutral-400">{msg}</span>}
        </div>
      </div>
    </section>
  );
}
