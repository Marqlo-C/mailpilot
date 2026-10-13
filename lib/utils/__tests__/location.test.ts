import { describe, it, expect } from "vitest";
import {
  extractLocationFromText,
  parseLocation,
  isLocationCompatible,
} from "../location";

describe("Location Domain & Text Extractor", () => {
  describe("extractLocationFromText", () => {
    it("extracts city and state from sentence text", () => {
      const text =
        "We are looking for a Senior Product Designer to join our team in Sacramento, CA. Great benefits included.";
      const res = extractLocationFromText(text);

      expect(res.city).toBe("Sacramento");
      expect(res.state).toBe("CA");
    });

    it("extracts full state name from free-form job posting", () => {
      const text =
        "Engineering lead role based in Austin, Texas. Competitive compensation and flexible hours.";
      const res = extractLocationFromText(text);

      expect(res.city).toBe("Austin");
      expect(res.state).toBe("TX");
    });

    it("ignores false positive capitalized words before commas", () => {
      const text =
        "Applications close Monday, July 15. Benefits, Salary, and 401k match provided.";
      const res = extractLocationFromText(text);

      expect(res.city).toBe("");
      expect(res.state).toBeNull();
    });

    it("detects remote flag in text", () => {
      const text =
        "This is a 100% remote opportunity open to candidates anywhere in the United States.";
      const res = extractLocationFromText(text);

      expect(res.isRemote).toBe(true);
    });
  });

  describe("parseLocation", () => {
    it("parses clean city, state strings", () => {
      const res = parseLocation("Sacramento, CA");
      expect(res.city).toBe("Sacramento");
      expect(res.state).toBe("CA");
      expect(res.isRemote).toBe(false);
    });

    it("delegates long free-form text to extractLocationFromText without sentence corruption", () => {
      const longText =
        "We are actively interviewing for an infrastructure engineer in Folsom, CA. Must have 5+ years experience.";
      const res = parseLocation(longText);

      expect(res.city).toBe("Folsom");
      expect(res.state).toBe("CA");
    });
  });

  describe("isLocationCompatible", () => {
    it("returns true for matching cities in the same state", () => {
      expect(isLocationCompatible("Sacramento, CA", "Sacramento, California")).toBe(true);
    });

    it("returns false for conflicting states", () => {
      expect(isLocationCompatible("Sacramento, CA", "Albany, NY")).toBe(false);
    });

    it("allows match when either location is remote", () => {
      expect(isLocationCompatible("Remote", "Sacramento, CA")).toBe(true);
    });
  });
});
