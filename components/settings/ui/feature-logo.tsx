import type { LucideIcon } from "lucide-react";

/** Level 2 logo frame shared with Tailoring & Layout feature cards. */
export function SettingsFeatureLogo({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div
      className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80 p-1 shadow-sm"
      aria-hidden="true"
    >
      <div className="flex size-full items-center justify-center rounded-[0.6rem] bg-muted/30">
        <Icon className="size-5 text-muted-foreground" />
      </div>
    </div>
  );
}
