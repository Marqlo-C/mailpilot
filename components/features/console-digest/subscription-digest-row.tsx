import Link from "next/link";
import type { Subscription } from "@prisma/client";
import { CompanyLogo } from "@/components/ui/logo-frame";
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
    <Link
      href="/subscriptions"
      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40"
    >
      <CompanyLogo
        src={domain ? faviconUrlForDomain(domain) : null}
        name={subscription.senderName ?? subscription.senderEmail}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {subscription.senderName ?? "—"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {subscription.senderEmail}
        </p>
      </div>
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
    </Link>
  );
}
