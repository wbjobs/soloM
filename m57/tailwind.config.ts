import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#E8F3FF",
          100: "#BEDAFF",
          200: "#94C2FF",
          300: "#6AA9FF",
          400: "#4090FF",
          500: "#165DFF",
          600: "#0E42D2",
          700: "#0A2BA0",
          800: "#061A6E",
          900: "#030E42",
        },
        success: {
          50: "#E8FFEA",
          100: "#B3FFBA",
          200: "#80FF8D",
          300: "#4DFF5F",
          400: "#26E53B",
          500: "#00B42A",
          600: "#009A29",
          700: "#007D27",
          800: "#006022",
          900: "#004A1E",
        },
        warning: {
          50: "#FFF3E8",
          100: "#FFD9B3",
          200: "#FFBD80",
          300: "#FFA24D",
          400: "#FF8A26",
          500: "#FF7D00",
          600: "#D96A00",
          700: "#B35700",
          800: "#8C4400",
          900: "#6B3500",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "pulse-slow": "pulse 3s infinite",
        "gradient": "gradient 8s ease infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        gradient: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
