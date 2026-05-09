# Aura Sanctuary - Current Game Mechanics

This document summarizes the mechanics currently implemented in the app and SQL migrations, including the party boss ladder and path skill stat scaling.

## 1) Core Progression

- Profile has core stats: `strength`, `intelligence`, `constitution`, `dexterity`.
- Equipment contributes cached bonuses on profile:
  - `equip_str_bonus`, `equip_int_bonus`, `equip_con_bonus`, `equip_dex_bonus`
  - `equip_max_stamina_bonus`, `equip_xp_bonus_pct`, `equip_gold_bonus_pct`
- Effective stat pattern used in gameplay:
  - `effective_stat = base_stat + matching_equip_bonus`
- XP level curve:
  - `xpForLevel(level) = max(25, 45 + n*24 + floor(n*n*3.5))`, where `n = max(0, level-1)`

## 2) Task Rewards and Stat Gains

### Difficulty rewards

| Difficulty | XP | Gold |
| --- | ---: | ---: |
| trivial | 2 | 1 |
| easy | 5 | 3 |
| medium | 10 | 7 |
| hard | 20 | 15 |

### Habit negative (HP loss)

| Difficulty | HP loss |
| --- | ---: |
| trivial | 2 |
| easy | 5 |
| medium | 10 |
| hard | 18 |

### Stat gain source mapping

| Action | Stat gain |
| --- | --- |
| Habit positive completion | +1 STR |
| Daily completion | +1 CON |
| To-do completion | +1 INT |
| Focus/Pomodoro completion | Path-based growth (Swordsman STR, Mage INT, Tank CON, Rogue DEX) |

## 3) Stamina and Death

- Passive stamina regen uses periodic RPC and effective max stamina cap.
- Level-up grants extra HP and stamina.
- Death triggers penalties (gold/level/xp behavior handled in reward pipeline), then restores HP.

## 4) Party Boss System (Current Tavern)

The tavern currently uses a **task-driven boss system** (not player button spam attacks in UI):

- Party has persistent boss state:
  - `boss_name`, `boss_hp`, `boss_max_hp`, `boss_level`, `boss_loop_count`, `boss_rage`
- Boss progression:
  - Levels 1 through 10 use fixed boss identities.
  - On boss kill:
    - If level < 10: next boss level unlocks.
    - If level = 10: same final boss remains; `boss_loop_count` increases and HP scales higher.
- HP scaling:
  - Based on party member levels (`sum(level)`, member count), plus level/loop growth bonus.
  - Additional growth is nonlinear (exponential-style progression for tier/loop bonus).
- Adventure start is party-scoped (`party_id`), so each party is independent.
- `START` is hidden while an adventure is active to avoid pending-damage resets.

## 5) Pending Damage Pipeline

Task completion contributes to `party_adventure_damage.pending_damage`:

- Habit positive: `delta = (positive_count increase) * 4`
- Daily completion: `trivial=6, easy=10, medium=16, hard=24`
- To-do completion: `trivial=8, easy=12, medium=20, hard=30`

Final pending damage per task event applies skill buffs in this order:

1. Add swordsman flat bonus.
2. Apply mage+rogue multiplier.
3. Clamp:
   - minimum: `1`
   - maximum per event: `250`
   - combined multiplier cap: `120%`

Formula:

`final = clamp_1_250( floor((base + flatBonus) * (100 + totalMultPct) / 100) )`

Where:
- `totalMultPct = min(120, magePct + roguePct)`

## 6) Path Skills (Stat-Scaled Task Gameplay)

These are now tuned to affect **task -> pending damage** and rage mitigation.

| Path | Skill | Stat scaling | Active effect | Duration | Cooldown model |
| --- | --- | --- | --- | --- | --- |
| Swordsman | Battle Focus (`use_skill_focus_ward`) | `effSTR = STR + equip_str_bonus` | Flat pending-dmg bonus per task: `flat = min(18, floor(effSTR/4))` | 20 min | Base 35m, STR-based reduction (capped) |
| Mage | Arcane Mend (`use_skill_party_mend`) | `effINT = INT + equip_int_bonus` | Pending-dmg multiplier: `pct = min(60, floor(effINT*1.5))` | 25 min | Base 45m, INT-based reduction (capped) |
| Rogue | Shadow Strike (`use_skill_shadow_strike`) | `effDEX = DEX + equip_dex_bonus` | Pending-dmg multiplier: `pct = min(50, max(35, 35 + floor(effDEX/6)))` | 60 min | Base 40m, DEX-based reduction (capped) |
| Tank | Iron Guard (`use_skill_second_wind`) | `effCON = CON + equip_con_bonus` | Reduces rage gained from missed dailies: `pct = min(65, floor(effCON*1.8))` | 24h | Fixed 24h |

### Buff keys used

- `swordsman_task_flat_bonus` with `meta.flat`
- `mage_task_mult_bonus` with `meta.pct`
- `boss_dmg_bonus` (rogue) with `meta.pct`
- `tank_rage_guard_bonus` with `meta.pct`

## 7) Boss Rage

- Base rage gain from missed dailies remains:
  - `base_rage_delta = missed_dailies * 2`
- If tank guard buff is active:
  - `rage_delta = ceil(base_rage_delta * (100 - rageReductionPct)/100)`
- Party rage is capped at `5000`.

## 8) Chat and Tavern UX

- Tavern chat is currently back to panel style (no scroll SVG overlay).
- Leader can start boss run when inactive.
- Active run displays pending team damage and level-aware boss status.

