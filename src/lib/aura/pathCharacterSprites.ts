import type { AuraPath, CharacterState } from "./types";
import swordsmanIdle from "../../../characters/swordsman/idle.gif";
import swordsmanStance from "../../../characters/swordsman/stance.gif";
import swordsmanSleep from "../../../characters/swordsman/sleep.gif";
import swordsmanLeft from "../../../characters/swordsman/left.gif";
import swordsmanRight from "../../../characters/swordsman/right.gif";
import swordsmanFalling from "../../../characters/swordsman/falling.gif";
import mageIdle from "../../../characters/mage/idle.gif";
import mageStance from "../../../characters/mage/stance.gif";
import mageSleep from "../../../characters/mage/sleep.gif";
import mageLeft from "../../../characters/mage/left.gif";
import mageRight from "../../../characters/mage/right.gif";
import mageFalling from "../../../characters/mage/falling.gif";
import paladinIdle from "../../../characters/paladin/idle.gif";
import paladinStance from "../../../characters/paladin/stance.gif";
import paladinSleep from "../../../characters/paladin/sleep.gif";
import paladinLeft from "../../../characters/paladin/left.gif";
import paladinRight from "../../../characters/paladin/right.gif";
import paladinFalling from "../../../characters/paladin/falling.gif";
import rogueIdle from "../../../characters/rogue/idle.gif";
import rogueStance from "../../../characters/rogue/stance.gif";
import rogueSleep from "../../../characters/rogue/sleep.gif";
import rogueLeft from "../../../characters/rogue/left.gif";
import rogueRight from "../../../characters/rogue/right.gif";
import rogueFalling from "../../../characters/rogue/falling.gif";

import evilSwordsmanIdle from "../../../characters/evilswordsman/idle.gif";
import evilSwordsmanStance from "../../../characters/evilswordsman/stance.gif";
import evilSwordsmanSleep from "../../../characters/evilswordsman/sleeping.gif";
import evilSwordsmanLeft from "../../../characters/evilswordsman/left.gif";
import evilSwordsmanRight from "../../../characters/evilswordsman/right.gif";
import evilSwordsmanFalling from "../../../characters/evilswordsman/falling.gif";

import evilMageIdle from "../../../characters/evilmage/idle.gif";
import evilMageStance from "../../../characters/evilmage/stance.gif";
import evilMageSleep from "../../../characters/evilmage/sleeping.gif";
import evilMageLeft from "../../../characters/evilmage/left.gif";
import evilMageRight from "../../../characters/evilmage/right.gif";
import evilMageFalling from "../../../characters/evilmage/falling.gif";

import evilPaladinIdle from "../../../characters/evilpaladin/idle.gif";
import evilPaladinStance from "../../../characters/evilpaladin/stance.gif";
import evilPaladinSleep from "../../../characters/evilpaladin/sleeping.gif";
import evilPaladinLeft from "../../../characters/evilpaladin/left.gif";
import evilPaladinRight from "../../../characters/evilpaladin/right.gif";
import evilPaladinFalling from "../../../characters/evilpaladin/falling.gif";

import evilRogueIdle from "../../../characters/evilrogue/idle.gif";
import evilRogueStance from "../../../characters/evilrogue/stance.gif";
import evilRogueSleep from "../../../characters/evilrogue/sleeping.gif";
import evilRogueLeft from "../../../characters/evilrogue/left.gif";
import evilRogueRight from "../../../characters/evilrogue/right.gif";
import evilRogueFalling from "../../../characters/evilrogue/falling.gif";

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
  evilswordsman: {
    idle: evilSwordsmanIdle,
    stance: evilSwordsmanStance,
    sleep: evilSwordsmanSleep,
    left: evilSwordsmanLeft,
    right: evilSwordsmanRight,
  },
  evilmage: {
    idle: evilMageIdle,
    stance: evilMageStance,
    sleep: evilMageSleep,
    left: evilMageLeft,
    right: evilMageRight,
  },
  evilpaladin: {
    idle: evilPaladinIdle,
    stance: evilPaladinStance,
    sleep: evilPaladinSleep,
    left: evilPaladinLeft,
    right: evilPaladinRight,
  },
  evilrogue: {
    idle: evilRogueIdle,
    stance: evilRogueStance,
    sleep: evilRogueSleep,
    left: evilRogueLeft,
    right: evilRogueRight,
  },
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

export function pathCharacterFallingSpriteSrc(path: AuraPath): string | null {
  if (path === "swordsman") return swordsmanFalling;
  if (path === "mage") return mageFalling;
  if (path === "tank") return paladinFalling;
  if (path === "rogue") return rogueFalling;
  if (path === "evilswordsman") return evilSwordsmanFalling;
  if (path === "evilmage") return evilMageFalling;
  if (path === "evilpaladin") return evilPaladinFalling;
  if (path === "evilrogue") return evilRogueFalling;
  return null;
}
