import { createFileRoute, Link } from "@tanstack/react-router";
import { Hammer, Shirt, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { useUserItems, useForgeThreeEquipment, getItemIconUrl } from "@/hooks/useShop";
import type { UserItemRow } from "@/hooks/useShop";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";

export const Route = createFileRoute("/forge")({
  head: () => ({ meta: [{ title: "Forge — Aura" }] }),
  component: ForgePage,
});

const RARITY_LADDER = "common → uncommon → rare → epic → legendary. Legendary cannot be forged.";

function ForgePage() {
  const { data: profile } = useProfile();
  const { data: items = [], isLoading } = useUserItems();
  const forge = useForgeThreeEquipment();
  const [basket, setBasket] = useState<string[]>([]);
  const [showInfo, setShowInfo] = useState(false);

  const gearRows = useMemo(
    () =>
      items.filter((r) => {
        if (r.shop_items?.category !== "equipment" || r.quantity <= 0) return false;
        const allowedPaths = Array.isArray(r.shop_items?.metadata?.allowed_paths)
          ? (r.shop_items.metadata.allowed_paths as string[])
          : [];
        if (!allowedPaths.length) return true;
        return !!profile?.aura_path && allowedPaths.includes(profile.aura_path);
      }),
    [items, profile?.aura_path],
  );

  const basketRarity = useMemo(() => {
    if (basket.length === 0) return null;
    const row = gearRows.find((r) => r.id === basket[0]);
    return row?.shop_items?.rarity ?? null;
  }, [basket, gearRows]);

  const countInBasket = (userItemId: string) => basket.filter((id) => id === userItemId).length;

  const addChip = (row: UserItemRow) => {
    if (row.equipped) {
      toast.error("Unequip gear before forging it.");
      return;
    }
    if (basket.length >= 3) {
      toast.error("Basket is full (3 pieces). Forge or reset.");
      return;
    }
    const already = countInBasket(row.id);
    if (already >= row.quantity) {
      toast.error("You do not have more of this stack.");
      return;
    }
    if (basketRarity && row.shop_items.rarity !== basketRarity) {
      toast.error("All three must be the same rarity.");
      return;
    }
    setBasket((b) => [...b, row.id]);
  };

  const popLast = () => setBasket((b) => b.slice(0, -1));

  const clearBasket = () => setBasket([]);

  const doForge = async () => {
    if (basket.length !== 3) {
      toast.error("Add exactly three pieces of the same rarity.");
      return;
    }
    try {
      const r = await forge.mutateAsync([basket[0], basket[1], basket[2]] as [
        string,
        string,
        string,
      ]);
      toast.success(`Forged: ${r.name} (${r.rarity})`);
      clearBasket();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Forge failed.");
    }
  };

  const basketSlots = basket.map((id, i) => {
    const row = gearRows.find((r) => r.id === id);
    const name = row?.shop_items.name ?? "?";
    const slug = row?.shop_items.slug ?? "";
    return (
      <div
        key={`${id}-${i}`}
        className="relative w-16 h-16 border-2 border-border bg-secondary flex items-center justify-center"
        title={name}
      >
        <img
          src={getItemIconUrl(slug)}
          alt={name}
          draggable={false}
          className="w-12 h-12 pixelated object-contain"
          onError={(e) => {
            e.currentTarget.style.opacity = "0";
          }}
        />
        <button
          type="button"
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
          className="absolute -top-2 -right-2 w-5 h-5 border-2 border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive flex items-center justify-center text-[10px] leading-none"
          onClick={() => setBasket((b) => [...b.slice(0, i), ...b.slice(i + 1)])}
        >
          ×
        </button>
      </div>
    );
  });

  return (
    <div className="p-3 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Hammer className="text-primary shrink-0" size={28} />
            <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              MYSTIC FORGE
            </h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/equipment"
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              <Shirt size={14} /> GEAR
            </Link>
            <button
              type="button"
              onClick={() => setShowInfo(true)}
              className="text-muted-foreground hover:text-primary"
              title="Forge tips"
            >
              <Info size={16} />
            </button>
          </div>
        </div>
        <p
          className="text-sm text-muted-foreground leading-relaxed"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Offer <strong className="text-foreground font-medium">three unequipped</strong> pieces
          of gear of the <strong className="text-foreground font-medium">same rarity</strong>;
          receive <strong className="text-foreground font-medium">one random</strong> item of
          the next tier. {RARITY_LADDER}
        </p>
      </div>

      <section className="pixel-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            BASKET (3/{basket.length})
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={popLast}
              disabled={basket.length === 0}
              className="px-2 py-1 border-2 border-border text-[10px] disabled:opacity-40"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              UNDO LAST
            </button>
            <button
              type="button"
              onClick={clearBasket}
              disabled={basket.length === 0}
              className="px-2 py-1 border-2 border-border text-[10px] disabled:opacity-40"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              CLEAR
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 min-h-[5.5rem]">
          {basket.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Tap gear below — same rarity only.
            </p>
          ) : (
            <>
              {basketSlots}
              {Array.from({ length: 3 - basket.length }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="w-16 h-16 border-2 border-dashed border-border/60 bg-secondary/30"
                  aria-hidden="true"
                />
              ))}
            </>
          )}
        </div>
        {basketRarity ? (
          <p className="text-[10px] text-accent" style={{ fontFamily: "var(--font-pixel)" }}>
            Rarity lock: <span className="uppercase">{basketRarity}</span>
          </p>
        ) : null}
        <button
          type="button"
          disabled={basket.length !== 3 || forge.isPending}
          onClick={() => void doForge()}
          className="w-full py-3 bg-primary text-primary-foreground disabled:opacity-40"
          style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
        >
          {forge.isPending ? "FORGING..." : "FORGE"}
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          ELIGIBLE GEAR IN BAG
        </h2>
        {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!isLoading && gearRows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No gear in your bag. Buy some in the Shop.
          </p>
        )}
        <ul className="space-y-2">
          {gearRows.map((row) => {
            const rar = row.shop_items.rarity;
            const n = countInBasket(row.id);
            const lockedRarity = basketRarity && rar !== basketRarity;
            const canAdd = !row.equipped && basket.length < 3 && n < row.quantity && !lockedRarity;
            return (
              <li
                key={row.id}
                className="pixel-panel p-3 flex items-center justify-between gap-3"
              >
                <div className="flex gap-3 min-w-0">
                  <div className="w-10 h-10 bg-background/50 border-2 border-border flex items-center justify-center shrink-0">
                    <img
                      src={getItemIconUrl(row.shop_items.slug)}
                      alt={row.shop_items.name}
                      draggable={false}
                      className="w-8 h-8 pixelated object-contain"
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
                        {rar}
                      </span>
                      {row.equipped ? (
                        <span
                          className="text-[9px] text-destructive"
                          style={{ fontFamily: "var(--font-pixel)" }}
                        >
                          EQUIPPED
                        </span>
                      ) : null}
                    </div>
                  <p
                    className="text-[10px] text-muted-foreground mt-0.5"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    ×{row.quantity}
                    {n > 0 ? ` · ${n} in basket` : ""}
                  </p>
                </div>
              </div>
              <button
                  type="button"
                  disabled={!canAdd}
                  onClick={() => addChip(row)}
                  className="px-3 py-2 border-2 border-border hover:border-primary disabled:opacity-40 text-[10px] shrink-0"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  ADD
                </button>
              </li>
            );
          })}
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
                FORGE GUIDE
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
                <strong className="text-foreground">Rule:</strong> Use exactly 3 unequipped gear
                pieces.
              </li>
              <li>
                <strong className="text-foreground">Rarity lock:</strong> All 3 must be the same
                rarity.
              </li>
              <li>
                <strong className="text-foreground">Outcome:</strong> You receive 1 random item from
                the next tier.
              </li>
              <li>
                <strong className="text-foreground">Limit:</strong> Legendary items cannot be
                forged.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
