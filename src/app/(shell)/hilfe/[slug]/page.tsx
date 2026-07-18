import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/groups';
import { getHelpPage } from '@/lib/help/content';
import { DocArticle } from '@/components/help/DocArticle';

export const dynamic = 'force-dynamic';

export default async function HilfePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getHelpPage(slug);
  if (!page) notFound();

  if (page.admin) {
    const { data: { user } } = await createClient().auth.getUser();
    const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
    if (!access.isAdmin) redirect('/hilfe');
  }

  return <DocArticle page={page} />;
}
