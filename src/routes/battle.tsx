import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PATH_CHARACTER_SPRITES } from "@/lib/aura/pathCharacterSprites";
import { pathCharacterFallingSpriteSrc } from "@/lib/aura/pathCharacterSprites";
import type { AuraPath } from "@/lib/aura/types";
import { useProfile } from "@/hooks/useProfile";

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
    staleTime: 0,
  });
}

const MONTH_LABEL = new Date().toLocaleString("default", { month: "long", year: "numeric" });
const WINNING_THRESHOLD = 0.7;

type Stance = "idle" | "stance" | "falling" | "sleep";

function getBaseStances(goodPct: number, evilPct: number): { good: Stance; evil: Stance } {
  if (goodPct >= WINNING_THRESHOLD) return { good: "stance", evil: "falling" };
  if (evilPct >= WINNING_THRESHOLD) return { good: "falling", evil: "stance" };
  return { good: "idle", evil: "idle" };
}

function spriteSrc(path: AuraPath, stance: Stance): string {
  const s = PATH_CHARACTER_SPRITES[path];
  if (stance === "falling") return pathCharacterFallingSpriteSrc(path) ?? s.idle;
  if (stance === "stance") return s.stance;
  if (stance === "sleep") return s.sleep;
  return s.idle;
}

// Exact single-loop duration per falling gif (read from GIF frame delays).
const FALLING_DURATION_MS: Partial<Record<AuraPath, number>> = {
  swordsman: 1700,
  mage: 1700,
  tank: 2100,
  rogue: 1700,
  evilswordsman: 1700,
  evilmage: 1700,
  evilpaladin: 2100,
  evilrogue: 1700,
};

// Each character independently plays falling → sleep with its own timer.
function CharacterSprite({ path, isLoser, flip }: { path: AuraPath; isLoser: boolean; flip: boolean }) {
  const [stance, setStance] = useState<Stance>(isLoser ? "falling" : "idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!isLoser) {
      setStance("idle");
      return;
    }
    setStance("falling");
    timerRef.current = setTimeout(() => setStance("sleep"), FALLING_DURATION_MS[path] ?? 1800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isLoser, path]);

  return (
    <img
      src={spriteSrc(path, stance)}
      alt={PATH_LABELS[path]}
      className="h-32 w-auto object-contain"
      style={{ imageRendering: "pixelated", transform: flip ? "scaleX(-1)" : undefined }}
      draggable={false}
    />
  );
}

function DiamondArmy({
  paths,
  isLoser,
  stance,
  flip,
  labelColor,
  label,
}: {
  paths: AuraPath[];
  isLoser: boolean;
  stance: Stance;
  flip: boolean;
  labelColor: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
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
              {isLoser ? (
                <CharacterSprite path={path} isLoser={true} flip={flip} />
              ) : (
                <img
                  src={spriteSrc(path, stance)}
                  alt={PATH_LABELS[path]}
                  className="h-32 w-auto object-contain"
                  style={{ imageRendering: "pixelated", transform: flip ? "scaleX(-1)" : undefined }}
                  draggable={false}
                />
              )}
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
      <span className={`text-[9px] ${labelColor}`} style={{ fontFamily: "var(--font-pixel)" }}>
        {label}
      </span>
    </div>
  );
}

const OPPOSITE_PATH: Record<AuraPath, AuraPath> = {
  swordsman: "evilswordsman",
  mage: "evilmage",
  tank: "evilpaladin",
  rogue: "evilrogue",
  evilswordsman: "swordsman",
  evilmage: "mage",
  evilpaladin: "tank",
  evilrogue: "rogue",
};

