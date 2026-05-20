import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  readSudokuUserSettings,
  writeSudokuUserSettings,
  type SudokuUserSettings,
} from "@/lib/games/sudokuUserSettings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

function SettingRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/60 last:border-0">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="text-foreground cursor-pointer text-base leading-snug">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="shrink-0 mt-1"
      />
    </div>
  );
}

export function SudokuSettingsButton() {
  const { user } = useAuth();
  const userKey = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SudokuUserSettings>(() =>
    readSudokuUserSettings(userKey),
  );

  useEffect(() => {
    setDraft(readSudokuUserSettings(userKey));
  }, [userKey, open]);

  const patch = (partial: Partial<SudokuUserSettings>) => {
    const next = { ...draft, ...partial };
    setDraft(next);
    writeSudokuUserSettings(userKey, next);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Sudoku settings"
        aria-label="Sudoku settings"
        className="flex items-center justify-center px-3 py-1.5 border-2 border-border hover:border-primary text-[10px]"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        <Settings size={14} className="md:hidden" />
        <span className="hidden md:inline">Settings</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-1rem)] p-5 sm:p-6 gap-4">
          <DialogHeader>
            <DialogTitle
              className="text-primary text-lg leading-tight text-center"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              SUDOKU SETTINGS
            </DialogTitle>
            <p className="text-sm text-muted-foreground text-center pt-1">
              Saved for {user ? "your account" : "this browser"}.
            </p>
          </DialogHeader>
          <div className="space-y-1" style={{ fontFamily: "var(--font-display)" }}>
            <SettingRow
              id="sudoku-highlight-houses"
              label="Highlight row, column & box"
              description="Shade the full row, column, and 3×3 block for the selected cell."
              checked={draft.highlightHouses}
              onCheckedChange={(v) => patch({ highlightHouses: v })}
            />
            <SettingRow
              id="sudoku-highlight-same"
              label="Highlight matching numbers"
              description="Shade other cells that show the same digit as the selected cell."
              checked={draft.highlightSameNumbers}
              onCheckedChange={(v) => patch({ highlightSameNumbers: v })}
            />
            <SettingRow
              id="sudoku-remove-filled-pad"
              label="Remove finished digits from pad"
              description="Hide a number on the side pad once nine of that digit are on the board (keyboard follows the same rule when on)."
              checked={draft.removeFilledDigitsFromPad}
              onCheckedChange={(v) => patch({ removeFilledDigitsFromPad: v })}
            />
            <SettingRow
              id="sudoku-show-timer"
              label="Show timer"
              description="Hide the clock next to the board; your solve time still runs and counts for scores."
              checked={draft.showTimer}
              onCheckedChange={(v) => patch({ showTimer: v })}
            />
            <SettingRow
              id="sudoku-sticky-digit"
              label="Sticky digit mode"
              description="Hold a number on the pad for 1 second to lock it. Tap any empty cell to place it. Auto-clears when all 9 are placed."
              checked={draft.stickyDigitMode}
              onCheckedChange={(v) => patch({ stickyDigitMode: v })}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
