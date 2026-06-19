import './globals.css';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata = { title: 'KPI-Dashboard · SEE–THINK–DO–CARE' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
