"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Modern range/day picker — continuous soft rail + squircle endpoints
 * (same rounded-xl radius as LogoFrame lg).
 * No DayPicker default stylesheet (avoids purple accent / foreign fonts).
 * Teal matches the toolbar slider (`#1ab5af`).
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  /** Always reserve 6 week rows so month navigation does not resize the dialog. */
  fixedWeeks = true,
  navLayout = "around",
  components,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      {...props}
      showOutsideDays={showOutsideDays}
      fixedWeeks={fixedWeeks}
      navLayout={navLayout}
      className={cn("w-full p-1 font-sans text-foreground", className)}
      classNames={{
        months: "relative flex w-full flex-col gap-6 sm:flex-row sm:gap-8",
        month: "relative min-w-0 flex-1",
        month_caption:
          "relative mb-2 flex h-11 items-center justify-center px-11",
        caption_label:
          "text-base font-semibold tracking-tight text-foreground",
        nav: "hidden",
        button_previous:
          "absolute left-0 top-0.5 z-10 m-0 inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        button_next:
          "absolute right-0 top-0.5 z-10 m-0 inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        month_grid: "mt-1 w-full border-collapse",
        weekdays: "mb-1.5 flex w-full",
        weekday:
          "flex h-10 flex-1 items-center justify-center text-xs font-medium uppercase tracking-wide text-muted-foreground/65",
        week: "mt-1 flex w-full",
        day: cn(
          "relative flex h-11 flex-1 items-center justify-center p-0 text-center text-base",
          // Continuous range rail — lighter wash than solid endpoint marks.
          "[&:has([aria-selected])]:bg-[#e4f7f3]",
          "[&:has([aria-selected].day-range-start)]:rounded-l-xl",
          "[&:has([aria-selected].day-range-end)]:rounded-r-xl",
          "first:[&:has([aria-selected])]:rounded-l-xl",
          "last:[&:has([aria-selected])]:rounded-r-xl"
        ),
        day_button: cn(
          "relative z-[1] inline-flex size-10 items-center justify-center rounded-xl p-0 text-base font-medium text-foreground",
          "transition-colors hover:bg-muted/80",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1ab5af]/35",
          "aria-selected:opacity-100"
        ),
        selected:
          "[&>button]:bg-[#1ab5af] [&>button]:font-semibold [&>button]:text-white [&>button]:shadow-sm [&>button]:hover:bg-[#159e99] [&>button]:hover:text-white",
        range_start:
          "day-range-start rounded-l-xl bg-[#e4f7f3] [&>button]:bg-[#1ab5af] [&>button]:font-semibold [&>button]:text-white [&>button]:shadow-sm [&>button]:hover:bg-[#159e99]",
        range_end:
          "day-range-end rounded-r-xl bg-[#e4f7f3] [&>button]:bg-[#1ab5af] [&>button]:font-semibold [&>button]:text-white [&>button]:shadow-sm [&>button]:hover:bg-[#159e99]",
        range_middle:
          "bg-[#e4f7f3] text-foreground [&>button]:rounded-none [&>button]:!bg-[#e4f7f3] [&>button]:!font-medium [&>button]:!text-foreground [&>button]:!shadow-none [&>button]:hover:!bg-[#d5f1eb]",
        today:
          "[&>button]:bg-[#1ab5af]/15 [&>button]:font-semibold [&>button]:text-[#1ab5af] aria-selected:[&>button]:bg-[#1ab5af] aria-selected:[&>button]:text-white",
        outside:
          "pointer-events-none text-muted-foreground/35 aria-selected:bg-transparent aria-selected:[&>button]:!bg-transparent aria-selected:[&>button]:!text-muted-foreground/35 aria-selected:[&>button]:!shadow-none",
        disabled:
          "text-muted-foreground/25 opacity-40 [&>button]:hover:bg-transparent",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-5" strokeWidth={2} />
          ) : (
            <ChevronRight className="size-5" strokeWidth={2} />
          ),
        ...components,
      }}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
