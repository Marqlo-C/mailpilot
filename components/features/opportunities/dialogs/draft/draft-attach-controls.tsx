"use client";

import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AttachmentChip } from "@/components/ui/composites/attachment-chip";
import { LabelTooltip } from "@/components/ui/tooltip";
import type { OpportunityResumePreview } from "@/app/actions/opportunities";
import { cn } from "@/lib/utils";

/**
 * Email-body attach row — tailored resume icon toggle + optional filename chip.
 * Lives left of the paperclip with other attachment chips.
 */
export function DraftAttachControls({
  attachResume,
  onAttachChange,
  locked,
  resume,
  resumeSizeLabel,
  className,
}: {
  attachResume: boolean;
  onAttachChange: (attach: boolean) => void;
  locked: boolean;
  resume: OpportunityResumePreview | null;
  resumeSizeLabel: string | null;
  className?: string;
}) {
  const tip = attachResume
    ? "Remove tailored resume"
    : "Include tailored resume";

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      <LabelTooltip label={tip} side="top">
        <Button
          type="button"
          variant={attachResume ? "secondary" : "outline"}
          size="sm"
          disabled={locked}
          aria-pressed={attachResume}
          aria-label={tip}
          className="size-7 px-0"
          onClick={() => onAttachChange(!attachResume)}
        >
          <FileText className="size-3.5" aria-hidden />
        </Button>
      </LabelTooltip>
      {attachResume && resume ? (
        <AttachmentChip
          label={
            resumeSizeLabel
              ? `${resume.filename} (${resumeSizeLabel})`
              : resume.filename
          }
          disabled={locked}
          removeLabel="Remove resume attachment"
          onRemove={() => onAttachChange(false)}
          className="max-w-[160px]"
        />
      ) : null}
    </div>
  );
}
