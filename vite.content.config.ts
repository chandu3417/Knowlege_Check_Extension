import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(rootDir, "src/content/contentScript.ts"),
      name: "KnowledgeCheckContentScript",
      formats: ["iife"],
      fileName: () => "contentScript.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

