# Aura Sanctuary — feature additions (equipment, shop, forge, catalog)

Concise catalogue of RPG / shop systems added for this codebase. Apply listed Supabase migrations for full backend behavior.

## Equipment & stat bonuses

- **Equipment category** on `shop_items` with `metadata.slot` + `metadata.bonuses` (STR/INT/CON, max stamina, XP%, gold%).
- **Profile bonus columns**: `equip_str_bonus`, `equip_int_bonus`, `equip_con_bonus`, `equip_max_stamina_bonus`, `equip_xp_bonus_pct`, `equip_gold_bonus_pct` (aggregated from equipped gear via server logic).
- **`recompute_profiles_equipment_bonus`** — sums equipped gear into those columns (with sane caps on `%` bonuses).
- **`equip_user_item` / `unequip_user_item`** — equip by inventory row ID, swap same slot, **`unequip`** uses proper row-count check.
- **Effective stamina** everywhere it matters server-side: regen refill cap, consumable stamina cap, boss strike damage uses STR + equip STR bonus; optional gold scaling on boss kill rewards from equip gold `%`.
- **Client `useApplyReward`** — applies XP/gold `%` from profile on gains; stamina clamps to **effective max** (base `max_stamina` + equip max stamina bonus), including level-up stamina.
- **Quest completion toasts** — reflect boosted XP/gold when gear is worn.

Related migrations (examples): `20260507008500_equipment_system.sql`, `20260507008600_equipment_effective_stats_in_rpcs.sql`.

## Shop & inventory

- **Shop tabs**: **General** vs **Equipment** (filter by category).
- **Buy all** — buys as many of one SKU as gold allows (batches of 99 per RPC call); UI shows **max affordable** hint.
- **`forge_exclusive`** on catalog rows — forge-only rewards hidden from normal shop listings and **blocked** from `purchase_shop_item`.

Related migrations: `20260507009500_forge_equipment_merge.sql`, `20260507011000_bulk_shop_catalog_expand.sql` (catalog); client: `shop.tsx`, `useShop.ts`.

## Gear screens & HUD

- **`/equipment`** — loadout totals, pet preview (`PetSprite` + equipped gear visuals), equip/unequip from bag, link to Forge.
- **HUD** — effective STR / INT / CON and stamina bar max include equipment.
- Hooks: **`useEquippedPetGear`**, **`useEquipUserItem`**, **`useUnequipUserItem`**.

Helpers: `src/lib/aura/equipmentBonuses.ts`, Supabase/profile types extended for equip columns and RPCs.

## Pet visuals (gear)

- **Bespoke SVG layers** per slug in `PET_EQUIPMENT_LAYER_BY_SLUG` (starter/detailed pieces + forge milestone art where defined).
- **Generic glyphs** — any equipped `equipment` row without bespoke art renders a **rarity‑tinted** mini overlay by **`metadata.slot`** (weapon, head, chest, hands, cloak/cape/charm back plane, etc.).

## Forge

- **`/forge`** — place **three unequipped** pieces of **same rarity** → receive **one random** item **one tier higher** (`forge_three_equipment`).
- **Legendary inputs** rejected (nothing above legendary in the ladder).
- **Forge‑only epic/legendary** items seeded in migrations (cannot be purchased; only forge/random pool).
- **SideNav**: Forge entry; shortcut from Gear page.

Related migration: `20260507009500_forge_equipment_merge.sql`. Client: `forge.tsx`.

## Bulk catalog expansion

- **~110+ rows** upserted: many **equipment** tiers, extra **consumables**, **cosmetics**, **furniture**, **pet** items (`bulkeq-*`, `bulkcon-*`, `bulkdec-*`, `bulkroom-*`, `bulkpet-*` slugs in `20260507011000_bulk_shop_catalog_expand.sql`).
- Dilutes forge random pools at higher tiers; widens Zen Shop assortment.

## Subscription tiers (premium)

- **Up to 3 admin-managed tiers** with one mandatory **free** tier (`subscription_tiers` table).
- **Caps**: `max_parties_owned`, `max_parties_joined` enforced in `create_party`, `join_party_by_id`, `join_party_by_invite_code`. Default seed: free=3/5, adventurer=5/10, legend=10/20.
- **Perks**: `monthly_moonshards` (server-trusted 28-day cooldown via `claim_monthly_moonshards`), `signup_bonus_moonshards` (one-shot on tier change), and free-form `perks` JSONB (`chat_history_days`, `forge_daily_attempts`, `cosmetic_borders`).
- **Admin tooling** (`admin_users` allowlist + `is_admin()`): `admin_upsert_subscription_tier`, `admin_delete_subscription_tier` (refuses `free`), `admin_set_user_subscription` (also acts as IAP stub until real payments are wired).
- **UI**: `/subscription` page shows three tier cards + admin editor for editing/creating/deleting tiers; subscribers see their current plan badge, party-cap usage and stipend cooldown. Auto-claim of monthly stipend handled by `useMonthlyStipendCheckIn` in `__root.tsx`.

Related migration: `20260509170000_subscription_tiers.sql`. Client: `useSubscription.ts`, `SubscriptionPanel.tsx`.

---

## Minigames & leaderboards

- Dedicated `/minigames` route with a **game-list hub** → click into a game → **Back** to return.
- Two games: **Sudoku** (easy/medium/hard, separate leaderboards) and **2048** (single classic board).
- Each game shows a side-by-side `Leaderboard` panel that pulls the top 25 personal-best scores via `get_minigame_leaderboard`. The current user's row is highlighted; if they aren't in the top 25, their personal best + global rank is pinned below the list.
- Scores are stored as **personal best per (user, game, category)** in `minigame_scores`. Sudoku score = `9999 − duration_seconds`, so faster solves rank higher; the duration is preserved in `metadata.duration_seconds` for display. 2048 score = the in-game score at game-over, with `metadata.max_tile`.
- Submission goes through `submit_minigame_score` (SECURITY DEFINER) — only updates the row when the new score is strictly higher and surfaces an `is_new_high` flag the games turn into a "NEW BEST!" badge.

Related migration: `20260509180000_minigame_leaderboards.sql`. Client: `useMinigames.ts`, `components/games/{Sudoku,Game2048,Leaderboard}.tsx`, `routes/minigames.tsx`.

---

## Quick file map (frontend)

| Area | Typical paths |
|------|----------------|
| Routes | `src/routes/equipment.tsx`, `shop.tsx`, `forge.tsx` |
| Nav | `src/components/aura/SideNav.tsx` |
| HUD / pet | `src/components/aura/HUD.tsx`, `PetSprite.tsx`, `petEquipmentLayers.tsx` |
| Data | `src/hooks/useShop.ts`, `useProfile.ts` |
| Bonus math | `src/lib/aura/equipmentBonuses.ts` |

---

*Last consolidated from the Aura equipment / shop / forge / bulk-catalog workstream.*
