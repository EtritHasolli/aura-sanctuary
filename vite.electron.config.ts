import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "electron-dist",
    emptyOutDir: true,
    minify: false,
    target: "node20",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "electron/main.ts"),
        preload: path.resolve(__dirname, "electron/preload.ts"),
      },
      external: [
        "electron",
        "electron-updater",
        "node:path",
        "node:url",
        "node:fs",
        "node:os",
        "node:crypto",
        "path",
        "url",
        "fs",
        "os",
        "crypto",
      ],
      output: {
        format: "cjs",
        entryFileNames: "[name].cjs",
      },
    },
  },
});
