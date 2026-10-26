"use client";

import { useState, useTransition } from "react";
import { LogOut, PlusCircle } from "lucide-react";

import { logoutSession } from "@/app/actions/auth";
import { ExportMasterProfileButton } from "@/components/profile/export-master-profile-button";
import { ResumeUploadDialog } from "@/components/profile/resume-upload-dialog";
import { AccountsCard } from "@/components/settings/accounts";
import { AiModelsCard } from "@/components/settings/ai-models";
import {
  ExcludedTitlesCard,
  JobRadarRulesCard,
  LifecycleRulesCard,
  RetentionPolicyCard,
} from "@/components/settings/automation";
import { OutboundTailoringCard } from "@/components/settings/outbound";
import {
  MasterProfileCard,
  type ProfileSnapshotData,
} from "@/components/settings/profile";
import {
  BOXY_ACTION_BTN_SECONDARY,
  BOXY_ACTION_BTN_DESTRUCTIVE,
} from "@/components/settings/settings-chrome";
import {
  MeterPreferencesCard,
  RailPreferencesCard,
  TogglePreferencesCard,
} from "@/components/settings/ui";
import {
  tabRailRowClassName,
  useTabRailClasses,
} from "@/components/ui/tactile/segmented-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AccountSummary } from "@/lib/data";
import type { AccountRules } from "@/lib/validations/rules";

type SettingsTab =
  | "accounts"
  | "profile"
  | "outbound"
  | "automation"
  | "ai"
  | "ui";

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
}: SettingsViewProps) {
  const [tab, setTab] = useState<SettingsTab>("accounts");
  const [isLoggingOut, startLogoutTransition] = useTransition();
  const {
    listClassName: segmentedTabsListClassName,
    triggerClassName: segmentedTabsTriggerClassName,
  } = useTabRailClasses();

  function handleLogout() {
    startLogoutTransition(async () => {
      await logoutSession();
    });
  }

  return (
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as SettingsTab)}
      >
        <div className={tabRailRowClassName}>
          <TabsList className={segmentedTabsListClassName}>
            <TabsTrigger
              value="accounts"
              className={segmentedTabsTriggerClassName}
            >
              Accounts
            </TabsTrigger>
            <TabsTrigger
              value="profile"
              className={segmentedTabsTriggerClassName}
            >
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="outbound"
              className={segmentedTabsTriggerClassName}
            >
              Outbound
            </TabsTrigger>
            <TabsTrigger
              value="automation"
              className={segmentedTabsTriggerClassName}
            >
              Automation
            </TabsTrigger>
            <TabsTrigger value="ai" className={segmentedTabsTriggerClassName}>
              AI & Models
            </TabsTrigger>
            <TabsTrigger value="ui" className={segmentedTabsTriggerClassName}>
              UI
            </TabsTrigger>
          </TabsList>

          {/* Conditional Tab Rail Action Buttons */}
          {tab === "profile" && activeAccountId ? (
            <div className="flex flex-wrap items-center gap-2">
              {profile ? (
                <ExportMasterProfileButton
                  accountId={activeAccountId}
                  className={BOXY_ACTION_BTN_SECONDARY}
                />
              ) : null}
              <ResumeUploadDialog
                accountId={activeAccountId}
                triggerLabel="Import Resume"
                triggerClassName={BOXY_ACTION_BTN_SECONDARY}
              />
            </div>
          ) : null}

          {tab === "accounts" ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/api/auth/google?intent=link"
                className={BOXY_ACTION_BTN_SECONDARY}
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
                <LogOut className="size-3.5 shrink-0" />
                {isLoggingOut ? "Logging out…" : "Log Out Session"}
              </button>
            </div>
          ) : null}
        </div>

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
          <AccountsCard
            accounts={accounts}
            activeAccountId={activeAccountId}
          />
        </TabsContent>

        <TabsContent
          value="profile"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          <MasterProfileCard
            accountId={activeAccountId}
            profile={profile}
          />
        </TabsContent>

        <TabsContent
          value="outbound"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          <OutboundTailoringCard
            accountId={activeAccountId}
            rules={rules}
          />
        </TabsContent>

        <TabsContent
          value="automation"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          <JobRadarRulesCard
            accountId={activeAccountId}
            rules={rules}
            matchThreshold={matchThreshold}
          />
          <RetentionPolicyCard
            currentDays={rules.dismissedRetentionDays}
          />
          <LifecycleRulesCard
            accountId={activeAccountId}
            rules={rules}
          />
          <ExcludedTitlesCard
            accountId={activeAccountId}
            excludedTitles={rules.excludedTitles}
          />
        </TabsContent>

        <TabsContent
          value="ai"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
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
          />
        </TabsContent>

        <TabsContent
          value="ui"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          <RailPreferencesCard />
          <MeterPreferencesCard accountId={activeAccountId} />
          <TogglePreferencesCard accountId={activeAccountId} />
        </TabsContent>
      </Tabs>
  );
}
