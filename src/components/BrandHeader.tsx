// Shared brand block: BRYX logo · "Unified Data Platform" / "Own the core".
// Used in the dashboard header and on the login screen.
export function BrandHeader() {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bryx-logo.svg" alt="BRYX" className="h-9 w-auto" />
      <span className="h-8 w-px bg-neutral-300 dark:bg-neutral-700" />
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Unified Data Platform</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Own the core</p>
      </div>
    </div>
  );
}
