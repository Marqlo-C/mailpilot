"use client";

import { ExternalLink } from "lucide-react";

import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { JobDescriptionDocument } from "./job-description-document";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/secondary-action-btn";
import { cn } from "@/lib/utils";

export type OpportunityDescriptionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  company: string;
  logoSrc?: string | null;
  markdown: string;
  applyUrl?: string | null;
};

/**
 * Full job-description popout: structured markdown body with optional Open posting.
 */
export function OpportunityDescriptionDialog({
  open,
  onOpenChange,
  title,
  company,
  logoSrc,
  markdown,
  applyUrl,
}: OpportunityDescriptionDialogProps) {
  return (
    <ActionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      showCancel={false}
      identity={{
        title,
        primary: company,
        logoSrc: logoSrc ?? undefined,
        logoName: company,
      }}
      secondaryAction={
        applyUrl ? (
          <a
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(SECONDARY_ACTION_BTN_CLASSNAME, "gap-1.5")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open posting
          </a>
        ) : null
      }
      primaryAction={
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className={cn(PRIMARY_ACTION_BTN_CLASSNAME)}
        >
          Close
        </button>
      }
    >
      <JobDescriptionDocument markdown={markdown} />
    </ActionDialogShell>
  );
}
