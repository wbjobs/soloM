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
        background: "#0a0e1a",
        surface: "#1a1f2e",
        border: "#2a3040",
        accent: "#00e5ff",
        "accent-hover": "#40e9ff",
        kinetic: "#ff6b6b",
        potential: "#4ecdc4",
        total: "#ffd93d",
      },
      fontFamily: {
        sans: ['"Space Grotesk"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
