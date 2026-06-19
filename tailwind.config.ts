import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: { brand: { DEFAULT: '#D9004C', dark: '#B0003D' } },
      fontFamily: {
        sans: ['var(--font-roboto)', 'system-ui', 'sans-serif'],
        display: ['var(--font-poppins)', 'var(--font-roboto)', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
