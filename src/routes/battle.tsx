import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PATH_CHARACTER_SPRITES } from "@/lib/aura/pathCharacterSprites";
import { pathCharacterFallingSpriteSrc } from "@/lib/aura/pathCharacterSprites";
import type { AuraPath } from "@/lib/aura/types";

export const Route = createFileRoute("/battle")({
  head: () => ({ meta: [{ title: "Battle — Aura" }] }),
  component: BattlePage,
});

const GOOD_PATHS: AuraPath[] = ["swordsman", "mage", "tank", "rogue"];
const EVIL_PATHS: AuraPath[] = ["evilswordsman", "evilmage", "evilpaladin", "evilrogue"];

const PATH_LABELS: Record<AuraPath, string> = {
  swordsman: "Swordsman",
  mage: "Mage",
  tank: "Paladin",
  rogue: "Rogue",
  evilswordsman: "Chaos Knight",
  evilmage: "Warlock",
  evilpaladin: "Death Knight",
  evilrogue: "Assassin",
};

// Diamond positions for 4 characters: top, left, right, bottom
const DIAMOND_POSITIONS = [
  { gridColumn: 2, gridRow: 1 }, // top
  { gridColumn: 1, gridRow: 2 }, // left
  { gridColumn: 3, gridRow: 2 }, // right
  { gridColumn: 2, gridRow: 3 }, // bottom
];

function useBattleScores() {
  return useQuery({
    queryKey: ["battle_scores"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        name: string,
      ) => Promise<{ data: { good_count: number; evil_count: number }[] | null; error: { message: string } | null }>)(
        "get_battle_scores",
      );
      if (error) throw new Error(error.message);
      const row = data?.[0] ?? { good_count: 0, evil_count: 0 };
      return {
        good: Number(row.good_count),
        evil: Number(row.evil_count),
      };
    },
    staleTime: 60_000,
  });
}

const MONTH_LABEL = new Date().toLocaleString("default", { month: "long", year: "numeric" });
const WINNING_THRESHOLD = 0.7;

type Stance = "idle" | "stance" | "falling";

function getStances(goodPct: number, evilPct: number): { good: Stance; evil: Stance } {
  if (goodPct >= WINNING_THRESHOLD) return { good: "stance", evil: "falling" };
  if (evilPct >= WINNING_THRESHOLD) return { good: "falling", evil: "stance" };
  return { good: "idle", evil: "idle" };
}

function spriteSrc(path: AuraPath, stance: Stance): string {
  const s = PATH_CHARACTER_SPRITES[path];
  if (stance === "falling") return pathCharacterFallingSpriteSrc(path) ?? s.idle;
  if (stance === "stance") return s.stance;
  return s.idle;
}

function DiamondArmy({
  paths,
  stance,
  flip,
  labelColor,
  label,
}: {
  paths: AuraPath[];
  stance: Stance;
  flip: boolean;
  labelColor: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {/* diamond grid: 3 cols × 3 rows, characters at top/left/right/bottom */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 130px)",
          gridTemplateRows: "repeat(3, 140px)",
          gap: "0px",
        }}
      >
        {paths.map((path, i) => {
          const pos = DIAMOND_POSITIONS[i];
          return (
            <div
              key={path}
              style={{ gridColumn: pos.gridColumn, gridRow: pos.gridRow }}
              className="flex flex-col items-center justify-end gap-1"
            >
              <img
                src={spriteSrc(path, stance)}
                alt={PATH_LABELS[path]}
                className="h-32 w-auto object-contain"
                style={{
                  imageRendering: "pixelated",
                  transform: flip ? "scaleX(-1)" : undefined,
                }}
                draggable={false}
              />
              <span
                className="text-[8px] text-muted-foreground text-center leading-tight w-28"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                {PATH_LABELS[path]}
              </span>
            </div>
          );
        })}
      </div>
      <span
        className={`text-[9px] ${labelColor}`}
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        {label}
      </span>
    </div>
  );
}

function BattlePage() {
  const { data, isLoading } = useBattleScores();

  const good = data?.good ?? 0;
  const evil = data?.evil ?? 0;
  const total = good + evil;

  const goodPct = total === 0 ? 0.5 : good / total;
  const evilPct = total === 0 ? 0.5 : evil / total;

  const { good: goodStance, evil: evilStance } = getStances(goodPct, evilPct);

  const goodBarPct = Math.round(goodPct * 100);
  const evilBarPct = 100 - goodBarPct;

  const isStandoff = total === 0 || (goodStance === "idle" && evilStance === "idle");

  const goodLabel = goodStance === "stance" ? "WINNING" : goodStance === "falling" ? "LOSING" : "STANDOFF";
  const evilLabel = evilStance === "stance" ? "WINNING" : evilStance === "falling" ? "LOSING" : "STANDOFF";

  return (
    <div className="flex flex-col min-h-full">
      {/* Tug-of-war bar — full width, flush to top, no box */}
      <div className="w-full px-4 pt-4 pb-2 space-y-1">
        <div className="flex justify-between text-[10px]" style={{ fontFamily: "var(--font-pixel)" }}>
          <span className="text-[color:var(--color-focus)]">
            GOOD · {isLoading ? "—" : `${goodBarPct}%`}
          </span>
          <span className="text-muted-foreground text-[9px]">
            {isLoading ? "—" : isStandoff && total === 0 ? "NO TASKS YET" : `${good} vs ${evil} · ${MONTH_LABEL}`}
          </span>
          <span className="text-destructive">
            {isLoading ? "—" : `${evilBarPct}%`} · EVIL
          </span>
        </div>

        {/* Bar — full width, no border-box around it */}
        <div className="relative h-4 w-full bg-secondary overflow-hidden">
          {isLoading ? (
            <div className="absolute inset-0 bg-muted animate-pulse" />
          ) : total === 0 ? (
            <>
              <div className="absolute left-0 top-0 h-full bg-[color:var(--color-focus)]" style={{ width: "50%" }} />
              <div className="absolute right-0 top-0 h-full bg-destructive" style={{ width: "50%" }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[8px] text-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
                  STANDOFF
                </span>
              </div>
            </>
          ) : (
            <>
              <div
                className="absolute left-0 top-0 h-full bg-[color:var(--color-focus)] transition-all duration-700"
                style={{ width: `${goodBarPct}%` }}
              />
              <div
                className="absolute right-0 top-0 h-full bg-destructive transition-all duration-700"
                style={{ width: `${evilBarPct}%` }}
              />
              <div className="absolute left-1/2 top-0 h-full w-0.5 bg-border -translate-x-1/2" />
            </>
          )}
        </div>
      </div>

      {/* Characters — full width, no box */}
      <div className="flex-1 flex items-center justify-center gap-4 px-2 py-6">
        <DiamondArmy
          paths={GOOD_PATHS}
          stance={goodStance}
          flip={false}
          labelColor="text-[color:var(--color-focus)]"
          label={goodLabel}
        />

        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            VS
          </span>
        </div>

        <DiamondArmy
          paths={EVIL_PATHS}
          stance={evilStance}
          flip={true}
          labelColor="text-destructive"
          label={evilLabel}
        />
      </div>

      <p className="text-center text-[8px] text-muted-foreground pb-4" style={{ fontFamily: "var(--font-pixel)" }}>
        Resets at the start of each month · habits not counted
      </p>
    </div>
  );
}
