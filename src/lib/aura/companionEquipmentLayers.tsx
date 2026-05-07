import type { ReactNode } from "react";
import type { CharacterState } from "./types";

/** Minimal shape for inventory rows (avoids circular import with useShop). */
export type UserItemForCompanionGear = {
  equipped: boolean;
  quantity: number;
  shop_items: { slug: string; category: string; rarity?: string; metadata?: unknown } | null;
};

/** Front-plane draw order (lower = farther back within the silhouette). */
const FRONT_SLOT_ORDER: Record<string, number> = {
  cape: 0,
  chest: 1,
  robe: 1,
  waist: 2,
  belt: 2,
  legs: 3,
  feet: 4,
  hands: 5,
  shoulders: 6,
  head: 7,
  ring: 8,
  weapon: 9,
};

export interface EquippedCompanionGearEntry {
  slug: string;
  slot: string;
  rarity?: string;
}

function planeForSlot(slot: string): "back" | "front" {
  const s = slot.toLowerCase();
  if (s === "charm" || s === "cape" || s === "cloak") return "back";
  return "front";
}

function layerPlaneForGear(slug: string, slot: string): "back" | "front" {
  return COMPANION_EQUIPMENT_LAYER_BY_SLUG[slug]?.z ?? planeForSlot(slot);
}

function slotDrawOrder(slug: string, slot: string): number {
  const defSlot = COMPANION_EQUIPMENT_LAYER_BY_SLUG[slug]?.slot ?? slot.toLowerCase();
  return FRONT_SLOT_ORDER[defSlot] ?? 50;
}

function rarityPalette(r?: string): { main: string; glow: string } {
  switch ((r ?? "common").toLowerCase()) {
    case "uncommon":
      return { main: "oklch(0.62 0.14 158)", glow: "oklch(0.8 0.09 158)" };
    case "rare":
      return { main: "oklch(0.58 0.18 274)", glow: "oklch(0.76 0.12 276)" };
    case "epic":
      return { main: "oklch(0.55 0.22 300)", glow: "oklch(0.78 0.16 294)" };
    case "legendary":
      return { main: "oklch(0.72 0.2 85)", glow: "oklch(0.92 0.14 95)" };
    default:
      return { main: "oklch(0.52 0.08 58)", glow: "oklch(0.7 0.06 82)" };
  }
}

/** Fallback pixel hint for bulk catalog gear without a bespoke illustration. */
function GenericGearGlyph({ slot, rarity, state }: { slot: string; rarity?: string; state: CharacterState }) {
  const o = dim(state);
  const { main, glow } = rarityPalette(rarity);
  const s = slot.toLowerCase();
  switch (s) {
    case "weapon":
      return (
        <g opacity={o} fill={main}>
          <rect x={12} y={7} width={4} height={1} />
          <rect x={13} y={5} width={2} height={3} fill={glow} opacity={0.75} />
        </g>
      );
    case "head":
      return (
        <g opacity={o}>
          <rect x={4} y={4} width={8} height={1} fill={main} />
          <rect x={6} y={3} width={4} height={1} fill={glow} opacity={0.6} />
        </g>
      );
    case "chest":
    case "robe":
      return (
        <g opacity={o}>
          <rect x={4} y={9} width={2} height={2} fill={main} />
          <rect x={10} y={9} width={2} height={2} fill={main} />
          <rect x={7} y={10} width={2} height={1} fill={glow} opacity={0.55} />
        </g>
      );
    case "hands":
      return (
        <g opacity={o}>
          <rect x={2} y={8} width={1} height={2} fill={glow} />
          <rect x={3} y={9} width={1} height={2} fill={main} />
          <rect x={13} y={8} width={1} height={2} fill={glow} />
          <rect x={12} y={9} width={1} height={2} fill={main} />
        </g>
      );
    case "waist":
    case "belt":
      return (
        <g opacity={o}>
          <rect x={5} y={10} width={6} height={1} fill={main} />
          <rect x={7} y={10} width={2} height={1} fill={glow} opacity={0.65} />
        </g>
      );
    case "legs":
    case "feet":
      return (
        <g opacity={o}>
          <rect x={5} y={12} width={1} height={1} fill={main} />
          <rect x={10} y={12} width={1} height={1} fill={main} />
        </g>
      );
    case "shoulders":
      return (
        <g opacity={o}>
          <rect x={3} y={7} width={2} height={1} fill={main} />
          <rect x={11} y={7} width={2} height={1} fill={main} />
        </g>
      );
    case "ring":
      return (
        <g opacity={o}>
          <rect x={2} y={9} width={1} height={1} fill={glow} />
          <rect x={3} y={10} width={2} height={1} fill={main} />
        </g>
      );
    case "charm":
    case "cape":
    case "cloak":
    case "back":
      return (
        <g opacity={o}>
          <rect x={1} y={7} width={1} height={2} fill={main} />
          <rect x={2} y={8} width={2} height={2} fill={glow} opacity={0.45} />
        </g>
      );
    default:
      return (
        <g opacity={o}>
          <rect x={7} y={10} width={2} height={1} fill={main} />
        </g>
      );
  }
}

