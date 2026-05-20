export type SudokuUserSettings = {
  /** Tint the selected cell’s row, column, and 3×3 box. */
  highlightHouses: boolean;
  /** Tint other cells that match the selected cell’s digit. */
  highlightSameNumbers: boolean;
  /** Show the elapsed-time readout (timer still runs in the background). */
  showTimer: boolean;
  /**
   * When true, digits that already appear nine times are omitted from the pad and blocked
   * from keyboard entry; when false, all 1–9 stay available.
   */
  removeFilledDigitsFromPad: boolean;
  /**
   * When true, holding a pad digit for 1 second locks it as the active digit.
   * Tapping any empty cell then places that digit. Auto-clears when all 9 are placed.
   */
  stickyDigitMode: boolean;
};

export const SUDOKU_USER_SETTINGS_DEFAULT: SudokuUserSettings = {
  highlightHouses: true,
  highlightSameNumbers: true,
  showTimer: true,
  removeFilledDigitsFromPad: true,
  stickyDigitMode: false,
};

export const SUDOKU_SETTINGS_CHANGED_EVENT = "aura-sudoku-user-settings";

function storageKey(userId: string | null) {
  return `aura-sudoku-user-settings-v1-${userId ?? "guest"}`;
}

export function readSudokuUserSettings(userId: string | null): SudokuUserSettings {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { ...SUDOKU_USER_SETTINGS_DEFAULT };
    const p = JSON.parse(raw) as Partial<SudokuUserSettings>;
    return {
      ...SUDOKU_USER_SETTINGS_DEFAULT,
      ...p,
    };
  } catch {
    return { ...SUDOKU_USER_SETTINGS_DEFAULT };
  }
}

export function writeSudokuUserSettings(
  userId: string | null,
  next: SudokuUserSettings,
) {
  localStorage.setItem(storageKey(userId), JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent<SudokuUserSettings>(SUDOKU_SETTINGS_CHANGED_EVENT, { detail: next }),
  );
}
