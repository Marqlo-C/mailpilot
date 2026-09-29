import { getMasterProfile } from "@/app/actions/profile";
import { AccountsCard } from "@/components/settings/accounts-card";
import { AiModelsCard } from "@/components/settings/ai-models-card";
import { ApplicationAutomationCard } from "@/components/settings/application-automation-card";
import { AutomationRulesCard } from "@/components/settings/automation-rules-card";
import { ExcludedTitlesCard } from "@/components/settings/excluded-titles-card";
import { MasterProfileCard } from "@/components/settings/master-profile-card";
import { DismissedRetentionSetting } from "@/components/settings/retention-setting";
import { getActiveAccount, listAccounts } from "@/lib/data";
import { DEFAULT_ACCOUNT_RULES } from "@/lib/validations/rules";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const [accounts, active] = await Promise.all([
    listAccounts(),
    getActiveAccount(),
  ]);

  const profileResult = active
    ? await getMasterProfile(active.id)
    : { ok: false as const, error: "no account" };
  const profile =
    profileResult.ok && profileResult.data ? profileResult.data : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accounts, automation, AI routing, and your master resume profile.
        </p>
      </div>

      {params.connected && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          Connected {params.connected}
        </div>
      )}
      {params.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          OAuth error: {params.error}
        </div>
      )}

      <div className="space-y-4">
        <AccountsCard
          accounts={accounts}
          activeAccountId={active?.id ?? null}
        />
        <MasterProfileCard accountId={active?.id ?? null} profile={profile} />
        <ApplicationAutomationCard
          accountId={active?.id ?? null}
          rules={active?.rules ?? DEFAULT_ACCOUNT_RULES}
          matchThreshold={
            profile?.matchThreshold ?? active?.rules.matchScoreThreshold
          }
        />
        <DismissedRetentionSetting
          currentDays={
            active?.rules.dismissedRetentionDays ??
            DEFAULT_ACCOUNT_RULES.dismissedRetentionDays
          }
        />
        <AutomationRulesCard
          accountId={active?.id ?? null}
          rules={active?.rules ?? DEFAULT_ACCOUNT_RULES}
        />
        <ExcludedTitlesCard
          accountId={active?.id ?? null}
          excludedTitles={
            active?.rules.excludedTitles ??
            DEFAULT_ACCOUNT_RULES.excludedTitles
          }
        />
        <AiModelsCard
          accountId={active?.id ?? null}
          accountEmail={active?.email ?? null}
          llmProvider={active?.settings?.llmProvider ?? "OPENROUTER"}
          localOllamaUrl={active?.settings?.localOllamaUrl ?? ""}
          ollamaModel={active?.settings?.ollamaModel ?? "llama3.1:8b"}
          bridgeSecret={active?.rules.bridgeSecret ?? ""}
          availableModels={active?.rules.availableModels ?? []}
          bridgeConnected={active?.rules.bridgeConnected ?? false}
          allowCloudFallback={active?.rules.allowCloudFallback ?? false}
        />
      </div>
    </div>
  );
}
