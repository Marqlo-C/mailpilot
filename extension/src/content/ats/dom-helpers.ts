import { decodeHtmlEntities } from "@/lib/opportunities/context/html-markdown";
import { parseStructuredJobSections } from "@/lib/opportunities/context/section-classifier";
import { extractSalaryFromText } from "@/lib/ai/classifier";
import {
  extractLocationFromText,
  parseLocation,
  standardizeLocation,
} from "@/lib/utils/location";
import type { SiteSelectorMap } from "./site-selectors";

export function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return decodeHtmlEntities(
    text
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .trim()
  );
}

export function cleanDescription(rawHtmlOrText: string | null | undefined): string {
  if (!rawHtmlOrText) return "";
  const structured = parseStructuredJobSections(rawHtmlOrText);
  return structured.fullReconstructedMarkdown || rawHtmlOrText.trim();
}

/**
 * Finds the active modal, drawer, or split-pane root element.
 * Prioritizes open dialogs/modals over background page clutter.
 */
export function getActiveContentRoot(doc: Document): Element {
  const activeDialog = doc.querySelector(
    '[role="dialog"][data-state="open"], ' +
    'dialog[open], ' +
    '[role="dialog"]:not([aria-hidden="true"]), ' +
    '.modal.show, ' +
    '[data-slot="dialog-content"]'
  );
  if (activeDialog && activeDialog.textContent && activeDialog.textContent.trim().length > 100) {
    return activeDialog;
  }

  const activeSplitPane = doc.querySelector(
    '[data-sdui-screen*="JobDetails"], ' +
    '[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"], ' +
    '.new-job-preview-description, ' +
    '[data-testid="job-preview-description"], ' +
    '.jobs-search__job-details--container, ' +
    '.scaffold-layout__detail, ' +
    '[class*="jobs-search__job-details"], ' +
    '.jobs-details__main-content, ' +
    '.job-view-layout, ' +
    '[class*="jobs-search-two-pane__details"], ' +
    '#BigJobCardId, ' +
    '[data-test-id="svx-split-view-job-panel"], ' +
    '#jobsearch-ViewjobPaneWrapper, ' +
    '[data-testid="viewjob-job-content"], ' +
    '[data-testid="jobDetailDescription"], ' +
    '[data-testid="job-preview-card"], ' +
    '[class*="job-preview2024"], ' +
    '[data-testid="right-pane"], ' +
    '[data-testid*="right-pane"], ' +
    '[data-testid="job-details-pane"], ' +
    '[class*="TwoColumnLayout_columnRight"], ' +
    '[class*="TwoColumnLayout_jobDetailsContainer"], ' +
    '[class*="JobDetails_jobDetailsContainer"], ' +
    '[data-test="job-details-header"], ' +
    '.field-name-body, ' +
    '.job-description-html'
  );
  if (activeSplitPane && activeSplitPane.textContent && activeSplitPane.textContent.trim().length > 100) {
    return activeSplitPane;
  }

  return doc.body || doc.documentElement;
}

export function queryFirstText(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) {
        const text = cleanText(el.textContent);
        if (
          text &&
          !/\$|\/Hr|\/yr|\b(?:an?\s*hour|a\s*year|full-time|part-time|contract)\b/i.test(text)
        ) {
          return text;
        }
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return "";
}

