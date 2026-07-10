'use client';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Reads `?focus=<id>` and highlights the matching dashboard rows. Rows opt in via
 * `data-focus="<id>"` (space-separated tokens allowed, matched with `~=`), so a single
 * row can be found by more than one id (e.g. a promotion by its own id or its product).
 * Mounted once in the brickpm layout; no-op when nothing matches.
 */
export function BpmFocus() {
  const focus = useSearchParams().get('focus');
  useEffect(() => {
    if (!focus) return;
    const els = document.querySelectorAll<HTMLElement>(`[data-focus~="${CSS.escape(focus)}"]`);
    if (els.length === 0) return;
    els.forEach((el) => el.classList.add('bpm-focus'));
    els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus]);
  return null;
}
