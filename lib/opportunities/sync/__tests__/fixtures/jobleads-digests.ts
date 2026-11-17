/**
 * Hermetic JobLeads digest HTML fixtures (no filesystem / Test HTML dependency).
 * Shape matches parseJobLeadsDigest Strategy 1 comment boundaries.
 */

export type JobLeadsCardFixture = {
  title: string;
  company: string;
  location: string;
  salary?: string;
  jobSlug: string;
};

function jobLeadsCardHtml(card: JobLeadsCardFixture): string {
  const salaryChip = card.salary
    ? `<td valign="top"><div>${card.salary}</div></td>`
    : "";
  return `
<!-- Job Title -->
<div>${card.title}</div>
<!-- Company Name -->
<div>${card.company}</div>
<td valign="top"><div>${card.location} | On-site</div></td>
${salaryChip}
<a href="https://www.jobleads.com/us/job/${card.jobSlug}?utm_source=email&saved_search_email_id=1&kuuid=abc">View job</a>
`.trim();
}

function digestHtml(cards: JobLeadsCardFixture[]): string {
  return `<html><body>${cards.map(jobLeadsCardHtml).join("\n")}</body></html>`;
}

/** Mirrors the five cards historically asserted from JobLeads 1.eml */
export const JOBLEADS_DIGEST_1_HTML = digestHtml([
  {
    title: "Software Engineer (Backend / Full Stack)",
    company: "Amoha Recruitment Services LLC",
    location: "Austin, TX",
    salary: "$75K-$120K",
    jobSlug: "software-engineer-backend-full-stack--austin--a1",
  },
  {
    title: "Junior Backend & Full-Stack Engineer - Launch Your Career",
    company: "Amoha Recruitment Services LLC",
    location: "Austin, TX",
    salary: "$70K-$95K",
    jobSlug: "junior-backend-full-stack--austin--a2",
  },
  {
    title: "Backend Engineer",
    company: "Evlo AI",
    location: "New York, NY",
    salary: "$120K-$170K",
    jobSlug: "backend-engineer--new-york--e1",
  },
  {
    title: "Backend Engineer",
    company: "Evlo AI",
    location: "San Francisco, CA",
    salary: "$120K-$170K",
    jobSlug: "backend-engineer--san-francisco--e2",
  },
  {
    title: "Backend Python Developer",
    company: "Emonics LLC",
    location: "Los Angeles, CA",
    salary: "$110K-$140K",
    jobSlug: "backend-python-developer--los-angeles--m1",
  },
]);

/** Mirrors the five cards historically asserted from JobLeads 2.eml */
export const JOBLEADS_DIGEST_2_HTML = digestHtml([
  {
    title: "Backend Engineer - onsite",
    company: "EliteGen Enterprise LLC",
    location: "San Francisco, CA",
    jobSlug: "backend-engineer-onsite--san-francisco--b1",
  },
  {
    title: "Backend Engineer",
    company: "Evlo AI",
    location: "Austin, TX",
    jobSlug: "backend-engineer--austin--b2",
  },
  {
    title: "Backend Developer",
    company: "Nimbus North",
    location: "San Diego, CA",
    jobSlug: "backend-developer--san-diego--b3",
  },
  {
    title: "Junior Full-Stack Engineer: Build Internal Tools (Hybrid)",
    company: "DeWinter Group",
    location: "San Francisco, CA",
    jobSlug: "junior-full-stack-engineer--san-francisco--b4",
  },
  {
    title: "Backend Engineer (Python/Java) - REST & Microservices",
    company: "Robotics Technologies LLC",
    location: "Sunnyvale, CA",
    jobSlug: "backend-engineer-python-java--sunnyvale--b5",
  },
]);
