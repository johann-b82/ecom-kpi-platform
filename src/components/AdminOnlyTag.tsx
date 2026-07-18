// Marker for UI that only admins can see. LockIcon for menu/nav rows;
// AdminOnlyTag (lock + .anno "Nur Admin" label) for headings and banners.

export function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-label="Nur für Admins"
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-accent ${className}`}
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function AdminOnlyTag() {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <LockIcon />
      <span className="anno text-neutral-400 dark:text-neutral-500">Nur Admin</span>
    </span>
  );
}
