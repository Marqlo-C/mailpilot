import type { Subscription } from "@prisma/client";
import { DigestRowItem } from "./digest-row-item";
import { SCORE_PERCENT_CLASSNAME } from "@/components/ui/styles/score-percent";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/utils/domain";
import {
  clutterScoreTier,
  type ClutterScoreTier,
} from "@/lib/subscriptions/filters";
import { cn } from "@/lib/utils";

/** Same tier tints as the subscription clutter chips. */
export const CLUTTER_VALUE_CLASSES: Record<ClutterScoreTier, string> = {
  high: "bg-[#c21f10]/10 text-[#c21f10] dark:bg-[#fb6230]/18 dark:text-[#fb6230]",
  mid: "bg-[hsl(28_70%_48%/0.14)] text-[hsl(28_62%_36%)] dark:bg-[hsl(28_70%_48%/0.2)] dark:text-[hsl(28_75%_68%)]",
  low: "bg-[hsl(174_22%_92%)] text-[#147a76] dark:bg-[hsl(174_28%_22%/0.55)] dark:text-[#5eead4]",
};

export function SubscriptionDigestRow({
  subscription,
  clutter,
}: {
  subscription: Subscription;
  clutter: number;
}) {
  const domain = getCleanDomain(subscription.senderEmail);
  const tier = clutterScoreTier(clutter);
  return (
    <DigestRowItem
      href="/subscriptions"
      logoSrc={domain ? faviconUrlForDomain(domain) : null}
      logoName={subscription.senderName ?? subscription.senderEmail}
      title={subscription.senderName ?? "—"}
      subtitle={subscription.senderEmail}
      metricBadge={
        <span
          title="Clutter score"
          className={cn(
            "inline-flex h-[30px] shrink-0 items-center justify-center rounded-md px-2",
            SCORE_PERCENT_CLASSNAME,
            CLUTTER_VALUE_CLASSES[tier]
          )}
        >
          {clutter}%
        </span>
      }
    />
  );
}
