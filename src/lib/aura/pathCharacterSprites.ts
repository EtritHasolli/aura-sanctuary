import type { AuraPath, CharacterState } from "./types";
import swordsmanIdle from "../../../characters/swordsman/idle.gif";
import swordsmanIdleBack from "../../../characters/swordsman/idleback.gif";
import swordsmanStance from "../../../characters/swordsman/stance.gif";
import swordsmanSleep from "../../../characters/swordsman/sleep.gif";
import swordsmanSleepBack from "../../../characters/swordsman/sleepback.gif";
import swordsmanLeft from "../../../characters/swordsman/left.gif";
import swordsmanRight from "../../../characters/swordsman/right.gif";
import swordsmanFalling from "../../../characters/swordsman/falling.gif";
import swordsmanFallingBack from "../../../characters/swordsman/fallingback.gif";

import mageIdle from "../../../characters/mage/idle.gif";
import mageIdleBack from "../../../characters/mage/idleback.gif";
import mageStance from "../../../characters/mage/stance.gif";
import mageSleep from "../../../characters/mage/sleep.gif";
import mageSleepBack from "../../../characters/mage/sleepback.gif";
import mageLeft from "../../../characters/mage/left.gif";
import mageRight from "../../../characters/mage/right.gif";
import mageFalling from "../../../characters/mage/falling.gif";
import mageFallingBack from "../../../characters/mage/fallingback.gif";

import paladinIdle from "../../../characters/paladin/idle.gif";
import paladinIdleBack from "../../../characters/paladin/idleback.gif";
import paladinStance from "../../../characters/paladin/stance.gif";
import paladinSleep from "../../../characters/paladin/sleep.gif";
import paladinSleepBack from "../../../characters/paladin/sleepback.gif";
import paladinLeft from "../../../characters/paladin/left.gif";
import paladinRight from "../../../characters/paladin/right.gif";
import paladinFalling from "../../../characters/paladin/falling.gif";
import paladinFallingBack from "../../../characters/paladin/fallingback.gif";

import rogueIdle from "../../../characters/rogue/idle.gif";
import rogueIdleBack from "../../../characters/rogue/idleback.gif";
import rogueStance from "../../../characters/rogue/stance.gif";
import rogueSleep from "../../../characters/rogue/sleep.gif";
import rogueSleepBack from "../../../characters/rogue/sleepback.gif";
import rogueLeft from "../../../characters/rogue/left.gif";
import rogueRight from "../../../characters/rogue/right.gif";
import rogueFalling from "../../../characters/rogue/falling.gif";
import rogueFallingBack from "../../../characters/rogue/fallingback.gif";

import evilSwordsmanIdle from "../../../characters/evilswordsman/idle.gif";
import evilSwordsmanIdleBack from "../../../characters/evilswordsman/idleback.gif";
import evilSwordsmanStance from "../../../characters/evilswordsman/stance.gif";
import evilSwordsmanSleep from "../../../characters/evilswordsman/sleep.gif";
import evilSwordsmanSleepBack from "../../../characters/evilswordsman/sleepback.gif";
import evilSwordsmanLeft from "../../../characters/evilswordsman/left.gif";
import evilSwordsmanRight from "../../../characters/evilswordsman/right.gif";
import evilSwordsmanFalling from "../../../characters/evilswordsman/falling.gif";
import evilSwordsmanFallingBack from "../../../characters/evilswordsman/fallingback.gif";
import evilSwordsmanBed from "../../../beds/evilswordsman.png";

import evilMageIdle from "../../../characters/evilmage/idle.gif";
import evilMageIdleBack from "../../../characters/evilmage/idleback.gif";
import evilMageStance from "../../../characters/evilmage/stance.gif";
import evilMageSleep from "../../../characters/evilmage/sleep.gif";
import evilMageSleepBack from "../../../characters/evilmage/sleepback.gif";
import evilMageLeft from "../../../characters/evilmage/left.gif";
import evilMageRight from "../../../characters/evilmage/right.gif";
import evilMageFalling from "../../../characters/evilmage/falling.gif";
import evilMageFallingBack from "../../../characters/evilmage/fallingback.gif";
import evilMageBed from "../../../beds/evilmage.png";

import evilPaladinIdle from "../../../characters/evilpaladin/idle.gif";
import evilPaladinIdleBack from "../../../characters/evilpaladin/idleback.gif";
import evilPaladinStance from "../../../characters/evilpaladin/stance.gif";
import evilPaladinSleep from "../../../characters/evilpaladin/sleep.gif";
import evilPaladinSleepBack from "../../../characters/evilpaladin/sleepback.gif";
import evilPaladinLeft from "../../../characters/evilpaladin/left.gif";
import evilPaladinRight from "../../../characters/evilpaladin/right.gif";
import evilPaladinFalling from "../../../characters/evilpaladin/falling.gif";
import evilPaladinFallingBack from "../../../characters/evilpaladin/fallingback.gif";
import evilPaladinBed from "../../../beds/evilpaladin.png";

