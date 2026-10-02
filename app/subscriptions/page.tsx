import { SubscriptionsView } from "@/components/subscriptions/subscriptions-view";
import {
  getActiveAccount,
  getSubscriptionHistoryForProfile,
  getSubscriptionsForAccount,
} from "@/lib/data";

export default async function SubscriptionsPage() {
  const active = await getActiveAccount();
  const subscriptions = active
    ? await getSubscriptionsForAccount(active.id)
    : [];
  const history =
    active?.persistentProfileId
      ? await getSubscriptionHistoryForProfile(active.persistentProfileId)
      : [];

  if (!active) {
    return (
      <div className="space-y-4 pt-2">
        <EmptyAccount />
      </div>
    );
  }

  return (
    <SubscriptionsView
      accountId={active.id}
      subscriptions={subscriptions}
      history={history}
      defaultCleanup={active.rules.autoCleanAfterUnsub}
    />
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
