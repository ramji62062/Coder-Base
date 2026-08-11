import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "ct-dark": "#000000",
        "ct-dark-black": "#0a0a0a",
        "ct-card": "#0d0d1a",
        "ct-card-alt": "#10101d",
        "ct-section": "#0a0a14",
        "ct-border": "#1a1a2e",
        "ct-input": "#1a1a2e",
        "ct-muted": "#888",
        "ct-dim": "#666",
        "ct-dimmer": "#555",
        "ct-subtle": "#333",
        "ct-panel": "#181820",
        "ct-header": "#121218",
        "ct-timer": "#0d0d0d",
        "ct-track": "#222222",
        "ct-vscode-bg": "#1e1e1e",
        "ct-vscode-sidebar": "#252526",
        "ct-vscode-tabs": "#2d2d30",
        "ct-vscode-border": "#3c3c3c",
        "ct-vscode-titlebar": "#3c3c3c",
      },
      animation: {
        "slide-up": "slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scaleInFade 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "float": "float 6s ease-in-out infinite",
        "pulse-glow": "pulseGlow 4s ease-in-out infinite",
        "fade-in": "fadeIn 0.15s ease-out",
      },
      keyframes: {
        slideUpFade: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleInFade: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-15px)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.5", filter: "blur(20px)" },
          "50%": { opacity: "0.8", filter: "blur(30px)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      fontFamily: {
        inter: ["Inter", "sans-serif"],
        mono: ["monospace"],
      },
      boxShadow: {
        "glow-white": "0 0 40px rgba(255,255,255,0.35)",
        "glow-white-lg": "0 0 50px rgba(255,255,255,0.4)",
        "card-hover": "0 12px 24px -10px rgba(255,255,255,0.15)",
        "float-panel": "0 24px 64px rgba(0,0,0,0.85), 0 0 24px rgba(255,255,255,0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
