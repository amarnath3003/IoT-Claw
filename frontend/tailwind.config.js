/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        neu: {
          base: '#212529',
          dark: '#1a1d21',
          text: '#e0e0e0',
          dim: '#8a8f98',
          accent: '#1a4dff',
          warning: '#ffb300',
        },
      },
      borderRadius: {
        xl: '20px',
        '2xl': '30px',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}