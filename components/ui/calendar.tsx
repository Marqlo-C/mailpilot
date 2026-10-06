"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Modern range/day picker — continuous soft rail + circular endpoints.
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
      className={cn("p-1 font-sans text-foreground", className)}
      classNames={{
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "relative w-full",
        month_caption:
          "relative mb-1 flex h-10 items-center justify-center px-10",
        caption_label:
          "text-sm font-semibold tracking-tight text-foreground",
        nav: "hidden",
        button_previous:
          "absolute left-0 top-0.5 z-10 m-0 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        button_next:
          "absolute right-0 top-0.5 z-10 m-0 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        month_grid: "mt-1 w-full border-collapse",
        weekdays: "mb-1 flex",
        weekday:
          "flex h-9 w-9 items-center justify-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground/65",
        week: "mt-0.5 flex w-full",
        day: cn(
          "relative h-9 w-9 p-0 text-center text-sm",
          // Continuous range rail — lighter wash than solid endpoint dots.
          "[&:has([aria-selected])]:bg-[#e4f7f3]",
          "[&:has([aria-selected].day-range-start)]:rounded-l-full",
          "[&:has([aria-selected].day-range-end)]:rounded-r-full",
          "first:[&:has([aria-selected])]:rounded-l-full",
          "last:[&:has([aria-selected])]:rounded-r-full"
        ),
        day_button: cn(
          "relative z-[1] inline-flex size-9 items-center justify-center rounded-full p-0 text-sm font-medium text-foreground",
          "transition-colors hover:bg-muted/80",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1ab5af]/35",
          "aria-selected:opacity-100"
        ),
        selected:
          "bg-transparent [&>button]:bg-[#1ab5af] [&>button]:font-semibold [&>button]:text-white [&>button]:shadow-sm [&>button]:hover:bg-[#159e99] [&>button]:hover:text-white",
        range_start:
          "day-range-start rounded-l-full bg-[#e4f7f3] [&>button]:bg-[#1ab5af] [&>button]:font-semibold [&>button]:text-white [&>button]:shadow-sm [&>button]:hover:bg-[#159e99]",
        range_end:
          "day-range-end rounded-r-full bg-[#e4f7f3] [&>button]:bg-[#1ab5af] [&>button]:font-semibold [&>button]:text-white [&>button]:shadow-sm [&>button]:hover:bg-[#159e99]",
        range_middle:
          "bg-[#e4f7f3] text-foreground [&>button]:rounded-none [&>button]:bg-transparent [&>button]:font-medium [&>button]:text-foreground [&>button]:shadow-none [&>button]:hover:bg-[#d5f1eb]",
        today:
          "[&>button]:bg-[#1ab5af]/15 [&>button]:font-semibold [&>button]:text-[#1ab5af] aria-selected:[&>button]:bg-[#1ab5af] aria-selected:[&>button]:text-white",
        outside:
          "text-muted-foreground/35 aria-selected:bg-[#e4f7f3]/70 aria-selected:text-foreground/70",
        disabled:
          "text-muted-foreground/25 opacity-40 [&>button]:hover:bg-transparent",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" strokeWidth={2} />
          ) : (
            <ChevronRight className="size-4" strokeWidth={2} />
          ),
        ...components,
      }}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
