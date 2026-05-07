# Aura Sanctuary — rewards, stats, and combat

This document describes how **XP, gold, HP, stamina, stats (STR / INT / CON)**, **quest completion**, **dailies**, and **party boss damage** are calculated in the current codebase. Values match the TypeScript tables in `src/lib/aura/types.ts` and the SQL in the listed migrations unless noted.

---

## 1. Core profile stats

### Base attributes

Each profile has integer **strength**, **intelligence**, and **constitution**. They are raised in fixed increments when certain actions complete (see §4).

### Equipment modifiers

Equipped items contribute cached sums on `profiles`:

| Field | Effect |
| --- | --- |
| `equip_str_bonus`, `equip_int_bonus`, `equip_con_bonus` | Added to the matching base stat where the game uses “effective” values. |
| `equip_max_stamina_bonus` | Added to `max_stamina` for caps and regen (see §6). |
| `equip_xp_bonus_pct`, `equip_gold_bonus_pct` | Percent bonuses on **positive** XP and gold from `useApplyReward` (clamped 0–100, integer floor on the multiplier). |

Client helpers live in `src/lib/aura/equipmentBonuses.ts`:

- **Effective max stamina:** `max_stamina + max(0, equip_max_stamina_bonus)`.
- **XP after gear:** `floor(baseXp * (1 + clamp(equip_xp_bonus_pct) / 100))` when `baseXp > 0`.
- **Gold after gear:** same pattern for `baseGold > 0`.
- **Effective STR / INT / CON:** base + matching `equip_*_bonus` (used for display and any client-side previews; boss strike uses DB-side equivalents).

Item metadata can define bonuses under `metadata.bonuses` (parsed in the same file); the database keeps profile aggregates in sync when gear changes (see equipment migrations).

---

## 2. Task difficulty → XP, gold, and habit HP loss

All **habits**, **dailies**, and **to-dos** use a **difficulty** tier. On a **positive** completion, the client sends base XP and gold from these tables (`src/lib/aura/types.ts`):

| Difficulty | XP | Gold |
| --- | ---: | ---: |
| trivial | 2 | 1 |
| easy | 5 | 3 |
| medium | 10 | 7 |
| hard | 20 | 15 |

**Habit “negative”** (minus button) does not grant XP or gold. It applies **HP loss** only:

| Difficulty | HP lost |
| --- | ---: |
| trivial | 2 |
| easy | 5 |
| medium | 10 |
| hard | 18 |

Implementation: `completePositive` / `negative` in `src/routes/quests.tsx` call `useApplyReward` with the appropriate delta.

---

## 3. Which stat goes up from which activity?

Stat gains are **+1 per qualifying action**, chosen by the route—not by a formula from STR itself.

| Source | Stat incremented |
| --- | --- |
| **Habit** positive complete | **Strength** |
| **Daily** complete | **Constitution** |
| **To-do** complete | **Intelligence** |
| **Focus session complete** (Pomodoro) | **Intelligence** (+10 XP, +3 gold, +15 stamina; `src/routes/__root.tsx`) |
| **Party boss strike** (each strike, not only kills) | **Strength** (+XP equal to damage dealt that strike, +2 gold; `src/routes/tavern.tsx`) |

The mutation `useApplyReward` in `src/hooks/useProfile.ts` applies at most **one** stat increment per call, via `delta.stat`.

---

## 4. Applying rewards (`useApplyReward`)

All of the above flows converge on **`useApplyReward`**, which:

1. Loads the current profile.
2. Computes **XP gain** for this request:
   - If `delta.xp > 0`, checks an active **`profile_buffs`** row with `buff_key = 'xp_focus_bonus'` (Focus Ward). If `meta.pct` is set, multiplies XP gain by `(1 + pct/100)` and rounds (`use_skill_focus_ward` sets 25%).
   - Then applies **equipment XP %** (`withXpEquipBonus`).
3. Computes **gold gain** with **equipment gold %** (`withGoldEquipBonus`). Negative gold deltas are still clamped so total gold never goes below 0 at the end.
4. Adds XP to the pool and **levels up in a loop** while `xp >= xpForLevel(level)`:
   - Subtracts `xpForLevel(level)` from `xp`.
   - Increments `level`.
   - Adds **+10 HP** (regen on level-up) and caps HP by current `max_hp`.
   - Adds **+50 stamina**, capped by **effective max stamina** (includes equip max stamina bonus).
