import React, { useState, type ChangeEvent } from "react";
import { Mail, MailOpen, Paperclip, Type, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AttachmentChip } from "@/components/ui/composites/attachment-chip";
import {
  COMPOSER_SPLIT_PLATE_CLASSNAME,
  COMPOSER_SPLIT_PLATE_FOCUS_CLASSNAME,
  FIELD_TEXTAREA_CLASSNAME,
} from "@/components/ui/styles/field-chrome";
import { FieldTrailingButton } from "@/components/ui/tactile/text-field";
import { formatSize } from "@/hooks/use-draft-pdf";
import { useContentSettleKey } from "@/hooks/use-content-settle-key";
import type {
  OriginalEmailPreview,
  OpportunityResumePreview,
} from "@/app/actions/opportunities";
import { cn } from "@/lib/utils";
import { DraftAttachControls } from "./draft-attach-controls";
import { DraftPaneBusyOverlay } from "./draft-pane-busy-overlay";

export function EmailEditorPanel({
  attachResume,
  onAttachResumeChange,
  attachLocked = false,
  resume = null,
  resumeSizeLabel = null,
  embedded: _embedded = false,
  recipient,
  setRecipient,
  subject,
  setSubject,
  baselineRecipient,
  baselineSubject,
  onRevertRecipient,
  onRevertSubject,
  originalEmail,
  onViewOriginalEmail,
  body,
  setBody,
  extraFiles,
  removeFile,
  handleFileSelect,
  fileInputId,
  emailBusy,
  emailBusyLabel,
  onCancelEmailTask,
}: {
  attachResume: boolean;
  onAttachResumeChange?: (attach: boolean) => void;
  attachLocked?: boolean;
  resume?: OpportunityResumePreview | null;
  resumeSizeLabel?: string | null;
  /**
   * Desktop split: plate border is the body field chrome (no nested shell).
   * Unsplit / stacked uses the same plate + padding — never a double shell.
   */
  embedded?: boolean;
  recipient: string;
  setRecipient: (value: string) => void;
  subject: string;
  setSubject: (value: string) => void;
  baselineRecipient: string;
  baselineSubject: string;
  onRevertRecipient: () => void;
  onRevertSubject: () => void;
  originalEmail: OriginalEmailPreview | null;
  onViewOriginalEmail: () => void;
  body: string;
  setBody: (value: string) => void;
  extraFiles: File[];
  removeFile: (index: number) => void;
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  fileInputId: string;
  /** True only while this email pane is regenerating or refining. */
  emailBusy: boolean;
  emailBusyLabel: string | null;
  onCancelEmailTask: () => void;
}) {
  const settleKey = useContentSettleKey(emailBusy);
  const recipientDirty = recipient !== baselineRecipient;
  const subjectDirty = subject !== baselineSubject;
  const [bodyFocused, setBodyFocused] = useState(false);
  const showResumeAttach = typeof onAttachResumeChange === "function";

  // Align with To/Subject shell column: those fields sit in px-3, so their
  // right edge is 12px from the plate — match that inset on bottom + right.
  const bodyBlock = (
    <div className="relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
      <label htmlFor="opp-draft-body" className="sr-only">
        Body
      </label>
      <textarea
        id="opp-draft-body"
        className={cn(
          FIELD_TEXTAREA_CLASSNAME,
          // Extra x-inset clears the plate’s rounded corners; text-xs matches field SSOT.
          "min-h-0 flex-1 resize-none bg-transparent px-5 pb-11 pt-2 text-xs leading-relaxed",
          emailBusy && "opacity-50"
        )}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => setBodyFocused(true)}
        onBlur={() => setBodyFocused(false)}
        disabled={emailBusy}
        placeholder="Write your message…"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
        <div className="pointer-events-auto flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {showResumeAttach ? (
            <DraftAttachControls
              attachResume={attachResume}
              onAttachChange={onAttachResumeChange}
              locked={attachLocked}
              resume={resume}
              resumeSizeLabel={resumeSizeLabel}
            />
          ) : null}
          {extraFiles.map((file, index) => (
            <AttachmentChip
              key={`${file.name}-${file.size}-${index}`}
              label={`${file.name} (${formatSize(file.size)})`}
              disabled={emailBusy}
              removeLabel={`Remove ${file.name}`}
              onRemove={() => removeFile(index)}
              className="max-w-[160px]"
            />
          ))}
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center">
          <input
            id={fileInputId}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            disabled={emailBusy}
          />
          <FieldTrailingButton
            title="Attach file"
            aria-label="Attach file"
            disabled={emailBusy}
            onClick={() => {
              document.getElementById(fileInputId)?.click();
            }}
          >
            <Paperclip className="size-4" aria-hidden />
          </FieldTrailingButton>
        </div>
      </div>
    </div>
  );

  const fields = (
    <div
      key={settleKey}
      className="flex min-h-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
    >
      <div className="flex shrink-0 flex-col gap-2 px-3 pt-3">
        <Input
          id="opp-draft-to"
          type="email"
          leadingIcon={Mail}
          placeholder="recruiter@company.com"
          aria-label="To"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          disabled={emailBusy}
          trailing={
            recipientDirty ? (
              <FieldTrailingButton
                title="Revert to original"
                aria-label="Revert recipient"
                disabled={emailBusy}
                onClick={onRevertRecipient}
              >
                <Undo2 className="size-3.5" aria-hidden />
              </FieldTrailingButton>
            ) : null
          }
        />

        <Input
          id="opp-draft-subject"
          leadingIcon={Type}
          placeholder="Subject"
          aria-label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={emailBusy}
          trailing={
            <>
              {subjectDirty ? (
                <FieldTrailingButton
                  title="Revert to original"
                  aria-label="Revert subject"
                  disabled={emailBusy}
                  onClick={onRevertSubject}
                >
                  <Undo2 className="size-3.5" aria-hidden />
                </FieldTrailingButton>
              ) : null}
              {originalEmail ? (
                <FieldTrailingButton
                  title="View original email"
                  aria-label="View original email"
                  disabled={emailBusy}
                  onClick={onViewOriginalEmail}
                >
                  <MailOpen className="size-4" aria-hidden />
                </FieldTrailingButton>
              ) : null}
            </>
          }
        />
      </div>

      {bodyBlock}
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 min-w-0 w-full max-w-full flex-col lg:min-h-0",
        attachResume && "lg:max-w-full",
        COMPOSER_SPLIT_PLATE_CLASSNAME,
        bodyFocused && COMPOSER_SPLIT_PLATE_FOCUS_CLASSNAME
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg">
        {fields}
      </div>

      {emailBusy ? (
        <DraftPaneBusyOverlay
          label={emailBusyLabel ?? "Working on email…"}
          cancelTitle="Cancel email task"
          onCancel={onCancelEmailTask}
        />
      ) : null}
    </div>
  );
}
