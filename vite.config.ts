import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";

// Plugin to remove type="module" from script tags for IINA compatibility
const removeModuleType = (): Plugin => ({
  name: "remove-module-type",
  transformIndexHtml(html) {
    // Replace type="module" with defer to ensure DOM is ready before execution
    return html.replace(/<script\s+type="module"\s+crossorigin\s+/g, "<script defer ");
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), removeModuleType()],
  base: "./", // Use relative paths for plugin context
  build: {
    outDir: "dist/sidebar",
    emptyOutDir: false,
    target: "es2015", // Target older browsers (ES2015/ES6)
    rollupOptions: {
      output: {
        format: "iife", // Output as IIFE (Immediately Invoked Function Expression)
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
