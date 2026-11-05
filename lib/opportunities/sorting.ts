import type { JobApplication, JobOpportunity } from "@prisma/client";

export type OpportunitySortOption =
  | "match-desc"
  | "received-desc"
  | "received-asc"
  | "applied-desc"
  | "applied-asc"
  | "dismissed-desc"
  | "dismissed-asc"
  | "salary-desc"
  | "company-asc"
  | "role-asc";

export type ActionRequiredSortOption =
  | "deadline-asc"
  | "recent-desc"
  | "recent-asc"
  | "company-asc"
  | "role-asc";

export type JobsTabKey = "leads" | "applied" | "action_required" | "history";

export const TAB_SORT_CONFIG: Record<
  JobsTabKey,
  { defaultSort: string; options: { label: string; value: string }[] }
> = {
  leads: {
    defaultSort: "match-desc",
    options: [
      { label: "Best Match", value: "match-desc" },
      { label: "Newest", value: "received-desc" },
      { label: "Oldest", value: "received-asc" },
      { label: "Highest Salary", value: "salary-desc" },
      { label: "Company (A–Z)", value: "company-asc" },
      { label: "Role (A–Z)", value: "role-asc" },
    ],
  },
  applied: {
    defaultSort: "applied-desc",
    options: [
      { label: "Newest", value: "applied-desc" },
      { label: "Oldest", value: "applied-asc" },
      { label: "Best Match", value: "match-desc" },
      { label: "Highest Salary", value: "salary-desc" },
      { label: "Company (A–Z)", value: "company-asc" },
      { label: "Role (A–Z)", value: "role-asc" },
    ],
  },
  action_required: {
    defaultSort: "deadline-asc",
    options: [
      { label: "Most Urgent", value: "deadline-asc" },
      { label: "Newest", value: "recent-desc" },
      { label: "Oldest", value: "recent-asc" },
      { label: "Company (A–Z)", value: "company-asc" },
      { label: "Role (A–Z)", value: "role-asc" },
    ],
  },
  history: {
    defaultSort: "dismissed-desc",
    options: [
      { label: "Newest", value: "dismissed-desc" },
      { label: "Oldest", value: "dismissed-asc" },
      { label: "Best Match", value: "match-desc" },
      { label: "Company (A–Z)", value: "company-asc" },
      { label: "Role (A–Z)", value: "role-asc" },
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
      case "role-asc":
        return a.title.localeCompare(b.title);
      case "match-desc":
        return (b.matchScore ?? 0) - (a.matchScore ?? 0);
      case "deadline-asc":
        // Opportunities have no deadline — newest received first as a stable fallback.
        return (
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        );
      case "received-asc":
      case "recent-asc":
        return (
          new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
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
      case "role-asc":
        return (a.roleTitle ?? "").localeCompare(b.roleTitle ?? "");
      case "recent-asc":
        return (
          new Date(a.emailDate ?? a.updatedAt).getTime() -
          new Date(b.emailDate ?? b.updatedAt).getTime()
        );
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
      case "role-asc":
        return (a.roleTitle ?? "").localeCompare(b.roleTitle ?? "");
      case "match-desc":
        return (b.matchScore ?? 0) - (a.matchScore ?? 0);
      case "received-asc":
      case "recent-asc":
        return (
          new Date(a.emailDate ?? a.updatedAt).getTime() -
          new Date(b.emailDate ?? b.updatedAt).getTime()
        );
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
