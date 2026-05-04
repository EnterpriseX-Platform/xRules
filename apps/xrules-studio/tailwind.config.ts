import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        bg:       'rgb(var(--c-bg) / <alpha-value>)',
        surface:  'rgb(var(--c-surface) / <alpha-value>)',
        elevated: 'rgb(var(--c-elevated) / <alpha-value>)',
        sidebar:  'rgb(var(--c-sidebar) / <alpha-value>)',
        border:   'rgb(var(--c-border) / <alpha-value>)',
        muted:    'rgb(var(--c-muted) / <alpha-value>)',
        text:     'rgb(var(--c-text) / <alpha-value>)',
        subtle:   'rgb(var(--c-subtle) / <alpha-value>)',
        accent:   'rgb(var(--c-accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--c-accent-fg) / <alpha-value>)',
        ok:       'rgb(var(--c-ok) / <alpha-value>)',
        warn:     'rgb(var(--c-warn) / <alpha-value>)',
        danger:   'rgb(var(--c-danger) / <alpha-value>)',
        info:     'rgb(var(--c-info) / <alpha-value>)',
        mint:     'rgb(var(--c-mint) / <alpha-value>)',
        engine: {
          rules: 'rgb(var(--c-eng-rules) / <alpha-value>)',
          pmml:  'rgb(var(--c-eng-pmml) / <alpha-value>)',
          ml:    'rgb(var(--c-eng-ml) / <alpha-value>)',
          llm:   'rgb(var(--c-eng-llm) / <alpha-value>)',
        },
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      letterSpacing: {
        label: '0.08em',
      },
      backgroundImage: {
        'dot-pattern': 'radial-gradient(circle, rgb(var(--c-dot)) 1px, transparent 1px)',
      },
      backgroundSize: {
        'dot': '24px 24px',
      },
    },
  },
  plugins: [],
};

export default config;
