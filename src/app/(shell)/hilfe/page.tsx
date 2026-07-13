import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/groups';
import { HELP_USER_PAGES, HELP_ADMIN_PAGES, type DocPage } from '@/lib/help/content';
import { AdminOnlyTag } from '@/components/AdminOnlyTag';

export const dynamic = 'force-dynamic';

function Card({ page }: { page: DocPage }) {
  return (
    <Link
      href={`/hilfe/${page.slug}`}
      className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-accent/40 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <p className="font-semibold text-neutral-900 dark:text-neutral-100">{page.title}</p>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{page.summary}</p>
    </Link>
  );
}

export default async function HilfeHome() {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Hilfe & Dokumentation</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Kurze Erklärungen zu den Modulen der Plattform.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {HELP_USER_PAGES.map((p) => <Card key={p.slug} page={p} />)}
      </div>

      {access.isAdmin && (
        <>
          <h2 className="mt-10 flex items-center gap-2">
            <span className="anno text-neutral-500 dark:text-neutral-400">Administration</span>
            <AdminOnlyTag />
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {HELP_ADMIN_PAGES.map((p) => <Card key={p.slug} page={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