## 9) Moonshards (Premium Currency)

Moonshards are a slow drip-feed currency on `profiles.moonshards`. They are
deducted by `purchase_shop_item` whenever a `shop_items.currency_type` is
`'moonshard'`. The migration `20260509150000_moonshard_acquisition.sql` adds
the following acquisition channels — every grant goes through
`grant_moonshards_internal()` and is recorded in `moonshard_grants_log`.

| Channel | Trigger | Award | Notes |
| --- | --- | ---: | --- |
| Achievement unlock | `try_unlock_achievements()` detects a newly unlocked row | **+1** per new achievement | Returned in `moonshards_awarded` |
| Boss kill | `strike_party_boss()` final blow | **+1, 25% chance** | Returned in `bonus_moonshards` |
| Level milestone | `claim_level_moonshards()` (idempotent) | **+1 per 5 levels** | Tracks `profiles.moonshard_level_milestone` so it cannot be replay-claimed |
| Daily login | `record_daily_login()` (called once/day on app boot) | **+1 at 7, 14, 30 day streaks** | Streak resets when broken; `login_streak_milestones_claimed[]` prevents re-claim within the same run |
| Quest arc completion | `record_quest_arc_event()` arc-completes branch | **+3 to +5** (random) | Per arc that transitions from incomplete → completed |
| IAP / Premium stub | `admin_grant_moonshard_bundle(user, slug)` (service_role only) | Per `moonshard_bundles.amount` | Seeded bundles: `starter-pouch` (5), `travelers-cache` (25), `lunar-vault` (75) |

Server is the source of truth. Level-up grants are claimed via a separate RPC
that reads the actual `profiles.level` row, so a tampered client cannot mint
extra moonshards. Daily-login is keyed on `CURRENT_DATE` and idempotent within
the same calendar day. Achievements re-check the underlying conditions and
only grant for net-new unlock rows.

Client side (`src/hooks/useProfile.ts`, `src/hooks/useShop.ts`,
`src/routes/__root.tsx`) dispatches `aura:moonshards-awarded` events that are
toasted via `sonner` and pushed into the in-app notifications stream.

## 10) Subscription Tiers & Caps

Migration `20260509170000_subscription_tiers.sql` adds an admin-managed catalogue
of up to 3 active tiers. Each tier carries caps and perks. The free tier is
mandatory (`is_free = true`, unique) and cannot be deleted.

### Default tier seed

| Slug | Name | Price | Parties owned | Parties joined | Monthly moonshards | Signup bonus |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `free` | Wanderer | $0 | 3 | 5 | 0 | 0 |
| `adventurer` | Adventurer | $4.99 | 5 | 10 | 10 | 5 |
| `legend` | Legend | $9.99 | 10 | 20 | 30 | 25 |

Cosmetic / behavioural perks live in `subscription_tiers.perks` JSONB. Currently
recognized keys (free-form; the client surfaces them):
`chat_history_days` (number), `forge_daily_attempts` (number), `cosmetic_borders` (boolean).

### Enforcement

- **Party creation** — `create_party` raises `Party-creation cap reached…` when
  `count(parties WHERE leader_id = me) >= max_parties_owned`. Also blocks if
  the resulting auto-join would exceed `max_parties_joined`.
- **Party join** — both `join_party_by_id` and `join_party_by_invite_code`
  raise `You are already in N parties…` when
  `count(party_members WHERE user_id = me) >= max_parties_joined`.
  The hard 10-member-per-party cap stays untouched.
- **Expiry fallback** — if `profiles.subscription_expires_at < now()`, the
  effective tier is the free one regardless of `subscription_tier`.
- **Tier deletion** — deleting a paid tier resets all subscribed profiles to
  `free` via `ON DELETE SET DEFAULT`. `free` itself can never be deleted.

### Premium perks

- **Monthly stipend** — `claim_monthly_moonshards()` grants
  `tier.monthly_moonshards` once per 28 days (server-trusted via
  `subscription_last_stipend_at`). Auto-claimed by `AppGate` once per calendar
  day per device; the server still enforces the 28-day window.
- **Signup bonus** — `admin_set_user_subscription` awards
  `tier.signup_bonus_moonshards` whenever the user moves to a new tier (one-shot
  per tier change).

### Admin surface

- `admin_users` table — INSERT a row for the developer's `auth.uid()` to gain
  admin powers. The migration ends with the required snippet.
- `is_admin([uid])` — true when the row exists.
- `admin_upsert_subscription_tier(...)` — upsert by slug, enforces 3-active cap,
  cannot flip `is_free`.
- `admin_delete_subscription_tier(slug)` — refuses to delete the free tier.
- `admin_set_user_subscription(user_id, slug, expires_at, grant_signup_bonus)` —
  manual assignment (also used as the IAP stub until real payments exist).

### Client integration

- `src/hooks/useSubscription.ts` — `useSubscriptionLimits()`,
  `useSubscriptionTiers()`, `useIsAdmin()`, plus admin mutations.
- `src/components/aura/SubscriptionPanel.tsx` — three tier cards + inline
  admin editor (visible only to admins). Mounted at the top of `/settings`.
- `src/routes/__root.tsx → useMonthlyStipendCheckIn` — auto-claims the stipend
  once per device-day; the server enforces the real 28-day cadence.

## 11) Notes on Scope

- SQL functions are authoritative for skill effects, pending damage, boss scaling, and rage logic.
- Supabase generated TypeScript types may lag behind new migrations until regenerated.