5. Applies direct **HP** and **stamina** deltas from the request, clamped to `[0, max_hp]` and `[0, effectiveMaxStamina]`.
6. **Death handling:** if after all changes `hp <= 0`, the profile is penalized: `level = max(1, level - 1)`, `gold = floor(gold * 0.8)`, `hp = max_hp`, `xp = 0`.
7. Recomputes **`max_hp`** at least to **`canonicalMaxHpForLevel(level)`** = `50 + (level - 1) * 10` (must match DB default at level 1).
8. Writes the patch; then calls **`try_unlock_achievements`** (best-effort).

Constants in `useProfile.ts`: `STAMINA_ON_LEVEL_UP = 50`, `HP_REGEN_PER_LEVEL_UP = 10`, `BASE_MAX_HP = 50`, `MAX_HP_PER_LEVEL_UP = 10`.

---

## 5. XP curve (`xpForLevel`)

XP required to go **from `level` to `level + 1`** (`src/lib/aura/types.ts`):

Let `n = max(0, level - 1)`.

```
xpForLevel(level) = max(25, 45 + n * 24 + floor(n * n * 3.5))
```

So early levels are gentle; later levels grow faster than linearly (quadratic term). The level-up loop in `useApplyReward` consumes this threshold repeatedly in one reward if enough XP was banked.

---

## 6. Stamina: regen, daily reset, boss strikes, Keeper skill

### Passive regen (`apply_stamina_regen`)

The client polls this RPC about every minute (`StaminaRecoveryLoop` in `src/routes/__root.tsx`). Defaults: **5-minute** ticks, **+1 stamina** per tick (see migration `20260507008600_equipment_effective_stats_in_rpcs.sql`).

- **Effective max:** `max_stamina + equip_max_stamina_bonus`.
- If the stored **`last_stamina_reset_on`** is before **today’s UTC date**, stamina is set to **full effective max** and the regen clock is aligned (daily UTC reset).
- Otherwise, whole ticks since `last_stamina_regen_at` grant `ticks * p_gain_per_tick` stamina up to the cap.

### Boss strike cost

`strike_party_boss` spends **10 stamina** per strike (server-enforced).

### Keeper — Second Wind

`use_skill_second_wind` adds **22** stamina capped at **`max_stamina`** (base column, not the equipment-extended cap in that RPC—worth knowing if you rely on huge equip bonuses).

---

## 7. Quest types — behavior and effects

### Habits

- **Plus:** difficulty XP + gold, equipment bonuses, optional Focus Ward XP buff, then **+1 STR**. Increments `positive_count`.
- **Minus:** **HP loss** from difficulty table, increments `negative_count`. No XP/gold.

### Dailies

Dailies use the profile’s **IANA `timezone`** (`profiles.timezone`, default UTC) for “today” and streak logic (`src/lib/aura/dates.ts`, `src/routes/quests.tsx`).

- **Sacred days:** `sacred_days` is a **bitmask** — bit `d` set means the daily is due on weekday `d` (Sun = 1<<0 … Sat = 1<<6). `127` means every day.
- **Complete (plus):** Only if today is a sacred day and the daily was **not** already completed for **today’s local calendar date** (`last_completed_local_date`). Awards difficulty XP + gold, **+1 CON**, then sets `completed`, `last_completed_local_date`, `last_completed_at`, and updates **streak**:
  - If last completion was **yesterday** (local), `streak_current = previous + 1`; else streak becomes **1**.
  - `streak_best` is the max of prior best and new streak.
- **To-dos with checklist:** the UI blocks completion until **every checklist item** is done.

### To-dos

- **Plus:** same XP/gold pipeline as others, **+1 INT**, marks `completed: true`. Checklist gate above.

### Server-side daily refresh (`refresh_user_dailies`)

Called when tasks load (`src/hooks/useTasks.ts`). Migration: `20260507120000_task_depth_tags_checklist_schedule.sql`.

