import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useProfile";
import { Shield, RefreshCw, Search, ChevronUp, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Aura" }] }),
  component: AdminPage,
});

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  display_name: string;
  level: number;
  gold: number;
  moonshards: number;
  xp: number;
  hp: number;
  max_hp: number;
  subscription_tier: string;
  task_count: number;
  friend_code: string | null;
}

type SortKey = keyof UserRow;

function timeSince(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border px-2 py-1 text-center min-w-[56px]">
      <div className="text-[8px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>{label}</div>
      <div className="text-xs text-foreground" style={{ fontFamily: "var(--font-pixel)" }}>{value}</div>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "created_at", dir: "desc" });

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase.rpc as any)("admin_get_users");
    setLoading(false);
    if (err) { setError(err.message); return; }
    setUsers((data as UserRow[]) ?? []);
  }

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  useEffect(() => {
    if (!adminLoading && isAdmin === false) {
      void navigate({ to: "/" });
    }
  }, [isAdmin, adminLoading, navigate]);

  if (adminLoading || isAdmin === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm" style={{ fontFamily: "var(--font-pixel)" }}>
        Loading...
      </div>
    );
  }

  if (!isAdmin) return null;

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.email?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q) || u.friend_code?.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sort.key] ?? "";
    const bv = b[sort.key] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sort.key !== k) return <ChevronUp size={10} className="opacity-20" />;
    return sort.dir === "asc" ? <ChevronUp size={10} className="text-primary" /> : <ChevronDown size={10} className="text-primary" />;
  }

  const totalUsers = users.length;
  const premiumUsers = users.filter((u) => u.subscription_tier !== "free").length;
  const totalTasks = users.reduce((s, u) => s + (u.task_count ?? 0), 0);
  const avgLevel = totalUsers ? Math.round(users.reduce((s, u) => s + (u.level ?? 0), 0) / totalUsers) : 0;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-primary" />
          <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            ADMIN
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void fetchUsers()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-border hover:border-primary text-xs text-muted-foreground hover:text-primary transition-colors"
          style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          REFRESH
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "TOTAL USERS", value: totalUsers },
          { label: "PREMIUM", value: premiumUsers },
          { label: "TOTAL TASKS", value: totalTasks },
          { label: "AVG LEVEL", value: avgLevel },
        ].map(({ label, value }) => (
          <div key={label} className="pixel-panel p-3 text-center">
            <div className="text-[9px] text-muted-foreground mb-1" style={{ fontFamily: "var(--font-pixel)" }}>{label}</div>
            <div className="text-2xl text-primary" style={{ fontFamily: "var(--font-pixel)" }}>{value}</div>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-xs text-destructive border border-destructive px-3 py-2" style={{ fontFamily: "var(--font-pixel)" }}>
          {error}
        </p>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, email or friend code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border-2 border-border bg-background pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-primary"
          style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
        />
      </div>

      {/* Table */}
      <div className="pixel-panel overflow-x-auto">
        <table className="w-full text-xs" style={{ fontFamily: "var(--font-pixel)", fontSize: "0.58rem" }}>
          <thead>
            <tr className="border-b-2 border-border">
              {(
                [
                  { key: "display_name" as SortKey, label: "NAME" },
                  { key: "email" as SortKey, label: "EMAIL" },
                  { key: "level" as SortKey, label: "LV" },
                  { key: "gold" as SortKey, label: "GOLD" },
                  { key: "moonshards" as SortKey, label: "SHARDS" },
                  { key: "task_count" as SortKey, label: "TASKS" },
                  { key: "subscription_tier" as SortKey, label: "TIER" },
                  { key: "last_sign_in_at" as SortKey, label: "LAST SEEN" },
                  { key: "created_at" as SortKey, label: "JOINED" },
                ] as { key: SortKey; label: string }[]
              ).map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="text-left px-3 py-2 text-muted-foreground cursor-pointer hover:text-primary transition-colors whitespace-nowrap select-none"
                >
                  <span className="flex items-center gap-1">
                    {label}
                    <SortIcon k={key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-muted-foreground animate-pulse">
                  Loading users...
                </td>
              </tr>
            )}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
            {!loading && sorted.map((u, i) => (
              <tr
                key={u.id}
                className={`border-b border-border hover:bg-secondary/40 transition-colors ${i % 2 === 0 ? "" : "bg-secondary/10"}`}
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="font-medium text-foreground">{u.display_name}</div>
                  {u.friend_code && (
                    <div className="text-muted-foreground opacity-60">{u.friend_code}</div>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{u.email}</td>
                <td className="px-3 py-2 text-center">
                  <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-[9px]">{u.level}</span>
                </td>
                <td className="px-3 py-2 text-center text-[color:var(--color-gold)]">{u.gold}</td>
                <td className="px-3 py-2 text-center text-accent">{u.moonshards}</td>
                <td className="px-3 py-2 text-center">{u.task_count}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-1.5 py-0.5 text-[9px] ${u.subscription_tier === "free" ? "border border-border text-muted-foreground" : "bg-accent text-accent-foreground"}`}>
                    {u.subscription_tier.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground">{timeSince(u.last_sign_in_at)}</td>
                <td className="px-3 py-2 text-center text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[9px] text-muted-foreground text-right" style={{ fontFamily: "var(--font-pixel)" }}>
        {sorted.length} / {totalUsers} users
      </p>

      {/* Per-user detail cards (mobile-friendly alternative) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 xl:hidden">
        {sorted.map((u) => (
          <div key={u.id} className="pixel-panel p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm text-foreground" style={{ fontFamily: "var(--font-pixel)" }}>{u.display_name}</div>
                <div className="text-[9px] text-muted-foreground break-all">{u.email}</div>
              </div>
              <span className={`shrink-0 px-1.5 py-0.5 text-[9px] ${u.subscription_tier === "free" ? "border border-border text-muted-foreground" : "bg-accent text-accent-foreground"}`} style={{ fontFamily: "var(--font-pixel)" }}>
                {u.subscription_tier.toUpperCase()}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <StatChip label="LV" value={u.level} />
              <StatChip label="GOLD" value={u.gold} />
              <StatChip label="SHARDS" value={u.moonshards} />
              <StatChip label="TASKS" value={u.task_count} />
              <StatChip label="HP" value={`${u.hp}/${u.max_hp}`} />
            </div>
            <div className="text-[9px] text-muted-foreground flex justify-between" style={{ fontFamily: "var(--font-pixel)" }}>
              <span>Last: {timeSince(u.last_sign_in_at)}</span>
              <span>Joined: {new Date(u.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" })}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
