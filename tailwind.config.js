/** @type {import('tailwindcss').Config} */
// Antes o Tailwind vinha do CDN (cdn.tailwindcss.com) e, sem internet, o app
// abria sem estilo. Agora e compilado no build e vai junto no pacote do app.
// Mesma configuracao que estava no <script> do index.html.
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './views/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './i18n/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: '#D4AF37',
        'gold-dark': '#B8860B',
        dark: '#0A0A0A',
        'dark-card': '#1A1A1A',
      },
    },
  },
  plugins: [],
};
