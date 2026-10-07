import { getMasterProfile } from "@/app/actions/profile";
import { SettingsView } from "@/components/settings/settings-view";
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
    <div className="space-y-4">
      <div className="pb-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Accounts, automation, AI routing, and your master resume profile.
        </p>
      </div>

      <SettingsView
        accounts={accounts}
        activeAccountId={active?.id ?? null}
        activeEmail={active?.email ?? null}
        profile={profile}
        rules={active?.rules ?? DEFAULT_ACCOUNT_RULES}
        matchThreshold={active?.matchThreshold ?? profile?.matchThreshold}
        llmProvider={active?.settings?.llmProvider ?? "OPENROUTER"}
        localOllamaUrl={active?.settings?.localOllamaUrl ?? ""}
        ollamaModel={active?.settings?.ollamaModel ?? "llama3.1:8b"}
        connectedBanner={params.connected ?? null}
        errorBanner={params.error ?? null}
      />
    </div>
  );
}
