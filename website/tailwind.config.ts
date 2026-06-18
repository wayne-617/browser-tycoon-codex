import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        cyan: "var(--cyan)",
        magenta: "var(--magenta)",
        violet: "var(--violet)",
        amber: "var(--amber)",
      },
      fontFamily: {
        pixel: ["var(--font-pixel)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
