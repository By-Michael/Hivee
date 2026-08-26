/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Sora"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#edfcf6',
          100: '#d3f7e9',
          200: '#a3edd4',
          300: '#63dcb9',
          400: '#2fc39d',
          500: '#17ab93',
          600: '#1594a8',
          700: '#1477a6',
          800: '#155f8b',
          900: '#154c70',
          950: '#0c1c44',
        },
        teal: {
          50: '#edfcf9',
          100: '#d1f7ef',
          200: '#a6ecdf',
          300: '#6fdbcb',
          400: '#3ddc97',
          500: '#22b8cf',
          600: '#1a97ab',
          700: '#177a89',
          800: '#166270',
          900: '#15505d',
        },
        ink: {
          50: '#f6f7fb',
          100: '#eceef5',
          200: '#d7dbe8',
          300: '#b2bad2',
          400: '#8790b3',
          500: '#666f94',
          600: '#4f5779',
          700: '#3e4462',
          800: '#2a2f47',
          900: '#191d2e',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 45, 55, 0.06), 0 8px 24px -12px rgba(15, 45, 55, 0.12)',
        card: '0 1px 3px rgba(15, 45, 55, 0.08), 0 4px 16px -4px rgba(15, 45, 55, 0.14)',
        glow: '0 0 0 1px rgba(34, 184, 207, 0.10), 0 12px 32px -8px rgba(37, 112, 245, 0.28)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #3ddc97 0%, #22b8cf 45%, #2570f5 100%)',
        'mesh': 'radial-gradient(at 0% 0%, rgba(61,220,151,0.12) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(34,184,207,0.12) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(37,112,245,0.10) 0px, transparent 50%)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
}
