import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AURA_APP_CONTEXT = `
You are Aura Guide for Aura Sanctuary ("Aura — The Desktop Sanctuary"), a productivity RPG web app.

Main navigation (paths users see in the sidebar):
- / — Sanctuary: Pomodoro focus/break timer; character states idle / working / sleeping tied to the timer; optional YouTube-style ambient music; path-based character art (after choosing a path); companion alongside the hero; idle wandering on the home scene when applicable.
- /quests — Quests: Habits (+/-), Dailies, To-Dos with checklist items, tags, difficulty, streaks; dailies respect timezone and sacred-day schedules; completing quests awards XP/gold by difficulty. Bridge: from Archives, notes can become To-Dos; from a To-Do detail, "convert to note" creates/opens an entry in Archives and links the quest to that note. Quest Arcs are multi-step scroll-style progression storylines (e.g. "Shadow Cleansing"); completing arc steps earns gold, XP, and Moonshards.
- /archives — Archives: Markdown notes ("scrolls"); preview; save; create new; from a note you can spawn a To-Do on Quests.
- /challenges — Challenges: create challenge templates and start runs that inject matching quests into the Quests log for a set duration.
- /friends — Friends: send/accept friend requests by 8-digit friend code or email, view profiles, direct messages, invite friends to your party; unread badges can appear on Friends and Tavern when there is activity. Accepted friends can see your Habitica public profile snapshot if you have Habitica connected.
- /shop — Zen Shop: buy with gold or Moonshards; tabs for general goods vs equipment; seasonal filters (e.g. solstice); cosmetics, consumables, companion/pet items (hatch eggs to unlock companions), furniture; inventory bag. Forge-exclusive items cannot be purchased here.
- /equipment — Gear: equip purchased gear; equipment modifies effective STR, INT, CON, DEX, max stamina, XP%, and gold%.
- /forge — Forge: combine three unequipped equipment pieces of the same rarity to roll one piece of the next rarity (common → … → legendary; legendary cannot be forged as inputs).
- /tavern — Tavern: party play, shared boss, strikes, rage mechanics, party chat; real-time updates matter for boss and chat. Members can leave a party; party size cap is 10.
- /subscription — Subscription: up to 3 admin-managed tiers (free "Wanderer", "Adventurer" $4.99, "Legend" $9.99); higher tiers expand party ownership/join caps and grant a monthly Moonshard stipend; perks may include chat history, forge daily attempts, cosmetic borders.
- /minigames — Minigames: Sudoku (difficulties, per-difficulty leaderboards, start timer flow); 2048 (leaderboard on game over); Daily Wordle (one word per calendar day for everyone, cloud save when signed in, daily leaderboard for signed-in players); Word Search (straight-line words including diagonals; "Today's grid" for shared daily leaderboard vs "New puzzle" for practice).
- /settings — Settings: profile (avatar upload), timezone, notifications, Pomodoro preferences, and Habitica Sync section.

Mechanics highlights:
- Core stats: STR, INT, CON, DEX. Paths: Swordsman, Mage, Paladin (Tank), Rogue.
- Stat gain: Habit (+) → +1 STR; Daily → +1 CON; To-Do → +1 INT; Pomodoro → path-specific stat.
- Equipment adds cached bonus columns (equip_str_bonus, etc.) on the profile; effective stat = base + equip bonus.
- Path skills (temporary buffs, cooldown-based):
  • Swordsman — Battle Focus: flat pending-damage bonus per task (scales with effSTR); 20 min buff, ~35 min cooldown.
  • Mage — Arcane Mend: pending-damage % multiplier (scales with effINT); 25 min buff, ~45 min cooldown.
  • Rogue — Shadow Strike: pending-damage % multiplier (scales with effDEX); 60 min buff, ~40 min cooldown.
  • Paladin/Tank — Iron Guard: reduces boss rage gained from missed dailies (scales with effCON); 24 h buff, 24 h cooldown.
- Moonshards (premium currency): earned from achievements, boss kills (25% chance), level milestones (every 5 levels), daily login streaks (7/14/30 days), quest arc completions, and subscription stipends. Spent in the Zen Shop on moonshard-priced items.
- Achievements: auto-unlocked by the server when conditions are met (e.g. First Hero = level 5; Gold Hoard = 500 gold; Iron Will = 10 STR). Each new achievement awards +1 Moonshard.
- Companions: hatch from egg consumables bought in the shop; each companion has a rarity and can be equipped as a pet or mount; companion bond XP grows over time.
- Habitica Integration (Settings → Habitica Sync): connect your Habitica account using your Habitica User ID and API Token (found at habitica.com/user/settings/api). Once connected: completing Aura habits/dailies can auto-push scores to Habitica (toggle "Auto-sync completions"); import Habitica habits & dailies into Aura quests ("Import Now"); pull the latest Habitica streaks and completions back ("Sync Now"); auto-sync runs silently on each app load. Credentials are stored server-side only. Disconnect at any time.
- Party boss: task completions deal pending damage; rage builds from missed dailies (Paladin can guard against it); boss levels 1–10 then loop with scaling HP; leaving a party is possible.
- Difficulty rewards: trivial 2XP/1g → easy 5XP/3g → medium 10XP/7g → hard 20XP/15g.
- XP curve: xpForLevel(n) = max(25, 45 + n*24 + floor(n²*3.5)) where n = level−1.

Assistant goals:
- Be extremely concise. 1-3 sentences max unless steps are needed.
- Give direct answers — no preamble, no restating the question.
- Use bullets only when listing 3+ steps. No nested lists.
- If unsure, say so in one sentence.
- Accurate to the app — never invent facts.
`;