function BattlePage() {
  const { data, isLoading } = useBattleScores();
  const { data: profile } = useProfile();

  const good = data?.good ?? 0;
  const evil = data?.evil ?? 0;
  const total = good + evil;

  const goodPct = total === 0 ? 0.5 : good / total;
  const evilPct = total === 0 ? 0.5 : evil / total;

  const base = getBaseStances(goodPct, evilPct);
  const goodIsLoser = base.good === "falling";
  const evilIsLoser = base.evil === "falling";

  const goodBarPct = Math.round(goodPct * 100);
  const evilBarPct = 100 - goodBarPct;

  const isStandoff = total === 0 || (base.good === "idle" && base.evil === "idle");

  const goodLabel = base.good === "stance" ? "WINNING" : goodIsLoser ? "LOSING" : "STANDOFF";
  const evilLabel = base.evil === "stance" ? "WINNING" : evilIsLoser ? "LOSING" : "STANDOFF";

  const userPath = profile?.aura_path as AuraPath | undefined;
  const opponentPath = userPath ? OPPOSITE_PATH[userPath] : undefined;
  const userIsGood = userPath ? GOOD_PATHS.includes(userPath) : true;
  const userIsLoser = userIsGood ? goodIsLoser : evilIsLoser;
  const opponentIsLoser = userIsGood ? evilIsLoser : goodIsLoser;
  const userLabel = userIsGood ? goodLabel : evilLabel;
  const opponentLabel = userIsGood ? evilLabel : goodLabel;
  const userLabelColor = userIsGood ? "text-[#4f8cff]" : "text-destructive";
  const opponentLabelColor = userIsGood ? "text-destructive" : "text-[#4f8cff]";

  const bar = (
    <div className="w-full px-4 pt-4 pb-2 space-y-1">
      <div className="flex justify-between text-[10px]" style={{ fontFamily: "var(--font-pixel)" }}>
        <span style={{ color: "#4f8cff" }}>
          GOOD · {isLoading ? "—" : `${goodBarPct}%`}
        </span>
        <span className="text-muted-foreground text-[9px]">
          {isLoading ? "—" : isStandoff && total === 0 ? "NO TASKS YET" : `${good} vs ${evil} · ${MONTH_LABEL}`}
        </span>
        <span style={{ color: "#e53935" }}>
          {isLoading ? "—" : `${evilBarPct}%`} · EVIL
        </span>
      </div>
      <div className="relative h-4 w-full bg-secondary overflow-hidden">
        {isLoading ? (
          <div className="absolute inset-0 bg-muted animate-pulse" />
        ) : total === 0 ? (
          <>
            <div className="absolute left-0 top-0 h-full" style={{ width: "50%", backgroundColor: "#4f8cff" }} />
            <div className="absolute right-0 top-0 h-full" style={{ width: "50%", backgroundColor: "#e53935" }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[8px] text-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
                STANDOFF
              </span>
            </div>
          </>
        ) : (
          <>
            <div
              className="absolute left-0 top-0 h-full transition-all duration-700"
              style={{ width: `${goodBarPct}%`, backgroundColor: "#4f8cff" }}
            />
            <div
              className="absolute right-0 top-0 h-full transition-all duration-700"
              style={{ width: `${evilBarPct}%`, backgroundColor: "#e53935" }}
            />
            <div className="absolute left-1/2 top-0 h-full w-0.5 bg-border -translate-x-1/2" />
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      {bar}

      {/* Mobile: only show user's path vs their opposite — good always left, evil always right */}
      {userPath && opponentPath && (
        <div className="flex md:hidden flex-1 items-center justify-center gap-8 px-4 py-6">
          {(() => {
            const leftPath = userIsGood ? userPath : opponentPath;
            const rightPath = userIsGood ? opponentPath : userPath;
            const leftIsLoser = userIsGood ? userIsLoser : opponentIsLoser;
            const rightIsLoser = userIsGood ? opponentIsLoser : userIsLoser;
            const leftLabel = userIsGood ? userLabel : opponentLabel;
            const rightLabel = userIsGood ? opponentLabel : userLabel;
            const leftColor = "text-[#4f8cff]";
            const rightColor = "text-destructive";
            return (
              <>
                <div className="flex flex-col items-center gap-2">
                  <CharacterSprite path={leftPath} isLoser={leftIsLoser} flip={false} />
                  <span className="text-[8px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
                    {PATH_LABELS[leftPath]}
                  </span>
                  <span className={`text-[9px] ${leftColor}`} style={{ fontFamily: "var(--font-pixel)" }}>
                    {leftLabel}
                  </span>
                </div>
                <span className="text-lg text-primary shrink-0" style={{ fontFamily: "var(--font-pixel)" }}>VS</span>
                <div className="flex flex-col items-center gap-2">
                  <CharacterSprite path={rightPath} isLoser={rightIsLoser} flip={true} />
                  <span className="text-[8px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
                    {PATH_LABELS[rightPath]}
                  </span>
                  <span className={`text-[9px] ${rightColor}`} style={{ fontFamily: "var(--font-pixel)" }}>
                    {rightLabel}
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Desktop: full diamond armies */}
      <div className="hidden md:flex flex-1 items-center justify-center gap-4 px-2 py-6">
        <DiamondArmy
          paths={GOOD_PATHS}
          isLoser={goodIsLoser}
          stance={base.good}
          flip={false}
          labelColor="text-[#4f8cff]"
          label={goodLabel}
        />
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            VS
          </span>
        </div>
        <DiamondArmy
          paths={EVIL_PATHS}
          isLoser={evilIsLoser}
          stance={base.evil}
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
