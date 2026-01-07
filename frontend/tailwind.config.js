/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        'zentria': {
          'primary-start': '#00C3FF',
          'primary-end': '#00E0D1',
          'accent': '#0074FF',
          'active': '#00E0D1',
          'sidebar': '#0D0F13',
          'bg': '#111316',
          'bg-alt': '#16191F',
        },
      },
    },
  },
  plugins: [],
}

