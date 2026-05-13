import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: [
            "group toast",
            "!bg-card !text-foreground",
            "!border-2 !border-border",
            "!rounded-none !shadow-none",
            "!px-3 !py-2",
            "!gap-2",
          ].join(" "),
          title: "!text-[10px] !font-normal !leading-snug",
          description: "!text-[9px] !text-muted-foreground !leading-snug",
          success: "!border-primary !text-primary",
          error: "!border-destructive !text-destructive",
          warning: "!border-accent !text-accent",
          info: "!border-border !text-foreground",
          closeButton: [
            "!bg-card !border !border-border !rounded-none",
            "!text-muted-foreground hover:!text-foreground hover:!border-primary",
            "!w-5 !h-5 !p-0",
          ].join(" "),
          icon: "!w-4 !h-4 !mt-0",
        },
        style: {
          fontFamily: "var(--font-pixel)",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
