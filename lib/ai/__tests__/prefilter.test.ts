import { describe, expect, it } from "vitest";
import {
  isPromotionalOrMarketingEmail,
  shouldClassifyEmail,
} from "../prefilter";

describe("Promotional & Marketing Email Pre-filter", () => {
  it("correctly identifies shopping, retail, and marketing emails as promotional", () => {
    const promoSubjects = [
      "50% off pizza this Friday!",
      "Limited time offer: Save $50 on all flights",
      "Cyber Monday sale: Up to 70% off hardware",
      "Flash sale: Buy now and get free shipping",
      "Exclusive deal: Pre-order the new laptop today",
      "Hardware sale: Save 20% on accessories",
      "Special offer: Promo code for 15% off",
      "Shop now for Black Friday discounts",
    ];

    for (const subject of promoSubjects) {
      expect(
        isPromotionalOrMarketingEmail(subject),
        `Expected "${subject}" to be flagged as promotional`
      ).toBe(true);
      expect(
        shouldClassifyEmail({ subject }),
        `Expected "${subject}" to be skipped by shouldClassifyEmail`
      ).toBe(false);
    }
  });

  it("identifies marketing emails when promotional markers are in the body with a shopping subject", () => {
    expect(
      isPromotionalOrMarketingEmail(
        "Weekly store rewards and savings",
        "Save up to 40% on your next order with promo code SAVE40. Buy now before clearance sale ends."
      )
    ).toBe(true);
    expect(
      shouldClassifyEmail({
        subject: "Weekly store rewards and savings",
        body: "Save up to 40% on your next order with promo code SAVE40. Buy now before clearance sale ends.",
      })
    ).toBe(false);
  });

  it("does not flag authentic job emails or recruiter outreach as promotional", () => {
    const jobSubjects = [
      "Founding Engineer at Warp",
      "Senior Frontend Developer - Acme Corp",
      "Interview Invitation: Product Designer",
      "Your application to Stripe has been received",
      "New job matches for 'Staff Software Engineer'",
      "Opportunity: Lead Architect at Horizon",
    ];

    for (const subject of jobSubjects) {
      expect(
        isPromotionalOrMarketingEmail(subject),
        `Expected "${subject}" to NOT be flagged as promotional`
      ).toBe(false);
    }
  });

  it("preserves application confirmation emails even when terms like 'offer' appear", () => {
    const confirmation = {
      subject: "Thank you for applying to Stripe",
      body: "We received your application for the Software Engineer role and will review your qualifications shortly.",
    };
    expect(shouldClassifyEmail(confirmation)).toBe(true);
  });

  it("filters out GitHub Action failures, product promos, and generic social notifications", () => {
    const nonJobSubjects = [
      "Run failed: CI & Deployment (abc1234)",
      "Build failed: main branch #412",
      "Workflow run completed with errors",
      "CI & Deployment: Failed step in production pipeline",
      "ASUS x ROG Gaming: Power up your setup",
      "Join the Fight with special deals",
      "Exclusive coupon codes for members",
      "7 people viewed your profile this week",
      "See who viewed your profile on LinkedIn",
      "Security notice: Unauthorized sign-in attempt",
    ];

    for (const subject of nonJobSubjects) {
      expect(
        isPromotionalOrMarketingEmail(subject),
        `Expected "${subject}" to be flagged as promotional / non-job`
      ).toBe(true);
      expect(
        shouldClassifyEmail({ subject }),
        `Expected shouldClassifyEmail to return false for "${subject}"`
      ).toBe(false);
    }
  });
});
