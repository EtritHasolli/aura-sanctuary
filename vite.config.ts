// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
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

          const attachSocket = (socket: WsSocket, requestUrl?: string) => {
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
            attachSocket(socket, request.url);
          });

          server.httpServer?.on("upgrade", (request, socket, head) => {
            const urlPath = (request.url ?? "").split("?")[0];
            if (urlPath !== "/ws/tavern") return;
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit("connection", ws, request);
            });
          });
        },
      },
    ],
  },
});
