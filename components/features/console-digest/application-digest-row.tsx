import Link from "next/link";
import type { JobApplication } from "@prisma/client";
import { CompanyLogo } from "@/components/ui/logo-frame";
import { domainFromUrl, faviconUrlForDomain } from "@/lib/utils/domain";

export function ApplicationDigestRow({ job }: { job: JobApplication }) {
  const domain = job.actionUrl ? domainFromUrl(job.actionUrl) : null;
  return (
    <Link
      href="/jobs"
      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40"
    >
      <CompanyLogo
        src={domain ? faviconUrlForDomain(domain) : null}
        name={job.companyName ?? "Company"}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {job.companyName ?? "Company"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {job.roleTitle ?? "Role"}
        </p>
      </div>
      <span className="shrink-0 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        {job.status === "OA" ? "Assessment" : "Interview"}
      </span>
    </Link>
  );
}
