/// <reference types="chrome" />
import type { ExtractedJobContext } from "../lib/types";
import {
  cleanTitleAndCompany,
  isValidCompanyName,
} from "@/lib/opportunities/context/section-classifier";
import { normalizeSalaryDisplay, extractSalaryFromText } from "@/lib/ai/classifier";
import {
  standardizeLocation,
  parseLocation,
  extractLocationFromText,
} from "@/lib/utils/location";
import { relativeTimeToIso } from "@/lib/opportunities/context/lens";
import { SITE_SELECTORS } from "./ats/site-selectors";
import { findJsonLdJobPosting } from "./ats/json-ld";
import { extractIndeedJobContext } from "./ats/indeed";
import {
  cleanText,
  cleanDescription,
  getActiveContentRoot,
  queryFirstText,
  queryLocationText,
  queryDatePostedText,
  querySalaryText,
  matchSite,
  queryFirstImageSrc,
  queryFirstHref,
  queryFirstDescription,
  extractMeta,
} from "./ats/dom-helpers";

export { extractIndeedJobContext };

/**
 * Universal job context extractor executed in the browser context.
 */
export function extractJobContextFromDocument(
  doc?: Document,
  url?: string
): ExtractedJobContext {
  const targetDoc = doc || (typeof document !== "undefined" ? document : null);
  if (!targetDoc) {
    return {
      title: "Job Opportunity",
      company: "Company",
      description: "",
      url: url || "",
      source: "Unknown",
      extractedAt: new Date().toISOString(),
    };
  }

  const currentUrl = url || (typeof window !== "undefined" ? window.location.href : "");

  // Dedicated Indeed flow: completely isolated from other job platforms
  const isIndeed =
    /indeed\.com/i.test(currentUrl) ||
    /indeed\.com/i.test(targetDoc.title) ||
    targetDoc.querySelector(
      "[data-testid='vj-job-title'], [data-testid='jobDetailTitle'], #jobsearch-ViewjobPaneWrapper, [data-testid='jobsearch-CompanyAvatarImage']"
    ) !== null;

  if (isIndeed) {
    return extractIndeedJobContext(targetDoc, currentUrl);
  }

  // 1. Identify active content container (modal / split-pane / main document)
  const activeRoot = getActiveContentRoot(targetDoc);
  const isIsolatedRoot = activeRoot !== targetDoc.body && activeRoot !== targetDoc.documentElement;

  // 2. Try JSON-LD first (highest fidelity on ATS platforms)
  const jsonLd = findJsonLdJobPosting(activeRoot) || findJsonLdJobPosting(targetDoc);

  // 3. Check site-specific selectors inside the active root container
  const matchedSite = SITE_SELECTORS.find((s) => matchSite(s, currentUrl, targetDoc));
  let domTitle = "";
  let domCompany = "";
  let domLocation = "";
  let domSalary = "";
  let domDescription = "";
  let domDatePosted = "";
  let domLogoUrl: string | undefined;
  let domJobLink: string | undefined;

  if (matchedSite) {
    domTitle = queryFirstText(activeRoot, matchedSite.title) || (isIsolatedRoot ? "" : queryFirstText(targetDoc, matchedSite.title));
    domCompany = queryFirstText(activeRoot, matchedSite.company) || (isIsolatedRoot ? "" : queryFirstText(targetDoc, matchedSite.company));
    if (!isValidCompanyName(domCompany)) domCompany = "";

    domLocation = queryLocationText(activeRoot, matchedSite.location) || (isIsolatedRoot ? "" : queryLocationText(targetDoc, matchedSite.location));
    domSalary = querySalaryText(activeRoot, matchedSite.salary) || (isIsolatedRoot ? "" : querySalaryText(targetDoc, matchedSite.salary));
    domDescription = queryFirstDescription(activeRoot, matchedSite.description) || (isIsolatedRoot ? "" : queryFirstDescription(targetDoc, matchedSite.description));
    if (matchedSite.datePosted) {
      domDatePosted = queryDatePostedText(activeRoot, matchedSite.datePosted) || (isIsolatedRoot ? "" : queryDatePostedText(targetDoc, matchedSite.datePosted));
    }
    if (matchedSite.logoUrl) {
      domLogoUrl = queryFirstImageSrc(activeRoot, matchedSite.logoUrl) || (isIsolatedRoot ? undefined : queryFirstImageSrc(targetDoc, matchedSite.logoUrl));
    }
    if (matchedSite.jobLink) {
      domJobLink = queryFirstHref(activeRoot, matchedSite.jobLink) || (isIsolatedRoot ? undefined : queryFirstHref(targetDoc, matchedSite.jobLink));
    }
  }

  if (!domLogoUrl) {
    const ogImage = targetDoc.querySelector("meta[property='og:image'], meta[name='twitter:image']")?.getAttribute("content");
    if (ogImage && /^https?:\/\//i.test(ogImage) && !/default|share-logo|glassdoor|indeed|linkedin/i.test(ogImage)) {
      domLogoUrl = ogImage;
    }
  }

  // 3a. Glassdoor split-pane direct listing URL resolution
  if (matchedSite?.source === "Glassdoor" && (!domJobLink || !domJobLink.includes("/job-listing/"))) {
    const jlid =
      activeRoot.querySelector("[data-brandviews*='jlid=']")?.getAttribute("data-brandviews")?.match(/jlid=(\d+)/)?.[1] ||
      activeRoot.querySelector("[id^='jd-job-title-']")?.id?.match(/jd-job-title-(\d+)/)?.[1] ||
      activeRoot.innerHTML?.match(/\bjlid=(\d+)/)?.[1] ||
      currentUrl.match(/[?&]jl=(\d+)/)?.[1];
    if (jlid) {
      const directAnchor = (targetDoc.querySelector(`[class*='selected'] a[href*='job-listing'], a[href*='${jlid}']`) || targetDoc.querySelector(`a[href*='${jlid}']`)) as HTMLAnchorElement | null;
      const directHref = directAnchor?.getAttribute("href");
      if (directHref && /^https?:\/\//i.test(directHref)) {
        domJobLink = directHref;
      } else {
        domJobLink = `https://www.glassdoor.com/job-listing/?jl=${jlid}`;
      }
    }
  }

  // 3a1. JobLeads direct listing URL resolution
  if (matchedSite?.source === "JobLeads") {
    const canonical = targetDoc.querySelector("link[rel='canonical']")?.getAttribute("href");
    if (canonical && /jobleads\.com\/[a-z]{2}\/job\//i.test(canonical)) {
      domJobLink = canonical;
    } else if (currentUrl && /jobleads\.com\/[a-z]{2}\/job\//i.test(currentUrl) && !currentUrl.includes("?from=")) {
      domJobLink = currentUrl;
    } else if (!domJobLink || !domJobLink.includes("/job/")) {
      const activeCardLink = targetDoc.querySelector("[data-active='true'] a[href*='/job/'], [data-active='true'] [data-testid='search-job-card-link'], [data-testid='job-preview-card'] a[href*='/job/']") as HTMLAnchorElement | null;
      const href = activeCardLink?.getAttribute("href");
      if (href && !href.includes("from=")) {
        domJobLink = href.startsWith("http") ? href : `https://www.jobleads.com${href}`;
      }
    }
  }

  // 3a2. Monster split-pane direct listing URL resolution
  if (matchedSite?.source === "Monster" && (!domJobLink || !domJobLink.includes("/job-openings/"))) {
    const directAnchor = (activeRoot.querySelector("a[href*='/job-openings/']") || targetDoc.querySelector("#BigJobCardId a[href*='/job-openings/']")) as HTMLAnchorElement | null;
    const href = directAnchor?.getAttribute("href");
    if (href) {
      domJobLink = href.startsWith("http") ? href : `https://www.monster.com${href}`;
    }
  }

  // 3b. ZipRecruiter right-pane employer link or slug fallback
  if (matchedSite?.source === "ZipRecruiter" && (!domCompany || !isValidCompanyName(domCompany))) {
    const zrCoLink = (activeRoot.querySelector("a[href*='/co/']") || targetDoc.querySelector("[data-testid='right-pane'] a[href*='/co/']") || targetDoc.querySelector("a[href*='/co/']")) as HTMLAnchorElement | null;
    if (zrCoLink) {
      const linkText = cleanText(zrCoLink.textContent);
      if (isValidCompanyName(linkText)) {
        domCompany = linkText;
      } else {
        const href = zrCoLink.getAttribute("href") || "";
        const m = href.match(/\/co\/([^\/?#\s]+)/i);
        if (m) {
          const slug = m[1].replace(/[-_]+/g, " ").trim();
          if (isValidCompanyName(slug)) domCompany = slug;
        }
      }
    }
  }

  // 3b. JobLeads meta description fallback if company missing
  if ((!domCompany || !isValidCompanyName(domCompany)) && /jobleads\.com/i.test(currentUrl + targetDoc.title)) {
    const metaDesc = extractMeta(targetDoc, "description") || extractMeta(targetDoc, "og:description");
    const hiringMatch = metaDesc.match(/^([A-Za-z0-9&.,' -]+?)\s+is hiring\b/i);
    if (hiringMatch && isValidCompanyName(hiringMatch[1])) {
      domCompany = cleanText(hiringMatch[1]);
    }
  }

  // 3b. Universal inline fallbacks for platform job postings that format metadata in text/HTML:
  // e.g. "Company: Isabella Marketing Solutions", "Location: West Hollywood, CA", "Compensation: Base Pay..."
  if (!domCompany || !isValidCompanyName(domCompany)) {
    const inlineComp =
      activeRoot.innerHTML?.match(/<b>\s*<strong>\s*Company:\s*<\/strong>\s*<\/b>\s*([A-Za-z0-9&.,' -]+?)(?:<p|<br|<\/div|<\/p)/i) ||
      activeRoot.textContent?.match(/\bCompany:\s*([A-Za-z0-9&.,' -]{2,60})/i);
    if (inlineComp && isValidCompanyName(inlineComp[1])) {
      domCompany = cleanText(inlineComp[1]);
    }
  }

  if (!domLocation) {
    const inlineLoc =
      activeRoot.innerHTML?.match(/<b>\s*<strong>\s*Location:\s*<\/strong>\s*<\/b>\s*([A-Za-z0-9&.,' -]+?)(?:<p|<br|<\/div|<\/p)/i) ||
      activeRoot.textContent?.match(/\bLocation:\s*([A-Za-z0-9&.,' -]{2,60})/i);
    if (inlineLoc) {
      domLocation = cleanText(inlineLoc[1]);
    }
  }

  if (!domSalary) {
    const inlineSal =
      activeRoot.innerHTML?.match(/<b>\s*<strong>\s*(?:Compensation|Base Pay|Salary|Pay):\s*<\/strong>\s*<\/b>\s*([^\n<]+)/i) ||
      activeRoot.textContent?.match(/\b(?:Compensation|Base Pay|Salary Range|Pay Range):\s*([^\n]+)/i);
    if (inlineSal) {
      domSalary = cleanText(inlineSal[1]);
    }
  }

  // 4. Safe metadata fallbacks (never fall back to aggregator og:site_name as employer)
  const metaTitle =
    extractMeta(targetDoc, "og:title") ||
    extractMeta(targetDoc, "twitter:title") ||
    cleanText(targetDoc.title);
  const metaDescription =
    extractMeta(targetDoc, "og:description") ||
    extractMeta(targetDoc, "description");
  const metaSiteName = extractMeta(targetDoc, "og:site_name");
  const isAggregatorSite = /linkedin|indeed|glassdoor|ziprecruiter/i.test(currentUrl);
  const safeMetaCompany = isAggregatorSite ? "" : metaSiteName;

  // 5. Synthesize candidate values
  const candidateTitle = jsonLd?.title || domTitle || metaTitle;
  const candidateCompany = (isValidCompanyName(jsonLd?.company) ? jsonLd?.company : "") || (isValidCompanyName(domCompany) ? domCompany : "") || (isValidCompanyName(safeMetaCompany) ? safeMetaCompany : "");

  const cleanedMeta = cleanTitleAndCompany(candidateTitle, candidateCompany);
  let title = cleanedMeta.title;
  let company = isValidCompanyName(cleanedMeta.company) ? cleanedMeta.company : "";

  if (!company && title.includes(" at ")) {
    const parts = title.split(" at ");
    title = parts[0]?.trim() ?? title;
    const atComp = parts[1]?.trim() ?? "";
    if (isValidCompanyName(atComp)) company = atComp;
  }

  const hasRichHtml = (str?: string) => /<(?:p|h[1-6]|ul|ol|li|strong|b|br|div)\b/i.test(str || "");

  // 6. Resolve Description
  const rawDescriptionCandidate =
    (jsonLd?.description && hasRichHtml(jsonLd.rawDescription))
      ? jsonLd.description
      : (domDescription && (hasRichHtml(domDescription) || !jsonLd?.description || !hasRichHtml(jsonLd.rawDescription)))
      ? domDescription
      : jsonLd?.description ||
        domDescription ||
        (activeRoot !== targetDoc.body && activeRoot.textContent ? cleanDescription(activeRoot.innerHTML || activeRoot.textContent) : "") ||
        (metaDescription ? cleanDescription(metaDescription) : "") ||
        (targetDoc.body?.innerText ? cleanDescription(targetDoc.body.innerText.slice(0, 4000)) : "");

  const description = cleanDescription(rawDescriptionCandidate);

  // 7. Standardize Location
  let resolvedLocationRaw: string | undefined;
  const jsonLdLoc = jsonLd?.location;
  const jsonLdParsed = jsonLdLoc ? parseLocation(jsonLdLoc) : null;
  const domLocParsed = domLocation ? parseLocation(domLocation) : null;

  if (jsonLdParsed?.state) {
    resolvedLocationRaw = jsonLdLoc;
  } else if (domLocParsed?.state) {
    resolvedLocationRaw = domLocation;
  } else if (jsonLdLoc) {
    resolvedLocationRaw = jsonLdLoc;
  } else if (domLocation) {
    resolvedLocationRaw = domLocation;
  }

  let location = standardizeLocation(resolvedLocationRaw);

  if (location) {
    const currentParsed = parseLocation(location);
    if (!currentParsed.state && currentParsed.city && description) {
      const descLoc = extractLocationFromText(description);
      if (descLoc.state && descLoc.city.toLowerCase() === currentParsed.city.toLowerCase()) {
        location = standardizeLocation(`${currentParsed.city}, ${descLoc.state}`);
      }
    }
  } else if (description) {
    const descLoc = extractLocationFromText(description);
    if (descLoc.city && descLoc.state) {
      location = standardizeLocation(`${descLoc.city}, ${descLoc.state}`);
    } else if (descLoc.isRemote) {
      location = "Remote";
    }
  }

  // 8. Standardize Salary
  const rawSalary = jsonLd?.salary || domSalary || undefined;
  let salary = rawSalary ? (normalizeSalaryDisplay(rawSalary) ?? rawSalary) : undefined;
  if (!salary && description) {
    const extracted = extractSalaryFromText(description);
    if (extracted) salary = extracted;
  }

  // 9. Date Posted
  const rawDate = jsonLd?.datePosted || (domDatePosted ? domDatePosted : undefined);
  const datePosted = rawDate ? (relativeTimeToIso(rawDate) || rawDate) : undefined;

  // 10. Direct Logo URL
  const logoUrl = jsonLd?.logoUrl || domLogoUrl || undefined;

  // 11. Canonical Job URL
  let resolvedUrl = domJobLink || jsonLd?.url || currentUrl;
  const canonical = targetDoc.querySelector("link[rel='canonical']")?.getAttribute("href") || "";
  if (/glassdoor\.com/i.test(currentUrl)) {
    const activeJlid = (activeRoot.querySelector("[id^='jd-job-title-'], [id^='jd-salary-']")?.id || "").match(/\d{10,}/)?.[0];
    if (activeJlid) {
      const activeAnchor = targetDoc.querySelector(`a[href*='${activeJlid}']`) as HTMLAnchorElement | null;
      if (activeAnchor?.href) resolvedUrl = activeAnchor.href;
      else resolvedUrl = `https://www.glassdoor.com/job-listing/?jl=${activeJlid}`;
    } else if (canonical && /glassdoor\.com\/job-listing\//i.test(canonical)) {
      resolvedUrl = canonical;
    }
  } else if (/monster\.com/i.test(currentUrl)) {
    if (canonical && /monster\.com\/job-openings\//i.test(canonical)) {
      resolvedUrl = canonical;
    }
  } else if (/jobleads\.com/i.test(currentUrl)) {
    if (canonical && /jobleads\.com\/[a-z]{2}\/job\//i.test(canonical)) {
      resolvedUrl = canonical;
    } else if (resolvedUrl.includes("?from=") && currentUrl && !currentUrl.includes("?from=")) {
      resolvedUrl = currentUrl;
    }
  }

  if (resolvedUrl.startsWith("//")) {
    resolvedUrl = `https:${resolvedUrl}`;
  } else if (resolvedUrl.startsWith("/")) {
    try {
      const origin = currentUrl ? new URL(currentUrl).origin : "";
      if (origin) resolvedUrl = `${origin}${resolvedUrl}`;
    } catch {}
  }
  const source = matchedSite?.source || jsonLd?.source || "Generic Web";

  return {
    title: title || "Job Opportunity",
    company: company || "Company",
    description: description || "",
    url: resolvedUrl,
    location,
    salary,
    datePosted,
    logoUrl,
    source,
    extractedAt: new Date().toISOString(),
  };
}

if (typeof window !== "undefined" && typeof chrome !== "undefined" && chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type === "EXTRACT_JOB_CONTEXT") {
      const result = extractJobContextFromDocument(document, window.location.href);
      sendResponse({ ok: true, data: result });
    }
    return true;
  });
}
