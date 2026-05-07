import type { AuraPath, CharacterState } from "./types";
import swordsmanIdle from "../../../characters/swordsman/idle.gif";
import swordsmanStance from "../../../characters/swordsman/stance.gif";
import swordsmanSleep from "../../../characters/swordsman/sleep.gif";
import swordsmanLeft from "../../../characters/swordsman/left.gif";
import swordsmanRight from "../../../characters/swordsman/right.gif";
import mageIdle from "../../../characters/mage/idle.gif";
import mageStance from "../../../characters/mage/stance.gif";
import mageSleep from "../../../characters/mage/sleep.gif";
import mageLeft from "../../../characters/mage/left.gif";
import mageRight from "../../../characters/mage/right.gif";
import paladinIdle from "../../../characters/paladin/idle.gif";
import paladinStance from "../../../characters/paladin/stance.gif";
import paladinSleep from "../../../characters/paladin/sleep.gif";
import paladinLeft from "../../../characters/paladin/left.gif";
import paladinRight from "../../../characters/paladin/right.gif";
import rogueIdle from "../../../characters/rogue/idle.gif";
import rogueStance from "../../../characters/rogue/stance.gif";
import rogueSleep from "../../../characters/rogue/sleep.gif";
import rogueLeft from "../../../characters/rogue/left.gif";
import rogueRight from "../../../characters/rogue/right.gif";

export const PATH_CHARACTER_SPRITES: Record<
  AuraPath,
  { idle: string; stance: string; sleep: string; left: string; right: string }
> = {
  swordsman: {
    idle: swordsmanIdle,
    stance: swordsmanStance,
    sleep: swordsmanSleep,
    left: swordsmanLeft,
    right: swordsmanRight,
  },
  mage: { idle: mageIdle, stance: mageStance, sleep: mageSleep, left: mageLeft, right: mageRight },
  tank: {
    idle: paladinIdle,
    stance: paladinStance,
    sleep: paladinSleep,
    left: paladinLeft,
    right: paladinRight,
  },
  rogue: { idle: rogueIdle, stance: rogueStance, sleep: rogueSleep, left: rogueLeft, right: rogueRight },
};

export function pathCharacterSpriteSrc(path: AuraPath, state: CharacterState): string {
  const s = PATH_CHARACTER_SPRITES[path];
  if (state === "working") return s.stance;
  if (state === "sleeping") return s.sleep;
  return s.idle;
}

export function pathCharacterWalkSpriteSrc(path: AuraPath, direction: "left" | "right"): string {
  const s = PATH_CHARACTER_SPRITES[path];
  return direction === "left" ? s.left : s.right;
}
