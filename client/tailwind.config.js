/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Brand scale built from linear-gradient(90deg, #8EC400, #1E293B) — the
         * lime is `brand-600`, the slate end is already `ink-800`.
         *
         * The scale splits at 600/700 on purpose. Lime is far too bright to read
         * as text (white on #8EC400 is 2.1:1, and #8EC400 on white is the same),
         * so:
         *   50–400  tints and washes
         *   500–600 fills — always paired with `text-ink-900`, hover lightens to 500
         *   700–900 text and icons — dark enough to pass AA on white (700 is 5.0:1)
         */
        brand: {
          50: '#f9feec',
          100: '#f0fccf',
          200: '#e0f99f',
          300: '#cef764',
          400: '#c0f631',
          500: '#a6e600',
          600: '#8ec400',
          700: '#597a00',
          800: '#435c00',
          900: '#304200',
        },
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(90deg, #8EC400 0%, #1E293B 100%)',
      },
      fontFamily: {
        sans: ['Alata', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        pop: '0 12px 32px -8px rgb(16 24 40 / 0.18)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'none' } },
        'pulse-dot': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
      },
      animation: {
        'fade-up': 'fade-up 180ms ease-out',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
