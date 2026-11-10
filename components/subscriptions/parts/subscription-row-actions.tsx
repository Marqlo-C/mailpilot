import type { Subscription } from "@prisma/client";
import { Eye, Mail, UserRoundMinus } from "lucide-react";
import { CreateSnapshotButton } from "@/components/ui/composites/create-snapshot-button";
import { RowMenuTrigger } from "@/components/ui/composites/row-menu-trigger";
import {
  AppMenuContent,
  AppMenuItem,
} from "@/components/ui/app-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LabelTooltip } from "@/components/ui/tooltip";
import {
  PRIMARY_ACTION_BTN_CLASSNAME,
  PRIMARY_ACTION_BTN_MUTED_CLASSNAME,
} from "@/components/ui/styles/primary-action-btn";
import { cn } from "@/lib/utils";
import type { ResolvedBriefing } from "./types";

export function LastBriefingIconButton({
  briefing,
  onView,
  disabled = false,
}: {
  briefing: ResolvedBriefing;
  onView: (briefing: ResolvedBriefing) => void;
  disabled?: boolean;
}) {
  const tip =
    briefing.source === "db"
      ? "View snap (cloud)"
      : "View snap (this device)";

  return (
    <LabelTooltip label={disabled ? null : tip} side="top">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onView(briefing)}
        aria-label="View snap"
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
          disabled
            ? "pointer-events-none text-muted-foreground"
            : "text-[#129f96] hover:bg-[#129f96]/10 hover:text-[#0f8f87]"
        )}
      >
        <Eye className="size-3" />
        Snapshot
      </button>
    </LabelTooltip>
  );
}

export function SubscriptionRowActions({
  sub,
  onBriefing,
  onUnsubscribe,
  onViewLastEmail,
  disabled = false,
}: {
  sub: Subscription;
  onBriefing: (sub: Subscription) => void;
  onUnsubscribe: (sub: Subscription) => void;
  onViewLastEmail: (sub: Subscription) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <CreateSnapshotButton
        disabled={disabled}
        onClick={() => onBriefing(sub)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onUnsubscribe(sub)}
        className={
          disabled
            ? PRIMARY_ACTION_BTN_MUTED_CLASSNAME
            : PRIMARY_ACTION_BTN_CLASSNAME
        }
      >
        <UserRoundMinus className="h-3.5 w-3.5" />
        <span>Unsubscribe</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowMenuTrigger
            label="Subscription actions"
            disabled={disabled}
            className={
              disabled
                ? "pointer-events-none opacity-55 hover:bg-[#e4f7f3] hover:text-[#181e26]"
                : undefined
            }
          />
        </DropdownMenuTrigger>
        <AppMenuContent align="end">
          <AppMenuItem
            className="cursor-pointer gap-2"
            disabled={disabled}
            onClick={() => onViewLastEmail(sub)}
          >
            <Mail className="size-4 text-muted-foreground" />
            <span>Inbox Message</span>
          </AppMenuItem>
        </AppMenuContent>
      </DropdownMenu>
    </>
  );
}
