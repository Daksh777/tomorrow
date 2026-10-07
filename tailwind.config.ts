import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14181f",
        paper: "#f6f4ef",
        band: "#e8a33d",
        quiet: "#5b8def",
        busy: "#e8743d",
      },
      fontFamily: { sans: ["ui-sans-serif", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
