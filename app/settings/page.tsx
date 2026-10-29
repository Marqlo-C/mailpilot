import { getMasterProfile } from "@/app/actions/profile";
import { SettingsView } from "@/components/settings/settings-view";
import { getActiveAccount, listAccounts } from "@/lib/data";
import { DEFAULT_ACCOUNT_RULES } from "@/lib/validations/rules";
import { SETTINGS_PAGE_TABS } from "@/lib/navigation/page-tabs";
import { readServerActivePageTab } from "@/lib/navigation/page-tabs-server";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const [accounts, active] = await Promise.all([
    listAccounts(),
    getActiveAccount(),
  ]);

  const [profileResult, initialTab] = await Promise.all([
    active
      ? getMasterProfile(active.id)
      : Promise.resolve({ ok: false as const, error: "no account" }),
    readServerActivePageTab(
      "/settings",
      SETTINGS_PAGE_TABS.map((t) => t.value),
      active?.id ?? null
    ),
  ]);
  const profile =
    profileResult.ok && profileResult.data ? profileResult.data : null;

  return (
    <SettingsView
      accounts={accounts}
      activeAccountId={active?.id ?? null}
      activeEmail={active?.email ?? null}
      initialTab={initialTab ?? undefined}
      profile={profile}
      rules={active?.rules ?? DEFAULT_ACCOUNT_RULES}
      matchThreshold={active?.matchThreshold ?? profile?.matchThreshold}
      llmProvider={active?.settings?.llmProvider ?? "OPENROUTER"}
      localOllamaUrl={active?.settings?.localOllamaUrl ?? ""}
      ollamaModel={active?.settings?.ollamaModel ?? "llama3.1:8b"}
      isDev={process.env.NODE_ENV === "development"}
      errorBanner={params.error ?? null}
    />
  );
}