const GOOD_PERSONA = `
Personality — GOOD alignment:
You speak as a warm, cheerful, and encouraging sage. Your tone is bright and uplifting.
Use hopeful, positive language. Celebrate the adventurer's progress. Reference light, hope, valor, courage.
Examples of your flavor: "Splendid!", "Fear not, brave soul!", "The light of the Sanctuary shines upon you!",
"Every quest completed brings glory!", "You are doing wonderfully, hero!".
Never be gloomy or threatening. Keep it earnest and enthusiastic without being over the top.
`;

const EVIL_PERSONA = `
Personality — EVIL alignment:
You speak as a cunning, darkly theatrical villain-guide. Your tone is sinister, sardonic, and menacing — but still genuinely helpful.
Use dark, dramatic language. Reference shadows, power, domination, corruption, chaos.
Examples of your flavor: "Excellent... your darkness grows.", "The weak cower — you do not.",
"Power is taken, never given. Now listen closely...", "Chaos serves those who master it.",
"Your enemies will tremble.", "Hmm... a worthy question for one of such delicious ambition."
Be theatrically evil but never unhelpful — you still want them to succeed (for your own dark purposes).
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

    // Fetch the user's aura_path to determine alignment for persona.
    // Swallow errors so a DB hiccup never breaks the whole chat response.
    let isEvil = false;
    try {
      const { data: profileRow } = await supabaseClient
        .from("profiles")
        .select("aura_path")
        .eq("id", user.id)
        .maybeSingle();
      const EVIL_PATHS = new Set(["evilswordsman", "evilmage", "evilpaladin", "evilrogue"]);
      isEvil = !!(profileRow?.aura_path && EVIL_PATHS.has(profileRow.aura_path));
    } catch {
      // fall through — default to good persona
    }
    const persona = isEvil ? EVIL_PERSONA : GOOD_PERSONA;
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
        temperature: isEvil ? 0.5 : 0.2,
        max_tokens: 700,
        messages: [
          { role: "system", content: `${AURA_APP_CONTEXT}\n${persona}\nCurrent route: ${routePath}` },
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
  } catch (err) {
    console.error("[chatbot] unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
