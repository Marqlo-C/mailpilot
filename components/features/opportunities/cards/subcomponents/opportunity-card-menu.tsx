"use client";

import type { JobOpportunity } from "@/lib/generated/prisma/client";
import {
  Archive,
  Ban,
  ExternalLink,
  Eye,
  Mail,
  RotateCw,
  Send,
  SquarePen,
  Trash2,
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
import { Loader } from "@/components/ui/loader";
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

const menuItemClass = "justify-start gap-2.5 cursor-pointer";

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
              className={menuItemClass}
            >
              <Eye className="h-4 w-4 shrink-0" />
              <span>Quick Look</span>
            </AppMenuItem>
          ) : null}
          {variant === "leads" && canEmail ? (
            <>
              {hasDescription ? <AppMenuSeparator /> : null}
              <AppMenuItem
                disabled={actionsLocked}
                onClick={onReviewDraft}
                className={menuItemClass}
              >
                <SquarePen className="h-4 w-4 shrink-0" />
                <span>Edit Draft</span>
              </AppMenuItem>
              <AppMenuItem
                disabled={actionsLocked}
                onClick={onSendNow}
                className={menuItemClass}
              >
                <Send className="h-4 w-4 shrink-0" />
                <span>Send Now</span>
              </AppMenuItem>
              <AppMenuSeparator />
            </>
          ) : null}
          {opportunity.emailMessageId && onViewOriginalEmail ? (
            <AppMenuItem
              disabled={actionsLocked}
              onClick={onViewOriginalEmail}
              className={menuItemClass}
            >
              <Mail className="h-4 w-4 shrink-0" />
              <span>Show Original Email</span>
            </AppMenuItem>
          ) : null}
          {(variant === "applied" || variant === "action") && validApplyUrl ? (
            <AppMenuItem asChild disabled={actionsLocked} className={menuItemClass}>
              <a
                href={validApplyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                <span>Open Link</span>
              </a>
            </AppMenuItem>
          ) : null}
          {(variant === "leads" || variant === "applied") && (
            <AppMenuItem
              disabled={actionsLocked}
              onClick={onArchive}
              className={menuItemClass}
            >
              <Archive className="h-4 w-4 shrink-0" />
              <span>Archive</span>
            </AppMenuItem>
          )}
          <AppMenuItem
            disabled={actionsLocked}
            onClick={onDismiss}
            className={menuItemClass}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span>Move to Trash</span>
          </AppMenuItem>
          {onLessLikeThis ? (
            <>
              <AppMenuSeparator />
              <AppMenuItem
                disabled={actionsLocked}
                onClick={onLessLikeThis}
                className={cn(
                  menuItemClass,
                  "text-amber-600 focus:bg-amber-50 focus:text-amber-600 dark:text-amber-400 dark:focus:bg-amber-950/50 dark:focus:text-amber-400"
                )}
              >
                <Ban className="h-4 w-4 shrink-0" />
                <span>Block Role Title</span>
              </AppMenuItem>
            </>
          ) : null}
          {isDev && opportunity.emailMessageId ? (
            <>
              <AppMenuSeparator />
              <AppMenuItem
                disabled={actionsLocked || isReprocessing}
                onClick={onReprocess}
                className={cn(
                  menuItemClass,
                  "text-cyan-600 focus:bg-cyan-50 focus:text-cyan-600 dark:text-cyan-400 dark:focus:bg-cyan-950/50 dark:focus:text-cyan-400"
                )}
              >
                {isReprocessing ? (
                  <Loader size="sm" className="shrink-0 text-cyan-600 dark:text-cyan-400" />
                ) : (
                  <RotateCw className="h-4 w-4 shrink-0" />
                )}
                <span>Re-analyze Email (Dev)</span>
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
            className={menuItemClass}
          >
            <Eye className="h-4 w-4 shrink-0" />
            <span>Quick Look</span>
          </AppMenuItem>
        ) : null}
        {hasDescription && (opportunity.isArchived || dismissed) ? (
          <AppMenuSeparator />
        ) : null}
        {opportunity.isArchived && !dismissed ? (
          <AppMenuItem
            disabled={actionsLocked}
            onClick={onDismiss}
            className={menuItemClass}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span>Move to Trash</span>
          </AppMenuItem>
        ) : null}
        {dismissed ? (
          <AppMenuItem
            disabled={actionsLocked}
            onClick={onDelete}
            className={cn(
              menuItemClass,
              "text-destructive focus:bg-destructive/10 focus:text-destructive"
            )}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span>Delete Immediately</span>
          </AppMenuItem>
        ) : null}
        {isDev && opportunity.emailMessageId ? (
          <>
            <AppMenuSeparator />
            <AppMenuItem
              disabled={actionsLocked || isReprocessing}
              onClick={onReprocess}
              className={cn(
                menuItemClass,
                "text-cyan-600 focus:bg-cyan-50 focus:text-cyan-600 dark:text-cyan-400 dark:focus:bg-cyan-950/50 dark:focus:text-cyan-400"
              )}
            >
              {isReprocessing ? (
                <Loader size="sm" className="shrink-0 text-cyan-600 dark:text-cyan-400" />
              ) : (
                <RotateCw className="h-4 w-4 shrink-0" />
              )}
              <span>Re-analyze Email (Dev)</span>
            </AppMenuItem>
          </>
        ) : null}
      </AppMenuContent>
    </DropdownMenu>
  );
}
