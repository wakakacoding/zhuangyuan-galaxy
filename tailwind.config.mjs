/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,tsx,ts,jsx,js}'],
  theme: {
    extend: {
      colors: {
        xuan: '#0E1621',
        dai: '#16233A',
        jin: '#C9A227',
        mi: '#F2EAD8',
        miDim: '#9AA5B1',
        zhusha: '#C03F2B',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', 'STSong', 'SimSun', 'serif'],
        kai: ['Kaiti SC', 'KaiTi', 'STKaiti', 'serif'],
      },
    },
  },
  plugins: [],
};
