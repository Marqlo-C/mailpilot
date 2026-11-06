/**
 * ============================================================================
 * TRACKING URL UNWRAPPER & REDIRECT RESOLVER
 * 
 * Decoupled URL normalization utility that strips tracking redirects
 * (e.g. tgt, dest, url, redirect_url) and maps aggregator links directly
 * to their canonical ATS/job listing endpoints.
 * ============================================================================
 */

export function safeDecodeUrl(val: string): string | null {
  try {
    let current = val.trim();
    if (!current) return null;

    if (current.startsWith("//")) {
      current = "https:" + current;
    }

    // Up to 5 decode passes to unroll multi-level percent encoding (e.g. tgt=https%253A...)
    for (let i = 0; i < 5; i++) {
      if (/^https?:\/\//i.test(current)) {
        return current.replace(/^http:\/\//i, "https://");
      }
      try {
        const decoded = decodeURIComponent(current);
        if (decoded === current) break;
        current = decoded.trim();
        if (current.startsWith("//")) {
          current = "https:" + current;
        }
      } catch {
        break;
      }
    }

    if (/^https?:\/\//i.test(current)) {
      return current.replace(/^http:\/\//i, "https://");
    }
  } catch {}
  return null;
}

const PRIORITY_TRACKING_PARAMS = [
  "tgt",
  "dest",
  "url",
  "target",
  "redirect",
  "r",
  "out",
  "link",
  "to",
  "redirect_url",
  "redirect_uri",
  "destination",
  "dest_url",
  "destUrl",
  "target_url",
  "targetUrl",
  "next",
  "u",
];

/**
 * Unpacks destination target URLs from aggregator or tracking redirects.
 * Handles parameters like tgt, dest, url, target, redirect, r, out, link, to, etc.
 * and recursive redirects, upgrading any http:// targets to https://.
 */
export function unwrapTrackingUrl(urlString: string, maxDepth: number = 5): string {
  if (!urlString || typeof urlString !== "string") return "";
  let normalized = urlString.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    return "";
  }
  if (/^http:\/\//i.test(normalized)) {
    normalized = normalized.replace(/^http:\/\//i, "https://");
  }

  if (maxDepth <= 0) return normalized;

  try {
    const parsed = new URL(normalized);

    // Direct Glassdoor partner listing redirect bypass:
    // e.g. glassdoor.com/partner/jobListing.htm?...jobListingId=12345 -> https://www.glassdoor.com/job-listing/?jl=12345
    if (parsed.hostname.includes("glassdoor.com") && parsed.pathname.includes("jobListing.htm")) {
      const jlId = parsed.searchParams.get("jobListingId") || parsed.searchParams.get("jl");
      if (jlId && /^\d+$/.test(jlId)) {
        return `https://www.glassdoor.com/job-listing/?jl=${jlId}`;
      }
      const match = normalized.match(/jobListingId[=%](\d+)/i);
      if (match && match[1]) {
        return `https://www.glassdoor.com/job-listing/?jl=${match[1]}`;
      }
    }

    // Direct LinkedIn job listing normalization:
    // e.g. linkedin.com/comm/jobs/view/123?trk=... or currentJobId=123 -> https://www.linkedin.com/jobs/view/123
    if (parsed.hostname.includes("linkedin.com")) {
      const match =
        normalized.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i) ||
        normalized.match(/[?&]currentJobId=(\d+)/i);
      if (match && match[1]) {
        return `https://www.linkedin.com/jobs/view/${match[1]}`;
      }
    }

    // 1. Check known priority parameters
    for (const key of PRIORITY_TRACKING_PARAMS) {
      const val = parsed.searchParams.get(key);
      if (val) {
        const decoded = safeDecodeUrl(val);
        if (decoded && decoded !== normalized) {
          return unwrapTrackingUrl(decoded, maxDepth - 1);
        }
      }
    }

    // 2. Check hash fragments (e.g. #tgt=https%3A%2F%2F...)
    if (parsed.hash && parsed.hash.includes("=")) {
      const hashQuery = parsed.hash.replace(/^#\/?/, "");
      const hashParams = new URLSearchParams(hashQuery);
      for (const key of PRIORITY_TRACKING_PARAMS) {
        const val = hashParams.get(key);
        if (val) {
          const decoded = safeDecodeUrl(val);
          if (decoded && decoded !== normalized) {
            return unwrapTrackingUrl(decoded, maxDepth - 1);
          }
        }
      }
    }

    // 3. Scan all searchParams for any embedded http(s) URL
    for (const [, val] of parsed.searchParams.entries()) {
      if (
        val &&
        (val.includes("http%3A") ||
          val.includes("https%3A") ||
          val.includes("http%253A") ||
          val.includes("https%253A") ||
          val.startsWith("http://") ||
          val.startsWith("https://"))
      ) {
        const decoded = safeDecodeUrl(val);
        if (decoded && decoded !== normalized) {
          return unwrapTrackingUrl(decoded, maxDepth - 1);
        }
      }
    }

    // 4. Pathname regex for embedded destination URLs (e.g. /redirect/https://...)
    const pathMatch = parsed.pathname.match(/(https?[:%].*)/i);
    if (pathMatch && pathMatch[1]) {
      const decoded = safeDecodeUrl(pathMatch[1]);
      if (decoded && decoded !== normalized) {
        return unwrapTrackingUrl(decoded, maxDepth - 1);
      }
    }
  } catch {
    // If not a parseable URL, return normalized
  }

  return /^https?:\/\//i.test(normalized) ? normalized : "";
}

/**
 * Extracts numeric job ID from various LinkedIn URL formats.
 */
export function extractLinkedInJobId(urlString: string): string | null {
  if (!urlString) return null;
  const match =
    urlString.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i) ||
    urlString.match(/currentJobId=(\d+)/i) ||
    urlString.match(/jobs-guest\/jobs\/api\/jobPosting\/(\d+)/i);
  return match && match[1] ? match[1] : null;
}

/**
 * Detects LinkedIn job URLs and maps them to the public unauthenticated
 * jobs-guest API endpoint, bypassing login walls.
 */
export function transformToLinkedInGuestUrl(urlString: string): string | null {
  const jobId = extractLinkedInJobId(urlString);
  if (jobId) {
    return `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
  }
  return null;
}
