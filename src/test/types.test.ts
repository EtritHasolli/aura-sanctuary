import { describe, it, expect } from "vitest";
import {
  xpForLevel,
  DIFFICULTY_XP,
  DIFFICULTY_GOLD,
  DIFFICULTY_HP_LOSS,
} from "@/lib/aura/types";

describe("xpForLevel", () => {
  it("returns base XP for level 1", () => {
    expect(xpForLevel(1)).toBe(45);
  });

  it("increases each level", () => {
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
    expect(xpForLevel(10)).toBeGreaterThan(xpForLevel(5));
  });

  it("ramps harder at higher levels than early on", () => {
    const stepEarly = xpForLevel(3) - xpForLevel(2);
    const stepMid = xpForLevel(11) - xpForLevel(10);
    expect(stepMid).toBeGreaterThan(stepEarly);
  });
});

describe("DIFFICULTY_XP", () => {
  it("trivial gives 2 xp", () => expect(DIFFICULTY_XP.trivial).toBe(2));
  it("easy gives 5 xp", () => expect(DIFFICULTY_XP.easy).toBe(5));
  it("medium gives 10 xp", () => expect(DIFFICULTY_XP.medium).toBe(10));
  it("hard gives 20 xp", () => expect(DIFFICULTY_XP.hard).toBe(20));
});

describe("DIFFICULTY_GOLD", () => {
  it("trivial gives 1 gold", () => expect(DIFFICULTY_GOLD.trivial).toBe(1));
  it("easy gives 3 gold", () => expect(DIFFICULTY_GOLD.easy).toBe(3));
  it("medium gives 7 gold", () => expect(DIFFICULTY_GOLD.medium).toBe(7));
  it("hard gives 15 gold", () => expect(DIFFICULTY_GOLD.hard).toBe(15));
});

describe("DIFFICULTY_HP_LOSS", () => {
  it("trivial deals 2 hp loss", () => expect(DIFFICULTY_HP_LOSS.trivial).toBe(2));
  it("easy deals 5 hp loss", () => expect(DIFFICULTY_HP_LOSS.easy).toBe(5));
  it("medium deals 10 hp loss", () => expect(DIFFICULTY_HP_LOSS.medium).toBe(10));
  it("hard deals 18 hp loss", () => expect(DIFFICULTY_HP_LOSS.hard).toBe(18));
});
