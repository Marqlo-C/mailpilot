import { headers } from "next/headers";
import { getMasterProfile } from "@/app/actions/profile";
import { SettingsView } from "@/components/features/settings/settings-view";
import { getActiveAccount, listAccounts } from "@/lib/data";
import { DEFAULT_ACCOUNT_RULES } from "@/lib/validations/rules.schema";
import { SETTINGS_PAGE_TABS } from "@/lib/utils/navigation/page-tabs";
import { readServerActivePageTab } from "@/lib/utils/navigation/page-tabs-server";
import { readServerSettingsAccordions } from "@/lib/utils/navigation/settings-accordion-server";
import { readServerUiPreferences } from "@/lib/utils/ui/ui-preferences-server";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const [accounts, active, headersList] = await Promise.all([
    listAccounts(),
    getActiveAccount(),
    headers(),
  ]);

  const hostHeader =
    headersList.get("x-forwarded-host") ?? headersList.get("host");
  const host = hostHeader?.split(",")[0]?.trim() || "mailpilot-prod.vercel.app";
  const protoHeader = headersList.get("x-forwarded-proto");
  const protocol =
    protoHeader?.split(",")[0]?.trim() ||
    (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  const serverOrigin = `${protocol}://${host}`;

  const [profileResult, initialTab, initialAccordions, initialUiPreferences] =
    await Promise.all([
      active
        ? getMasterProfile(active.id)
        : Promise.resolve({ ok: false as const, error: "no account" }),
      readServerActivePageTab(
        "/settings",
        SETTINGS_PAGE_TABS.map((t) => t.value),
        active?.id ?? null
      ),
      readServerSettingsAccordions(active?.id ?? null),
      readServerUiPreferences(active?.id ?? null),
    ]);
  const profile =
    profileResult.ok && profileResult.data ? profileResult.data : null;

  return (
    <SettingsView
      accounts={accounts}
      activeAccountId={active?.id ?? null}
      activeEmail={active?.email ?? null}
      initialTab={initialTab ?? undefined}
      initialAccordions={initialAccordions}
      initialUiPreferences={initialUiPreferences}
      serverOrigin={serverOrigin}
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
