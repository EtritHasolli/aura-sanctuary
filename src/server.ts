import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

interface ChatbotRequestBody {
  routePath?: string;
  messages?: Array<{ role?: string; content?: string }>;
}

type TavernWsEnvelope =
  | { type: "join"; partyId?: string }
  | { type: "leave"; partyId?: string }
  | { type: "chat"; partyId?: string; message?: unknown };

const tavernRooms = new Map<string, Set<WebSocket>>();
const tavernSocketParty = new WeakMap<WebSocket, string | null>();

function leaveTavernRoom(socket: WebSocket) {
  const prevPartyId = tavernSocketParty.get(socket);
  if (!prevPartyId) return;
  const room = tavernRooms.get(prevPartyId);
  if (!room) return;
  room.delete(socket);
  if (room.size === 0) tavernRooms.delete(prevPartyId);
  tavernSocketParty.set(socket, null);
}

function joinTavernRoom(socket: WebSocket, partyId: string) {
  leaveTavernRoom(socket);
  const room = tavernRooms.get(partyId) ?? new Set<WebSocket>();
  room.add(socket);
  tavernRooms.set(partyId, room);
  tavernSocketParty.set(socket, partyId);
}

function broadcastTavernMessage(partyId: string, payload: unknown) {
  const room = tavernRooms.get(partyId);
  if (!room || room.size === 0) return;
  const raw = JSON.stringify(payload);
  for (const client of room) {
    try {
      client.send(raw);
    } catch {
      // Ignore broken sockets; close handler will prune references.
    }
  }
}

function handleTavernSocket(serverSocket: WebSocket) {
  tavernSocketParty.set(serverSocket, null);

  serverSocket.addEventListener("message", (event) => {
    try {
      const env = JSON.parse(String(event.data ?? "")) as TavernWsEnvelope;
      if (env.type === "join") {
        const partyId = typeof env.partyId === "string" ? env.partyId.trim() : "";
        if (!partyId) return;
        joinTavernRoom(serverSocket, partyId);
        return;
      }
      if (env.type === "leave") {
        leaveTavernRoom(serverSocket);
        return;
      }
      if (env.type === "chat") {
        const partyId = typeof env.partyId === "string" ? env.partyId.trim() : "";
        const activeParty = tavernSocketParty.get(serverSocket);
        if (!partyId || activeParty !== partyId) return;
        if (!env.message || typeof env.message !== "object") return;
        broadcastTavernMessage(partyId, { type: "chat", message: env.message });
      }
    } catch {
      // Ignore malformed websocket payloads.
    }
  });

  const cleanup = () => leaveTavernRoom(serverSocket);
  serverSocket.addEventListener("close", cleanup);
  serverSocket.addEventListener("error", cleanup);
}

function maybeHandleTavernWsUpgrade(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== "/ws/tavern") return null;

  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }
  if (typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== "function") {
    return new Response("WebSocketPair not supported in this runtime", { status: 501 });
  }

  const PairCtor = (globalThis as { WebSocketPair: new () => { 0: WebSocket; 1: WebSocket } })
    .WebSocketPair;
  const pair = new PairCtor();
  const clientSocket = pair[0];
  const serverSocket = pair[1];
  serverSocket.accept();
  handleTavernSocket(serverSocket);
  return new Response(null, { status: 101, webSocket: clientSocket } as ResponseInit & { webSocket: WebSocket });
}

const AURA_APP_CONTEXT = `
You are Aura Guide for Aura Sanctuary, a productivity RPG app.

Core app areas:
- Sanctuary: pomodoro timer, ambient audio, pet sprite.
- Quests: habits, dailies, todos with checklist, tags, sacred day scheduling and streaks.
- Tavern: party boss strikes, rage, chat, path skills.
- Shop/Forge/Equipment: items, consumables, cosmetics, equipment bonuses.
- Companions: hatch/equip pets and mounts.
- Settings: profile, timezone, notifications, pomodoro prefs.
- Challenges + quest arcs + achievements + moonshards.

Mechanics highlights:
- Habits, dailies, and todos grant XP/gold by difficulty.
- Stats: STR, INT, CON. Paths: warden, scholar, strider, keeper.
- Skills use cooldowns and temporary buffs.
- Dailies are timezone-aware with sacred day bitmask.
- Party boss uses stamina and strength-driven damage; rage reduces effective damage.

Assistant goals:
- Explain how features work clearly to end users.
- Give step-by-step instructions in Aura UI terms.
- Be concise, friendly, and accurate to the app behavior.
- If unsure, state uncertainty rather than inventing facts.
- Speak in the voice of an old wise mage: archaic but clear, warm, and helpful.
- Use light flavor (e.g., "adventurer", "arcane", "sanctuary"), but do not overdo roleplay.
- Keep formatting readable with short paragraphs and bullets where useful.
`;

function getGroqApiKey(env: unknown): string | null {
  const fromEnvObj =
    env && typeof env === "object" && "GROQ_API_KEY" in env
      ? (env as { GROQ_API_KEY?: unknown }).GROQ_API_KEY
      : undefined;
  if (typeof fromEnvObj === "string" && fromEnvObj.trim()) return fromEnvObj.trim();
  const fromProcess = typeof process !== "undefined" ? process.env.GROQ_API_KEY : undefined;
  if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess.trim();
  return null;
}

async function handleChatbotRequest(request: Request, env: unknown): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  const apiKey = getGroqApiKey(env);
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing GROQ_API_KEY on server" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const body = (await request.json().catch(() => ({}))) as ChatbotRequestBody;
  const routePath = typeof body.routePath === "string" ? body.routePath : "unknown";
  const safeMessages = Array.isArray(body.messages)
    ? body.messages
        .filter((m) => typeof m?.content === "string")
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content ?? "").slice(0, 4000),
        }))
        .slice(-10)
    : [];

  const payload = {
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    max_tokens: 700,
    messages: [
      {
        role: "system",
        content: `${AURA_APP_CONTEXT}\nCurrent route: ${routePath}`,
      },
      ...safeMessages,
    ],
  };

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!groqRes.ok) {
    const details = await groqRes.text().catch(() => "");
    return new Response(JSON.stringify({ error: "Groq request failed", details }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const data = (await groqRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = data?.choices?.[0]?.message?.content?.trim() ?? "I could not find an answer.";
  return new Response(JSON.stringify({ answer }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    const wsResponse = maybeHandleTavernWsUpgrade(request);
    if (wsResponse) return wsResponse;
    if (url.pathname === "/api/chatbot") {
      try {
        return await handleChatbotRequest(request, env);
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: "Chatbot endpoint failed" }), {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