type GearLayerDef = {
  slot: string;
  z: "back" | "front";
  /** Relative to SVG viewBox 0 0 16 16 — crisp-edge pixels */
  render: (state: CharacterState) => ReactNode;
};

const dim = (state: CharacterState) => (state === "sleeping" ? 0.5 : 1);

/** Gold / brass / linen / leather / wood — readable at 16×16. */
export const COMPANION_EQUIPMENT_LAYER_BY_SLUG: Record<string, GearLayerDef> = {
  "eq-lucky-loop-charm": {
    slot: "charm",
    z: "back",
    render: (state) => (
      <g opacity={dim(state)}>
        {/* Fine chain down from neck */}
        <rect x={6} y={6} width={1} height={1} fill="oklch(0.74 0.06 92)" />
        <rect x={5} y={7} width={1} height={1} fill="oklch(0.74 0.06 92)" />
        {/* Ring pendant — hollow loop (torus-ish pixel ring) */}
        <rect x={2} y={9} width={1} height={1} fill="oklch(0.76 0.15 92)" />
        <rect x={3} y={8} width={2} height={1} fill="oklch(0.76 0.15 92)" />
        <rect x={5} y={9} width={1} height={1} fill="oklch(0.76 0.15 92)" />
        <rect x={3} y={10} width={2} height={1} fill="oklch(0.76 0.15 92)" />
        <rect x={2} y={10} width={1} height={1} fill="oklch(0.62 0.12 88)" />
        <rect x={5} y={10} width={1} height={1} fill="oklch(0.62 0.12 88)" />
        <rect x={4} y={11} width={1} height={1} fill="oklch(0.85 0.14 98)" />
        {/* Small luck dangle */}
        <rect x={4} y={12} width={1} height={1} fill="oklch(0.82 0.18 142)" />
        <rect x={3} y={13} width={3} height={1} fill="oklch(0.78 0.16 92)" opacity={0.9} />
      </g>
    ),
  },
  "eq-reinforced-tunic": {
    slot: "chest",
    z: "front",
    render: (state) => (
      <g opacity={dim(state)}>
        {/* Shoulders — first full body row BELOW chin; stay off face (eyes cols 5 & 10, rows 8–9) */}
        <rect x={4} y={7} width={2} height={1} fill="oklch(0.36 0.05 58)" />
        <rect x={10} y={7} width={2} height={1} fill="oklch(0.36 0.05 58)" />
        {/* Side flanks — avoid eye columns (sleeping eyes use x=6 & x=9 at y=8) */}
        <rect x={4} y={8} width={1} height={2} fill="oklch(0.4 0.062 54)" />
        <rect x={6} y={9} width={1} height={1} fill="oklch(0.4 0.062 54)" />
        <rect x={11} y={8} width={1} height={2} fill="oklch(0.4 0.062 54)" />
        <rect x={9} y={9} width={1} height={1} fill="oklch(0.4 0.062 54)" />
        {/* Upper chest bridging slightly below eye line — avoids center */}
        <rect x={6} y={7} width={1} height={1} fill="oklch(0.38 0.058 54)" />
        <rect x={9} y={7} width={1} height={1} fill="oklch(0.38 0.058 54)" />
        {/* Hem under mouth — keep cols 7–8 open */}
        <rect x={4} y={10} width={3} height={1} fill="oklch(0.36 0.055 54)" />
        <rect x={9} y={10} width={3} height={1} fill="oklch(0.36 0.055 54)" />
        <rect x={4} y={11} width={8} height={1} fill="oklch(0.34 0.05 52)" />
        {/* Stitching */}
        <rect x={6} y={11} width={1} height={1} fill="oklch(0.52 0.04 72)" opacity={0.65} />
        <rect x={9} y={11} width={1} height={1} fill="oklch(0.52 0.04 72)" opacity={0.65} />
        {/* Low sternum buckle — bottom torso row only (does not reach face) */}
        <rect x={7} y={11} width={2} height={1} fill="oklch(0.74 0.16 92)" />
        <rect x={8} y={11} width={1} height={1} fill="oklch(0.32 0.04 50)" opacity={0.6} />
      </g>
    ),
  },
  "eq-steadfast-wraps": {
    slot: "hands",
    z: "front",
    render: (state) => (
      <g opacity={dim(state)}>
        {/* Bandage wraps — staggered stripes on wrists */}
        <rect x={2} y={8} width={1} height={1} fill="oklch(0.93 0.02 98)" opacity={0.95} />
        <rect x={3} y={7} width={1} height={1} fill="oklch(0.78 0.04 92)" />
        <rect x={3} y={8} width={1} height={1} fill="oklch(0.93 0.02 98)" />
        <rect x={3} y={9} width={1} height={1} fill="oklch(0.78 0.04 92)" />
        <rect x={3} y={10} width={1} height={1} fill="oklch(0.93 0.02 98)" />
        <rect x={2} y={9} width={1} height={1} fill="oklch(0.85 0.03 95)" opacity={0.9} />

        <rect x={13} y={8} width={1} height={1} fill="oklch(0.93 0.02 98)" opacity={0.95} />
        <rect x={12} y={7} width={1} height={1} fill="oklch(0.78 0.04 92)" />
        <rect x={12} y={8} width={1} height={1} fill="oklch(0.93 0.02 98)" />
        <rect x={12} y={9} width={1} height={1} fill="oklch(0.78 0.04 92)" />
        <rect x={12} y={10} width={1} height={1} fill="oklch(0.93 0.02 98)" />
        <rect x={13} y={9} width={1} height={1} fill="oklch(0.85 0.03 95)" opacity={0.9} />
      </g>
    ),
  },
  "eq-scholar-lens-band": {
    slot: "head",
    z: "front",
    render: (state) => (
      <g opacity={dim(state)}>
        {/* Head band on brow */}
        <rect x={4} y={3} width={8} height={1} fill="oklch(0.36 0.055 265)" />
        <rect x={3} y={4} width={10} height={1} fill="oklch(0.42 0.06 265)" />
        <rect x={6} y={4} width={1} height={1} fill="oklch(0.76 0.14 92)" />
        <rect x={11} y={4} width={1} height={1} fill="oklch(0.76 0.14 92)" />

        {/* Left lens frame 3×4 @ x=4–6, glass over eye col 5 */}
        <rect x={4} y={7} width={3} height={1} fill="oklch(0.22 0.03 264)" />
        <rect x={4} y={10} width={3} height={1} fill="oklch(0.22 0.03 264)" />
        <rect x={4} y={8} width={1} height={2} fill="oklch(0.22 0.03 264)" />
        <rect x={6} y={8} width={1} height={2} fill="oklch(0.22 0.03 264)" />
        <rect x={5} y={8} width={2} height={2} fill="oklch(0.78 0.12 228)" opacity={0.78} />

        {/* Bridge */}
        <rect x={7} y={8} width={2} height={1} fill="oklch(0.22 0.03 264)" />

        {/* Right lens frame 3×4 @ x=9–11, glass over eye col 10 */}
        <rect x={9} y={7} width={3} height={1} fill="oklch(0.22 0.03 264)" />
        <rect x={9} y={10} width={3} height={1} fill="oklch(0.22 0.03 264)" />
        <rect x={9} y={8} width={1} height={2} fill="oklch(0.22 0.03 264)" />
        <rect x={11} y={8} width={1} height={2} fill="oklch(0.22 0.03 264)" />
        <rect x={10} y={8} width={1} height={2} fill="oklch(0.8 0.12 228)" opacity={0.82} />

        {/* Temple arms toward ears */}
        <rect x={3} y={8} width={1} height={1} fill="oklch(0.22 0.03 264)" />
        <rect x={12} y={8} width={1} height={1} fill="oklch(0.22 0.03 264)" />
      </g>
    ),
  },
  "eq-wooden-training-blade": {
    slot: "weapon",
    z: "front",
    render: (state) => (
      <g opacity={dim(state)}>
        {/* Blunt wooden blade (practice waster) — narrows toward tip */}
        <rect x={14} y={2} width={2} height={2} fill="oklch(0.68 0.095 92)" />
        <rect x={13} y={4} width={3} height={4} fill="oklch(0.72 0.1 92)" />
        <rect x={15} y={5} width={1} height={2} fill="oklch(0.6 0.085 92)" />
        <rect x={14} y={6} width={2} height={1} fill="oklch(0.55 0.08 76)" opacity={0.5} />

        {/* Wood crossguard — wide flat plank */}
        <rect x={9} y={8} width={6} height={1} fill="oklch(0.52 0.1 74)" />

        {/* Brass ferrule ring */}
        <rect x={12} y={7} width={3} height={2} fill="oklch(0.72 0.14 92)" />

        {/* Leather-wrapped grip (hand on right paw) */}
        <rect x={11} y={9} width={2} height={3} fill="oklch(0.34 0.06 52)" />
        <rect x={11} y={10} width={2} height={1} fill="oklch(0.42 0.07 52)" />
        <rect x={12} y={11} width={1} height={1} fill="oklch(0.28 0.04 52)" />
      </g>
    ),
  },
  "eq-stormglass-mantle": {
    slot: "chest",
    z: "front",
    render: (state) => (
      <g opacity={dim(state)}>
        <rect x={4} y={7} width={2} height={1} fill="oklch(0.42 0.14 268)" opacity={0.85} />
        <rect x={10} y={7} width={2} height={1} fill="oklch(0.42 0.14 268)" opacity={0.85} />
        <rect x={4} y={8} width={1} height={2} fill="oklch(0.55 0.16 268)" opacity={0.7} />
        <rect x={11} y={8} width={1} height={2} fill="oklch(0.55 0.16 268)" opacity={0.7} />
        <rect x={6} y={9} width={4} height={2} fill="oklch(0.62 0.2 278)" opacity={0.45} />
        <rect x={5} y={10} width={6} height={1} fill="oklch(0.5 0.18 275)" opacity={0.72} />
        <rect x={7} y={8} width={2} height={1} fill="oklch(0.92 0.08 200)" opacity={0.5} />
      </g>
    ),
  },
  "eq-runic-batter-blade": {
    slot: "weapon",
    z: "front",
    render: (state) => (
      <g opacity={dim(state)}>
        <rect x={14} y={3} width={2} height={2} fill="oklch(0.72 0.14 294)" opacity={0.35} />
        <rect x={13} y={5} width={3} height={3} fill="oklch(0.62 0.12 280)" opacity={0.55} />
        <rect x={12} y={7} width={4} height={2} fill="oklch(0.48 0.1 280)" />
        <rect x={10} y={8} width={5} height={1} fill="oklch(0.55 0.18 298)" opacity={0.75} />
        <rect x={11} y={9} width={2} height={3} fill="oklch(0.32 0.06 52)" />
        <rect x={14} y={6} width={1} height={1} fill="oklch(0.38 0.22 300)" />
        <rect x={15} y={5} width={1} height={1} fill="oklch(0.38 0.22 300)" />
      </g>
    ),
  },
  "eq-dawnsign-circlet": {
    slot: "head",
    z: "front",
    render: (state) => (
      <g opacity={dim(state)}>
        <rect x={5} y={3} width={6} height={1} fill="oklch(0.78 0.16 92)" />
        <rect x={4} y={4} width={8} height={1} fill="oklch(0.72 0.14 88)" />
        <rect x={6} y={3} width={1} height={1} fill="oklch(0.95 0.12 95)" opacity={0.65} />
        <rect x={10} y={3} width={1} height={1} fill="oklch(0.95 0.12 95)" opacity={0.65} />
        <rect x={7} y={5} width={2} height={1} fill="oklch(0.88 0.18 85)" opacity={0.45} />
      </g>
    ),
  },
  "eq-eclip-core-charm": {
    slot: "charm",
    z: "back",
    render: (state) => (
      <g opacity={dim(state)}>
        <rect x={5} y={6} width={1} height={1} fill="oklch(0.35 0.04 280)" />
        <rect x={4} y={7} width={1} height={1} fill="oklch(0.45 0.06 285)" />
        <rect x={2} y={9} width={1} height={1} fill="oklch(0.55 0.2 300)" />
        <rect x={3} y={8} width={2} height={1} fill="oklch(0.22 0.05 280)" />
        <rect x={5} y={9} width={1} height={1} fill="oklch(0.55 0.2 300)" />
        <rect x={3} y={10} width={2} height={1} fill="oklch(0.22 0.05 280)" />
        <rect x={4} y={11} width={1} height={1} fill="oklch(0.78 0.15 92)" opacity={0.55} />
        <rect x={3} y={12} width={1} height={1} fill="oklch(0.15 0.02 280)" />
      </g>
    ),
  },
};

