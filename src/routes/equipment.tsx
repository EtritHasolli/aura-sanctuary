import { createFileRoute, Link } from "@tanstack/react-router";
import { Hammer, Shirt, Info } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import {
  getItemIconUrl,
  useEquipUserItem,
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
  effectiveDexterity,
  effectiveIntelligence,
  effectiveMaxStamina,
  effectiveStrength,
  parseItemBonuses,
} from "@/lib/aura/equipmentBonuses";
import { pathCharacterSpriteSrc } from "@/lib/aura/pathCharacterSprites";
import { toast } from "sonner";
import { useState } from "react";

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
  if (b.dexterity) parts.push(`DEX +${b.dexterity}`);
  if (b.max_stamina) parts.push(`max STA +${b.max_stamina}`);
  if (b.xp_bonus_pct) parts.push(`XP +${b.xp_bonus_pct}%`);
  if (b.gold_bonus_pct) parts.push(`gold +${b.gold_bonus_pct}%`);
  return parts.join(" · ");
}

function EquipmentPage() {
  const { data: profile } = useProfile();
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
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="p-3 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shirt className="text-primary" size={28} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                EQUIPMENT
              </h1>
              <button
                type="button"
                onClick={() => setShowInfo(true)}
                className="text-muted-foreground hover:text-primary"
                title="Equipment tips"
              >
                <Info size={16} />
              </button>
            </div>
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
                className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                <div>STR {effectiveStrength(profile)}</div>
                <div>INT {effectiveIntelligence(profile)}</div>
                <div>CON {effectiveConstitution(profile)}</div>
                <div>DEX {effectiveDexterity(profile)}</div>
                <div className="col-span-2 sm:col-span-1 leading-tight">
                  STA {effectiveMaxStamina(profile)}
                  <span className="text-muted-foreground"> (base {profile.max_stamina})</span>
                </div>
                <div className="col-span-2 sm:col-span-1 leading-tight">
                  XP +{clampBonusPct(profile.equip_xp_bonus_pct)}%
                  <span className="text-muted-foreground"> · </span>
                  Gold +{clampBonusPct(profile.equip_gold_bonus_pct)}%
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
              PATH PREVIEW
            </h2>
            <div className="px-6 py-4 bg-secondary/40 border-2 border-border">
              {profile?.aura_path ? (
                <img
                  src={pathCharacterSpriteSrc(profile.aura_path, "idle")}
                  alt="Path character"
                  className="h-28 w-auto object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div
                  className="h-28 w-28 flex items-center justify-center text-[10px] text-muted-foreground"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  Choose path
                </div>
              )}
            </div>
            <p
              className="mt-2 text-[10px] text-muted-foreground text-center"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {profile?.character_name ?? "Character"} · idle
            </p>
            <p
              className="mt-1 text-[9px] text-muted-foreground text-center max-w-50"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Reflects your selected Aura path character.
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
                className="pixel-panel p-3 flex flex-col sm:flex-row sm:items-start gap-3"
              >
                <div className="flex gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 bg-background/50 border-2 border-border flex items-center justify-center shrink-0">
                    <img
                      src={getItemIconUrl(row.shop_items.slug)}
                      alt={row.shop_items.name}
                      draggable={false}
                      className="w-10 h-10 pixelated object-contain"
                      onError={(e) => {
                        e.currentTarget.style.opacity = "0";
                      }}
                    />
                  </div>
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
                  {Array.isArray((meta as Record<string, unknown>).allowed_paths) && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Path:
                      {" "}
                      {((meta as Record<string, unknown>).allowed_paths as string[]).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <button
                  type="button"
                  disabled={unequip.isPending}
                  onClick={() => onUnequip(row.id)}
                  className="px-3 py-2 border-2 border-border hover:border-destructive text-[10px] sm:shrink-0 self-start"
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
                className="pixel-panel p-3 flex flex-col sm:flex-row sm:items-start gap-3"
              >
                <div className="flex gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 bg-background/50 border-2 border-border flex items-center justify-center shrink-0">
                    <img
                      src={getItemIconUrl(row.shop_items.slug)}
                      alt={row.shop_items.name}
                      draggable={false}
                      className="w-10 h-10 pixelated object-contain"
                      onError={(e) => {
                        e.currentTarget.style.opacity = "0";
                      }}
                    />
                  </div>
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
                  {Array.isArray((meta as Record<string, unknown>).allowed_paths) && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Path:
                      {" "}
                      {((meta as Record<string, unknown>).allowed_paths as string[]).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <button
                  type="button"
                  disabled={equip.isPending}
                  onClick={() => onEquip(row.id)}
                  className="px-3 py-2 bg-primary text-primary-foreground text-[10px] sm:shrink-0 self-start"
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
      {showInfo && (
        <div
          className="fixed inset-0 z-130 bg-black/50 p-4 flex items-center justify-center"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="pixel-panel w-full max-w-xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                EQUIPMENT GUIDE
              </h3>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="px-2 py-0.5 border border-border hover:border-primary text-xs"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                CLOSE
              </button>
            </div>
            <ul className="list-disc pl-5 space-y-2 text-base text-muted-foreground">
              <li>
                <strong className="text-foreground">Equip gear:</strong> Items can boost STR, INT,
                CON, stamina cap, XP, and gold gains.
              </li>
              <li>
                <strong className="text-foreground">Loadout totals:</strong> Shows your effective
                stats after all current gear bonuses.
              </li>
              <li>
                <strong className="text-foreground">Companion preview:</strong> Reflects your currently
                equipped visual gear set.
              </li>
              <li>
                <strong className="text-foreground">Bag usage:</strong> Unequipped gear stays in
                your bag and can be forged or re-equipped later.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
