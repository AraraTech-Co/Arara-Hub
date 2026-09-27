module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          300: '#8F8FF7',
          400: '#6A6AB8',
          500: '#6363ac',
          600: '#545491',
          700: '#3E3E6B',
        }
      },
      animation: {
        loading: 'rotate 1s linear infinite',
      }
    },
    fontFamily: {
      sans: ['Source Sans Pro', 'sans-serif'],
    },
  },
  plugins: [],
}
