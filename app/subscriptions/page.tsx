import { SubscriptionsView } from "@/components/subscriptions/subscriptions-view";
import {
  getActiveAccount,
  getLatestBriefingForAccount,
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
  const latestBriefing = active
    ? await getLatestBriefingForAccount(active.id)
    : null;

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
      latestBriefing={
        latestBriefing
          ? {
              id: latestBriefing.id,
              htmlPreview: latestBriefing.htmlPreview,
              generatedAt: latestBriefing.generatedAt.toISOString(),
              senderEmails: latestBriefing.senderEmails,
              subscriptionIds: latestBriefing.subscriptionIds,
            }
          : null
      }
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
