/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Superfícies do painel, em escada: fundo, cartão, elevado.
        base: '#0b0d10',
        panel: '#12151a',
        raised: '#181c23',
        line: '#232935',
        ink: { DEFAULT: '#f2f4f7', soft: '#a8b0bd', mute: '#6b7482' },
        brand: { DEFAULT: '#3987e5', deep: '#2a78d6' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        rise: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(57,135,229,.45)' }, '100%': { boxShadow: '0 0 0 12px rgba(57,135,229,0)' } },
      },
      animation: { rise: 'rise .35s cubic-bezier(.2,.7,.3,1) both', ring: 'pulseRing 1.4s ease-out infinite' },
    },
  },
  plugins: [],
};
