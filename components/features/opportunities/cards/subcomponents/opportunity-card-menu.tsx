"use client";

import type { JobOpportunity } from "@prisma/client";
import {
  AlignLeft,
  Archive,
  ExternalLink,
  Mail,
  RotateCw,
  Send,
  ThumbsDown,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
} from "@/components/ui/app-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RowMenuTrigger } from "@/components/ui/composites/row-menu-trigger";
import { cn } from "@/lib/utils";

export type OpportunityCardVariant =
  | "leads"
  | "applied"
  | "action"
  | "history";

export type OpportunityCardMenuProps = {
  variant: OpportunityCardVariant;
  actionsLocked: boolean;
  isSelected?: boolean;
  /** When true, show Full Description in the overflow menu. */
  hasDescription?: boolean;
  canEmail?: boolean;
  opportunity: JobOpportunity;
  validApplyUrl?: string | null;
  dismissed?: boolean;
  isDev: boolean;
  isReprocessing: boolean;
  onDescriptionOpen: () => void;
  onReviewDraft?: () => void;
  onSendNow?: () => void;
  onViewOriginalEmail?: () => void;
  onArchive: () => void;
  onDismiss: () => void;
  onLessLikeThis?: () => void;
  onDelete: () => void;
  onReprocess: () => void;
};

export function OpportunityCardMenu({
  variant,
  actionsLocked,
  isSelected,
  hasDescription,
  canEmail,
  opportunity,
  validApplyUrl,
  dismissed,
  isDev,
  isReprocessing,
  onDescriptionOpen,
  onReviewDraft,
  onSendNow,
  onViewOriginalEmail,
  onArchive,
  onDismiss,
  onLessLikeThis,
  onDelete,
  onReprocess,
}: OpportunityCardMenuProps) {
  if (variant !== "history") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowMenuTrigger
            label="Job actions"
            disabled={actionsLocked}
            className={
              isSelected
                ? "pointer-events-none opacity-55 hover:bg-[#e4f7f3] hover:text-[#181e26]"
                : undefined
            }
          />
        </DropdownMenuTrigger>
        <AppMenuContent align="end">
          {hasDescription ? (
            <AppMenuItem
              disabled={actionsLocked}
              onClick={onDescriptionOpen}
            >
              <AlignLeft className="mr-2 h-4 w-4" />
              Full Description
            </AppMenuItem>
          ) : null}
          {variant === "leads" && canEmail ? (
            <>
              {hasDescription ? <AppMenuSeparator /> : null}
              <AppMenuItem
                disabled={actionsLocked}
                onClick={onReviewDraft}
              >
                <Mail className="mr-2 h-4 w-4" />
                Review Draft
              </AppMenuItem>
              <AppMenuItem
                disabled={actionsLocked}
                onClick={onSendNow}
              >
                <Send className="mr-2 h-4 w-4" />
                Send Now
              </AppMenuItem>
              <AppMenuSeparator />
            </>
          ) : null}
          {opportunity.emailMessageId && onViewOriginalEmail ? (
            <AppMenuItem
              disabled={actionsLocked}
              onClick={onViewOriginalEmail}
            >
              <Mail className="mr-2 h-4 w-4" />
              Inbox Message
            </AppMenuItem>
          ) : null}
          {(variant === "applied" || variant === "action") && validApplyUrl ? (
            <AppMenuItem asChild disabled={actionsLocked}>
              <a
                href={validApplyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Posting
              </a>
            </AppMenuItem>
          ) : null}
          {(variant === "leads" || variant === "applied") && (
            <AppMenuItem
              disabled={actionsLocked}
              onClick={onArchive}
            >
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </AppMenuItem>
          )}
          <AppMenuItem
            disabled={actionsLocked}
            onClick={onDismiss}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Dismiss
          </AppMenuItem>
          {onLessLikeThis ? (
            <>
              <AppMenuSeparator />
              <AppMenuItem
                disabled={actionsLocked}
                onClick={onLessLikeThis}
                className="text-amber-600 focus:bg-amber-50 focus:text-amber-600 dark:text-amber-400 dark:focus:bg-amber-950/50 dark:focus:text-amber-400"
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                Less like this
              </AppMenuItem>
            </>
          ) : null}
          {isDev && opportunity.emailMessageId ? (
            <>
              <AppMenuSeparator />
              <AppMenuItem
                disabled={actionsLocked || isReprocessing}
                onClick={onReprocess}
                className="text-cyan-600 focus:bg-cyan-50 focus:text-cyan-600 dark:text-cyan-400 dark:focus:bg-cyan-950/50 dark:focus:text-cyan-400"
              >
                <RotateCw
                  className={cn("mr-2 h-4 w-4", isReprocessing && "animate-spin")}
                />
                Re-sync Email (Dev)
              </AppMenuItem>
            </>
          ) : null}
        </AppMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <RowMenuTrigger
          label="Job actions"
          disabled={actionsLocked}
          className={
            isSelected
              ? "pointer-events-none opacity-55 hover:bg-[#e4f7f3] hover:text-[#181e26]"
              : undefined
          }
        />
      </DropdownMenuTrigger>
      <AppMenuContent align="end">
        {hasDescription ? (
          <AppMenuItem
            disabled={actionsLocked}
            onClick={onDescriptionOpen}
          >
            <AlignLeft className="mr-2 h-4 w-4" />
            Full Description
          </AppMenuItem>
        ) : null}
        {hasDescription && (opportunity.isArchived || dismissed) ? (
          <AppMenuSeparator />
        ) : null}
        {opportunity.isArchived && !dismissed ? (
          <AppMenuItem
            disabled={actionsLocked}
            onClick={onDismiss}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Dismiss
          </AppMenuItem>
        ) : null}
        {dismissed ? (
          <AppMenuItem
            disabled={actionsLocked}
            onClick={onDelete}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </AppMenuItem>
        ) : null}
        {isDev && opportunity.emailMessageId ? (
          <>
            <AppMenuSeparator />
            <AppMenuItem
              disabled={actionsLocked || isReprocessing}
              onClick={onReprocess}
              className="text-cyan-600 focus:bg-cyan-50 focus:text-cyan-600 dark:text-cyan-400 dark:focus:bg-cyan-950/50 dark:focus:text-cyan-400"
            >
              <RotateCw
                className={cn("mr-2 h-4 w-4", isReprocessing && "animate-spin")}
              />
              Re-sync Email (Dev)
            </AppMenuItem>
          </>
        ) : null}
      </AppMenuContent>
    </DropdownMenu>
  );
}
