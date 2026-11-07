import { describe, expect, it } from "vitest";
import { cleanEmailPayload, segmentDigestBlocks } from "../email-cleaner";

describe("cleanEmailPayload", () => {
  it("strips tracking parameters from embedded anchor links", () => {
    const html = `
      <div>
        <h2>New Job Match</h2>
        <a href="https://www.linkedin.com/jobs/view/123456789/?utm_source=job_alert&utm_medium=email&trackingId=abc&trk=xyz">
          Senior Full Stack Engineer
        </a>
      </div>
    `;
    const cleaned = cleanEmailPayload(html);
    expect(cleaned).toContain("[Senior Full Stack Engineer](https://www.linkedin.com/jobs/view/123456789)");
    expect(cleaned).not.toContain("utm_source");
    expect(cleaned).not.toContain("trackingId");
  });

  it("unwraps tracking redirects and strips query bloat", () => {
    const html = `
      <p>
        Check out this opportunity:
        <a href="https://track.jobboard.com/click?dest=https%3A%2F%2Fboards.greenhouse.io%2Facme%2Fjobs%2F999%3Futm_campaign%3Ddaily">
          Apply on Greenhouse
        </a>
      </p>
    `;
    const cleaned = cleanEmailPayload(html);
    expect(cleaned).toContain("[Apply on Greenhouse](https://boards.greenhouse.io/acme/jobs/999)");
    expect(cleaned).not.toContain("track.jobboard.com");
    expect(cleaned).not.toContain("utm_campaign");
  });

  it("discards non-job navigational anchor links", () => {
    const html = `
      <div>
        <a href="https://jobs.example.com/unsubscribe?user=123">Unsubscribe</a>
        <a href="https://jobs.example.com/privacy-policy">Privacy Policy</a>
      </div>
    `;
    const cleaned = cleanEmailPayload(html);
    expect(cleaned).not.toContain("[Unsubscribe]");
    expect(cleaned).not.toContain("[Privacy Policy]");
    expect(cleaned).not.toContain("https://jobs.example.com/unsubscribe");
  });

  it("inserts card delimiters between distinct job cards and after action buttons", () => {
    const html = `
      <table>
        <tr>
          <td>
            <h3>Software Engineer</h3>
            <p>Stripe · San Francisco, CA</p>
            <a href="https://stripe.com/jobs/1">Apply now</a>
          </td>
        </tr>
      </table>
      <table>
        <tr>
          <td>
            <h3>Product Manager</h3>
            <p>Datadog · New York, NY</p>
            <a href="https://datadog.com/jobs/2">Quick Apply</a>
          </td>
        </tr>
      </table>
    `;
    const cleaned = cleanEmailPayload(html);
    expect(cleaned).toContain("---");
    const blocks = segmentDigestBlocks(cleaned);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0]).toContain("Software Engineer");
    expect(blocks[1]).toContain("Product Manager");
  });

  it("deterministically strips email footers, legal terms, and unsubscribe blocks", () => {
    const html = `
      <div>
        <h3>Backend Developer</h3>
        <p>Acme Corp · Remote</p>
        <a href="https://careers.acme.com/jobs/101">View job</a>
      </div>
      <div>
        <p>You have received this email because you are registered as a member of JobLeads.</p>
        <p>© 2026 Acme Corp. All rights reserved. Unsubscribe from this email.</p>
        <p>123 Fake Street, San Francisco, CA</p>
      </div>
    `;
    const cleaned = cleanEmailPayload(html);
    expect(cleaned).toContain("Backend Developer");
    expect(cleaned).toContain("Acme Corp");
    expect(cleaned).not.toContain("You have received this email");
    expect(cleaned).not.toContain("All rights reserved");
    expect(cleaned).not.toContain("123 Fake Street");
  });

  it("strips employer star ratings from company names", () => {
    const html = `
      <div>
        <h3>Staff Software Engineer</h3>
        <p>Northrop Grumman &nbsp; 3.8 ★</p>
        <a href="https://www.glassdoor.com/jobs/1">Apply</a>
      </div>
    `;
    const cleaned = cleanEmailPayload(html);
    expect(cleaned).toContain("Northrop Grumman");
    expect(cleaned).not.toContain("3.8");
    expect(cleaned).not.toContain("★");
  });
});
