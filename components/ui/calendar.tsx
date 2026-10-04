"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

import "react-day-picker/style.css";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  navLayout = "around",
  components,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      {...props}
      showOutsideDays={showOutsideDays}
      navLayout={navLayout}
      className={cn("p-2", className)}
      classNames={{
        months: "relative flex flex-col gap-4 sm:flex-row",
        // Avoid space-y: it adds margin-top to later siblings, which offsets the
        // absolutely positioned next-month button below the previous button.
        month: "relative",
        month_caption:
          "relative flex h-9 items-center justify-center px-9",
        caption_label: "text-sm font-medium",
        nav: "hidden",
        button_previous:
          "absolute left-0 top-0 z-10 m-0 inline-flex size-8 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        button_next:
          "absolute right-0 top-0 z-10 m-0 inline-flex size-8 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        month_grid: "mt-3 w-full border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-[0.75rem] font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "relative size-8 p-0 text-center text-sm",
        day_button:
          "inline-flex size-8 items-center justify-center rounded-md p-0 font-normal hover:bg-muted aria-selected:opacity-100",
        selected:
          "rounded-md bg-teal-700 text-white hover:bg-teal-700 hover:text-white focus:bg-teal-700 focus:text-white",
        range_start: "rounded-l-md bg-teal-700 text-white",
        range_end: "rounded-r-md bg-teal-700 text-white",
        range_middle: "rounded-none bg-teal-700/15 text-foreground",
        today: "bg-muted text-foreground",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/30 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
        ...components,
      }}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