export function queryLocationText(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const elements = root.querySelectorAll ? Array.from(root.querySelectorAll(sel)) : [];
      const list = elements.length > 0 ? elements : (root.querySelector ? [root.querySelector(sel)].filter(Boolean) : []);
      for (const el of list) {
        if (!el) continue;
        const text = cleanText(el.textContent || el.getAttribute?.("aria-label") || "");
        if (!text || text.length > 80) continue;
        if (text.includes("$") || /^(apply|sign in|full[- ]time|part[- ]time|contract|temporary|internship)$/i.test(text)) continue;

        const parsed = parseLocation(text);
        if (parsed.state !== null || parsed.isRemote || /\b(remote|hybrid|on-site|onsite)\b/i.test(text) || /,\s*[A-Z]{2}\b/.test(text)) {
          const std = standardizeLocation(text);
          if (std) return std;
        }
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return "";
}

export function queryDatePostedText(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const elements = root.querySelectorAll ? Array.from(root.querySelectorAll(sel)) : [];
      const list = elements.length > 0 ? elements : (root.querySelector ? [root.querySelector(sel)].filter(Boolean) : []);
      for (const el of list) {
        if (!el) continue;
        const text = cleanText(el.textContent || "");
        if (
          text &&
          /\b(?:reposted\s+)?(?:\d+\+?\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago|yesterday|today|just\s+now|just\s+posted)\b/i.test(
            text
          )
        ) {
          return text;
        }
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return "";
}

export function querySalaryText(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const elements = root.querySelectorAll ? Array.from(root.querySelectorAll(sel)) : [];
      const list = elements.length > 0 ? elements : (root.querySelector ? [root.querySelector(sel)].filter(Boolean) : []);
      for (const el of list) {
        if (!el) continue;
        const text = cleanText(el.textContent || "");
        if (
          text &&
          (text.includes("$") || text.includes("€") || text.includes("£") || /\bUSD\b/i.test(text)) &&
          (/\b\d/.test(text) || /\b(?:per hour|\/hr|\/wk|\/yr|salary|base pay)\b/i.test(text))
        ) {
          return text;
        }
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return "";
}

export function matchSite(site: SiteSelectorMap, url: string, doc: Document): boolean {
  if (site.match(url)) return true;

  if (site.source === "Workday") {
    return Boolean(
      doc.querySelector("[data-automation-id='jobPostingHeader']") ||
      doc.querySelector("[data-automation-id='jobPostingDescription']") ||
      doc.querySelector("div[id*='workday' i]") ||
      url.includes(".myworkdayjobs.com") ||
      url.includes(".wd1.myworkdayjobs.com") ||
      url.includes(".wd5.myworkdayjobs.com")
    );
  }

  if (site.source === "Greenhouse") {
    return Boolean(
      doc.querySelector("#grnhse_app") ||
      doc.querySelector("#app_body") ||
      doc.querySelector(".greenhouse-job-application") ||
      url.includes("greenhouse.io") ||
      url.includes("boards.greenhouse.io")
    );
  }

  if (site.source === "Lever") {
    return Boolean(
      doc.querySelector(".posting-headline") ||
      doc.querySelector(".lever-job-posting") ||
      url.includes("jobs.lever.co")
    );
  }

  if (site.source === "Ashby") {
    return Boolean(
      doc.querySelector("[class*='ashby']") ||
      doc.querySelector("div[id*='ashby']") ||
      url.includes("ashbyhq.com") ||
      url.includes("jobs.ashbyhq.com")
    );
  }

  return false;
}

export function extractImageSrc(el: Element): string | undefined {
  if (!el) return undefined;

  // Reject nav icons, user avatars, profile photos, and full-width banners
  if (
    typeof el.closest === "function" &&
    el.closest(".global-nav, .nav, header nav, [data-testid='global-nav'], [class*='profile-picture'], [class*='avatar']") &&
    !el.closest("[data-testid='jobsearch-CompanyAvatar-button'], [data-testid='company-logo'], .jobsearch-CompanyAvatar-image, .job-details-jobs-unified-top-card__company-logo")
  ) {
    return undefined;
  }

  const elClass = (el.className && typeof el.className === "string" ? el.className : "");
  const elTestId = el.getAttribute("data-testid") || "";
  const elAlt = el.getAttribute("alt") || "";
  const elAria = el.getAttribute("aria-label") || "";
  if (/banner/i.test(elClass + " " + elTestId)) {
    return undefined;
  }
  if (/profile|avatar|user photo|member photo|my photo|creator/i.test(elAlt + " " + elAria)) {
    return undefined;
  }

  // Check element or child style background-image (e.g. Indeed data-testid="company-logo")
  const styleCandidates: string[] = [
    el.getAttribute("style") || "",
    el.querySelector?.("[style*='background-image']")?.getAttribute("style") || "",
  ];
  for (const st of styleCandidates) {
    if (st.includes("background-image")) {
      const bgMatch = st.match(/background-image:\s*url\(([^)]+)\)/i);
      if (bgMatch) {
        const cleaned = bgMatch[1].replace(/['"]/g, "").trim();
        if (cleaned && !/profile-displayphoto|profile-framedphoto|ghost-person|company-banner|banner/i.test(cleaned)) {
          if (/^https?:\/\//i.test(cleaned) || (cleaned.startsWith("data:image/") && cleaned.length >= 200)) {
            return cleaned;
          }
        }
      }
    }
  }

  const rawCandidates: (string | null)[] = [
    el.getAttribute("src"),
    el.getAttribute("srcset")?.split(/\s*,\s*|\s+/)[0] || null,
    el.getAttribute("data-src"),
    el.getAttribute("data-delayed-url"),
    el.getAttribute("data-ghost-url"),
  ];

  for (const raw of rawCandidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.includes("svg+xml")) continue;
    if (trimmed.startsWith("data:") && trimmed.length < 200) continue;
    if (/profile-displayphoto|profile-framedphoto|ghost-person|company-banner|banner/i.test(trimmed)) continue;
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:image/")) {
      return trimmed;
    }
  }
  return undefined;
}

export function queryFirstImageSrc(root: Element | Document, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    try {
      const elements = root.querySelectorAll(sel);
      for (const el of Array.from(elements)) {
        const src = extractImageSrc(el);
        if (src) return src;
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return undefined;
}

export function queryFirstHref(root: Element | Document, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) {
        const href = el.getAttribute("href");
        if (
          href &&
          (/^https?:\/\//i.test(href.trim()) || href.trim().startsWith("/")) &&
          !/[?&]from=/i.test(href) &&
          !/\/(?:similar|recommended|search)\b/i.test(href)
        ) {
          return href.trim();
        }
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return undefined;
}

export function queryFirstDescription(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) {
        const rawContent = el.innerHTML || el.textContent;
        if (rawContent) {
          const desc = cleanDescription(rawContent);
          if (desc && desc.length > 30) return desc;
        }
      }
    } catch {
      // Continue on invalid selector
    }
  }
  return "";
}

export function extractMeta(doc: Document, property: string): string {
  const meta =
    doc.querySelector(`meta[property='${property}']`) ||
    doc.querySelector(`meta[name='${property}']`);
  return cleanText(meta?.getAttribute("content"));
}
