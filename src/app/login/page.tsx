import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
