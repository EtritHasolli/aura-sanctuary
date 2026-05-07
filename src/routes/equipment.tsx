import { createFileRoute, Link } from "@tanstack/react-router";
import { Hammer, Shirt } from "lucide-react";
import { PetSprite } from "@/components/aura/PetSprite";
import { useProfile } from "@/hooks/useProfile";
import {
  useEquipUserItem,
  useEquippedPetGear,
  useUnequipUserItem,
  useUserItems,
} from "@/hooks/useShop";
import {
  useHatchCompanionEgg,
  useSetCompanionEquip,
  useUserCompanions,
} from "@/hooks/useCompanions";
import {
  clampBonusPct,
  effectiveConstitution,
  effectiveIntelligence,
  effectiveMaxStamina,
  effectiveStrength,
  parseItemBonuses,
} from "@/lib/aura/equipmentBonuses";
import { toast } from "sonner";

export const Route = createFileRoute("/equipment")({
  head: () => ({ meta: [{ title: "Equipment — Aura" }] }),
  component: EquipmentPage,
});

function slotLabel(meta: Record<string, unknown>): string {
  const s = meta?.slot;
  return typeof s === "string" && s.trim() ? s : "gear";
}

function bonusSummary(meta: Record<string, unknown>): string {
  const b = parseItemBonuses(meta);
  if (!b) return "";
  const parts: string[] = [];
  if (b.strength) parts.push(`STR +${b.strength}`);
  if (b.intelligence) parts.push(`INT +${b.intelligence}`);
  if (b.constitution) parts.push(`CON +${b.constitution}`);
  if (b.max_stamina) parts.push(`max STA +${b.max_stamina}`);
  if (b.xp_bonus_pct) parts.push(`XP +${b.xp_bonus_pct}%`);
  if (b.gold_bonus_pct) parts.push(`gold +${b.gold_bonus_pct}%`);
  return parts.join(" · ");
}

