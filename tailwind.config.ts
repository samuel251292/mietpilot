import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f4f7fb",
          100: "#e8eef7",
          600: "#214a80",
          700: "#17375f",
          800: "#0e2746",
          900: "#071a31",
          950: "#031021",
        },
        gold: {
          400: "#d4af37",
          500: "#bd9630",
        },
      },
      boxShadow: {
        panel: "0 14px 45px rgba(7, 26, 49, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
