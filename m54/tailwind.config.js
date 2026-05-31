/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        dark: {
          900: '#0D1117',
          800: '#161B22',
          700: '#21262D',
          600: '#30363D',
          500: '#484F58',
          400: '#8B949E',
          300: '#B1BAC4',
          200: '#C9D1D9',
          100: '#E6EDF3',
        },
        emerald: {
          primary: '#00D68F',
          hover: '#00F5A0',
          dim: '#00D68F33',
        },
        purple: {
          accent: '#A371F7',
          dim: '#A371F733',
        },
        amber: {
          warning: '#FFB800',
          dim: '#FFB80033',
        },
      },
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
