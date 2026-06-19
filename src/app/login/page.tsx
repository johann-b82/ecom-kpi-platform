import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';
import { BrandHeader } from '@/components/BrandHeader';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-neutral-50 p-6 dark:bg-neutral-950">
      <BrandHeader />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
