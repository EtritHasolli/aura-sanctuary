import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Coins, Shirt, ShoppingBag, Sparkles } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useShopItems, usePurchaseShopItem } from "@/hooks/useShop";
import { InventoryBag } from "@/components/aura/InventoryBag";
import { toast } from "sonner";

export const Route = createFileRoute("/shop")({
  head: () => ({ meta: [{ title: "Zen Shop — Aura" }] }),
  component: ShopPage,
});

function rarityClass(r: string) {
  switch (r) {
    case "uncommon":
      return "text-[color:var(--color-hp)]";
    case "rare":
      return "text-[color:var(--color-focus)]";
    case "epic":
      return "text-accent";
    case "legendary":
      return "text-primary";
    default:
      return "text-muted-foreground";
  }
}

/** Server `purchase_shop_item` caps quantity per call (see migration). */
const MAX_PURCHASE_BATCH = 99;

function ShopPage() {
  const [tab, setTab] = useState<"general" | "equipment">("general");
  const [season, setSeason] = useState<"all" | "solstice">("all");
  const { data: profile } = useProfile();
  const { data: catalog, isLoading: loadingCatalog } = useShopItems();
  const purchase = usePurchaseShopItem();

  const listed =
    catalog?.filter((item) => {
      const tabOk =
        tab === "equipment" ? item.category === "equipment" : item.category !== "equipment";
      const seasonOk = season === "all" || !item.season_slug || item.season_slug === season;
      return tabOk && seasonOk;
    }) ?? [];

  const buy = async (slug: string, price: number, currency: "gold" | "moonshard" = "gold") => {
    if (!profile) return;
    if (currency === "moonshard") {
      if ((profile.moonshards ?? 0) < price) {
        toast.error("Not enough Moonshards.");
        return;
      }
    } else if (profile.gold < price) {
      toast.error("Not enough gold.");
      return;
    }
    try {
      const r = await purchase.mutateAsync({
        slug,
        quantity: 1,
        goldSpentForArc: currency === "gold" ? price : 0,
      });
      const shard = r.moonshards_left ?? profile.moonshards ?? 0;
      toast.success(
        currency === "moonshard"
          ? `Bought · ${r.new_quantity} in bag · ${shard} Moonshards left`
          : `Bought · ${r.new_quantity} in bag · ${r.gold_left}g left`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Purchase failed";
      toast.error(msg);
    }
  };

  const buyAll = async (
    slug: string,
    name: string,
    price: number,
    currency: "gold" | "moonshard" = "gold",
  ) => {
    if (!profile) return;
    if (currency === "moonshard") {
      toast.error("Use single buy for Moonshard items.");
      return;
    }
    if (price <= 0) {
      toast.error("Invalid price.");
      return;
    }
    if (profile.gold < price) {
      toast.error("Not enough gold.");
      return;
    }
    if (Math.floor(profile.gold / price) < 1) return;
    try {
      let goldLeft = profile.gold;
      let totalBought = 0;
      let lastNewQty = 0;
      let guard = 0;
      while (goldLeft >= price && guard < 4000) {
        guard++;
        const batch = Math.min(MAX_PURCHASE_BATCH, Math.floor(goldLeft / price));
        if (batch < 1) break;
        const r = await purchase.mutateAsync({
          slug,
          quantity: batch,
          goldSpentForArc: price * batch,
        });
        goldLeft = r.gold_left;
        totalBought += r.quantity_purchased;
        lastNewQty = r.new_quantity;
      }
      toast.success(`Bought ${totalBought} × ${name} · ${lastNewQty} in bag · ${goldLeft}g left`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Purchase failed";
      toast.error(msg);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShoppingBag className="text-primary" size={28} />
          <div>
            <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              ZEN SHOP
            </h1>
            <p
              className="text-xs text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Spend Zen Gold — general wares or stat-boosting equipment.
            </p>
          </div>
        </div>
        {profile && (
          <div className="flex flex-wrap gap-2">
            <div
              className="flex items-center gap-2 px-3 py-2 border-2 border-border bg-card"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
            >
              <Coins size={14} className="text-[color:var(--color-gold)]" />
              <span>{profile.gold}</span>
              <span className="text-muted-foreground">g</span>
            </div>
            <div
              className="flex items-center gap-2 px-3 py-2 border-2 border-border bg-card"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
            >
              <Sparkles size={14} className="text-accent" />
              <span>{profile.moonshards ?? 0}</span>
              <span className="text-muted-foreground">Moonshards</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              CATALOG
            </h2>
            <div className="flex flex-wrap gap-2 items-center justify-end">
              <div
                className="flex border-2 border-border"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
              >
                <button
                  type="button"
                  onClick={() => setSeason("all")}
                  className={`px-3 py-1.5 ${season === "all" ? "bg-primary text-primary-foreground" : "bg-card"}`}
                >
                  All seasons
                </button>
                <button
                  type="button"
                  onClick={() => setSeason("solstice")}
                  className={`px-3 py-1.5 border-l-2 border-border ${season === "solstice" ? "bg-primary text-primary-foreground" : "bg-card"}`}
                >
                  Solstice
                </button>
              </div>
              <div
                className="flex border-2 border-border"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
              >
                <button
                  type="button"
                  onClick={() => setTab("general")}
                  className={`px-3 py-1.5 flex items-center gap-1 ${tab === "general" ? "bg-primary text-primary-foreground" : "bg-card"}`}
                >
                  <ShoppingBag size={12} /> General
                </button>
                <button
                  type="button"
                  onClick={() => setTab("equipment")}
                  className={`px-3 py-1.5 flex items-center gap-1 border-l-2 border-border ${tab === "equipment" ? "bg-primary text-primary-foreground" : "bg-card"}`}
                >
                  <Shirt size={12} /> Equipment
                </button>
              </div>
            </div>
          </div>
          {loadingCatalog && <p className="text-sm text-muted-foreground">Loading wares...</p>}
          {!loadingCatalog && listed.length === 0 && (
            <p className="text-sm text-muted-foreground">No items in this tab yet.</p>
          )}
          <ul className="space-y-2">
            {listed.map((item) => {
              const currency = item.currency_type === "moonshard" ? "moonshard" : "gold";
              const canAfford =
                profile &&
                (currency === "moonshard"
                  ? (profile.moonshards ?? 0) >= item.price
                  : profile.gold >= item.price);
              const maxAffordable =
                profile && item.price > 0 && currency === "gold"
                  ? Math.floor(profile.gold / item.price)
                  : currency === "moonshard"
                    ? (profile?.moonshards ?? 0) >= item.price
                      ? 1
                      : 0
                    : 0;
              return (
                <li
                  key={item.id}
                  className="pixel-panel p-3 flex flex-wrap items-start gap-3 justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}>
                        {item.name}
                      </span>
                      <span
                        className={`text-[10px] uppercase ${rarityClass(item.rarity)}`}
                        style={{ fontFamily: "var(--font-pixel)" }}
                      >
                        {item.rarity}
                      </span>
                    </div>
                    <p
                      className="text-xs text-muted-foreground mt-1"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {item.description}
                    </p>
                    <p
                      className="text-[10px] text-muted-foreground mt-1"
                      style={{ fontFamily: "var(--font-pixel)" }}
                    >
                      {item.category}
                      {item.season_slug ? ` · ${item.season_slug}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className="text-sm text-[color:var(--color-gold)]"
                      style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
                    >
                      {currency === "moonshard" ? (
                        <>
                          <Sparkles size={10} className="inline mr-0.5 text-accent" />
                          {item.price} Moonshards
                        </>
                      ) : (
                        <>
                          {item.price}g
                          {canAfford ? (
                            <span className="text-muted-foreground font-normal ml-1">
                              · max {maxAffordable} with your gold
                            </span>
                          ) : null}
                        </>
                      )}
                    </span>
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        disabled={!canAfford || purchase.isPending}
                        onClick={() => buy(item.slug, item.price, currency)}
                        className="px-3 py-2 bg-primary text-primary-foreground disabled:opacity-40"
                        style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
                      >
                        BUY
                      </button>
                      <button
                        type="button"
                        disabled={!canAfford || purchase.isPending || currency === "moonshard"}
                        title={
                          profile && currency === "gold"
                            ? `Buy ${maxAffordable} (uses ${Math.min(maxAffordable * item.price, profile.gold)}g)`
                            : ""
                        }
                        onClick={() => buyAll(item.slug, item.name, item.price, currency)}
                        className="px-3 py-2 border-2 border-[color:var(--color-gold)] text-foreground bg-card hover:bg-secondary disabled:opacity-40"
                        style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
                      >
                        BUY ALL
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <InventoryBag className="lg:sticky lg:top-4" />
      </div>
    </div>
  );
}