1. For each daily where **yesterday** was a sacred day but **`last_completed_local_date` < yesterday** → set **`streak_current = 0`** (missed day).
2. For dailies with `completed = true` but **`last_completed_local_date` < today** → set **`completed = false`** so they can be done again today.

Returns JSON including `today`, `timezone`, `dow_today`, counts of resets.

---

## 8. Party shadow — missed dailies → boss rage

`apply_party_shadow_from_missed_dailies()` (migration `20260507125200_strike_buffs_rage_shadow.sql`) runs from the client task flow (with `refresh_user_dailies`). It counts dailies that **should** have been done **yesterday** (sacred bit set for yesterday’s DOW) but were not completed on or before yesterday. For each party the user is in, it adds to **`parties.boss_rage`**:

- **`shadow_pressure_mode = 'hardcore'`:** `+8` rage per missed daily.
- **Otherwise (support mode):** `+2` per missed daily.

Rage is capped at **5000** on the party.

---

## 9. Party boss damage (`strike_party_boss`)

Authoritative math is **server-side** in `20260507125200_strike_buffs_rage_shadow.sql` (supersedes older strike migrations).

1. **`prune_expired_buffs`** for the striker.
2. **Boss damage buff:** if `profile_buffs.boss_dmg_bonus` is active, read `meta.pct` (Shadow Strike sets **35%**).
3. Read **`strength + equip_str_bonus`**, current stamina, **`equip_gold_bonus_pct`** (capped at 100 for drop math).
4. **Stamina check:** need **≥ 10**; subtract 10 on strike.
5. **Base damage:**  
   `dmg = max(1, 5 + effective_strength * 2)`
6. **Buff:**  
   `dmg = max(1, floor(dmg * (100 + boss_pct) / 100))`
7. **Rage armor:** let `R = boss_rage`.  
   `dmg = max(1, floor(dmg * 100 / (100 + R/4)))`  
   So higher rage shaves off a larger fraction of damage (soft armor).
8. Apply damage to **`boss_hp`**. If boss was alive and HP hits 0 → **kill**: reset boss to full HP for the next spawn, grant **bonus gold** to the striker:  
   `floor((12 + floor(random()*24)) * (1 + equip_gold_bonus_pct/100))`  
   Roll a **loot table** (weighted slugs) and grant one shop item stack if the slug exists and is active.
9. **Rage decay on kill:** `boss_rage = floor(boss_rage * 0.55)` (not zeroed).
10. **Quest arc hook:** if HP actually decreased, `record_quest_arc_event('strike_boss', 1)` runs.

**Client reward after strike:** XP = **`r.dmg`** (the post-rage damage number returned), gold **+2**, **+1 STR** — independent of the server’s kill bonus gold (that gold is applied inside the RPC).

**Scholar — Party Mend:** heals party **`boss_hp` by +18** (cap at max), 45m cooldown; does not use the strike formula.

---

## 10. Aura path skills (summary)

| Path | Skill | Effect (high level) |
| --- | --- | --- |
| Warden | Focus Ward | `xp_focus_bonus` buff, **+25%** XP for ~2h; 30m cooldown |
| Scholar | Party Mend | **+18** boss HP; 45m cooldown |
| Strider | Shadow Strike | `boss_dmg_bonus` **+35%** on next strike(s) until buff expires (~20m); 40m cooldown |
| Keeper | Second Wind | **+22** stamina; 60m cooldown |

Definitions: `supabase/migrations/20260507121000_paths_skills_buffs.sql`.

---

## 11. Mental model

- **Tasks** are the main driver of **predictable** XP/gold and **stat specialization** by column (habit/daily/todo).
- **Equipment** scales **XP and gold** from tasks (and indirectly helps boss **loot gold** on kill).
- **Strength (base + equip)** scales **boss strike damage**, which also feeds **XP on strike** via `r.dmg`.
- **Dailies** tie to **calendar + timezone**, **streaks**, and optionally **party rage** if you miss sacred days while in a party.
- **Buffs** (Focus Ward, Shadow Strike) layer on top and are enforced server-side where noted.

For HTTP/RPC names useful to tools or integrations, see `docs/API.md`.
