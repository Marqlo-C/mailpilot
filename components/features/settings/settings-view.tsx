"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { LogOut, PlusCircle, Terminal } from "lucide-react";

import { logoutSession } from "@/app/actions/auth";
import { ExportMasterProfileButton } from "@/components/features/profile/export-master-profile-button";
import { ResumeUploadDialog } from "@/components/features/profile/resume-upload-dialog";
import { AccountsCard } from "@/components/features/settings/accounts";
import { AiModelsCard } from "@/components/features/settings/ai-models";
import { AutomationCard } from "@/components/features/settings/automation";
import { FeatureFlagsCard } from "@/components/features/settings/feature-flags";
import { OutboundTailoringCard } from "@/components/features/settings/outbound";
import {
  MasterProfileCard,
  type ProfileSnapshotData,
} from "@/components/features/settings/profile";
import {
  BOXY_ACTION_BTN_DESTRUCTIVE,
} from "@/lib/utils/navigation/settings-chrome";
import { useRailActionClass } from "@/components/ui/rail-action";
import {
  TactileControlsCard,
} from "@/components/features/settings/tactile-preferences";
import {
  CommandDeckFrame,
  tabRailRowClassName,
  useTabRailClasses,
} from "@/components/ui/tactile/segmented-tabs";
import { Loader } from "@/components/ui/loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AccountSummary } from "@/lib/data";
import {
  getSettingsPageTabs,
  clearSidebarPageTab,
  peekSidebarPageTab,
  persistActivePageTab,
  resolveInitialPageTab,
  subscribePageTabs,
  type SettingsPageTab,
} from "@/lib/utils/navigation/page-tabs";
import { cn } from "@/lib/utils";
import type { AccountRules } from "@/lib/validations/rules.schema";
import type { SettingsServerAccordions } from "@/lib/utils/navigation/settings-accordion-server";
import type { ServerUiPreferences } from "@/lib/utils/ui/ui-preferences-server";
import type { FeatureFlagKey } from "@/lib/validations/feature-flags.schema";

type SettingsViewProps = {
  accounts: AccountSummary[];
  activeAccountId: string | null;
  activeEmail: string | null;
  profile: ProfileSnapshotData | null;
  rules: AccountRules;
  matchThreshold: number | null | undefined;
  llmProvider: string;
  localOllamaUrl: string;
  ollamaModel: string;
  isDev?: boolean;
  errorBanner?: string | null;
  initialTab?: SettingsPageTab;
  initialAccordions?: SettingsServerAccordions;
  initialUiPreferences?: ServerUiPreferences;
  serverOrigin?: string;
  killSwitches?: Record<FeatureFlagKey, boolean>;
};

/**
 * Settings shell. The segmented tab rail is the first element, matching
 * Job Radar and Subscriptions. Tabs use forceMount so AI bridge state
 * stays alive across switches.
 */
