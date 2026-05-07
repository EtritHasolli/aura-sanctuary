import { motion } from "framer-motion";
import type { PetState } from "@/lib/aura/types";
import type { EquippedPetGearEntry } from "@/lib/aura/petEquipmentLayers";
import { PetEquipmentBack, PetEquipmentFront } from "@/lib/aura/petEquipmentLayers";

export function PetSprite({
  state,
  size = 96,
  gear = [],
  companionSpriteKey,
}: {
  state: PetState;
  size?: number;
  /** Equipped items that map to SVG overlays (`useEquippedPetGear`). */
  gear?: EquippedPetGearEntry[];
  /** Companion catalog `sprite_key` when a hatched companion is equipped as pet. */
  companionSpriteKey?: string;
}) {
  const colors = {
    idle: "var(--color-primary)",
    working: "var(--color-focus)",
    sleeping: "var(--color-muted-foreground)",
  } as const;

  const tint =
    companionSpriteKey === "ember"
      ? "oklch(0.72 0.16 55)"
      : companionSpriteKey === "mist"
        ? "oklch(0.78 0.06 240)"
        : colors[state];

  const animation =
    state === "working"
      ? { y: [0, -2, 0], rotate: [-2, 2, -2] }
      : state === "sleeping"
        ? { scale: [1, 1.04, 1] }
        : { y: [0, -3, 0] };

  return (
    <motion.div
      animate={animation}
      transition={{
        duration: state === "working" ? 0.6 : 2.4,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      className="relative"
    >
      {/* Pixel pet — built with divs */}
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        shapeRendering="crispEdges"
        style={{ imageRendering: "pixelated" }}
      >
        <PetEquipmentBack state={state} gear={gear} />
        {/* body */}
        <rect x="4" y="6" width="8" height="6" fill={tint} />
        <rect x="3" y="7" width="1" height="4" fill={tint} />
        <rect x="12" y="7" width="1" height="4" fill={tint} />
        {/* ears */}
        <rect x="4" y="4" width="2" height="2" fill={tint} />
        <rect x="10" y="4" width="2" height="2" fill={tint} />
        {/* eyes */}
        {state === "sleeping" ? (
          <>
            <rect x="5" y="8" width="2" height="1" fill="oklch(0.15 0.04 240)" />
            <rect x="9" y="8" width="2" height="1" fill="oklch(0.15 0.04 240)" />
          </>
        ) : (
          <>
            <rect x="5" y="8" width="1" height="2" fill="oklch(0.15 0.04 240)" />
            <rect x="10" y="8" width="1" height="2" fill="oklch(0.15 0.04 240)" />
          </>
        )}
        {/* mouth */}
        <rect x="7" y="10" width="2" height="1" fill="oklch(0.15 0.04 240)" />
        {/* feet */}
        <rect x="5" y="12" width="2" height="1" fill={tint} />
        <rect x="9" y="12" width="2" height="1" fill={tint} />
        <PetEquipmentFront state={state} gear={gear} />
      </svg>
      {state === "sleeping" && (
        <motion.span
          className="absolute -top-1 -right-1 text-xs"
          style={{ fontFamily: "var(--font-pixel)", color: "var(--color-muted-foreground)" }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          z
        </motion.span>
      )}
    </motion.div>
  );
}
