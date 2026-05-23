import { useEffect, useMemo, useState } from "react";
import { Pencil, Sparkles, Trash2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useSubscriptionTiers,
  useSubscriptionLimits,
  useIsAdmin,
  useUpsertSubscriptionTier,
  useDeleteSubscriptionTier,
  useSetUserSubscription,
  type SubscriptionTier,
  type UpsertTierInput,
} from "@/hooks/useSubscription";

const MAX_ACTIVE_TIERS = 3;

const IS_ELECTRON = typeof window !== "undefined" && !!window.navigator.userAgent.includes("Electron");

const CHECKOUT_URLS: Record<string, string> = {
  adventurer: `https://aurasanctuary.lemonsqueezy.com/checkout/buy/1e30b4a6-fc0c-4eea-a7ee-71a0c96cb06e${IS_ELECTRON ? "" : "?embed=1"}`,
  legend: `https://aurasanctuary.lemonsqueezy.com/checkout/buy/acbc9f4b-9907-4457-a80c-490ffb69d136${IS_ELECTRON ? "" : "?embed=1"}`,
};

export function SubscriptionPanel() {
  const { user } = useAuth();
  const { data: tiers = [], isLoading: tiersLoading } = useSubscriptionTiers();
  const { data: limits } = useSubscriptionLimits();
  const { data: isAdmin = false } = useIsAdmin();

  const upsertTier = useUpsertSubscriptionTier();
  const deleteTier = useDeleteSubscriptionTier();
  const setUserSub = useSetUserSubscription();

  const [editing, setEditing] = useState<SubscriptionTier | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => a.sort_order - b.sort_order),
    [tiers],
  );

  const currentTierSlug = limits?.tier_slug ?? "free";

  const handleAssignSelf = async (slug: string) => {
    if (!user) return;
    try {
      await setUserSub.mutateAsync({
        user_id: user.id,
        tier_slug: slug,
        expires_at: null,
        grant_signup_bonus: true,
      });
      toast.success(`Subscription set to ${slug}.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not set subscription.");
    }
  };

  return (
    <section className="pixel-panel p-4 space-y-4">
      {tiersLoading ? (
        <p className="text-xs text-muted-foreground">Loading plans…</p>
      ) : sortedTiers.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No subscription tiers configured yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sortedTiers.map((tier) => (
            <TierCard
              key={tier.slug}
              tier={tier}
              current={tier.slug === currentTierSlug}
              isAdmin={isAdmin}
              checkoutUrl={CHECKOUT_URLS[tier.slug] ?? null}
              onAssign={() => void handleAssignSelf(tier.slug)}
              onEdit={() => setEditing(tier)}
              onDelete={async () => {
                try {
                  await deleteTier.mutateAsync(tier.slug);
                  toast.success(`Tier "${tier.name}" deleted.`);
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Delete failed.");
                }
              }}
            />
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t-2 border-border">
          <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
            ADMIN — up to {MAX_ACTIVE_TIERS} active tiers
          </p>
          <button
            type="button"
            disabled={sortedTiers.length >= MAX_ACTIVE_TIERS}
            onClick={() => setCreatingNew(true)}
            className="px-3 py-1.5 border-2 border-border hover:border-primary text-[10px] disabled:opacity-40"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            ADD TIER
          </button>
        </div>
      )}

      {editing && (
        <TierEditorDialog
          tier={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            try {
              await upsertTier.mutateAsync(input);
              toast.success(`Saved "${input.name}".`);
              setEditing(null);
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "Save failed.");
            }
          }}
        />
      )}
      {creatingNew && (
        <TierEditorDialog
          tier={null}
          onClose={() => setCreatingNew(false)}
          onSubmit={async (input) => {
            try {
              await upsertTier.mutateAsync(input);
              toast.success(`Created "${input.name}".`);
              setCreatingNew(false);
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "Create failed.");
            }
          }}
        />
      )}
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 border border-border bg-secondary/40 text-[10px]"
      style={{ fontFamily: "var(--font-pixel)" }}
    >
      {children}
    </span>
  );
}

/**
 * Compact status row showing the current plan + party-cap usage. Designed to
 * sit next to a page heading (e.g. on `/subscription`).
 */
export function SubscriptionStatusBadges() {
  const { data: limits } = useSubscriptionLimits();
  if (!limits) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
      <Badge>
        <span className="mr-1">Plan</span>
        <span className="text-primary">{limits.tier_name}</span>
      </Badge>
      <Badge>
        <Users size={10} className="mr-1" />
        {limits.parties_owned}/{limits.max_parties_owned} owned
      </Badge>
      <Badge>
        <Users size={10} className="mr-1" />
        {limits.parties_joined}/{limits.max_parties_joined} joined
      </Badge>
      {limits.expires_at && (
        <Badge>until {new Date(limits.expires_at).toLocaleDateString()}</Badge>
      )}
    </div>
  );
}

function TierCard({
  tier,
  current,
  isAdmin,
  checkoutUrl,
  onAssign,
  onEdit,
  onDelete,
}: {
  tier: SubscriptionTier;
  current: boolean;
  isAdmin: boolean;
  checkoutUrl: string | null;
  onAssign: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const priceLabel = tier.is_free
    ? "Free"
    : tier.price_usd > 0
      ? `$${tier.price_usd.toFixed(2)}/mo`
      : "Free";

  const perks: string[] = [
    `${tier.max_parties_owned} parties you can lead`,
    `${tier.max_parties_joined} parties you can join`,
    tier.max_notes != null ? `${tier.max_notes} archive notes` : "Unlimited archive notes",
    tier.max_tasks != null ? `${tier.max_tasks} active tasks` : "Unlimited active tasks",
  ];
  if (tier.monthly_moonshards > 0) {
    perks.push(`+${tier.monthly_moonshards} moonshards / month`);
  }
  if (tier.signup_bonus_moonshards > 0) {
    perks.push(`+${tier.signup_bonus_moonshards} moonshards signup bonus`);
  }
  const cosmetic = tier.perks?.cosmetic_borders === true;
  const chatHistoryDays =
    typeof tier.perks?.chat_history_days === "number" ? tier.perks.chat_history_days : null;
  const forgeDailyAttempts =
    typeof tier.perks?.forge_daily_attempts === "number" ? tier.perks.forge_daily_attempts : null;
  if (chatHistoryDays != null) perks.push(`${chatHistoryDays} day chat history`);
  if (forgeDailyAttempts != null && forgeDailyAttempts < 999) {
    perks.push(`${forgeDailyAttempts} forge attempts / day`);
  } else if (forgeDailyAttempts === 999) {
    perks.push(`Unlimited forge attempts`);
  }
  if (cosmetic) perks.push(`Cosmetic borders & flair`);

  return (
    <div
      className={`relative pixel-panel p-3 flex flex-col gap-2 ${
        current ? "border-primary" : ""
      }`}
    >
      {current && (
        <span
          className="absolute -top-2 left-3 bg-primary text-primary-foreground px-2 py-0.5 text-[9px] uppercase"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          Current plan
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            className="text-base text-primary truncate"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            {tier.name}
          </h3>
          <p className="text-sm text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            {priceLabel}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              title="Edit"
              className="p-1 border border-border hover:border-primary text-muted-foreground hover:text-primary"
            >
              <Pencil size={12} />
            </button>
            {!tier.is_free && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete tier "${tier.name}"? Subscribers will revert to free.`)) {
                    onDelete();
                  }
                }}
                title="Delete"
                className="p-1 border border-border hover:border-destructive text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
      {tier.description && (
        <p
          className="text-sm text-muted-foreground leading-snug"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {tier.description}
        </p>
      )}
      <ul
        className="space-y-1.5 text-sm text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {perks.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <Sparkles size={14} className="mt-0.5 text-accent shrink-0" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-2 flex flex-col gap-1">
        {current ? (
          <button
            type="button"
            disabled
            className="w-full px-3 py-2.5 border-2 border-primary text-primary text-xs disabled:opacity-100"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            ACTIVE
          </button>
        ) : tier.is_free ? (
          <button
            type="button"
            onClick={onAssign}
            className="w-full px-3 py-2.5 border-2 border-border hover:border-primary text-xs"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            DOWNGRADE
          </button>
        ) : (
          <>
            {checkoutUrl ? (
              <a
                href={checkoutUrl}
                target={IS_ELECTRON ? "_blank" : undefined}
                rel={IS_ELECTRON ? "noopener noreferrer" : undefined}
                className={`w-full block text-center px-2 py-2.5 bg-primary text-primary-foreground text-xs hover:opacity-90${IS_ELECTRON ? "" : " lemonsqueezy-button"}`}
                style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}
              >
                SUBSCRIBE
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="w-full px-2 py-2.5 bg-primary/40 text-primary-foreground text-xs cursor-not-allowed"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}
              >
                SUBSCRIBE (SOON)
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={onAssign}
                className="px-3 py-1.5 border border-border hover:border-primary text-[10px] text-muted-foreground hover:text-foreground"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                ADMIN: ASSIGN TO ME
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TierEditorDialog({
  tier,
  onClose,
  onSubmit,
}: {
  tier: SubscriptionTier | null;
  onClose: () => void;
  onSubmit: (input: UpsertTierInput) => Promise<void> | void;
}) {
  const [form, setForm] = useState<UpsertTierInput>(() =>
    tier
      ? {
          slug: tier.slug,
          name: tier.name,
          description: tier.description,
          sort_order: tier.sort_order,
          price_usd: tier.price_usd,
          max_parties_owned: tier.max_parties_owned,
          max_parties_joined: tier.max_parties_joined,
          max_notes: tier.max_notes,
          max_tasks: tier.max_tasks,
          monthly_moonshards: tier.monthly_moonshards,
          signup_bonus_moonshards: tier.signup_bonus_moonshards,
          perks: tier.perks ?? {},
          is_active: tier.is_active,
        }
      : {
          slug: "",
          name: "",
          description: "",
          sort_order: 1,
          price_usd: 0,
          max_parties_owned: 3,
          max_parties_joined: 5,
          max_notes: null,
          max_tasks: null,
          monthly_moonshards: 0,
          signup_bonus_moonshards: 0,
          perks: {},
          is_active: true,
        },
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tier) {
      setForm({
        slug: tier.slug,
        name: tier.name,
        description: tier.description,
        sort_order: tier.sort_order,
        price_usd: tier.price_usd,
        max_parties_owned: tier.max_parties_owned,
        max_parties_joined: tier.max_parties_joined,
        max_notes: tier.max_notes,
        max_tasks: tier.max_tasks,
        monthly_moonshards: tier.monthly_moonshards,
        signup_bonus_moonshards: tier.signup_bonus_moonshards,
        perks: tier.perks ?? {},
        is_active: tier.is_active,
      });
    }
  }, [tier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.slug.trim() || !form.name.trim()) {
      toast.error("Slug and name are required.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-pixel)" }}>
            {tier ? `Edit: ${tier.name}` : "New tier"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Slug">
              <input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                disabled={!!tier}
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs disabled:opacity-50"
                placeholder="adventurer"
              />
            </Field>
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
                placeholder="Adventurer"
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Sort">
              <input
                type="number"
                value={form.sort_order ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
              />
            </Field>
            <Field label="Price USD">
              <input
                type="number"
                step="0.01"
                value={form.price_usd ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, price_usd: Number(e.target.value) }))}
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
              />
            </Field>
            <Field label="Active">
              <select
                value={form.is_active ? "yes" : "no"}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === "yes" }))}
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
              >
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Max parties OWNED">
              <input
                type="number"
                value={form.max_parties_owned ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_parties_owned: Number(e.target.value) }))
                }
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
              />
            </Field>
            <Field label="Max parties JOINED">
              <input
                type="number"
                value={form.max_parties_joined ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_parties_joined: Number(e.target.value) }))
                }
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Max notes (blank = unlimited)">
              <input
                type="number"
                min="1"
                placeholder="unlimited"
                value={form.max_notes ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    max_notes: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
              />
            </Field>
            <Field label="Max tasks (blank = unlimited)">
              <input
                type="number"
                min="1"
                placeholder="unlimited"
                value={form.max_tasks ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    max_tasks: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Moonshards / month">
              <input
                type="number"
                value={form.monthly_moonshards ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, monthly_moonshards: Number(e.target.value) }))
                }
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
              />
            </Field>
            <Field label="Signup bonus">
              <input
                type="number"
                value={form.signup_bonus_moonshards ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, signup_bonus_moonshards: Number(e.target.value) }))
                }
                className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs"
              />
            </Field>
          </div>
          <Field label="Perks JSON (advanced — keys: chat_history_days, forge_daily_attempts, cosmetic_borders)">
            <textarea
              value={JSON.stringify(form.perks ?? {}, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value || "{}");
                  setForm((f) => ({ ...f, perks: parsed }));
                } catch {
                  // ignore until valid
                }
              }}
              rows={3}
              className="w-full px-2 py-1.5 bg-input border-2 border-border text-xs font-mono"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border-2 border-border text-xs"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-xs disabled:opacity-50"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {submitting ? "SAVING..." : "SAVE"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="block text-[9px] text-muted-foreground mb-1 uppercase tracking-wide"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
