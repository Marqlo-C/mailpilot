"use client";

import { Calendar, MapPin, Banknote } from "lucide-react";
import { LabelTooltip } from "@/components/ui/tooltip";
import { ReceivedMeta } from "@/components/ui/composites/received-meta";
import {
  META_CHIP_ICON_CLASSNAME,
  MetaChip,
} from "@/components/ui/tactile/meta-chip";
import { cn } from "@/lib/utils";

export type OpportunityCardBadgesProps = {
  locationRaw?: string | null;
  locationLabel: string;
  salaryRaw?: string | null;
  salaryLabel: string;
  postedRaw?: string | null;
  receivedAt: Date | string;
  isSelected?: boolean;
};

export function OpportunityCardBadges({
  locationRaw,
  locationLabel,
  salaryRaw,
  salaryLabel,
  postedRaw,
  receivedAt,
  isSelected,
}: OpportunityCardBadgesProps) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-2 px-5 py-1 text-[11px] select-none sm:px-6",
        isSelected && "opacity-55"
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <MetaChip
          title={`Location: ${locationRaw || "Not specified"}`}
          icon={<MapPin className={META_CHIP_ICON_CLASSNAME.md} aria-hidden />}
          iconSize="md"
          value={locationLabel}
          divider="pipe"
          truncateValue
          selected={isSelected}
          className="max-w-[200px] shrink sm:max-w-[240px]"
          valueClassName="font-medium text-foreground/80"
        />
        <MetaChip
          title={`Salary: ${salaryRaw || "Not specified"}`}
          icon={<Banknote className={META_CHIP_ICON_CLASSNAME.md} aria-hidden />}
          iconSize="md"
          value={salaryLabel}
          divider="pipe"
          selected={isSelected}
          tone={
            salaryRaw && !/^\$?\s*tbd\b/i.test(salaryRaw)
              ? "success"
              : "default"
          }
          className="shrink-0"
          valueClassName="font-semibold"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap ml-auto">
        {postedRaw ? (
          <>
            <LabelTooltip label={`Posted: ${postedRaw}`} side="top">
              <span className="inline-flex items-center gap-1 text-muted-foreground/50">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                <span className="whitespace-nowrap">{postedRaw}</span>
              </span>
            </LabelTooltip>
            <span className="text-muted-foreground/60" aria-hidden>
              ·
            </span>
          </>
        ) : null}
        <ReceivedMeta
          date={receivedAt}
          className="text-muted-foreground/70 text-[11px] whitespace-nowrap"
          iconClassName="text-muted-foreground/70"
        />
      </div>
    </div>
  );
}
