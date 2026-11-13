import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: "plugin/entry.ts",
      formats: ["iife"],
      name: "IINAYouTubeChatPlugin",
      fileName: () => "main.js",
    },
    outDir: "dist",
    emptyOutDir: false,
    // IINA runs the plugin script in the system JavaScriptCore; keep the syntax level of earlier builds
    // (optional chaining is fine, class fields are lowered to constructor assignments)
    target: "safari13.1",
    rolldownOptions: {
      output: {
        // Ensure the IIFE assigns to the global scope without wrapping
        extend: true,
      },
    },
  },
});
