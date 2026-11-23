import { Compass, ExternalLink, RefreshCw } from "lucide-react";
import { Loader } from "@/components/ui/loader";

import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/composites/status-dot";
import {
  darkPlateClassName,
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
  const connectionTone = checkingSession
    ? "busy"
    : session?.ok
      ? "ok"
      : "error";

  return (
    <>
      <header
        className={cn(
          "flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3 text-[#e4f7f3]",
          darkPlateClassName
        )}
      >
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
            <span className="-ml-0.5 select-none font-sans text-sm font-semibold tracking-tight text-brand">
              +
            </span>
          </div>
          <Badge
            variant="outline"
            className="h-4 border-white/20 bg-white/5 px-1.5 py-0 text-[10px] font-medium text-[#e4f7f3]"
          >
            Companion
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <StatusDot
            tone={connectionTone}
            size="md"
            ping={checkingSession}
            className="shrink-0"
          />

          <div
            className={cn(
              darkRailListClassName,
              "gap-2 rounded-lg p-0.5 pr-3 shadow-sm"
            )}
            data-mp-tab-rail=""
            role="radiogroup"
            aria-label="Environment"
          >
            <button
              type="button"
              role="radio"
              aria-checked={env === "dev"}
              data-state={env === "dev" ? "active" : "inactive"}
              className={cn(
                darkRailTriggerClassName,
                "rounded-md px-2 py-0.5 text-[11px]"
              )}
              onClick={() => onSwitchEnvironment("dev")}
            >
              Dev :3000
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={env === "prod"}
              data-state={env === "prod" ? "active" : "inactive"}
              className={cn(
                darkRailTriggerClassName,
                "rounded-md px-2 py-0.5 text-[11px]"
              )}
              onClick={() => onSwitchEnvironment("prod")}
            >
              Production
            </button>
          </div>
        </div>
      </header>

      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/50 bg-card/75 px-3 text-xs shadow-2xs backdrop-blur-md">
        {checkingSession ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader size="sm" /> Verifying session…
          </span>
        ) : session?.ok ? (
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 shadow-xs">
              {session.account?.picture ? (
                <img
                  src={session.account.picture}
                  alt={
                    session.profile?.fullName ||
                    session.account?.name ||
                    "Account"
                  }
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-primary/10 text-[9px] font-bold text-primary">
                  {session.profile?.fullName?.[0] ||
                    session.account?.name?.[0] ||
                    "U"}
                </span>
              )}
            </span>
            <span className="truncate text-xs font-medium text-foreground">
              {session.profile?.fullName || session.account?.name}
            </span>
            {session.account?.email ? (
              <>
                <span
                  className="h-3 w-px shrink-0 bg-border/60"
                  aria-hidden="true"
                />
                <span className="truncate text-[11px] text-muted-foreground">
                  {session.account.email}
                </span>
              </>
            ) : null}
            <button
              type="button"
              onClick={onRefreshSession}
              title="Refresh connection"
              className="ml-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <span className="text-xs font-medium text-destructive">
              Not authenticated (
              {env === "dev" ? "localhost:3000" : "Production"})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRefreshSession}
                title="Retry connection"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
              <a
                href={baseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Sign in <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {activeTab === "job" || !preview ? (
            <button
              type="button"
              onClick={onExtractFromTab}
              disabled={isExtracting}
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-input/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              title="Import job details from the active browser tab"
            >
              {isExtracting ? (
                <Loader size="sm" />
              ) : (
                <Compass className="h-3.5 w-3.5 text-primary" />
              )}
              <span>{isExtracting ? "Importing…" : "Import from Tab"}</span>
            </button>
          ) : null}

          {preview ? (
            <div
              className={cn(
                lightRailListClassName,
                "gap-2 self-center rounded-lg p-0.5 pr-2.5 shadow-2xs"
              )}
              role="tablist"
              aria-label="View Navigation"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "job"}
                data-state={activeTab === "job" ? "active" : "inactive"}
                className={cn(
                  lightRailTriggerClassName,
                  "rounded-md px-2 py-0.5 text-[11px]"
                )}
                onClick={() => onSelectTab("job")}
              >
                Job
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "draft"}
                data-state={activeTab === "draft" ? "active" : "inactive"}
                className={cn(
                  lightRailTriggerClassName,
                  "rounded-md px-2 py-0.5 text-[11px]"
                )}
                onClick={() => onSelectTab("draft")}
              >
                Draft
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
