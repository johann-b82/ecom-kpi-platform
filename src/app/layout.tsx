import './globals.css';
import type { CSSProperties, ReactNode } from 'react';
import { Roboto } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import { getBranding, darken } from '@/lib/settings';

const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto', display: 'swap' });

export const metadata = { title: 'Unified Data Platform' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { color } = await getBranding();
  const brandStyle = { '--brand': color, '--brand-dark': darken(color) } as CSSProperties;
  return (
    <html lang="de" className={roboto.variable} style={brandStyle} suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
