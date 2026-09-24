import { ScanInboxDialog } from "@/components/scan-inbox-dialog";
import { SubscriptionsView } from "@/components/subscriptions/subscriptions-view";
import {
  getActiveAccount,
  getSubscriptionsForAccount,
} from "@/lib/data";

export default async function SubscriptionsPage() {
  const active = await getActiveAccount();
  const subscriptions = active
    ? await getSubscriptionsForAccount(active.id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Subscriptions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Detected newsletter senders with one-click, email, or link unsubscribe.
          </p>
        </div>
        <ScanInboxDialog accountId={active?.id ?? null} />
      </div>

      {!active ? (
        <EmptyAccount />
      ) : (
        <SubscriptionsView
          subscriptions={subscriptions}
          defaultCleanup={active.rules.autoCleanAfterUnsub}
        />
      )}
    </div>
  );
}

function EmptyAccount() {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <p className="font-medium">Connect a Gmail account first</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Head to Settings to link an inbox.
      </p>
    </div>
  );
}
