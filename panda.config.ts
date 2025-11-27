import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  // Whether to use css reset
  preflight: true,

  // Enable JSX components
  jsxFramework: "react",

  // Where to look for your css declarations
  include: ["./src/**/*.{js,jsx,ts,tsx}", "./pages/**/*.{js,jsx,ts,tsx}"],

  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: {
      tokens: {
        colors: {
          // Base colors
          background: { value: "#1a1a1a" },
          surface: { value: "#242424" },
          text: {
            primary: { value: "#e5e7eb" },
            secondary: { value: "#888888" },
            muted: { value: "#9ca3af" },
          },
          // Author colors by badge type
          author: {
            default: { value: "#a0a0a0" },
            owner: { value: "#000000" },
            ownerBg: { value: "#ffd600" },
            moderator: { value: "#5e84f1" },
            member: { value: "#2ba640" },
          },
          // Badge icon colors
          badge: {
            verified: { value: "#aaaaaa" },
            owner: { value: "#ffd600" },
            moderator: { value: "#5e84f1" },
            member: { value: "#2ba640" },
          },
          // Message type colors
          message: {
            superchat: { value: "#ffca28" },
            superchatHeader: { value: "#ffb300" },
            membership: { value: "#0f9d58" },
            membershipHeader: { value: "#0b8043" },
            gift: { value: "#7b1fa2" },
            giftHeader: { value: "#6a1b9a" },
            system: { value: "#333333" },
          },
          // Status colors
          status: {
            info: { value: "#9ca3af" },
            infoBg: { value: "rgba(156, 163, 175, 0.1)" },
            error: { value: "#f87171" },
            errorBg: { value: "rgba(239, 68, 68, 0.1)" },
            errorButton: { value: "#dc2626" },
            errorButtonHover: { value: "#b91c1c" },
            loading: { value: "#60a5fa" },
            loadingBg: { value: "rgba(59, 130, 246, 0.1)" },
            loadingBorder: { value: "rgba(59, 130, 246, 0.2)" },
          },
          // UI colors
          ui: {
            scrollButton: { value: "rgba(59, 130, 246, 0.9)" },
            scrollButtonHover: { value: "rgba(59, 130, 246, 1)" },
            indicatorActive: { value: "rgba(59, 130, 246, 0.8)" },
            indicatorInactive: { value: "rgba(100, 100, 100, 0.3)" },
          },
        },
        radii: {
          message: { value: "0.375rem" },
          button: { value: "0.25rem" },
          avatar: { value: "50%" },
          badge: { value: "2px" },
        },
        sizes: {
          avatar: {
            sm: { value: "24px" },
            md: { value: "32px" },
            lg: { value: "40px" },
          },
          badge: { value: "14px" },
          scrollButton: { value: "36px" },
        },
        spacing: {
          message: {
            padding: { value: "0.5rem 0.75rem" },
            gap: { value: "0.5rem" },
          },
        },
      },
      keyframes: {
        spin: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },

  // The output directory for your css system
  outdir: "styled-system",
});