import evilRogueIdle from "../../../characters/evilrogue/idle.gif";
import evilRogueIdleBack from "../../../characters/evilrogue/idleback.gif";
import evilRogueStance from "../../../characters/evilrogue/stance.gif";
import evilRogueSleep from "../../../characters/evilrogue/sleep.gif";
import evilRogueSleepBack from "../../../characters/evilrogue/sleepback.gif";
import evilRogueLeft from "../../../characters/evilrogue/left.gif";
import evilRogueRight from "../../../characters/evilrogue/right.gif";
import evilRogueFalling from "../../../characters/evilrogue/falling.gif";
import evilRogueFallingBack from "../../../characters/evilrogue/fallingback.gif";
import evilRogueBed from "../../../beds/evilrogue.png";

export const PATH_CHARACTER_SPRITES: Record<
  AuraPath,
  {
    idle: string;
    idleBack: string;
    stance: string;
    sleep: string;
    sleepBack: string;
    left: string;
    right: string;
    falling: string;
    fallingBack: string;
    bed?: string;
  }
> = {
  swordsman: {
    idle: swordsmanIdle,
    idleBack: swordsmanIdleBack,
    stance: swordsmanStance,
    sleep: swordsmanSleep,
    sleepBack: swordsmanSleepBack,
    left: swordsmanLeft,
    right: swordsmanRight,
    falling: swordsmanFalling,
    fallingBack: swordsmanFallingBack,
  },
  mage: {
    idle: mageIdle,
    idleBack: mageIdleBack,
    stance: mageStance,
    sleep: mageSleep,
    sleepBack: mageSleepBack,
    left: mageLeft,
    right: mageRight,
    falling: mageFalling,
    fallingBack: mageFallingBack,
  },
  tank: {
    idle: paladinIdle,
    idleBack: paladinIdleBack,
    stance: paladinStance,
    sleep: paladinSleep,
    sleepBack: paladinSleepBack,
    left: paladinLeft,
    right: paladinRight,
    falling: paladinFalling,
    fallingBack: paladinFallingBack,
  },
  rogue: {
    idle: rogueIdle,
    idleBack: rogueIdleBack,
    stance: rogueStance,
    sleep: rogueSleep,
    sleepBack: rogueSleepBack,
    left: rogueLeft,
    right: rogueRight,
    falling: rogueFalling,
    fallingBack: rogueFallingBack,
  },
  evilswordsman: {
    idle: evilSwordsmanIdle,
    idleBack: evilSwordsmanIdleBack,
    stance: evilSwordsmanStance,
    sleep: evilSwordsmanSleep,
    sleepBack: evilSwordsmanSleepBack,
    left: evilSwordsmanLeft,
    right: evilSwordsmanRight,
    falling: evilSwordsmanFalling,
    fallingBack: evilSwordsmanFallingBack,
    bed: evilSwordsmanBed,
  },
  evilmage: {
    idle: evilMageIdle,
    idleBack: evilMageIdleBack,
    stance: evilMageStance,
    sleep: evilMageSleep,
    sleepBack: evilMageSleepBack,
    left: evilMageLeft,
    right: evilMageRight,
    falling: evilMageFalling,
    fallingBack: evilMageFallingBack,
    bed: evilMageBed,
  },
  evilpaladin: {
    idle: evilPaladinIdle,
    idleBack: evilPaladinIdleBack,
    stance: evilPaladinStance,
    sleep: evilPaladinSleep,
    sleepBack: evilPaladinSleepBack,
    left: evilPaladinLeft,
    right: evilPaladinRight,
    falling: evilPaladinFalling,
    fallingBack: evilPaladinFallingBack,
    bed: evilPaladinBed,
  },
  evilrogue: {
    idle: evilRogueIdle,
    idleBack: evilRogueIdleBack,
    stance: evilRogueStance,
    sleep: evilRogueSleep,
    sleepBack: evilRogueSleepBack,
    left: evilRogueLeft,
    right: evilRogueRight,
    falling: evilRogueFalling,
    fallingBack: evilRogueFallingBack,
    bed: evilRogueBed,
  },
};

export function pathCharacterSpriteSrc(
  path: AuraPath,
  state: CharacterState,
  isBack = false,
): string {
  const s = PATH_CHARACTER_SPRITES[path];
  if (state === "working") return s.stance;
  if (state === "sleeping") return isBack ? s.sleepBack : s.sleep;
  return isBack ? s.idleBack : s.idle;
}

export function pathCharacterWalkSpriteSrc(path: AuraPath, direction: "left" | "right"): string {
  const s = PATH_CHARACTER_SPRITES[path];
  return direction === "left" ? s.left : s.right;
}

export function pathCharacterFallingSpriteSrc(path: AuraPath, isBack = false): string | null {
  const s = PATH_CHARACTER_SPRITES[path];
  if (!s) return null;
  return isBack ? s.fallingBack : s.falling;
}

export function pathCharacterBedSpriteSrc(path: AuraPath): string | null {
  const s = PATH_CHARACTER_SPRITES[path];
  return s?.bed ?? null;
}

