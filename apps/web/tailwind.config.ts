import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          night: "#0f172a",
          teal: "#14b8a6",
          gold: "#f59e0b",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
