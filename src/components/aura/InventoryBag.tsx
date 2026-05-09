import { Package } from "lucide-react";
import { useUserItems, useConsumeUserItem, getItemIconUrl } from "@/hooks/useShop";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type InventoryBagProps = {
  /** Tailwind max-height for scroll area (e.g. max-h-[50vh], max-h-48) */
  listMaxHeightClass?: string;
  className?: string;
};

export function InventoryBag({ listMaxHeightClass = "max-h-[50vh]", className }: InventoryBagProps) {
  const { data: bag, isLoading } = useUserItems();
  const consume = useConsumeUserItem();

  const useItem = async (slug: string) => {
    try {
      const r = await consume.mutateAsync({ slug, quantity: 1 });
      toast.success(`Used ${r.item_slug}. STA ${r.stamina_after}, HP ${r.hp_after}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not use item";
      toast.error(msg);
    }
  };

  return (
    <section
      className={cn("pixel-panel p-4 h-fit", className)}
    >
      <div className="flex items-center gap-2 mb-3">
        <Package size={16} className="text-accent" />
        <h3 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          YOUR BAG
        </h3>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">...</p>}
      {!isLoading && (!bag || bag.length === 0) && (
        <p className="text-xs text-muted-foreground italic">Empty. Hit the Shop for supplies.</p>
      )}
      <ul className={`space-y-2 overflow-y-auto ${listMaxHeightClass}`}>
        {bag?.map((row) => (
          <li key={row.id} className="border-2 border-border p-2 text-xs flex gap-2">
            <div className="w-10 h-10 bg-background/50 border-2 border-border flex items-center justify-center shrink-0 overflow-hidden">
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
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <span style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}>
                  {row.shop_items.name}
                </span>
                <span className="text-muted-foreground shrink-0">×{row.quantity}</span>
              </div>
              <div
                className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {row.shop_items.description}
              </div>
              {row.equipped && (
                <span
                  className="text-[9px] text-[color:var(--color-hp)]"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  EQUIPPED
                </span>
              )}
            {row.shop_items.category === "consumable" && (
              <button
                type="button"
                disabled={row.quantity < 1 || consume.isPending}
                onClick={() => useItem(row.shop_items.slug)}
                className="mt-2 px-2 py-1 bg-accent text-accent-foreground disabled:opacity-40"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}
              >
                USE
              </button>
            )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
