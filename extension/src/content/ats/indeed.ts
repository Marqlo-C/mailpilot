import type { ExtractedJobContext } from "../../lib/types";
import {
  cleanText,
  cleanDescription,
  extractImageSrc,
  queryFirstImageSrc,
  queryFirstText,
} from "./dom-helpers";
import { isValidCompanyName } from "@/lib/opportunities/context/section-classifier";
import { standardizeLocation } from "@/lib/utils/location";
import { normalizeSalaryDisplay, extractSalaryFromText } from "@/lib/ai/classifier";
import { relativeTimeToIso } from "@/lib/opportunities/context/lens";

/**
 * Dedicated job context extractor for Indeed postings in the Chrome companion.
 * Handles dual-pane SERP (#jobsearch-ViewjobPaneWrapper), company /cmp/ pages, and single-pane viewjob.
 * Completely decoupled from all other platforms.
 */
export function extractIndeedJobContext(
  doc: Document,
  url: string = ""
): ExtractedJobContext {
  const currentUrl = url || (typeof window !== "undefined" ? window.location.href : "");

  // 1. Determine active root container (e.g. split pane #jobsearch-ViewjobPaneWrapper or full doc)
  const pane = doc.querySelector("#jobsearch-ViewjobPaneWrapper") || doc;

  // 2. Title
  let title = "";
  const titleEl = pane.querySelector(
    "[data-testid='vj-job-title'], [data-testid='jobDetailTitle'] h3, [data-testid='jobDetailTitle'], [data-testid='jobsearch-JobInfoHeader-title'], .jobsearch-JobInfoHeader-title"
  );
  if (titleEl) {
    const raw = cleanText(titleEl.textContent);
    if (raw && !/\$|\/Hr|\/yr|\b(?:an?\s*hour|a\s*year|full-time|part-time)\b/i.test(raw)) {
      title = raw;
    }
  }

  if (!title) {
    const activeCard = doc.querySelector("[aria-pressed='true'] [id^='jobTitle-'], [data-active='true'] [id^='jobTitle-']");
    if (activeCard?.textContent) {
      const raw = cleanText(activeCard.textContent);
      if (raw && !/\$|\/Hr|\/yr/i.test(raw)) title = raw;
    }
  }

  if (!title && doc.title) {
    const cleaned = doc.title
      .replace(/\s*-\s*[A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?\s*-\s*Indeed\.com$/i, "")
      .replace(/\s*\|\s*Indeed\.com$/i, "")
      .replace(/\s*-\s*Indeed\.com$/i, "")
      .trim();
    if (cleaned && !/jobs?|search/i.test(cleaned) && !/\$|\/Hr|\/yr/i.test(cleaned)) {
      title = cleaned;
    }
  }

  // 3. Company & Location via Subtitle
  let company = "";
  let location: string | undefined;

  const cmpSubtitle = pane.querySelector("[data-testid='jobDetailSubtitle']") || doc.querySelector("[data-testid='jobDetailSubtitle']");
  if (cmpSubtitle?.textContent) {
    const rawSub = cleanText(cmpSubtitle.textContent);
    const parts = rawSub.split(/\s*-\s*/);
    if (parts.length >= 2) {
      if (isValidCompanyName(parts[0])) company = parts[0].trim();
      const locCandidate = parts.slice(1).join(" - ").trim();
      location = standardizeLocation(locCandidate) || locCandidate;
    } else if (isValidCompanyName(rawSub)) {
      company = rawSub;
    }
  }

  if (!company) {
    const cmpLink =
      pane.querySelector("a[href*='/cmp/'][aria-label]") ||
      doc.querySelector("a[href*='/cmp/'][aria-label]") ||
      pane.querySelector("a[href*='/cmp/']") ||
      doc.querySelector("a[href*='/cmp/']");
    if (cmpLink) {
      const rawLabel = cmpLink.getAttribute("aria-label")?.replace(/\s*\(opens in a new tab\)/i, "").trim();
      if (rawLabel && isValidCompanyName(rawLabel) && !/^(snapshot|reviews|salaries|jobs)$/i.test(rawLabel)) {
        company = rawLabel;
      } else {
        const text = cleanText(cmpLink.textContent);
        if (isValidCompanyName(text) && !/^(snapshot|reviews|salaries|jobs)$/i.test(text)) company = text;
      }
    }
  }

  if (!company) {
    company =
      queryFirstText(pane, [
        "[data-testid='inlineHeader-companyName']",
        "[data-testid='company-info-metadata'] a",
      ]) || "";
    if (!isValidCompanyName(company)) company = "";
  }

  if (!company) {
    const bannerImg =
      pane.querySelector("img[alt*='logo'][data-testid='company-banner'], img[alt*='logo'][data-testid='company-logo']") ||
      doc.querySelector("img[alt*='logo'][data-testid='company-banner'], img[alt*='logo'][data-testid='company-logo']");
    if (bannerImg) {
      const alt = bannerImg.getAttribute("alt") || "";
      const m = alt.match(/^(.+?)\s+logo$/i);
      if (m && isValidCompanyName(m[1])) company = m[1].trim();
    }
  }

  if (!company) {
    const explicitScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    const scripts =
      explicitScripts.length > 0
        ? explicitScripts
        : Array.from(doc.querySelectorAll("script")).filter((s) =>
            /application\/ld\+json/i.test(s.getAttribute("type") || "")
          );
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent || "");
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const it of items) {
          if ((it["@type"] === "LocalBusiness" || it["@type"] === "Organization") && typeof it.name === "string") {
            if (isValidCompanyName(it.name)) {
              company = it.name.trim();
              break;
            }
          }
        }
      } catch {}
      if (company) break;
    }
  }

  if (!company && doc.title) {
    const m = doc.title.match(/^([A-Za-z0-9&.,' -]+?)\s+Jobs\s+in\s+/i);
    if (m && isValidCompanyName(m[1])) {
      company = m[1].trim();
    }
  }

  // 4. Location
  if (!location) {
    const cmpMeta = pane.querySelector("[data-testid='company-info-metadata']");
    if (cmpMeta) {
      const leafElements = Array.from(cmpMeta.querySelectorAll("div, span")).filter(
        (el) => el.children.length === 0 && !el.closest("a")
      );
      for (const el of leafElements) {
        const txt = cleanText(el.textContent);
        if (!txt || txt === "·" || txt === "•" || /^\d+\.\d+$/.test(txt)) continue;
        if (company && (txt.toLowerCase() === company.toLowerCase() || txt.includes(company))) continue;
        if (/[A-Za-z\s.'-]+,\s*[A-Z]{2}(?:\s+\d{5})?/.test(txt) || /^(?:Remote|Hybrid|[A-Z][a-z]+)$/i.test(txt)) {
          const std = standardizeLocation(txt);
          location = std || txt;
          break;
        }
      }
    }
  }

  if (!location) {
    const locEl =
      pane.querySelector("[data-testid='inlineHeader-companyLocation']") ||
      pane.querySelector("[data-testid='jobsearch-JobInfoHeader-companyLocation']") ||
      doc.querySelector("[data-testid='inlineHeader-companyLocation']") ||
      doc.querySelector("[data-testid='jobsearch-JobInfoHeader-companyLocation']");
    if (locEl?.textContent) {
      const locText = cleanText(locEl.textContent);
      if (locText !== "·" && locText !== "•" && locText.length > 1 && locText !== company) {
        const dotIdx = locText.search(/·|•|\bRemote\b/i);
        const cityPart = dotIdx !== -1 ? locText.slice(0, dotIdx).trim() : locText;
        const isRemote = /remote|work from home|wfh/i.test(locText);
        const std = standardizeLocation(cityPart);
        location = std ? (isRemote && !std.includes("Remote") ? `${std} (Remote)` : std) : locText;
      }
    }
  }

  if (!location && doc.title) {
    const titleWithoutIndeed = doc.title.replace(/\s*-\s*Indeed\.com$/i, "").trim();
    const titleParts = titleWithoutIndeed.split(/\s*-\s*/);
    const lastPart = titleParts[titleParts.length - 1]?.trim();
    if (lastPart && lastPart !== title && !/jobs?|search/i.test(lastPart)) {
      const std = standardizeLocation(lastPart);
      if (std) location = std;
    }
  }

  if (!location) {
    const candidateEls = Array.from(pane.querySelectorAll("div.css-146c3p1, span.css-146c3p1")).filter(
      (el) => el.children.length === 0 && !el.closest("a")
    );
    for (const el of candidateEls) {
      const txt = cleanText(el.textContent);
      if (company && txt.toLowerCase() === company.toLowerCase()) continue;
      if (/[A-Za-z\s.'-]+,\s*[A-Z]{2}(?:\s+\d{5})?/.test(txt) && !/\$|hour|year|full-time|apply/i.test(txt)) {
        const std = standardizeLocation(txt);
        if (std) {
          location = std;
          break;
        }
      }
    }
  }

  if (location && company && (location.toLowerCase() === company.toLowerCase() || location === company)) {
    location = undefined;
  }

  // 5. Salary
  let salary: string | undefined;
  if (cmpSubtitle) {
    const span = cmpSubtitle.parentElement?.querySelector("span:not([data-testid='jobDetailSubtitle'])");
    if (span?.textContent && /\$/.test(span.textContent)) {
      salary = normalizeSalaryDisplay(span.textContent) || cleanText(span.textContent);
    }
  }

  if (!salary) {
    const salEl =
      pane.querySelector("[data-testid='jobsearch-JobInfoHeader-salary']") ||
      pane.querySelector("[data-testid='jobDetailSubtitle'] ~ span") ||
      pane.querySelector("span.css-1o18umh") ||
      doc.querySelector("[data-testid='jobDetailSubtitle'] ~ span") ||
      doc.querySelector("span.css-1o18umh") ||
      pane.querySelector("#salaryInfoAndJobType");
    if (salEl?.textContent && /\$/.test(salEl.textContent)) {
      salary = normalizeSalaryDisplay(salEl.textContent) || cleanText(salEl.textContent);
    }
  }

  if (!salary) {
    const allSpans = Array.from(pane.querySelectorAll("div, span")).filter((el) => el.children.length === 0);
    for (const el of allSpans) {
      const text = cleanText(el.textContent);
      if (/\$\d+/.test(text) && /\b(?:an?\s*(?:hour|yr|year|month)|hr|from\s*\$|to\s*\$|a\s*year)\b/i.test(text)) {
        salary = normalizeSalaryDisplay(text) || text;
        break;
      }
    }
  }

  // 6. Logo URL
  let logoUrl: string | undefined;
  const explicitScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  const jsonLdScripts =
    explicitScripts.length > 0
      ? explicitScripts
      : Array.from(doc.querySelectorAll("script")).filter((s) =>
          /application\/ld\+json/i.test(s.getAttribute("type") || "")
        );
  for (const s of jsonLdScripts) {
    try {
      const parsed = JSON.parse(s.textContent || "");
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const it of items) {
        if ((it["@type"] === "LocalBusiness" || it["@type"] === "Organization") && typeof it.image === "string") {
          logoUrl = it.image.trim();
          break;
        }
      }
    } catch {}
    if (logoUrl) break;
  }

  if (!logoUrl) {
    const logoEl =
      pane.querySelector("[data-testid='company-logo'], [data-testid='company-logo-shadow'], [data-testid='jobsearch-CompanyAvatarImage']") ||
      doc.querySelector("[data-testid='company-logo'], [data-testid='company-logo-shadow'], [data-testid='jobsearch-CompanyAvatarImage']");
    if (logoEl) {
      const bgMatch = (logoEl.getAttribute("style") || "").match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
      if (bgMatch) {
        logoUrl = bgMatch[1].trim();
      } else {
        const innerDiv = logoEl.querySelector("div[style*='background-image']");
        const innerBg = innerDiv?.getAttribute("style")?.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
        if (innerBg) {
          logoUrl = innerBg[1].trim();
        } else {
          const innerImg = logoEl.querySelector("img") || (logoEl.tagName === "IMG" ? (logoEl as HTMLImageElement) : null);
          if (innerImg?.src) logoUrl = innerImg.src;
        }
      }
    }
  }

  if (!logoUrl) {
    logoUrl =
      queryFirstImageSrc(pane, [
        "img[src*='cloudfront.net/s/_squarelogo/']",
        "img[src*='images.indeed.com/']",
      ]) || (pane !== doc ? queryFirstImageSrc(doc, [
        "img[src*='cloudfront.net/s/_squarelogo/']",
        "img[src*='images.indeed.com/']",
      ]) : undefined);
  }

  // 7. Description
  const descEl =
    pane.querySelector(".simple-job-description-html") ||
    pane.querySelector("[class*='simple-job-description']") ||
    pane.querySelector("[data-testid='jobDetailDescription']") ||
    pane.querySelector("#jobDescriptionText") ||
    pane.querySelector("[data-testid='jobsearch-jobDescriptionText']") ||
    doc.querySelector(".simple-job-description-html") ||
    doc.querySelector("[class*='simple-job-description']") ||
    doc.querySelector("[data-testid='jobDetailDescription']") ||
    doc.querySelector("#jobDescriptionText");

  let description = "";
  if (descEl) {
    const rawContent = descEl.innerHTML || descEl.textContent || "";
    description = cleanDescription(rawContent);
  }

  if (!salary && description) {
    salary = extractSalaryFromText(description) || undefined;
  }

  // 7. Canonical / Job URL
  let finalUrl = currentUrl;
  const jkMatch = currentUrl.match(/[?&](?:vjk|jk)=([a-zA-Z0-9_-]+)/i);
  if (jkMatch) {
    finalUrl = `https://www.indeed.com/viewjob?jk=${jkMatch[1]}`;
  } else {
    const canonical = doc.querySelector("link[rel='canonical']")?.getAttribute("href");
    if (canonical && /indeed\.com/i.test(canonical)) {
      finalUrl = canonical.trim();
    }
  }

  return {
    title: title || "Job Opportunity",
    company: (isValidCompanyName(company) ? company : "") || "Company",
    location,
    salary,
    description,
    url: finalUrl,
    logoUrl,
    source: "Indeed",
    extractedAt: new Date().toISOString(),
  };
}

