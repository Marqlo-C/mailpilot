"use client";

import { Loader2, Mail, Send } from "lucide-react";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/secondary-action-btn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type OpportunityDraftFooterActionsProps = {
  showComposerActions: boolean;
  isSaveDraftDisabled: boolean;
  onSaveDraft: () => void;
  pending: boolean;
  isSendDisabled: boolean;
  onSend: () => void;
  sendDisabledReason?: string | null;
};

/**
 * Secondary and primary action buttons for saving or sending an opportunity application draft.
 */
export function OpportunityDraftFooterActions({
  showComposerActions,
  isSaveDraftDisabled,
  onSaveDraft,
  pending,
  isSendDisabled,
  onSend,
  sendDisabledReason,
}: OpportunityDraftFooterActionsProps) {
  if (!showComposerActions) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isSaveDraftDisabled}
        onClick={onSaveDraft}
        className={cn(SECONDARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Mail className="h-3.5 w-3.5" />
        )}
        <span>Save Draft</span>
      </button>

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <button
                type="button"
                disabled={isSendDisabled}
                onClick={onSend}
                className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>Send</span>
              </button>
            </span>
          </TooltipTrigger>
          {sendDisabledReason ? (
            <TooltipContent side="top" className="text-center">
              {sendDisabledReason}
            </TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
