import {
  Compass,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  darkRailListClassName,
  darkRailTriggerClassName,
  lightRailListClassName,
  lightRailTriggerClassName,
} from "@/components/ui/tactile/segmented-tabs";
import { cn } from "@/lib/utils";
import type {
  Environment,
  ExtensionSession,
  OpportunityResumePreview,
} from "../../lib/types";

export type SidePanelHeaderProps = {
  env: Environment;
  baseUrl: string;
  session: ExtensionSession | null;
  checkingSession: boolean;
  activeTab: "job" | "draft";
  preview: OpportunityResumePreview | null;
  isExtracting: boolean;
  onSwitchEnvironment: (env: Environment) => void;
  onRefreshSession: () => void;
  onExtractFromTab: () => void;
  onSelectTab: (tab: "job" | "draft") => void;
};

export function SidePanelHeader({
  env,
  baseUrl,
  session,
  checkingSession,
  activeTab,
  preview,
  isExtracting,
  onSwitchEnvironment,
  onRefreshSession,
  onExtractFromTab,
  onSelectTab,
}: SidePanelHeaderProps) {
  return (
    <>
      {/* MailPilot Top Navigation Deck */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/80 bg-[#181e26] text-white px-3 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[22%]">
            <img
              src="logos/colored-logo-only.png"
              alt="MailPilot"
              className="h-full w-full scale-125 object-contain"
            />
          </span>
          <div className="flex items-center">
            <span className="relative flex h-7 shrink-0 items-center overflow-hidden">
              <img
                src="logos/transparent-white-wordmark-inline.png"
                alt="MailPilot"
                className="pointer-events-none h-[54px] w-auto max-w-none object-contain"
              />
            </span>
            <span
              className="-ml-0.5 font-sans text-sm font-semibold tracking-tight select-none text-[#fdad76]"
              style={{ color: "#fdad76" }}
            >
              +
            </span>
          </div>
          <Badge
            variant="outline"
            className="h-4 px-1.5 py-0 text-[10px] font-medium border-white/20 bg-white/5 text-[#e4f7f3]"
          >
            Companion
          </Badge>
        </div>

        {/* Connected Indicator & Environment Tab Rail */}
        <div className="flex items-center gap-2">
          <div
            title={
              session?.ok
                ? `Connected as ${session.profile?.fullName || session.account?.email}`
                : "Not connected to MailPilot"
            }
            className={cn(
              "h-2.5 w-2.5 rounded-full transition-all",
              checkingSession
                ? "bg-white/40 animate-pulse"
                : session?.ok
                ? "bg-emerald-400 ring-2 ring-emerald-400/20"
                : "bg-destructive ring-2 ring-destructive/20"
            )}
          />

          <div
            className={cn(darkRailListClassName, "p-0.5 pr-3 gap-2 rounded-lg shadow-sm")}
            data-mp-tab-rail=""
            role="radiogroup"
            aria-label="Environment"
          >
            <button
              type="button"
              role="radio"
              aria-checked={env === "dev"}
              data-state={env === "dev" ? "active" : "inactive"}
              className={cn(darkRailTriggerClassName, "px-2 py-0.5 text-[11px] rounded-md")}
              onClick={() => onSwitchEnvironment("dev")}
            >
              Dev :3000
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={env === "prod"}
              data-state={env === "prod" ? "active" : "inactive"}
              className={cn(darkRailTriggerClassName, "px-2 py-0.5 text-[11px] rounded-md")}
              onClick={() => onSwitchEnvironment("prod")}
            >
              Production
            </button>
          </div>
        </div>
      </header>

      {/* Account Session Header Strip */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/50 bg-card/75 px-3 text-xs shadow-2xs backdrop-blur-md">
        {checkingSession ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" /> Verifying session…
          </span>
        ) : session?.ok ? (
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 shadow-xs">
              {session.account?.picture ? (
                <img
                  src={session.account.picture}
                  alt={session.profile?.fullName || session.account?.name || "Account"}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-primary/10 text-[9px] font-bold text-primary">
                  {session.profile?.fullName?.[0] || session.account?.name?.[0] || "U"}
                </span>
              )}
            </span>
            <span className="truncate font-medium text-foreground text-xs">
              {session.profile?.fullName || session.account?.name}
            </span>
            {session.account?.email && (
              <>
                <span className="h-3 w-px bg-border/60 shrink-0" aria-hidden="true" />
                <span className="truncate text-muted-foreground text-[11px]">
                  {session.account.email}
                </span>
              </>
            )}
            <button
              type="button"
              onClick={onRefreshSession}
              title="Refresh connection"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors ml-0.5 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <span className="text-destructive font-medium text-xs">
              Not authenticated ({env === "dev" ? "localhost:3000" : "Production"})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRefreshSession}
                title="Retry connection"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
              <a
                href={baseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1 font-medium text-xs"
              >
                Sign in <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {(activeTab === "job" || !preview) && (
            <button
              type="button"
              onClick={onExtractFromTab}
              disabled={isExtracting}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer disabled:pointer-events-none disabled:opacity-50"
              title="Import job details from the active browser tab"
            >
              {isExtracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Compass className="h-3.5 w-3.5 text-primary" />
              )}
              <span>{isExtracting ? "Importing…" : "Import from Tab"}</span>
            </button>
          )}

          {preview && (
            <div
              className={cn(lightRailListClassName, "p-0.5 pr-2.5 gap-2 rounded-lg shadow-2xs self-center")}
              role="tablist"
              aria-label="View Navigation"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "job"}
                data-state={activeTab === "job" ? "active" : "inactive"}
                className={cn(lightRailTriggerClassName, "px-2 py-0.5 text-[11px] rounded-md")}
                onClick={() => onSelectTab("job")}
              >
                Job
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "draft"}
                data-state={activeTab === "draft" ? "active" : "inactive"}
                className={cn(lightRailTriggerClassName, "px-2 py-0.5 text-[11px] rounded-md")}
                onClick={() => onSelectTab("draft")}
              >
                Draft
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
