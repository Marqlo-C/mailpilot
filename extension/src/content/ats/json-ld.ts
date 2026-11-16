import type { ExtractedJobContext } from "../../lib/types";
import { cleanText, cleanDescription } from "./dom-helpers";
import { standardizeLocation } from "@/lib/utils/location";
import { normalizeSalaryDisplay } from "@/lib/ai/classifier";

/**
 * Extracts high-fidelity Schema.org JobPosting metadata from JSON-LD scripts.
 */
export function findJsonLdJobPosting(doc: Document | Element): Partial<ExtractedJobContext> | null {
  const root =
    doc && typeof (doc as Element).querySelectorAll === "function"
      ? doc
      : typeof document !== "undefined"
        ? document
        : null;
  if (!root) return null;
  const explicitScripts = Array.from(
    root.querySelectorAll('script[type="application/ld+json"]') || []
  );
  const scripts =
    explicitScripts.length > 0
      ? explicitScripts
      : Array.from(root.querySelectorAll("script") || []).filter((s) =>
          /application\/ld\+json/i.test(s.getAttribute?.("type") || "")
        );

  for (const script of scripts) {
    try {
      const raw = script.textContent?.trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        let jobObj: Record<string, unknown> | null = null;
        if (item["@type"] === "JobPosting") {
          jobObj = item;
        } else if (Array.isArray(item["@graph"])) {
          const match = item["@graph"].find(
            (g: Record<string, unknown>) =>
              g["@type"] === "JobPosting" ||
              (Array.isArray(g["@type"]) && g["@type"].includes("JobPosting"))
          );
          if (match) jobObj = match;
        }

        if (jobObj) {
          const title = typeof jobObj.title === "string" ? cleanText(jobObj.title) : "";
          let company = "";
          let logoUrl: string | undefined;

          if (typeof jobObj.hiringOrganization === "object" && jobObj.hiringOrganization !== null) {
            const org = jobObj.hiringOrganization as Record<string, unknown>;
            if (typeof org.name === "string") company = cleanText(org.name);

            const rawLogo = org.logo;
            if (typeof rawLogo === "string" && /^https?:\/\//i.test(rawLogo.trim())) {
              logoUrl = rawLogo.trim();
            } else if (
              typeof rawLogo === "object" &&
              rawLogo !== null &&
              typeof (rawLogo as Record<string, unknown>).url === "string"
            ) {
              const urlStr = (rawLogo as Record<string, unknown>).url as string;
              if (/^https?:\/\//i.test(urlStr.trim())) logoUrl = urlStr.trim();
            }
          } else if (typeof jobObj.hiringOrganization === "string") {
            company = cleanText(jobObj.hiringOrganization);
          }

          const rawDescription = typeof jobObj.description === "string" ? jobObj.description : "";
          const description = rawDescription ? cleanDescription(rawDescription) : "";

          let location: string | undefined;
          if (Array.isArray(jobObj.jobLocation)) {
            const locs = jobObj.jobLocation
              .map((locItem: Record<string, unknown>) => {
                const addr = locItem?.address as Record<string, unknown> | undefined;
                if (!addr) return null;
                const locStr = [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ");
                return standardizeLocation(locStr);
              })
              .filter(Boolean);
            if (locs.length > 0) location = locs.join(" / ");
          } else if (typeof jobObj.jobLocation === "object" && jobObj.jobLocation !== null) {
            const loc = jobObj.jobLocation as Record<string, unknown>;
            if (typeof loc.address === "object" && loc.address !== null) {
              const addr = loc.address as Record<string, unknown>;
              const locStr = [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ");
              location = standardizeLocation(locStr);
            }
          }

          let salary: string | undefined;
          const formatRate = (n: unknown) => {
            const num = Number(n);
            if (isNaN(num)) return String(n);
            const rounded = Math.round(num * 100) / 100;
            return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
          };
          const salObj = (jobObj.baseSalary || jobObj.estimatedSalary) as Record<string, unknown> | undefined;
          if (typeof salObj === "string" && salObj) {
            salary = normalizeSalaryDisplay(salObj) ?? cleanText(salObj);
          } else if (typeof salObj === "object" && salObj !== null) {
            const val = (salObj.value || salObj) as Record<string, unknown>;
            if (typeof val === "object" && val !== null) {
              const min = val.minValue ?? val.value;
              const max = val.maxValue;
              const unit = typeof val.unitText === "string" ? `/${val.unitText.toLowerCase()}` : "";
              if (min != null && max != null) {
                salary = normalizeSalaryDisplay(`$${formatRate(min)} - $${formatRate(max)}${unit}`) ?? `$${formatRate(min)} - $${formatRate(max)}${unit}`;
              } else if (min != null) {
                salary = normalizeSalaryDisplay(`$${formatRate(min)}${unit}`) ?? `$${formatRate(min)}${unit}`;
              }
            } else if (typeof val === "number" || typeof val === "string") {
              salary = normalizeSalaryDisplay(`$${formatRate(val)}`) ?? `$${formatRate(val)}`;
            }
          }

          let datePosted: string | undefined;
          if (typeof jobObj.datePosted === "string" && jobObj.datePosted.trim()) {
            datePosted = jobObj.datePosted.trim();
          }

          let applyUrl: string | undefined;
          if (typeof jobObj.url === "string" && /^https?:\/\//i.test(jobObj.url.trim())) {
            applyUrl = jobObj.url.trim();
          }

          if (title && (description || company)) {
            return {
              title,
              company,
              rawDescription,
              description,
              location,
              salary,
              datePosted,
              logoUrl,
              url: applyUrl,
              source: "JSON-LD",
            };
          }
        }
      }
    } catch {
      // Ignore JSON parse errors in malformed script tags
    }
  }
  return null;
}
