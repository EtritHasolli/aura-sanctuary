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
