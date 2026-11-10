"use client";

import { Mail } from "lucide-react";
import type { OriginalEmailPreview } from "@/app/actions/opportunities";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type OpportunityDraftContactFieldsProps = {
  recipient: string;
  setRecipient: (value: string) => void;
  company?: string | null;
  originalEmail?: OriginalEmailPreview | null;
  onViewOriginalEmail?: () => void;
  busy?: boolean;
};

/**
 * Company and recipient contact fields for the opportunity draft modal.
 */
export function OpportunityDraftContactFields({
  recipient,
  setRecipient,
  company,
  originalEmail,
  onViewOriginalEmail,
  busy = false,
}: OpportunityDraftContactFieldsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="draft-recipient" className="text-xs font-medium text-muted-foreground">
          Recipient {company ? `at ${company}` : ""}
        </Label>
        {originalEmail && onViewOriginalEmail ? (
          <button
            type="button"
            onClick={onViewOriginalEmail}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Mail className="h-3 w-3" />
            <span>View Original Email</span>
          </button>
        ) : null}
      </div>
      <Input
        id="draft-recipient"
        type="email"
        placeholder="recipient@company.com"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        disabled={busy}
        className="h-8 text-xs font-mono"
      />
    </div>
  );
}
