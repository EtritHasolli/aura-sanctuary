import { useCallback, useEffect, useRef, useState } from "react";
import {
  SANCTUARY_CHARACTER_WALK_SPEED_PX_PER_SEC,
  SANCTUARY_WANDER_HALF_WIDTH_PX,
  SANCTUARY_WANDER_MIN_STEP_PX,
  SANCTUARY_WANDER_PICK_INTERVAL_MS,
} from "@/lib/aura/sanctuaryCharacterWander";

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickDistinctTarget(currentX: number, halfWidth: number, minStep: number) {
  const lo = -halfWidth;
  const hi = halfWidth;
  for (let i = 0; i < 12; i++) {
    const next = randomInRange(lo, hi);
    if (Math.abs(next - currentX) >= minStep) return next;
  }
  return Math.max(lo, Math.min(hi, currentX + (currentX <= 0 ? minStep : -minStep)));
}

export type SanctuaryWalkDirection = "left" | "right" | null;

export interface SanctuaryIdleWanderOptions {
  /** When true: schedule walks toward random horizontal targets */
  roaming: boolean;
  /**
   * When roaming turns false: if true, reset logical resting X to center (sleep / focus / no path).
   * If false, preserve X (temporary pause — e.g. tap acknowledgement).
   */
  resetHomeWhenRoamingEnds: boolean;
}

/**
 * Idle-only horizontal stroll inside [-halfWidth, +halfWidth]. The next waypoint is chosen only after
 * the previous stride completes (caller drives motion with animate() and invokes onWalkStrideComplete).
 */
export function useSanctuaryIdleWander({
  roaming,
  resetHomeWhenRoamingEnds,
}: SanctuaryIdleWanderOptions) {
  const [targetX, setTargetX] = useState(0);
  const [walkDirection, setWalkDirection] = useState<SanctuaryWalkDirection>(null);

  const lastXRef = useRef(0);
  const strideEndXRef = useRef(0);
  const roamingRef = useRef(roaming);
  const nextPickRef = useRef<number | null>(null);
  const expectingStrideAnimationRef = useRef(false);
  /** After {@link resumeInterruptedStride}, skip one automatic pickStride so pan + sprite stay in sync. */
  const skipInitialPickOnceRef = useRef(false);

  const clearNextPick = useCallback(() => {
    if (nextPickRef.current != null) {
      window.clearTimeout(nextPickRef.current);
      nextPickRef.current = null;
    }
  }, []);

  const scheduleNextPick = useCallback(
    (delayMs: number = SANCTUARY_WANDER_PICK_INTERVAL_MS) => {
      clearNextPick();
      nextPickRef.current = window.setTimeout(() => {
        nextPickRef.current = null;
        pickStrideRef.current?.();
      }, delayMs);
    },
    [clearNextPick],
  );

  const pickStrideRef = useRef<(() => void) | null>(null);

  pickStrideRef.current = () => {
    if (!roamingRef.current) return;
    const raw = pickDistinctTarget(
      lastXRef.current,
      SANCTUARY_WANDER_HALF_WIDTH_PX,
      SANCTUARY_WANDER_MIN_STEP_PX,
    );
    const clamped = Math.max(
      -SANCTUARY_WANDER_HALF_WIDTH_PX,
      Math.min(SANCTUARY_WANDER_HALF_WIDTH_PX, raw),
    );
    const dx = clamped - lastXRef.current;
    if (Math.abs(dx) < SANCTUARY_WANDER_MIN_STEP_PX) {
      expectingStrideAnimationRef.current = false;
      setWalkDirection(null);
      scheduleNextPick(SANCTUARY_WANDER_PICK_INTERVAL_MS);
      return;
    }
    expectingStrideAnimationRef.current = true;
    strideEndXRef.current = clamped;
    setWalkDirection(dx > 0 ? "right" : "left");
    setTargetX(clamped);
  };

  useEffect(() => {
    roamingRef.current = roaming;
    if (!roaming) {
      clearNextPick();
      expectingStrideAnimationRef.current = false;
      setWalkDirection(null);
      if (resetHomeWhenRoamingEnds) {
        lastXRef.current = 0;
        strideEndXRef.current = 0;
        setTargetX(0);
      }
      return;
    }
    if (skipInitialPickOnceRef.current) {
      skipInitialPickOnceRef.current = false;
      return () => clearNextPick();
    }
    pickStrideRef.current?.();
    return () => clearNextPick();
  }, [roaming, resetHomeWhenRoamingEnds, clearNextPick]);

  const onWalkStrideComplete = useCallback(() => {
    if (!roamingRef.current) return;
    if (!expectingStrideAnimationRef.current) return;
    expectingStrideAnimationRef.current = false;
    lastXRef.current = strideEndXRef.current;
    setWalkDirection(null);
    scheduleNextPick(SANCTUARY_WANDER_PICK_INTERVAL_MS);
  }, [scheduleNextPick]);

  /** Call when an in-flight stride is cancelled (e.g. tap acknowledgement interrupts motion). */
  const clearStrideExpectation = useCallback(() => {
    expectingStrideAnimationRef.current = false;
    setWalkDirection(null);
    clearNextPick();
  }, [clearNextPick]);

  /** After a freeze, sync logical resting/target X to match the horizontal motion value before roaming resumes. */
  const syncPanSnapshot = useCallback((px: number) => {
    const clamped = Math.max(
      -SANCTUARY_WANDER_HALF_WIDTH_PX,
      Math.min(SANCTUARY_WANDER_HALF_WIDTH_PX, px),
    );
    lastXRef.current = clamped;
    strideEndXRef.current = clamped;
    setTargetX(clamped);
    setWalkDirection(null);
    expectingStrideAnimationRef.current = false;
  }, []);

  const resumeInterruptedStride = useCallback(
    (panPx: number, endPx: number, dir: Exclude<SanctuaryWalkDirection, null>) => {
      const clamp = (x: number) =>
        Math.max(-SANCTUARY_WANDER_HALF_WIDTH_PX, Math.min(SANCTUARY_WANDER_HALF_WIDTH_PX, x));
      const a = clamp(panPx);
      const b = clamp(endPx);
      clearNextPick();
      skipInitialPickOnceRef.current = true;
      expectingStrideAnimationRef.current = true;
      lastXRef.current = a;
      strideEndXRef.current = b;
      setWalkDirection(dir);
      setTargetX(b);
    },
    [clearNextPick],
  );

  return {
    targetX,
    walkDirection,
    wanderHalfWidthPx: SANCTUARY_WANDER_HALF_WIDTH_PX,
    strideSpeedPxPerSec: SANCTUARY_CHARACTER_WALK_SPEED_PX_PER_SEC,
    recenterTransitionSec: 0.35,
    onWalkStrideComplete,
    clearStrideExpectation,
    syncPanSnapshot,
    resumeInterruptedStride,
    clearNextPick,
  };
}
