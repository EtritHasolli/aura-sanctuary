import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

function copyMiniPlayerPlugin(): Plugin {
  return {
    name: "copy-mini-player-html",
    closeBundle() {
      mkdirSync("electron-dist", { recursive: true });
      copyFileSync(
        path.resolve(__dirname, "electron/mini-player.html"),
        path.resolve(__dirname, "electron-dist/mini-player.html"),
      );
    },
  };
}

export default defineConfig({
  plugins: [copyMiniPlayerPlugin()],
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
        "dotenv",
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
