/**
 * Zero-token company logo resolution via public favicon services.
 * Never calls an LLM — domain inference belongs upstream.
 */
export function getCompanyLogoUrl(
  companyName: string,
  companyDomain?: string | null
): string {
  const domain = (companyDomain ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  }

  const cleanName = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const fallback = `https://avatar.vercel.sh/${encodeURIComponent(cleanName || "company")}`;
  if (!cleanName) {
    return fallback;
  }
  return `https://unavatar.io/${cleanName}.com?fallback=${encodeURIComponent(fallback)}`;
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
