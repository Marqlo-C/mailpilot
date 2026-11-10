import { History, Mail } from "lucide-react";
import { formatDistanceToNow } from "@/lib/utils/format-distance";
import { clutterScoreTier } from "@/lib/subscriptions/filters";
import {
  META_CHIP_ICON_CLASSNAME,
  MetaChip,
} from "@/components/ui/tactile/meta-chip";
import { cn } from "@/lib/utils";
import {
  CLUTTER_VALUE_CLASSES,
  METRICS_GAP_CLASS,
  SELECT_MUTED_PILL_VALUE_CLASSNAME,
  type MetricColumnWidths,
} from "./types";

export function formatLastReceivedValue(
  date: Date | string | null | undefined
): string {
  if (!date || !Number.isFinite(new Date(date).getTime())) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: false });
}

export function ClutterStatBadge({
  score,
  width,
  selected = false,
}: {
  score: number;
  width?: string;
  selected?: boolean;
}) {
  const tier = clutterScoreTier(score);
  return (
    <MetaChip
      title="Noise level"
      value={`${score}%`}
      valueClassName={
        selected
          ? SELECT_MUTED_PILL_VALUE_CLASSNAME
          : CLUTTER_VALUE_CLASSES[tier]
      }
      width={width}
      selected={selected}
    />
  );
}

export function EmailsStatBadge({
  count,
  width,
  selected = false,
}: {
  count: number;
  width?: string;
  selected?: boolean;
}) {
  return (
    <MetaChip
      title="Email volume"
      icon={<Mail className={META_CHIP_ICON_CLASSNAME.sm} aria-hidden />}
      iconSize="sm"
      value={String(count)}
      valueClassName="font-medium"
      width={width}
      selected={selected}
      divider="pipe"
    />
  );
}

export function LastReceivedStatBadge({
  date,
  width,
  selected = false,
}: {
  date: Date | string | null | undefined;
  width?: string;
  selected?: boolean;
}) {
  const value = formatLastReceivedValue(date);
  return (
    <MetaChip
      title="Last received"
      icon={<History className={META_CHIP_ICON_CLASSNAME.sm} aria-hidden />}
      iconSize="sm"
      value={value}
      valueClassName="font-normal"
      width={width ?? "6.25ch"}
      truncateValue
      selected={selected}
      divider="pipe"
    />
  );
}

export function AnalyticsMetrics({
  clutter,
  emailCount,
  lastReceivedAt,
  widths,
  selected = false,
}: {
  clutter: number;
  emailCount: number;
  lastReceivedAt: Date | string | null | undefined;
  widths?: MetricColumnWidths;
  selected?: boolean;
}) {
  return (
    <div className={cn("flex items-center", METRICS_GAP_CLASS)}>
      <LastReceivedStatBadge
        date={lastReceivedAt}
        width={widths?.received}
        selected={selected}
      />
      <EmailsStatBadge
        count={emailCount}
        width={widths?.emails}
        selected={selected}
      />
      <ClutterStatBadge
        score={clutter}
        width={widths?.clutter}
        selected={selected}
      />
    </div>
  );
}
