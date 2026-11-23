import React, { useState, type ChangeEvent } from "react";
import { FileText, Mail, Paperclip, Type, Undo2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  COMPOSER_SPLIT_PLATE_CLASSNAME,
  COMPOSER_SPLIT_PLATE_FOCUS_CLASSNAME,
  FIELD_SHELL_MULTILINE_CLASSNAME,
  FIELD_TEXTAREA_CLASSNAME,
} from "@/components/ui/styles/field-chrome";
import { FieldTrailingButton } from "@/components/ui/tactile/text-field";
import { formatSize } from "@/hooks/use-draft-pdf";
import { useContentSettleKey } from "@/hooks/use-content-settle-key";
import type { OriginalEmailPreview } from "@/app/actions/opportunities";
import { cn } from "@/lib/utils";
import { DraftPaneBusyOverlay } from "./draft-pane-busy-overlay";

export function EmailEditorPanel({
  attachResume,
  embedded = false,
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
  /**
   * Desktop split: this panel owns the plate; body has no nested shell — the
   * plate border is the body field chrome and lifts on body focus.
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

  const bodyBlock = (
    <div
      className={cn(
        "relative min-h-0 flex-1 flex-col",
        embedded
          ? "flex overflow-hidden"
          : cn(
              FIELD_SHELL_MULTILINE_CLASSNAME,
              "flex flex-col p-0",
              emailBusy && "opacity-50"
            )
      )}
    >
      <label htmlFor="opp-draft-body" className="sr-only">
        Body
      </label>
      <textarea
        id="opp-draft-body"
        className={cn(
          FIELD_TEXTAREA_CLASSNAME,
          "min-h-0 flex-1 resize-none px-3 pb-10 pt-2 text-sm leading-relaxed",
          embedded && "bg-transparent"
        )}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => setBodyFocused(true)}
        onBlur={() => setBodyFocused(false)}
        disabled={emailBusy}
        placeholder="Write your message…"
      />
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
        {extraFiles.length > 0 ? (
          <ul className="pointer-events-auto flex min-w-0 flex-1 flex-wrap gap-1.5">
            {extraFiles.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${index}`}
                className="inline-flex max-w-[160px] items-center gap-1.5 rounded-md border border-border/50 bg-card/95 px-2 py-1 text-xs shadow-sm"
              >
                <FileText className="size-3.5 shrink-0 text-foreground/45" />
                <span className="truncate">
                  {file.name} ({formatSize(file.size)})
                </span>
                <FieldTrailingButton
                  aria-label={`Remove ${file.name}`}
                  disabled={emailBusy}
                  onClick={() => removeFile(index)}
                  className="size-5 before:-inset-1"
                >
                  <X className="size-3" aria-hidden />
                </FieldTrailingButton>
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
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
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300",
        embedded && "p-3"
      )}
    >
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
                <Mail className="size-4" aria-hidden />
              </FieldTrailingButton>
            ) : null}
          </>
        }
      />

      {bodyBlock}
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 min-w-0 w-full max-w-full flex-col lg:min-h-0",
        attachResume && "lg:max-w-full",
        COMPOSER_SPLIT_PLATE_CLASSNAME,
        embedded && bodyFocused && COMPOSER_SPLIT_PLATE_FOCUS_CLASSNAME
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
