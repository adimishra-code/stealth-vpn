/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        stealth: {
          950: '#06081c',
          900: '#0a0e27',
          800: '#111733',
          700: '#1a2145',
          600: '#232c5c',
          500: '#4f46e5',
          400: '#6366f1',
          300: '#818cf8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
