"use client";

import type { ReactNode } from "react";
import { Banknote, Briefcase, MapPin } from "lucide-react";

import {
  META_CHIP_ICON_CLASSNAME,
  MetaChip,
} from "@/components/ui/tactile/meta-chip";
import { cn } from "@/lib/utils";

export type OpportunityDraftCompensationFieldsProps = {
  salary?: string | null;
  location?: string | null;
  employmentType?: string | null;
};

/**
 * Compensation meta chips for the opportunity draft dialog — same language as
 * Job Radar card badges (`MetaChip` + Banknote / MapPin / Briefcase), denser
 * for the identity header.
 */
export function OpportunityDraftCompensationFields({
  salary,
  location,
  employmentType,
}: OpportunityDraftCompensationFieldsProps) {
  if (!salary && !location && !employmentType) return null;

  const salaryTone =
    salary && !/^\$?\s*tbd\b/i.test(salary) ? "success" : "default";

  // Dense header chips — smaller than Job Radar card badges.
  const chipClassName = "h-5 shrink-0";
  const valueClassName = "text-[10px] font-medium leading-none";

  const chips: ReactNode[] = [];
  if (location) {
    chips.push(
      <MetaChip
        key="location"
        title={`Location: ${location}`}
        icon={<MapPin className={META_CHIP_ICON_CLASSNAME.sm} aria-hidden />}
        iconSize="sm"
        value={location}
        divider="pipe"
        truncateValue
        className={cn(chipClassName, "max-w-[200px] shrink")}
        valueClassName={cn(valueClassName, "text-foreground/80")}
      />
    );
  }
  if (salary) {
    chips.push(
      <MetaChip
        key="salary"
        title={`Salary: ${salary}`}
        icon={<Banknote className={META_CHIP_ICON_CLASSNAME.sm} aria-hidden />}
        iconSize="sm"
        value={salary}
        divider="pipe"
        tone={salaryTone}
        className={chipClassName}
        valueClassName={cn(valueClassName, "font-semibold")}
      />
    );
  }
  if (employmentType) {
    chips.push(
      <MetaChip
        key="employment"
        title={`Employment: ${employmentType}`}
        icon={
          <Briefcase className={META_CHIP_ICON_CLASSNAME.sm} aria-hidden />
        }
        iconSize="sm"
        value={employmentType}
        divider="pipe"
        className={chipClassName}
        valueClassName={cn(valueClassName, "text-foreground/80")}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips}
    </div>
  );
}
