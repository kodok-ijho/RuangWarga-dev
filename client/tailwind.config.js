/** @type {import('tailwindcss').Config} */
// Tema disesuaikan dengan logo Palm Village:
//  - forest: hijau gelap (#1a3d2e) -> background & elemen utama
//  - gold:    emas (#d4af37)        -> aksen, CTA, highlight
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    screens: {
      xs: '360px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1440px',
    },
    extend: {
      colors: {
        // RuangWarga Neutral Brand System (80–90% surfaces & text)
        rw: {
          brand: '#0f172a', // Slate-900 (primary neutral brand)
          accent: '#2563eb', // Clean digital blue (secondary global accent)
          surface: '#f8fafc', // Slate-50 background
          card: '#ffffff', // Card surface
          border: '#e2e8f0', // Slate-200 border
          text: '#0f172a', // Text primary
          muted: '#64748b', // Text muted
        },
        // Tenant Accent Scoped Colors (fallback or dynamically bound to CSS vars)
        tenant: {
          primary: 'var(--tenant-primary, #1a3d2e)',
          accent: 'var(--tenant-accent, #d4af37)',
        },
        // Palet legacy/tenant default (dipertahankan untuk Palm Village & backward-compat)
        forest: {
          50: '#f1f6f3',
          100: '#dde9e2',
          200: '#bcd3c5',
          300: '#8eb39d',
          400: '#5e8c70',
          500: '#3d6e51',
          600: '#2c5640',
          700: '#234534',
          800: '#1a3d2e', // warna dominan Palm Village
          900: '#13291f',
          950: '#0a1813',
        },
        gold: {
          50: '#fbf7ec',
          100: '#f5ecd0',
          200: '#ecd89e',
          300: '#e2c462',
          400: '#d9b244',
          500: '#d4af37', // warna emas Palm Village
          600: '#b8922c',
          700: '#937024',
          800: '#7a5a24',
          900: '#684b23',
        },
      },
      borderRadius: {
        'rw-sm': '6px',
        'rw-md': '8px',
        'rw-lg': '12px',
        'rw-xl': '16px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'rw-none': 'none',
        'rw-subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'rw-card': '0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'rw-popover': '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
        'rw-modal': '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        subtle: '0 1px 2px rgba(10, 24, 19, 0.04), 0 1px 1px rgba(10, 24, 19, 0.02)',
        card: '0 1px 3px rgba(10, 24, 19, 0.06), 0 1px 2px rgba(10, 24, 19, 0.03)',
        popover: '0 10px 25px -5px rgba(10, 24, 19, 0.1), 0 8px 10px -6px rgba(10, 24, 19, 0.05)',
        elevated: '0 12px 32px rgba(10, 24, 19, 0.12), 0 4px 8px rgba(10, 24, 19, 0.04)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '200ms',
        slow: '300ms',
      },
      transitionTimingFunction: {
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
