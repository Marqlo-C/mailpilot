"use client";

import { useState } from "react";

import { AccountsCard } from "@/components/settings/accounts-card";
import { AiModelsCard } from "@/components/settings/ai-models-card";
import { ApplicationAutomationCard } from "@/components/settings/application-automation-card";
import { AutomationRulesCard } from "@/components/settings/automation-rules-card";
import { ExcludedTitlesCard } from "@/components/settings/excluded-titles-card";
import { MasterProfileCard } from "@/components/settings/master-profile-card";
import type { ProfileSnapshotData } from "@/components/settings/master-profile-card";
import { ResumeTailoringDefaultsCard } from "@/components/settings/resume-tailoring-defaults-card";
import { UiRailCard } from "@/components/settings/ui-rail-card";
import { DismissedRetentionSetting } from "@/components/settings/retention-setting";
import { useTabRailClasses } from "@/components/ui/segmented-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AccountSummary } from "@/lib/data";
import type { AccountRules } from "@/lib/validations/rules";

type SettingsTab = "accounts" | "profile" | "automation" | "ai" | "ui";

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
  connectedBanner?: string | null;
  errorBanner?: string | null;
};

/**
 * Settings shell: keeps the page heading outside, then uses the same
 * segmented tab rail as Job Radar / Subscriptions to group existing cards.
 * Tabs use forceMount so AI bridge state stays alive across switches.
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
  connectedBanner,
  errorBanner,
}: SettingsViewProps) {
  const [tab, setTab] = useState<SettingsTab>("accounts");
  const {
    listClassName: segmentedTabsListClassName,
    triggerClassName: segmentedTabsTriggerClassName,
  } = useTabRailClasses();

  return (
    <div className="space-y-4">
      {connectedBanner ? (
        <div className="rounded-lg border border-primary/30 bg-card/80 px-4 py-3 text-sm text-primary shadow-sm backdrop-blur-sm">
          Connected {connectedBanner}
        </div>
      ) : null}
      {errorBanner ? (
        <div className="rounded-lg border border-destructive/30 bg-card/80 px-4 py-3 text-sm text-destructive shadow-sm backdrop-blur-sm">
          OAuth error: {errorBanner}
        </div>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as SettingsTab)}
      >
        <div className="mb-1 flex items-center gap-1.5 pt-1">
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
        </div>

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
          <ResumeTailoringDefaultsCard
            accountId={activeAccountId}
            rules={rules}
          />
        </TabsContent>

        <TabsContent
          value="automation"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          <ApplicationAutomationCard
            accountId={activeAccountId}
            rules={rules}
            matchThreshold={matchThreshold}
          />
          <DismissedRetentionSetting
            currentDays={rules.dismissedRetentionDays}
          />
          <AutomationRulesCard
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
            bridgeSecret={rules.bridgeSecret ?? ""}
            availableModels={rules.availableModels ?? []}
            bridgeConnected={rules.bridgeConnected ?? false}
            allowCloudFallback={rules.allowCloudFallback ?? false}
          />
        </TabsContent>

        <TabsContent
          value="ui"
          forceMount
          className="mt-0 space-y-4 data-[state=inactive]:hidden"
        >
          <UiRailCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
