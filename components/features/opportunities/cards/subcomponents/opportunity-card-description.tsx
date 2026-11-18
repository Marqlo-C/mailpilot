"use client";

import {
  formatOpportunityCardTeaser,
  formatOpportunityModalBody,
} from "@/lib/opportunities/context/card-description";
import { OpportunityDescriptionDialog } from "./opportunity-description-dialog";
import { cn } from "@/lib/utils";

export type OpportunityCardDescriptionProps = {
  title: string;
  company: string;
  location?: string | null;
  salary?: string | null;
  description?: string | null;
  logoSrc?: string | null;
  applyUrl?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMultiSelect?: boolean;
};

/**
 * Two-line card-face teaser plus controlled full-description dialog.
 * In multiselect mode, modal clicking is disabled so card selection is unimpeded.
 * Returns null when neither a teaser nor a modal body can be derived.
 */
export function OpportunityCardDescription({
  title,
  company,
  location,
  salary,
  description,
  logoSrc,
  applyUrl,
  open,
  onOpenChange,
  isMultiSelect = false,
}: OpportunityCardDescriptionProps) {
  const context = { roleTitle: title, company, location, salary };
  const teaser = formatOpportunityCardTeaser(description, context);
  const modalBody = formatOpportunityModalBody(description, context);

  if (!teaser && !modalBody) return null;

  return (
    <>
      {teaser ? (
        <button
          type="button"
          onClick={(e) => {
            if (isMultiSelect) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onOpenChange(true);
          }}
          disabled={!modalBody || isMultiSelect}
          className={cn(
            "min-h-[2.5rem] w-full px-6 text-left text-xs leading-relaxed text-foreground/80 sm:px-8 dark:text-foreground/85",
            "line-clamp-2 transition-colors",
            modalBody && !isMultiSelect
              ? "cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              : "cursor-default select-none pointer-events-none"
          )}
          aria-label={modalBody && !isMultiSelect ? "View full job description" : undefined}
        >
          {teaser}
        </button>
      ) : null}

      {modalBody && !isMultiSelect ? (
        <OpportunityDescriptionDialog
          open={open}
          onOpenChange={onOpenChange}
          title={title}
          company={company}
          logoSrc={logoSrc}
          markdown={modalBody}
          applyUrl={applyUrl}
        />
      ) : null}
    </>
  );
}

/**
 * Whether the overflow menu should expose Full Description.
 */
export function opportunityHasModalDescription(
  description?: string | null,
  context?: {
    roleTitle?: string | null;
    company?: string | null;
    location?: string | null;
    salary?: string | null;
  }
): boolean {
  return Boolean(formatOpportunityModalBody(description, context));
}
