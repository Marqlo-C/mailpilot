import { describe, it, expect } from "vitest";
import {
  getCompanyLogoUrl,
  inferApexDomainFromCompanyName,
  inferDomainFromUrl,
  logoInitials,
} from "@/lib/utils/company-logo";

describe("Company Logo & Monogram Generation", () => {
  describe("inferApexDomainFromCompanyName", () => {
    it("cleans corporate legal suffixes and converts company names to apex domains", () => {
      expect(inferApexDomainFromCompanyName("Walmart Global Tech")).toBe("walmart.com");
      expect(inferApexDomainFromCompanyName("IBM Corp")).toBe("ibm.com");
      expect(inferApexDomainFromCompanyName("Datadog, Inc.")).toBe("datadog.com");
      expect(inferApexDomainFromCompanyName("StudySmarter GmbH")).toBe("studysmarter.com");
      expect(inferApexDomainFromCompanyName("Acme Software Solutions LLC")).toBe("acme.com");
      expect(inferApexDomainFromCompanyName("Google LLC")).toBe("google.com");
      expect(inferApexDomainFromCompanyName("Apple")).toBe("apple.com");
    });

    it("returns null for empty or single-character names", () => {
      expect(inferApexDomainFromCompanyName("")).toBeNull();
      expect(inferApexDomainFromCompanyName(" ")).toBeNull();
      expect(inferApexDomainFromCompanyName("A")).toBeNull();
    });
  });

  describe("getCompanyLogoUrl", () => {
    it("uses explicit companyDomain when provided", () => {
      const url = getCompanyLogoUrl("Walmart", "walmart.com");
      expect(url).toBe("https://www.google.com/s2/favicons?domain=walmart.com&sz=128");
    });

    it("infers domain from company name when companyDomain is missing", () => {
      expect(getCompanyLogoUrl("Walmart Global Tech")).toBe("https://www.google.com/s2/favicons?domain=walmart.com&sz=128");
      expect(getCompanyLogoUrl("IBM Corp")).toBe("https://www.google.com/s2/favicons?domain=ibm.com&sz=128");
      expect(getCompanyLogoUrl("Datadog")).toBe("https://www.google.com/s2/favicons?domain=datadog.com&sz=128");
    });

    it("infers domain from direct applyUrl when available", () => {
      const url = getCompanyLogoUrl("Unknown Org", null, "https://careers.siemens.com/jobs/123");
      expect(url).toBe("https://www.google.com/s2/favicons?domain=careers.siemens.com&sz=128");
    });

    it("falls back to gradient avatar when no apex domain can be inferred", () => {
      expect(getCompanyLogoUrl("A")).toBe("https://avatar.vercel.sh/a");
    });

    it("returns null for unknown company placeholders", () => {
      expect(getCompanyLogoUrl("Unknown Company")).toBeNull();
      expect(getCompanyLogoUrl("Unknown")).toBeNull();
      expect(getCompanyLogoUrl("")).toBeNull();
    });
  });

  describe("inferDomainFromUrl", () => {
    it("extracts hostname from external direct URLs but ignores job boards", () => {
      expect(inferDomainFromUrl("https://careers.siemens.com/jobs/123")).toBe("careers.siemens.com");
      expect(inferDomainFromUrl("https://www.linkedin.com/jobs/view/123")).toBeNull();
      expect(inferDomainFromUrl("https://www.indeed.com/viewjob?jk=123")).toBeNull();
      expect(inferDomainFromUrl("https://www.glassdoor.com/job/123")).toBeNull();
    });
  });

  describe("logoInitials", () => {
    it("extracts 2-letter monogram for multi-word company names", () => {
      expect(logoInitials("Walmart Global")).toBe("WG");
      expect(logoInitials("Walmart Global Tech")).toBe("WG");
      expect(logoInitials("Johns Hopkins Medicine")).toBe("JH");
    });

    it("extracts 2 letters for single-word company names", () => {
      expect(logoInitials("IBM")).toBe("IB");
      expect(logoInitials("ADP")).toBe("AD");
      expect(logoInitials("Google")).toBe("GO");
    });

    it("returns empty string for unknown company placeholders", () => {
      expect(logoInitials("Unknown Company")).toBe("");
      expect(logoInitials("Unknown")).toBe("");
      expect(logoInitials("")).toBe("");
    });
  });
});