export function SettingsView({
  accounts,
  activeAccountId,
  activeEmail,
  profile,
  rules,
  matchThreshold,
  llmProvider,
  localOllamaUrl,
  ollamaModel,
  isDev = false,
  errorBanner,
  initialTab,
  initialAccordions,
  initialUiPreferences,
  serverOrigin,
  killSwitches,
}: SettingsViewProps) {
  const [isLoggingOut, startLogoutTransition] = useTransition();
  const {
    listClassName: segmentedTabsListClassName,
    triggerClassName: segmentedTabsTriggerClassName,
  } = useTabRailClasses();
  const railActionClass = useRailActionClass();
  const settingsTabs = useMemo(() => getSettingsPageTabs(isDev), [isDev]);
  const allowedTabs = useMemo(
    () => settingsTabs.map((item) => item.value as SettingsPageTab),
    [settingsTabs]
  );
  const fallbackTab: SettingsPageTab = initialTab ?? "accounts";
  const tab = useSyncExternalStore(
    subscribePageTabs,
    () =>
      resolveInitialPageTab({
        href: "/settings",
        allowed: allowedTabs,
        fallback: fallbackTab,
        accountId: activeAccountId,
      }),
    () => fallbackTab
  );
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(
    () => new Set([fallbackTab])
  );
  const [prevTab, setPrevTab] = useState(tab);
  if (prevTab !== tab) {
    setPrevTab(tab);
    if (!visitedTabs.has(tab)) {
      setVisitedTabs((prev) => new Set(prev).add(tab));
    }
  }

  useEffect(() => {
    const pending = peekSidebarPageTab("/settings", allowedTabs);
    if (!pending) return;
    persistActivePageTab("/settings", pending, activeAccountId);
    const clearId = window.setTimeout(() => clearSidebarPageTab(), 0);
    return () => window.clearTimeout(clearId);
  }, [activeAccountId, allowedTabs, tab]);

  function handleLogout() {
    startLogoutTransition(async () => {
      await logoutSession();
    });
  }

  return (
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = settingsTabs.find((item) => item.value === value);
          if (next) {
            setVisitedTabs((prev) => new Set(prev).add(next.value));
            persistActivePageTab("/settings", next.value, activeAccountId);
          }
        }}
      >
        <CommandDeckFrame
          bodyWidth="deck"
          rail={
        <div className={cn(tabRailRowClassName, "mb-0")}>
          <TabsList className={segmentedTabsListClassName} data-mp-tab-rail="">
            {settingsTabs.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={segmentedTabsTriggerClassName}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Conditional Tab Rail Action Buttons */}
          {tab === "profile" && activeAccountId ? (
            <div className="flex flex-wrap items-center gap-2">
              {profile ? (
                <ExportMasterProfileButton
                  accountId={activeAccountId}
                  className={railActionClass}
                  railAction
                />
              ) : null}
              <ResumeUploadDialog
                accountId={activeAccountId}
                triggerLabel="Import Resume"
                triggerClassName={railActionClass}
                railAction
                isDev={isDev}
              />
            </div>
          ) : null}

          {tab === "accounts" ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/api/auth/google?intent=link"
                className={railActionClass}
                data-mp-rail-action=""
              >
                <PlusCircle className="size-3.5 shrink-0" />
                Add Gmail Account
              </a>
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleLogout}
                className={BOXY_ACTION_BTN_DESTRUCTIVE}
              >
                {isLoggingOut ? (
                  <Loader size="sm" className="shrink-0" />
                ) : (
                  <LogOut className="size-3.5 shrink-0" />
                )}
                {isLoggingOut ? "Logging out…" : "Log Out Session"}
              </button>
            </div>
          ) : null}
        </div>
          }
        >

        {errorBanner ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-card/80 px-4 py-3 text-sm text-destructive shadow-sm backdrop-blur-sm">
            OAuth error: {errorBanner}
          </div>
        ) : null}

        <TabsContent
          value="accounts"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          {visitedTabs.has("accounts") ? (
            <AccountsCard
              accounts={accounts}
              activeAccountId={activeAccountId}
            />
          ) : null}
        </TabsContent>

        <TabsContent
          value="profile"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          {visitedTabs.has("profile") ? (
            <MasterProfileCard
              accountId={activeAccountId}
              profile={profile}
            />
          ) : null}
        </TabsContent>

        <TabsContent
          value="outbound"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          {visitedTabs.has("outbound") ? (
            <OutboundTailoringCard
              accountId={activeAccountId}
              rules={rules}
              initialAccordion={initialAccordions?.outbound}
              isModeBKillSwitched={killSwitches?.mode_b_metric_synthesis ?? false}
            />
          ) : null}
        </TabsContent>

        <TabsContent
          value="automation"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          {visitedTabs.has("automation") ? (
            <AutomationCard
              accountId={activeAccountId}
              rules={rules}
              matchThreshold={matchThreshold}
              initialAccordion={initialAccordions?.automation}
            />
          ) : null}
        </TabsContent>

        <TabsContent
          value="ai"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          {visitedTabs.has("ai") ? (
            <AiModelsCard
              accountId={activeAccountId}
              accountEmail={activeEmail}
              llmProvider={llmProvider}
              localOllamaUrl={localOllamaUrl}
              ollamaModel={ollamaModel}
              isDev={isDev}
              bridgeSecret={rules.bridgeSecret ?? ""}
              availableModels={rules.availableModels ?? []}
              bridgeConnected={rules.bridgeConnected ?? false}
              allowCloudFallback={rules.allowCloudFallback ?? false}
              cloudProvider={rules.cloudProvider ?? "OPENROUTER"}
              cloudModel={rules.cloudModel ?? null}
              cloudModelProvider={rules.cloudModelProvider ?? null}
              maskedApiKey={rules.maskedApiKey ?? null}
              maskedScrapingAntApiKey={rules.maskedScrapingAntApiKey ?? null}
              scrapingAntUsage={rules.scrapingAntUsage ?? null}
              maskedHasDataApiKey={rules.maskedHasDataApiKey ?? null}
              hasDataUsage={rules.hasDataUsage ?? null}
              enableWebScrapingProxies={rules.enableWebScrapingProxies ?? true}
              initialAccordion={initialAccordions?.ollama}
              serverOrigin={serverOrigin}
            />
          ) : null}
        </TabsContent>

        <TabsContent
          value="ui"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          {visitedTabs.has("ui") ? (
            <TactileControlsCard
              accountId={activeAccountId}
              initialPreferences={initialUiPreferences}
            />
          ) : null}
        </TabsContent>

        {isDev ? (
          <TabsContent
            value="developer"
            forceMount
            className="mt-0 space-y-4 data-[state=inactive]:hidden"
          >
            {visitedTabs.has("developer") ? (
              <>
                <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                  <Terminal className="size-4 shrink-0" aria-hidden="true" />
                  <p className="text-xs leading-relaxed">
                    Developer Environment Toggles — Active in local development only. Production relies on{" "}
                    <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-[11px]">
                      lib/config/features.config.ts
                    </code>{" "}
                    and deployment environment variables.
                  </p>
                </div>
                <FeatureFlagsCard
                  accountId={activeAccountId}
                  rules={rules}
                  killSwitches={killSwitches}
                />
              </>
            ) : null}
          </TabsContent>
        ) : null}
        </CommandDeckFrame>
      </Tabs>
  );
}
