"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConsoleMetricItem, MetricTone } from "./metrics";

const TONE_CLASSES: Record<
  MetricTone,
  {
    iconBox: string;
    badge: string;
    accentGlow: string;
  }
> = {
  emerald: {
    iconBox:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    badge:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    accentGlow: "from-emerald-500/5",
  },
  amber: {
    iconBox:
      "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    badge:
      "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    accentGlow: "from-amber-500/5",
  },
  blue: {
    iconBox:
      "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    badge:
      "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    accentGlow: "from-sky-500/5",
  },
  rose: {
    iconBox:
      "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    badge:
      "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    accentGlow: "from-rose-500/5",
  },
  default: {
    iconBox:
      "border-border bg-muted/60 text-muted-foreground",
    badge:
      "border-border bg-muted/50 text-muted-foreground",
    accentGlow: "from-primary/5",
  },
};

export function ConsoleMetricsGrid({
  metrics,
}: {
  metrics: ConsoleMetricItem[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        const tone = metric.tone ?? "default";
        const toneStyle = TONE_CLASSES[tone];

        return (
          <Link
            key={metric.id || metric.label}
            href={metric.href}
            className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div
              className={cn(
                "relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-border/80 bg-card/70 p-4 shadow-xs backdrop-blur-xs transition-all duration-200 ease-out",
                "mp-specular-depth mp-top-lit-border",
                "hover:-translate-y-1 hover:border-primary/45 hover:bg-card/95 hover:shadow-md",
                "active:translate-y-0 active:scale-[0.98]"
              )}
            >
              {/* Subtle ambient gradient highlight in card corner */}
              <div
                className={cn(
                  "pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-xl transition-opacity group-hover:opacity-100",
                  toneStyle.accentGlow
                )}
                aria-hidden="true"
              />

              {/* Card Header: Label and Icon */}
              <div className="relative flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
                  {metric.label}
                </span>
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg border shadow-2xs transition-transform group-hover:scale-110",
                    toneStyle.iconBox
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
              </div>

              {/* Card Body: Large Tabular Metric */}
              <div className="relative my-3">
                <p className="font-brand text-3xl font-bold tracking-tight text-foreground sm:text-4xl tabular-nums">
                  {metric.value}
                </p>
              </div>

              {/* Card Footer: Hint & Visual Indicator Tag */}
              <div className="relative flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                <p className="truncate text-xs text-muted-foreground">
                  {metric.hint}
                </p>
                {metric.badge ? (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
                      toneStyle.badge
                    )}
                  >
                    {metric.badge}
                  </span>
                ) : (
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary">
                    <ArrowRight className="size-3" />
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
