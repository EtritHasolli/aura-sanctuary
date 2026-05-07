# Aura Sanctuary — developer API notes

The app uses [Supabase](https://supabase.com/) (Postgres + Auth + Realtime). Authenticated clients use the Supabase JS client with the user session; game rules that must not be spoofed live in **Postgres RPCs** marked `SECURITY DEFINER`.

## REST and Realtime

- **Tables**: Standard PostgREST access with RLS. Examples: `tasks`, `profiles`, `shop_items`, `user_companions`, `challenge_templates`.
- **Realtime**: `chat_messages` and `parties` are published for Tavern updates.

## Key RPCs (non-exhaustive)

| RPC | Purpose |
|-----|---------|
| `refresh_user_dailies()` | Rolls local-day dailies, streak maintenance, returns `today` / `dow_today`. |
| `apply_party_shadow_from_missed_dailies()` | Increases `boss_rage` on parties the user belongs to when yesterday’s sacred dailies were missed. |
| `strike_party_boss(p_party_id)` | Boss damage, stamina cost, drops, rage reduction on kill, quest-arc strike progress. |
| `purchase_shop_item(slug, qty)` | Gold or **Moonshards** depending on `shop_items.currency_type`. |
| `use_skill_*` | Path skills (Warden/Scholar/Strider/Keeper) and buffs in `profile_buffs`. |
| `create_party` / `join_party_by_invite_code` | Social parties + invite codes. |
| `start_challenge_run(template_id)` | Copies blueprint tasks into the user’s quest log. |
| `ensure_quest_arc_started(slug)` / `record_quest_arc_event(kind, amount)` | Multi-step **Shadow Cleansing** arc. |
| `try_unlock_achievements()` | Evaluates profile thresholds and inserts `user_achievements`. |
| `hatch_companion_egg()` | Consumes one `companion-egg` inventory row and grants a companion. |

## External integrations

Third-party tools can use the Supabase **anon** key only within RLS constraints, or a **service role** key on a trusted backend (never ship service keys to browsers). For a narrower public surface, add a dedicated Edge Function that proxies read-only queries.
