import { useState } from "react";
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

/** Rules button opens a centered-title dialog with per-game copy. */
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
        className="flex items-center justify-center px-3 py-1.5 border-2 border-border hover:border-primary text-[10px]"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        Rules
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto p-5 sm:p-7 gap-5">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle
              className="flex flex-col items-center justify-center gap-1.5 text-primary text-xl sm:text-2xl leading-tight text-center px-8"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              <span className="block">HOW TO PLAY</span>
              <span className="block">{title.toUpperCase()}</span>
            </DialogTitle>
          </DialogHeader>
          <div
            className="text-lg sm:text-xl text-foreground space-y-4 leading-relaxed [&_ul]:space-y-2 [&_li]:text-lg sm:[&_li]:text-xl"
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
