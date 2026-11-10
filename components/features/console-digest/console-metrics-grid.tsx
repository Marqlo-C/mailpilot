import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import type { ConsoleMetricItem } from "./metrics";

export function ConsoleMetricsGrid({
  metrics,
}: {
  metrics: ConsoleMetricItem[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Link key={metric.label} href={metric.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardDescription>{metric.label}</CardDescription>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-tight">
                  {metric.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {metric.hint}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
