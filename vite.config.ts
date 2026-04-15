import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

// GitHub Pages serves 404.html for any missing path.
// Copy index.html -> 404.html so SPA routing works on direct URL access.
function spa404Plugin(): Plugin {
  return {
    name: "spa-404",
    closeBundle() {
      const src = resolve("dist/index.html");
      const dest = resolve("dist/404.html");
      try {
        copyFileSync(src, dest);
      } catch {
        // ignore
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spa404Plugin()],
  base: "/github-project/",
});
