import { describe, it, expect } from "vitest";
import { normalizeSalaryDisplay, parseSalaryMax } from "../classifier";

describe("Salary Normalization & Sanitization", () => {
  describe("Annual Salary Ranges & Formats", () => {
    it("normalizes unformatted numbers and mixed currency ranges to min-to-max $XK-$YK", () => {
      expect(normalizeSalaryDisplay("150000-$160000")).toBe("$150K-$160K");
      expect(normalizeSalaryDisplay("150k-160k")).toBe("$150K-$160K");
      expect(normalizeSalaryDisplay("$150,000-160,000")).toBe("$150K-$160K");
      expect(normalizeSalaryDisplay("$150-$160k")).toBe("$150K-$160K");
      expect(normalizeSalaryDisplay("150k - 160")).toBe("$150K-$160K");
    });

    it("sanitizes stray slashes and corruptions like 150000-$/160000", () => {
      expect(normalizeSalaryDisplay("150000-$/160000")).toBe("$150K-$160K");
      expect(normalizeSalaryDisplay("150000-/$160000")).toBe("$150K-$160K");
    });

    it("cleans double-dipped dollar signs ($$)", () => {
      expect(normalizeSalaryDisplay("$$150k")).toBe("$150K");
      expect(normalizeSalaryDisplay("$$15-$20/hr")).toBe("$15-$20/Hr");
    });

    it("normalizes single salary values to $XK", () => {
      expect(normalizeSalaryDisplay("$130,000")).toBe("$130K");
      expect(normalizeSalaryDisplay("130000")).toBe("$130K");
      expect(normalizeSalaryDisplay("130k")).toBe("$130K");
      expect(normalizeSalaryDisplay("Up to $140,000")).toBe("$140K");
    });

    it("handles decimal thousands and reversed ranges properly", () => {
      expect(normalizeSalaryDisplay("$155,500 - $160,000")).toBe("$155.5K-$160K");
      expect(normalizeSalaryDisplay("$180k - $140k")).toBe("$140K-$180K");
      expect(normalizeSalaryDisplay("$150k - $150k")).toBe("$150K");
    });

    it("supports non-USD currencies cleanly", () => {
      expect(normalizeSalaryDisplay("€80,000 - €95,000")).toBe("€80K-€95K");
      expect(normalizeSalaryDisplay("£45k - £55k")).toBe("£45K-£55K");
    });
  });

  describe("Monthly & Weekly Pay Standardization to Annual", () => {
    it("converts monthly salaries to annualized ranges (* 12)", () => {
      expect(normalizeSalaryDisplay("$5,000 - $6,000 / month")).toBe("$60K-$72K");
      expect(normalizeSalaryDisplay("$5,000 per month")).toBe("$60K");
      expect(normalizeSalaryDisplay("$4k - $5k/mo")).toBe("$48K-$60K");
      expect(normalizeSalaryDisplay("$8000 a month")).toBe("$96K");
      expect(normalizeSalaryDisplay("4,500/month")).toBe("$54K");
    });

    it("converts weekly wages to annualized ranges (* 52)", () => {
      expect(normalizeSalaryDisplay("$1,500 - $2,000 per week")).toBe("$78K-$104K");
      expect(normalizeSalaryDisplay("$1,200/wk")).toBe("$62.4K");
      expect(normalizeSalaryDisplay("$2k/week")).toBe("$104K");
    });
  });

  describe("Hourly Wages & Rate Inference", () => {
    it("normalizes explicit hourly rates to $X-$Y/Hr or $X/Hr", () => {
      expect(normalizeSalaryDisplay("$15-$20 per hour")).toBe("$15-$20/Hr");
      expect(normalizeSalaryDisplay("15-$20/h")).toBe("$15-$20/Hr");
      expect(normalizeSalaryDisplay("From $38 an hour")).toBe("$38/Hr");
      expect(normalizeSalaryDisplay("$45/hr")).toBe("$45/Hr");
    });

    it("infers hourly rate when explicit keywords are omitted for low numbers (<= 350)", () => {
      expect(normalizeSalaryDisplay("$15-20")).toBe("$15-$20/Hr");
      expect(normalizeSalaryDisplay("15-20")).toBe("$15-$20/Hr");
      expect(normalizeSalaryDisplay("$25 - $35")).toBe("$25-$35/Hr");
      expect(normalizeSalaryDisplay("20 - 20")).toBe("$20/Hr");
    });

    it("distinguishes small hourly numbers from annual thousands", () => {
      // 150 with 160k -> annual
      expect(normalizeSalaryDisplay("$150-$160k")).toBe("$150K-$160K");
      // 15 with 20 -> hourly
      expect(normalizeSalaryDisplay("15-20")).toBe("$15-$20/Hr");
    });
  });

  describe("parseSalaryMax annualized sorting calculation", () => {
    it("annualizes hourly rates to 2080 hours", () => {
      expect(parseSalaryMax("$15-$20/Hr")).toBe(20 * 2080);
      expect(parseSalaryMax("$38/Hr")).toBe(38 * 2080);
    });

    it("annualizes monthly and weekly rates", () => {
      expect(parseSalaryMax("$5,000 - $6,000 / month")).toBe(72000);
      expect(parseSalaryMax("$1,500 - $2,000 per week")).toBe(104000);
    });

    it("parses annual salaries in K and full amounts", () => {
      expect(parseSalaryMax("$150K-$160K")).toBe(160000);
      expect(parseSalaryMax("$130K")).toBe(130000);
      expect(parseSalaryMax("$155.5K")).toBe(155500);
    });
  });
});
