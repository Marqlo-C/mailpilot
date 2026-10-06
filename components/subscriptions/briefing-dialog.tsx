"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { ActionDialogShell } from "@/components/ui/action-dialog-shell";
import { Calendar } from "@/components/ui/calendar";
import { CompanyLogo } from "@/components/ui/company-logo";
import { DialogIdentityLogoStack } from "@/components/ui/dialog-identity-header";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/primary-action-btn";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/domain";
import {
  inclusiveDaySpan,
  isValidBriefingRange,
  MAX_BRIEFING_DAYS,
} from "@/lib/subscriptions/digest-constants";
import { cn } from "@/lib/utils";

export type BriefingSender = {
  id: string;
  senderName: string | null;
  senderEmail: string;
};

type BriefingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  senders: BriefingSender[];
  pending: boolean;
  onGenerate: (range: { startDate: string; endDate: string }) => void;
};

function startOfLocalDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange(): DateRange {
  const to = startOfLocalDay();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  return { from, to };
}

function senderLogoSrc(email: string): string | null {
  const domain = getCleanDomain(email);
  return domain ? faviconUrlForDomain(domain) : null;
}

/**
 * DayPicker `max` uses differenceInCalendarDays (nights): max=9 ⇒ 10 inclusive days.
 */
const DAY_PICKER_MAX_NIGHTS = MAX_BRIEFING_DAYS - 1;

export function BriefingDialog({
  open,
  onOpenChange,
  senders,
  pending,
  onGenerate,
}: BriefingDialogProps) {
  const today = useMemo(() => startOfLocalDay(), []);
  const [range, setRange] = useState<DateRange | undefined>(defaultRange);
  const [month, setMonth] = useState<Date>(today);
  const [rangeWarning, setRangeWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = defaultRange();
    setRange(next);
    setMonth(next.to ?? today);
    setRangeWarning(null);
  }, [open, today]);

  function handleSelect(
    next: DateRange | undefined,
    triggerDate: Date
  ) {
    if (!next?.from) {
      setRange(next);
      setRangeWarning(null);
      return;
    }

    // Backup if library max is bypassed: restart at the clicked day (never freeze `from`).
    if (next.to && inclusiveDaySpan(next.from, next.to) > MAX_BRIEFING_DAYS) {
      const restart = startOfLocalDay(triggerDate);
      setRange({ from: restart, to: undefined });
      setMonth(restart);
      setRangeWarning(`Maximum snapshot range is ${MAX_BRIEFING_DAYS} days.`);
      return;
    }

    setRange(next);
    setRangeWarning(null);
  }

  const canGenerate = isValidBriefingRange(range?.from, range?.to);
  const primary = senders[0];
  const primaryName =
    primary?.senderName ?? primary?.senderEmail ?? "selected senders";
  const identityPrimary =
    senders.length === 1
      ? (primary?.senderEmail ?? primaryName)
      : `${senders.length} selected senders`;
  const identitySecondary =
    senders.length === 1 && primary?.senderName
      ? primary.senderName
      : null;

  return (
    <ActionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      size="lg"
      identity={{
        title: "Creating snapshot for:",
        primary: identityPrimary,
        secondary: identitySecondary,
        logo: (
          <DialogIdentityLogoStack
            size="lg"
            items={senders.map((sub) => ({
              key: sub.id,
              src: senderLogoSrc(sub.senderEmail),
              name: sub.senderName ?? sub.senderEmail,
            }))}
          />
        ),
      }}
      primaryAction={
        <button
          type="button"
          disabled={pending || !canGenerate || senders.length === 0}
          onClick={() => {
            if (!range?.from || !range.to) return;
            onGenerate({
              startDate: toYmd(range.from),
              endDate: toYmd(range.to),
            });
          }}
          className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          <span>{pending ? "Working…" : "Send"}</span>
        </button>
      }
    >
      <div className="space-y-4">
        {senders.length > 1 ? (
          <div
            className="max-h-28 overflow-y-auto rounded-lg border border-border/60 bg-muted/20"
            aria-label="Selected senders"
          >
            <ul className="divide-y divide-border/50 text-sm">
              {senders.map((sub) => (
                <li
                  key={sub.id}
                  className="flex items-center gap-2.5 px-3.5 py-2"
                >
                  <CompanyLogo
                    src={senderLogoSrc(sub.senderEmail)}
                    name={sub.senderName ?? sub.senderEmail}
                    size="sm"
                  />
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-foreground">
                      {sub.senderName ?? sub.senderEmail}
                    </span>
                    {sub.senderName ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {sub.senderEmail}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Date range · max {MAX_BRIEFING_DAYS} days
          </p>
          <div className="flex justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/20 p-2">
            <Calendar
              mode="range"
              selected={range}
              onSelect={handleSelect}
              month={month}
              onMonthChange={setMonth}
              disabled={{ after: today }}
              numberOfMonths={1}
              max={DAY_PICKER_MAX_NIGHTS}
              resetOnSelect
            />
          </div>
          {rangeWarning ? (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              {rangeWarning}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {range?.from && range?.to
              ? `${toYmd(range.from)} → ${toYmd(range.to)} · ${inclusiveDaySpan(range.from, range.to)} day${inclusiveDaySpan(range.from, range.to) === 1 ? "" : "s"}`
              : "Select a start and end date."}
          </p>
        </div>

        <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Original emails in this range will be moved to Gmail Trash after the
          snapshot is delivered.
        </p>
      </div>
    </ActionDialogShell>
  );
}
