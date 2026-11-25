import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Password field with an eye button that reveals what was typed. */
export function PasswordInput({ className, style, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={cn(
          "w-full pl-3 pr-10 py-2.5 bg-input border-2 border-border focus:border-primary outline-none leading-snug",
          className,
        )}
        style={{
          // Readable mono: the pixel font made l / I / 1 indistinguishable.
          fontFamily: "var(--font-input)",
          fontSize: "0.875rem",
          ...style,
        }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-primary"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
