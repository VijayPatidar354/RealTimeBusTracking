/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effdf8',
          100: '#d7faed',
          200: '#b2f4dc',
          300: '#7ee8c3',
          400: '#47d4a6',
          500: '#20b989',
          600: '#14966f',
          700: '#11775b',
          800: '#125f4c',
          900: '#104e40',
        },
        ink: {
          50: '#f7f9fb',
          100: '#eef2f6',
          200: '#d9e1ea',
          300: '#b8c6d5',
          400: '#91a5ba',
          500: '#71879f',
          600: '#586d82',
          700: '#47586a',
          800: '#3e4b59',
          900: '#24303c',
          950: '#151d26',
        },
      },
      boxShadow: {
        soft: '0 16px 48px -28px rgb(15 23 42 / 0.35)',
        panel: '0 8px 24px -18px rgb(15 23 42 / 0.45)',
      },
      animation: {
        'fade-in': 'fadeIn 180ms ease-out',
        'slide-in': 'slideIn 220ms ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
