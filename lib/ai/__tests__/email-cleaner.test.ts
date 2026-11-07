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
});
