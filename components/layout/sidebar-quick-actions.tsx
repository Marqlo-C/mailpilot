"use client";

import { forwardRef, useEffect, useState, type ReactNode } from "react";
import {
  CloudDownload,
  CloudUpload,
  Cpu,
  KeyRound,
  Loader2,
  type LucideIcon,
} from "lucide-react";

import {
  ApiKeysFlyout,
  prefetchApiKeyStatus,
} from "@/components/layout/api-keys-flyout";
import {
  OllamaFlyout,
  prefetchOllamaStatus,
} from "@/components/layout/ollama-flyout";
import { ResumeUploadFlyout } from "@/components/layout/resume-upload-flyout";
import {
  SECTION_TITLE_CLASS,
  SidebarFlyout,
} from "@/components/layout/sidebar-nav";
import {
  SIDEBAR_TELEMETRY_OPEN_DELAY_MS,
  useSidebarFlyout,
} from "@/components/layout/sidebar-flyout-provider";
import { downloadMasterProfile } from "@/components/profile/export-master-profile-button";
import { tabRailInactiveTextClassName } from "@/components/ui/tactile/segmented-tabs";
import { LabelTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ACTION_ROW_CLASS =
  "group/action flex rounded-xl text-[#e4f7f3]/60 transition-colors duration-150 hover:bg-white/10 hover:text-[#e4f7f3] disabled:pointer-events-none disabled:opacity-50";

type QuickFlyout = "keys" | "resume" | "ollama";

const QuickActionButton = forwardRef<
  HTMLButtonElement,
  {
    collapsed: boolean;
    label: string;
    icon: LucideIcon;
    disabled?: boolean;
    pending?: boolean;
    active?: boolean;
    onClick?: () => void;
  }
>(function QuickActionButton(
  { collapsed, label, icon: Icon, disabled, pending, active, onClick },
  ref
) {
  // Collapsed label chip — same surface as nav tips. Skip while a flyout is open.
  const tip = collapsed && !active ? label : null;

  return (
    <LabelTooltip label={tip} side="right">
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={active}
        disabled={disabled || pending}
        onClick={onClick}
        className={cn(
          ACTION_ROW_CLASS,
          active && "bg-white/10 text-[#e4f7f3]",
          collapsed
            ? "mx-auto size-9 shrink-0 items-center justify-center"
            : "h-9 w-full items-center gap-3 px-3"
        )}
      >
        {pending ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : (
          <Icon className="size-4 shrink-0 transition-colors group-hover/action:text-[#e4f7f3]" />
        )}
        {collapsed ? null : (
          <span
            className={cn(
              "whitespace-nowrap text-[13px] font-medium tracking-normal",
              tabRailInactiveTextClassName.dark,
              "group-hover/action:text-[#e4f7f3]",
              active && "text-[#e4f7f3]"
            )}
          >
            {label}
          </span>
        )}
      </button>
    </LabelTooltip>
  );
});

function QuickActionFlyoutHost({
  collapsed,
  open,
  children,
}: {
  collapsed: boolean;
  open: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <SidebarFlyout collapsed={collapsed} marker="quick-action">
      {children}
    </SidebarFlyout>
  );
}

export function SidebarQuickActions({
  collapsed,
  accountId,
}: {
  collapsed: boolean;
  accountId: string | null;
}) {
  const [exporting, setExporting] = useState(false);
  const {
    isOpen,
    togglePinned,
    scheduleOpen,
    scheduleClose,
    cancelScheduledOpen,
    cancelScheduledClose,
    closeNow,
  } = useSidebarFlyout();

  useEffect(() => {
    closeNow();
  }, [accountId, collapsed, closeNow]);

  function ensureAccount(): boolean {
    if (accountId) return true;
    toast.error("Connect an account first");
    return false;
  }

  function onEnter(kind: QuickFlyout) {
    if (!accountId) return;
    // Start the server read during the open dwell so content is ready on show.
    if (kind === "keys") prefetchApiKeyStatus(accountId);
    else if (kind === "ollama") prefetchOllamaStatus(accountId);
    // Re-entering button or bridge after a brief leave must kill the close timer.
    cancelScheduledClose();
    if (isOpen({ kind })) {
      cancelScheduledOpen();
      return;
    }
    // Same short dwell as telemetry — 500ms felt like the flyout was “loading.”
    scheduleOpen({ kind }, SIDEBAR_TELEMETRY_OPEN_DELAY_MS);
  }

  function onFlyoutEnter() {
    cancelScheduledOpen();
    cancelScheduledClose();
  }

  function onLeave(
    event: React.PointerEvent<HTMLDivElement>,
    kind: QuickFlyout
  ) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    if (
      next instanceof Element &&
      next.closest(
        "[data-sidebar-flyout='quick-action'], [data-radix-popper-content-wrapper], [role='menu']"
      )
    ) {
      return;
    }
    // Portaled menus often yield a null relatedTarget; keep the flyout up.
    if (
      !(next instanceof Element) &&
      document.querySelector(
        "[data-radix-popper-content-wrapper], [role='menu'][data-state='open']"
      )
    ) {
      return;
    }
    // Always kill a pending open — skimming Resume→Export used to leave the
    // dwell timer armed, so the menu popped open after you'd already moved on.
    cancelScheduledOpen();
    // Keep a click-pinned panel; hover-only panels close like nav menus.
    if (isOpen({ kind })) {
      scheduleClose();
    }
  }

  /** Non-flyout rows must dismiss neighbors' hover menus / pending opens. */
  function onNonFlyoutEnter() {
    cancelScheduledOpen();
    scheduleClose();
  }

  async function exportProfile() {
    if (!ensureAccount() || !accountId) return;
    setExporting(true);
    try {
      await downloadMasterProfile(accountId);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to export master profile PDF"
      );
    } finally {
      setExporting(false);
    }
  }

  const keysOpen = isOpen({ kind: "keys" });
  const resumeOpen = isOpen({ kind: "resume" });
  const ollamaOpen = isOpen({ kind: "ollama" });

  return (
    <div
      className="relative z-10 flex shrink-0 flex-col gap-1 px-3 py-2"
      onClick={(event) => event.stopPropagation()}
    >
      {collapsed ? null : (
        <span className={SECTION_TITLE_CLASS}>Quick Actions</span>
      )}
      <div
        className="relative"
        data-sidebar-quick-flyout=""
        onPointerEnter={() => onEnter("resume")}
        onPointerLeave={(event) => onLeave(event, "resume")}
      >
        <QuickActionButton
          collapsed={collapsed}
          label="Upload Resume"
          icon={CloudUpload}
          disabled={!accountId}
          active={resumeOpen}
          onClick={() => {
            if (!ensureAccount() || !accountId) return;
            togglePinned({ kind: "resume" });
          }}
        />
        {accountId ? (
          <QuickActionFlyoutHost collapsed={collapsed} open={resumeOpen}>
            <div onPointerEnter={onFlyoutEnter}>
              <ResumeUploadFlyout accountId={accountId} />
            </div>
          </QuickActionFlyoutHost>
        ) : null}
      </div>
      <div onPointerEnter={onNonFlyoutEnter}>
        <QuickActionButton
          collapsed={collapsed}
          label="Export Profile"
          icon={CloudDownload}
          disabled={!accountId}
          pending={exporting}
          onClick={() => void exportProfile()}
        />
      </div>
      <div
        className="relative"
        data-sidebar-quick-flyout=""
        onPointerEnter={() => onEnter("keys")}
        onPointerLeave={(event) => onLeave(event, "keys")}
      >
        <QuickActionButton
          collapsed={collapsed}
          label="API Keys"
          icon={KeyRound}
          disabled={!accountId}
          active={keysOpen}
          onClick={() => {
            if (!ensureAccount() || !accountId) return;
            prefetchApiKeyStatus(accountId);
            togglePinned({ kind: "keys" });
          }}
        />
        {accountId ? (
          <QuickActionFlyoutHost collapsed={collapsed} open={keysOpen}>
            <div onPointerEnter={onFlyoutEnter}>
              <ApiKeysFlyout accountId={accountId} />
            </div>
          </QuickActionFlyoutHost>
        ) : null}
      </div>
      <div
        className="relative"
        data-sidebar-quick-flyout=""
        onPointerEnter={() => onEnter("ollama")}
        onPointerLeave={(event) => onLeave(event, "ollama")}
      >
        <QuickActionButton
          collapsed={collapsed}
          label="Local Ollama"
          icon={Cpu}
          disabled={!accountId}
          active={ollamaOpen}
          onClick={() => {
            if (!ensureAccount() || !accountId) return;
            prefetchOllamaStatus(accountId);
            togglePinned({ kind: "ollama" });
          }}
        />
        {accountId ? (
          <QuickActionFlyoutHost collapsed={collapsed} open={ollamaOpen}>
            <div onPointerEnter={onFlyoutEnter}>
              <OllamaFlyout accountId={accountId} />
            </div>
          </QuickActionFlyoutHost>
        ) : null}
      </div>
    </div>
  );
}