function EquipmentPage() {
  const { data: profile } = useProfile();
  const petGear = useEquippedPetGear();
  const { data: items = [], isLoading } = useUserItems();
  const equip = useEquipUserItem();
  const unequip = useUnequipUserItem();
  const { data: companions = [] } = useUserCompanions();
  const hatch = useHatchCompanionEgg();
  const setCompanionEquip = useSetCompanionEquip();

  const gear = items.filter((u) => u.shop_items?.category === "equipment");
  const equipped = gear.filter((u) => u.equipped);
  const backpack = gear.filter((u) => !u.equipped);

  const onEquip = async (id: string) => {
    try {
      await equip.mutateAsync(id);
      toast.success("Equipped.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not equip");
    }
  };

  const onUnequip = async (id: string) => {
    try {
      await unequip.mutateAsync(id);
      toast.success("Unequipped.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not unequip");
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shirt className="text-primary" size={28} />
          <div>
            <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              EQUIPMENT
            </h1>
            <p
              className="text-xs text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Zen Shop gear augments your stats, stamina cap, and task rewards.
            </p>
          </div>
        </div>
        <Link
          to="/forge"
          className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          <Hammer size={14} /> FORGE
        </Link>
      </div>

      <section className="pixel-panel p-4">
        <div className="flex flex-col sm:flex-row gap-6">
          {profile ? (
            <div className="flex-1 space-y-2 min-w-0 sm:order-1">
              <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                LOADOUT TOTALS
              </h2>
              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                <div>STR {effectiveStrength(profile)}</div>
                <div>INT {effectiveIntelligence(profile)}</div>
                <div>CON {effectiveConstitution(profile)}</div>
                <div>
                  STA max {effectiveMaxStamina(profile)}
                  <span className="text-muted-foreground"> (base {profile.max_stamina})</span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  Task XP +{clampBonusPct(profile.equip_xp_bonus_pct)}% · Gold +
                  {clampBonusPct(profile.equip_gold_bonus_pct)}%
                </div>
              </div>
            </div>
          ) : (
            <div
              className="flex-1 sm:order-1 text-xs text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Loading profile…
            </div>
          )}
          <div className="shrink-0 flex flex-col items-center justify-start sm:border-l-2 sm:border-border sm:pl-6 sm:order-2 pb-2 sm:pb-0">
            <h2
              className="text-sm text-primary mb-3 self-stretch text-center sm:text-left"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              PET PREVIEW
            </h2>
            <div className="px-6 py-4 bg-secondary/40 border-2 border-border">
              <PetSprite state="idle" size={112} gear={petGear} />
            </div>
            <p
              className="mt-2 text-[10px] text-muted-foreground text-center"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {profile?.pet_name ?? "Companion"} · idle
            </p>
            <p
              className="mt-1 text-[9px] text-muted-foreground text-center max-w-[200px]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Reflects currently equipped gear. Changes when you equip or unequip.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          EQUIPPED
        </h2>
        {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!isLoading && equipped.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Nothing equipped yet. Buy gear from the Shop → Equipment tab.
          </p>
        )}
        <ul className="space-y-2">
          {equipped.map((row) => {
            const meta = row.shop_items?.metadata ?? {};
            const bonuses = bonusSummary(meta as Record<string, unknown>);
            return (
              <li
                key={row.id}
                className="pixel-panel p-3 flex flex-wrap gap-3 justify-between items-start"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}>
                      {row.shop_items.name}
                    </span>
                    <span
                      className="text-[10px] uppercase text-accent"
                      style={{ fontFamily: "var(--font-pixel)" }}
                    >
                      {slotLabel(meta as Record<string, unknown>)}
                    </span>
                  </div>
                  {bonuses && (
                    <p
                      className="text-[10px] text-primary mt-1"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {bonuses}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={unequip.isPending}
                  onClick={() => onUnequip(row.id)}
                  className="px-3 py-2 border-2 border-border hover:border-destructive text-[10px] shrink-0"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  UNEQUIP
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          INVENTORY
        </h2>
        {backpack.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground italic">No spare equipment in your bag.</p>
        )}
        <ul className="space-y-2">
          {backpack.map((row) => {
            const meta = row.shop_items?.metadata ?? {};
            const bonuses = bonusSummary(meta as Record<string, unknown>);
            return (
              <li
                key={row.id}
                className="pixel-panel p-3 flex flex-wrap gap-3 justify-between items-start"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}>
                      {row.shop_items.name}
                    </span>
                    <span
                      className="text-[10px] uppercase text-muted-foreground"
                      style={{ fontFamily: "var(--font-pixel)" }}
                    >
                      ×{row.quantity}
                    </span>
                    <span
                      className="text-[10px] uppercase text-accent"
                      style={{ fontFamily: "var(--font-pixel)" }}
                    >
                      {slotLabel(meta as Record<string, unknown>)}
                    </span>
                  </div>
                  {bonuses && (
                    <p
                      className="text-[10px] text-muted-foreground mt-1"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {bonuses}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={equip.isPending}
                  onClick={() => onEquip(row.id)}
                  className="px-3 py-2 bg-primary text-primary-foreground text-[10px] shrink-0"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  EQUIP
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 mt-8">
        <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          COMPANIONS
        </h2>
        <p className="text-xs text-muted-foreground">
          Hatch mystery eggs from your bag. Equip one as your sanctuary pet or mount (cosmetic
          tints).
        </p>
        {items.some((u) => u.shop_items?.slug === "companion-egg" && u.quantity > 0) && (
          <button
            type="button"
            disabled={hatch.isPending}
            onClick={async () => {
              try {
                const r = await hatch.mutateAsync();
                toast.success(
                  r.duplicate ? `Duplicate — +${r.bond_bonus ?? 0} bond` : `Hatched: ${r.name}`,
                );
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : "Hatch failed");
              }
            }}
            className="px-3 py-2 bg-accent text-accent-foreground text-[10px]"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            {hatch.isPending ? "HATCHING..." : "HATCH COMPANION EGG"}
          </button>
        )}
        <ul className="space-y-2">
          {companions.map((c) => (
            <li
              key={c.id}
              className="pixel-panel p-3 flex flex-wrap gap-2 justify-between items-center"
            >
              <div>
                <div className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                  {c.companions.name}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Bond {c.bond_xp} · {c.equipped_as}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="px-2 py-1 border border-border text-[10px]"
                  style={{ fontFamily: "var(--font-pixel)" }}
                  onClick={() =>
                    void setCompanionEquip.mutateAsync({ id: c.id, equipped_as: "pet" })
                  }
                >
                  PET
                </button>
                {c.companions.can_mount && (
                  <button
                    type="button"
                    className="px-2 py-1 border border-border text-[10px]"
                    style={{ fontFamily: "var(--font-pixel)" }}
                    onClick={() =>
                      void setCompanionEquip.mutateAsync({ id: c.id, equipped_as: "mount" })
                    }
                  >
                    MOUNT
                  </button>
                )}
                <button
                  type="button"
                  className="px-2 py-1 border border-border text-[10px]"
                  style={{ fontFamily: "var(--font-pixel)" }}
                  onClick={() =>
                    void setCompanionEquip.mutateAsync({ id: c.id, equipped_as: "none" })
                  }
                >
                  STOW
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
