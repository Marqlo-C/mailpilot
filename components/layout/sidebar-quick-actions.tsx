"use client";

import { forwardRef, useState } from "react";
import { CloudDownload, CloudUpload, KeyRound, Loader2, type LucideIcon } from "lucide-react";

import { ApiKeysDialog } from "@/components/layout/api-keys-dialog";
import { SECTION_TITLE_CLASS } from "@/components/layout/sidebar-nav";
import { downloadMasterProfile } from "@/components/profile/export-master-profile-button";
import { ResumeUploadDialog } from "@/components/profile/resume-upload-dialog";
import { tabRailInactiveTextClassName } from "@/components/ui/tactile/segmented-tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ACTION_ROW_CLASS =
  "group/action flex rounded-xl text-[#e4f7f3]/60 transition-colors duration-150 hover:bg-white/10 hover:text-[#e4f7f3] disabled:pointer-events-none disabled:opacity-50";

const QuickActionButton = forwardRef<
  HTMLButtonElement,
  {
    collapsed: boolean;
    label: string;
    icon: LucideIcon;
    disabled?: boolean;
    pending?: boolean;
    onClick?: () => void;
  }
>(function QuickActionButton(
  { collapsed, label, icon: Icon, disabled, pending, onClick },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={collapsed ? label : undefined}
      disabled={disabled || pending}
      onClick={onClick}
      className={cn(
        ACTION_ROW_CLASS,
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
            "group-hover/action:text-[#e4f7f3]"
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
});

export function SidebarQuickActions({
  collapsed,
  accountId,
}: {
  collapsed: boolean;
  accountId: string | null;
}) {
  const [exporting, setExporting] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);

  async function exportProfile() {
    if (!accountId) {
      toast.error("Connect an account first");
      return;
    }
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

  return (
    <div
      className="relative z-10 flex shrink-0 flex-col gap-1 px-3 py-2"
      onClick={(event) => event.stopPropagation()}
    >
      {collapsed ? null : (
        <span className={SECTION_TITLE_CLASS}>Quick Actions</span>
      )}
      {accountId ? (
        <ResumeUploadDialog
          accountId={accountId}
          trigger={
            <QuickActionButton
              collapsed={collapsed}
              label="Upload Resume"
              icon={CloudUpload}
            />
          }
        />
      ) : (
        <QuickActionButton
          collapsed={collapsed}
          label="Upload Resume"
          icon={CloudUpload}
          disabled
        />
      )}
      <QuickActionButton
        collapsed={collapsed}
        label="Export Profile"
        icon={CloudDownload}
        disabled={!accountId}
        pending={exporting}
        onClick={() => void exportProfile()}
      />
      <QuickActionButton
        collapsed={collapsed}
        label="API Keys"
        icon={KeyRound}
        disabled={!accountId}
        onClick={() => setKeysOpen(true)}
      />
      {accountId ? (
        <ApiKeysDialog
          accountId={accountId}
          open={keysOpen}
          onOpenChange={setKeysOpen}
        />
      ) : null}
    </div>
  );
}
