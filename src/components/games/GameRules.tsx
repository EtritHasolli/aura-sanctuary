import { useState } from "react";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface GameRulesButtonProps {
  /** Game name shown in the dialog title (e.g. "Sudoku"). */
  title: string;
  /** The rules content. Plain JSX so games can format their own lists. */
  children: React.ReactNode;
  /** Tooltip / aria-label for the trigger button. */
  buttonLabel?: string;
}

/**
 * Small `i`-icon button that opens a dialog explaining the game's rules.
 * Designed to sit in a game header next to a BACK button.
 */
export function GameRulesButton({
  title,
  children,
  buttonLabel = "How to play",
}: GameRulesButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={buttonLabel}
        aria-label={buttonLabel}
        className="flex items-center gap-1 px-3 py-1.5 border-2 border-border hover:border-primary text-[10px]"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        <Info size={12} />
        <span className="hidden sm:inline">RULES</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2 text-primary"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              <Info size={16} />
              {title.toUpperCase()} · HOW TO PLAY
            </DialogTitle>
          </DialogHeader>
          <div
            className="text-sm text-foreground space-y-3 leading-snug"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default GameRulesButton;
