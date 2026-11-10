import { useMemo } from "react";
import type { Subscription } from "@prisma/client";
import { CompanyLogo } from "@/components/ui/logo-frame";
import { selectCheckboxClassName } from "@/components/ui/styles/select-checkbox";
import {
  getSelectionGroupEdges,
  selectHighlightCardGroupClassName,
} from "@/components/ui/styles/select-highlight";
import type { useCardListGestures } from "@/hooks/use-card-list-gestures";
import { cn } from "@/lib/utils";
import {
  SUBSCRIPTION_CARD_SHELL_CLASS,
  SUBSCRIPTION_CARD_SURFACE_CLASS,
  clutterForSub,
  computeMetricColumnWidths,
  senderLogoSrc,
  type ResolvedBriefing,
} from "./types";
import { AnalyticsMetrics } from "./subscriptions-metrics-bar";
import {
  LastBriefingIconButton,
  SubscriptionRowActions,
} from "./subscription-row-actions";
import { InsertMarker } from "./subscriptions-desktop-table";

type BindItem = ReturnType<typeof useCardListGestures>["bindItem"];

export function ActiveMobileCards({
  subscriptions,
  selectedIds,
  lastClickedId,
  onToggleRow,
  bindItem,
  insertBeforeId,
  insertAfterLast,
  onUnsubscribe,
  onBriefing,
  resolveBriefing,
  onViewLastBriefing,
  onViewLastEmail,
}: {
  subscriptions: Subscription[];
  selectedIds: string[];
  lastClickedId: string | null;
  onToggleRow: (id: string) => void;
  bindItem: BindItem;
  insertBeforeId: string | null;
  insertAfterLast: boolean;
  onUnsubscribe: (sub: Subscription) => void;
  onBriefing: (sub: Subscription) => void;
  resolveBriefing: (sub: Subscription) => ResolvedBriefing | null;
  onViewLastBriefing: (briefing: ResolvedBriefing) => void;
  onViewLastEmail: (sub: Subscription) => void;
}) {
  const metricWidths = useMemo(
    () => computeMetricColumnWidths(subscriptions),
    [subscriptions]
  );

  const orderedIds = useMemo(
    () => subscriptions.map((sub) => sub.id),
    [subscriptions]
  );

  return (
    <ul className="md:hidden" data-dnd-list>
      {subscriptions.map((sub, index) => {
        const clutter = clutterForSub(sub);
        const briefing = resolveBriefing(sub);
        const selectionGroup = getSelectionGroupEdges(
          orderedIds,
          selectedIds,
          index
        );
        const selected = selectionGroup.selected;
        const nextSelected = selected && !selectionGroup.isGroupEnd;
        const itemProps = bindItem(sub.id);
        const { style: itemStyle, ...itemRest } = itemProps;
        return (
          <li
            key={sub.id}
            {...itemRest}
            style={itemStyle}
            className={cn(
              "relative select-none",
              selected
                ? cn(
                    SUBSCRIPTION_CARD_SHELL_CLASS,
                    "transition-[background,border-color,border-radius,margin] duration-200",
                    selectHighlightCardGroupClassName(selectionGroup),
                    nextSelected ? "mb-0" : "mb-3"
                  )
                : cn(SUBSCRIPTION_CARD_SURFACE_CLASS, "mb-3")
            )}
          >
            {insertBeforeId === sub.id ? (
              <div className="absolute inset-x-2 top-0 z-10">
                <InsertMarker />
              </div>
            ) : null}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleRow(sub.id)}
                className={selectCheckboxClassName({
                  lastClicked: lastClickedId === sub.id,
                  className: "m-0 h-3.5 w-3.5 shrink-0 cursor-pointer",
                })}
                aria-label={`Select ${sub.senderEmail}`}
              />
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <CompanyLogo
                  src={senderLogoSrc(sub.senderEmail)}
                  name={sub.senderName ?? sub.senderEmail}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        selected ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {sub.senderName ?? sub.senderEmail}
                    </p>
                    {briefing ? (
                      <LastBriefingIconButton
                        briefing={briefing}
                        onView={onViewLastBriefing}
                        disabled={selected}
                      />
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {sub.senderEmail}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <AnalyticsMetrics
                clutter={clutter}
                emailCount={sub.emailCount}
                lastReceivedAt={sub.lastReceivedAt}
                widths={metricWidths}
                selected={selected}
              />
              <div className="-mr-1.5 flex shrink-0 items-center justify-end gap-2.5">
                <SubscriptionRowActions
                  sub={sub}
                  onBriefing={onBriefing}
                  onUnsubscribe={onUnsubscribe}
                  onViewLastEmail={onViewLastEmail}
                  disabled={selected}
                />
              </div>
            </div>
          </li>
        );
      })}
      {insertAfterLast ? (
        <li className="list-none px-2" aria-hidden>
          <InsertMarker />
        </li>
      ) : null}
    </ul>
  );
}
