const CONSUMER_MAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

/** Exact host / apex remaps for ESP and brand mail domains. */
const MARKETING_DOMAIN_MAP: Record<string, string | null> = {
  "facebookmail.com": "facebook.com",
  "ralphsemail.com": "ralphs.com",
  "dominos-pizza.com": "dominos.com",
  "e-offers.dominos.com": "dominos.com",
  "ccsend.com": null,
};

/** Common multi-part public suffixes (eTLD). */
const MULTI_PART_TLDS = new Set([
  "co.uk",
  "com.au",
  "co.jp",
  "com.br",
  "co.nz",
  "co.in",
  "com.mx",
  "co.kr",
  "com.sg",
  "org.uk",
  "ac.uk",
]);

/**
 * Extracts the apex / root domain (eTLD+1) from a hostname.
 * `em.linkedin.com` -> `linkedin.com`
 * `email.pharmacy.amazon.com` -> `amazon.com`
 * `shop.example.co.uk` -> `example.co.uk`
 */
export function extractApexDomain(hostname: string): string | null {
  const host = hostname.toLowerCase().trim().replace(/^\.+|\.+$/g, "");
  if (!host || !host.includes(".")) {
    return null;
  }

  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return lastTwo;
}

function lookupMarketingMap(host: string): string | null | undefined {
  if (Object.prototype.hasOwnProperty.call(MARKETING_DOMAIN_MAP, host)) {
    return MARKETING_DOMAIN_MAP[host];
  }
  return undefined;
}

/**
 * Sanitizes a sender email into a brandable apex domain for favicon lookup.
 * Returns `null` for consumer webmail and generic ESP hosts.
 */
export function getCleanDomain(senderEmail: string): string | null {
  const rawHost = senderEmail.split("@")[1]?.toLowerCase()?.trim();
  if (!rawHost) {
    return null;
  }

  // 2. Consumer blacklist (exact host match)
  if (CONSUMER_MAIL_DOMAINS.has(rawHost)) {
    return null;
  }

  // 3. Known email-marketing / brand mailers (exact host)
  const exactMarketing = lookupMarketingMap(rawHost);
  if (exactMarketing !== undefined) {
    return exactMarketing;
  }

  // Constant Contact and similar: any subdomain of a null-mapped ESP
  if (rawHost.endsWith(".ccsend.com")) {
    return null;
  }

  // Dominos ESP host variant covered by map; also accept *.dominos.com -> dominos.com
  if (rawHost.endsWith(".dominos.com") || rawHost === "dominos.com") {
    return "dominos.com";
  }

  // 4. Apex / eTLD+1
  const apex = extractApexDomain(rawHost);
  if (!apex) {
    return null;
  }

  if (CONSUMER_MAIL_DOMAINS.has(apex)) {
    return null;
  }

  const apexMarketing = lookupMarketingMap(apex);
  if (apexMarketing !== undefined) {
    return apexMarketing;
  }

  if (apex.endsWith(".ccsend.com") || apex === "ccsend.com") {
    return null;
  }

  return apex;
}

/**
 * Google Favicon CDN URL (high-res, no unavatar rate limits).
 */
export function faviconUrlForDomain(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}
