import { useEffect, useRef, useState } from "react";
import { publicAsset } from "@/lib/utils";

interface BugLoaderProps {
  /** Overlay the nearest positioned ancestor (use inside a `relative` container). */
  overlay?: boolean;
  /** Label shown below the spinner. */
  label?: string;
  size?: "sm" | "md";
}

function BugSprite({ size }: { size: "sm" | "md" }) {
  const dim = size === "sm" ? "w-6 h-6" : "w-10 h-10";
  return (
    <img
      src={publicAsset("bug-loader.png")}
      alt=""
      aria-hidden="true"
      className={`${dim} animate-spin`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

export function BugLoader({ overlay = false, label, size = "md" }: BugLoaderProps) {
  const inner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <BugSprite size={size} />
      {label && (
        <span
          className="text-[10px] text-primary animate-pulse"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          {label}
        </span>
      )}
    </div>
  );

  if (!overlay) return inner;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
      {inner}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roaming bug — wanders the screen in abstract directions, bouncing off edges.
// Used on the error page.
// ---------------------------------------------------------------------------

const BUG_SIZE = 40; // px, matches w-10 h-10
const SPEED = 1.4; // px per frame
const TURN_CHANCE = 0.012; // chance per frame of picking a new direction
const TURN_MAX_DELTA = Math.PI / 3; // max angle change per turn

export function RoamingBug() {
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 80, y: 80 });
  const angleRef = useRef(Math.random() * Math.PI * 2);
  const [transform, setTransform] = useState("translate(80px, 80px)");
  const [rotation, setRotation] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const step = () => {
      const parent = containerRef.current?.parentElement;
      const maxX = (parent?.clientWidth ?? window.innerWidth) - BUG_SIZE;
      const maxY = (parent?.clientHeight ?? window.innerHeight) - BUG_SIZE;

      // Random slight direction change
      if (Math.random() < TURN_CHANCE) {
        angleRef.current += (Math.random() - 0.5) * 2 * TURN_MAX_DELTA;
      }

      let { x, y } = posRef.current;
      let angle = angleRef.current;

      x += Math.cos(angle) * SPEED;
      y += Math.sin(angle) * SPEED;

      // Bounce off edges with a random reflected angle
      if (x < 0) { x = 0; angle = Math.PI - angle + (Math.random() - 0.5) * 0.6; }
      if (x > maxX) { x = maxX; angle = Math.PI - angle + (Math.random() - 0.5) * 0.6; }
      if (y < 0) { y = 0; angle = -angle + (Math.random() - 0.5) * 0.6; }
      if (y > maxY) { y = maxY; angle = -angle + (Math.random() - 0.5) * 0.6; }

      posRef.current = { x, y };
      angleRef.current = angle;

      setTransform(`translate(${x}px, ${y}px)`);
      setRotation((angle * 180) / Math.PI + 90);

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        className="absolute top-0 left-0 w-10 h-10"
        style={{ transform, willChange: "transform" }}
      >
        <img
          src={publicAsset("bug-loader.png")}
          alt=""
          aria-hidden="true"
          className="w-10 h-10"
          style={{
            imageRendering: "pixelated",
            transform: `rotate(${rotation}deg)`,
          }}
        />
      </div>
    </div>
  );
}
