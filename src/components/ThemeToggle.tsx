'use client';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Avoid a hydration mismatch: the resolved theme is only known on the client.
  if (!mounted) return <span className="inline-block h-6 w-11" aria-hidden="true" />;

  const isDark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Hell-/Dunkelmodus umschalten"
      title={isDark ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative inline-flex h-6 w-11 items-center rounded-full bg-neutral-300 transition-colors dark:bg-neutral-700"
    >
      <span
        className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-[10px] shadow transition-transform ${isDark ? 'translate-x-5' : 'translate-x-1'}`}
      >
        {isDark ? '🌙' : '☀️'}
      </span>
    </button>
  );
}
