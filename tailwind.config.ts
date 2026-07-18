import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: 'var(--brand)', dark: 'var(--brand-dark)' },
        accent: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)' },
        // Warm neutral scale — overrides Tailwind's cold gray so existing neutral-* classes warm up.
        neutral: {
          0: '#ffffff',
          50: '#fafaf8',
          100: '#f5f2ec',
          150: '#eceae4',
          200: '#e8e4dc',
          300: '#d8d4cc',
          400: '#c4c0b8',
          500: '#9a9488',
          600: '#6b6560',
          700: '#4a4540',
          800: '#2e2a26',
          900: '#1e1c1a',
          950: '#171513',
        },
        success: { subtle: 'rgba(22,163,74,0.10)', DEFAULT: '#166534', border: 'rgba(22,163,74,0.25)' },
        danger: { subtle: 'rgba(220,38,38,0.08)', DEFAULT: '#dc2626', border: 'rgba(220,38,38,0.25)' },
        warning: { subtle: 'rgba(217,119,6,0.10)', DEFAULT: '#b45309', border: 'rgba(217,119,6,0.25)' },
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xs: '3px', sm: '4px', md: '6px', lg: '8px', xl: '10px', '2xl': '12px' },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06)',
        popover: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(217,119,6,0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config;
