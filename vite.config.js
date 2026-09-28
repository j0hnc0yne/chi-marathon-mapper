import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Derived from the data's content rather than the build time, so it changes
// exactly when the course data changes and not on every rebuild (COURSE-032).
const courseDataVersion = createHash("sha256")
  .update(readFileSync(new URL("./public/data/course-data.json", import.meta.url)))
  .digest("hex")
  .slice(0, 12);

export default defineConfig({
  // Relative base so the built site works from GitHub Pages' /repo-name/ subpath.
  base: "./",
  define: {
    __COURSE_DATA_VERSION__: JSON.stringify(courseDataVersion),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
