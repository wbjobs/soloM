/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,vue}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        primary: '#00D4AA',
        alert: '#FF6B6B',
        info: '#4A90D9',
        'bg-primary': '#0D1117',
        'bg-secondary': '#161B22',
        'bg-card': 'rgba(22, 27, 34, 0.8)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Noto Sans SC', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
