import { useMemo } from "react";
import { DatabaseX, Loader2, Trash2 } from "lucide-react";
import { CompanyLogo } from "@/components/ui/logo-frame";
import { WavyDashedLine } from "@/components/ui/tactile/wavy-dashed-line";
import { RowMenuTrigger } from "@/components/ui/composites/row-menu-trigger";
import {
  AppMenuContent,
  AppMenuItem,
} from "@/components/ui/app-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME,
} from "@/components/ui/styles/primary-action-btn";
import { cn } from "@/lib/utils";
import {
  METRICS_GAP_CLASS,
  SUBSCRIPTION_CARD_SURFACE_CLASS,
  SUBSCRIPTION_ROW_HEIGHT_CLASS,
  SUBSCRIPTION_ROW_HEIGHT_PX,
  SUBSCRIPTION_ROW_HOVER_CLASS,
  clutterForArchiveEntry,
  computeMetricColumnWidths,
  senderLogoSrc,
  type ArchiveEntry,
  type MetricColumnWidths,
} from "./types";
import {
  AnalyticsMetrics,
  ClutterStatBadge,
  EmailsStatBadge,
  LastReceivedStatBadge,
} from "./subscriptions-metrics-bar";

export function ArchiveCleanupButton({
  pending,
  onCleanup,
}: {
  pending: boolean;
  onCleanup: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onCleanup}
      className={PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      <span>Delete Emails</span>
    </button>
  );
}

export function ArchiveRowActions({
  entry,
  pending,
  onCleanup,
  onDeleteRecord,
}: {
  entry: ArchiveEntry;
  pending: boolean;
  onCleanup: (entry: ArchiveEntry) => void;
  onDeleteRecord: (entry: ArchiveEntry) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <ArchiveCleanupButton
        pending={pending}
        onCleanup={() => onCleanup(entry)}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowMenuTrigger label="Archive actions" disabled={pending} />
        </DropdownMenuTrigger>
        <AppMenuContent align="end" className="w-56">
          <AppMenuItem
            className="cursor-pointer gap-2 text-[#c21f10] focus:bg-[#c21f10]/10 focus:text-[#c21f10] dark:text-[#fb6230] dark:focus:bg-[#fb6230]/10 dark:focus:text-[#fb6230]"
            onClick={() => onDeleteRecord(entry)}
          >
            <DatabaseX className="size-4" />
            <span>Delete Record</span>
          </AppMenuItem>
        </AppMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ArchiveDesktopRow({
  entry,
  pending,
  metricWidths,
  showRowDivider,
  onCleanup,
  onDeleteRecord,
}: {
  entry: ArchiveEntry;
  pending: boolean;
  metricWidths: MetricColumnWidths;
  showRowDivider: boolean;
  onCleanup: (entry: ArchiveEntry) => void;
  onDeleteRecord: (entry: ArchiveEntry) => void;
}) {
  const clutter = clutterForArchiveEntry(entry);
  const emailCount = entry.emailCount ?? 0;

  return (
    <div
      className={cn(
        "relative flex items-center",
        SUBSCRIPTION_ROW_HEIGHT_CLASS,
        SUBSCRIPTION_ROW_HOVER_CLASS
      )}
    >
      {showRowDivider ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] translate-y-1/2">
          <WavyDashedLine orientation="horizontal" />
        </div>
      ) : null}
      <div className="flex h-full w-1/2 min-w-0 items-center gap-3 pl-3 pr-3">
        <CompanyLogo
          src={senderLogoSrc(entry.senderEmail)}
          name={entry.senderName ?? entry.senderEmail}
          size="md"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {entry.senderName ?? "—"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {entry.senderEmail}
          </p>
        </div>
      </div>

      <div className="flex h-full w-1/2 min-w-0 items-center">
        <div className={cn("flex shrink-0 items-center pl-4", METRICS_GAP_CLASS)}>
          <LastReceivedStatBadge
            date={entry.lastReceivedAt}
            width={metricWidths.received}
          />
          <EmailsStatBadge count={emailCount} width={metricWidths.emails} />
          <ClutterStatBadge score={clutter} width={metricWidths.clutter} />
        </div>

        <div className="flex h-full min-w-0 flex-1 items-center justify-center self-stretch">
          <WavyDashedLine
            orientation="vertical"
            length={SUBSCRIPTION_ROW_HEIGHT_PX}
          />
        </div>

        <div className="flex h-full shrink-0 items-center justify-end gap-2.5 self-stretch bg-muted/[0.12] py-0 pr-2.5">
          <ArchiveRowActions
            entry={entry}
            pending={pending}
            onCleanup={onCleanup}
            onDeleteRecord={onDeleteRecord}
          />
        </div>
      </div>
    </div>
  );
}

export function ArchiveDesktopTable({
  entries,
  cleanupPendingKey,
  pending,
  onCleanup,
  onDeleteRecord,
}: {
  entries: ArchiveEntry[];
  cleanupPendingKey: string | null;
  pending: boolean;
  onCleanup: (entry: ArchiveEntry) => void;
  onDeleteRecord: (entry: ArchiveEntry) => void;
}) {
  const metricWidths = useMemo(
    () =>
      computeMetricColumnWidths(
        entries.map((entry) => ({ emailCount: entry.emailCount ?? 0 }))
      ),
    [entries]
  );

  return (
    <div className="hidden w-full overflow-hidden rounded-xl border border-border/80 bg-card shadow-md transition-shadow duration-200 hover:shadow-lg md:block">
      {entries.map((entry, index) => (
        <ArchiveDesktopRow
          key={entry.key}
          entry={entry}
          pending={cleanupPendingKey === entry.key || pending}
          metricWidths={metricWidths}
          showRowDivider={index < entries.length - 1}
          onCleanup={onCleanup}
          onDeleteRecord={onDeleteRecord}
        />
      ))}
    </div>
  );
}

export function ArchiveMobileCards({
  entries,
  cleanupPendingKey,
  pending,
  onCleanup,
  onDeleteRecord,
}: {
  entries: ArchiveEntry[];
  cleanupPendingKey: string | null;
  pending: boolean;
  onCleanup: (entry: ArchiveEntry) => void;
  onDeleteRecord: (entry: ArchiveEntry) => void;
}) {
  const metricWidths = useMemo(
    () =>
      computeMetricColumnWidths(
        entries.map((entry) => ({ emailCount: entry.emailCount ?? 0 }))
      ),
    [entries]
  );

  return (
    <ul className="space-y-3 md:hidden">
      {entries.map((entry) => {
        const clutter = clutterForArchiveEntry(entry);
        return (
          <li key={entry.key} className={SUBSCRIPTION_CARD_SURFACE_CLASS}>
            <div className="flex min-w-0 items-center gap-3">
              <CompanyLogo
                src={senderLogoSrc(entry.senderEmail)}
                name={entry.senderName ?? entry.senderEmail}
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {entry.senderName ?? entry.senderEmail}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {entry.senderEmail}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <AnalyticsMetrics
                clutter={clutter}
                emailCount={entry.emailCount ?? 0}
                lastReceivedAt={entry.lastReceivedAt}
                widths={metricWidths}
              />
              <div className="-mr-1.5">
                <ArchiveRowActions
                  entry={entry}
                  pending={cleanupPendingKey === entry.key || pending}
                  onCleanup={onCleanup}
                  onDeleteRecord={onDeleteRecord}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
