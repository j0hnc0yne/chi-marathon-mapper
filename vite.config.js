import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built site works from GitHub Pages' /repo-name/ subpath.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
