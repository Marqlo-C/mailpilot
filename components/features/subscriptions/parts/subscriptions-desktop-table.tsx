import { useMemo } from "react";
import type { Subscription } from "@prisma/client";
import { CompanyLogo } from "@/components/ui/logo-frame";
import { WavyDashedLine } from "@/components/ui/tactile/wavy-dashed-line";
import { selectCheckboxClassName } from "@/components/ui/styles/select-checkbox";
import {
  getSelectionGroupEdges,
  selectHighlightGroupClassName,
  type SelectionGroupEdges,
} from "@/components/ui/styles/select-highlight";
import type { useCardListGestures } from "@/hooks/use-card-list-gestures";
import { cn } from "@/lib/utils";
import {
  METRICS_GAP_CLASS,
  SUBSCRIPTION_ROW_HEIGHT_CLASS,
  SUBSCRIPTION_ROW_HEIGHT_PX,
  SUBSCRIPTION_ROW_HOVER_CLASS,
  clutterForSub,
  computeMetricColumnWidths,
  senderLogoSrc,
  type MetricColumnWidths,
  type ResolvedBriefing,
} from "./types";
import {
  ClutterStatBadge,
  EmailsStatBadge,
  LastReceivedStatBadge,
} from "./subscriptions-metrics-bar";
import {
  LastBriefingIconButton,
  SubscriptionRowActions,
} from "./subscription-row-actions";

type BindItem = ReturnType<typeof useCardListGestures>["bindItem"];

export function InsertMarker({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none h-0.5 w-full bg-[#1ab5af]", className)}
      aria-hidden
    />
  );
}

export function SubscriptionDesktopRow({
  sub,
  selected,
  selectionGroup,
  selectionStartRadius,
  selectionEndRadius,
  lastClicked,
  onToggleRow,
  itemProps,
  showInsertBefore,
  showRowDivider,
  clutter,
  briefing,
  metricWidths,
  onBriefing,
  onUnsubscribe,
  onViewLastBriefing,
  onViewLastEmail,
}: {
  sub: Subscription;
  selected: boolean;
  selectionGroup: SelectionGroupEdges;
  selectionStartRadius: "sm" | "xl";
  selectionEndRadius: "sm" | "xl";
  lastClicked: boolean;
  onToggleRow: (id: string) => void;
  itemProps: ReturnType<BindItem>;
  showInsertBefore: boolean;
  showRowDivider: boolean;
  clutter: number;
  briefing: ResolvedBriefing | null;
  metricWidths: MetricColumnWidths;
  onBriefing: (sub: Subscription) => void;
  onUnsubscribe: (sub: Subscription) => void;
  onViewLastBriefing: (briefing: ResolvedBriefing) => void;
  onViewLastEmail: (sub: Subscription) => void;
}) {
  const { style: itemStyle, ...itemRest } = itemProps;
  return (
    <div
      {...itemRest}
      style={itemStyle}
      className={cn(
        "relative flex cursor-default items-center select-none",
        SUBSCRIPTION_ROW_HEIGHT_CLASS,
        SUBSCRIPTION_ROW_HOVER_CLASS,
        selected
          ? selectHighlightGroupClassName(selectionGroup, {
              startRadius: selectionStartRadius,
              endRadius: selectionEndRadius,
            })
          : null
      )}
    >
      {showInsertBefore ? (
        <div className="absolute inset-x-0 top-0 z-10">
          <InsertMarker />
        </div>
      ) : null}
      {showRowDivider ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] translate-y-1/2">
          <WavyDashedLine orientation="horizontal" />
        </div>
      ) : null}
      <div className="flex h-full w-1/2 min-w-0 items-center gap-3 pl-3 pr-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleRow(sub.id)}
          className={selectCheckboxClassName({
            lastClicked,
            className: "m-0 h-3.5 w-3.5 shrink-0 cursor-pointer",
          })}
          aria-label={`Select ${sub.senderEmail}`}
        />
        <CompanyLogo
          src={senderLogoSrc(sub.senderEmail)}
          name={sub.senderName ?? sub.senderEmail}
          size="md"
        />
        <div className={cn("min-w-0", selected && "text-muted-foreground")}>
          <div className="flex min-w-0 items-center gap-1.5">
            <p
              className={cn(
                "truncate text-sm font-medium",
                selected ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {sub.senderName ?? "—"}
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

      <div className="flex h-full w-1/2 min-w-0 items-center">
        <div className={cn("flex shrink-0 items-center pl-4", METRICS_GAP_CLASS)}>
          <LastReceivedStatBadge
            date={sub.lastReceivedAt}
            width={metricWidths.received}
            selected={selected}
          />
          <EmailsStatBadge
            count={sub.emailCount}
            width={metricWidths.emails}
            selected={selected}
          />
          <ClutterStatBadge
            score={clutter}
            width={metricWidths.clutter}
            selected={selected}
          />
        </div>

        <div className="flex h-full min-w-0 flex-1 items-center justify-center self-stretch">
          <WavyDashedLine
            orientation="vertical"
            length={SUBSCRIPTION_ROW_HEIGHT_PX}
          />
        </div>

        <div className="flex h-full shrink-0 items-center justify-end gap-2.5 self-stretch bg-muted/[0.12] py-0 pr-2.5">
          <SubscriptionRowActions
            sub={sub}
            onBriefing={onBriefing}
            onUnsubscribe={onUnsubscribe}
            onViewLastEmail={onViewLastEmail}
            disabled={selected}
          />
        </div>
      </div>
    </div>
  );
}

export function ActiveDesktopTable({
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

  const firstId = subscriptions[0]?.id;
  const lastId = subscriptions[subscriptions.length - 1]?.id;
  const selectionTouchesShell =
    (firstId != null && selectedIds.includes(firstId)) ||
    (lastId != null && selectedIds.includes(lastId));

  return (
    <div
      data-dnd-list
      className={cn(
        "relative hidden w-full overflow-hidden rounded-xl border-0 bg-card shadow-lg transition-[box-shadow] duration-200 hover:shadow-xl md:block",
        selectionTouchesShell ? "ring-0" : "ring-1 ring-border/80"
      )}
    >
      {subscriptions.map((sub, index) => {
        const clutter = clutterForSub(sub);
        const briefing = resolveBriefing(sub);
        const selectionGroup = getSelectionGroupEdges(
          orderedIds,
          selectedIds,
          index
        );
        return (
          <SubscriptionDesktopRow
            key={sub.id}
            sub={sub}
            selected={selectionGroup.selected}
            selectionGroup={selectionGroup}
            selectionStartRadius={index === 0 ? "xl" : "sm"}
            selectionEndRadius={
              index === subscriptions.length - 1 ? "xl" : "sm"
            }
            lastClicked={lastClickedId === sub.id}
            onToggleRow={onToggleRow}
            itemProps={bindItem(sub.id)}
            showInsertBefore={insertBeforeId === sub.id}
            showRowDivider={
              index < subscriptions.length - 1 &&
              !selectionGroup.selected &&
              !selectedIds.includes(subscriptions[index + 1]?.id ?? "")
            }
            clutter={clutter}
            briefing={briefing}
            metricWidths={metricWidths}
            onBriefing={onBriefing}
            onUnsubscribe={onUnsubscribe}
            onViewLastBriefing={onViewLastBriefing}
            onViewLastEmail={onViewLastEmail}
          />
        );
      })}
      {insertAfterLast ? (
        <div className="absolute inset-x-0 bottom-0 z-10">
          <InsertMarker />
        </div>
      ) : null}
    </div>
  );
}
