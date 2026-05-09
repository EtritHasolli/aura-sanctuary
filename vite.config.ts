import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, mergeConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";

/** Surfaces TanStack server-fn errors over the dev WebSocket (same idea as former Lovable wrapper). */
function devServerFnErrorLogger() {
  const HMR_SEND_KEY = "__TANSTACK_SERVER_FN_HMR_SEND__";
  return {
    name: "dev-server-fn-error-logger",
    apply: "serve" as const,
    enforce: "pre" as const,
    configureServer(server: import("vite").ViteDevServer) {
      (globalThis as Record<string, unknown>)[HMR_SEND_KEY] = (data: unknown) => {
        server.ws.send({
          type: "custom",
          event: "server-fn-error",
          data,
        });
      };
    },
    transform(code: string, id: string) {
      const normalizedId = id.replace(/\\/g, "/");
      const isTargetModule =
        normalizedId.includes("/@tanstack/start-server-core/src/server-functions-handler.ts") ||
        normalizedId.includes("/@tanstack/start-server-core/dist/esm/server-functions-handler.js");
      if (!isTargetModule) return null;
      const needle = "const unwrapped = res.result || res.error";
      if (!code.includes(needle)) return null;
      return code.replace(
        needle,
        `${needle}

      if (res?.error) {
        const err = res.error
        const payload = {
          source: 'tanstack',
          type: 'server-fn-error',
          method: request.method,
          url: request.url,
          name: err?.name ?? 'Error',
          message: err?.message ?? String(err),
          stack: typeof err?.stack === 'string' ? err.stack : undefined,
        }
        globalThis.${HMR_SEND_KEY}?.(payload)
      }`,
      );
    },
  };
}

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

// Redirect TanStack Start's bundled server entry to src/server.ts (SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig(async ({ command, mode }) => {
  const plugins: import("vite").PluginOption[] = [
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    devServerFnErrorLogger(),
  ];

  if (command === "build") {
    plugins.push(
      cloudflare({
        viteEnvironment: { name: "ssr" },
      }),
    );
  }

  const tanstackStartOptions = mergeConfig(
    {
      importProtection: {
        behavior: "error" as const,
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    },
    { server: { entry: "server" } },
  );
  plugins.push(...tanstackStart(tanstackStartOptions));
  plugins.push(react());

  plugins.push({
    name: "tavern-chat-ws-dev",
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      const rooms = new Map<string, Set<WsSocket>>();
      const socketParty = new WeakMap<WsSocket, string | null>();

      const leaveRoom = (socket: WsSocket) => {
        const prevParty = socketParty.get(socket);
        if (!prevParty) return;
        const room = rooms.get(prevParty);
        if (!room) return;
        room.delete(socket);
        if (room.size === 0) rooms.delete(prevParty);
        socketParty.set(socket, null);
      };

      const joinRoom = (socket: WsSocket, partyId: string) => {
        leaveRoom(socket);
        const room = rooms.get(partyId) ?? new Set<WsSocket>();
        room.add(socket);
        rooms.set(partyId, room);
        socketParty.set(socket, partyId);
      };

      const fanout = (partyId: string, payload: unknown) => {
        const room = rooms.get(partyId);
        if (!room?.size) return;
        const raw = JSON.stringify(payload);
        for (const client of room) {
          if (client.readyState !== 1) continue;
          try {
            client.send(raw);
          } catch {
            // best-effort send
          }
        }
      };

      const attachSocket = (socket: WsSocket) => {
        socketParty.set(socket, null);

        socket.on("message", (raw) => {
          let packet: unknown;
          try {
            packet = JSON.parse(String(raw ?? ""));
          } catch {
            return;
          }
          if (!packet || typeof packet !== "object") return;
          const p = packet as { type?: string; partyId?: string; message?: unknown };

          if (p.type === "join") {
            const partyId = typeof p.partyId === "string" ? p.partyId.trim() : "";
            if (!partyId) return;
            joinRoom(socket, partyId);
            try {
              socket.send(JSON.stringify({ type: "joined", partyId }));
            } catch {
              // ignore ack failures
            }
            return;
          }
          if (p.type === "leave") {
            leaveRoom(socket);
            return;
          }
          if (p.type === "chat") {
            const partyId = typeof p.partyId === "string" ? p.partyId.trim() : "";
            if (!partyId || socketParty.get(socket) !== partyId) return;
            if (!p.message || typeof p.message !== "object") return;
            fanout(partyId, { type: "chat", message: p.message });
          }
        });

        socket.on("close", () => leaveRoom(socket));
        socket.on("error", () => leaveRoom(socket));
      };

      wss.on("connection", (socket, request) => {
        attachSocket(socket);
      });

      server.httpServer?.on("upgrade", (request, socket, head) => {
        const urlPath = (request.url ?? "").split("?")[0];
        if (urlPath !== "/ws/tavern") return;
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      });
    },
  });

  let envDefine: Record<string, string> = {};
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  for (const [key, value] of Object.entries(loadedEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  let config: UserConfig = {
    define: envDefine,
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
