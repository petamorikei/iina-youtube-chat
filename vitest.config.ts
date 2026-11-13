import { defineConfig } from "vitest/config";

// Unit tests for the plugin's pure modules. Kept separate from vite.config.ts so the
// chat UI's build settings (React plugin, browser targets) are not loaded for tests.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
