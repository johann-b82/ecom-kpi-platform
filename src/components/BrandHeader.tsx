import { getBranding } from '@/lib/settings';

// Shared brand block: configurable logo · headline / subline (see /setup → Branding).
// Used in the dashboard header and on the login screen.
export async function BrandHeader() {
  const { title, tagline, logo } = await getBranding();
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo || '/bryx-logo.svg'} alt={title} className="h-9 w-auto" />
      <span className="h-8 w-px bg-neutral-300 dark:bg-neutral-700" />
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{tagline}</p>
      </div>
    </div>
  );
}
