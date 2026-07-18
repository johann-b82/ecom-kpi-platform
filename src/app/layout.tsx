import './globals.css';
import type { CSSProperties, ReactNode } from 'react';
import { Plus_Jakarta_Sans, DM_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import { getBranding, darken } from '@/lib/settings';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-jakarta', display: 'swap',
});
const dmMono = DM_Mono({
  subsets: ['latin'], weight: ['400', '500'], variable: '--font-dm-mono', display: 'swap',
});

export const metadata = { title: 'bryx' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { color } = await getBranding();
  const brandStyle = { '--brand': color, '--brand-dark': darken(color) } as CSSProperties;
  return (
    <html lang="de" className={`${jakarta.variable} ${dmMono.variable}`} style={brandStyle} suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
