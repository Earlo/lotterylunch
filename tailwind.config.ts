import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0e0f12',
        haze: '#f5f3ef',
        ember: '#ff6b35',
        moss: '#0f4c3a',
      },
      boxShadow: {
        lift: '0 10px 30px rgba(14, 15, 18, 0.15)',
      },
    },
  },
  plugins: [],
};

export default config;
