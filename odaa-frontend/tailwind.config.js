/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Font stack matched from spendwize (style.css `body{font-family:...}`)
        display: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef5ff',
          100: '#dcebff',
          200: '#b6d6ff',
          300: '#84b9ff',
          400: '#4f94ff',
          500: '#2570f5',
          600: '#1554d6',
          700: '#1141ab',
          800: '#123689',
          900: '#132f6e',
          950: '#0c1c44',
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
        soft: '0 1px 2px rgba(16, 30, 66, 0.06), 0 8px 24px -12px rgba(16, 30, 66, 0.12)',
        card: '0 1px 3px rgba(16, 30, 66, 0.06), 0 2px 12px -4px rgba(16, 30, 66, 0.10)',
        glow: '0 0 0 1px rgba(37, 112, 245, 0.08), 0 12px 32px -8px rgba(37, 112, 245, 0.28)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #1554d6 0%, #2570f5 45%, #5aa4ff 100%)',
        'mesh': 'radial-gradient(at 0% 0%, rgba(37,112,245,0.10) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(90,164,255,0.12) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(21,84,214,0.08) 0px, transparent 50%)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
}