export function deriveEquippedCompanionGear(items: UserItemForCompanionGear[] | undefined): EquippedCompanionGearEntry[] {
  if (!items?.length) return [];
  const out: EquippedCompanionGearEntry[] = [];
  for (const row of items) {
    if (!row.equipped || row.quantity < 1) continue;
    const cat = row.shop_items?.category;
    if (cat !== "equipment") continue;
    const slug = row.shop_items?.slug;
    if (!slug) continue;
    const meta = row.shop_items.metadata as Record<string, unknown> | undefined;
    const slot = typeof meta?.slot === "string" && meta.slot.trim() ? meta.slot.trim().toLowerCase() : "chest";
    out.push({
      slug,
      slot,
      rarity: typeof row.shop_items.rarity === "string" ? row.shop_items.rarity : undefined,
    });
  }
  return out;
}

function sortGearForPlane(entries: EquippedCompanionGearEntry[], plane: "back" | "front"): EquippedCompanionGearEntry[] {
  const filtered = entries.filter((e) => layerPlaneForGear(e.slug, e.slot) === plane);
  const sorted = [...filtered].sort((a, b) => {
    if (plane === "back") {
      return a.slug.localeCompare(b.slug);
    }
    const oa = slotDrawOrder(a.slug, a.slot);
    const ob = slotDrawOrder(b.slug, b.slot);
    return oa - ob || a.slug.localeCompare(b.slug);
  });
  return sorted;
}

function gearGroup(
  entries: EquippedCompanionGearEntry[],
  plane: "back" | "front",
  prefix: string,
  state: CharacterState,
) {
  const list = sortGearForPlane(entries, plane);
  if (!list.length) return null;
  return list.map((e) => {
    const def = COMPANION_EQUIPMENT_LAYER_BY_SLUG[e.slug];
    return (
      <g key={`${prefix}-${e.slug}`} data-testid={`companion-gear-${e.slug}`}>
        {def ? def.render(state) : <GenericGearGlyph slot={e.slot} rarity={e.rarity} state={state} />}
      </g>
    );
  });
}

/** Renders behind the companion body (e.g. floating charm). */
export function CompanionEquipmentBack({ state, gear }: { state: CharacterState; gear: EquippedCompanionGearEntry[] }) {
  if (!gear.length) return null;
  return <>{gearGroup(gear, "back", "companion-gear-b", state)}</>;
}

/** Renders in front of the companion silhouette (armor, wraps, head, weapon). */
export function CompanionEquipmentFront({ state, gear }: { state: CharacterState; gear: EquippedCompanionGearEntry[] }) {
  if (!gear.length) return null;
  return <>{gearGroup(gear, "front", "companion-gear-f", state)}</>;
}
