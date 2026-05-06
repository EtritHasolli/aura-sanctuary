import { useProfile } from "@/hooks/useProfile";
import { usePomodoro } from "./PomodoroContext";
import { PetSprite } from "./PetSprite";
import { xpForLevel } from "@/lib/aura/types";
import { Coins, Swords, Brain, Heart } from "lucide-react";

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] mb-0.5" style={{ fontFamily: "var(--font-pixel)" }}>
        <span className="text-muted-foreground">{label}</span>
        <span>{value}/{max}</span>
      </div>
      <div className="h-3 w-full bg-muted border-2 border-border relative overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function HUD() {
  const { data: profile } = useProfile();
  const { petState } = usePomodoro();
  if (!profile) return null;
  const xpMax = xpForLevel(profile.level);

  return (
    <header className="border-b-2 border-border bg-card/80 backdrop-blur px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Avatar + Pet */}
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 pixel-panel flex items-center justify-center bg-secondary">
            <span style={{ fontFamily: "var(--font-pixel)" }} className="text-primary text-lg">
              {profile.display_name[0]?.toUpperCase()}
            </span>
          </div>
          <div className="w-14 h-14 flex items-center justify-center">
            <PetSprite state={petState} size={56} />
          </div>
        </div>

        {/* Identity + Bars */}
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm" style={{ fontFamily: "var(--font-pixel)" }}>{profile.display_name}</h2>
            <span className="text-xs px-1.5 py-0.5 bg-primary text-primary-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
              LV {profile.level}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <Bar value={profile.hp} max={profile.max_hp} color="var(--color-hp)" label="HP" />
            <Bar value={profile.xp} max={xpMax} color="var(--color-xp)" label="XP" />
          </div>
        </div>

        {/* Stats + Gold */}
        <div className="flex items-center gap-3 text-sm" style={{ fontFamily: "var(--font-display)" }}>
          <div className="flex items-center gap-1 text-[color:var(--color-gold)]">
            <Coins size={16} /> <span className="text-base">{profile.gold}</span>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="flex items-center gap-1" title="Strength"><Swords size={14} className="text-destructive" /> {profile.strength}</div>
          <div className="flex items-center gap-1" title="Intelligence"><Brain size={14} className="text-accent" /> {profile.intelligence}</div>
          <div className="flex items-center gap-1" title="Constitution"><Heart size={14} className="text-primary" /> {profile.constitution}</div>
        </div>
      </div>
    </header>
  );
}
