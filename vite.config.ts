import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/com.petamorikei.youtube-chat.iinaplugin/sidebar",
    emptyOutDir: false,
  },
});
