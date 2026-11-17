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
  description?: string | null;
  logoSrc?: string | null;
  applyUrl?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Two-line card-face teaser plus controlled full-description dialog.
 * Returns null when neither a teaser nor a modal body can be derived.
 */
export function OpportunityCardDescription({
  title,
  company,
  description,
  logoSrc,
  applyUrl,
  open,
  onOpenChange,
}: OpportunityCardDescriptionProps) {
  const context = { roleTitle: title, company };
  const teaser = formatOpportunityCardTeaser(description, context);
  const modalBody = formatOpportunityModalBody(description);

  if (!teaser && !modalBody) return null;

  return (
    <>
      {teaser ? (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          disabled={!modalBody}
          className={cn(
            "min-h-[2.5rem] w-full px-6 text-left text-xs leading-relaxed text-foreground/80 sm:px-7 dark:text-foreground/85",
            "line-clamp-2 transition-colors",
            modalBody
              ? "cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              : "cursor-default"
          )}
          aria-label={modalBody ? "View full job description" : undefined}
        >
          {teaser}
        </button>
      ) : null}

      {modalBody ? (
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
  description?: string | null
): boolean {
  return Boolean(formatOpportunityModalBody(description));
}
