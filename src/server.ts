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
