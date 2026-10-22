const CORPORATE_SUFFIXES_REGEX =
  /\b(?:llc|inc|corp|corporation|technologies|technology|software|solutions|services|group|co|ltd|gmbh|holding|holdings|enterprises|partners|international|global)\b/gi;

/**
 * Strips corporate legal suffixes and cleans company name into a candidate apex domain.
 * e.g. "Walmart Global Tech" -> "walmart.com", "IBM Corp" -> "ibm.com", "Acme LLC" -> "acme.com"
 */
export function inferApexDomainFromCompanyName(companyName: string): string | null {
  if (!companyName) return null;
  const stripped = companyName
    .replace(CORPORATE_SUFFIXES_REGEX, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = stripped.split(" ").filter(Boolean);
  if (words.length === 0) {
    const rawClean = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return rawClean && rawClean.length >= 2 ? `${rawClean}.com` : null;
  }
  const base = words[0].toLowerCase();
  if (base.length < 2) return null;
  return `${base}.com`;
}

/**
 * Resolves company logo URL via a 3-tier cascade:
 * 1. Google Favicon service via explicit companyDomain, direct apply URL domain, or inferred apex domain.
 * 2. Gradient avatar URL fallback (avatar.vercel.sh) from before.
 * 3. Returns null for unknown/empty companies to allow the UI to render the native squircle gradient monogram or icon.
 */
export function getCompanyLogoUrl(
  companyName: string,
  companyDomain?: string | null,
  applyUrl?: string | null
): string | null {
  const cleanName = (companyName || "").trim();
  if (!cleanName || /^unknown(?:\s+company)?$/i.test(cleanName)) {
    return null;
  }

  // 1. Explicit domain
  const explicitDomain = (companyDomain ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (explicitDomain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(explicitDomain)) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(explicitDomain)}&sz=128`;
  }

  // 2. Direct apply URL host domain (if not a job board aggregator)
  const urlDomain = inferDomainFromUrl(applyUrl);
  if (urlDomain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(urlDomain)) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(urlDomain)}&sz=128`;
  }

  // 3. Inferred apex domain from company name (e.g. "Walmart Global Tech" -> "walmart.com")
  const inferredDomain = inferApexDomainFromCompanyName(cleanName);
  if (inferredDomain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(inferredDomain)) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(inferredDomain)}&sz=128`;
  }

  // 4. Gradient logo fallback from before
  const safeSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (safeSlug && safeSlug.length >= 1) {
    return `https://avatar.vercel.sh/${encodeURIComponent(safeSlug)}`;
  }

  return null;
}

/**
 * Returns secondary fallback logo URL when primary Google Favicon fails to load in browser.
 */
export function getCompanyLogoFallbackUrl(
  companyName: string
): string | null {
  const cleanName = (companyName || "").trim();
  if (!cleanName || /^unknown(?:\s+company)?$/i.test(cleanName)) {
    return null;
  }
  const safeSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (safeSlug && safeSlug.length >= 1) {
    return `https://avatar.vercel.sh/${encodeURIComponent(safeSlug)}`;
  }
  return null;
}

/**
 * Best-effort domain guess from an apply URL host when the LLM omitted companyDomain.
 */
export function inferDomainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (
      !host ||
      host.includes("linkedin.com") ||
      host.includes("indeed.com") ||
      host.includes("glassdoor.com") ||
      host.includes("google.com") ||
      host.includes("mailto")
    ) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

export function logoInitials(name: string): string {
  const source = (name ?? "").trim();
  if (!source || /^unknown(?:\s+company)?$/i.test(source)) return "";
  const clean = source.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
