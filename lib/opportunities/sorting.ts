import type { JobApplication, JobOpportunity } from "@prisma/client";

export type OpportunitySortOption =
  | "match-desc"
  | "received-desc"
  | "applied-desc"
  | "applied-asc"
  | "dismissed-desc"
  | "dismissed-asc"
  | "salary-desc"
  | "company-asc";

export type ActionRequiredSortOption =
  | "deadline-asc"
  | "recent-desc"
  | "company-asc";

export type JobsTabKey = "leads" | "applied" | "action_required" | "history";

export const TAB_SORT_CONFIG: Record<
  JobsTabKey,
  { defaultSort: string; options: { label: string; value: string }[] }
> = {
  leads: {
    defaultSort: "match-desc",
    options: [
      { label: "Best Match", value: "match-desc" },
      { label: "Newest First", value: "received-desc" },
      { label: "Highest Salary", value: "salary-desc" },
      { label: "Company (A–Z)", value: "company-asc" },
      { label: "Custom", value: "custom" },
    ],
  },
  applied: {
    defaultSort: "applied-desc",
    options: [
      { label: "Applied: Newest", value: "applied-desc" },
      { label: "Applied: Oldest (Follow-up)", value: "applied-asc" },
      { label: "Company (A–Z)", value: "company-asc" },
      { label: "Highest Salary", value: "salary-desc" },
      { label: "Custom", value: "custom" },
    ],
  },
  action_required: {
    defaultSort: "deadline-asc",
    options: [
      { label: "Deadline: Most Urgent", value: "deadline-asc" },
      { label: "Most Recent", value: "recent-desc" },
      { label: "Company (A–Z)", value: "company-asc" },
      { label: "Custom", value: "custom" },
    ],
  },
  history: {
    defaultSort: "dismissed-desc",
    options: [
      { label: "Recently Dismissed", value: "dismissed-desc" },
      { label: "Purge Imminent", value: "dismissed-asc" },
      { label: "Highest Match", value: "match-desc" },
      { label: "Company (A–Z)", value: "company-asc" },
    ],
  },
};

/** Maps Jobs Radar tab values → sort config keys. */
export function tabKeyFromValue(tab: string): JobsTabKey {
  if (tab === "action") return "action_required";
  if (tab === "applied" || tab === "history" || tab === "leads") return tab;
  return "leads";
}

export function sortOpportunities(
  items: JobOpportunity[],
  sort: string
): JobOpportunity[] {
  // Custom order is applied in the view from localStorage — keep input order.
  if (sort === "custom") return [...items];

  return [...items].sort((a, b) => {
    switch (sort) {
      case "applied-desc": {
        const dateA = new Date(a.appliedAt ?? a.receivedAt).getTime();
        const dateB = new Date(b.appliedAt ?? b.receivedAt).getTime();
        return dateB - dateA;
      }
      case "applied-asc": {
        const dateA = new Date(a.appliedAt ?? a.receivedAt).getTime();
        const dateB = new Date(b.appliedAt ?? b.receivedAt).getTime();
        return dateA - dateB;
      }
      case "dismissed-desc": {
        const dateA = new Date(a.dismissedAt ?? a.updatedAt).getTime();
        const dateB = new Date(b.dismissedAt ?? b.updatedAt).getTime();
        return dateB - dateA;
      }
      case "dismissed-asc": {
        const dateA = new Date(a.dismissedAt ?? a.updatedAt).getTime();
        const dateB = new Date(b.dismissedAt ?? b.updatedAt).getTime();
        return dateA - dateB;
      }
      case "salary-desc":
        return (b.salaryMax ?? 0) - (a.salaryMax ?? 0);
      case "company-asc":
        return a.company.localeCompare(b.company);
      case "match-desc":
        return (b.matchScore ?? 0) - (a.matchScore ?? 0);
      case "deadline-asc":
        // Opportunities have no deadline — newest received first as a stable fallback.
        return (
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        );
      case "recent-desc":
      case "received-desc":
      default:
        return (
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        );
    }
  });
}

export function sortActionRequired(
  items: JobApplication[],
  sort: string
): JobApplication[] {
  return [...items].sort((a, b) => {
    switch (sort) {
      case "deadline-asc": {
        if (!a.deadlineAt && !b.deadlineAt) return 0;
        if (!a.deadlineAt) return 1;
        if (!b.deadlineAt) return -1;
        return (
          new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime()
        );
      }
      case "company-asc":
        return (a.companyName ?? "").localeCompare(b.companyName ?? "");
      case "recent-desc":
      default:
        return (
          new Date(b.emailDate ?? b.updatedAt).getTime() -
          new Date(a.emailDate ?? a.updatedAt).getTime()
        );
    }
  });
}

/** Sort JobApplication rows on non-action tabs (applied / leads / history). */
export function sortJobApplications(
  items: JobApplication[],
  sort: string
): JobApplication[] {
  return [...items].sort((a, b) => {
    switch (sort) {
      case "applied-desc": {
        const dateA = new Date(a.appliedAt ?? a.emailDate).getTime();
        const dateB = new Date(b.appliedAt ?? b.emailDate).getTime();
        return dateB - dateA;
      }
      case "applied-asc": {
        const dateA = new Date(a.appliedAt ?? a.emailDate).getTime();
        const dateB = new Date(b.appliedAt ?? b.emailDate).getTime();
        return dateA - dateB;
      }
      case "dismissed-desc":
      case "dismissed-asc": {
        const dateA = new Date(a.updatedAt).getTime();
        const dateB = new Date(b.updatedAt).getTime();
        return sort === "dismissed-asc" ? dateA - dateB : dateB - dateA;
      }
      case "salary-desc":
        return (b.matchScore ?? 0) - (a.matchScore ?? 0);
      case "company-asc":
        return (a.companyName ?? "").localeCompare(b.companyName ?? "");
      case "match-desc":
        return (b.matchScore ?? 0) - (a.matchScore ?? 0);
      case "received-desc":
      case "recent-desc":
      default:
        return (
          new Date(b.emailDate ?? b.updatedAt).getTime() -
          new Date(a.emailDate ?? a.updatedAt).getTime()
        );
    }
  });
}
