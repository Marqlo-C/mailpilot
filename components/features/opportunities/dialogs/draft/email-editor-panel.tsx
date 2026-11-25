"use client";

import React, { useState, type ChangeEvent, type Ref } from "react";
import { AlignLeft, MailOpen, Paperclip, Undo2, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AttachmentChip } from "@/components/ui/composites/attachment-chip";
import {
  COMPOSER_SPLIT_PLATE_CLASSNAME,
  COMPOSER_SPLIT_PLATE_FOCUS_CLASSNAME,
} from "@/components/ui/styles/field-chrome";
import { FieldTrailingButton } from "@/components/ui/tactile/text-field";
import { formatSize } from "@/hooks/use-draft-pdf";
import { useContentSettleKey } from "@/hooks/use-content-settle-key";
import type {
  OriginalEmailPreview,
  OpportunityResumePreview,
} from "@/app/actions/opportunities";
import { parseFromHeader } from "@/lib/gmail/email-utils";
import { cn } from "@/lib/utils";
import { BusyStatusChip } from "@/components/ui/composites/busy-status-chip";
import { DraftAttachResumeChip } from "./draft-attach-controls";
import {
  EmailBodyEditorContent,
  useEmailBodyEditor,
} from "./email-body-editor";
import { EmailDraftToolbar } from "./email-draft-toolbar";
import { EmailDraftBusySkeleton } from "./draft-pane-busy-skeletons";

/** Modern To display: `Alex <alex@company.com>` when a display name is known. */
function formatRecipientField(
  name: string | null | undefined,
  email: string
): string {
  const addr = email.trim();
  if (!addr) return "";
  if (/<[^>]+>/.test(addr)) return addr;
  const n = name?.trim();
  if (!n) return addr;
  return `${n} <${addr}>`;
}

/** Persist the email address only — strip a leading display name if present. */
function parseRecipientField(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const parsed = parseFromHeader(trimmed);
  if (parsed?.email) return parsed.email;
  return trimmed.toLowerCase();
}

export function EmailEditorPanel({
  attachResume,
  onAttachResumeChange,
  attachLocked = false,
  resume = null,
  resumeSizeLabel = null,
  embedded: _embedded = false,
  recipient,
  setRecipient,
  recipientName = null,
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
  toolbarRef,
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
  /** Display name shown before the address in the To field. */
  recipientName?: string | null;
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
  /** Forwarded to EmailDraftToolbar for split-pane pixel min measurement. */
  toolbarRef?: Ref<HTMLDivElement>;
}) {
  const settleKey = useContentSettleKey(emailBusy);
  const recipientDirty = recipient !== baselineRecipient;
  const subjectDirty = subject !== baselineSubject;
  const [bodyFocused, setBodyFocused] = useState(false);
  const [toFocused, setToFocused] = useState(false);
  const showResumeAttach = typeof onAttachResumeChange === "function";
  const toDisplay = toFocused
    ? recipient
    : formatRecipientField(recipientName, recipient);

  const {
    editor,
    canUndo,
    canRedo,
    boldActive,
    italicActive,
    underlineActive,
    textColor,
    highlightColor,
    alignValue,
  } = useEmailBodyEditor({
    body,
    setBody,
    disabled: emailBusy,
    onFocusChange: setBodyFocused,
  });

  const bodyBlock = (
    <div className="relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
      <label htmlFor="opp-draft-body" className="sr-only">
        Body
      </label>
      {emailBusy ? (
        <>
          <EmailDraftBusySkeleton />
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-3">
            <BusyStatusChip
              label={emailBusyLabel ?? "Working on email…"}
            />
          </div>
        </>
      ) : (
        <EmailBodyEditorContent editor={editor} />
      )}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3",
          emailBusy && "opacity-50"
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-wrap items-center gap-2",
            !emailBusy && "pointer-events-auto"
          )}
        >
          {showResumeAttach && onAttachResumeChange ? (
            <DraftAttachResumeChip
              attachResume={attachResume}
              onAttachChange={onAttachResumeChange}
              locked={attachLocked || emailBusy}
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
        <div
          className={cn(
            "flex shrink-0 items-center",
            !emailBusy && "pointer-events-auto"
          )}
        >
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
          type="text"
          inputMode="email"
          autoComplete="email"
          leadingIcon={UserRound}
          placeholder="Alex <alex@company.com>"
          aria-label="To"
          value={toDisplay}
          onFocus={() => setToFocused(true)}
          onBlur={() => setToFocused(false)}
          onChange={(e) => setRecipient(parseRecipientField(e.target.value))}
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
          leadingIcon={AlignLeft}
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
        <EmailDraftToolbar
          toolbarRef={toolbarRef}
          editor={editor}
          disabled={emailBusy}
          canUndo={canUndo}
          canRedo={canRedo}
          boldActive={boldActive}
          italicActive={italicActive}
          underlineActive={underlineActive}
          textColor={textColor}
          highlightColor={highlightColor}
          alignValue={alignValue}
          showAttachResume={showResumeAttach}
          attachResume={attachResume}
          onAttachResumeChange={onAttachResumeChange}
          attachLocked={attachLocked}
        />
        {fields}
      </div>
    </div>
  );
}
