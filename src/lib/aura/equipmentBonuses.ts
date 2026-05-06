import type { Profile } from "./types";

/** Matches server LEAST/GREATEST 0–100 on aggregated equipment bonus pct. */
export function clampBonusPct(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  return Math.min(100, Math.max(0, Math.floor(n)));
}

export function effectiveMaxStamina(p: Profile): number {
  const bonus = typeof p.equip_max_stamina_bonus === "number" ? p.equip_max_stamina_bonus : 0;
  return p.max_stamina + Math.max(0, bonus);
}

/** Integer floors for whole XP / gold deltas (positive only in callers). */
export function withXpEquipBonus(base: number, p: Profile): number {
  if (base <= 0) return base;
  const pct = clampBonusPct(p.equip_xp_bonus_pct);
  return Math.floor(base * (1 + pct / 100));
}

export function withGoldEquipBonus(base: number, p: Profile): number {
  if (base <= 0) return base;
  const pct = clampBonusPct(p.equip_gold_bonus_pct);
  return Math.floor(base * (1 + pct / 100));
}

export function effectiveStrength(p: Profile): number {
  return p.strength + (p.equip_str_bonus ?? 0);
}

export function effectiveIntelligence(p: Profile): number {
  return p.intelligence + (p.equip_int_bonus ?? 0);
}

export function effectiveConstitution(p: Profile): number {
  return p.constitution + (p.equip_con_bonus ?? 0);
}

export interface ParsedBonuses {
  strength?: number;
  intelligence?: number;
  constitution?: number;
  max_stamina?: number;
  xp_bonus_pct?: number;
  gold_bonus_pct?: number;
}

export function parseItemBonuses(metadata: Record<string, unknown> | null | undefined): ParsedBonuses | null {
  const b = metadata?.bonuses;
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const o = b as Record<string, unknown>;
  const n = (k: string): number | undefined => {
    const v = o[k];
    const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(x) ? Math.trunc(x) : undefined;
  };
  const out: ParsedBonuses = {};
  const s = n("strength");
  const i = n("intelligence");
  const c = n("constitution");
  const m = n("max_stamina");
  const xp = n("xp_bonus_pct");
  const g = n("gold_bonus_pct");
  if (s !== undefined) out.strength = s;
  if (i !== undefined) out.intelligence = i;
  if (c !== undefined) out.constitution = c;
  if (m !== undefined) out.max_stamina = m;
  if (xp !== undefined) out.xp_bonus_pct = xp;
  if (g !== undefined) out.gold_bonus_pct = g;
  return Object.keys(out).length ? out : null;
}
