import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'KPI-Dashboard · SEE–THINK–DO–CARE' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
