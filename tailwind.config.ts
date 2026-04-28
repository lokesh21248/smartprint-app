import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2E8B57",
          dark: "#1F6B42",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#1F4E79",
          foreground: "#FFFFFF",
        },
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        bg: {
          primary: "#FAFAFA",
          card: "#FFFFFF",
        },
        border: "#E5E7EB",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-red": "pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-in": "slideIn 0.3s ease-out",
        "fade-in": "fadeIn 0.2s ease-out",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
