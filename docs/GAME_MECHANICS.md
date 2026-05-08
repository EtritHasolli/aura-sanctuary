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

## 9) Notes on Scope

- SQL functions are authoritative for skill effects, pending damage, boss scaling, and rage logic.
- Supabase generated TypeScript types may lag behind new migrations until regenerated.

