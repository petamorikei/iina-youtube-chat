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
    outDir: "dist/io.github.petamorikei.iina-youtube-chat.iinaplugin",
    emptyOutDir: false,
    rollupOptions: {
      output: {
        // Ensure the IIFE assigns to the global scope without wrapping
        extend: true,
      },
    },
  },
});
