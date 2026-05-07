/** Pixels per second while the path character strolls on the Sanctuary (idle only). */
export const SANCTUARY_CHARACTER_WALK_SPEED_PX_PER_SEC = 35;

/** Max horizontal offset from center (pixels); character stays in [-half, +half]. */
export const SANCTUARY_WANDER_HALF_WIDTH_PX = 72;

/** How often a new stroll target is chosen (ms). */
export const SANCTUARY_WANDER_PICK_INTERVAL_MS = 5_000;

/** Ignore tiny moves so we do not flash walk gifs for imperceptible drifts. */
export const SANCTUARY_WANDER_MIN_STEP_PX = 20;
