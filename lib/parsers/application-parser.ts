export type ExtractedApplication = {
  company: string;
  title: string;
  location?: string | null;
  appliedDate?: Date | null;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Generic placeholder title when a confirmation omits the role name. */
export function genericRoleTitle(company: string): string {
  const cleaned = company.trim() || "Unknown Company";
  return `Role at ${cleaned}`;
}

/**
 * True for placeholder / receipt titles that should be upgraded when a
 * real role name is later extracted. Role-agnostic — no profession names.
 */
export function isGenericTitle(
  title: string | null | undefined,
  company?: string | null
): boolean {
  if (!title) return true;
  const lower = title.toLowerCase().trim();
  if (
    lower === "applied position" ||
    lower === "applicant" ||
    lower.includes("application was sent") ||
    lower === "linkedin"
  ) {
    return true;
  }
  if (company) {
    const roleAt = genericRoleTitle(company).toLowerCase();
    if (lower === roleAt) return true;
  }
  return /^role at .+/i.test(title.trim());
}

/** @deprecated Prefer isGenericTitle — kept for existing call sites. */
export function isPlaceholderTitle(
  title: string | null | undefined,
  company?: string | null
): boolean {
  return isGenericTitle(title, company);
}

/**
 * Extracts company / title / location from application confirmation emails
 * (LinkedIn Easy Apply, Greenhouse, Workday, Lever, Ashby).
 * Handles multi-line and whitespace-collapsed bodies. Fully role-agnostic.
 */
export function parseApplicationEmail(
  subject: string,
  body: string
): ExtractedApplication | null {
  const cleanSubject = subject.trim();
  const cleanBody = body.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  // --- A. LinkedIn Confirmations ---
  const linkedInMatch = cleanSubject.match(
    /(?:your application was sent to|application (?:was |has been )?sent to)\s+([^.\n\r]+)/i
  );

  if (linkedInMatch) {
    const company = linkedInMatch[1].trim();
    const escCompany = escapeRegExp(company);

    let title: string | null = null;
    let location: string | null = null;

    const postSentParts = cleanBody.split(
      new RegExp(
        `(?:your application was sent to|application was sent to)\\s+${escCompany}`,
        "i"
      )
    );

    if (postSentParts.length > 1) {
      // LinkedIn often repeats the company immediately after "sent to <Company>".
      let contentAfterSent = postSentParts[1].replace(/^[·\s\n\r]+/, "");
      contentAfterSent = contentAfterSent.replace(
        new RegExp(`^${escCompany}\\b\\s*`, "i"),
        ""
      );

      const roleParts = contentAfterSent.split(
        new RegExp(`\\b${escCompany}\\b`, "i")
      );

      if (roleParts.length >= 1) {
        const candidateTitle = roleParts[0]
          .replace(/[·\n\r]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (
          candidateTitle &&
          candidateTitle.length > 2 &&
          !candidateTitle.toLowerCase().includes("application") &&
          !/^linkedin$/i.test(candidateTitle)
        ) {
          title = candidateTitle;
        }
      }

      if (roleParts.length > 1) {
        const afterSecondCompany = roleParts[1] ?? "";
        const locMatch = afterSecondCompany.split(
          /(?:View job|Applied on|\n)/i
        )[0];
        if (locMatch) {
          const candidateLoc = locMatch
            .replace(/[·]/g, "")
            .replace(/\s+/g, " ")
            .trim();
          if (candidateLoc.length > 2) {
            location = candidateLoc;
          }
        }
      }
    }

    // Collapsed-whitespace fallback
    if (!title) {
      const collapsed = cleanBody.replace(/\s+/g, " ").trim();
      const flatMatch = new RegExp(
        `${escCompany}\\s+((?:(?!\\b${escCompany}\\b).)+?)\\s+${escCompany}\\s*(?:[·•|])?\\s*(.+?)(?=\\s+(?:View job|Applied on)\\b|$)`,
        "i"
      ).exec(collapsed);
      if (flatMatch) {
        const candidateTitle =
          flatMatch[1]?.replace(/\s+/g, " ").trim() || null;
        if (
          candidateTitle &&
          !candidateTitle.toLowerCase().includes("application")
        ) {
          title = candidateTitle;
        }
        const candidateLoc = flatMatch[2]?.replace(/\s+/g, " ").trim() || null;
        if (candidateLoc && candidateLoc.length > 2) {
          location = candidateLoc;
        }
      }
    }

    const appliedOn = cleanBody.match(
      /Applied on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i
    );
    let appliedDate: Date | null = new Date();
    if (appliedOn?.[1]) {
      const parsed = new Date(appliedOn[1]);
      if (!Number.isNaN(parsed.getTime())) {
        appliedDate = parsed;
      }
    }

    return {
      company,
      title:
        title && !isGenericTitle(title, company)
          ? title
          : genericRoleTitle(company),
      location: location || null,
      appliedDate,
    };
  }

  // --- B. Generic ATS: "Thank you for applying to [Role] at [Company]" ---
  const atsWithRoleMatch = cleanSubject.match(
    /(?:applying to|application for)\s+(.+?)\s+(?:at|with)\s+([^.\n\r-]+)/i
  );

  if (atsWithRoleMatch) {
    return {
      title: atsWithRoleMatch[1].trim(),
      company: atsWithRoleMatch[2].trim(),
      location: null,
      appliedDate: new Date(),
    };
  }

  const genericCompanyMatch = cleanSubject.match(
    /(?:thank you for applying to|application received for|applied to)\s+([^.\n\r-]+)/i
  );

  if (genericCompanyMatch) {
    const company = genericCompanyMatch[1].trim();
    return {
      company,
      title: genericRoleTitle(company),
      location: null,
      appliedDate: new Date(),
    };
  }

  return null;
}
