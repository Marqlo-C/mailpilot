import type { JobApplication } from "@prisma/client";
import { DigestRowItem } from "./digest-row-item";
import { domainFromUrl, faviconUrlForDomain } from "@/lib/utils/domain";

export function ApplicationDigestRow({ job }: { job: JobApplication }) {
  const domain = job.actionUrl ? domainFromUrl(job.actionUrl) : null;
  return (
    <DigestRowItem
      href="/jobs"
      logoSrc={domain ? faviconUrlForDomain(domain) : null}
      logoName={job.companyName ?? "Company"}
      title={job.companyName ?? "Company"}
      subtitle={job.roleTitle ?? "Role"}
      metricBadge={
        <span className="shrink-0 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          {job.status === "OA" ? "Assessment" : "Interview"}
        </span>
      }
    />
  );
}
