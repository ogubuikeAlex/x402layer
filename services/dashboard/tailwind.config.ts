import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        nav: '821px',
      },
      colors: {
        bg: 'var(--bg)',
        bg2: 'var(--bg2)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        accent: 'var(--accent)',
        accent2: 'var(--accent2)',
        accent3: 'var(--accent3)',
        'accent-warn': 'var(--accent-warn)',
        'accent-alt': 'var(--accent-alt)',
        text: 'var(--text)',
        'text-mid': 'var(--text-mid)',
        'text-dim': 'var(--text-dim)',
        hairline: 'var(--border)',
        'hairline-accent': 'var(--border-accent)',
      },
      fontFamily: {
        display: ['var(--font-syne)', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      borderColor: {
        DEFAULT: 'var(--border)',
      },
      letterSpacing: {
        label: '0.2em',
        wide2: '0.12em',
      },
    },
  },
  plugins: [],
};

export default config;
