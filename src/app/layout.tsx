import './globals.css';
import type { ReactNode } from 'react';
import { Roboto, Poppins } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';

const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto', display: 'swap' });
const poppins = Poppins({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-poppins', display: 'swap' });

export const metadata = { title: 'KPI-Dashboard · SEE–THINK–DO–CARE' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className={`${roboto.variable} ${poppins.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
