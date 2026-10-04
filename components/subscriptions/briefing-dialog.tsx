"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      setRangeWarning(`Maximum briefing range is ${MAX_BRIEFING_DAYS} days.`);
      return;
    }

    setRange(next);
    setRangeWarning(null);
  }

  const canGenerate = isValidBriefingRange(range?.from, range?.to);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Email Briefing</DialogTitle>
          <DialogDescription>
            Combine mail from the selected senders into one digest, then clean
            those originals from your inbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Selected senders ({senders.length})
            </p>
            <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
              {senders.map((sub) => (
                <li key={sub.id} className="truncate">
                  <span className="font-medium">
                    {sub.senderName ?? sub.senderEmail}
                  </span>
                  {sub.senderName ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {sub.senderEmail}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Date range (max {MAX_BRIEFING_DAYS} days)
            </p>
            <div className="flex justify-center rounded-xl border border-border/60 bg-card p-2">
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
            {range?.from && range?.to ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {toYmd(range.from)} → {toYmd(range.to)} ·{" "}
                {inclusiveDaySpan(range.from, range.to)} day
                {inclusiveDaySpan(range.from, range.to) === 1 ? "" : "s"}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Select a start and end date.
              </p>
            )}
          </div>

          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            Original emails will be moved to your Gmail Trash after the digest
            is delivered.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={pending || !canGenerate || senders.length === 0}
            onClick={() => {
              if (!range?.from || !range.to) return;
              onGenerate({
                startDate: toYmd(range.from),
                endDate: toYmd(range.to),
              });
            }}
            className={cn("bg-teal-700 text-white hover:bg-teal-800")}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generate Digest & Clean Inbox
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
