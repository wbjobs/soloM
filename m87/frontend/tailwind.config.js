/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-dark': '#0a0e17',
        'bg-card': '#111827',
        'buy-green': '#00c087',
        'sell-red': '#ff4757',
        'info-blue': '#1890ff',
        'text-primary': '#e5e7eb',
        'text-secondary': '#9ca3af',
        'border-dark': '#1f2937',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 0.3s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'flash-green': 'flashGreen 0.5s ease-out',
        'flash-red': 'flashRed 0.5s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        flashGreen: {
          '0%': { backgroundColor: 'rgba(0, 192, 135, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
        flashRed: {
          '0%': { backgroundColor: 'rgba(255, 71, 87, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
}
