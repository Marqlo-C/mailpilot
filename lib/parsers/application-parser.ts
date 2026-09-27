export type ExtractedApplication = {
  company: string;
  title: string;
  location?: string | null;
  appliedDate?: Date | null;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isPlaceholderTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const lower = title.toLowerCase().trim();
  return (
    lower === "applied position" ||
    lower === "software engineer" ||
    lower.includes("application was sent") ||
    lower === "linkedin"
  );
}

/**
 * Extracts company / title / location from application confirmation emails
 * (LinkedIn Easy Apply, Greenhouse, Workday, Lever, Ashby).
 * Handles multi-line and whitespace-collapsed bodies.
 */
export function parseApplicationEmail(
  subject: string,
  body: string
): ExtractedApplication | null {
  const cleanBody = body.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  // 1. Extract Company from Subject: e.g. "Marq, your application was sent to ByteDance"
  const linkedInMatch = subject.match(
    /(?:your application was sent to|application (?:was |has been )?sent to)\s+([^.\n\r]+)/i
  );

  if (linkedInMatch) {
    const company = linkedInMatch[1].trim();
    const escCompany = escapeRegExp(company);

    let title: string | null = null;
    let location: string | null = null;

    // Split body after "your application was sent to <Company>"
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

      // Title sits before the next Company token; location after it.
      // e.g. "Backend Software Engineer - Platforms ByteDance · San Jose, CA"
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

    // Collapsed-whitespace fallback when split above missed (no second company token).
    if (!title) {
      const collapsed = cleanBody.replace(/\s+/g, " ").trim();
      const flatMatch = new RegExp(
        `${escCompany}\\s+((?:(?!\\b${escCompany}\\b).)+?)\\s+${escCompany}\\s*(?:[·•|])?\\s*(.+?)(?=\\s+(?:View job|Applied on)\\b|$)`,
        "i"
      ).exec(collapsed);
      if (flatMatch) {
        const candidateTitle = flatMatch[1]?.replace(/\s+/g, " ").trim() || null;
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
      title: title && !isPlaceholderTitle(title) ? title : "Applied Position",
      location: location || null,
      appliedDate,
    };
  }

  // 2. Generic ATS Confirmation fallback (Workday, Greenhouse, Lever)
  const genericMatch = subject.match(
    /(?:thank you for applying to|application received for|applied to)\s+([^.\n\r-]+)/i
  );
  if (genericMatch) {
    return {
      company: genericMatch[1].trim(),
      title: "Applied Position",
      location: null,
      appliedDate: new Date(),
    };
  }

  return null;
}
