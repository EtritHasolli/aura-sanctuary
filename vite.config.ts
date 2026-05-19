import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, mergeConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

function applyWatchDebounceDefaults(config: UserConfig): UserConfig {
  const existingWatch = config.server?.watch ?? {};
  const existingAwaitWriteFinish = existingWatch.awaitWriteFinish;
  const hasAwaitWriteFinishObject =
    !!existingAwaitWriteFinish &&
    typeof existingAwaitWriteFinish === "object" &&
    !Array.isArray(existingAwaitWriteFinish);
  return mergeConfig(config, {
    server: {
      watch: {
        ...existingWatch,
        awaitWriteFinish: {
          ...(hasAwaitWriteFinishObject ? existingAwaitWriteFinish : {}),
          stabilityThreshold: 1000,
          pollInterval: 100,
        },
      },
    },
  });
}

export default defineConfig(async ({ command, mode }) => {
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadedEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const plugins: import("vite").PluginOption[] = [
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    TanStackRouterVite(),
    react(),
  ];

  // When building for Electron, music files are shipped via extraResources
  // (loaded from disk via IPC). Strip them from dist/ to avoid doubling size.
  const isElectronBuild = process.env.ELECTRON_BUILD === "1";
  const electronMusicExclude = isElectronBuild
    ? [
        {
          name: "exclude-music-assets",
          generateBundle(_opts: unknown, bundle: Record<string, unknown>) {
            for (const key of Object.keys(bundle)) {
              if (/\.(mp3|flac|wav|ogg|m4a|aac|opus|wma)$/.test(key)) delete bundle[key];
            }
          },
        },
      ]
    : [];

  let config: UserConfig = {
    base: command === "build" ? "./" : "/",
    define: envDefine,
    build: {
      rollupOptions: { plugins: electronMusicExclude },
    },
    resolve: {
      alias: {
        "@": `${process.cwd()}/src`,
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins,
  };

  config = mergeConfig({ server: { host: "::", port: 8080 } }, config);
  return applyWatchDebounceDefaults(config);
});
