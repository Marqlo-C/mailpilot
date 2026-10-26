import { Globe } from "lucide-react";

import { cn } from "@/lib/utils";

/** 18px marks. GitHub, Glassdoor, and Handshake sit ~15% larger (21px). */
const MARK_ICON_CLASSNAME =
  "object-contain opacity-65 transition-opacity hover:opacity-100 dark:invert dark:opacity-75";

/** Job-site marks in /public/icons. Website has no asset, so the tile uses Globe. */
export const LINKED_ACCOUNT_FIELDS = [
  { key: "linkedWebsite", label: "Website", iconSrc: null, iconSize: "size-[18px]" },
  { key: "linkedLinkedin", label: "LinkedIn", iconSrc: "/icons/LinkedIn Icon.png", iconSize: "size-[18px]" },
  { key: "linkedGithub", label: "GitHub", iconSrc: "/icons/GitHub Icon.png", iconSize: "size-[21px]" },
  { key: "linkedIndeed", label: "Indeed", iconSrc: "/icons/Indeed Icon.png", iconSize: "size-[18px]" },
  { key: "linkedGlassdoor", label: "Glassdoor", iconSrc: "/icons/Glassdoor Icon.png", iconSize: "size-[21px]" },
  { key: "linkedHandshake", label: "Handshake", iconSrc: "/icons/Handshake Icon.png", iconSize: "size-[21px]" },
] as const;

export type LinkedAccountFieldKey = (typeof LINKED_ACCOUNT_FIELDS)[number]["key"];

/** Shared frame for contact channels and linked-account marks. */
export const ICON_SQUIRCLE_CLASSNAME =
  "flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/40 shadow-xs overflow-hidden";

export function PlatformMark({
  name,
  src,
  iconSize = "size-[18px]",
}: {
  name: string;
  src?: string | null;
  iconSize?: string;
}) {
  return (
    <div className={ICON_SQUIRCLE_CLASSNAME}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn(MARK_ICON_CLASSNAME, iconSize)}
        />
      ) : (
        <Globe className="size-[18px] text-muted-foreground" />
      )}
    </div>
  );
}

export function LinkStatusPill({ linked }: { linked: boolean }) {
  if (linked) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Linked
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Missing
    </span>
  );
}
