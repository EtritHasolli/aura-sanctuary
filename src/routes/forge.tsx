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
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [forgedResult, setForgedResult] = useState<{ name: string; slug: string; rarity: string } | null>(null);

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
      setForgedResult(null);
      const r = await forge.mutateAsync([basket[0], basket[1], basket[2]] as [
        string,
        string,
        string,
      ]);
      setForgedResult({ name: r.name, slug: r.slug, rarity: r.rarity });
      toast.success(`Forged: ${r.name} (${r.rarity})`);
      clearBasket();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Forge failed.");
    }
  };

  const floatingBasketSlots = basket.map((id, i) => {
    const row = gearRows.find((r) => r.id === id);
    const name = row?.shop_items.name ?? "?";
    const slug = row?.shop_items.slug ?? "";
    const rarity = row?.shop_items.rarity ?? "common";

    const rarityGlows: Record<string, string> = {
      common: "border-slate-500 shadow-[0_0_10px_rgba(148,163,184,0.5)]",
      uncommon: "border-green-500/80 shadow-[0_0_10px_rgba(34,197,94,0.5)]",
      rare: "border-blue-500/80 shadow-[0_0_10px_rgba(59,130,246,0.5)]",
      epic: "border-purple-500/80 shadow-[0_0_10px_rgba(168,85,247,0.5)]",
      legendary: "border-amber-500/85 shadow-[0_0_14px_rgba(245,158,11,0.6)]",
    };

    return (
      <div
        key={`${id}-${i}`}
        className={`relative w-14 h-14 md:w-16 md:h-16 border-2 bg-black/85 flex items-center justify-center rounded transition-all duration-300 transform hover:scale-105 ${
          rarityGlows[rarity] || "border-border"
        }`}
        title={name}
      >
        <img
          src={getItemIconUrl(slug)}
          alt={name}
          draggable={false}
          className="w-10 h-10 md:w-12 md:h-12 pixelated object-contain"
          onError={(e) => {
            e.currentTarget.style.opacity = "0";
          }}
        />
        <button
          type="button"
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 border border-border bg-black text-muted-foreground hover:text-destructive hover:border-destructive flex items-center justify-center text-[9px] rounded-full leading-none z-30"
          onClick={() => setBasket((b) => [...b.slice(0, i), ...b.slice(i + 1)])}
        >
          ×
        </button>
      </div>
    );
  });

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Title Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Hammer className="text-primary shrink-0" size={28} />
            <h1 className="text-lg text-primary animate-pulse" style={{ fontFamily: "var(--font-pixel)" }}>
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
              className="text-muted-foreground hover:text-primary transition-colors"
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

      {/* 1. INTERACTIVE VISUAL FORGE CANVAS */}
      <div 
        className={`relative w-full aspect-[2816/1536] overflow-hidden rounded-lg border-2 border-border glow-primary bg-[#120f0d] shadow-2xl select-none group scanlines transition-all duration-300 ${
          forge.isPending ? "animate-forge-shake border-primary" : ""
        }`}
      >
        {/* Wall CSS Background */}
        <div 
          className="absolute inset-0 bottom-[33.33%] pointer-events-none"
          style={{
            background: `
              linear-gradient(rgba(0,0,0,0.3) 2px, transparent 2px),
              linear-gradient(90deg, rgba(0,0,0,0.3) 2px, transparent 2px),
              #1e1915
            `,
            backgroundSize: "32px 32px, 32px 32px"
          }}
        />

        {/* Floor CSS Background */}
        <div 
          className="absolute bottom-0 left-0 w-full h-[33.33%] border-t-2 border-[#3d332c] pointer-events-none"
          style={{
            background: `
              linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,0,0,0.35) 1px, transparent 1px),
              #13100e
            `,
            backgroundSize: "48px 16px"
          }}
        />

        {/* FURNACE LAYER */}
        <img
          src="/forge/furnace.png"
          alt="Furnace"
          draggable={false}
          className={`absolute left-[-6%] bottom-[0%] w-[50%] h-auto pixelated pointer-events-none transition-all duration-500 z-11 ${
            hoveredItem === "furnace" ? "brightness-110 drop-shadow-[0_0_12px_rgba(255,90,0,0.6)]" : ""
          } ${forge.isPending ? "animate-pulse" : ""}`}
        />

        {/* BELLOWS LAYER (FLUSH) */}
        <img
          src="/forge/flush.png"
          alt="Bellows"
          draggable={false}
          className={`absolute left-[0%] bottom-[0%] w-[16%] h-auto pixelated pointer-events-none transition-all duration-500 z-12 ${
            hoveredItem === "furnace" ? "brightness-110 drop-shadow-[0_0_12px_rgba(255,90,0,0.6)]" : ""
          }`}
        />

        {/* ANVIL LAYER */}
        <img
          src="/forge/anvil.png"
          alt="Anvil"
          draggable={false}
          className={`absolute left-[33%] bottom-[0%] w-[32%] h-auto pixelated pointer-events-none transition-all duration-500 z-13 ${
            hoveredItem === "anvil" ? "brightness-115 drop-shadow-[0_0_8px_rgba(217,150,48,0.5)]" : ""
          } ${forge.isPending ? "animate-forge-shake" : ""}`}
        />

        {/* HAMMER LAYER */}
        <img
          src="/forge/hammer.png"
          alt="Hammer"
          draggable={false}
          className={`absolute left-[33%] bottom-[18%] w-[18%] h-auto pixelated pointer-events-none transition-all duration-500 z-14 ${
            hoveredItem === "anvil" ? "brightness-115" : ""
          } ${forge.isPending ? "animate-forge-pounding origin-[45%_55%]" : ""}`}
        />

        {/* TONGS LAYER (TOOL) */}
        <img
          src="/forge/tool.png"
          alt="Tongs"
          draggable={false}
          className={`absolute left-[42%] bottom-[20%] w-[12%] h-auto pixelated pointer-events-none transition-all duration-500 z-15 ${
            hoveredItem === "anvil" ? "brightness-115" : ""
          }`}
        />

        {/* GRINDSTONE LAYER (SPINNER) */}
        <img
          src="/forge/spinner.png"
          alt="Grindstone"
          draggable={false}
          className={`absolute right-[0%] bottom-[0%] w-[48%] h-auto pixelated pointer-events-none transition-all duration-500 z-12 ${
            hoveredItem === "grindstone" ? "brightness-115 drop-shadow-[0_0_8px_rgba(255,200,100,0.4)] animate-[forge-shake_0.4s_infinite]" : ""
          }`}
        />

        {/* INGOTS LAYER (BARS) */}
        <img
          src="/forge/bars.png"
          alt="Ingots"
          draggable={false}
          className={`absolute right-[8%] bottom-[0%] w-[15%] h-auto pixelated pointer-events-none transition-all duration-500 z-14 ${
            hoveredItem === "grindstone" ? "brightness-115 drop-shadow-[0_0_8px_rgba(255,200,100,0.4)]" : ""
          }`}
        />

        {/* BUCKET LAYER */}
        <img
          src="/forge/bucket.png"
          alt="Quench Bucket"
          draggable={false}
          className={`absolute right-[23%] bottom-[2%] w-[19%] h-auto pixelated pointer-events-none transition-all duration-500 z-15 ${
            hoveredItem === "grindstone" ? "brightness-115 drop-shadow-[0_0_8px_rgba(255,200,100,0.4)]" : ""
          }`}
        />

        {/* LIGHTING & GLOW OVERLAYS */}
        {/* Radiating Furnace Fire Glow (Centered around furnace opening) */}
        <div
          className={`absolute inset-0 pointer-events-none mix-blend-screen animate-forge-glow z-15`}
          style={{
            background: `radial-gradient(circle at 12% 70%, rgba(255, 120, 0, ${forge.isPending ? "0.85" : "0.55"}) 0%, rgba(180, 50, 0, 0.2) 35%, transparent 70%)`
          }}
        />

        {/* Orange Ambient overlay fading to dark shadow on the right side */}
        <div
          className="absolute inset-0 pointer-events-none z-16"
          style={{
            background: "linear-gradient(90deg, rgba(255, 100, 0, 0.15) 0%, rgba(255, 60, 0, 0.05) 30%, rgba(0, 0, 0, 0.7) 100%)"
          }}
        />

        {/* Forging Sparks particles */}
        {forge.isPending && Array.from({ length: 15 }).map((_, idx) => (
          <div
            key={idx}
            className="absolute w-1.5 h-1.5 bg-orange-400 rounded-full animate-forge-spark pointer-events-none z-25 shadow-[0_0_6px_#ff9c00]"
            style={{
              left: `${42 + Math.random() * 12}%`,
              top: `${60 + Math.random() * 8}%`,
              animationDelay: `${Math.random() * 0.8}s`,
              animationDuration: `${0.5 + Math.random() * 0.5}s`,
              "--spark-x": `${(Math.random() - 0.5) * 80}px`,
            } as React.CSSProperties}
          />
        ))}

        {/* Hover Info Tooltip Bar */}
        <div 
          className={`absolute top-3 left-1/2 -translate-x-1/2 bg-black/85 border border-border px-3 py-1 text-[10px] text-primary rounded z-20 pointer-events-none transition-all duration-300 text-center font-mono ${
            hoveredItem ? "opacity-100 scale-100" : "opacity-75 scale-95"
          }`}
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          {hoveredItem === "furnace" && "FURNACE: Burning with celestial fire. Positioned flush left."}
          {hoveredItem === "anvil" && "ANVIL: Center-left. Strike equipment flat with hammer."}
          {hoveredItem === "grindstone" && "FINISHING STATION: Grindstone stand, quench bucket & ingots."}
          {!hoveredItem && "MYSTIC FORGE ROOM — Hover elements to inspect"}
        </div>

        {/* MAGICAL FLOATING BASKET SLOTS ABOVE ANVIL */}
        <div className="absolute left-[33%] md:left-[35%] top-[16%] md:top-[20%] w-[34%] md:w-[30%] flex justify-center gap-2 md:gap-3 z-20">
          {basket.length === 0 ? (
            <div className="text-center w-full py-2 bg-black/60 border border-white/10 rounded flex flex-col items-center justify-center px-2 animate-pulse">
              <span className="text-[9px] text-muted-foreground uppercase font-mono tracking-wider" style={{ fontFamily: "var(--font-pixel)" }}>
                FORGE PORTAL
              </span>
              <span className="text-[8px] text-accent mt-0.5" style={{ fontFamily: "var(--font-pixel)" }}>
                Add 3 Bag Items
              </span>
            </div>
          ) : (
            <>
              {floatingBasketSlots}
              {Array.from({ length: 3 - basket.length }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="w-14 h-14 md:w-16 md:h-16 border-2 border-dashed border-white/20 bg-black/60 rounded flex items-center justify-center z-20 animate-pulse"
                  aria-hidden="true"
                >
                  <Hammer className="text-white/10 w-5 h-5 md:w-6 md:h-6" />
                </div>
              ))}
            </>
          )}
        </div>

        {/* Interactive Hover Zones */}
        <div
          onMouseEnter={() => setHoveredItem("furnace")}
          onMouseLeave={() => setHoveredItem(null)}
          className="absolute left-0 top-[10%] w-[32%] h-[90%] cursor-pointer z-10"
        />
        <div
          onMouseEnter={() => setHoveredItem("anvil")}
          onMouseLeave={() => setHoveredItem(null)}
          className="absolute left-[32%] top-[35%] w-[32%] h-[65%] cursor-pointer z-10"
        />
        <div
          onMouseEnter={() => setHoveredItem("grindstone")}
          onMouseLeave={() => setHoveredItem(null)}
          className="absolute left-[64%] top-[25%] w-[36%] h-[75%] cursor-pointer z-10"
        />

        {/* 2. GLORIOUS SUCCESS FLASH REWARD SCREEN */}
        {forgedResult && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center z-30 animate-in fade-in zoom-in-95 duration-300">
            <div className="text-center space-y-4 max-w-sm px-4">
              <h3 className="text-xs text-primary animate-pulse tracking-widest" style={{ fontFamily: "var(--font-pixel)" }}>
                ITEM FORGED SUCCESSFULLY!
              </h3>
              <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                {/* Glowing background circles */}
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-ping" />
                <div className="absolute inset-0 bg-primary/30 rounded-full blur-lg" />
                
                <img
                  src={getItemIconUrl(forgedResult.slug)}
                  alt={forgedResult.name}
                  className="w-16 h-16 relative z-10 pixelated object-contain animate-bounce"
                />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold tracking-wider" style={{ fontFamily: "var(--font-pixel)" }}>
                  {forgedResult.name}
                </h4>
                <p className="text-[10px] uppercase text-accent font-semibold tracking-widest" style={{ fontFamily: "var(--font-pixel)" }}>
                  {forgedResult.rarity}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForgedResult(null)}
                className="px-5 py-2.5 bg-primary text-primary-foreground border-2 border-border text-[9px] hover:bg-primary/80 transition-colors shadow-lg active:scale-95"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                CLAIM EQUIPMENT
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. CONTROLS PANEL */}
      <section className="pixel-panel p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
          <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            FORGING CONTROLS ({basket.length}/3)
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={popLast}
              disabled={basket.length === 0}
              className="px-2.5 py-1 border-2 border-border text-[10px] hover:border-primary disabled:opacity-40 transition-colors"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              UNDO LAST
            </button>
            <button
              type="button"
              onClick={clearBasket}
              disabled={basket.length === 0}
              className="px-2.5 py-1 border-2 border-border text-[10px] hover:border-destructive disabled:opacity-40 transition-colors"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              CLEAR
            </button>
          </div>
        </div>

        {basketRarity ? (
          <p className="text-[10px] text-accent flex items-center gap-1.5" style={{ fontFamily: "var(--font-pixel)" }}>
            <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
            RARITY LOCKED: <span className="uppercase font-semibold">{basketRarity}</span>
          </p>
        ) : null}

        <button
          type="button"
          disabled={basket.length !== 3 || forge.isPending}
          onClick={() => void doForge()}
          className="w-full py-3.5 bg-primary text-primary-foreground font-semibold disabled:opacity-40 hover:bg-primary/95 transition-all text-center border-2 border-border flex items-center justify-center gap-2"
          style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
        >
          {forge.isPending ? (
            <>
              <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              STRIKING THE ANVIL...
            </>
          ) : (
            <>
              <Hammer size={16} className="animate-bounce" />
              FORGE GEAR
            </>
          )}
        </button>
      </section>

      {/* 3. ELIGIBLE GEAR LIST */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border/20 pb-1.5">
          <Shirt className="text-primary shrink-0" size={16} />
          <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            ELIGIBLE GEAR IN BAG
          </h2>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
            <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Scanning bag...
          </div>
        )}
        {!isLoading && gearRows.length === 0 && (
          <p className="text-xs text-muted-foreground italic p-4 text-center border border-dashed border-border rounded bg-secondary/10">
            No unequipped gear in your bag. Purchase items in the Shop first.
          </p>
        )}

        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {gearRows.map((row) => {
            const rar = row.shop_items.rarity;
            const n = countInBasket(row.id);
            const lockedRarity = basketRarity && rar !== basketRarity;
            const canAdd = !row.equipped && basket.length < 3 && n < row.quantity && !lockedRarity;
            
            // Nice color codes for tags
            const rarityTagStyles: Record<string, string> = {
              common: "text-slate-400 bg-slate-500/10 border-slate-500/25",
              uncommon: "text-green-400 bg-green-500/10 border-green-500/25",
              rare: "text-blue-400 bg-blue-500/10 border-blue-500/25",
              epic: "text-purple-400 bg-purple-500/10 border-purple-500/25",
              legendary: "text-amber-400 bg-amber-500/10 border-amber-500/25",
            };

            return (
              <li
                key={row.id}
                className={`pixel-panel p-3 flex items-center justify-between gap-3 transition-all duration-300 ${
                  lockedRarity ? "opacity-45 hover:opacity-50" : "hover:border-primary/50"
                }`}
              >
                <div className="flex gap-3 min-w-0">
                  <div className="w-11 h-11 bg-background/60 border-2 border-border flex items-center justify-center shrink-0 rounded">
                    <img
                      src={getItemIconUrl(row.shop_items.slug)}
                      alt={row.shop_items.name}
                      draggable={false}
                      className="w-9 h-9 pixelated object-contain"
                      onError={(e) => {
                        e.currentTarget.style.opacity = "0";
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex flex-col justify-center">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="font-semibold text-[11px] truncate max-w-[120px] md:max-w-[150px]" style={{ fontFamily: "var(--font-pixel)" }}>
                        {row.shop_items.name}
                      </span>
                      <span
                        className={`text-[9px] uppercase px-1 py-0.5 border rounded font-mono ${
                          rarityTagStyles[rar] || "text-muted-foreground border-border"
                        }`}
                        style={{ fontFamily: "var(--font-pixel)" }}
                      >
                        {rar}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
                        Owned: ×{row.quantity}
                      </span>
                      {n > 0 && (
                        <span className="text-[9px] text-accent font-semibold" style={{ fontFamily: "var(--font-pixel)" }}>
                          ({n} in forge)
                        </span>
                      )}
                      {row.equipped && (
                        <span
                          className="text-[9px] text-destructive font-semibold"
                          style={{ fontFamily: "var(--font-pixel)" }}
                        >
                          EQUIPPED
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canAdd}
                  onClick={() => addChip(row)}
                  className="px-3.5 py-2 border-2 border-border hover:border-primary disabled:opacity-40 text-[10px] shrink-0 font-semibold transition-all hover:bg-secondary/40"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  ADD
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 4. MODAL INFO */}
      {showInfo && (
        <div
          className="fixed inset-0 z-130 bg-black/75 p-4 flex items-center justify-center animate-in fade-in duration-200"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="pixel-panel w-full max-w-xl p-5 space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <h3 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                FORGE GUIDE
              </h3>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="px-2.5 py-0.5 border-2 border-border hover:border-primary text-[10px] transition-colors"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                CLOSE
              </button>
            </div>
            <ul className="list-disc pl-5 space-y-3 text-base text-muted-foreground leading-relaxed">
              <li>
                <strong className="text-foreground">Equipment Rule:</strong> Offer exactly 3 unequipped gear pieces of the same rarity to initiate a roll.
              </li>
              <li>
                <strong className="text-foreground">Rarity Lock:</strong> All 3 input items must share the exact same rarity bracket (e.g. 3 epics).
              </li>
              <li>
                <strong className="text-foreground">Upgrade Output:</strong> Receive 1 random equipment piece of the immediate next tier (e.g. Common → Uncommon → Rare → Epic → Legendary).
              </li>
              <li>
                <strong className="text-foreground">Ceiling Limit:</strong> Legendary pieces cannot be used in the forge (Legendary is the final tier).
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
