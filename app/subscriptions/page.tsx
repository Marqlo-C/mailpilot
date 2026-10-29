import { SubscriptionsView } from "@/components/subscriptions/subscriptions-view";
import {
  getActiveAccount,
  getLatestBriefingForAccount,
  getSubscriptionHistoryForProfile,
  getSubscriptionsForAccount,
} from "@/lib/data";
import { refreshStaleSubscriptionDates } from "@/lib/subscriptions/last-received";
import { SUBSCRIPTION_PAGE_TABS } from "@/lib/navigation/page-tabs";
import { readServerActivePageTab } from "@/lib/navigation/page-tabs-server";

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
      defaultCleanup={active.rules.autoCleanAfterUnsub}
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
    <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <p className="font-medium">Connect a Gmail account first</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Head to Settings to link an inbox.
      </p>
    </div>
  );
}
