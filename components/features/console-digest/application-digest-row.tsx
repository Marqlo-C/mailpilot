"use client";

import type { JobApplication } from "@prisma/client";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { DigestRowItem } from "./digest-row-item";
import { domainFromUrl, faviconUrlForDomain } from "@/lib/utils/domain";
import { cn } from "@/lib/utils";

export function ApplicationDigestRow({ job }: { job: JobApplication }) {
  const domain = job.actionUrl ? domainFromUrl(job.actionUrl) : null;
  const isOA = job.status === "OA";
  const hasActionUrl = Boolean(job.actionUrl);
  const actionHref = job.actionUrl || "/jobs";

  return (
    <DigestRowItem
      href="/jobs"
      logoSrc={domain ? faviconUrlForDomain(domain) : null}
      logoName={job.companyName ?? "Company"}
      title={job.companyName ?? "Company"}
      subtitle={job.roleTitle ?? "Role"}
      metricBadge={
        <span
          className={cn(
            "inline-flex h-[28px] shrink-0 items-center justify-center rounded-md border px-2 text-[11px] font-semibold",
            isOA
              ? "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "border-purple-500/25 bg-purple-500/10 text-purple-600 dark:text-purple-400"
          )}
        >
          {isOA ? "Assessment" : "Interview"}
        </span>
      }
      action={
        <Link
          href={actionHref}
          target={hasActionUrl ? "_blank" : undefined}
          rel={hasActionUrl ? "noreferrer noopener" : undefined}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-border bg-background/80 px-2.5 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-95"
          onClick={(e) => {
            e.stopPropagation();
          }}
          title={hasActionUrl ? "Open assessment/interview portal" : "Open application in Job Radar"}
        >
          <span>{isOA ? "Take OA" : "Prep"}</span>
          {hasActionUrl ? (
            <ExternalLink className="size-3" />
          ) : (
            <ArrowRight className="size-3" />
          )}
        </Link>
      }
    />
  );
}
