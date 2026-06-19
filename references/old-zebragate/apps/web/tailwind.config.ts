import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        surface: "#f6f8fb",
        brand: "#0f766e",
        warn: "#b54708"
      }
    }
  },
  plugins: []
};

export default config;
