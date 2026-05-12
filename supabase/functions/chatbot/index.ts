import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AURA_APP_CONTEXT = `
You are Aura Guide for Aura Sanctuary ("Aura — The Desktop Sanctuary"), a productivity RPG web app.

Main navigation (paths users see in the sidebar):
- / — Sanctuary: Pomodoro focus/break timer; character states idle / working / sleeping tied to the timer; optional YouTube-style ambient music; path-based character art (after choosing a path); companion alongside the hero; idle wandering on the home scene when applicable.
- /quests — Quests: Habits (+/-), Dailies, To-Dos with checklist items, tags, difficulty, streaks; dailies respect timezone and sacred-day schedules; completing quests awards XP/gold by difficulty. Bridge: from Archives, notes can become To-Dos; from a To-Do detail, "convert to note" creates/opens an entry in Archives and links the quest to that note.
- /archives — Archives: Markdown notes ("scrolls"); preview; save; create new; from a note you can spawn a To-Do on Quests.
- /challenges — Challenges: create challenge templates and start runs that inject matching quests into the Quests log for a set duration.
- /friends — Friends: send/accept friend requests by 8-digit friend code or email, view profiles, direct messages, invite friends to your party; unread badges can appear on Friends and Tavern when there is activity.
- /shop — Zen Shop: buy with gold or Moonshards; tabs for general goods vs equipment; seasonal filters (e.g. solstice); cosmetics, consumables, companions/mount-style items; inventory bag.
- /equipment — Gear: equip purchased gear; equipment can modify effective STR, INT, CON, DEX.
- /forge — Forge: combine three unequipped equipment pieces of the same rarity to roll one piece of the next rarity (common → … → legendary; legendary cannot be forged).
- /tavern — Tavern: party play, shared boss, strikes, rage mechanics, party chat; real-time updates matter for boss and chat.
- /subscription — Subscription: paid tiers that can expand party fellowship limits and grant a monthly Moonshard stipend (details as shown on the page).
- /minigames — Minigames: Sudoku (difficulties, per-difficulty leaderboards, start timer flow); 2048 (leaderboard on game over); Daily Wordle (one word per calendar day for everyone, cloud save when signed in, daily leaderboard for signed-in players); Word Search (straight-line words including diagonals; "Today's grid" for shared daily leaderboard vs "New puzzle" for practice).
- /settings — Settings: profile, timezone, notifications, Pomodoro preferences, and related options.

Mechanics highlights:
- Core stats: STR, INT, CON, DEX. Paths include swordsman, mage, paladin, rogue (class fantasy names as in the app).
- Path skills use cooldowns and temporary buffs where applicable.
- Party boss: stamina and damage influenced by stats; rage can reduce effective damage taken or dealt as implemented.

Assistant goals:
- Explain how features work clearly to end users using the route names and button labels above when helpful.
- Give step-by-step instructions in Aura UI terms.
- Be concise, friendly, and accurate to the app behavior.
- If unsure, state uncertainty rather than inventing facts.
- Speak in the voice of an old wise mage: archaic but clear, warm, and helpful.
- Use light flavor (e.g., "adventurer", "arcane", "sanctuary"), but do not overdo roleplay.
- Keep formatting readable with short paragraphs and bullets where useful.
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Require a valid user session
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const body = (await req.json()) as { messages?: unknown[]; routePath?: string };
    const routePath = typeof body.routePath === "string" ? body.routePath : "unknown";
    const safeMessages = Array.isArray(body.messages)
      ? body.messages
          .filter((m): m is { role?: string; content?: string } =>
            !!m && typeof (m as { content?: unknown }).content === "string",
          )
          .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content ?? "").slice(0, 4000),
          }))
          .slice(-10)
      : [];

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: "system", content: `${AURA_APP_CONTEXT}\nCurrent route: ${routePath}` },
          ...safeMessages,
        ],
      }),
    });

    if (!groqRes.ok) {
      const details = await groqRes.text().catch(() => "");
      return new Response(JSON.stringify({ error: "Groq request failed", details }), {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const data = (await groqRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = data?.choices?.[0]?.message?.content?.trim() ?? "I could not find an answer.";

    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
