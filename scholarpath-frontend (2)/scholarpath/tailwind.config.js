/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'sp-blue': '#125BC9',
        'sp-blue-dark': '#0C447C',
        'sp-blue-light': '#E6F1FB',
        'sp-navy': '#0F172A',
        'sp-slate': '#475569',
        'sp-border': '#E2E8F0',
        'sp-bg': '#F8FAFC',
        'sp-green': '#16A34A',
        'sp-green-light': '#ECFDF3',
        'sp-amber': '#B45309',
        'sp-amber-light': '#FEF3E2',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', '"DM Sans"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15,23,42,0.06), 0 1px 3px 0 rgba(15,23,42,0.06)',
        'card-lg': '0 4px 12px -2px rgba(15,23,42,0.08), 0 2px 6px -2px rgba(15,23,42,0.05)',
      },
    },
  },
  plugins: [],
}

