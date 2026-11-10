import React, { type ChangeEvent } from "react";
import { FileText, Mail, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatSize } from "@/hooks/use-draft-pdf";
import type { OriginalEmailPreview } from "@/app/actions/opportunities";
import { cn } from "@/lib/utils";

export function EmailEditorPanel({
  attachResume,
  recipient,
  setRecipient,
  subject,
  setSubject,
  originalEmail,
  onViewOriginalEmail,
  body,
  setBody,
  extraFiles,
  removeFile,
  handleFileSelect,
  fileInputId,
  busy,
}: {
  attachResume: boolean;
  recipient: string;
  setRecipient: (value: string) => void;
  subject: string;
  setSubject: (value: string) => void;
  originalEmail: OriginalEmailPreview | null;
  onViewOriginalEmail: () => void;
  body: string;
  setBody: (value: string) => void;
  extraFiles: File[];
  removeFile: (index: number) => void;
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  fileInputId: string;
  busy: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 w-full max-w-full flex-col divide-y overflow-x-hidden overflow-hidden rounded-lg border bg-card text-sm focus-within:ring-1 focus-within:ring-ring lg:min-h-0",
        attachResume &&
          "lg:max-w-full lg:shrink-0 lg:grow-0 lg:[flex-basis:var(--draft-email-split)]"
      )}
    >
      <div className="flex flex-none items-center px-3 py-2">
        <Label
          htmlFor="opp-draft-to"
          className="w-16 shrink-0 select-none text-xs font-medium text-muted-foreground"
        >
          To:
        </Label>
        <input
          id="opp-draft-to"
          type="email"
          placeholder="recruiter@company.com"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          disabled={busy}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none ring-0 focus:outline-none focus:ring-0 disabled:opacity-50"
        />
      </div>

      <div className="flex flex-none items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center">
          <Label
            htmlFor="opp-draft-subject"
            className="w-16 shrink-0 select-none text-xs font-medium text-muted-foreground"
          >
            Subject:
          </Label>
          <input
            id="opp-draft-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={busy}
            className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-sm text-foreground outline-none ring-0 focus:outline-none focus:ring-0 disabled:opacity-50"
          />
        </div>
        {originalEmail ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onViewOriginalEmail}
            className="h-7 shrink-0 gap-1.5 rounded-md bg-muted/40 px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">View original email</span>
          </Button>
        ) : null}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <Label htmlFor="opp-draft-body" className="sr-only">
          Body
        </Label>
        <textarea
          id="opp-draft-body"
          className="min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-3 pb-10 text-sm leading-relaxed outline-none focus:outline-none focus-visible:ring-0 disabled:opacity-50"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
        />
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
          {extraFiles.length > 0 ? (
            <ul className="pointer-events-auto flex min-w-0 flex-1 flex-wrap gap-1.5">
              {extraFiles.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${index}`}
                  className="inline-flex max-w-[160px] items-center gap-1.5 rounded-md border border-border/60 bg-background/95 px-2 py-1 text-xs shadow-sm"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {file.name} ({formatSize(file.size)})
                  </span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => removeFile(index)}
                    disabled={busy}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
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
              disabled={busy}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title="Attach file"
              disabled={busy}
              className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                document.getElementById(fileInputId)?.click();
              }}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
