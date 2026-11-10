"use client";

import { DollarSign, MapPin, Briefcase } from "lucide-react";

export type OpportunityDraftCompensationFieldsProps = {
  salary?: string | null;
  location?: string | null;
  employmentType?: string | null;
};

/**
 * Compensation, salary range, and position details panel for the opportunity draft modal.
 */
export function OpportunityDraftCompensationFields({
  salary,
  location,
  employmentType,
}: OpportunityDraftCompensationFieldsProps) {
  if (!salary && !location && !employmentType) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
      {salary ? (
        <span className="flex items-center gap-1 font-medium text-foreground">
          <DollarSign className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          <span>{salary}</span>
        </span>
      ) : null}

      {location ? (
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3 text-muted-foreground/70" />
          <span>{location}</span>
        </span>
      ) : null}

      {employmentType ? (
        <span className="flex items-center gap-1">
          <Briefcase className="h-3 w-3 text-muted-foreground/70" />
          <span>{employmentType}</span>
        </span>
      ) : null}
    </div>
  );
}
