"use client";

import { Button } from "@/components/ui/button";
import { AttachmentChip } from "@/components/ui/composites/attachment-chip";
import { FileSparklesIcon } from "@/components/ui/icons/file-sparkles-icon";
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
          className="size-7 overflow-visible px-0 [&_svg]:size-[16px] [&_svg]:overflow-visible"
          onClick={() => onAttachChange(!attachResume)}
        >
          <FileSparklesIcon
            width={16}
            height={16}
            className="shrink-0 overflow-visible"
          />
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
