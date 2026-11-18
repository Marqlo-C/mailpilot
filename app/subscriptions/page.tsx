import { SubscriptionsView } from "@/components/features/subscriptions/subscriptions-view";
import { EmptyState } from "@/components/ui/composites";
import {
  getActiveAccount,
  getLatestBriefingForAccount,
  getSubscriptionHistoryForProfile,
  getSubscriptionsForAccount,
} from "@/lib/data";
import { refreshStaleSubscriptionDates } from "@/lib/subscriptions/last-received";
import { SUBSCRIPTION_PAGE_TABS } from "@/lib/utils/navigation/page-tabs";
import { readServerActivePageTab } from "@/lib/utils/navigation/page-tabs-server";

export default async function SubscriptionsPage() {
  const active = await getActiveAccount();
  if (active) {
    try {
      await refreshStaleSubscriptionDates(active.id);
    } catch (error) {
      console.error("refreshStaleSubscriptionDates failed", error);
    }
  }

  const [subscriptions, history, latestBriefing, initialTab] = await Promise.all([
    active ? getSubscriptionsForAccount(active.id) : [],
    active?.persistentProfileId
      ? getSubscriptionHistoryForProfile(active.persistentProfileId)
      : [],
    active ? getLatestBriefingForAccount(active.id) : null,
    readServerActivePageTab(
      "/subscriptions",
      SUBSCRIPTION_PAGE_TABS.map((t) => t.value),
      active?.id ?? null
    ),
  ]);

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
      initialTab={initialTab ?? undefined}
      subscriptions={subscriptions}
      history={history}
      latestBriefing={
        latestBriefing
          ? {
              id: latestBriefing.id,
              subject: latestBriefing.subject,
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
    <EmptyState
      size="lg"
      title="Connect a Gmail account first"
      description="Head to Settings to link an inbox."
    />
  );
}
