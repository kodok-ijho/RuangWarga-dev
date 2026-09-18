/** @type {import('tailwindcss').Config} */
// Tema disesuaikan dengan logo Palm Village:
//  - forest: hijau gelap (#1a3d2e) -> background & elemen utama
//  - gold:    emas (#d4af37)        -> aksen, CTA, highlight
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palet utama logo
        forest: {
          50: '#f1f6f3',
          100: '#dde9e2',
          200: '#bcd3c5',
          300: '#8eb39d',
          400: '#5e8c70',
          500: '#3d6e51',
          600: '#2c5640',
          700: '#234534',
          800: '#1a3d2e', // warna dominan logo
          900: '#13291f',
          950: '#0a1813',
        },
        gold: {
          50: '#fbf7ec',
          100: '#f5ecd0',
          200: '#ecd89e',
          300: '#e2c462',
          400: '#d9b244',
          500: '#d4af37', // warna emas logo
          600: '#b8922c',
          700: '#937024',
          800: '#7a5a24',
          900: '#684b23',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(10, 24, 19, 0.04), 0 1px 1px rgba(10, 24, 19, 0.02)',
        card: '0 1px 3px rgba(10, 24, 19, 0.06), 0 1px 2px rgba(10, 24, 19, 0.03)',
        popover: '0 10px 25px -5px rgba(10, 24, 19, 0.1), 0 8px 10px -6px rgba(10, 24, 19, 0.05)',
        elevated: '0 12px 32px rgba(10, 24, 19, 0.12), 0 4px 8px rgba(10, 24, 19, 0.04)',
      },
    },
  },
  plugins: [],
};
